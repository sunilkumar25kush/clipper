import { Router } from "express";
import { projectController } from "../controllers/project.controller.js";
import { requireAuth } from "../middlewares/auth.js";

export const projectRouter: Router = Router();

projectRouter.use(["/dashboard", "/projects", "/clips"], requireAuth);

projectRouter.get("/dashboard/metrics", (req, res, next) => {
  projectController.getDashboardMetrics(req, res, next);
});

projectRouter.get("/projects", (req, res, next) => {
  projectController.getProjects(req, res, next);
});

projectRouter.post("/projects", (req, res, next) => {
  projectController.createProject(req, res, next);
});

projectRouter.get("/projects/:id", (req, res, next) => {
  projectController.getProjectById(req, res, next);
});

projectRouter.get("/projects/:id/clips", (req, res, next) => {
  projectController.getProjectClips(req, res, next);
});

projectRouter.get("/clips/:clipId", (req, res, next) => {
  projectController.getClipById(req, res, next);
});

projectRouter.patch("/clips/:clipId", (req, res, next) => {
  projectController.updateClip(req, res, next);
});

projectRouter.delete("/clips/:clipId", (req, res, next) => {
  projectController.deleteClip(req, res, next);
});

projectRouter.post("/clips/:clipId/regenerate", (req, res, next) => {
  projectController.regenerateClip(req, res, next);
});

