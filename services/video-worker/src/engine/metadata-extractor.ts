import fs from "fs";
import { VideoMetadata, VideoStreamInfo, AudioStreamInfo, AspectRatio } from "@clipforge/shared-types";
import { workerConfig } from "../config/env.js";
import { executeProcess, validateInputFile } from "./ffmpeg-process.js";

interface FfprobeStream {
  index: number;
  codec_name?: string;
  codec_type?: "video" | "audio" | "subtitle" | "data";
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  duration?: string;
  bit_rate?: string;
  pix_fmt?: string;
  sample_rate?: string;
  channels?: number;
  tags?: Record<string, string>;
  side_data_list?: Array<{ rotation?: number }>;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: {
    duration?: string;
    size?: string;
    bit_rate?: string;
    format_name?: string;
    tags?: Record<string, string>;
  };
}

export class MetadataExtractor {
  private ffprobePath: string;

  constructor(ffprobePath = workerConfig.ffprobePath) {
    this.ffprobePath = ffprobePath;
  }

  /**
   * Extracts technical media metadata from a video file using ffprobe.
   */
  async extract(filePath: string): Promise<VideoMetadata> {
    validateInputFile(filePath);

    const args = [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ];

    const result = await executeProcess(this.ffprobePath, args);

    let parsed: FfprobeOutput;
    try {
      parsed = JSON.parse(result.stdout) as FfprobeOutput;
    } catch {
      throw new Error(`Failed to parse ffprobe JSON output for file: ${filePath}`);
    }

    const streams = parsed.streams || [];
    const videoStreamsRaw = streams.filter((s) => s.codec_type === "video");
    const audioStreamsRaw = streams.filter((s) => s.codec_type === "audio");

    if (videoStreamsRaw.length === 0) {
      throw new Error(`Invalid video file: No video streams found in ${filePath}`);
    }

    const primaryVideo = videoStreamsRaw[0];
    if (!primaryVideo) {
      throw new Error(`Invalid video file: No primary video stream found in ${filePath}`);
    }

    // Compute FPS from r_frame_rate e.g. "30/1" or "30000/1001"
    let fps = 30;
    if (primaryVideo.r_frame_rate) {
      const parts = primaryVideo.r_frame_rate.split("/");
      if (parts.length === 2 && Number(parts[1]) > 0) {
        fps = Math.round((Number(parts[0]) / Number(parts[1])) * 100) / 100;
      }
    }

    // Detect rotation tag (from tags.rotate or side_data_list)
    let rotation = 0;
    if (primaryVideo.tags?.rotate) {
      rotation = parseInt(primaryVideo.tags.rotate, 10) || 0;
    } else if (primaryVideo.side_data_list?.length) {
      const rot = primaryVideo.side_data_list.find((sd) => sd.rotation !== undefined);
      if (rot?.rotation) rotation = rot.rotation;
    }

    let width = primaryVideo.width || 1920;
    let height = primaryVideo.height || 1080;

    // Handle 90 or 270 degree rotation swapping width & height
    if (Math.abs(rotation) === 90 || Math.abs(rotation) === 270) {
      const tmp = width;
      width = height;
      height = tmp;
    }

    // Duration in seconds
    const durationSeconds =
      parseFloat(parsed.format?.duration || primaryVideo.duration || "0") || 0;

    // File size
    const stat = fs.statSync(filePath);
    const fileSizeBytes = parseInt(parsed.format?.size || `${stat.size}`, 10) || stat.size;

    // Bitrate
    const bitrateKbps = Math.round(
      (parseInt(parsed.format?.bit_rate || primaryVideo.bit_rate || "0", 10) || 0) / 1000,
    );

    // Aspect ratio detection
    let aspectRatio: AspectRatio | "CUSTOM" = "CUSTOM";
    const ratio = width / height;
    if (Math.abs(ratio - 9 / 16) < 0.05) {
      aspectRatio = AspectRatio.RATIO_9_16;
    } else if (Math.abs(ratio - 16 / 9) < 0.05) {
      aspectRatio = AspectRatio.RATIO_16_9;
    } else if (Math.abs(ratio - 1.0) < 0.05) {
      aspectRatio = AspectRatio.RATIO_1_1;
    }

    const videoStreams: VideoStreamInfo[] = videoStreamsRaw.map((v) => ({
      index: v.index,
      codecName: v.codec_name || "unknown",
      width: v.width || 0,
      height: v.height || 0,
      fps,
      bitrateKbps: v.bit_rate ? Math.round(parseInt(v.bit_rate, 10) / 1000) : undefined,
      durationSeconds: v.duration ? parseFloat(v.duration) : undefined,
      pixFmt: v.pix_fmt,
      rotation,
    }));

    const audioStreams: AudioStreamInfo[] = audioStreamsRaw.map((a) => ({
      index: a.index,
      codecName: a.codec_name || "unknown",
      sampleRate: a.sample_rate ? parseInt(a.sample_rate, 10) : 44100,
      channels: a.channels || 2,
      bitrateKbps: a.bit_rate ? Math.round(parseInt(a.bit_rate, 10) / 1000) : undefined,
      durationSeconds: a.duration ? parseFloat(a.duration) : undefined,
    }));

    return {
      durationSeconds: Math.round(durationSeconds * 1000) / 1000,
      width,
      height,
      fps,
      videoCodec: primaryVideo.codec_name || "unknown",
      audioCodec: audioStreamsRaw[0]?.codec_name || null,
      hasAudio: audioStreamsRaw.length > 0,
      fileSizeBytes,
      bitrateKbps,
      aspectRatio,
      rotation,
      videoStreams,
      audioStreams,
    };
  }
}

export const metadataExtractor = new MetadataExtractor();
