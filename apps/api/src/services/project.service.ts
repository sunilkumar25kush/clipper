import {
  prisma,
  JobType,
  JobStatus as DbJobStatus,
  JobStage as DbJobStage,
  ClipStatus as DbClipStatus,
  ProjectStatus as DbProjectStatus,
  AspectRatio as DbAspectRatio,
  ClipCategory as DbClipCategory,
  CaptionPosition as DbCaptionPosition,
} from "@clipforge/database";
import {
  CreateProjectInput,
  UpdateClipInput,
} from "@clipforge/validation";
import {
  DashboardMetricsDTO,
  VideoProjectDTO,
  ProjectDetailDTO,
  ClipDTO,
  ClipDetailDTO,
  VideoAssetDTO,
  AssetKind,
  AssetStatus,
  PlanTier,
  ProjectStatus,
  JobStatus,
  AspectRatio,
  CropMode,
  ClipCategory,
  JobStage,
} from "@clipforge/shared-types";
import { AppError } from "../middlewares/error.js";
import { queueService } from "./queue.service.js";

type ClipWithRelations = {
  id: string;
  projectId: string;
  project?: { title: string } | null;
  rankOrder: number;
  partNumber?: number | null;
  title: string;
  description: string;
  category: unknown;
  selectionReason: string;
  startTime: number;
  endTime: number;
  duration: number;
  aspectRatio: unknown;
  cropMode: unknown;
  thumbnailKey: string | null;
  createdAt: Date;
  score?: {
    id: string;
    clipId: string;
    hookScore: number;
    engagementScore: number;
    contextScore: number;
    overallScore: number;
    confidence: number;
    scoringBreakdownJson?: unknown;
  } | null;
  caption?: {
    id: string;
    clipId: string;
    presetId: string;
    fontFamily: string;
    fontSize: number;
    primaryColorHex: string;
    highlightColorHex: string;
    strokeColorHex: string;
    strokeWidth: number;
    position: string;
    wordsPerLine: number;
    captionsJson: unknown;
  } | null;
  exports?: Array<{
    id: string;
    clipId: string;
    storageBucket: string;
    storageKey: string;
    resolution: string;
    aspectRatio: unknown;
    hasWatermark: boolean;
    fileSizeBytes: bigint | number | null;
    status: string;
    createdAt: Date;
  }>;
};

