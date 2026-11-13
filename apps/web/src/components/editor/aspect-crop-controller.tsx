"use client";

import * as React from "react";
import {
  Crop,
  UserFocus,
  DeviceMobile,
  Monitor,
  Square,
  Sliders,
} from "phosphor-react";
import { AspectRatio, CropMode } from "@clipforge/shared-types";

export interface AspectCropControllerProps {
  aspectRatio: AspectRatio;
  onAspectRatioChange: (aspect: AspectRatio) => void;
  cropMode: CropMode;
  onCropModeChange: (mode: CropMode) => void;
  focusX?: number; // 0.0 to 1.0
  onFocusXChange?: (focusX: number) => void;
}

export const AspectCropController: React.FC<AspectCropControllerProps> = ({
  aspectRatio,
  onAspectRatioChange,
  cropMode,
  onCropModeChange,
  focusX = 0.5,
  onFocusXChange,
}) => {
  const aspectOptions = [
    {
      ratio: AspectRatio.RATIO_9_16,
      label: "9:16 Vertical",
      desc: "Shorts, Reels, TikTok",
      icon: <DeviceMobile size={18} weight="bold" />,
    },
    {
      ratio: AspectRatio.RATIO_16_9,
      label: "16:9 Landscape",
      desc: "YouTube, Web Player",
      icon: <Monitor size={18} weight="bold" />,
    },
    {
      ratio: AspectRatio.RATIO_1_1,
      label: "1:1 Square",
      desc: "Instagram Feed, LinkedIn",
      icon: <Square size={18} weight="bold" />,
    },
  ];

  const cropModes = [
    {
      mode: CropMode.FACE_TRACK,
      label: "Speaker Face Tracking",
      desc: "Automatically pans and tracks the active speaker across camera cuts",
    },
    {
      mode: CropMode.CENTER_CROP,
      label: "Safe Center Crop",
      desc: "Statically centers the frame without motion or camera panning",
    },
    {
      mode: CropMode.BLUR_PAD,
      label: "Blurred Background Padding",
      desc: "Preserves full wide content over a soft blurred background",
    },
  ];

  return (
    <div className="space-y-5 text-xs">
      {/* Aspect Ratio Selector */}
      <div>
        <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 mb-2">
          <Crop size={15} />
          <span>Output Aspect Ratio</span>
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {aspectOptions.map((opt) => {
            const isSelected = aspectRatio === opt.ratio;
            return (
              <button
                key={opt.ratio}
                type="button"
                onClick={() => onAspectRatioChange(opt.ratio)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "border-zinc-950 dark:border-zinc-100 bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-xs"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {opt.icon}
                  <span className="font-semibold">{opt.label}</span>
                </div>
                <p className="text-[10px] opacity-75">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Smart Reframing & Crop Mode */}
      <div>
        <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 mb-2">
          <UserFocus size={15} />
          <span>Reframe & Smart Cropping Mode</span>
        </span>

        <div className="space-y-2">
          {cropModes.map((item) => {
            const isSelected = cropMode === item.mode;
            return (
              <button
                key={item.mode}
                type="button"
                onClick={() => onCropModeChange(item.mode)}
                className={`w-full p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  isSelected
                    ? "border-zinc-950 dark:border-zinc-100 bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-xs"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
                }`}
              >
                <div className="mt-0.5">
                  <div
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      isSelected
                        ? "border-white dark:border-zinc-950 bg-white dark:bg-zinc-950"
                        : "border-zinc-400"
                    }`}
                  >
                    {isSelected && (
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-950 dark:bg-white" />
                    )}
                  </div>
                </div>

                <div>
                  <span className="font-semibold block mb-0.5">{item.label}</span>
                  <p className="text-[10px] opacity-75 leading-relaxed">{item.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Speaker Focal Center Alignment Slider (Active when FACE_TRACK or 9:16) */}
      {cropMode === CropMode.FACE_TRACK && onFocusXChange && (
        <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#181818] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Sliders size={14} />
              <span>Speaker Horizontal Focal Center</span>
            </span>
            <span className="font-mono text-[11px] tabular-nums text-zinc-500">
              {Math.round(focusX * 100)}% ({focusX < 0.4 ? "Left" : focusX > 0.6 ? "Right" : "Center"})
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={focusX}
            onChange={(e) => onFocusXChange(parseFloat(e.target.value))}
            aria-label="Speaker horizontal focal alignment"
            className="w-full h-1 bg-zinc-300 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-zinc-950 dark:accent-white"
          />

          <div className="flex justify-between text-[10px] text-zinc-400">
            <span>Left (0%)</span>
            <span>Center (50%)</span>
            <span>Right (100%)</span>
          </div>
        </div>
      )}
    </div>
  );
};

