import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { AspectRatio, CropMode } from "@clipforge/shared-types";
import { prisma } from "@clipforge/database";
import {
  subtitleBurner,
  hexToAssColor,
  SubtitlePreset,
  CaptionPosition,
  AssWordToken,
} from "../src/engine/subtitle-burner.js";
import { videoCropper } from "../src/engine/video-cropper.js";
import { metadataExtractor } from "../src/engine/metadata-extractor.js";
import { automaticClipGenerator } from "../src/engine/automatic-clip-generator.js";
import { executeProcess } from "../src/engine/ffmpeg-process.js";
import { workerConfig } from "../src/config/env.js";

const TEST_SCRATCH_DIR = path.join(os.tmpdir(), `clipforge_phase11_test_${Date.now()}`);
const SAMPLE_VIDEO_PATH = path.join(TEST_SCRATCH_DIR, "sample_16x9.mp4");

let testUserId: string;
let testProjectId: string;
let testJobId: string;

describe("Phase 11: Automatic Clip Generation Tests", () => {
  before(async () => {
    fs.mkdirSync(TEST_SCRATCH_DIR, { recursive: true });

    // Generate a 5-second 1280x720 16:9 test video with audio
    await executeProcess(workerConfig.ffmpegPath, [
      "-y",
      "-f", "lavfi", "-i", "testsrc=duration=5:size=1280x720:rate=30",
      "-f", "lavfi", "-i", "sine=frequency=1000:duration=5",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-t", "5",
      SAMPLE_VIDEO_PATH,
    ]);

    // Create a mock user, project, and job in database for testing
    const email = `phase11_tester_${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: "Phase 11 Tester",
        role: "USER",
        passwordHash: "$2b$12$dummyhashforphase11testing",
      },
    });
    testUserId = user.id;

    const project = await prisma.videoProject.create({
      data: {
        userId: testUserId,
        title: "Phase 11 Clip Test",
        sourceType: "FILE_UPLOAD",
        rightsAttested: true,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    testProjectId = project.id;

    const job = await prisma.processingJob.create({
      data: {
        projectId: testProjectId,
        jobType: "FULL_PROJECT_ANALYSIS",
        bullMqJobId: `test_bull_phase11_${Date.now()}`,
        status: "RUNNING",
      },
    });
    testJobId = job.id;
  });

  after(async () => {
    // Cleanup DB
    try {
      if (testProjectId) {
        await prisma.clip.deleteMany({ where: { projectId: testProjectId } });
        await prisma.processingJob.deleteMany({ where: { projectId: testProjectId } });
        await prisma.videoProject.delete({ where: { id: testProjectId } });
      }
      if (testUserId) {
        await prisma.user.delete({ where: { id: testUserId } });
      }
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }

    // Cleanup scratch directory
    if (fs.existsSync(TEST_SCRATCH_DIR)) {
      fs.rmSync(TEST_SCRATCH_DIR, { recursive: true, force: true });
    }
  });

  // --- 1. Subtitle & Highlighting Tests ---
  describe("1. Subtitle Generation with Word-Level Highlighting", () => {
    test("should convert web hex colors to ASS &HAABBGGRR& format", () => {
      assert.strictEqual(hexToAssColor("#FFFFFF"), "&H00FFFFFF&");
      assert.strictEqual(hexToAssColor("#000000"), "&H00000000&");
      // Yellow #FACC15 -> R:FA, G:CC, B:15 -> ASS &H0015CCFA&
      assert.strictEqual(hexToAssColor("#FACC15"), "&H0015CCFA&");
    });

    test("should generate viral word-highlight ASS subtitle file", () => {
      const assPath = path.join(TEST_SCRATCH_DIR, "highlight_test.ass");
      const words: AssWordToken[] = [
        { word: "Stop", startSeconds: 0.0, endSeconds: 0.4 },
        { word: "building", startSeconds: 0.45, endSeconds: 0.9 },
        { word: "in", startSeconds: 0.95, endSeconds: 1.1 },
        { word: "stealth.", startSeconds: 1.15, endSeconds: 1.8 },
      ];

      subtitleBurner.generateWordHighlightAssFile(assPath, words, {
        title: "Test Viral Subtitles",
        stylePreset: SubtitlePreset.VIRAL_HIGHLIGHT,
        highlightColorHex: "#FACC15",
        primaryColorHex: "#FFFFFF",
        position: CaptionPosition.BOTTOM,
        wordsPerLine: 3,
      });

      assert.strictEqual(fs.existsSync(assPath), true);
      const content = fs.readFileSync(assPath, "utf8");

      assert.match(content, /ScriptType: v4\.00\+/);
      assert.match(content, /Style: Default/);
      assert.match(content, /Dialogue:/);
      // Verify active-word highlight tag is present
      assert.match(content, /\\c&H0015CCFA&/);
    });

    test("should support Boxed and Clean caption presets", () => {
      const boxedAss = path.join(TEST_SCRATCH_DIR, "boxed_test.ass");
      subtitleBurner.generateWordHighlightAssFile(boxedAss, [{ word: "Test", startSeconds: 0, endSeconds: 1 }], {
        stylePreset: SubtitlePreset.BOXED,
      });
      const boxedContent = fs.readFileSync(boxedAss, "utf8");
      // BorderStyle 3 denotes opaque box background
      assert.match(boxedContent, /BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,3,/);
    });
  });

  // --- 2. Smart Aspect Ratio Cropping Tests ---
  describe("2. Smart Cropping & Aspect Ratio Conversion", () => {
    test("should reframe 16:9 to vertical 9:16 with safe center crop", async () => {
      const out916 = path.join(TEST_SCRATCH_DIR, "reframe_916.mp4");
      await videoCropper.reframeVideo(SAMPLE_VIDEO_PATH, out916, {
        targetAspect: AspectRatio.RATIO_9_16,
        mode: CropMode.CENTER_CROP,
        preset: "ultrafast",
      });

      assert.strictEqual(fs.existsSync(out916), true);
      const meta = await metadataExtractor.extract(out916);
      assert.strictEqual(meta.width, 1080);
      assert.strictEqual(meta.height, 1920);
    });

    test("should reframe 16:9 to square 1:1 with speaker focal center", async () => {
      const out11 = path.join(TEST_SCRATCH_DIR, "reframe_11.mp4");
      await videoCropper.reframeVideo(SAMPLE_VIDEO_PATH, out11, {
        targetAspect: AspectRatio.RATIO_1_1,
        mode: CropMode.FACE_TRACK,
        focusXNormalized: 0.65, // slightly off-center speaker position
        preset: "ultrafast",
      });

      assert.strictEqual(fs.existsSync(out11), true);
      const meta = await metadataExtractor.extract(out11);
      assert.strictEqual(meta.width, 1080);
      assert.strictEqual(meta.height, 1080);
    });
  });

  // --- 3. End-to-End Automatic Clip Generation Tests ---
  describe("3. End-to-End Automatic Clip Rendering & Output Validation", () => {
    test("should render single clip with boundaries, subtitles, and persist DB records", async () => {
      const candidate = {
        start: 1.0,
        end: 4.0,
        title: "Stop Building In Stealth",
        category: "educational",
        reason: "Powerful hook exposing early founder mistakes with clear advice.",
        scores: {
          hook: 92,
          engagement: 88,
          context: 95,
          overall: 91,
        },
      };

      const words: AssWordToken[] = [
        { word: "Stop", startSeconds: 1.0, endSeconds: 1.5 },
        { word: "building", startSeconds: 1.55, endSeconds: 2.2 },
        { word: "in", startSeconds: 2.25, endSeconds: 2.6 },
        { word: "stealth.", startSeconds: 2.65, endSeconds: 3.5 },
      ];

      const result = await automaticClipGenerator.renderSingleClip({
        jobId: testJobId,
        projectId: testProjectId,
        rankOrder: 1,
        candidate,
        sourceVideoPath: SAMPLE_VIDEO_PATH,
        transcriptWords: words,
        targetAspect: AspectRatio.RATIO_9_16,
        cropMode: CropMode.CENTER_CROP,
        subtitlePreset: SubtitlePreset.VIRAL_HIGHLIGHT,
        captionPosition: CaptionPosition.BOTTOM,
      });

      // Verify returned result object
      assert.ok(result.clipId);
      assert.ok(result.exportId);
      assert.strictEqual(result.title, candidate.title);
      assert.ok(result.duration >= 2.5 && result.duration <= 3.5);
      assert.ok(result.videoStorageKey.includes(result.clipId));
      assert.ok(result.thumbnailStorageKey.includes("thumb"));

      // Verify output metadata: 1080x1920 vertical video with audio
      assert.strictEqual(result.metadata.width, 1080);
      assert.strictEqual(result.metadata.height, 1920);
      assert.strictEqual(result.metadata.hasAudio, true);

      // Verify database persistence
      const savedClip = await prisma.clip.findUnique({
        where: { id: result.clipId },
        include: { score: true, caption: true, exports: true },
      });

      assert.ok(savedClip);
      assert.strictEqual(savedClip.title, candidate.title);
      assert.strictEqual(savedClip.category, "EDUCATIONAL");
      assert.strictEqual(savedClip.status, "READY");

      // Verify Score
      assert.ok(savedClip.score);
      assert.strictEqual(savedClip.score.hookScore, 92);
      assert.strictEqual(savedClip.score.overallScore, 91);

      // Verify Caption
      assert.ok(savedClip.caption);
      assert.strictEqual(savedClip.caption.presetId, "viral_highlight");

      // Verify Export
      assert.strictEqual(savedClip.exports.length, 1);
      assert.strictEqual(savedClip.exports[0].status, "READY");
      assert.strictEqual(savedClip.exports[0].resolution, "RES_1080P");
    });

    test("should execute batch multi-clip generator with concurrency and progress tracking", async () => {
      const candidates = [
        {
          start: 0.5,
          end: 2.5,
          title: "Clip One: The Hook",
          category: "important",
          reason: "Clear opening claim with strong audience curiosity.",
          scores: { hook: 90, engagement: 85, context: 88, overall: 87 },
        },
        {
          start: 2.5,
          end: 4.8,
          title: "Clip Two: The Solution",
          category: "educational",
          reason: "Practical framework resolving the primary question.",
          scores: { hook: 88, engagement: 90, context: 92, overall: 90 },
        },
      ];

      const progressUpdates: number[] = [];
      const results = await automaticClipGenerator.generateClips({
        jobId: testJobId,
        projectId: testProjectId,
        sourceVideoPath: SAMPLE_VIDEO_PATH,
        candidates,
        targetAspect: AspectRatio.RATIO_9_16,
        concurrency: 2,
        onClipRendered: async (done, total) => {
          progressUpdates.push(Math.round((done / total) * 100));
        },
      });

      assert.strictEqual(results.length, 2);
      assert.strictEqual(progressUpdates.length, 2);
      assert.strictEqual(progressUpdates[progressUpdates.length - 1], 100);

      // Validate playable output via ffprobe
      for (const res of results) {
        assert.ok(res.metadata.durationSeconds > 1.5);
        assert.strictEqual(res.metadata.width, 1080);
        assert.strictEqual(res.metadata.height, 1920);
      }
    });

    test("should fail with clear error when source video is missing", async () => {
      await assert.rejects(
        automaticClipGenerator.generateClips({
          jobId: testJobId,
          projectId: testProjectId,
          sourceVideoPath: path.join(TEST_SCRATCH_DIR, "non_existent_file.mp4"),
          candidates: [
            {
              start: 0,
              end: 3,
              title: "Test",
              category: "funny",
              reason: "Test reason",
              scores: { hook: 80, engagement: 80, context: 80, overall: 80 },
            },
          ],
        }),
        /Source video not found/,
      );
    });
  });
});
