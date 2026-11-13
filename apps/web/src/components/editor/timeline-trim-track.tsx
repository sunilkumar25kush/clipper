"use client";

import * as React from "react";
import {
  ArrowClockwise,
  Minus,
  Plus,
  Play,
  Scissors,
} from "phosphor-react";

export interface TimelineTrimTrackProps {
  totalDuration: number;
  startTime: number;
  endTime: number;
  currentTime: number;
  onTrimChange: (start: number, end: number) => void;
  onSeek: (time: number) => void;
  minDuration?: number;
  maxDuration?: number;
}

export const TimelineTrimTrack: React.FC<TimelineTrimTrackProps> = ({
  totalDuration,
  startTime,
  endTime,
  currentTime,
  onTrimChange,
  onSeek,
  minDuration = 5,
  maxDuration = 180,
}) => {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [activeDrag, setActiveDrag] = React.useState<"start" | "end" | "playhead" | null>(null);

  const clipDuration = Math.max(0, endTime - startTime);
  const isValidDuration = clipDuration >= minDuration && clipDuration <= maxDuration;

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${mins < 10 ? "0" : ""}${mins}:${s < 10 ? "0" : ""}${s}.${ms}`;
  };

  // Convert mouse/touch position into seconds
  const getTimeFromEvent = React.useCallback(
    (clientX: number): number => {
      if (!trackRef.current || totalDuration <= 0) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const relativeX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const ratio = relativeX / rect.width;
      return ratio * totalDuration;
    },
    [totalDuration],
  );

  const handlePointerDown = (type: "start" | "end" | "playhead", e: React.PointerEvent) => {
    e.preventDefault();
    setActiveDrag(type);
  };

  React.useEffect(() => {
    if (!activeDrag) return;

    const handlePointerMove = (e: PointerEvent) => {
      const time = getTimeFromEvent(e.clientX);

      if (activeDrag === "playhead") {
        onSeek(Math.max(0, Math.min(totalDuration, time)));
      } else if (activeDrag === "start") {
        const newStart = Math.max(0, Math.min(time, endTime - minDuration));
        onTrimChange(Number(newStart.toFixed(1)), endTime);
      } else if (activeDrag === "end") {
        const newEnd = Math.min(totalDuration, Math.max(time, startTime + minDuration));
        onTrimChange(startTime, Number(newEnd.toFixed(1)));
      }
    };

    const handlePointerUp = () => {
      setActiveDrag(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeDrag, getTimeFromEvent, startTime, endTime, totalDuration, minDuration, onSeek, onTrimChange]);

  // Stepper adjustments for precision editing
  const stepStart = (delta: number) => {
    const newStart = Math.max(0, Math.min(startTime + delta, endTime - minDuration));
    onTrimChange(Number(newStart.toFixed(1)), endTime);
  };

  const stepEnd = (delta: number) => {
    const newEnd = Math.min(totalDuration, Math.max(endTime + delta, startTime + minDuration));
    onTrimChange(startTime, Number(newEnd.toFixed(1)));
  };

  const resetToFull = () => {
    onTrimChange(0, totalDuration);
  };

  // Percentages for visual timeline representation
  const startPercent = totalDuration > 0 ? (startTime / totalDuration) * 100 : 0;
  const endPercent = totalDuration > 0 ? (endTime / totalDuration) * 100 : 100;
  const playheadPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
  const activeWidthPercent = Math.max(0, endPercent - startPercent);

  return (
    <div className="w-full bg-white dark:bg-[#181818] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs space-y-4">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
            <Scissors size={15} />
            <span>Clip Boundaries & Trim</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isValidDuration
                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                : "bg-red-50 text-red-600 border border-red-200"
            }`}
          >
            Duration: {formatTime(clipDuration)}
          </span>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto text-[11px] text-zinc-500 font-mono tabular-nums">
          <span>In: {formatTime(startTime)}</span>
          <span>•</span>
          <span>Out: {formatTime(endTime)}</span>
          <button
            type="button"
            onClick={resetToFull}
            title="Reset boundaries to full length"
            className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            <ArrowClockwise size={13} />
          </button>
        </div>
      </div>

      {/* Desktop Visual Dual-Handle Scrub Track (Hidden on tiny screens < 640px) */}
      <div className="hidden sm:block relative pt-2 pb-1">
        <div
          ref={trackRef}
          onClick={(e) => {
            const time = getTimeFromEvent(e.clientX);
            onSeek(time);
          }}
          className="relative h-12 w-full bg-zinc-100 dark:bg-[#121212] rounded-xl border border-zinc-200 dark:border-zinc-800 cursor-pointer overflow-hidden"
        >
          {/* Simulated waveform bars inside timeline */}
          <div className="absolute inset-0 flex items-center justify-around px-2 opacity-30 pointer-events-none">
            {Array.from({ length: 48 }).map((_, i) => (
              <div
                key={i}
                style={{ height: `${20 + ((i * 17) % 65)}%` }}
                className="w-1 rounded-full bg-zinc-400 dark:bg-zinc-600"
              />
            ))}
          </div>

          {/* Dimmed Out-of-Bounds Left Zone */}
          <div
            style={{ width: `${startPercent}%` }}
            className="absolute top-0 bottom-0 left-0 bg-black/40 backdrop-blur-2xs pointer-events-none"
          />

          {/* Active Highlighted Clip Segment */}
          <div
            style={{ left: `${startPercent}%`, width: `${activeWidthPercent}%` }}
            className="absolute top-0 bottom-0 bg-amber-500/15 border-t-2 border-b-2 border-amber-500 pointer-events-none"
          />

          {/* Dimmed Out-of-Bounds Right Zone */}
          <div
            style={{ left: `${endPercent}%`, right: 0 }}
            className="absolute top-0 bottom-0 bg-black/40 backdrop-blur-2xs pointer-events-none"
          />

          {/* Start Trim Handle */}
          <div
            style={{ left: `${startPercent}%` }}
            onPointerDown={(e) => handlePointerDown("start", e)}
            role="slider"
            aria-label="Start time boundary handle"
            aria-valuenow={startTime}
            aria-valuemin={0}
            aria-valuemax={endTime - minDuration}
            tabIndex={0}
            className="absolute top-0 bottom-0 -ml-2 w-4 bg-amber-500 rounded-l-md cursor-ew-resize flex items-center justify-center shadow-md hover:bg-amber-400 active:scale-105 transition-transform z-20 focus:outline-none focus:ring-2 focus:ring-white"
          >
            <div className="w-0.5 h-4 bg-black/60 rounded" />
          </div>

          {/* End Trim Handle */}
          <div
            style={{ left: `${endPercent}%` }}
            onPointerDown={(e) => handlePointerDown("end", e)}
            role="slider"
            aria-label="End time boundary handle"
            aria-valuenow={endTime}
            aria-valuemin={startTime + minDuration}
            aria-valuemax={totalDuration}
            tabIndex={0}
            className="absolute top-0 bottom-0 -ml-2 w-4 bg-amber-500 rounded-r-md cursor-ew-resize flex items-center justify-center shadow-md hover:bg-amber-400 active:scale-105 transition-transform z-20 focus:outline-none focus:ring-2 focus:ring-white"
          >
            <div className="w-0.5 h-4 bg-black/60 rounded" />
          </div>

          {/* Playhead Scrub Indicator */}
          <div
            style={{ left: `${playheadPercent}%` }}
            onPointerDown={(e) => handlePointerDown("playhead", e)}
            role="slider"
            aria-label="Current playback position playhead"
            aria-valuenow={currentTime}
            tabIndex={0}
            className="absolute top-0 bottom-0 -ml-1 w-2 bg-white cursor-ew-resize flex flex-col items-center z-30 shadow-[0_0_8px_rgba(255,255,255,0.8)] focus:outline-none"
          >
            <div className="w-3 h-3 -mt-1 rounded-full bg-white shadow-md" />
            <div className="w-0.5 flex-1 bg-white" />
          </div>
        </div>
      </div>

      {/* Simplified Mobile & Accessible Precision Steppers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* Start Point Stepper */}
        <div className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F]">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Start Timestamp
            </span>
            <span className="font-mono text-xs font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
              {formatTime(startTime)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => stepStart(-0.5)}
              aria-label="Decrease start time by 0.5 seconds"
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#282828] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100"
            >
              <Minus size={12} weight="bold" />
            </button>
            <button
              type="button"
              onClick={() => stepStart(0.5)}
              aria-label="Increase start time by 0.5 seconds"
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#282828] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100"
            >
              <Plus size={12} weight="bold" />
            </button>
            <button
              type="button"
              onClick={() => onSeek(startTime)}
              title="Jump player to start"
              aria-label="Jump player to start"
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#282828] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 ml-1"
            >
              <Play size={12} weight="fill" />
            </button>
          </div>
        </div>

        {/* End Point Stepper */}
        <div className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F]">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              End Timestamp
            </span>
            <span className="font-mono text-xs font-semibold text-zinc-950 dark:text-zinc-50 tabular-nums">
              {formatTime(endTime)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => stepEnd(-0.5)}
              aria-label="Decrease end time by 0.5 seconds"
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#282828] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100"
            >
              <Minus size={12} weight="bold" />
            </button>
            <button
              type="button"
              onClick={() => stepEnd(0.5)}
              aria-label="Increase end time by 0.5 seconds"
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#282828] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100"
            >
              <Plus size={12} weight="bold" />
            </button>
            <button
              type="button"
              onClick={() => onSeek(Math.max(startTime, endTime - 2))}
              title="Preview ending"
              aria-label="Preview ending"
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#282828] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 ml-1"
            >
              <Play size={12} weight="fill" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