export class ProjectService {
  async getDashboardMetrics(userId: string): Promise<DashboardMetricsDTO> {
    const [
      totalProjects,
      generatedClips,
      processingVideos,
      userWithCreditAndSub,
      recentProjectsRaw,
      recentClipsRaw,
    ] = await Promise.all([
      prisma.videoProject.count({
        where: { userId, deletedAt: null },
      }),
      prisma.clip.count({
        where: { project: { userId }, isDeleted: false },
      }),
      prisma.processingJob.count({
        where: {
          project: { userId },
          status: { in: [DbJobStatus.QUEUED, DbJobStatus.RUNNING] },
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        include: {
          subscription: true,
          usageCredit: true,
        },
      }),
      prisma.videoProject.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          _count: { select: { clips: { where: { isDeleted: false } } } },
          jobs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { progressPercent: true, stage: true, status: true },
          },
        },
      }),
      prisma.clip.findMany({
        where: { project: { userId }, isDeleted: false },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: {
          score: true,
          project: { select: { title: true } },
        },
      }),
    ]);

    if (!userWithCreditAndSub) {
      throw new AppError(404, "USER_NOT_FOUND", "User record not found");
    }

    const availableCredits = userWithCreditAndSub.usageCredit
      ? Math.max(
          0,
          userWithCreditAndSub.usageCredit.totalAllocated +
            userWithCreditAndSub.usageCredit.bonusCredits -
            userWithCreditAndSub.usageCredit.usedCredits -
            userWithCreditAndSub.usageCredit.heldCredits,
        )
      : 0;

    const totalAllocatedCredits = userWithCreditAndSub.usageCredit?.totalAllocated ?? 60;
    const planTier = (userWithCreditAndSub.subscription?.planTier as unknown as PlanTier) ?? PlanTier.FREE;

    const recentProjects: VideoProjectDTO[] = recentProjectsRaw.map((p) => ({
      id: p.id,
      userId: p.userId,
      title: p.title,
      sourceType: p.sourceType as "FILE_UPLOAD" | "AUTHORIZED_URL",
      sourceUrl: p.sourceUrl,
      status: p.status as unknown as ProjectStatus,
      targetAspect: p.targetAspect as unknown as AspectRatio,
      minClipDuration: p.minClipDuration,
      maxClipDuration: p.maxClipDuration,
      maxClipsToGen: p.maxClipsToGen,
      generationMode: p.generationMode as any,
      customInstructions: p.customInstructions,
      clipCount: p._count.clips,
      activeJobProgress: p.jobs[0]?.progressPercent ?? null,
      activeJobStage: (p.jobs[0]?.stage as unknown as JobStage) ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    const recentClips: ClipDTO[] = recentClipsRaw.map((c) => ({
      id: c.id,
      projectId: c.projectId,
      projectTitle: c.project?.title,
      rankOrder: c.rankOrder,
      partNumber: c.partNumber,
      title: c.title,
      description: c.description,
      category: c.category as unknown as ClipCategory,
      selectionReason: c.selectionReason,
      startTime: c.startTime,
      endTime: c.endTime,
      duration: c.duration,
      aspectRatio: c.aspectRatio as unknown as AspectRatio,
      cropMode: c.cropMode as unknown as CropMode,
      thumbnailKey: c.thumbnailKey,
      overallScore: c.score?.overallScore,
      hookScore: c.score?.hookScore,
      engagementScore: c.score?.engagementScore,
      createdAt: c.createdAt.toISOString(),
    }));

    return {
      totalProjects,
      generatedClips,
      processingVideos,
      availableCredits,
      totalAllocatedCredits,
      planTier,
      recentProjects,
      recentClips,
    };
  }

  async getProjects(
    userId: string,
    query: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
    },
  ): Promise<{
    projects: VideoProjectDTO[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12));
    const skip = (page - 1) * limit;

    const whereClause: {
      userId: string;
      deletedAt: null;
      status?: DbProjectStatus;
      title?: { contains: string; mode: "insensitive" };
    } = {
      userId,
      deletedAt: null,
    };

    if (query.status && query.status in DbProjectStatus) {
      whereClause.status = query.status as DbProjectStatus;
    }

    if (query.search && query.search.trim()) {
      whereClause.title = {
        contains: query.search.trim(),
        mode: "insensitive",
      };
    }

    const [total, rawProjects] = await Promise.all([
      prisma.videoProject.count({ where: whereClause }),
      prisma.videoProject.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          _count: { select: { clips: { where: { isDeleted: false } } } },
          jobs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { progressPercent: true, stage: true, status: true },
          },
        },
      }),
    ]);

    const projects: VideoProjectDTO[] = rawProjects.map((p) => ({
      id: p.id,
      userId: p.userId,
      title: p.title,
      sourceType: p.sourceType as "FILE_UPLOAD" | "AUTHORIZED_URL",
      sourceUrl: p.sourceUrl,
      status: p.status as unknown as ProjectStatus,
      targetAspect: p.targetAspect as unknown as AspectRatio,
      minClipDuration: p.minClipDuration,
      maxClipDuration: p.maxClipDuration,
      maxClipsToGen: p.maxClipsToGen,
      generationMode: p.generationMode as any,
      customInstructions: p.customInstructions,
      clipCount: p._count.clips,
      activeJobProgress: p.jobs[0]?.progressPercent ?? null,
      activeJobStage: (p.jobs[0]?.stage as unknown as JobStage) ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    return {
      projects,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async createProject(userId: string, input: CreateProjectInput): Promise<VideoProjectDTO> {
    if (!input.rightsAttested) {
      throw new AppError(403, "RIGHTS_ATTESTATION_REQUIRED", "You must attest rights to the video content");
    }

    // Default expiration: 30 days
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const project = await prisma.videoProject.create({
      data: {
        userId,
        title: input.title.trim(),
        sourceType: input.sourceType,
        sourceUrl: (input as { sourceUrl?: string }).sourceUrl ?? null,
        rightsAttested: true,
        status: DbProjectStatus.DRAFT,
        targetAspect: input.targetAspect as unknown as DbAspectRatio,
        minClipDuration: input.minClipDuration,
        maxClipDuration: input.maxClipDuration,
        maxClipsToGen: input.maxClipsToGen,
        generationMode: (input.generationMode as any) || "HIGHLIGHTS",
        customInstructions: input.customInstructions || null,
        expiresAt,
      },
    });

    return {
      id: project.id,
      userId: project.userId,
      title: project.title,
      sourceType: project.sourceType as "FILE_UPLOAD" | "AUTHORIZED_URL",
      sourceUrl: project.sourceUrl,
      status: project.status as unknown as ProjectStatus,
      targetAspect: project.targetAspect as unknown as AspectRatio,
      minClipDuration: project.minClipDuration,
      maxClipDuration: project.maxClipDuration,
      maxClipsToGen: project.maxClipsToGen,
      generationMode: project.generationMode as any,
      customInstructions: project.customInstructions,
      clipCount: 0,
      activeJobProgress: null,
      activeJobStage: null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  async getProjectById(userId: string, projectId: string): Promise<ProjectDetailDTO> {
    const project = await prisma.videoProject.findFirst({
      where: { id: projectId, userId, deletedAt: null },
      include: {
        assets: true,
        jobs: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        clips: {
          where: { isDeleted: false },
          orderBy: { rankOrder: "asc" },
          include: {
            score: true,
            caption: true,
            exports: true,
          },
        },
      },
    });

    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found or access denied");
    }

    const latestJob = project.jobs[0];

    const assets: VideoAssetDTO[] = project.assets.map((a) => ({
      id: a.id,
      projectId: a.projectId,
      assetKind: a.assetKind as unknown as AssetKind,
      storageBucket: a.storageBucket,
      storageKey: a.storageKey,
      uploadId: a.uploadId,
      mimeType: a.mimeType,
      fileSizeBytes: Number(a.fileSizeBytes),
      durationSeconds: a.durationSeconds,
      width: a.width,
      height: a.height,
      fps: a.fps,
      videoCodec: a.videoCodec,
      audioCodec: a.audioCodec,
      status: a.status as unknown as AssetStatus,
      createdAt: a.createdAt.toISOString(),
    }));

    const jobs = project.jobs.map((j) => ({
      id: j.id,
      jobType: j.jobType,
      status: j.status as unknown as JobStatus,
      stage: j.stage as unknown as JobStage,
      progressPercent: j.progressPercent,
      errorMessage: j.errorMessage,
      createdAt: j.createdAt.toISOString(),
      completedAt: j.completedAt ? j.completedAt.toISOString() : null,
    }));

    const clips: ClipDetailDTO[] = project.clips.map((c) => this.mapClipDetail(c));

    return {
      id: project.id,
      userId: project.userId,
      title: project.title,
      sourceType: project.sourceType as "FILE_UPLOAD" | "AUTHORIZED_URL",
      sourceUrl: project.sourceUrl,
      status: project.status as unknown as ProjectStatus,
      targetAspect: project.targetAspect as unknown as AspectRatio,
      minClipDuration: project.minClipDuration,
      maxClipDuration: project.maxClipDuration,
      maxClipsToGen: project.maxClipsToGen,
      generationMode: project.generationMode as any,
      customInstructions: project.customInstructions,
      clipCount: project.clips.length,
      activeJobProgress: latestJob ? latestJob.progressPercent : null,
      activeJobStage: latestJob ? (latestJob.stage as unknown as JobStage) : null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      assets,
      jobs,
      clips,
    };
  }

  async getProjectClips(userId: string, projectId: string): Promise<ClipDetailDTO[]> {
    const project = await prisma.videoProject.findFirst({
      where: { id: projectId, userId, deletedAt: null },
      select: { id: true },
    });

    if (!project) {
      throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found or access denied");
    }

    const clips = await prisma.clip.findMany({
      where: { projectId, isDeleted: false },
      orderBy: { rankOrder: "asc" },
      include: {
        score: true,
        caption: true,
        exports: true,
      },
    });

    return clips.map((c) => this.mapClipDetail(c));
  }

  async getClipById(userId: string, clipId: string): Promise<ClipDetailDTO> {
    const clip = await prisma.clip.findFirst({
      where: {
        id: clipId,
        isDeleted: false,
        project: { userId, deletedAt: null },
      },
      include: {
        project: { select: { title: true } },
        score: true,
        caption: true,
        exports: true,
      },
    });

    if (!clip) {
      throw new AppError(404, "CLIP_NOT_FOUND", "Clip not found or access denied");
    }

    return this.mapClipDetail(clip);
  }

  async updateClip(userId: string, clipId: string, input: UpdateClipInput): Promise<ClipDetailDTO> {
    const existing = await prisma.clip.findFirst({
      where: {
        id: clipId,
        isDeleted: false,
        project: { userId, deletedAt: null },
      },
      include: { caption: true },
    });

    if (!existing) {
      throw new AppError(404, "CLIP_NOT_FOUND", "Clip not found or access denied");
    }

    const updateData: Record<string, unknown> = {};
    if (input.title !== undefined) updateData.title = input.title.trim();
    if (input.description !== undefined) updateData.description = input.description.trim();
    if (input.category !== undefined && input.category in DbClipCategory) {
      updateData.category = input.category as DbClipCategory;
    }
    if (input.startTime !== undefined) updateData.startTime = input.startTime;
    if (input.endTime !== undefined) updateData.endTime = input.endTime;
    if (input.startTime !== undefined || input.endTime !== undefined) {
      const start = input.startTime ?? existing.startTime;
      const end = input.endTime ?? existing.endTime;
      if (end <= start) {
        throw new AppError(400, "INVALID_TIMESTAMPS", "End time must be greater than start time");
      }
      updateData.duration = end - start;
    }

    // Update clip caption styling if provided
    const captionUpdate: Record<string, unknown> = {};
    if (input.presetId !== undefined) captionUpdate.presetId = input.presetId;
    if (input.fontSize !== undefined) captionUpdate.fontSize = input.fontSize;
    if (input.position !== undefined) {
      const posMap: Record<string, DbCaptionPosition> = {
        TOP: DbCaptionPosition.TOP_SAFE,
        TOP_SAFE: DbCaptionPosition.TOP_SAFE,
        CENTER: DbCaptionPosition.MIDDLE,
        MIDDLE: DbCaptionPosition.MIDDLE,
        BOTTOM: DbCaptionPosition.BOTTOM_SAFE,
        BOTTOM_SAFE: DbCaptionPosition.BOTTOM_SAFE,
      };
      if (posMap[input.position]) {
        captionUpdate.position = posMap[input.position];
      }
    }
    if (input.primaryColorHex !== undefined) captionUpdate.primaryColorHex = input.primaryColorHex;
    if (input.highlightColorHex !== undefined) captionUpdate.highlightColorHex = input.highlightColorHex;
    if (input.captionsEnabled !== undefined) {
      if (!input.captionsEnabled) {
        captionUpdate.presetId = "none";
      } else if (input.presetId && input.presetId !== "none") {
        captionUpdate.presetId = input.presetId;
      } else if (existing.caption?.presetId === "none") {
        captionUpdate.presetId = "viral-highlight";
      }
    }

    const [updatedClip] = await prisma.$transaction([
      prisma.clip.update({
        where: { id: clipId },
        data: updateData,
        include: {
          project: { select: { title: true } },
          score: true,
          caption: true,
          exports: true,
        },
      }),
      ...(Object.keys(captionUpdate).length > 0 && existing.caption
        ? [
            prisma.clipCaption.update({
              where: { clipId },
              data: captionUpdate,
            }),
          ]
        : []),
    ]);

    return this.mapClipDetail(updatedClip);
  }

  async deleteClip(userId: string, clipId: string): Promise<void> {
    const existing = await prisma.clip.findFirst({
      where: {
        id: clipId,
        project: { userId, deletedAt: null },
      },
    });

    if (!existing) {
      throw new AppError(404, "CLIP_NOT_FOUND", "Clip not found or access denied");
    }

    await prisma.clip.update({
      where: { id: clipId },
      data: { isDeleted: true },
    });
  }

  async regenerateClip(userId: string, clipId: string): Promise<{ jobId: string; clipId: string; status: string }> {
    const clip = await prisma.clip.findFirst({
      where: {
        id: clipId,
        isDeleted: false,
        project: { userId, deletedAt: null },
      },
      include: {
        project: {
          include: {
            user: { include: { subscription: true } },
          },
        },
      },
    });

    if (!clip) {
      throw new AppError(404, "CLIP_NOT_FOUND", "Clip not found or access denied");
    }

    const userTier = (clip.project.user.subscription?.planTier as unknown as PlanTier) ?? PlanTier.FREE;

    // Create a processing job for this single clip render
    const bullMqJobId = `job_${clip.id}_${Date.now()}`;
    const job = await prisma.processingJob.create({
      data: {
        projectId: clip.projectId,
        clipId: clip.id,
        bullMqJobId,
        jobType: JobType.SINGLE_CLIP_RENDER,
        status: DbJobStatus.QUEUED,
        stage: DbJobStage.RENDERING_CLIPS,
        progressPercent: 0,
        creditsHeld: 0,
      },
    });

    await prisma.clip.update({
      where: { id: clipId },
      data: { status: DbClipStatus.RENDERING },
    });

    await queueService.enqueueClipRender({
      jobId: job.id,
      projectId: clip.projectId,
      clipId: clip.id,
      userId,
      userTier,
      targetAspect: clip.aspectRatio,
    });

    return {
      jobId: job.id,
      clipId: clip.id,
      status: "QUEUED",
    };
  }

  private mapClipDetail(c: ClipWithRelations): ClipDetailDTO {
    const primaryExport = c.exports?.find((e) => e.status === "COMPLETED") || c.exports?.[0];
    const storageKey = primaryExport?.storageKey;
    const downloadUrl = storageKey ? `/api/v1/videos/storage/${encodeURIComponent(storageKey)}` : null;
    const videoUrl = downloadUrl;
    const thumbnailUrl = c.thumbnailKey ? `/api/v1/videos/storage/${encodeURIComponent(c.thumbnailKey)}` : null;

    return {
      id: c.id,
      projectId: c.projectId,
      projectTitle: c.project?.title,
      rankOrder: c.rankOrder,
      partNumber: c.partNumber ?? null,
      title: c.title,
      description: c.description,
      category: c.category as unknown as ClipCategory,
      selectionReason: c.selectionReason,
      startTime: c.startTime,
      endTime: c.endTime,
      duration: c.duration,
      aspectRatio: c.aspectRatio as unknown as AspectRatio,
      cropMode: c.cropMode as unknown as CropMode,
      thumbnailKey: c.thumbnailKey,
      thumbnailUrl,
      videoUrl,
      downloadUrl,
      overallScore: c.score?.overallScore,
      hookScore: c.score?.hookScore,
      engagementScore: c.score?.engagementScore,
      contextScore: c.score?.contextScore,
      createdAt: c.createdAt.toISOString(),
      score: c.score
        ? {
            id: c.score.id,
            clipId: c.score.clipId,
            hookScore: c.score.hookScore,
            engagementScore: c.score.engagementScore,
            contextScore: c.score.contextScore,
            overallScore: c.score.overallScore,
            confidence: c.score.confidence,
            scoringBreakdownJson: c.score.scoringBreakdownJson as Record<string, unknown> | null,
          }
        : null,
      caption: c.caption
        ? {
            id: c.caption.id,
            clipId: c.caption.clipId,
            presetId: c.caption.presetId,
            fontFamily: c.caption.fontFamily,
            fontSize: c.caption.fontSize,
            primaryColorHex: c.caption.primaryColorHex,
            highlightColorHex: c.caption.highlightColorHex,
            strokeColorHex: c.caption.strokeColorHex,
            strokeWidth: c.caption.strokeWidth,
            position: c.caption.position === "BOTTOM_SAFE" ? "BOTTOM_SAFE" : (c.caption.position as "TOP" | "CENTER" | "BOTTOM"),
            wordsPerLine: c.caption.wordsPerLine,
            captionsJson: (c.caption.captionsJson as unknown) || [],
          }
        : null,
      exports: (c.exports || []).map((exp) => ({
        id: exp.id,
        clipId: exp.clipId,
        storageBucket: exp.storageBucket,
        storageKey: exp.storageKey,
        resolution: exp.resolution,
        aspectRatio: exp.aspectRatio as unknown as AspectRatio,
        hasWatermark: exp.hasWatermark,
        fileSizeBytes: exp.fileSizeBytes ? Number(exp.fileSizeBytes) : null,
        status: exp.status,
        downloadUrl: `/api/v1/videos/storage/${encodeURIComponent(exp.storageKey)}`,
        createdAt: exp.createdAt.toISOString(),
      })),
    };
  }
}

export const projectService = new ProjectService();
