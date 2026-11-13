import fs from "fs";
import path from "path";
import crypto from "crypto";
import { workerConfig } from "../config/env.js";

export class TempManager {
  private baseDir: string;

  constructor(baseDir = workerConfig.tempDir) {
    this.baseDir = baseDir;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Create an isolated, unique temporary directory for a job or operation.
   */
  createScopedDir(prefix = "job"): string {
    const uniqueId = `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const scopedPath = path.join(this.baseDir, uniqueId);
    fs.mkdirSync(scopedPath, { recursive: true });
    return scopedPath;
  }

  /**
   * Safely remove a directory and its contents, handling Windows file lock delays with bounded retry.
   */
  async cleanupDir(dirPath: string, maxRetries = 3): Promise<void> {
    if (!dirPath || !fs.existsSync(dirPath)) return;

    // Safety guard: ensure we only delete within our configured temp directory
    const resolvedPath = path.resolve(dirPath);
    const resolvedBase = path.resolve(this.baseDir);
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new Error(`Security Violation: Refusing to delete path outside temp directory: ${dirPath}`);
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await fs.promises.rm(dirPath, { recursive: true, force: true, maxRetries: 2 });
        return;
      } catch (err) {
        if (attempt === maxRetries) {
          console.warn(`[TempManager] Failed to cleanup temp directory ${dirPath} after ${maxRetries} attempts:`, err);
        } else {
          await new Promise((r) => setTimeout(r, 100 * attempt));
        }
      }
    }
  }

  /**
   * Helper that creates a scoped temp directory, executes a callback, and guarantees cleanup.
   */
  async withTempDir<T>(callback: (dir: string) => Promise<T>, prefix = "task"): Promise<T> {
    const dir = this.createScopedDir(prefix);
    try {
      return await callback(dir);
    } finally {
      await this.cleanupDir(dir);
    }
  }
}

export const tempManager = new TempManager();

