import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { videoUploadController } from "../controllers/video-upload.controller.js";

export const videoRouter: Router = Router();

// Video upload lifecycle endpoints (strictly protected by authentication)
videoRouter.post(
  "/upload/initiate",
  requireAuth,
  (req, res, next) => videoUploadController.initiate(req, res, next),
);

// Fallback / local dev streaming upload
videoRouter.put(
  "/upload/direct/:assetId",
  requireAuth,
  (req, res, next) => videoUploadController.directStreamUpload(req, res, next),
);

videoRouter.post(
  "/upload/complete",
  requireAuth,
  (req, res, next) => videoUploadController.complete(req, res, next),
);

videoRouter.get(
  "/:projectId/assets/:assetId/status",
  requireAuth,
  (req, res, next) => videoUploadController.getStatus(req, res, next),
);

// Media streaming and download endpoint (supports range requests for HTML5 video player and thumbnails)
videoRouter.get(
  "/storage/:storageKey(*)",
  (req, res, next) => videoUploadController.serveStorageFile(req, res, next),
);

