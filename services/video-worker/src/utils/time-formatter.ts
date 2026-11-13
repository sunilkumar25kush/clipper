/**
 * Utilities for video timestamp validation, conversions, and ASS formatting.
 */

export function secondsToFfmpegTimestamp(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) {
    return "00:00:00.000";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const wholeSeconds = Math.floor(seconds);
  const milliseconds = Math.round((seconds - wholeSeconds) * 1000);

  const pad = (num: number, size: number) => num.toString().padStart(size, "0");

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(wholeSeconds, 2)}.${pad(milliseconds, 3)}`;
}

/**
 * Format timestamp for ASS (Advanced SubStation Alpha) subtitles: H:MM:SS.CC (centiseconds)
 */
export function secondsToAssTimestamp(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) {
    return "0:00:00.00";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const wholeSeconds = Math.floor(seconds);
  const centiseconds = Math.floor((seconds - wholeSeconds) * 100);

  const pad = (num: number, size: number) => num.toString().padStart(size, "0");

  return `${hours}:${pad(minutes, 2)}:${pad(wholeSeconds, 2)}.${pad(centiseconds, 2)}`;
}

/**
 * Validate clip boundary timestamps against source video duration.
 */
export function validateTimeRange(
  startTime: number,
  endTime: number,
  totalDuration?: number,
): void {
  if (typeof startTime !== "number" || typeof endTime !== "number") {
    throw new Error("Invalid timestamps: startTime and endTime must be numbers");
  }

  if (isNaN(startTime) || isNaN(endTime)) {
    throw new Error("Invalid timestamps: NaN values not permitted");
  }

  if (startTime < 0) {
    throw new Error(`Invalid startTime (${startTime}s): must be greater than or equal to 0`);
  }

  if (endTime <= startTime) {
    throw new Error(`Invalid time range: endTime (${endTime}s) must be greater than startTime (${startTime}s)`);
  }

  if (typeof totalDuration === "number" && totalDuration > 0) {
    if (startTime >= totalDuration) {
      throw new Error(`Invalid startTime (${startTime}s): exceeds total video duration (${totalDuration}s)`);
    }

    // Allow a tiny 100ms tolerance for duration floating point variance
    if (endTime > totalDuration + 0.1) {
      throw new Error(`Invalid endTime (${endTime}s): exceeds total video duration (${totalDuration}s)`);
    }
  }
}

