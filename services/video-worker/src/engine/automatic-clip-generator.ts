import path from "path";
import fs from "fs";
import crypto from "crypto";
import {
  AspectRatio,
  CropMode,
  ExportResolution,
  VideoMetadata,
} from "@clipforge/shared-types";
import { prisma } from "@clipforge/database";
import { workerConfig } from "../config/env.js";
import { segmentExtractor } from "./segment-extractor.js";
import { videoCropper, getTargetDimensions } from "./video-cropper.js";
import {
  subtitleBurner,
  AssWordToken,
  SubtitlePreset,
  CaptionPosition,
} from "./subtitle-burner.js";
import { thumbnailGenerator } from "./thumbnail-generator.js";
import { metadataExtractor } from "./metadata-extractor.js";
import { executeProcess } from "./ffmpeg-process.js";
import { secondsToFfmpegTimestamp } from "../utils/time-formatter.js";
import { tempManager } from "../utils/temp-manager.js";
import { storageUploader } from "../utils/storage-uploader.js";

export interface ClipCandidateInput {
  start: number;
  end: number;
  title: string;
  category: string;
  reason: string;
  scores: {
    hook: number;
    engagement: number;
    context: number;
    overall: number;
  };
  focusXNormalized?: number;
  partNumber?: number;
}

export interface GenerateClipsJobOptions {
  jobId: string;
  projectId: string;
  sourceVideoPath: string;
  candidates: ClipCandidateInput[];
  transcriptWords?: AssWordToken[];
  targetAspect?: AspectRatio;
  cropMode?: CropMode;
  subtitlePreset?: SubtitlePreset | "CLEAN" | "VIRAL_HIGHLIGHT" | "BOXED";
  captionPosition?: CaptionPosition | "BOTTOM" | "CENTER" | "TOP";
  fontSize?: number;
  fontFamily?: string;
  concurrency?: number;
  onClipRendered?: (completedIndex: number, totalClips: number) => Promise<void>;
}

export interface GeneratedClipResult {
  clipId: string;
  exportId: string;
  title: string;
  duration: number;
  videoStorageKey: string;
  thumbnailStorageKey: string;
  metadata: VideoMetadata;
}

// Map string category to Prisma ClipCategory enum
function mapClipCategory(cat: string): "HOOK" | "FUNNY" | "EDUCATIONAL" | "EMOTIONAL" | "STORYTELLING" | "MOTIVATIONAL" | "DISCUSSION" | "INSIGHT" | "PART" {
  const norm = cat.toUpperCase().trim().replace(/ /g, "_");
  const valid = ["HOOK", "FUNNY", "EDUCATIONAL", "EMOTIONAL", "STORYTELLING", "MOTIVATIONAL", "DISCUSSION", "INSIGHT", "PART"];
  if (valid.includes(norm)) {
    return norm as any;
  }
  return "INSIGHT";
}

// Map AspectRatio to resolution
function getExportResolution(aspect: AspectRatio): ExportResolution {
  switch (aspect) {
    case AspectRatio.RATIO_9_16:
    case AspectRatio.RATIO_1_1:
    case AspectRatio.RATIO_16_9:
    default:
      return ExportResolution.RES_1080P;
  }
}

