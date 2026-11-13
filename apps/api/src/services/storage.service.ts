import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config/env.js";

export interface PresignedUploadOptions {
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  expiresInSeconds?: number;
}

export interface PresignedDownloadOptions {
  storageKey: string;
  expiresInSeconds?: number;
}

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

export class StorageService {
  private s3Client: S3Client | null = null;
  private isCloudStorageConfigured = false;
  private localUploadDir: string;

  constructor() {
    const rootDir = findWorkspaceRoot();
    const configDir = config.storage.localUploadDir;
    this.localUploadDir = path.isAbsolute(configDir)
      ? configDir
      : path.resolve(rootDir, configDir.replace(/^\.\//, ""));

    const { accessKeyId, secretAccessKey, endpoint, region, forcePathStyle } = config.storage;

    const hasValidCredentials =
      Boolean(accessKeyId) &&
      Boolean(secretAccessKey) &&
      !accessKeyId.startsWith("replace_with_") &&
      !secretAccessKey.startsWith("replace_with_") &&
      config.storage.provider !== "local";

    if (hasValidCredentials) {
      this.s3Client = new S3Client({
        region: region || "auto",
        endpoint: endpoint || undefined,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        forcePathStyle,
      });
      this.isCloudStorageConfigured = true;
    } else {
      // Ensure local upload dir exists
      if (!fs.existsSync(this.localUploadDir)) {
        fs.mkdirSync(this.localUploadDir, { recursive: true });
      }
    }
  }

  public isCloud(): boolean {
    return this.isCloudStorageConfigured;
  }

  public getBucketName(): string {
    return config.storage.bucketName;
  }

  /**
   * Generates a direct-to-storage presigned PUT URL for Cloudflare R2 / S3,
   * or a local endpoint URL when in local/mock storage mode.
   */
  public async getUploadPresignedUrl(
    options: PresignedUploadOptions,
    assetId: string,
  ): Promise<{ uploadUrl: string; isDirectEndpoint: boolean; headers?: Record<string, string> }> {
    const ttl = options.expiresInSeconds || config.storage.presignedUrlTtlSeconds;

    if (this.isCloudStorageConfigured && this.s3Client) {
      const command = new PutObjectCommand({
        Bucket: config.storage.bucketName,
        Key: options.storageKey,
        ContentType: options.mimeType,
        ContentLength: options.fileSizeBytes,
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: ttl });
      return {
        uploadUrl,
        isDirectEndpoint: false,
        headers: {
          "Content-Type": options.mimeType,
        },
      };
    }

    // Local development fallback: returns direct upload route
    const uploadUrl = `/api/v1/videos/upload/direct/${assetId}`;
    return {
      uploadUrl,
      isDirectEndpoint: true,
      headers: {
        "Content-Type": options.mimeType,
      },
    };
  }

  /**
   * Generates a signed GET URL for video playback / download.
   */
  public async getDownloadPresignedUrl(options: PresignedDownloadOptions): Promise<string> {
    const ttl = options.expiresInSeconds || config.storage.presignedUrlTtlSeconds;

    if (this.isCloudStorageConfigured && this.s3Client) {
      const command = new GetObjectCommand({
        Bucket: config.storage.bucketName,
        Key: options.storageKey,
      });
      return await getSignedUrl(this.s3Client, command, { expiresIn: ttl });
    }

    // Local storage path URL
    return `/api/v1/videos/storage/${encodeURIComponent(options.storageKey)}`;
  }

  /**
   * Resolves safe absolute path for local files with directory traversal protection.
   */
  public getLocalFilePath(storageKey: string): string | null {
    let rawKey = storageKey;
    try {
      rawKey = decodeURIComponent(storageKey);
    } catch {}
    const safeKey = path.normalize(rawKey).replace(/^(\.\.(\/|\\|$))+/, "");

    const candidates = [
      path.join(this.localUploadDir, safeKey),
      path.resolve(findWorkspaceRoot(), "uploads", safeKey),
      path.resolve(process.cwd(), "uploads", safeKey),
      path.resolve(process.cwd(), "../../uploads", safeKey),
      path.resolve(process.cwd(), "../../services/video-worker/uploads", safeKey),
      path.resolve(findWorkspaceRoot(), "services/video-worker/uploads", safeKey),
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c;
      }
    }

    return null;
  }

  /**
   * Saves a readable stream directly to local storage without buffering in RAM.
   */
  public async saveLocalStream(storageKey: string, stream: Readable): Promise<number> {
    // Sanitize storageKey against directory traversal
    const safeKey = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, "");
    const destinationPath = path.join(this.localUploadDir, safeKey);
    const destinationDir = path.dirname(destinationPath);

    if (!destinationPath.startsWith(this.localUploadDir)) {
      throw new Error("Invalid storage path: directory traversal attempt detected");
    }

    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(destinationPath);
    await pipeline(stream, writeStream);

    const stats = await fs.promises.stat(destinationPath);
    return stats.size;
  }

  /**
   * Checks whether the object exists in storage and returns its byte size.
   */
  public async headObject(storageKey: string): Promise<{ exists: boolean; sizeBytes?: number }> {
    if (this.isCloudStorageConfigured && this.s3Client) {
      try {
        const res = await this.s3Client.send(
          new HeadObjectCommand({
            Bucket: config.storage.bucketName,
            Key: storageKey,
          }),
        );
        return {
          exists: true,
          sizeBytes: res.ContentLength,
        };
      } catch {
        return { exists: false };
      }
    }

    const safeKey = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, "");
    const localPath = path.join(this.localUploadDir, safeKey);
    try {
      const stats = await fs.promises.stat(localPath);
      return { exists: true, sizeBytes: stats.size };
    } catch {
      return { exists: false };
    }
  }

  /**
   * Deletes an object from storage.
   */
  public async deleteObject(storageKey: string): Promise<void> {
    if (this.isCloudStorageConfigured && this.s3Client) {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: config.storage.bucketName,
          Key: storageKey,
        }),
      );
      return;
    }

    const safeKey = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, "");
    const localPath = path.join(this.localUploadDir, safeKey);
    if (fs.existsSync(localPath)) {
      await fs.promises.unlink(localPath);
    }
  }
}

export const storageService = new StorageService();

