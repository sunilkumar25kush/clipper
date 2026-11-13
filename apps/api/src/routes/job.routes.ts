import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { jobController } from "../controllers/job.controller.js";

export const jobRouter: Router = Router();

// Project processing initiation & event streams
jobRouter.post(
  ["/projects/:projectId/process", "/projects/:projectId/jobs"],
  requireAuth,
  (req, res, next) => jobController.create(req, res, next),
);

jobRouter.get(
  "/projects/:projectId/events",
  requireAuth,
  (req, res, next) => jobController.streamEvents(req, res, next),
);

// Individual job queries & cancellation
jobRouter.get(
  "/jobs/:jobId",
  requireAuth,
  (req, res, next) => jobController.get(req, res, next),
);

jobRouter.post(
  "/jobs/:jobId/cancel",
  requireAuth,
  (req, res, next) => jobController.cancel(req, res, next),
);

