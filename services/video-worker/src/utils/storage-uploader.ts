import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export interface UploadResult {
  storageBucket: string;
  storageKey: string;
  fileSizeBytes: bigint;
}

export class StorageUploader {
  private s3Client: S3Client | null = null;
  private bucketName: string;
  private localDir: string;

  constructor() {
    this.bucketName = process.env.STORAGE_BUCKET_NAME || "clipforge-media";
    this.localDir = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR || "uploads");

    const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID || "";
    const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY || "";
    const endpoint = process.env.STORAGE_ENDPOINT || undefined;
    const region = process.env.STORAGE_REGION || "auto";
    const forcePathStyle = process.env.STORAGE_FORCE_PATH_STYLE === "true";

    const hasValidCloudCredentials =
      Boolean(accessKeyId) &&
      Boolean(secretAccessKey) &&
      !accessKeyId.startsWith("replace_with_") &&
      !secretAccessKey.startsWith("replace_with_") &&
      process.env.STORAGE_PROVIDER !== "local";

    if (hasValidCloudCredentials) {
      this.s3Client = new S3Client({
        region,
        endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        forcePathStyle,
      });
    } else {
      if (!fs.existsSync(this.localDir)) {
        fs.mkdirSync(this.localDir, { recursive: true });
      }
    }
  }

  async uploadFile(
    localFilePath: string,
    storageKey: string,
    mimeType: string,
  ): Promise<UploadResult> {
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`File does not exist for upload: ${localFilePath}`);
    }

    const stat = fs.statSync(localFilePath);
    const fileSizeBytes = BigInt(stat.size);

    if (this.s3Client) {
      const fileStream = fs.createReadStream(localFilePath);
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: storageKey,
          Body: fileStream,
          ContentType: mimeType,
          ContentLength: stat.size,
        }),
      );
    } else {
      // Local file storage
      const destinationPath = path.join(this.localDir, storageKey);
      const destDir = path.dirname(destinationPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(localFilePath, destinationPath);
    }

    return {
      storageBucket: this.bucketName,
      storageKey,
      fileSizeBytes,
    };
  }
}

export const storageUploader = new StorageUploader();

