"use client";

import * as React from "react";
import { ProcessingState, JobProgressEvent } from "@clipforge/shared-types";

interface UseJobProgressOptions {
  projectId: string | null;
  enabled?: boolean;
  onCompleted?: () => void;
  onFailed?: (errorMessage?: string) => void;
}

interface UseJobProgressReturn {
  status: ProcessingState | null;
  stage: ProcessingState | null;
  progressPercent: number;
  message: string | null;
  isConnected: boolean;
  isProcessing: boolean;
}

export function useJobProgress({
  projectId,
  enabled = true,
  onCompleted,
  onFailed,
}: UseJobProgressOptions): UseJobProgressReturn {
  const [status, setStatus] = React.useState<ProcessingState | null>(null);
  const [stage, setStage] = React.useState<ProcessingState | null>(null);
  const [progressPercent, setProgressPercent] = React.useState<number>(0);
  const [message, setMessage] = React.useState<string | null>(null);
  const [isConnected, setIsConnected] = React.useState<boolean>(false);

  const onCompletedRef = React.useRef(onCompleted);
  const onFailedRef = React.useRef(onFailed);

  React.useEffect(() => {
    onCompletedRef.current = onCompleted;
    onFailedRef.current = onFailed;
  });

  React.useEffect(() => {
    if (!projectId || !enabled) {
      setIsConnected(false);
      return;
    }

    const eventSource = new EventSource(`/api/v1/projects/${projectId}/events`);

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.addEventListener("connected", () => {
      setIsConnected(true);
    });

    eventSource.addEventListener("job_progress", (e) => {
      try {
        const data = JSON.parse(e.data) as JobProgressEvent;
        setStatus(data.status);
        setStage(data.stage);
        setProgressPercent(data.progressPercent);
        if (data.message) {
          setMessage(data.message);
        }

        if (data.status === ProcessingState.COMPLETED) {
          onCompletedRef.current?.();
          eventSource.close();
        } else if (data.status === ProcessingState.FAILED || data.status === ProcessingState.CANCELLED) {
          onFailedRef.current?.(data.message);
          eventSource.close();
        }
      } catch {
        // Parse error ignored
      }
    });

    eventSource.onerror = () => {
      setIsConnected(false);
      // EventSource automatically handles reconnection
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [projectId, enabled]);

  const isProcessing =
    status !== null &&
    status !== ProcessingState.COMPLETED &&
    status !== ProcessingState.FAILED &&
    status !== ProcessingState.CANCELLED;

  return {
    status,
    stage,
    progressPercent,
    message,
    isConnected,
    isProcessing,
  };
}

