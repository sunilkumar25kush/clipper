import path from "path";
import {
  VideoMetadata,
  AudioExtractionOptions,
  SegmentExtractionOptions,
  AspectRatioCropOptions,
  ThumbnailGenerationOptions,
  SubtitleBurnOptions,
} from "@clipforge/shared-types";
import { metadataExtractor } from "./metadata-extractor.js";
import { audioExtractor } from "./audio-extractor.js";
import { segmentExtractor } from "./segment-extractor.js";
import { videoCropper } from "./video-cropper.js";
import { thumbnailGenerator } from "./thumbnail-generator.js";
import { subtitleBurner, AssSubtitleDialogue } from "./subtitle-burner.js";
import { tempManager } from "../utils/temp-manager.js";

export interface CompleteClipPipelineOptions {
  segment: SegmentExtractionOptions;
  reframe?: AspectRatioCropOptions;
  thumbnail?: ThumbnailGenerationOptions & { outputPath: string };
  subtitles?: {
    dialogues: AssSubtitleDialogue[];
    options?: Parameters<typeof subtitleBurner.generateAssFile>[2];
  };
}

export interface CompleteClipPipelineResult {
  clipVideoPath: string;
  thumbnailPath?: string;
  metadata: VideoMetadata;
  totalDurationMs: number;
}

export class VideoProcessingEngine {
  readonly metadata = metadataExtractor;
  readonly audio = audioExtractor;
  readonly segment = segmentExtractor;
  readonly cropper = videoCropper;
  readonly thumbnail = thumbnailGenerator;
  readonly subtitle = subtitleBurner;
  readonly temp = tempManager;

  /**
   * Technical metadata inspection of any video file.
   */
  async getMetadata(filePath: string): Promise<VideoMetadata> {
    return this.metadata.extract(filePath);
  }

  /**
   * Extract 16kHz mono WAV audio optimized for Whisper and Pyannote.
   */
  async extractSpeechAudio(
    videoPath: string,
    outputWavPath: string,
  ): Promise<{ outputPath: string; durationMs: number }> {
    return this.audio.extractSpeechAudio(videoPath, outputWavPath);
  }

  /**
   * Extract audio in arbitrary format (WAV, AAC, MP3).
   */
  async extractAudio(
    videoPath: string,
    outputPath: string,
    options?: AudioExtractionOptions,
  ): Promise<{ outputPath: string; durationMs: number }> {
    return this.audio.extractAudio(videoPath, outputPath, options);
  }

  /**
   * Extract a precise sub-clip by start and end timestamps.
   */
  async extractSegment(
    inputVideoPath: string,
    outputVideoPath: string,
    options: SegmentExtractionOptions,
  ): Promise<{ outputPath: string; durationMs: number; segmentDuration: number }> {
    return this.segment.extractSegment(inputVideoPath, outputVideoPath, options);
  }

  /**
   * Reframe aspect ratio (9:16, 16:9, 1:1) with center crop or blur padding.
   */
  async reframeVideo(
    inputVideoPath: string,
    outputVideoPath: string,
    options: AspectRatioCropOptions,
  ): Promise<{ outputPath: string; durationMs: number }> {
    return this.cropper.reframeVideo(inputVideoPath, outputVideoPath, options);
  }

  /**
   * Extract a high-quality video thumbnail frame.
   */
  async generateThumbnail(
    inputVideoPath: string,
    outputImagePath: string,
    options?: ThumbnailGenerationOptions,
  ): Promise<{ outputPath: string; durationMs: number; timestampUsed: number }> {
    return this.thumbnail.generateThumbnail(inputVideoPath, outputImagePath, options);
  }

  /**
   * Burn-in subtitles (.ass or .srt) into a video.
   */
  async burnSubtitles(
    inputVideoPath: string,
    outputVideoPath: string,
    options: SubtitleBurnOptions,
  ): Promise<{ outputPath: string; durationMs: number }> {
    return this.subtitle.burnSubtitles(inputVideoPath, outputVideoPath, options);
  }

  /**
   * Execute complete clip rendering pipeline:
   * 1. Cut segment from source
   * 2. Reframe aspect ratio (if specified)
   * 3. Burn subtitles (if specified)
   * 4. Generate thumbnail
   */
  async renderCompleteClip(
    sourceVideoPath: string,
    finalClipOutputPath: string,
    options: CompleteClipPipelineOptions,
  ): Promise<CompleteClipPipelineResult> {
    const startTime = Date.now();

    return this.temp.withTempDir(async (scratchDir) => {
      // Step 1: Extract accurate segment
      const rawCutPath = path.join(scratchDir, "step1_cut.mp4");
      await this.segment.extractSegment(sourceVideoPath, rawCutPath, options.segment);

      let currentVideoPath = rawCutPath;

      // Step 2: Reframe aspect ratio if requested
      if (options.reframe) {
        const reframedPath = path.join(scratchDir, "step2_reframed.mp4");
        await this.cropper.reframeVideo(currentVideoPath, reframedPath, options.reframe);
        currentVideoPath = reframedPath;
      }

      // Step 3: Burn subtitles if provided
      if (options.subtitles && options.subtitles.dialogues.length > 0) {
        const assPath = path.join(scratchDir, "subtitles.ass");
        this.subtitle.generateAssFile(
          assPath,
          options.subtitles.dialogues,
          options.subtitles.options,
        );

        const subtitledPath = path.join(scratchDir, "step3_subtitled.mp4");
        await this.subtitle.burnSubtitles(currentVideoPath, subtitledPath, {
          subtitlePath: assPath,
        });
        currentVideoPath = subtitledPath;
      }

      // Move / copy final clip to requested destination
      const finalDir = path.dirname(finalClipOutputPath);
      const fs = await import("fs");
      if (!fs.existsSync(finalDir)) {
        fs.mkdirSync(finalDir, { recursive: true });
      }
      fs.copyFileSync(currentVideoPath, finalClipOutputPath);

      // Step 4: Generate thumbnail if requested
      let thumbResultPath: string | undefined;
      if (options.thumbnail?.outputPath) {
        await this.thumbnail.generateThumbnail(
          finalClipOutputPath,
          options.thumbnail.outputPath,
          options.thumbnail,
        );
        thumbResultPath = options.thumbnail.outputPath;
      }

      const finalMeta = await this.metadata.extract(finalClipOutputPath);

      return {
        clipVideoPath: finalClipOutputPath,
        thumbnailPath: thumbResultPath,
        metadata: finalMeta,
        totalDurationMs: Date.now() - startTime,
      };
    }, "complete_clip");
  }
}

export const videoProcessingEngine = new VideoProcessingEngine();

