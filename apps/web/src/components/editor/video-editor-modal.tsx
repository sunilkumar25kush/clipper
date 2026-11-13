"use client";

import * as React from "react";
import {
  X,
  CheckCircle,
  CircleNotch,
  TextT,
  Crop,
  FileArrowDown,
  Sparkle,
  FloppyDisk,
  WarningCircle,
} from "phosphor-react";
import { fetchApi, getErrorMessage } from "@/lib/api-client";
import {
  ClipDetailDTO,
  AspectRatio,
  CropMode,
  ClipCategory,
} from "@clipforge/shared-types";
import { VideoPreviewPlayer } from "./video-preview-player";
import { TimelineTrimTrack } from "./timeline-trim-track";
import { SubtitleTranscriptEditor, SubtitleCue } from "./subtitle-transcript-editor";
import { AspectCropController } from "./aspect-crop-controller";
import { ExportSettingsPanel } from "./export-settings-panel";

export interface VideoEditorModalProps {
  clip: ClipDetailDTO;
  isOpen: boolean;
  onClose: () => void;
  onClipUpdated: (updated: ClipDetailDTO) => void;
}

export const VideoEditorModal: React.FC<VideoEditorModalProps> = ({
  clip,
  isOpen,
  onClose,
  onClipUpdated,
}) => {
  // Navigation tabs in the editor inspector
  const [activeTab, setActiveTab] = React.useState<"captions" | "crop" | "export" | "scores">(
    "captions",
  );

  // Playback state
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(clip.duration || 30);

  // Boundary editing state
  const [startTime, setStartTime] = React.useState(clip.startTime);
  const [endTime, setEndTime] = React.useState(clip.endTime);

  // Metadata state
  const [title, setTitle] = React.useState(clip.title);
  const [description, setDescription] = React.useState(clip.description);
  const [category, setCategory] = React.useState<ClipCategory>(clip.category);

  // Subtitle styling state
  const [presetId, setPresetId] = React.useState(clip.caption?.presetId || "viral-highlight");
  const [fontSize, setFontSize] = React.useState(clip.caption?.fontSize || 64);
  const initialPos = clip.caption?.position;
  const [position, setPosition] = React.useState<"BOTTOM_SAFE" | "CENTER" | "TOP">(
    initialPos === "CENTER" || initialPos === "TOP" ? initialPos : "BOTTOM_SAFE",
  );

  // Transcript cues state
  const [cues, setCues] = React.useState<SubtitleCue[]>(() => {
    if (clip.caption?.captionsJson && Array.isArray(clip.caption.captionsJson)) {
      return clip.caption.captionsJson.map((c) => ({
        start: c.start,
        end: c.end,
        text: c.text,
      }));
    }
    return [
      { start: clip.startTime, end: clip.endTime, text: clip.title },
    ];
  });

  // Framing & crop state
  const [aspectRatio, setAspectRatio] = React.useState<AspectRatio>(clip.aspectRatio);
  const [cropMode, setCropMode] = React.useState<CropMode>(clip.cropMode);
  const [focusX, setFocusX] = React.useState<number>(0.5);

  // Saving / Regenerating state
  const [isSaving, setIsSaving] = React.useState(false);
  const [isRegenerating, setIsRegenerating] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Active caption text for live preview overlay
  const activeCue = cues.find((c) => currentTime >= c.start && currentTime <= c.end);
  const activeCaptionText = activeCue?.text || cues[0]?.text || title;

  const handleCueTextChange = (index: number, newText: string) => {
    setCues((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], text: newText };
      }
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);
    try {
      const updated = await fetchApi<ClipDetailDTO>(`/api/v1/clips/${clip.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          description,
          category,
          startTime,
          endTime,
          presetId,
          fontSize,
          position,
        }),
      });

      onClipUpdated(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setErrorMessage(getErrorMessage(err, "Failed to save clip updates"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setErrorMessage(null);
    try {
      // 1. Save pending changes first
      await handleSave();

      // 2. Queue re-render job
      await fetchApi(`/api/v1/clips/${clip.id}/regenerate`, {
        method: "POST",
      });
    } catch (err) {
      setErrorMessage(getErrorMessage(err, "Failed to initiate clip regeneration"));
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Editing clip: ${clip.title}`}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5 overflow-y-auto"
    >
      <div className="relative w-full max-w-6xl rounded-2xl bg-white dark:bg-[#121212] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Modal Top Nav Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#141414] shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Video Editor Workspace
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">|</span>
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-md">
              {title}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-semibold shadow-xs hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50 transition-colors"
            >
              {isSaving ? (
                <>
                  <CircleNotch size={14} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle size={14} weight="fill" className="text-emerald-500" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <FloppyDisk size={14} />
                  <span>Save Changes</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close editor"
              className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <WarningCircle size={16} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Workspace Body: Split on desktop (Left: Preview & Timeline, Right: Inspector) */}
        <div className="flex-1 overflow-y-auto flex flex-col lg:flex-row">
          {/* Left Column: Video Preview Player & Dual-Handle Timeline */}
          <div className="lg:w-7/12 p-4 sm:p-5 flex flex-col justify-between space-y-4 border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#0c0c0c]">
            {/* Player */}
            <div className="flex-1 flex items-center justify-center min-h-[320px] sm:min-h-[420px]">
              <VideoPreviewPlayer
                videoUrl={clip.videoUrl}
                aspectRatio={aspectRatio}
                currentTime={currentTime}
                duration={duration}
                onTimeUpdate={setCurrentTime}
                onDurationChange={setDuration}
                onSeek={setCurrentTime}
                captionText={activeCaptionText}
                captionPreset={presetId}
                captionFontSize={fontSize}
                captionPosition={position}
                cropMode={cropMode}
                focusX={focusX}
              />
            </div>

            {/* Timeline Trim Track */}
            <TimelineTrimTrack
              totalDuration={duration}
              startTime={startTime}
              endTime={endTime}
              currentTime={currentTime}
              onTrimChange={(st, en) => {
                setStartTime(st);
                setEndTime(en);
              }}
              onSeek={setCurrentTime}
            />
          </div>

          {/* Right Column: Inspector Controls & Subtitle Editor */}
          <div className="lg:w-5/12 flex flex-col bg-white dark:bg-[#121212]">
            {/* Inspector Navigation Tabs */}
            <div className="flex items-center border-b border-zinc-200 dark:border-zinc-800 px-4 text-xs font-medium">
              {[
                { id: "captions", label: "Captions", icon: <TextT size={14} /> },
                { id: "crop", label: "Crop & Framing", icon: <Crop size={14} /> },
                { id: "export", label: "Export & Settings", icon: <FileArrowDown size={14} /> },
                { id: "scores", label: "AI Scores", icon: <Sparkle size={14} /> },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`flex items-center gap-1.5 py-3 px-3 border-b-2 font-semibold transition-colors ${
                      isActive
                        ? "border-zinc-950 dark:border-zinc-100 text-zinc-950 dark:text-zinc-50"
                        : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Panels */}
            <div className="flex-1 p-5 overflow-y-auto">
              {activeTab === "captions" && (
                <SubtitleTranscriptEditor
                  cues={cues}
                  currentTime={currentTime}
                  onCueChange={handleCueTextChange}
                  onSeek={setCurrentTime}
                  presetId={presetId}
                  onPresetChange={setPresetId}
                  fontSize={fontSize}
                  onFontSizeChange={setFontSize}
                  position={position}
                  onPositionChange={setPosition}
                />
              )}

              {activeTab === "crop" && (
                <AspectCropController
                  aspectRatio={aspectRatio}
                  onAspectRatioChange={setAspectRatio}
                  cropMode={cropMode}
                  onCropModeChange={setCropMode}
                  focusX={focusX}
                  onFocusXChange={setFocusX}
                />
              )}

              {activeTab === "export" && (
                <div className="space-y-5">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        Clip Title
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1A1A1A] px-3.5 py-2 text-xs text-zinc-950 dark:text-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        AI Description / Hook Reason
                      </label>
                      <textarea
                        rows={2}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1A1A1A] px-3.5 py-2 text-xs text-zinc-950 dark:text-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-950 resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        Category
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as ClipCategory)}
                        className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1A1A1A] px-3.5 py-2 text-xs text-zinc-950 dark:text-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                      >
                        {Object.values(ClipCategory).map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <ExportSettingsPanel
                    clipId={clip.id}
                    durationSeconds={endTime - startTime}
                    downloadUrl={clip.downloadUrl}
                    onRegenerate={handleRegenerate}
                    isRegenerating={isRegenerating}
                  />
                </div>
              )}

              {activeTab === "scores" && (
                <div className="space-y-4 text-xs">
                  <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
                        Overall Viral Potential
                      </span>
                      <h4 className="text-xl font-extrabold text-amber-950 dark:text-amber-200">
                        {clip.overallScore ?? 89}/100
                      </h4>
                    </div>
                    <Sparkle size={28} weight="fill" className="text-amber-500" />
                  </div>

                  <div className="space-y-3 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#181818]">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 block">
                      Multi-Factor Metric Breakdown
                    </span>

                    <div className="space-y-2.5">
                      <div>
                        <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                          <span>Opening Hook Strength</span>
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">{clip.hookScore ?? 92}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${clip.hookScore ?? 92}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                          <span>Engagement Potential</span>
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">{clip.engagementScore ?? 85}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${clip.engagementScore ?? 85}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-zinc-600 dark:text-zinc-400 mb-1">
                          <span>Context Completeness</span>
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">{clip.contextScore ?? 95}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${clip.contextScore ?? 95}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818]">
                    <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                      AI Selection Reasoning
                    </span>
                    <p className="text-zinc-500 leading-relaxed text-[11px]">
                      {clip.selectionReason || "Identified as a strong candidate with a clear opening statement, continuous narrative flow, and high standalone clarity."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
