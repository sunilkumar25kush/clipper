import path from "path";
import fs from "fs";
import { SegmentExtractionOptions } from "@clipforge/shared-types";
import { workerConfig } from "../config/env.js";
import { executeProcess, validateInputFile } from "./ffmpeg-process.js";
import { metadataExtractor } from "./metadata-extractor.js";
import { secondsToFfmpegTimestamp, validateTimeRange } from "../utils/time-formatter.js";

export class SegmentExtractor {
  private ffmpegPath: string;

  constructor(ffmpegPath = workerConfig.ffmpegPath) {
    this.ffmpegPath = ffmpegPath;
  }

  /**
   * Extract a precise segment from a video with validation and fast/accurate modes.
   */
  async extractSegment(
    inputVideoPath: string,
    outputVideoPath: string,
    options: SegmentExtractionOptions,
  ): Promise<{ outputPath: string; durationMs: number; segmentDuration: number }> {
    validateInputFile(inputVideoPath);

    const metadata = await metadataExtractor.extract(inputVideoPath);
    validateTimeRange(options.startTimeSeconds, options.endTimeSeconds, metadata.durationSeconds);

    const outputDir = path.dirname(outputVideoPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const startTs = secondsToFfmpegTimestamp(options.startTimeSeconds);
    const segmentDuration = options.endTimeSeconds - options.startTimeSeconds;

    const accurate = options.accurate !== false; // default true for frame accuracy
    const crf = options.crf ?? workerConfig.defaultCrf;
    const preset = options.preset ?? workerConfig.defaultPreset;

    const args: string[] = ["-y"];

    if (accurate) {
      // Input seeking for fast decode + accurate boundary encoding
      args.push(
        "-ss",
        startTs,
        "-t",
        segmentDuration.toFixed(3),
        "-i",
        inputVideoPath,
        "-c:v",
        options.videoCodec || "libx264",
        "-preset",
        preset,
        "-crf",
        crf.toString(),
        "-pix_fmt",
        "yuv420p",
      );

      if (metadata.hasAudio) {
        args.push("-c:a", options.audioCodec || "aac", "-b:a", `${workerConfig.defaultAudioBitrateKbps}k`);
      } else {
        args.push("-an");
      }

      // Optimize for web playback (moov atom at front)
      args.push("-movflags", "+faststart");
    } else {
      // Fast stream copy (zero re-encoding, snaps to nearest keyframe)
      args.push("-ss", startTs, "-t", segmentDuration.toFixed(3), "-i", inputVideoPath, "-c", "copy");
    }

    args.push("-threads", workerConfig.maxThreads.toString(), outputVideoPath);

    const result = await executeProcess(this.ffmpegPath, args);

    if (!fs.existsSync(outputVideoPath) || fs.statSync(outputVideoPath).size === 0) {
      throw new Error(`Segment extraction failed: Output file empty or missing (${outputVideoPath})`);
    }

    return {
      outputPath: outputVideoPath,
      durationMs: result.durationMs,
      segmentDuration: Math.round(segmentDuration * 1000) / 1000,
    };
  }
}

export const segmentExtractor = new SegmentExtractor();

