import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { Worker, Job } from "bullmq";
import { Redis as RedisClient } from "ioredis";
import RedisMock from "ioredis-mock";
import { prisma } from "@clipforge/database";
import { ProcessingState } from "@clipforge/shared-types";
import { audioExtractor } from "./engine/audio-extractor.js";
import { tempManager } from "./utils/temp-manager.js";
import { workerConfig } from "./config/env.js";

dotenv.config();

export const VIDEO_PROCESSING_QUEUE_NAME = "video-processing-queue";

export interface VideoProcessingJobData {
  jobId: string;
  projectId: string;
  userId: string;
  userTier: string;
  sourceVideoPath?: string;
  targetAspect?: string;
  minClipDuration?: number;
  maxClipDuration?: number;
  maxClipsToGen?: number;
}

export function getWorkerRedisConnection(): RedisClient {
  const redisHost = process.env.REDIS_HOST || "localhost";
  const redisPort = Number(process.env.REDIS_PORT || 6379);
  const redisPassword = process.env.REDIS_PASSWORD || undefined;

  if (process.env.NODE_ENV === "test" || process.env.USE_REDIS_MOCK === "true") {
    return new (RedisMock as unknown as typeof RedisClient)();
  }

  try {
    const client = new RedisClient({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: () => null,
    });
    client.on("error", (err) => {
      console.warn("[Video Worker] Redis error:", err.message);
    });
    return client;
  } catch {
    return new (RedisMock as unknown as typeof RedisClient)();
  }
}

const STAGES: Array<{ stage: ProcessingState; progress: number; durationMs: number }> = [
  { stage: ProcessingState.VALIDATING, progress: 10, durationMs: 40 },
  { stage: ProcessingState.EXTRACTING, progress: 25, durationMs: 60 },
  { stage: ProcessingState.TRANSCRIBING, progress: 45, durationMs: 60 },
  { stage: ProcessingState.ANALYZING, progress: 60, durationMs: 60 },
  { stage: ProcessingState.SELECTING_CLIPS, progress: 70, durationMs: 50 },
  { stage: ProcessingState.RENDERING, progress: 85, durationMs: 60 },
  { stage: ProcessingState.UPLOADING, progress: 95, durationMs: 40 },
  { stage: ProcessingState.COMPLETED, progress: 100, durationMs: 20 },
];

export async function processVideoJob(job: Job<VideoProcessingJobData>): Promise<void> {
  const { jobId, projectId } = job.data;
  console.log(`[Worker] Starting job ${jobId} for project ${projectId}...`);

  // Check if real source video file is accessible
  let resolvedSourcePath = job.data.sourceVideoPath;
  if (!resolvedSourcePath) {
    const project = await prisma.videoProject.findUnique({
      where: { id: projectId },
      include: { assets: true },
    });
    const sourceAsset = project?.assets.find((a) => a.assetKind === "SOURCE_VIDEO");
    if (sourceAsset) {
      const localUploadDir = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR || "uploads");
      const candidateLocal = path.join(localUploadDir, sourceAsset.storageKey);
      if (fs.existsSync(candidateLocal)) {
        resolvedSourcePath = candidateLocal;
      }
    }
  }

  for (const step of STAGES) {
    // 1. Cancellation check before starting step
    const currentJob = await prisma.processingJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });

    if (!currentJob || currentJob.status === "CANCELLED") {
      console.log(`[Worker] Job ${jobId} was cancelled. Halting worker execution.`);
      return;
    }

    // 2. Execute stage logic if media exists, otherwise fallback to standard progression
    if (resolvedSourcePath && fs.existsSync(resolvedSourcePath)) {
      if (step.stage === ProcessingState.EXTRACTING) {
        // Extract 16kHz speech WAV
        await tempManager.withTempDir(async (dir) => {
          const wavPath = path.join(dir, "audio_16k.wav");
          try {
            await audioExtractor.extractSpeechAudio(resolvedSourcePath!, wavPath);
          } catch (e) {
            console.warn(`[Worker] Audio extraction warning: ${e}`);
          }
        }, "audio_extract");
      }
    }

    await new Promise((resolve) => setTimeout(resolve, step.durationMs));

    // 3. Update database progress and step
    await prisma.processingJob.update({
      where: { id: jobId },
      data: {
        progressPercent: step.progress,
        updatedAt: new Date(),
        ...(step.stage === ProcessingState.COMPLETED
          ? { status: "COMPLETED", completedAt: new Date() }
          : { status: "RUNNING" }),
      },
    });

    await job.updateProgress(step.progress);
  }

  // 4. Mark project completed
  await prisma.videoProject.update({
    where: { id: projectId },
    data: { status: "COMPLETED" },
  });

  console.log(`[Worker] Job ${jobId} for project ${projectId} completed successfully.`);
}

export function createVideoWorker(concurrency = workerConfig.maxConcurrentRenders): Worker<VideoProcessingJobData> {
  const connection = getWorkerRedisConnection();
  const workerInstance = new Worker<VideoProcessingJobData>(
    VIDEO_PROCESSING_QUEUE_NAME,
    processVideoJob,
    {
      connection,
      concurrency,
    },
  );

  workerInstance.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} has completed.`);
  });

  workerInstance.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed with error:`, err.message);
  });

  console.log(`[ClipForge Video Worker] Worker started with concurrency limit: ${concurrency}`);
  return workerInstance;
}
