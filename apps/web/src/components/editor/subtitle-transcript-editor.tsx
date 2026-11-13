"use client";

import * as React from "react";
import {
  TextT,
  Sparkle,
  Play,
  Check,
} from "phosphor-react";

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface SubtitleTranscriptEditorProps {
  cues: SubtitleCue[];
  currentTime: number;
  onCueChange: (index: number, updatedText: string) => void;
  onSeek: (time: number) => void;
  presetId: string;
  onPresetChange: (presetId: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  position: "BOTTOM_SAFE" | "CENTER" | "TOP";
  onPositionChange: (pos: "BOTTOM_SAFE" | "CENTER" | "TOP") => void;
}

export const SubtitleTranscriptEditor: React.FC<SubtitleTranscriptEditorProps> = ({
  cues,
  currentTime,
  onCueChange,
  onSeek,
  presetId,
  onPresetChange,
  fontSize,
  onFontSizeChange,
  position,
  onPositionChange,
}) => {
  const activeCueIndex = cues.findIndex(
    (c) => currentTime >= c.start && currentTime <= c.end,
  );

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins}:${s < 10 ? "0" : ""}${s}`;
  };

  const presets = [
    {
      id: "viral-highlight",
      name: "Viral Gold",
      desc: "Dynamic active yellow word highlight (Hormozi / Beast style)",
    },
    {
      id: "clean",
      name: "Minimal Clean",
      desc: "High-legibility white sans-serif with subtle drop shadow",
    },
    {
      id: "boxed",
      name: "Boxed Contrast",
      desc: "Solid dark backing pill for maximum contrast over busy scenes",
    },
  ];

  return (
    <div className="space-y-5 text-xs">
      {/* Subtitle Style Presets */}
      <div>
        <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 mb-2">
          <Sparkle size={14} weight="fill" className="text-amber-500" />
          <span>Caption Style Preset</span>
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {presets.map((p) => {
            const isSelected = presetId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPresetChange(p.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "border-zinc-950 dark:border-zinc-100 bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-xs"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold">{p.name}</span>
                  {isSelected && <Check size={14} weight="bold" />}
                </div>
                <p className="text-[10px] opacity-75 line-clamp-2 leading-relaxed">
                  {p.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Typography & Safe-Zone Positioning */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#181818]">
        {/* Font Size Slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between font-medium text-zinc-700 dark:text-zinc-300">
            <span>Font Size</span>
            <span className="font-mono tabular-nums">{fontSize}px</span>
          </div>
          <input
            type="range"
            min={36}
            max={84}
            step={4}
            value={fontSize}
            onChange={(e) => onFontSizeChange(parseInt(e.target.value, 10))}
            aria-label="Caption font size"
            className="w-full h-1 bg-zinc-300 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-zinc-950 dark:accent-white"
          />
        </div>

        {/* Position Selectors */}
        <div className="space-y-1.5">
          <span className="font-medium text-zinc-700 dark:text-zinc-300 block">
            Screen Position
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {(["BOTTOM_SAFE", "CENTER", "TOP"] as const).map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => onPositionChange(pos)}
                className={`py-1.5 px-2 rounded-lg border text-center text-[11px] font-medium transition-colors ${
                  position === pos
                    ? "bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold border-zinc-950"
                    : "bg-white dark:bg-[#202020] border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950"
                }`}
              >
                {pos === "BOTTOM_SAFE" ? "Bottom" : pos === "CENTER" ? "Center" : "Top"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Synchronized Transcript Cue List */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
            <TextT size={15} />
            <span>Spoken Subtitle Cues ({cues.length})</span>
          </span>
          <span className="text-[10px] text-zinc-500">
            Click text to edit or seek video
          </span>
        </div>

        <div className="max-h-56 overflow-y-auto space-y-2 pr-1 rounded-xl border border-zinc-200 dark:border-zinc-800 p-2 bg-white dark:bg-[#141414]">
          {cues.length === 0 ? (
            <p className="text-zinc-400 text-center py-6 text-xs">
              No subtitle cues found for this clip.
            </p>
          ) : (
            cues.map((cue, idx) => {
              const isActive = idx === activeCueIndex;
              return (
                <div
                  key={idx}
                  className={`p-2.5 rounded-lg border transition-all flex items-start gap-2.5 ${
                    isActive
                      ? "border-amber-400/80 bg-amber-50/50 dark:bg-amber-950/20 shadow-xs"
                      : "border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                  }`}
                >
                  {/* Seek button with timestamp */}
                  <button
                    type="button"
                    onClick={() => onSeek(cue.start)}
                    title={`Jump to ${formatTime(cue.start)}`}
                    className="shrink-0 font-mono text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1 mt-0.5"
                  >
                    <Play size={10} weight={isActive ? "fill" : "regular"} className={isActive ? "text-amber-500" : ""} />
                    <span>{formatTime(cue.start)}</span>
                  </button>

                  {/* Inline editable cue text */}
                  <input
                    type="text"
                    value={cue.text}
                    onChange={(e) => onCueChange(idx, e.target.value)}
                    aria-label={`Subtitle cue at ${formatTime(cue.start)}`}
                    className="flex-1 bg-transparent border-0 p-0 text-xs text-zinc-950 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-950 dark:focus:ring-zinc-200 rounded px-1"
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
