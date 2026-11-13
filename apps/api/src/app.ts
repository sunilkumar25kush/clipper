import express, { Express, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config/env.js";
import { authRouter } from "./routes/auth.routes.js";
import { projectRouter } from "./routes/project.routes.js";
import { videoRouter } from "./routes/video.routes.js";
import { jobRouter } from "./routes/job.routes.js";
import { errorHandler } from "./middlewares/error.js";

export const app: Express = express();

app.set("trust proxy", 1);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (
        config.corsOrigins.includes("*") ||
        config.corsOrigins.includes(origin) ||
        origin.startsWith("http://localhost:")
      ) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy violation: origin not allowed"), false);
    },
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(express.json());

// Public healthcheck
app.get("/api/v1/health", (_req: Request, res: Response): void => {
  res.json({
    status: "ok",
    service: "clipforge-api",
    timestamp: new Date().toISOString(),
  });
});

// Video Upload & Storage routes (Mounted first so media streaming /storage does not get intercepted by projectRouter middleware)
app.use("/api/v1/videos", videoRouter);

// Authentication routes
app.use("/api/v1/auth", authRouter);

// Project & Dashboard routes
app.use("/api/v1", projectRouter);

// Background Job & Real-time Event routes
app.use("/api/v1", jobRouter);

// Centralized error handler
app.use(errorHandler);
