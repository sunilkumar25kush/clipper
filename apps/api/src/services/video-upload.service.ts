import crypto from "node:crypto";
import { Readable } from "node:stream";
import { prisma, VideoProject, VideoAsset } from "@clipforge/database";
import { AppError } from "../middlewares/error.js";
import {
  AssetKind,
  AssetStatus,
  ProjectStatus,
  AspectRatio,
  PlanTier,
  InitiateUploadResponse,
  CompleteUploadResponse,
  VideoProjectDTO,
  VideoAssetDTO,
} from "@clipforge/shared-types";
import { InitiateUploadInput, CompleteUploadInput } from "@clipforge/validation";
import { storageService } from "./storage.service.js";

const TIER_SIZE_LIMITS: Record<PlanTier, number> = {
  [PlanTier.FREE]: 500 * 1024 * 1024, // 500 MB
  [PlanTier.STARTER]: 2 * 1024 * 1024 * 1024, // 2 GB
  [PlanTier.PRO]: 5 * 1024 * 1024 * 1024, // 5 GB
  [PlanTier.BUSINESS]: 10 * 1024 * 1024 * 1024, // 10 GB
};

const TIER_RETENTION_DAYS: Record<PlanTier, number> = {
  [PlanTier.FREE]: 7,
  [PlanTier.STARTER]: 30,
  [PlanTier.PRO]: 90,
  [PlanTier.BUSINESS]: 365,
};

const ALLOWED_MIME_EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
};

