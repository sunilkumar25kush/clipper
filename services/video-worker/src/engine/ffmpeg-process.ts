import { spawn, SpawnOptions } from "child_process";
import fs from "fs";
import { workerConfig } from "../config/env.js";

export interface ProcessExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export class VideoProcessingError extends Error {
  public exitCode: number | null;
  public signal: NodeJS.Signals | null;
  public stderr: string;
  public args: string[];

  constructor(
    message: string,
    exitCode: number | null,
    signal: NodeJS.Signals | null,
    stderr: string,
    args: string[],
  ) {
    super(message);
    this.name = "VideoProcessingError";
    this.exitCode = exitCode;
    this.signal = signal;
    this.stderr = stderr;
    this.args = args;
    Object.setPrototypeOf(this, VideoProcessingError.prototype);
  }
}

/**
 * Execute FFmpeg or FFprobe safely using spawn without shell interpretation.
 */
export async function executeProcess(
  binaryPath: string,
  args: string[],
  options: {
    timeoutMs?: number;
    cwd?: string;
    onProgress?: (progressLine: string) => void;
  } = {},
): Promise<ProcessExecutionResult> {
  if (!binaryPath) {
    throw new Error("Cannot execute media process: binary path is not defined");
  }

  const startTime = Date.now();
  const timeoutMs = options.timeoutMs ?? workerConfig.processTimeoutMs;

  return new Promise<ProcessExecutionResult>((resolve, reject) => {
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let isTimedOut = false;

    const spawnOptions: SpawnOptions = {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    };

    const child = spawn(binaryPath, args, spawnOptions);

    const timer = setTimeout(() => {
      isTimedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf8");
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderrBuffer += text;
      if (options.onProgress) {
        options.onProgress(text);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn media process (${binaryPath}): ${err.message}`));
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      if (isTimedOut) {
        return reject(
          new VideoProcessingError(
            `Media process timed out after ${timeoutMs}ms`,
            code,
            signal,
            stderrBuffer.slice(-2000),
            args,
          ),
        );
      }

      if (code !== 0) {
        return reject(
          new VideoProcessingError(
            `Media process exited with code ${code}: ${stderrBuffer.slice(-1000) || "Unknown error"}`,
            code,
            signal,
            stderrBuffer,
            args,
          ),
        );
      }

      resolve({
        stdout: stdoutBuffer,
        stderr: stderrBuffer,
        exitCode: code,
        durationMs,
      });
    });
  });
}

/**
 * Validates that an input video or audio file exists and is accessible.
 */
export function validateInputFile(filePath: string): void {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("Invalid input file: path must be a non-empty string");
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file does not exist: ${filePath}`);
  }
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    throw new Error(`Input path is not a file: ${filePath}`);
  }
  if (stats.size === 0) {
    throw new Error(`Input file is empty (0 bytes): ${filePath}`);
  }
}

