import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { AspectRatio, CropMode } from "@clipforge/shared-types";
import {
  videoProcessingEngine,
  executeProcess,
  workerConfig,
  validateTimeRange,
  secondsToFfmpegTimestamp,
  secondsToAssTimestamp,
} from "../src/index.js";

describe("ClipForge AI Video Processing Engine (Phase 8)", () => {
  let testDir: string;
  let sample16x9Path: string;
  let silentVideoPath: string;

  before(async () => {
    testDir = path.join(os.tmpdir(), `clipforge_engine_test_${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    sample16x9Path = path.join(testDir, "sample_16x9.mp4");
    silentVideoPath = path.join(testDir, "sample_silent.mp4");

    // 1. Generate 4-second 1280x720 16:9 test video with 44.1kHz audio
    await executeProcess(workerConfig.ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=4:size=1280x720:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=800:duration=4",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      "44100",
      "-t",
      "4",
      sample16x9Path,
    ]);

    // 2. Generate 3-second silent video
    await executeProcess(workerConfig.ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=3:size=640x360:rate=30",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "-t",
      "3",
      silentVideoPath,
    ]);
  });

  after(async () => {
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // ignore on windows cleanup
      }
    }
  });

  // 1. Metadata Extraction
  describe("1. Video Metadata Extraction", () => {
    it("should accurately extract technical metadata from 16:9 sample video", async () => {
      const meta = await videoProcessingEngine.getMetadata(sample16x9Path);

      assert.equal(meta.width, 1280);
      assert.equal(meta.height, 720);
      assert.equal(meta.fps, 30);
      assert.equal(meta.aspectRatio, AspectRatio.RATIO_16_9);
      assert.equal(meta.hasAudio, true);
      assert.ok(meta.durationSeconds >= 3.9 && meta.durationSeconds <= 4.1);
      assert.equal(meta.videoCodec, "h264");
      assert.equal(meta.audioCodec, "aac");
      assert.ok(meta.fileSizeBytes > 1000);
      assert.equal(meta.videoStreams.length, 1);
      assert.equal(meta.audioStreams.length, 1);
      assert.equal(meta.audioStreams[0].sampleRate, 44100);
    });

    it("should correctly identify video without audio", async () => {
      const meta = await videoProcessingEngine.getMetadata(silentVideoPath);

      assert.equal(meta.width, 640);
      assert.equal(meta.height, 360);
      assert.equal(meta.hasAudio, false);
      assert.equal(meta.audioCodec, null);
      assert.equal(meta.audioStreams.length, 0);
    });

    it("should throw a descriptive error when input file does not exist", async () => {
      await assert.rejects(
        () => videoProcessingEngine.getMetadata("non_existent_file.mp4"),
        /Input file does not exist/,
      );
    });
  });

  // 2. Audio Extraction
  describe("2. Audio Extraction", () => {
    it("should extract speech-band 16kHz mono WAV audio for Whisper", async () => {
      const outputWav = path.join(testDir, "extracted_speech.wav");
      const res = await videoProcessingEngine.extractSpeechAudio(sample16x9Path, outputWav);

      assert.equal(res.outputPath, outputWav);
      assert.ok(fs.existsSync(outputWav));
      assert.ok(fs.statSync(outputWav).size > 0);

      // Verify the extracted WAV format via metadata
      const probeResult = await executeProcess(workerConfig.ffprobePath, [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_streams",
        outputWav,
      ]);
      const parsed = JSON.parse(probeResult.stdout);
      assert.equal(parsed.streams[0].codec_name, "pcm_s16le");
      assert.equal(parsed.streams[0].sample_rate, "16000");
      assert.equal(parsed.streams[0].channels, 1);
    });

    it("should extract AAC audio with custom bitrate", async () => {
      const outputAac = path.join(testDir, "extracted.aac");
      await videoProcessingEngine.extractAudio(sample16x9Path, outputAac, {
        codec: "aac",
        sampleRate: 48000,
        channels: 2,
        bitrateKbps: 192,
      });

      assert.ok(fs.existsSync(outputAac));
      assert.ok(fs.statSync(outputAac).size > 0);
    });

    it("should reject audio extraction on a video without audio tracks", async () => {
      const outputWav = path.join(testDir, "silent_fail.wav");
      await assert.rejects(
        () => videoProcessingEngine.extractSpeechAudio(silentVideoPath, outputWav),
        /Video file has no audio streams/,
      );
    });
  });

  // 3. Segment Extraction
  describe("3. Video Segment Extraction", () => {
    it("should extract an accurate sub-clip within boundaries", async () => {
      const outputCut = path.join(testDir, "clip_1_to_3.mp4");
      const res = await videoProcessingEngine.extractSegment(sample16x9Path, outputCut, {
        startTimeSeconds: 1.0,
        endTimeSeconds: 3.0,
        accurate: true,
      });

      assert.equal(res.outputPath, outputCut);
      assert.equal(res.segmentDuration, 2.0);
      assert.ok(fs.existsSync(outputCut));

      const meta = await videoProcessingEngine.getMetadata(outputCut);
      assert.ok(meta.durationSeconds >= 1.9 && meta.durationSeconds <= 2.1);
      assert.equal(meta.videoCodec, "h264");
      assert.equal(meta.hasAudio, true);
    });

    it("should extract sub-clip using fast stream copy mode", async () => {
      const outputFastCut = path.join(testDir, "clip_fast.mp4");
      const res = await videoProcessingEngine.extractSegment(sample16x9Path, outputFastCut, {
        startTimeSeconds: 0.5,
        endTimeSeconds: 2.5,
        accurate: false,
      });

      assert.ok(fs.existsSync(res.outputPath));
    });

    it("should validate and reject invalid clip boundaries", () => {
      assert.throws(
        () => validateTimeRange(-1, 5, 10),
        /must be greater than or equal to 0/,
      );
      assert.throws(
        () => validateTimeRange(5, 5, 10),
        /endTime.*must be greater than startTime/,
      );
      assert.throws(
        () => validateTimeRange(5, 2, 10),
        /endTime.*must be greater than startTime/,
      );
      assert.throws(
        () => validateTimeRange(12, 15, 10),
        /exceeds total video duration/,
      );
    });
  });

  // 4. Aspect Ratio Conversion & Cropping
  describe("4. Aspect Ratio Conversion & Cropping", () => {
    it("should reframe 16:9 to vertical 9:16 using CENTER_CROP", async () => {
      const output916 = path.join(testDir, "crop_9_16.mp4");
      const res = await videoProcessingEngine.reframeVideo(sample16x9Path, output916, {
        targetAspect: AspectRatio.RATIO_9_16,
        mode: CropMode.CENTER_CROP,
        targetWidth: 720,
        targetHeight: 1280,
      });

      assert.ok(fs.existsSync(res.outputPath));
      const meta = await videoProcessingEngine.getMetadata(output916);
      assert.equal(meta.width, 720);
      assert.equal(meta.height, 1280);
      assert.equal(meta.aspectRatio, AspectRatio.RATIO_9_16);
    });

    it("should reframe 16:9 to square 1:1 using CENTER_CROP", async () => {
      const output11 = path.join(testDir, "crop_1_1.mp4");
      const res = await videoProcessingEngine.reframeVideo(sample16x9Path, output11, {
        targetAspect: AspectRatio.RATIO_1_1,
        mode: CropMode.CENTER_CROP,
        targetWidth: 720,
        targetHeight: 720,
      });

      assert.ok(fs.existsSync(res.outputPath));
      const meta = await videoProcessingEngine.getMetadata(output11);
      assert.equal(meta.width, 720);
      assert.equal(meta.height, 720);
      assert.equal(meta.aspectRatio, AspectRatio.RATIO_1_1);
    });

    it("should reframe 16:9 to vertical 9:16 using BLUR_PAD", async () => {
      const outputBlur = path.join(testDir, "crop_blur_pad.mp4");
      const res = await videoProcessingEngine.reframeVideo(sample16x9Path, outputBlur, {
        targetAspect: AspectRatio.RATIO_9_16,
        mode: CropMode.BLUR_PAD,
        targetWidth: 720,
        targetHeight: 1280,
      });

      assert.ok(fs.existsSync(res.outputPath));
      const meta = await videoProcessingEngine.getMetadata(outputBlur);
      assert.equal(meta.width, 720);
      assert.equal(meta.height, 1280);
    });
  });

  // 5. Thumbnail Generation
  describe("5. Video Thumbnail Generation", () => {
    it("should generate a JPG thumbnail at a specified timestamp", async () => {
      const outputThumb = path.join(testDir, "thumb.jpg");
      const res = await videoProcessingEngine.generateThumbnail(sample16x9Path, outputThumb, {
        timestampSeconds: 1.5,
        width: 640,
        format: "jpg",
      });

      assert.equal(res.outputPath, outputThumb);
      assert.ok(fs.existsSync(outputThumb));
      assert.ok(fs.statSync(outputThumb).size > 1000);
    });

    it("should generate a WebP thumbnail using percentage offset", async () => {
      const outputThumbWebp = path.join(testDir, "thumb.webp");
      const res = await videoProcessingEngine.generateThumbnail(sample16x9Path, outputThumbWebp, {
        timestampPercent: 50,
        format: "webp",
      });

      assert.ok(fs.existsSync(res.outputPath));
      assert.ok(fs.statSync(outputThumbWebp).size > 500);
    });
  });

  // 6. Subtitle Burn-In Foundation
  describe("6. Subtitle Burn-In Foundation", () => {
    it("should generate ASS subtitle file and burn it into video", async () => {
      const assFile = path.join(testDir, "test_subs.ass");
      videoProcessingEngine.subtitle.generateAssFile(
        assFile,
        [
          { startSeconds: 0.5, endSeconds: 2.0, text: "Welcome to ClipForge AI" },
          { startSeconds: 2.1, endSeconds: 3.5, text: "High quality short form clips" },
        ],
        { fontSize: 24 },
      );

      assert.ok(fs.existsSync(assFile));
      const content = fs.readFileSync(assFile, "utf8");
      assert.ok(content.includes("[Script Info]"));
      assert.ok(content.includes("Welcome to ClipForge AI"));

      const outputSubtitled = path.join(testDir, "subtitled_clip.mp4");
      const res = await videoProcessingEngine.burnSubtitles(sample16x9Path, outputSubtitled, {
        subtitlePath: assFile,
      });

      assert.ok(fs.existsSync(res.outputPath));
      const meta = await videoProcessingEngine.getMetadata(outputSubtitled);
      assert.equal(meta.videoCodec, "h264");
    });
  });

  // 7. Complete Clip Pipeline Orchestration
  describe("7. Complete End-to-End Clip Pipeline", () => {
    it("should execute complete pipeline: segment cut + 9:16 reframe + thumbnail + subtitles", async () => {
      const finalClip = path.join(testDir, "final_complete_clip.mp4");
      const finalThumb = path.join(testDir, "final_complete_thumb.jpg");

      const result = await videoProcessingEngine.renderCompleteClip(
        sample16x9Path,
        finalClip,
        {
          segment: {
            startTimeSeconds: 1.0,
            endTimeSeconds: 3.0,
            accurate: true,
          },
          reframe: {
            targetAspect: AspectRatio.RATIO_9_16,
            mode: CropMode.CENTER_CROP,
            targetWidth: 720,
            targetHeight: 1280,
          },
          subtitles: {
            dialogues: [
              { startSeconds: 0.2, endSeconds: 1.8, text: "Viral highlight moment" },
            ],
          },
          thumbnail: {
            outputPath: finalThumb,
            timestampSeconds: 0.5,
          },
        },
      );

      assert.ok(fs.existsSync(result.clipVideoPath));
      assert.ok(fs.existsSync(result.thumbnailPath!));
      assert.equal(result.metadata.width, 720);
      assert.equal(result.metadata.height, 1280);
      assert.equal(result.metadata.aspectRatio, AspectRatio.RATIO_9_16);
      assert.ok(result.metadata.durationSeconds >= 1.9 && result.metadata.durationSeconds <= 2.1);
    });
  });

  // 8. Timestamp Utilities
  describe("8. Timestamp Formatting Utilities", () => {
    it("should format timestamps for FFmpeg and ASS correctly", () => {
      assert.equal(secondsToFfmpegTimestamp(0), "00:00:00.000");
      assert.equal(secondsToFfmpegTimestamp(65.123), "00:01:05.123");
      assert.equal(secondsToFfmpegTimestamp(3661.5), "01:01:01.500");

      assert.equal(secondsToAssTimestamp(0), "0:00:00.00");
      assert.equal(secondsToAssTimestamp(65.123), "0:01:05.12");
      assert.equal(secondsToAssTimestamp(3661.5), "1:01:01.50");
    });
  });
});
