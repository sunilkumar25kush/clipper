import path from "path";
import fs from "fs";
import { AudioExtractionOptions } from "@clipforge/shared-types";
import { workerConfig } from "../config/env.js";
import { executeProcess, validateInputFile } from "./ffmpeg-process.js";
import { metadataExtractor } from "./metadata-extractor.js";

export class AudioExtractor {
  private ffmpegPath: string;

  constructor(ffmpegPath = workerConfig.ffmpegPath) {
    this.ffmpegPath = ffmpegPath;
  }

  /**
   * Extract speech-optimized 16kHz mono 16-bit PCM WAV for Whisper STT and Pyannote diarization.
   * Command: ffmpeg -y -i source.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 output.wav
   */
  async extractSpeechAudio(
    videoPath: string,
    outputWavPath: string,
  ): Promise<{ outputPath: string; durationMs: number }> {
    return this.extractAudio(videoPath, outputWavPath, {
      codec: "pcm_s16le",
      sampleRate: 16000,
      channels: 1,
    });
  }

  /**
   * Extract audio in arbitrary format (WAV, AAC, MP3) with configurable parameters.
   */
  async extractAudio(
    videoPath: string,
    outputPath: string,
    options: AudioExtractionOptions = {},
  ): Promise<{ outputPath: string; durationMs: number }> {
    validateInputFile(videoPath);

    const metadata = await metadataExtractor.extract(videoPath);
    if (!metadata.hasAudio) {
      throw new Error(`Cannot extract audio: Video file has no audio streams (${videoPath})`);
    }

    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const sampleRate = options.sampleRate ?? 16000;
    const channels = options.channels ?? 1;
    const codec = options.codec ?? "pcm_s16le";

    const args = [
      "-y",
      "-i",
      videoPath,
      "-vn", // discard video stream
    ];

    if (codec === "pcm_s16le") {
      args.push("-acodec", "pcm_s16le", "-ar", sampleRate.toString(), "-ac", channels.toString());
    } else if (codec === "aac") {
      args.push(
        "-c:a",
        "aac",
        "-b:a",
        `${options.bitrateKbps || 192}k`,
        "-ar",
        sampleRate.toString(),
        "-ac",
        channels.toString(),
      );
    } else if (codec === "mp3") {
      args.push(
        "-c:a",
        "libmp3lame",
        "-b:a",
        `${options.bitrateKbps || 192}k`,
        "-ar",
        sampleRate.toString(),
        "-ac",
        channels.toString(),
      );
    }

    // Fast multi-threading limit
    args.push("-threads", workerConfig.maxThreads.toString(), outputPath);

    const result = await executeProcess(this.ffmpegPath, args);

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error(`Audio extraction failed: Output file was not created or is empty (${outputPath})`);
    }

    return {
      outputPath,
      durationMs: result.durationMs,
    };
  }
}

export const audioExtractor = new AudioExtractor();

