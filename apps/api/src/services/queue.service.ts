import { Queue } from "bullmq";
import { PlanTier } from "@clipforge/shared-types";
import { getRedisClient } from "./redis.service.js";

export const VIDEO_PROCESSING_QUEUE_NAME = "video-processing-queue";

const TIER_PRIORITIES: Record<PlanTier, number> = {
  [PlanTier.BUSINESS]: 1,
  [PlanTier.PRO]: 2,
  [PlanTier.STARTER]: 5,
  [PlanTier.FREE]: 10,
};

export interface VideoProcessingJobData {
  jobId: string;
  projectId: string;
  userId: string;
  userTier: PlanTier;
  clipId?: string;
  targetAspect?: string;
  minClipDuration?: number;
  maxClipDuration?: number;
  maxClipsToGen?: number;
}

export class QueueService {
  private queue: Queue<VideoProcessingJobData> | null = null;
  private inMemoryJobs: Map<string, VideoProcessingJobData> = new Map();
  private isRedisConnected = false;

  constructor() {
    try {
      const redis = getRedisClient();
      this.queue = new Queue<VideoProcessingJobData>(VIDEO_PROCESSING_QUEUE_NAME, {
        connection: redis,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      });

      this.queue.waitUntilReady().then(() => {
        this.isRedisConnected = true;
      }).catch(() => {
        this.isRedisConnected = false;
      });
    } catch {
      this.isRedisConnected = false;
    }
  }

  /**
   * Enqueues project analysis job with tier priority and duplicate prevention.
   */
  public async enqueueProjectAnalysis(data: VideoProcessingJobData): Promise<{ id: string; name: string; data: VideoProcessingJobData }> {
    const priority = TIER_PRIORITIES[data.userTier] || 10;

    if (this.queue && this.isRedisConnected) {
      try {
        const job = await this.queue.add("PROCESS_PROJECT", data, {
          jobId: data.jobId,
          priority,
        });
        return { id: String(job.id), name: job.name, data: job.data };
      } catch {
        // Fallback to in-memory job registry if redis emits execution error
        this.inMemoryJobs.set(data.jobId, data);
        return { id: data.jobId, name: "PROCESS_PROJECT", data };
      }
    }

    // Zero-config offline/test fallback
    this.inMemoryJobs.set(data.jobId, data);
    return { id: data.jobId, name: "PROCESS_PROJECT", data };
  }

  /**
   * Enqueues a single clip re-render job with tier priority.
   */
  public async enqueueClipRender(data: VideoProcessingJobData): Promise<{ id: string; name: string; data: VideoProcessingJobData }> {
    const priority = TIER_PRIORITIES[data.userTier] || 10;

    if (this.queue && this.isRedisConnected) {
      try {
        const job = await this.queue.add("RENDER_SINGLE_CLIP", data, {
          jobId: data.jobId,
          priority,
        });
        return { id: String(job.id), name: job.name, data: job.data };
      } catch {
        this.inMemoryJobs.set(data.jobId, data);
        return { id: data.jobId, name: "RENDER_SINGLE_CLIP", data };
      }
    }

    this.inMemoryJobs.set(data.jobId, data);
    return { id: data.jobId, name: "RENDER_SINGLE_CLIP", data };
  }

  /**
   * Discards or removes an in-flight / waiting job from the queue.
   */
  public async cancelJob(jobId: string): Promise<boolean> {
    if (this.inMemoryJobs.has(jobId)) {
      this.inMemoryJobs.delete(jobId);
    }

    if (this.queue && this.isRedisConnected) {
      try {
        const job = await this.queue.getJob(jobId);
        if (job) {
          const state = await job.getState();
          if (state === "waiting" || state === "delayed") {
            await job.remove();
            return true;
          }
          if (state === "active") {
            await job.remove();
            return true;
          }
        }
      } catch {
        // Fallback if Redis is unreachable
      }
    }
    return true;
  }

  public async getJob(jobId: string): Promise<{ id: string; data: VideoProcessingJobData } | null> {
    if (this.queue && this.isRedisConnected) {
      try {
        const job = await this.queue.getJob(jobId);
        if (job) return { id: String(job.id), data: job.data };
      } catch {
        // Fallback to in-memory
      }
    }

    const memoryJob = this.inMemoryJobs.get(jobId);
    if (memoryJob) {
      return { id: memoryJob.jobId, data: memoryJob };
    }

    return null;
  }
}

export const queueService = new QueueService();
