import { Request, Response, NextFunction } from "express";
import { ZodError, type ZodIssue } from "zod";

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: Array<{ field?: string; issue: string }>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Array<{ field?: string; issue: string }>,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req.headers["x-request-id"] as string) || `req_${Date.now().toString(36)}`;

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
    });
    return;
  }

  if (err instanceof ZodError || (err as { name?: string })?.name === "ZodError") {
    const zodErr = err as ZodError;
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request payload",
        details: zodErr.issues.map((e: ZodIssue) => ({
          field: e.path.join("."),
          issue: e.message,
        })),
        requestId,
      },
    });
    return;
  }

  console.error(`[API Error] [${requestId}]`, err);

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected internal server error occurred",
      requestId,
    },
  });
}
