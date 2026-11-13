import crypto from "node:crypto";
import { prisma, ProcessingJob } from "@clipforge/database";
import {
  ProcessingState,
  ProcessingJobDTO,
  PlanTier,
  ProjectStatus,
  JobStatus as DbJobStatus,
  JobStage as DbJobStage,
} from "@clipforge/shared-types";
import { CreateProcessingJobInput } from "@clipforge/validation";
import { AppError } from "../middlewares/error.js";
import { queueService } from "./queue.service.js";
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

    // 2. Verify project has a valid source asset
    if (project.status === ProjectStatus.DRAFT) {
      const asset = await prisma.videoAsset.findFirst({
        where: { projectId: project.id },
      });
      if (!asset) {
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

    // 6. Enqueue into BullMQ
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