export class VideoUploadService {
  /**
   * Initiates video upload by validating file size limits according to tier,
   * creating draft project & asset records, and generating signed upload URLs.
   */
  public async initiateUpload(
    userId: string,
    input: InitiateUploadInput,
  ): Promise<InitiateUploadResponse> {
    // 1. Fetch user subscription to determine tier limits
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { planTier: true, status: true },
    });

    const userTier = (subscription?.planTier as PlanTier) || PlanTier.FREE;
    const maxAllowedBytes = TIER_SIZE_LIMITS[userTier];

    if (input.fileSizeBytes > maxAllowedBytes) {
      const maxMb = Math.round(maxAllowedBytes / (1024 * 1024));
      throw new AppError(
        400,
        "FILE_TOO_LARGE",
        `File size (${Math.round(input.fileSizeBytes / (1024 * 1024))} MB) exceeds the ${maxMb} MB limit for your ${userTier} plan. Please upgrade to upload larger files.`,
      );
    }

    // 2. Validate format extension
    const ext = ALLOWED_MIME_EXTENSIONS[input.mimeType];
    if (!ext) {
      throw new AppError(
        400,
        "INVALID_FORMAT",
        "Invalid or unsupported video format. Only MP4, MOV, and WebM are permitted.",
      );
    }

    // 3. Generate sanitized IDs & storage key (no path traversal)
    const projectId = crypto.randomUUID();
    const assetId = crypto.randomUUID();
    const sanitizedTitle = (input.title || input.filename.replace(/\.[^/.]+$/, "")).trim().slice(0, 255);
    const storageKey = `users/${userId}/projects/${projectId}/${assetId}.${ext}`;

    // 4. Calculate retention expiration
    const retentionDays = TIER_RETENTION_DAYS[userTier];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);

    // 5. Database transaction: create VideoProject and VideoAsset
    await prisma.$transaction(async (tx) => {
      await tx.videoProject.create({
        data: {
          id: projectId,
          userId,
          title: sanitizedTitle,
          sourceType: "FILE_UPLOAD",
          rightsAttested: input.rightsAttested,
          status: ProjectStatus.DRAFT,
          targetAspect: input.targetAspect,
          minClipDuration: input.minClipDuration,
          maxClipDuration: input.maxClipDuration,
          maxClipsToGen: input.maxClipsToGen,
          generationMode: (input.generationMode as any) || "HIGHLIGHTS",
          customInstructions: input.customInstructions || null,
          expiresAt,
        },
      });

      await tx.videoAsset.create({
        data: {
          id: assetId,
          projectId,
          assetKind: AssetKind.SOURCE_VIDEO,
          storageBucket: storageService.getBucketName(),
          storageKey,
          mimeType: input.mimeType,
          fileSizeBytes: BigInt(input.fileSizeBytes),
          status: AssetStatus.UPLOADING,
        },
      });
    });

    // 6. Generate presigned URL
    const presigned = await storageService.getUploadPresignedUrl(
      {
        storageKey,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
      },
      assetId,
    );

    return {
      projectId,
      assetId,
      storageKey,
      uploadUrl: presigned.uploadUrl,
      isDirectEndpoint: presigned.isDirectEndpoint,
      expiresInSeconds: 900,
      headers: presigned.headers,
    };
  }

  /**
   * Directly streams uploaded video bytes to local storage in dev/test mode.
   */
  public async handleDirectStream(
    userId: string,
    assetId: string,
    stream: Readable,
  ): Promise<{ assetId: string; bytesWritten: number }> {
    const asset = await prisma.videoAsset.findUnique({
      where: { id: assetId },
      include: { project: { select: { userId: true } } },
    });

    if (!asset || asset.project.userId !== userId) {
      throw new AppError(403, "FORBIDDEN", "Asset not found or access denied.");
    }

    if (asset.status !== AssetStatus.UPLOADING) {
      throw new AppError(400, "INVALID_STATE", `Asset cannot accept uploads in ${asset.status} state.`);
    }

    const bytesWritten = await storageService.saveLocalStream(asset.storageKey, stream);

    return {
      assetId,
      bytesWritten,
    };
  }

  /**
   * Completes the upload flow: verifies file existence in storage,
   * attaches technical metadata (dimensions, duration), and transitions status to UPLOADED.
   */
  public async completeUpload(
    userId: string,
    input: CompleteUploadInput,
  ): Promise<CompleteUploadResponse> {
    const asset = await prisma.videoAsset.findUnique({
      where: { id: input.assetId },
      include: { project: true },
    });

    if (!asset || asset.projectId !== input.projectId || asset.project.userId !== userId) {
      throw new AppError(403, "FORBIDDEN", "Video asset or project not found, or you do not have permission.");
    }

    if (asset.status === AssetStatus.READY || asset.status === AssetStatus.UPLOADED) {
      // Already completed (idempotent)
      return {
        project: this.formatProjectDTO(asset.project),
        asset: this.formatAssetDTO(asset),
      };
    }

    // Verify storage object existence
    const head = await storageService.headObject(asset.storageKey);
    if (!head.exists) {
      throw new AppError(400, "FILE_MISSING", "Uploaded media file was not detected in storage. Please retry the upload.");
    }

    // Atomic update
    const [updatedProject, updatedAsset] = await prisma.$transaction([
      prisma.videoProject.update({
        where: { id: input.projectId },
        data: {
          status: ProjectStatus.UPLOADED,
        },
      }),
      prisma.videoAsset.update({
        where: { id: input.assetId },
        data: {
          status: AssetStatus.UPLOADED,
          durationSeconds: input.durationSeconds ?? null,
          width: input.width ?? null,
          height: input.height ?? null,
          fps: input.fps ?? null,
          videoCodec: input.videoCodec ?? null,
          audioCodec: input.audioCodec ?? null,
        },
      }),
    ]);

    return {
      project: this.formatProjectDTO(updatedProject),
      asset: this.formatAssetDTO(updatedAsset),
    };
  }

  /**
   * Retrieves upload status for progress checking or polling.
   */
  public async getUploadStatus(
    userId: string,
    projectId: string,
    assetId: string,
  ): Promise<{ project: VideoProjectDTO; asset: VideoAssetDTO }> {
    const asset = await prisma.videoAsset.findUnique({
      where: { id: assetId },
      include: { project: true },
    });

    if (!asset || asset.projectId !== projectId || asset.project.userId !== userId) {
      throw new AppError(404, "NOT_FOUND", "Asset or project not found.");
    }

    return {
      project: this.formatProjectDTO(asset.project),
      asset: this.formatAssetDTO(asset),
    };
  }

  private formatProjectDTO(project: VideoProject): VideoProjectDTO {
    return {
      id: project.id,
      userId: project.userId,
      title: project.title,
      sourceType: project.sourceType,
      sourceUrl: project.sourceUrl,
      status: project.status as unknown as ProjectStatus,
      targetAspect: project.targetAspect as unknown as AspectRatio,
      minClipDuration: project.minClipDuration,
      maxClipDuration: project.maxClipDuration,
      maxClipsToGen: project.maxClipsToGen,
      generationMode: project.generationMode as any,
      customInstructions: project.customInstructions,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  private formatAssetDTO(asset: VideoAsset): VideoAssetDTO {
    return {
      id: asset.id,
      projectId: asset.projectId,
      assetKind: asset.assetKind as unknown as AssetKind,
      storageBucket: asset.storageBucket,
      storageKey: asset.storageKey,
      uploadId: asset.uploadId,
      mimeType: asset.mimeType,
      fileSizeBytes: Number(asset.fileSizeBytes),
      durationSeconds: asset.durationSeconds,
      width: asset.width,
      height: asset.height,
      fps: asset.fps,
      videoCodec: asset.videoCodec,
      audioCodec: asset.audioCodec,
      status: asset.status as unknown as AssetStatus,
      createdAt: asset.createdAt.toISOString(),
    };
  }
}

export const videoUploadService = new VideoUploadService();
