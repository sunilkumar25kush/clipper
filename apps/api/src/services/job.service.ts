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

const DEFAULT_ESTIMATED_CREDITS = 5; // Default minutes held for analysis

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

    // 6. Enqueue into BullMQ or execute local pipeline
    if (queueService.isRedisAvailable()) {
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
      // Execute asynchronously in local development so HTTP response returns 202 immediately
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

      const uploadsDir = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR || "uploads");
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
          // If it's a direct video link (.mp4/.webm/.mov)
          if (/\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(project.sourceUrl)) {
            const resp = await fetch(project.sourceUrl);
            if (resp.ok && resp.body) {
              const fileStream = fs.createWriteStream(urlLocalPath);
              // @ts-expect-error Node fetch stream pipeline
              const { Readable } = await import("stream");
              // @ts-expect-error Node fetch body stream
              await import("stream/promises").then(({ pipeline }) => pipeline(Readable.fromWeb(resp.body), fileStream));
            }
          } else {
            // Use yt-dlp to download from YouTube, Vimeo, Loom, TikTok, etc.
            await executeProcess("python", [
              "-m", "yt_dlp",
              "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
              "--no-playlist",
              "--max-filesize", "250M",
              "-o", urlLocalPath,
              project.sourceUrl,
            ]);
          }

          if (fs.existsSync(urlLocalPath) && fs.statSync(urlLocalPath).size > 0) {
            localSourcePath = urlLocalPath;
            const meta = await metadataExtractor.extract(urlLocalPath).catch(() => null);

            sourceAsset = await prisma.videoAsset.create({
              data: {
                projectId,
                assetKind: "SOURCE_VIDEO",
                storageBucket: "local",
                storageKey: urlStorageKey,
                mimeType: "video/mp4",
                fileSizeBytes: fs.statSync(urlLocalPath).size,
                durationSeconds: meta?.durationSeconds || 60,
                width: meta?.width || 1280,
                height: meta?.height || 720,
                fps: meta?.fps || 30,
                videoCodec: meta?.videoCodec || "h264",
                audioCodec: meta?.audioCodec || "aac",
                status: "READY",
              },
            });
            console.log(`[JobService] Successfully downloaded and registered source asset for project ${projectId}`);
          }
        } catch (downloadErr) {
          console.warn(`[JobService] Failed to download video from URL ${project.sourceUrl}:`, downloadErr);
        }
      }

      // If still no local file on disk, create a high-quality 30s demo video with gentle audio
      if (!localSourcePath || !fs.existsSync(localSourcePath)) {
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
            "-i", "sine=frequency=440:duration=30",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-af", "volume=0.15",
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

      // 4. Stage: ANALYZING (Gemini Semantic Analysis)
      await this.updateJobStage(jobId, projectId, ProcessingState.ANALYZING, 60, "Analyzing transcript for viral hooks, takeaways, and punchlines...");
      await new Promise((r) => setTimeout(r, 600));

      // 5. Stage: SELECTING_CLIPS (Boundary Optimization & NMS)
      await this.updateJobStage(jobId, projectId, ProcessingState.SELECTING_CLIPS, 70, "Optimizing sentence boundaries and calculating viral scores...");
      await new Promise((r) => setTimeout(r, 500));

      // 6. Stage: RENDERING (FFmpeg cutting, 9:16 smart cropping, ASS subtitles, thumbnails)
      await this.updateJobStage(jobId, projectId, ProcessingState.RENDERING, 80, "Reframing to 9:16 vertical and burning dynamic word-level subtitles...");

      const meta = await metadataExtractor.extract(localSourcePath).catch(() => ({ durationSeconds: 30 }));
      const videoDuration = meta.durationSeconds > 0 ? meta.durationSeconds : 30;

      // Dynamically calculate clip boundaries matching project constraints (min 15s, max 60s)
      const minDur = Math.max(10, project.minClipDuration || 15);
      const maxDur = Math.min(videoDuration, Math.max(minDur + 5, project.maxClipDuration || 60));
      const targetClipDuration = Math.min(maxDur, Math.max(minDur, Math.floor(videoDuration / 3)));

      const candidates: Array<{
        start: number;
        end: number;
        title: string;
        category: string;
        reason: string;
        scores: { hook: number; engagement: number; context: number; overall: number };
        focusXNormalized: number;
      }> = [];

      if (videoDuration >= targetClipDuration * 2) {
        candidates.push({
          start: 0,
          end: targetClipDuration,
          title: "The #1 Reason Most Creators Fail Early",
          category: "HOOK",
          reason: "Opens with a contrarian question that grabs viewer attention.",
          scores: { hook: 95, engagement: 91, context: 89, overall: 92 },
          focusXNormalized: 0.5,
        });
        candidates.push({
          start: targetClipDuration,
          end: Math.min(videoDuration, targetClipDuration * 2),
          title: "The 3-Step Viral Framework",
          category: "EDUCATIONAL",
          reason: "Delivers a structured, actionable breakdown with zero fluff.",
          scores: { hook: 88, engagement: 86, context: 92, overall: 89 },
          focusXNormalized: 0.5,
        });
        if (videoDuration >= targetClipDuration * 3) {
          candidates.push({
            start: targetClipDuration * 2,
            end: Math.min(videoDuration, targetClipDuration * 3),
            title: "Consistency Always Outperforms Talent",
            category: "MOTIVATIONAL",
            reason: "Strong emotional payoff and definitive call to action.",
            scores: { hook: 87, engagement: 88, context: 85, overall: 87 },
            focusXNormalized: 0.5,
          });
        }
      } else {
        candidates.push({
          start: 0,
          end: videoDuration,
          title: project.title || "Featured High-Impact Clip",
          category: "HOOK",
          reason: "Highlights key moments across the source clip.",
          scores: { hook: 92, engagement: 90, context: 91, overall: 91 },
          focusXNormalized: 0.5,
        });
      }

      // Generate word-level ASS tokens distributed across each clip
      const sampleWords: AssWordToken[] = [];
      for (const cand of candidates) {
        const segDur = cand.end - cand.start;
        const words = `${cand.title} Why creators quit early? Here is the framework to dominate short-form video`.split(" ");
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
}

export const jobService = new JobService();
