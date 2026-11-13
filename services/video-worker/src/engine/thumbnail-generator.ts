import path from "path";
import fs from "fs";
import { ThumbnailGenerationOptions } from "@clipforge/shared-types";
import { workerConfig } from "../config/env.js";
import { executeProcess, validateInputFile } from "./ffmpeg-process.js";
import { metadataExtractor } from "./metadata-extractor.js";
import { secondsToFfmpegTimestamp } from "../utils/time-formatter.js";

export class ThumbnailGenerator {
  private ffmpegPath: string;

  constructor(ffmpegPath = workerConfig.ffmpegPath) {
    this.ffmpegPath = ffmpegPath;
  }

  /**
   * Generates a high-quality video thumbnail image at a given timestamp or percentage.
   */
  async generateThumbnail(
    inputVideoPath: string,
    outputImagePath: string,
    options: ThumbnailGenerationOptions = {},
  ): Promise<{ outputPath: string; durationMs: number; timestampUsed: number }> {
    validateInputFile(inputVideoPath);

    const metadata = await metadataExtractor.extract(inputVideoPath);
    const videoDuration = metadata.durationSeconds;

    // Determine timestamp
    let targetSeconds = 0;
    if (typeof options.timestampSeconds === "number") {
      targetSeconds = Math.max(0, Math.min(options.timestampSeconds, videoDuration));
    } else if (typeof options.timestampPercent === "number") {
      const pct = Math.max(0, Math.min(options.timestampPercent, 100));
      targetSeconds = (videoDuration * pct) / 100;
    } else {
      // Default: 1.5 seconds in or 10% of video
      targetSeconds = videoDuration > 3 ? 1.5 : videoDuration * 0.2;
    }

    const outputDir = path.dirname(outputImagePath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestampStr = secondsToFfmpegTimestamp(targetSeconds);

    const args: string[] = [
      "-y",
      "-ss",
      timestampStr,
      "-i",
      inputVideoPath,
      "-vframes",
      "1",
    ];

    // Optional scale
    if (options.width && options.height) {
      args.push("-vf", `scale=${options.width}:${options.height}`);
    } else if (options.width) {
      args.push("-vf", `scale=${options.width}:-1`);
    }

    // Quality setting
    const quality = options.quality ?? 2;
    args.push("-q:v", quality.toString(), outputImagePath);

    const result = await executeProcess(this.ffmpegPath, args);

    if (!fs.existsSync(outputImagePath) || fs.statSync(outputImagePath).size === 0) {
      throw new Error(`Thumbnail generation failed: Output file missing or empty (${outputImagePath})`);
    }

    return {
      outputPath: outputImagePath,
      durationMs: result.durationMs,
      timestampUsed: targetSeconds,
    };
  }
}

export const thumbnailGenerator = new ThumbnailGenerator();

