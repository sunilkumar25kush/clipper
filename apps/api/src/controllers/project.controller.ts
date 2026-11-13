import { Request, Response, NextFunction } from "express";
import { createProjectSchema, updateClipSchema } from "@clipforge/validation";
import { projectService } from "../services/project.service.js";
import { AppError } from "../middlewares/error.js";

export class ProjectController {
  async getDashboardMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "UNAUTHORIZED", "Authentication required");
      }

      const metrics = await projectService.getDashboardMetrics(req.user.id);

      res.status(200).json({
        success: true,
        data: metrics,
      });
    } catch (err) {
      next(err);
    }
  }

  async getProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "UNAUTHORIZED", "Authentication required");
      }

      const { page, limit, status, search } = req.query;

      const result = await projectService.getProjects(req.user.id, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        status: typeof status === "string" ? status : undefined,
        search: typeof search === "string" ? search : undefined,
      });

      res.status(200).json({
        success: true,
        data: result.projects,
        meta: {
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "UNAUTHORIZED", "Authentication required");
      }

      const parsed = createProjectSchema.parse(req.body);
      const project = await projectService.createProject(req.user.id, parsed);

      res.status(201).json({
        success: true,
        data: project,
      });
    } catch (err) {
      next(err);
    }
  }

  async getProjectById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
      const { id } = req.params;
      if (!id) throw new AppError(400, "BAD_REQUEST", "Project id is required");

      const project = await projectService.getProjectById(req.user.id, id);
      res.status(200).json({
        success: true,
        data: project,
      });
    } catch (err) {
      next(err);
    }
  }

  async getProjectClips(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
      const { id } = req.params;
      if (!id) throw new AppError(400, "BAD_REQUEST", "Project id is required");

      const clips = await projectService.getProjectClips(req.user.id, id);
      res.status(200).json({
        success: true,
        data: clips,
      });
    } catch (err) {
      next(err);
    }
  }

  async getClipById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
      const { clipId } = req.params;
      if (!clipId) throw new AppError(400, "BAD_REQUEST", "Clip id is required");

      const clip = await projectService.getClipById(req.user.id, clipId);
      res.status(200).json({
        success: true,
        data: clip,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateClip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
      const { clipId } = req.params;
      if (!clipId) throw new AppError(400, "BAD_REQUEST", "Clip id is required");

      const parsed = updateClipSchema.parse(req.body);
      const updated = await projectService.updateClip(req.user.id, clipId, parsed);

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteClip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
      const { clipId } = req.params;
      if (!clipId) throw new AppError(400, "BAD_REQUEST", "Clip id is required");

      await projectService.deleteClip(req.user.id, clipId);
      res.status(200).json({
        success: true,
        data: { id: clipId, deleted: true },
      });
    } catch (err) {
      next(err);
    }
  }

  async regenerateClip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
      const { clipId } = req.params;
      if (!clipId) throw new AppError(400, "BAD_REQUEST", "Clip id is required");

      const result = await projectService.regenerateClip(req.user.id, clipId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const projectController = new ProjectController();