export class AutomaticClipGenerator {
  /**
   * Orchestrates multi-clip generation from source video with subtitle burn-in,
   * smart aspect reframing, thumbnail extraction, validation, and storage commit.
   */
  async generateClips(options: GenerateClipsJobOptions): Promise<GeneratedClipResult[]> {
    const {
      jobId,
      projectId,
      sourceVideoPath,
      candidates,
      transcriptWords = [],
      targetAspect = AspectRatio.RATIO_9_16,
      cropMode = CropMode.CENTER_CROP,
      subtitlePreset = SubtitlePreset.VIRAL_HIGHLIGHT,
      captionPosition = CaptionPosition.BOTTOM,
      concurrency = workerConfig.maxConcurrentRenders,
      onClipRendered,
    } = options;

    if (!fs.existsSync(sourceVideoPath)) {
      throw new Error(`Source video not found: ${sourceVideoPath}`);
    }

    if (!candidates || candidates.length === 0) {
      return [];
    }

    const results: GeneratedClipResult[] = [];
    const totalClips = candidates.length;
    let completedCount = 0;

    // Extract source metadata once for all candidate clips to eliminate repeated ffprobe overhead
    const sourceMeta = await metadataExtractor.extract(sourceVideoPath);

    // Query already rendered clips for this project to enable intelligent resumption on retry/failure
    const existingClips = await prisma.clip.findMany({
      where: {
        projectId,
        status: "READY",
        isDeleted: false,
      },
      include: {
        exports: { where: { status: "READY" } },
      },
    });

    // Simple bounded concurrency runner
    const queue = [...candidates.map((cand, idx) => ({ cand, rankOrder: idx + 1 }))];

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        const { cand, rankOrder } = item;

        // Check if an identical clip has already been rendered in a previous run
        const existing = existingClips.find(
          (ec) =>
            Math.abs(ec.startTime - cand.start) < 0.35 &&
            Math.abs(ec.endTime - cand.end) < 0.35 &&
            ec.exports.length > 0
        );

        if (existing && existing.exports[0]) {
          console.log(`[AutomaticClipGenerator] Clip #${rankOrder} ("${cand.title}") was already rendered, reusing existing asset!`);
          results.push({
            clipId: existing.id,
            exportId: existing.exports[0].id,
            title: existing.title,
            duration: existing.duration,
            videoStorageKey: existing.exports[0].storageKey,
            thumbnailStorageKey: existing.thumbnailKey || "",
            metadata: {
              durationSeconds: existing.duration,
              width: 1080,
              height: 1920,
              fps: 30,
              videoCodec: "h264",
              audioCodec: "aac",
              hasAudio: true,
              fileSizeBytes: Number(existing.exports[0].fileSizeBytes || 0),
            } as unknown as VideoMetadata,
          });
          completedCount++;
          if (onClipRendered) {
            await onClipRendered(completedCount, totalClips);
          }
          continue;
        }

        const result = await this.renderSingleClip({
          jobId,
          projectId,
          rankOrder,
          candidate: cand,
          sourceVideoPath,
          sourceMeta,
          transcriptWords,
          targetAspect,
          cropMode,
          subtitlePreset,
          captionPosition,
          fontSize: options.fontSize,
          fontFamily: options.fontFamily,
        });

        results.push(result);
        completedCount++;

        if (onClipRendered) {
          await onClipRendered(completedCount, totalClips);
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, candidates.length) },
      () => worker(),
    );

    await Promise.all(workers);

    // Sort results by rankOrder
    return results.sort((a, b) => a.clipId.localeCompare(b.clipId));
  }

  /**
   * Renders, verifies, uploads, and commits an individual candidate clip.
   */
  async renderSingleClip(params: {
    jobId: string;
    projectId: string;
    rankOrder: number;
    candidate: ClipCandidateInput;
    sourceVideoPath: string;
    sourceMeta?: VideoMetadata;
    transcriptWords: AssWordToken[];
    targetAspect: AspectRatio;
    cropMode: CropMode;
    subtitlePreset: SubtitlePreset | "CLEAN" | "VIRAL_HIGHLIGHT" | "BOXED";
    captionPosition: CaptionPosition | "BOTTOM" | "CENTER" | "TOP";
    fontSize?: number;
    fontFamily?: string;
  }): Promise<GeneratedClipResult> {
    const {
      projectId,
      rankOrder,
      candidate,
      sourceVideoPath,
      transcriptWords,
      targetAspect,
      cropMode,
      subtitlePreset,
      captionPosition,
    } = params;

    const clipDuration = Math.max(0.5, candidate.end - candidate.start);
    const sourceMeta = params.sourceMeta || (await metadataExtractor.extract(sourceVideoPath));

    // Filter and offset words to be relative to the clip start
    const relativeWords: AssWordToken[] = transcriptWords
      .filter((w) => w.startSeconds >= candidate.start - 0.2 && w.endSeconds <= candidate.end + 0.2)
      .map((w) => ({
        word: w.word,
        startSeconds: Math.max(0, w.startSeconds - candidate.start),
        endSeconds: Math.max(0.05, Math.min(clipDuration, w.endSeconds - candidate.start)),
        probability: w.probability,
      }));

    const captionsJson: object = { words: relativeWords };

    return tempManager.withTempDir(async (scratchDir) => {
      let finalRenderedVideoPath = path.join(scratchDir, "rendered_fast.mp4");
      let renderSucceeded = false;

      // 1. Prepare ASS subtitle file if words exist
      let assPath: string | null = null;
      if (relativeWords.length > 0) {
        assPath = path.join(scratchDir, "subtitles.ass");
        subtitleBurner.generateWordHighlightAssFile(assPath, relativeWords, {
          fontFamily: params.fontFamily || "Arial",
          fontSize: params.fontSize || (targetAspect === AspectRatio.RATIO_9_16 ? 26 : 22),
          stylePreset: subtitlePreset,
          position: captionPosition,
          wordsPerLine: 3,
        });
      }

      // 2. ULTRAFAST SINGLE-PASS DIRECT RENDER
      // Cuts, reframes (9:16/16:9/1:1), burns word subtitles, and encodes in ONE step!
      try {
        const targetDim = getTargetDimensions(targetAspect);
        const { width: outW, height: outH } = targetDim;
        const inW = sourceMeta.width;
        const inH = sourceMeta.height;

        let videoFilter = "";
        let isComplexFilter = false;

        const normalizedSubPath = assPath && fs.existsSync(assPath)
          ? path.resolve(assPath).replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:")
          : null;

        if (cropMode === CropMode.BLUR_PAD) {
          isComplexFilter = true;
          let filterGraph = `[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},boxblur=10:2[bg];[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`;
          if (normalizedSubPath) {
            filterGraph += `[v];[v]ass='${normalizedSubPath}'`;
          }
          videoFilter = filterGraph;
        } else {
          // Center crop or speaker-aware focus crop
          const targetRatio = outW / outH;
          const inputRatio = inW / inH;

          let cropW = inW;
          let cropH = inH;

          if (inputRatio > targetRatio) {
            cropW = Math.round(inH * targetRatio);
            if (cropW % 2 !== 0) cropW -= 1;
          } else {
            cropH = Math.round(inW / targetRatio);
            if (cropH % 2 !== 0) cropH -= 1;
          }

          let cropX = Math.round((inW - cropW) / 2);
          if (typeof candidate.focusXNormalized === "number" && !isNaN(candidate.focusXNormalized)) {
            const desiredCenterX = inW * Math.max(0.0, Math.min(1.0, candidate.focusXNormalized));
            cropX = Math.round(desiredCenterX - cropW / 2);
            cropX = Math.max(0, Math.min(inW - cropW, cropX));
            if (cropX % 2 !== 0) cropX -= 1;
            cropX = Math.max(0, cropX);
          }
          const cropY = Math.round((inH - cropH) / 2);

          videoFilter = `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${outW}:${outH}`;
          if (normalizedSubPath) {
            videoFilter += `,ass='${normalizedSubPath}'`;
          }
        }

        const startTs = secondsToFfmpegTimestamp(candidate.start);
        const durationSeconds = Math.max(0.5, candidate.end - candidate.start);

        const args = [
          "-y",
          "-ss", startTs,
          "-t", durationSeconds.toFixed(3),
          "-i", sourceVideoPath,
        ];

        if (isComplexFilter) {
          args.push("-filter_complex", videoFilter);
        } else {
          args.push("-vf", videoFilter);
        }

        // Hardware-accelerated encoding check: on Windows, h264_mf (Media Foundation GPU MFT) delivers 10x-15x real-time speed
        const useHardwareEncoder = process.platform === "win32" && process.env.FFMPEG_HW_ACCEL !== "false";
        if (useHardwareEncoder) {
          args.push("-c:v", "h264_mf", "-b:v", "3500k");
        } else {
          args.push(
            "-c:v", "libx264",
            "-preset", workerConfig.defaultPreset,
            "-crf", workerConfig.defaultCrf.toString(),
            "-pix_fmt", "yuv420p"
          );
        }

        if (sourceMeta.hasAudio) {
          args.push("-c:a", "aac", "-b:a", `${workerConfig.defaultAudioBitrateKbps}k`);
        } else {
          args.push("-an");
        }

        args.push(
          "-movflags", "+faststart",
          "-threads", workerConfig.maxThreads.toString(),
          finalRenderedVideoPath
        );

        await executeProcess(workerConfig.ffmpegPath, args);

        if (fs.existsSync(finalRenderedVideoPath) && fs.statSync(finalRenderedVideoPath).size > 0) {
          renderSucceeded = true;
        }
      } catch (fastRenderErr) {
        console.warn("[AutomaticClipGenerator] Direct single-pass render failed, falling back to multi-step:", fastRenderErr);
      }

      // 3. Fallback to multi-step if single-pass wasn't successful
      if (!renderSucceeded) {
        const cutVideoPath = path.join(scratchDir, "cut_raw.mp4");
        await segmentExtractor.extractSegment(sourceVideoPath, cutVideoPath, {
          startTimeSeconds: candidate.start,
          endTimeSeconds: candidate.end,
          accurate: true,
          preset: workerConfig.defaultPreset,
          crf: workerConfig.defaultCrf,
        });

        const reframedVideoPath = path.join(scratchDir, "reframed.mp4");
        await videoCropper.reframeVideo(cutVideoPath, reframedVideoPath, {
          targetAspect,
          mode: cropMode,
          focusXNormalized: candidate.focusXNormalized ?? 0.5,
          preset: workerConfig.defaultPreset,
          crf: workerConfig.defaultCrf,
        });

        finalRenderedVideoPath = reframedVideoPath;

        if (assPath && fs.existsSync(assPath)) {
          const subtitledVideoPath = path.join(scratchDir, "subtitled.mp4");
          await subtitleBurner.burnSubtitles(reframedVideoPath, subtitledVideoPath, {
            subtitlePath: assPath,
          });
          finalRenderedVideoPath = subtitledVideoPath;
        }
      }

      // 5. Generate high-quality thumbnail frame
      const thumbPath = path.join(scratchDir, "thumb.jpg");
      await thumbnailGenerator.generateThumbnail(finalRenderedVideoPath, thumbPath, {
        timestampSeconds: Math.min(2.0, clipDuration / 2),
      });

      // 6. VALIDATION STEP: Verify output file exists, is non-empty, and probeable
      if (!fs.existsSync(finalRenderedVideoPath) || fs.statSync(finalRenderedVideoPath).size === 0) {
        throw new Error(`Rendered clip failed validation: file missing or empty (${finalRenderedVideoPath})`);
      }

      const finalMeta = await metadataExtractor.extract(finalRenderedVideoPath);
      if (finalMeta.durationSeconds <= 0) {
        throw new Error(`Rendered clip has invalid duration: ${finalMeta.durationSeconds}s`);
      }

      // 7. Generate clip UUID & Upload assets
      const clipId = crypto.randomUUID();
      const exportId = crypto.randomUUID();

      const videoStorageKey = `projects/${projectId}/clips/${clipId}/${clipId}_1080p.mp4`;
      const thumbStorageKey = `projects/${projectId}/clips/${clipId}/thumb_${clipId}.jpg`;

      const videoUpload = await storageUploader.uploadFile(
        finalRenderedVideoPath,
        videoStorageKey,
        "video/mp4",
      );

      let thumbUpload = { storageKey: thumbStorageKey };
      if (fs.existsSync(thumbPath)) {
        thumbUpload = await storageUploader.uploadFile(
          thumbPath,
          thumbStorageKey,
          "image/jpeg",
        );
      }

      // 8. Persist Clip, ClipScore, ClipCaption, and Export in PostgreSQL
      // Use single atomic nested create - completely eliminates interactive transaction timeouts!
      const prismaCategory = mapClipCategory(candidate.category);

      await prisma.clip.create({
        data: {
          id: clipId,
          projectId,
          rankOrder,
          partNumber: candidate.partNumber ?? null,
          title: candidate.title.slice(0, 255),
          description: candidate.reason.slice(0, 500),
          category: prismaCategory,
          selectionReason: candidate.reason,
          startTime: candidate.start,
          endTime: candidate.end,
          duration: finalMeta.durationSeconds,
          aspectRatio: targetAspect,
          cropMode,
          thumbnailKey: thumbUpload.storageKey,
          status: "READY",
          score: {
            create: {
              hookScore: candidate.scores.hook,
              engagementScore: candidate.scores.engagement,
              contextScore: candidate.scores.context,
              overallScore: candidate.scores.overall,
              confidence: 0.90,
            },
          },
          caption: {
            create: {
              presetId: subtitlePreset.toString().toLowerCase(),
              fontFamily: params.fontFamily || "Arial",
              fontSize: params.fontSize || 26,
              primaryColorHex: "#FFFFFF",
              highlightColorHex: "#FACC15",
              strokeColorHex: "#000000",
              wordsPerLine: 3,
              captionsJson,
            },
          },
          exports: {
            create: {
              id: exportId,
              storageBucket: videoUpload.storageBucket,
              storageKey: videoUpload.storageKey,
              resolution: getExportResolution(targetAspect),
              aspectRatio: targetAspect,
              hasWatermark: false,
              fileSizeBytes: videoUpload.fileSizeBytes,
              status: "READY",
            },
          },
        },
      });

      return {
        clipId,
        exportId,
        title: candidate.title,
        duration: finalMeta.durationSeconds,
        videoStorageKey: videoUpload.storageKey,
        thumbnailStorageKey: thumbUpload.storageKey,
        metadata: finalMeta,
      };
    }, `clip_${params.rankOrder}`);
  }
}

export const automaticClipGenerator = new AutomaticClipGenerator();
