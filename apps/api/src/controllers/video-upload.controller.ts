import fs from "node:fs";
import path from "node:path";
import { Request, Response, NextFunction } from "express";
import { initiateUploadSchema, completeUploadSchema } from "@clipforge/validation";
import { videoUploadService } from "../services/video-upload.service.js";
import { storageService } from "../services/storage.service.js";

export class VideoUploadController {
  public async initiate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = initiateUploadSchema.parse(req.body);
      const result = await videoUploadService.initiateUpload(req.user!.id, input);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public async directStreamUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const assetId = req.params.assetId;
      if (!assetId) {
        res.status(400).json({
          success: false,
          error: { code: "BAD_REQUEST", message: "assetId parameter is required" },
        });
        return;
      }

      const result = await videoUploadService.handleDirectStream(req.user!.id, assetId, req);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public async complete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = completeUploadSchema.parse(req.body);
      const result = await videoUploadService.completeUpload(req.user!.id, input);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { projectId, assetId } = req.params;
      if (!projectId || !assetId) {
        res.status(400).json({
          success: false,
          error: { code: "BAD_REQUEST", message: "projectId and assetId are required" },
        });
        return;
      }
      const result = await videoUploadService.getUploadStatus(req.user!.id, projectId, assetId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public async serveStorageFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const storageKey = req.params.storageKey;
      if (!storageKey) {
        res.status(400).json({
          success: false,
          error: { code: "BAD_REQUEST", message: "storageKey is required" },
        });
        return;
      }

      if (storageService.isCloud()) {
        const downloadUrl = await storageService.getDownloadPresignedUrl({ storageKey });
        res.redirect(302, downloadUrl);
        return;
      }

      const filePath = storageService.getLocalFilePath(storageKey);
      if (!filePath) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "File not found in storage" },
        });
        return;
      }

      const stat = await fs.promises.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      let contentType = "application/octet-stream";
      if (ext === ".mp4") contentType = "video/mp4";
      else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
      else if (ext === ".webp") contentType = "image/webp";
      else if (ext === ".png") contentType = "image/png";
      else if (ext === ".wav") contentType = "audio/wav";
      else if (ext === ".webm") contentType = "video/webm";

      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parts[0] ? parseInt(parts[0], 10) : 0;
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = end - start + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": contentType,
        });
        fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Length": stat.size,
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
        });
        fs.createReadStream(filePath).pipe(res);
      }
    } catch (err) {
      next(err);
    }
  }
}

export const videoUploadController = new VideoUploadController();
