"use client";

import * as React from "react";
import { CircleNotch, CheckCircle, WarningCircle, StopCircle, Sparkle } from "phosphor-react";
import { ProcessingState } from "@clipforge/shared-types";
import { fetchApi } from "@/lib/api-client";
import { useJobProgress } from "@/hooks/use-job-progress";

interface JobProgressWidgetProps {
  projectId: string;
  jobId: string;
  initialStage?: ProcessingState;
  initialProgress?: number;
  onFinished?: () => void;
}

const PIPELINE_STAGES: Array<{ key: ProcessingState; label: string }> = [
  { key: ProcessingState.VALIDATING, label: "Validating" },
  { key: ProcessingState.EXTRACTING, label: "Extracting Audio" },
  { key: ProcessingState.TRANSCRIBING, label: "Transcribing" },
  { key: ProcessingState.ANALYZING, label: "AI Analysis" },
  { key: ProcessingState.SELECTING_CLIPS, label: "Selecting Clips" },
  { key: ProcessingState.RENDERING, label: "Rendering Clips" },
];

export function JobProgressWidget({
  projectId,
  jobId,
  initialStage = ProcessingState.PENDING,
  initialProgress = 0,
  onFinished,
}: JobProgressWidgetProps) {
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [cancelError, setCancelError] = React.useState<string | null>(null);

  const { status: _status, stage, progressPercent, message, isProcessing } = useJobProgress({
    projectId,
    enabled: true,
    onCompleted: () => {
      onFinished?.();
    },
    onFailed: (err) => {
      if (err) setCancelError(err);
    },
  });

  const activeStage = stage || initialStage;
  const activeProgress = progressPercent || initialProgress;

  const handleCancel = async () => {
    setIsCancelling(true);
    setCancelError(null);
    try {
      await fetchApi(`/api/v1/jobs/${jobId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "User cancelled from dashboard" }),
      });
    } catch {
      setCancelError("Unable to cancel job. It may have already finished.");
    } finally {
      setIsCancelling(false);
    }
  };

  const getStageIndex = (current: ProcessingState): number => {
    switch (current) {
      case ProcessingState.VALIDATING:
        return 0;
      case ProcessingState.EXTRACTING:
        return 1;
      case ProcessingState.TRANSCRIBING:
        return 2;
      case ProcessingState.ANALYZING:
        return 3;
      case ProcessingState.SELECTING_CLIPS:
        return 4;
      case ProcessingState.RENDERING:
      case ProcessingState.UPLOADING:
        return 5;
      case ProcessingState.COMPLETED:
        return 6;
      default:
        return -1;
    }
  };

  const currentStageIndex = getStageIndex(activeStage);

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-5 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
            {activeStage === ProcessingState.COMPLETED ? (
              <CheckCircle size={18} weight="fill" />
            ) : (
              <Sparkle size={18} weight="fill" className="animate-pulse" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
              {activeStage === ProcessingState.COMPLETED
                ? "Clips Generated Successfully"
                : activeStage === ProcessingState.CANCELLED
                ? "Processing Cancelled"
                : "Processing Video with AI"}
            </h3>
            <p className="text-xs text-zinc-500">
              {message || "Generating vertical shorts with smart face-tracking and captions"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {activeProgress}%
          </span>

          {isProcessing && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={isCancelling}
              className="flex items-center gap-1 rounded-lg border border-red-200 dark:border-red-900/40 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50 transition-colors"
            >
              <StopCircle size={13} />
              <span>{isCancelling ? "Cancelling..." : "Cancel"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-4">
        <div
          role="progressbar"
          aria-valuenow={activeProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Video AI processing progress"
          className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        >
          <div
            className={`h-full transition-all duration-300 ease-out ${
              activeStage === ProcessingState.COMPLETED
                ? "bg-emerald-500"
                : activeStage === ProcessingState.CANCELLED || activeStage === ProcessingState.FAILED
                ? "bg-red-500"
                : "bg-indigo-600"
            }`}
            style={{ width: `${activeProgress}%` }}
          />
        </div>
      </div>

      {/* Pipeline Stage Pills */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {PIPELINE_STAGES.map((step, idx) => {
          const isDone = currentStageIndex > idx || activeStage === ProcessingState.COMPLETED;
          const isCurrent = currentStageIndex === idx && activeStage !== ProcessingState.COMPLETED;

          return (
            <div
              key={step.key}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition-colors ${
                isDone
                  ? "border-emerald-200 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-medium"
                  : isCurrent
                  ? "border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 font-semibold"
                  : "border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-[#1E1E1E] text-zinc-400"
              }`}
            >
              {isDone ? (
                <CheckCircle size={13} weight="bold" className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : isCurrent ? (
                <CircleNotch size={13} className="animate-spin shrink-0 text-indigo-600 dark:text-indigo-400" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 shrink-0" />
              )}
              <span className="truncate text-[11px]">{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* Error state if any */}
      {cancelError && (
        <div
          role="alert"
          className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-2.5 text-xs text-red-600 dark:text-red-400"
        >
          <WarningCircle size={14} className="shrink-0" />
          <span>{cancelError}</span>
        </div>
      )}
    </div>
  );
}
