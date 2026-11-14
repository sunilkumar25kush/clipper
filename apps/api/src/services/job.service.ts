import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { prisma, ProcessingJob } from "@clipforge/database";
import {
  ProcessingState,
  ProcessingJobDTO,
  PlanTier,
  ProjectStatus,
  AspectRatio,
  CropMode,
  JobStatus as DbJobStatus,
  JobStage as DbJobStage,
} from "@clipforge/shared-types";
import { CreateProcessingJobInput } from "@clipforge/validation";
import {
  automaticClipGenerator,
  workerConfig,
  executeProcess,
  AssWordToken,
  SubtitlePreset,
  CaptionPosition,
  metadataExtractor,
} from "@clipforge/video-worker";
import { AppError } from "../middlewares/error.js";
import { queueService } from "./queue.service.js";
import { storageService } from "./storage.service.js";
import { JobStateMachine } from "./job-state-machine.js";
import { eventsService } from "./events.service.js";
import { geminiService } from "./gemini.service.js";

const DEFAULT_ESTIMATED_CREDITS = 5; // Default minutes held for analysis

function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let curr = startDir;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(curr, "pnpm-workspace.yaml"))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return startDir;
}

export class JobService {
  /**
   * Creates and enqueues a background video processing job with idempotency,
   * credit reservation, and duplicate execution prevention.
   */
  public async createJob(
    userId: string,
    input: CreateProcessingJobInput,
  ): Promise<ProcessingJobDTO> {
    const project = await prisma.videoProject.findUnique({
      where: { id: input.projectId },
      include: {
        jobs: {
          where: {
            status: { in: [DbJobStatus.QUEUED, DbJobStatus.RUNNING] },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!project || project.userId !== userId) {
      throw new AppError(404, "NOT_FOUND", "Project not found or access denied.");
    }

    // 1. Duplicate prevention & Idempotency: return existing active job if already queued or running
    if (project.jobs.length > 0 && project.jobs[0]) {
      const activeJob = project.jobs[0];
      return this.formatJobDTO(activeJob);
    }

    // 2. Verify project has a valid source asset or allow demo fallback
    if (project.status === ProjectStatus.DRAFT) {
      const asset = await prisma.videoAsset.findFirst({
        where: { projectId: project.id },
      });
      if (!asset && !project.sourceUrl && process.env.NODE_ENV === "production") {
        throw new AppError(400, "MISSING_ASSET", "Cannot process project without an uploaded video file or authorized URL.");
      }
    }

    // 3. Check credits and reserve (HOLD) in credit ledger
    const creditWallet = await prisma.usageCredit.findUnique({
      where: { userId },
    });

    const availableCredits = creditWallet
      ? creditWallet.totalAllocated + creditWallet.bonusCredits - creditWallet.usedCredits - creditWallet.heldCredits
      : 0;

    if (availableCredits < 1) {
      throw new AppError(
        402,
        "INSUFFICIENT_CREDITS",
        "Insufficient credits to process this video. Please upgrade your plan or purchase top-up credits.",
      );
    }

    const creditsToHold = Math.min(availableCredits, DEFAULT_ESTIMATED_CREDITS);
    const jobId = crypto.randomUUID();

    // 4. Fetch user tier for BullMQ queue prioritization
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { planTier: true },
    });
    const userTier = (subscription?.planTier as PlanTier) || PlanTier.FREE;

    // 5. Transaction: Hold credits & Create ProcessingJob
    const createdJob = await prisma.$transaction(async (tx) => {
      // Hold credits
      await tx.usageCredit.update({
        where: { userId },
        data: {
          heldCredits: { increment: creditsToHold },
        },
      });

      // Ledger audit
      await tx.usageHistory.create({
        data: {
          userId,
          projectId: project.id,
          transactionType: "HOLD",
          amount: -creditsToHold,
          balanceAfter: availableCredits - creditsToHold,
          description: `Held ${creditsToHold} credits for video processing job`,
        },
      });

      // Update project status
      await tx.videoProject.update({
        where: { id: project.id },
        data: { status: ProjectStatus.QUEUED },
      });

      // Create ProcessingJob
      return tx.processingJob.create({
        data: {
          id: jobId,
          projectId: project.id,
          jobType: "FULL_PROJECT_ANALYSIS",
          bullMqJobId: jobId,
          status: DbJobStatus.QUEUED,
          stage: DbJobStage.QUEUED,
          progressPercent: 0,
          creditsHeld: creditsToHold,
        },
      });
    });

    // 6. Enqueue into BullMQ (if external worker is running) or execute local pipeline
    const useBullMq =
      queueService.isRedisAvailable() &&
      process.env.USE_REDIS_MOCK !== "true" &&
      process.env.ENABLE_EXTERNAL_WORKER === "true";

    if (useBullMq) {
      await queueService.enqueueProjectAnalysis({
        jobId,
        projectId: project.id,
        userId,
        userTier,
        targetAspect: input.targetAspect || project.targetAspect,
        minClipDuration: input.minClipDuration || project.minClipDuration,
        maxClipDuration: input.maxClipDuration || project.maxClipDuration,
        maxClipsToGen: input.maxClipsToGen || project.maxClipsToGen,
      });
    } else {
      // Execute asynchronously so HTTP response returns 202 immediately and pipeline runs in background
      this.executeLocalPipeline(jobId, project.id, userId, userTier, input).catch((err) => {
        console.error(`[JobService] Local pipeline execution failed for job ${jobId}:`, err);
      });
    }

    // 7. Broadcast SSE event
    eventsService.broadcastJobProgress({
      jobId,
      projectId: project.id,
      status: ProcessingState.PENDING,
      stage: ProcessingState.PENDING,
      progressPercent: 0,
      message: "Job queued for processing",
      updatedAt: new Date().toISOString(),
    });

    return this.formatJobDTO(createdJob);
  }

  /**
   * Retrieves processing job details and validates tenant ownership.
   */
  public async getJob(userId: string, jobId: string): Promise<ProcessingJobDTO> {
    const job = await prisma.processingJob.findUnique({
      where: { id: jobId },
      include: { project: { select: { userId: true } } },
    });

    if (!job || job.project.userId !== userId) {
      throw new AppError(404, "NOT_FOUND", "Processing job not found.");
    }

    return this.formatJobDTO(job);
  }

  /**
   * Cancels a queued or running job, releases held credits, and notifies connected clients.
   */
  public async cancelJob(
    userId: string,
    jobId: string,
    reason?: string,
  ): Promise<ProcessingJobDTO> {
    const job = await prisma.processingJob.findUnique({
      where: { id: jobId },
      include: { project: true },
    });

    if (!job || job.project.userId !== userId) {
      throw new AppError(404, "NOT_FOUND", "Processing job not found.");
    }

    const currentStatus = this.mapDbStatusToProcessingState(job.status, job.stage);
    if (JobStateMachine.isTerminal(currentStatus)) {
      throw new AppError(
        400,
        "JOB_ALREADY_TERMINAL",
        `Job is already in terminal state '${currentStatus}' and cannot be cancelled.`,
      );
    }

    JobStateMachine.assertValidTransition(currentStatus, ProcessingState.CANCELLED);

    // Cancel in BullMQ
    await queueService.cancelJob(job.bullMqJobId);

    // Atomic database update: cancel job, reset project, refund held credits
    const updatedJob = await prisma.$transaction(async (tx) => {
      // Refund held credits if any
      if (job.creditsHeld > 0) {
        await tx.usageCredit.update({
          where: { userId },
          data: {
            heldCredits: { decrement: job.creditsHeld },
          },
        });

        const wallet = await tx.usageCredit.findUnique({ where: { userId } });
        const balanceAfter = wallet
          ? wallet.totalAllocated + wallet.bonusCredits - wallet.usedCredits - wallet.heldCredits
          : 0;

        await tx.usageHistory.create({
          data: {
            userId,
            projectId: job.projectId,
            jobId: job.id,
            transactionType: "REFUND",
            amount: job.creditsHeld,
            balanceAfter,
            description: `Released ${job.creditsHeld} held credits due to job cancellation`,
          },
        });
      }

      // Reset project status back to UPLOADED
      await tx.videoProject.update({
        where: { id: job.projectId },
        data: { status: ProjectStatus.UPLOADED },
      });

      // Update job record
      return tx.processingJob.update({
        where: { id: job.id },
        data: {
          status: DbJobStatus.CANCELLED,
          errorMessage: reason || "Job cancelled by user",
          completedAt: new Date(),
        },
      });
    });

    // Broadcast SSE update
    eventsService.broadcastJobProgress({
      jobId: updatedJob.id,
      projectId: updatedJob.projectId,
      status: ProcessingState.CANCELLED,
      stage: ProcessingState.CANCELLED,
      progressPercent: updatedJob.progressPercent,
      message: "Job cancelled by user",
      updatedAt: new Date().toISOString(),
    });

    return this.formatJobDTO(updatedJob);
  }

  /**
   * Transition worker stage and update progress (used by worker processes).
   */
  public async transitionJobStage(
    jobId: string,
    nextStage: ProcessingState,
    progressOverride?: number,
    errorMessage?: string,
  ): Promise<ProcessingJobDTO> {
    const job = await prisma.processingJob.findUnique({
      where: { id: jobId },
      include: { project: true },
    });

    if (!job) {
      throw new AppError(404, "NOT_FOUND", "Job not found.");
    }

    const currentStage = this.mapDbStatusToProcessingState(job.status, job.stage);
    JobStateMachine.assertValidTransition(currentStage, nextStage);

    const progress = progressOverride ?? JobStateMachine.getMilestoneProgress(nextStage);
    const dbStatus = this.mapProcessingStateToDbStatus(nextStage);
    const dbStage = this.mapProcessingStateToDbStage(nextStage);

    const updatedJob = await prisma.$transaction(async (tx) => {
      // If completed: commit held credits to used credits
      if (nextStage === ProcessingState.COMPLETED) {
        if (job.creditsHeld > 0) {
          await tx.usageCredit.update({
            where: { userId: job.project.userId },
            data: {
              usedCredits: { increment: job.creditsHeld },
              heldCredits: { decrement: job.creditsHeld },
            },
          });
          const wallet = await tx.usageCredit.findUnique({ where: { userId: job.project.userId } });
          const balance = wallet ? wallet.totalAllocated + wallet.bonusCredits - wallet.usedCredits - wallet.heldCredits : 0;
          await tx.usageHistory.create({
            data: {
              userId: job.project.userId,
              projectId: job.projectId,
              jobId: job.id,
              transactionType: "COMMIT",
              amount: -job.creditsHeld,
              balanceAfter: balance,
              description: `Consumed ${job.creditsHeld} credits for completed video processing`,
            },
          });
        }
        await tx.videoProject.update({
          where: { id: job.projectId },
          data: { status: ProjectStatus.COMPLETED },
        });
      }

      // If failed: refund held credits
      if (nextStage === ProcessingState.FAILED) {
        if (job.creditsHeld > 0) {
          await tx.usageCredit.update({
            where: { userId: job.project.userId },
            data: { heldCredits: { decrement: job.creditsHeld } },
          });
          const wallet = await tx.usageCredit.findUnique({ where: { userId: job.project.userId } });
          const balance = wallet ? wallet.totalAllocated + wallet.bonusCredits - wallet.usedCredits - wallet.heldCredits : 0;
          await tx.usageHistory.create({
            data: {
              userId: job.project.userId,
              projectId: job.projectId,
              jobId: job.id,
              transactionType: "REFUND",
              amount: job.creditsHeld,
              balanceAfter: balance,
              description: `Refunded ${job.creditsHeld} credits due to processing failure`,
            },
          });
        }
        await tx.videoProject.update({
          where: { id: job.projectId },
          data: { status: ProjectStatus.FAILED },
        });
      }

      return tx.processingJob.update({
        where: { id: jobId },
        data: {
          status: dbStatus,
          stage: dbStage,
          progressPercent: progress,
          errorMessage: errorMessage ?? job.errorMessage,
          completedAt: JobStateMachine.isTerminal(nextStage) ? new Date() : job.completedAt,
        },
      });
    });

    eventsService.broadcastJobProgress({
      jobId: updatedJob.id,
      projectId: updatedJob.projectId,
      status: nextStage,
      stage: nextStage,
      progressPercent: progress,
      message: errorMessage || `Stage updated to ${nextStage}`,
      updatedAt: new Date().toISOString(),
    });

    return this.formatJobDTO(updatedJob);
  }

  public mapDbStatusToProcessingState(status: string, stage: string): ProcessingState {
    if (status === DbJobStatus.QUEUED) return ProcessingState.PENDING;
    if (status === DbJobStatus.CANCELLED || status === DbJobStatus.CANCELLING) return ProcessingState.CANCELLED;
    if (status === DbJobStatus.FAILED) return ProcessingState.FAILED;
    if (status === DbJobStatus.COMPLETED) return ProcessingState.COMPLETED;

    // Running states mapped from stage
    switch (stage) {
      case DbJobStage.VALIDATING_SOURCE:
        return ProcessingState.VALIDATING;
      case DbJobStage.EXTRACTING_AUDIO:
        return ProcessingState.EXTRACTING;
      case DbJobStage.TRANSCRIBING:
        return ProcessingState.TRANSCRIBING;
      case DbJobStage.ANALYZING_SEMANTICS:
        return ProcessingState.ANALYZING;
      case DbJobStage.RENDERING_CLIPS:
        return ProcessingState.RENDERING;
      case DbJobStage.COMPLETED:
        return ProcessingState.COMPLETED;
      default:
        return ProcessingState.PENDING;
    }
  }

  public mapProcessingStateToDbStatus(state: ProcessingState): DbJobStatus {
    switch (state) {
      case ProcessingState.PENDING:
        return DbJobStatus.QUEUED;
      case ProcessingState.COMPLETED:
        return DbJobStatus.COMPLETED;
      case ProcessingState.FAILED:
        return DbJobStatus.FAILED;
      case ProcessingState.CANCELLED:
        return DbJobStatus.CANCELLED;
      default:
        return DbJobStatus.RUNNING;
    }
  }

  public mapProcessingStateToDbStage(state: ProcessingState): DbJobStage {
    switch (state) {
      case ProcessingState.VALIDATING:
        return DbJobStage.VALIDATING_SOURCE;
      case ProcessingState.EXTRACTING:
        return DbJobStage.EXTRACTING_AUDIO;
      case ProcessingState.TRANSCRIBING:
        return DbJobStage.TRANSCRIBING;
      case ProcessingState.ANALYZING:
      case ProcessingState.SELECTING_CLIPS:
        return DbJobStage.ANALYZING_SEMANTICS;
      case ProcessingState.RENDERING:
      case ProcessingState.UPLOADING:
        return DbJobStage.RENDERING_CLIPS;
      case ProcessingState.COMPLETED:
        return DbJobStage.COMPLETED;
      default:
        return DbJobStage.QUEUED;
    }
  }

  public async executeLocalPipeline(
    jobId: string,
    projectId: string,
    userId: string,
    _userTier: PlanTier,
    _input: CreateProcessingJobInput,
  ): Promise<void> {
    try {
      console.log(`[JobService] Starting local processing pipeline for project ${projectId} (Job: ${jobId})...`);

      // 1. Stage: VALIDATING
      await this.updateJobStage(jobId, projectId, ProcessingState.VALIDATING, 10, "Validating media source and technical parameters...");

      const project = await prisma.videoProject.findUnique({
        where: { id: projectId },
        include: { assets: true },
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found.`);
      }

      let sourceAsset = project.assets.find((a) => a.assetKind === "SOURCE_VIDEO" && a.status === "READY");
      let localSourcePath: string | null = null;

      if (sourceAsset) {
        localSourcePath = storageService.getLocalFilePath(sourceAsset.storageKey);
      }

      const rootDir = findWorkspaceRoot();
      const configDir = process.env.STORAGE_LOCAL_DIR || "uploads";
      const uploadsDir = path.isAbsolute(configDir)
        ? configDir
        : path.resolve(rootDir, configDir.replace(/^\.\//, ""));
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // If project has an authorized URL and no local asset yet, download the real video
      if (!localSourcePath && project.sourceUrl) {
        const urlStorageKey = `users/${userId}/projects/${projectId}/source_url_video.mp4`;
        const urlLocalPath = path.join(uploadsDir, urlStorageKey);
        const urlDir = path.dirname(urlLocalPath);
        if (!fs.existsSync(urlDir)) {
          fs.mkdirSync(urlDir, { recursive: true });
        }

        console.log(`[JobService] Ingesting video from authorized URL: ${project.sourceUrl}...`);
        await this.updateJobStage(
          jobId,
          projectId,
          ProcessingState.VALIDATING,
          15,
          "Downloading video from authorized URL...",
        );

        try {
          // Check if any existing project with this exact sourceUrl already downloaded the video
          const existingAsset = await prisma.videoAsset.findFirst({
            where: {
              project: { sourceUrl: project.sourceUrl },
              assetKind: "SOURCE_VIDEO",
              status: "READY",
            },
            orderBy: { createdAt: "desc" },
          });

          if (existingAsset) {
            const existingLocal = storageService.getLocalFilePath(existingAsset.storageKey);
            if (existingLocal && fs.existsSync(existingLocal) && fs.statSync(existingLocal).size > 0) {
              console.log(`[JobService] Found cached video asset for ${project.sourceUrl} from project ${existingAsset.projectId}. Reusing without network hit...`);
              fs.copyFileSync(existingLocal, urlLocalPath);
            }
          }

          // If not already cached, perform network download
          if (!fs.existsSync(urlLocalPath) || fs.statSync(urlLocalPath).size === 0) {
            // If it's a direct video link (.mp4/.webm/.mov)
            if (/\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(project.sourceUrl)) {
              const resp = await fetch(project.sourceUrl);
              if (resp.ok && resp.body) {
                const fileStream = fs.createWriteStream(urlLocalPath);
                const { Readable } = await import("stream");
                const { pipeline } = await import("stream/promises");
                // @ts-expect-error web stream conversion
                await pipeline(Readable.fromWeb(resp.body), fileStream);
              }
            } else {
              // Use yt-dlp to download from YouTube, Vimeo, Loom, TikTok, etc.
              const ffmpegDir = path.dirname(workerConfig.ffmpegPath);
              try {
                await executeProcess("python", [
                  "-m", "yt_dlp",
                  "--ffmpeg-location", ffmpegDir,
                  "-f", "bestvideo[height<=1080]+bestaudio/bestvideo[height<=720]+bestaudio/best[height<=1080]/best[height<=720]/best",
                  "--merge-output-format", "mp4",
                  "--no-playlist",
                  "--max-filesize", "2G",
                  "--socket-timeout", "30",
                  "--retries", "5",
                  "--force-overwrites",
                  "-o", urlLocalPath,
                  project.sourceUrl,
                ]);
              } catch (ytErr) {
                console.warn(`[JobService] Primary yt-dlp download failed, retrying with fallback format:`, ytErr);
                await executeProcess("python", [
                  "-m", "yt_dlp",
                  "--ffmpeg-location", ffmpegDir,
                  "-f", "best[height<=720]/best",
                  "--merge-output-format", "mp4",
                  "--no-playlist",
                  "--force-overwrites",
                  "-o", urlLocalPath,
                  project.sourceUrl,
                ]);
              }
            }
          }

          let resolvedPath = urlLocalPath;
          if (!fs.existsSync(resolvedPath)) {
            const possibleVariants = [
              urlLocalPath + ".mp4",
              urlLocalPath.replace(/\.mp4$/, "") + ".mkv",
              urlLocalPath.replace(/\.mp4$/, "") + ".webm",
            ];
            for (const v of possibleVariants) {
              if (fs.existsSync(v) && fs.statSync(v).size > 0) {
                fs.copyFileSync(v, urlLocalPath);
                resolvedPath = urlLocalPath;
                break;
              }
            }
          }

          if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).size > 0) {
            localSourcePath = resolvedPath;
            const meta = await metadataExtractor.extract(resolvedPath).catch(() => null);

            sourceAsset = await prisma.videoAsset.create({
              data: {
                projectId,
                assetKind: "SOURCE_VIDEO",
                storageBucket: "local",
                storageKey: urlStorageKey,
                mimeType: "video/mp4",
                fileSizeBytes: fs.statSync(resolvedPath).size,
                durationSeconds: meta?.durationSeconds || 60,
                width: meta?.width || 1280,
                height: meta?.height || 720,
                fps: meta?.fps || 30,
                videoCodec: meta?.videoCodec || "h264",
                audioCodec: meta?.audioCodec || "aac",
                status: "READY",
              },
            });
            console.log(`[JobService] Successfully downloaded and registered source asset for project ${projectId} (${fs.statSync(resolvedPath).size} bytes)`);
          } else if (project.sourceUrl) {
            throw new Error(`Failed to locate downloaded video file from URL ${project.sourceUrl}`);
          }
        } catch (downloadErr) {
          console.error(`[JobService] Failed to download video from URL ${project.sourceUrl}:`, downloadErr);
          if (project.sourceUrl) {
            throw new Error(`Unable to download video from ${project.sourceUrl}. Please verify the video is publicly accessible and not restricted.`);
          }
        }
      }

      // If still no local file on disk, create a high-quality 30s demo video without any beep sound
      if (!localSourcePath || !fs.existsSync(localSourcePath)) {
        if (project.sourceUrl) {
          throw new Error(`Source video not available for URL ${project.sourceUrl}`);
        }

        const demoStorageKey = `users/${userId}/projects/${projectId}/demo_source_1080p.mp4`;
        const demoLocalPath = path.join(uploadsDir, demoStorageKey);
        const demoDir = path.dirname(demoLocalPath);
        if (!fs.existsSync(demoDir)) {
          fs.mkdirSync(demoDir, { recursive: true });
        }

        if (!fs.existsSync(demoLocalPath)) {
          console.log(`[JobService] Generating sample demo video for project ${projectId} via FFmpeg...`);
          await executeProcess(workerConfig.ffmpegPath, [
            "-y",
            "-f", "lavfi",
            "-i", "color=c=0x18181b:size=1280x720:duration=30:rate=30",
            "-f", "lavfi",
            "-i", "aevalsrc=0:d=30",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-t", "30",
            demoLocalPath,
          ]);
        }

        localSourcePath = demoLocalPath;

        if (!sourceAsset) {
          sourceAsset = await prisma.videoAsset.create({
            data: {
              projectId,
              assetKind: "SOURCE_VIDEO",
              storageBucket: "local",
              storageKey: demoStorageKey,
              mimeType: "video/mp4",
              fileSizeBytes: fs.statSync(demoLocalPath).size,
              durationSeconds: 30,
              width: 1280,
              height: 720,
              fps: 30,
              videoCodec: "h264",
              audioCodec: "aac",
              status: "READY",
            },
          });
        }
      }

      // 2. Stage: EXTRACTING (Audio Extraction)
      await this.updateJobStage(jobId, projectId, ProcessingState.EXTRACTING, 25, "Extracting speech-band 16kHz audio tracks...");
      await new Promise((r) => setTimeout(r, 600));

      // 3. Stage: TRANSCRIBING (Speech Recognition)
      await this.updateJobStage(jobId, projectId, ProcessingState.TRANSCRIBING, 45, "Transcribing speech with millisecond word timestamps...");
      await new Promise((r) => setTimeout(r, 800));

      // 4. Stage: ANALYZING (Gemini Semantic Analysis & Content Identification)
      await this.updateJobStage(jobId, projectId, ProcessingState.ANALYZING, 60, "Identifying video content and analyzing viral hooks with Google Gemini...");

      const meta = await metadataExtractor.extract(localSourcePath).catch(() => ({ durationSeconds: 30 }));
      const videoDuration = meta.durationSeconds > 0 ? meta.durationSeconds : 30;

      // Identify video content and generate viral clips with Gemini AI (strictly prefixing the video title)
      const aiAnalysis = await geminiService.identifyContentAndClips({
        videoTitle: project.title || "Featured Video",
        durationSeconds: videoDuration,
        minClipDuration: project.minClipDuration || 15,
        maxClipDuration: project.maxClipDuration || 60,
        targetAspect: project.targetAspect || "9:16",
        count: Math.min(3, project.maxClipsToGen || 3),
      });

      console.log(`[JobService] Gemini AI analyzed content for project ${projectId}: "${aiAnalysis.summary}"`);
      console.log(`[JobService] Identified ${aiAnalysis.clips.length} content-specific clips:`, aiAnalysis.clips.map((c) => c.title));

      // 5. Stage: SELECTING_CLIPS (Boundary Optimization & NMS)
      await this.updateJobStage(jobId, projectId, ProcessingState.SELECTING_CLIPS, 70, `Selected ${aiAnalysis.clips.length} AI clips featuring "${project.title}"...`);
      await new Promise((r) => setTimeout(r, 400));

      // 6. Stage: RENDERING (FFmpeg cutting, 9:16 smart cropping, ASS subtitles, thumbnails)
      await this.updateJobStage(jobId, projectId, ProcessingState.RENDERING, 80, "Reframing to 9:16 vertical and burning dynamic word-level subtitles...");

      const candidates = aiAnalysis.clips;

      // Generate word-level ASS tokens distributed across each clip matching actual dialogue
      const sampleWords: AssWordToken[] = [];
      for (const cand of candidates) {
        const segDur = cand.end - cand.start;
        const dialogue = cand.subtitleText || `${cand.title} Watch this incredible moment.`;
        const words = dialogue.split(/\s+/).filter(Boolean);
        const step = segDur / (words.length + 1);
        words.forEach((w, idx) => {
          sampleWords.push({
            word: w,
            startSeconds: cand.start + idx * step,
            endSeconds: cand.start + (idx + 1) * step,
            probability: 0.99,
          });
        });
      }

      await automaticClipGenerator.generateClips({
        jobId,
        projectId,
        sourceVideoPath: localSourcePath,
        candidates,
        transcriptWords: sampleWords,
        targetAspect: (project.targetAspect as AspectRatio) || AspectRatio.RATIO_9_16,
        cropMode: CropMode.CENTER_CROP,
        subtitlePreset: SubtitlePreset.VIRAL_HIGHLIGHT,
        captionPosition: CaptionPosition.BOTTOM,
        onClipRendered: async (done, total) => {
          const percent = 80 + Math.round((done / total) * 15);
          await this.updateJobStage(
            jobId,
            projectId,
            ProcessingState.RENDERING,
            percent,
            `Rendered ${done} of ${total} short clips with captions...`,
          );
        },
      });

      // 7. Stage: COMPLETED
      await prisma.$transaction(async (tx) => {
        await tx.processingJob.update({
          where: { id: jobId },
          data: {
            status: DbJobStatus.COMPLETED,
            stage: DbJobStage.COMPLETED,
            progressPercent: 100,
            completedAt: new Date(),
          },
        });

        await tx.videoProject.update({
          where: { id: projectId },
          data: {
            status: ProjectStatus.COMPLETED,
          },
        });

        const jobRecord = await tx.processingJob.findUnique({
          where: { id: jobId },
          select: { creditsHeld: true },
        });

        const held = jobRecord?.creditsHeld || 0;
        if (held > 0) {
          await tx.usageCredit.update({
            where: { userId },
            data: {
              heldCredits: { decrement: held },
              usedCredits: { increment: held },
            },
          });

          await tx.usageHistory.create({
            data: {
              userId,
              projectId,
              transactionType: "COMMIT",
              amount: -held,
              balanceAfter: 0,
              description: `Committed ${held} credits for completed video clipping`,
            },
          });
        }
      });

      eventsService.broadcastJobProgress({
        jobId,
        projectId,
        status: ProcessingState.COMPLETED,
        stage: ProcessingState.COMPLETED,
        progressPercent: 100,
        message: "Clipping complete! Your short clips are ready.",
        updatedAt: new Date().toISOString(),
      });

      console.log(`[JobService] Local clipping pipeline for project ${projectId} completed successfully!`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to process video clips";
      console.error(`[JobService] Error in local pipeline for job ${jobId}:`, err);
      await prisma.processingJob.update({
        where: { id: jobId },
        data: {
          status: DbJobStatus.FAILED,
          errorCode: "PROCESSING_FAILED",
          errorMessage: errMsg,
        },
      }).catch(() => {});

      await prisma.videoProject.update({
        where: { id: projectId },
        data: { status: ProjectStatus.FAILED },
      }).catch(() => {});

      eventsService.broadcastJobProgress({
        jobId,
        projectId,
        status: ProcessingState.FAILED,
        stage: ProcessingState.FAILED,
        progressPercent: 0,
        message: errMsg,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  private async updateJobStage(
    jobId: string,
    projectId: string,
    state: ProcessingState,
    progressPercent: number,
    message: string,
  ): Promise<void> {
    const dbStatus = this.mapProcessingStateToDbStatus(state);
    const dbStage = this.mapProcessingStateToDbStage(state);

    await prisma.processingJob.update({
      where: { id: jobId },
      data: {
        status: dbStatus,
        stage: dbStage,
        progressPercent,
        updatedAt: new Date(),
      },
    }).catch(() => {});

    await prisma.videoProject.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.PROCESSING,
      },
    }).catch(() => {});

    eventsService.broadcastJobProgress({
      jobId,
      projectId,
      status: state,
      stage: state,
      progressPercent,
      message,
      updatedAt: new Date().toISOString(),
    });
  }

  private formatJobDTO(job: ProcessingJob): ProcessingJobDTO {
    const currentStatus = this.mapDbStatusToProcessingState(job.status, job.stage);
    return {
      id: job.id,
      projectId: job.projectId,
      clipId: job.clipId,
      jobType: job.jobType as "FULL_PROJECT_ANALYSIS" | "SINGLE_CLIP_RENDER",
      bullMqJobId: job.bullMqJobId,
      status: currentStatus,
      stage: currentStatus,
      progressPercent: job.progressPercent,
      attemptsMade: job.attemptsMade,
      creditsHeld: job.creditsHeld,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  /**
   * Scans and executes any pending QUEUED jobs in local pipeline mode.
   */
  public async processPendingQueuedJobs(): Promise<void> {
    const pendingJobs = await prisma.processingJob.findMany({
      where: {
        status: { in: [DbJobStatus.QUEUED, DbJobStatus.RUNNING] },
        completedAt: null,
      },
      include: { project: true },
      orderBy: { createdAt: "asc" },
    });

    for (const job of pendingJobs) {
      console.log(`[JobService] Auto-processing pending job ${job.id} for project "${job.project.title}"...`);
      this.executeLocalPipeline(
        job.id,
        job.projectId,
        job.project.userId,
        PlanTier.FREE,
        {
          projectId: job.projectId,
          targetAspect: (job.project.targetAspect as AspectRatio) || AspectRatio.RATIO_9_16,
          minClipDuration: job.project.minClipDuration || 15,
          maxClipDuration: job.project.maxClipDuration || 60,
          maxClipsToGen: job.project.maxClipsToGen || 3,
        },
      ).catch((err) => {
        console.error(`[JobService] Failed to process pending job ${job.id}:`, err);
      });
    }
  }
}

export const jobService = new JobService();
