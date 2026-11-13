import { Request, Response, NextFunction } from "express";
import { prisma } from "@clipforge/database";
import {
  createProcessingJobSchema,
  cancelProcessingJobSchema,
} from "@clipforge/validation";
import { jobService } from "../services/job.service.js";
import { eventsService } from "../services/events.service.js";

export class JobController {
  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createProcessingJobSchema.parse({
        projectId: req.params.projectId,
        ...req.body,
      });

      const job = await jobService.createJob(req.user!.id, input);

      res.status(202).json({
        success: true,
        data: job,
      });
    } catch (err) {
      next(err);
    }
  }

  public async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const jobId = req.params.jobId;
      if (!jobId) {
        res.status(400).json({
          success: false,
          error: { code: "BAD_REQUEST", message: "jobId is required" },
        });
        return;
      }

      const job = await jobService.getJob(req.user!.id, jobId);

      res.status(200).json({
        success: true,
        data: job,
      });
    } catch (err) {
      next(err);
    }
  }

  public async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const jobId = req.params.jobId;
      if (!jobId) {
        res.status(400).json({
          success: false,
          error: { code: "BAD_REQUEST", message: "jobId is required" },
        });
        return;
      }

      const input = cancelProcessingJobSchema.parse(req.body);
      const job = await jobService.cancelJob(req.user!.id, jobId, input.reason);

      res.status(200).json({
        success: true,
        data: job,
      });
    } catch (err) {
      next(err);
    }
  }

  public async streamEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projectId = req.params.projectId;
      if (!projectId) {
        res.status(400).json({
          success: false,
          error: { code: "BAD_REQUEST", message: "projectId is required" },
        });
        return;
      }

      // Verify ownership before opening SSE stream
      const project = await prisma.videoProject.findUnique({
        where: { id: projectId },
        select: { userId: true },
      });

      if (!project || project.userId !== req.user!.id) {
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Project not found or access denied." },
        });
        return;
      }

      // Configure SSE response headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      eventsService.registerClient(projectId, res);
    } catch (err) {
      next(err);
    }
  }
}

export const jobController = new JobController();

