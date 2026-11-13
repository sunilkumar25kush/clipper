import { ProcessingState } from "@clipforge/shared-types";
import { AppError } from "../middlewares/error.js";

const VALID_TRANSITIONS: Record<ProcessingState, ProcessingState[]> = {
  [ProcessingState.PENDING]: [
    ProcessingState.VALIDATING,
    ProcessingState.FAILED,
    ProcessingState.CANCELLED,
  ],
  [ProcessingState.VALIDATING]: [
    ProcessingState.EXTRACTING,
    ProcessingState.FAILED,
    ProcessingState.CANCELLED,
  ],
  [ProcessingState.EXTRACTING]: [
    ProcessingState.TRANSCRIBING,
    ProcessingState.FAILED,
    ProcessingState.CANCELLED,
  ],
  [ProcessingState.TRANSCRIBING]: [
    ProcessingState.ANALYZING,
    ProcessingState.FAILED,
    ProcessingState.CANCELLED,
  ],
  [ProcessingState.ANALYZING]: [
    ProcessingState.SELECTING_CLIPS,
    ProcessingState.RENDERING,
    ProcessingState.FAILED,
    ProcessingState.CANCELLED,
  ],
  [ProcessingState.SELECTING_CLIPS]: [
    ProcessingState.RENDERING,
    ProcessingState.FAILED,
    ProcessingState.CANCELLED,
  ],
  [ProcessingState.RENDERING]: [
    ProcessingState.UPLOADING,
    ProcessingState.COMPLETED,
    ProcessingState.FAILED,
    ProcessingState.CANCELLED,
  ],
  [ProcessingState.UPLOADING]: [
    ProcessingState.COMPLETED,
    ProcessingState.FAILED,
    ProcessingState.CANCELLED,
  ],
  [ProcessingState.COMPLETED]: [],
  [ProcessingState.FAILED]: [],
  [ProcessingState.CANCELLED]: [],
};

const STATE_PROGRESS_MILESTONES: Record<ProcessingState, number> = {
  [ProcessingState.PENDING]: 0,
  [ProcessingState.VALIDATING]: 10,
  [ProcessingState.EXTRACTING]: 20,
  [ProcessingState.TRANSCRIBING]: 40,
  [ProcessingState.ANALYZING]: 60,
  [ProcessingState.SELECTING_CLIPS]: 75,
  [ProcessingState.RENDERING]: 90,
  [ProcessingState.UPLOADING]: 98,
  [ProcessingState.COMPLETED]: 100,
  [ProcessingState.FAILED]: 0,
  [ProcessingState.CANCELLED]: 0,
};

export class JobStateMachine {
  public static canTransition(current: ProcessingState, next: ProcessingState): boolean {
    if (current === next) return true; // Idempotent same-state update
    const allowed = VALID_TRANSITIONS[current] || [];
    return allowed.includes(next);
  }

  public static assertValidTransition(current: ProcessingState, next: ProcessingState): void {
    if (!this.canTransition(current, next)) {
      throw new AppError(
        400,
        "INVALID_STATE_TRANSITION",
        `Cannot transition job from '${current}' to '${next}'. Invalid state machine transition.`,
      );
    }
  }

  public static isTerminal(state: ProcessingState): boolean {
    return (
      state === ProcessingState.COMPLETED ||
      state === ProcessingState.FAILED ||
      state === ProcessingState.CANCELLED
    );
  }

  public static getMilestoneProgress(state: ProcessingState): number {
    return STATE_PROGRESS_MILESTONES[state] ?? 0;
  }
}
