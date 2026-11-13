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
import { videoCropper } from "./video-cropper.js";
import {
  subtitleBurner,
  AssWordToken,
  SubtitlePreset,
  CaptionPosition,
} from "./subtitle-burner.js";
import { thumbnailGenerator } from "./thumbnail-generator.js";
import { metadataExtractor } from "./metadata-extractor.js";
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
function mapClipCategory(cat: string): "HOOK" | "FUNNY" | "EDUCATIONAL" | "EMOTIONAL" | "STORYTELLING" | "MOTIVATIONAL" | "DISCUSSION" | "INSIGHT" {
  const norm = cat.toUpperCase().trim().replace(/ /g, "_");
  const valid = ["HOOK", "FUNNY", "EDUCATIONAL", "EMOTIONAL", "STORYTELLING", "MOTIVATIONAL", "DISCUSSION", "INSIGHT"];
  if (valid.includes(norm)) {
    return norm as "HOOK" | "FUNNY" | "EDUCATIONAL" | "EMOTIONAL" | "STORYTELLING" | "MOTIVATIONAL" | "DISCUSSION" | "INSIGHT";
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

    // Simple bounded concurrency runner
    const queue = [...candidates.map((cand, idx) => ({ cand, rankOrder: idx + 1 }))];

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        const { cand, rankOrder } = item;
        const result = await this.renderSingleClip({
          jobId,
          projectId,
          rankOrder,
          candidate: cand,
          sourceVideoPath,
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

    // Filter and offset words to be relative to the clip start
    const relativeWords: AssWordToken[] = transcriptWords
      .filter((w) => w.startSeconds >= candidate.start - 0.2 && w.endSeconds <= candidate.end + 0.2)
      .map((w) => ({
        word: w.word,
        startSeconds: Math.max(0, w.startSeconds - candidate.start),
        endSeconds: Math.max(0.05, Math.min(clipDuration, w.endSeconds - candidate.start)),
        probability: w.probability,
      }));

    return tempManager.withTempDir(async (scratchDir) => {
      // 1. Cut segment from source
      const cutVideoPath = path.join(scratchDir, "cut_raw.mp4");
      await segmentExtractor.extractSegment(sourceVideoPath, cutVideoPath, {
        startTimeSeconds: candidate.start,
        endTimeSeconds: candidate.end,
        accurate: true, // re-encode to guarantee exact keyframe cut
      });

      // 2. Reframe aspect ratio (9:16, 16:9, 1:1) with speaker-aware or center crop
      const reframedVideoPath = path.join(scratchDir, "reframed.mp4");
      await videoCropper.reframeVideo(cutVideoPath, reframedVideoPath, {
        targetAspect,
        mode: cropMode,
        focusXNormalized: candidate.focusXNormalized ?? 0.5,
      });

      // 3. Generate dynamic word-level highlighted ASS subtitle file
      let finalRenderedVideoPath = reframedVideoPath;
      const captionsJson: object = { words: relativeWords };

      if (relativeWords.length > 0) {
        const assPath = path.join(scratchDir, "subtitles.ass");
        subtitleBurner.generateWordHighlightAssFile(assPath, relativeWords, {
          fontFamily: params.fontFamily || "Arial",
          fontSize: params.fontSize || (targetAspect === AspectRatio.RATIO_9_16 ? 26 : 22),
          stylePreset: subtitlePreset,
          position: captionPosition,
          wordsPerLine: 3,
        });

        // 4. Burn subtitles into video
        const subtitledVideoPath = path.join(scratchDir, "subtitled.mp4");
        await subtitleBurner.burnSubtitles(reframedVideoPath, subtitledVideoPath, {
          subtitlePath: assPath,
        });
        finalRenderedVideoPath = subtitledVideoPath;
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
      const prismaCategory = mapClipCategory(candidate.category);

      await prisma.$transaction(async (tx) => {
        // Create Clip
        await tx.clip.create({
          data: {
            id: clipId,
            projectId,
            rankOrder,
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
          },
        });

        // Create ClipScore
        await tx.clipScore.create({
          data: {
            clipId,
            hookScore: candidate.scores.hook,
            engagementScore: candidate.scores.engagement,
            contextScore: candidate.scores.context,
            overallScore: candidate.scores.overall,
            confidence: 0.90,
          },
        });

        // Create ClipCaption
        await tx.clipCaption.create({
          data: {
            clipId,
            presetId: subtitlePreset.toString().toLowerCase(),
            fontFamily: params.fontFamily || "Arial",
            fontSize: params.fontSize || 26,
            primaryColorHex: "#FFFFFF",
            highlightColorHex: "#FACC15",
            strokeColorHex: "#000000",
            wordsPerLine: 3,
            captionsJson,
          },
        });

        // Create Export
        await tx.export.create({
          data: {
            id: exportId,
            clipId,
            storageBucket: videoUpload.storageBucket,
            storageKey: videoUpload.storageKey,
            resolution: getExportResolution(targetAspect),
            aspectRatio: targetAspect,
            hasWatermark: false,
            fileSizeBytes: videoUpload.fileSizeBytes,
            status: "READY",
          },
        });
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
