import os from "os";
import path from "path";
import { createRequire } from "module";
import dotenv from "dotenv";

dotenv.config();

const require = createRequire(import.meta.url);

// Attempt to load static binary paths, falling back gracefully
let resolvedFfmpegPath = process.env.FFMPEG_PATH || "";
let resolvedFfprobePath = process.env.FFPROBE_PATH || "";

if (!resolvedFfmpegPath) {
  try {
    const ffmpegStatic = require("ffmpeg-static");
    resolvedFfmpegPath = typeof ffmpegStatic === "string" ? ffmpegStatic : ffmpegStatic?.path || "";
  } catch {
    resolvedFfmpegPath = "ffmpeg";
  }
}

if (!resolvedFfprobePath) {
  try {
    const ffprobeStatic = require("ffprobe-static");
    resolvedFfprobePath = typeof ffprobeStatic === "string" ? ffprobeStatic : ffprobeStatic?.path || "";
  } catch {
    resolvedFfprobePath = "ffprobe";
  }
}

export const workerConfig = {
  env: process.env.NODE_ENV || "development",
  ffmpegPath: resolvedFfmpegPath,
  ffprobePath: resolvedFfprobePath,
  tempDir: process.env.WORKER_TEMP_DIR || path.join(os.tmpdir(), "clipforge"),
  maxConcurrentRenders: Number(process.env.WORKER_CONCURRENCY || 3),
  defaultPreset: process.env.FFMPEG_PRESET || "ultrafast",
  defaultCrf: Number(process.env.FFMPEG_CRF || 23),
  defaultAudioBitrateKbps: Number(process.env.FFMPEG_AUDIO_BITRATE_KBPS || 160),
  processTimeoutMs: Number(process.env.FFMPEG_TIMEOUT_MS || 900_000), // 15 minutes max per process
  maxThreads: Math.max(2, Math.min(8, (os.cpus()?.length || 4))),
};
