import path from "path";
import fs from "fs";
import { AspectRatio, CropMode, AspectRatioCropOptions } from "@clipforge/shared-types";
import { workerConfig } from "../config/env.js";
import { executeProcess, validateInputFile } from "./ffmpeg-process.js";
import { metadataExtractor } from "./metadata-extractor.js";

export interface Dimensions {
  width: number;
  height: number;
}

export function getTargetDimensions(
  aspectRatio: AspectRatio,
  preferredWidth?: number,
  preferredHeight?: number,
): Dimensions {
  if (preferredWidth && preferredHeight) {
    return { width: preferredWidth, height: preferredHeight };
  }

  switch (aspectRatio) {
    case AspectRatio.RATIO_9_16:
      return { width: 1080, height: 1920 };
    case AspectRatio.RATIO_16_9:
      return { width: 1920, height: 1080 };
    case AspectRatio.RATIO_1_1:
      return { width: 1080, height: 1080 };
    default:
      return { width: 1080, height: 1920 };
  }
}

export class VideoCropper {
  private ffmpegPath: string;

  constructor(ffmpegPath = workerConfig.ffmpegPath) {
    this.ffmpegPath = ffmpegPath;
  }

  /**
   * Reframes video into target aspect ratio (9:16, 16:9, 1:1) with specified crop mode.
   */
  async reframeVideo(
    inputVideoPath: string,
    outputVideoPath: string,
    options: AspectRatioCropOptions,
  ): Promise<{ outputPath: string; durationMs: number; dimensions: Dimensions }> {
    validateInputFile(inputVideoPath);

    const metadata = await metadataExtractor.extract(inputVideoPath);
    const targetDim = getTargetDimensions(
      options.targetAspect,
      options.targetWidth,
      options.targetHeight,
    );

    const outputDir = path.dirname(outputVideoPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const { width: outW, height: outH } = targetDim;
    const { width: inW, height: inH } = metadata;

    const crf = options.crf ?? workerConfig.defaultCrf;
    const preset = options.preset ?? workerConfig.defaultPreset;

    const args: string[] = ["-y", "-i", inputVideoPath];

    if (options.mode === CropMode.BLUR_PAD) {
      // Blurred background (scaled to cover and cropped to target canvas) + sharp centered foreground
      const filterGraph = `[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},boxblur=10:2[bg];[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`;
      args.push("-filter_complex", filterGraph);
    } else {
      // Default to Center Crop (also fallback for FACE_TRACK when no tracker trajectory provided)
      const targetRatio = outW / outH;
      const inputRatio = inW / inH;

      let cropW = inW;
      let cropH = inH;

      if (inputRatio > targetRatio) {
        // Input is wider than target: crop left & right
        cropW = Math.round(inH * targetRatio);
        // Ensure even dimensions
        if (cropW % 2 !== 0) cropW -= 1;
      } else {
        // Input is taller than target: crop top & bottom
        cropH = Math.round(inW / targetRatio);
        if (cropH % 2 !== 0) cropH -= 1;
      }

      // Symmetrically centered crop or speaker-aware focal crop
      let cropX = Math.round((inW - cropW) / 2);
      if (typeof options.focusXNormalized === "number" && !isNaN(options.focusXNormalized)) {
        const desiredCenterX = inW * Math.max(0.0, Math.min(1.0, options.focusXNormalized));
        cropX = Math.round(desiredCenterX - cropW / 2);
        cropX = Math.max(0, Math.min(inW - cropW, cropX));
        if (cropX % 2 !== 0) cropX -= 1;
        cropX = Math.max(0, cropX);
      }
      const cropY = Math.round((inH - cropH) / 2);

      const filter = `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${outW}:${outH}`;
      args.push("-vf", filter);
    }

    args.push(
      "-c:v",
      "libx264",
      "-preset",
      preset,
      "-crf",
      crf.toString(),
      "-pix_fmt",
      "yuv420p",
    );

    if (metadata.hasAudio) {
      args.push("-c:a", "aac", "-b:a", `${workerConfig.defaultAudioBitrateKbps}k`);
    } else {
      args.push("-an");
    }

    args.push(
      "-movflags",
      "+faststart",
      "-threads",
      workerConfig.maxThreads.toString(),
      outputVideoPath,
    );

    const result = await executeProcess(this.ffmpegPath, args);

    if (!fs.existsSync(outputVideoPath) || fs.statSync(outputVideoPath).size === 0) {
      throw new Error(`Video reframing failed: Output file empty or missing (${outputVideoPath})`);
    }

    return {
      outputPath: outputVideoPath,
      durationMs: result.durationMs,
      dimensions: targetDim,
    };
  }
}

export const videoCropper = new VideoCropper();
