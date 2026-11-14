"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  X,
  CircleNotch,
  WarningCircle,
  FilmStrip,
  Link as LinkIcon,
  UploadSimple,
  Sparkle,
  Scissors,
  Info,
} from "phosphor-react";
import { fetchApi, ApiError } from "@/lib/api-client";
import { VideoProjectDTO, AspectRatio } from "@clipforge/shared-types";
import { VideoUploader } from "./video-uploader";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (project: VideoProjectDTO) => void;
}

export function CreateProjectModal({ isOpen, onClose, onCreated }: CreateProjectModalProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [sourceType, setSourceType] = React.useState<"FILE_UPLOAD" | "AUTHORIZED_URL">("FILE_UPLOAD");
  const [sourceUrl, setSourceUrl] = React.useState("");
  const [generationMode, setGenerationMode] = React.useState<"HIGHLIGHTS" | "PARTS">("HIGHLIGHTS");
  const [customInstructions, setCustomInstructions] = React.useState("");
  const [targetAspect, setTargetAspect] = React.useState<"RATIO_9_16" | "RATIO_16_9" | "RATIO_1_1">("RATIO_9_16");
  const [minClipDuration, setMinClipDuration] = React.useState(15);
  const [maxClipDuration, setMaxClipDuration] = React.useState(60);
  const [rightsAttested, setRightsAttested] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Contextually adapt default durations when toggling generation mode
  React.useEffect(() => {
    if (generationMode === "PARTS") {
      setMinClipDuration(45);
      setMaxClipDuration(180);
    } else {
      setMinClipDuration(15);
      setMaxClipDuration(60);
    }
  }, [generationMode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Please provide a title for your project.");
      return;
    }

    if (sourceType === "AUTHORIZED_URL" && !sourceUrl.trim()) {
      setError("Please enter a valid video URL.");
      return;
    }

    if (!rightsAttested) {
      setError("You must confirm rights or authorization to process this video.");
      return;
    }

    if (maxClipDuration <= minClipDuration) {
      setError("Maximum duration must be greater than minimum duration.");
      return;
    }

    setIsSubmitting(true);
    try {
      const newProject = await fetchApi<VideoProjectDTO>("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          sourceType,
          sourceUrl: sourceType === "AUTHORIZED_URL" ? sourceUrl.trim() : undefined,
          targetAspect,
          minClipDuration,
          maxClipDuration,
          maxClipsToGen: 10,
          generationMode,
          customInstructions: customInstructions.trim() || undefined,
          rightsAttested: true,
        }),
      });

      // Automatically trigger clipping job
      try {
        await fetchApi(`/api/v1/projects/${newProject.id}/jobs`, {
          method: "POST",
          body: JSON.stringify({
            projectId: newProject.id,
            targetAspect,
            minClipDuration,
            maxClipDuration,
            maxClipsToGen: 10,
            generationMode,
            customInstructions: customInstructions.trim() || undefined,
          }),
        });
      } catch (jobErr) {
        console.warn("Auto-trigger job warning:", jobErr);
      }

      onCreated(newProject);
      onClose();
      // Reset form
      setTitle("");
      setSourceUrl("");
      setCustomInstructions("");
      router.push(`/dashboard/projects/${newProject.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to create project. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-6 shadow-xl z-10 animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800 mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center">
              <FilmStrip size={18} weight="bold" />
            </div>
            <div>
              <h2 id="create-project-title" className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                New Clipping Project
              </h2>
              <p className="text-xs text-zinc-500">Transform your long video into viral shorts or sequential parts</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md transition-colors"
            aria-label="Close dialog"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-400"
            >
              <WarningCircle weight="fill" className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <div>
            <label
              htmlFor="project-title"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Project title
            </label>
            <input
              id="project-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Deep Dive Podcast Ep 12"
              disabled={isSubmitting}
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] px-3.5 py-2 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-200 transition-colors disabled:opacity-50"
            />
          </div>

          {/* GENERATION MODE SELECTOR */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5">
              Generation Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setGenerationMode("HIGHLIGHTS")}
                className={`relative flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                  generationMode === "HIGHLIGHTS"
                    ? "border-zinc-950 dark:border-zinc-100 bg-zinc-50 dark:bg-[#252525] ring-1 ring-zinc-950 dark:ring-zinc-100"
                    : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-[#1E1E1E] text-zinc-600 dark:text-zinc-400"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                  <Sparkle size={15} weight="fill" className="text-amber-500" />
                  <span>AI Smart Highlights</span>
                </div>
                <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                  Automatically discover the most viral, high-value, and engaging moments across the video.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setGenerationMode("PARTS")}
                className={`relative flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                  generationMode === "PARTS"
                    ? "border-zinc-950 dark:border-zinc-100 bg-zinc-50 dark:bg-[#252525] ring-1 ring-zinc-950 dark:ring-zinc-100"
                    : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-[#1E1E1E] text-zinc-600 dark:text-zinc-400"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                  <Scissors size={15} weight="bold" className="text-blue-500" />
                  <span>Split Video into Parts</span>
                </div>
                <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                  Divide the entire video chronologically into continuous Part 1, Part 2, ... without gaps.
                </p>
              </button>
            </div>
          </div>

          {/* PARTS MODE CONTEXTUAL BANNER */}
          {generationMode === "PARTS" && (
            <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/20 p-2.5 text-xs text-blue-800 dark:text-blue-300">
              <Info size={16} weight="fill" className="shrink-0 mt-0.5" />
              <p className="leading-snug">
                <strong>Sequential Timeline Coverage:</strong> The entire video will be divided chronologically into continuous parts (Part 1, Part 2, ...) aligned with natural topic transitions without gaps.
              </p>
            </div>
          )}

          {/* CUSTOM AI INSTRUCTIONS */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="custom-instructions"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
              >
                Custom AI Instructions (Optional)
              </label>
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                {customInstructions.length} / 2000
              </span>
            </div>
            <textarea
              id="custom-instructions"
              rows={3}
              maxLength={2000}
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Tell AI what kind of clips you want. Example: Find funny conversations, powerful life lessons, business insights and interesting facts. Prioritize moments with strong hooks and valuable information."
              disabled={isSubmitting}
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] px-3.5 py-2 text-xs text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-200 transition-colors disabled:opacity-50 resize-none leading-relaxed"
            />
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              Describe the type of content you want AI to discover. Leave empty to let AI automatically find the best moments.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5">
              Source type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSourceType("AUTHORIZED_URL")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-medium transition-colors ${
                  sourceType === "AUTHORIZED_URL"
                    ? "border-zinc-950 dark:border-zinc-100 bg-zinc-100 dark:bg-[#272727] text-zinc-950 dark:text-zinc-50 font-semibold"
                    : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                <LinkIcon size={14} />
                <span>Video URL</span>
              </button>

              <button
                type="button"
                onClick={() => setSourceType("FILE_UPLOAD")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-medium transition-colors ${
                  sourceType === "FILE_UPLOAD"
                    ? "border-zinc-950 dark:border-zinc-100 bg-zinc-100 dark:bg-[#272727] text-zinc-950 dark:text-zinc-50 font-semibold"
                    : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                <UploadSimple size={14} />
                <span>File upload</span>
              </button>
            </div>
          </div>

          {sourceType === "AUTHORIZED_URL" ? (
            <div>
              <label
                htmlFor="source-url"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Video URL (YouTube, Loom, Vimeo)
              </label>
              <input
                id="source-url"
                type="url"
                required
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                disabled={isSubmitting}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] px-3.5 py-2 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-200 transition-colors disabled:opacity-50"
              />
            </div>
          ) : (
            <div className="pt-1">
              <VideoUploader
                targetAspect={targetAspect as AspectRatio}
                minClipDuration={minClipDuration}
                maxClipDuration={maxClipDuration}
                rightsAttested={rightsAttested}
                generationMode={generationMode}
                customInstructions={customInstructions}
                onUploadSuccess={async (createdProject) => {
                  try {
                    await fetchApi(`/api/v1/projects/${createdProject.id}/jobs`, {
                      method: "POST",
                      body: JSON.stringify({
                        projectId: createdProject.id,
                        targetAspect,
                        minClipDuration,
                        maxClipDuration,
                        maxClipsToGen: 10,
                        generationMode,
                        customInstructions: customInstructions.trim() || undefined,
                      }),
                    });
                  } catch (jobErr) {
                    console.warn("Auto-trigger job warning:", jobErr);
                  }
                  onCreated(createdProject);
                  onClose();
                  router.push(`/dashboard/projects/${createdProject.id}`);
                }}
                onCancel={onClose}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5">
              Target aspect ratio
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTargetAspect("RATIO_9_16")}
                className={`py-2 px-2.5 rounded-xl border text-xs font-medium text-center transition-colors ${
                  targetAspect === "RATIO_9_16"
                    ? "border-zinc-950 dark:border-zinc-100 bg-zinc-100 dark:bg-[#272727] text-zinc-950 dark:text-zinc-50 font-semibold"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                9:16 Vertical
              </button>
              <button
                type="button"
                onClick={() => setTargetAspect("RATIO_1_1")}
                className={`py-2 px-2.5 rounded-xl border text-xs font-medium text-center transition-colors ${
                  targetAspect === "RATIO_1_1"
                    ? "border-zinc-950 dark:border-zinc-100 bg-zinc-100 dark:bg-[#272727] text-zinc-950 dark:text-zinc-50 font-semibold"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                1:1 Square
              </button>
              <button
                type="button"
                onClick={() => setTargetAspect("RATIO_16_9")}
                className={`py-2 px-2.5 rounded-xl border text-xs font-medium text-center transition-colors ${
                  targetAspect === "RATIO_16_9"
                    ? "border-zinc-950 dark:border-zinc-100 bg-zinc-100 dark:bg-[#272727] text-zinc-950 dark:text-zinc-50 font-semibold"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                16:9 Wide
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="min-dur"
                className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
              >
                {generationMode === "PARTS" ? "Min part duration" : "Min clip duration"}
              </label>
              <select
                id="min-dur"
                value={minClipDuration}
                onChange={(e) => setMinClipDuration(Number(e.target.value))}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] px-3 py-2 text-xs text-zinc-950 dark:text-zinc-50"
              >
                {generationMode === "PARTS" ? (
                  <>
                    <option value={30}>30 seconds</option>
                    <option value={45}>45 seconds</option>
                    <option value={60}>60 seconds</option>
                    <option value={90}>90 seconds</option>
                  </>
                ) : (
                  <>
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={45}>45 seconds</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label
                htmlFor="max-dur"
                className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
              >
                {generationMode === "PARTS" ? "Max part duration" : "Max clip duration"}
              </label>
              <select
                id="max-dur"
                value={maxClipDuration}
                onChange={(e) => setMaxClipDuration(Number(e.target.value))}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] px-3 py-2 text-xs text-zinc-950 dark:text-zinc-50"
              >
                {generationMode === "PARTS" ? (
                  <>
                    <option value={120}>2 minutes (120s)</option>
                    <option value={180}>3 minutes (180s)</option>
                    <option value={300}>5 minutes (300s)</option>
                  </>
                ) : (
                  <>
                    <option value={60}>60 seconds (Shorts/Reels)</option>
                    <option value={90}>90 seconds</option>
                    <option value={120}>120 seconds</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-start gap-2.5 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={rightsAttested}
                onChange={(e) => setRightsAttested(e.target.checked)}
                className="mt-0.5 rounded-sm border-zinc-300 dark:border-zinc-700 text-primary focus:ring-primary"
              />
              <span className="leading-relaxed">
                I attest that I own or have permission to process and repurpose this content.
              </span>
            </label>
          </div>

          {sourceType === "AUTHORIZED_URL" && (
            <div className="pt-3 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-xl border border-zinc-200 dark:border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-[#272727] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !rightsAttested}
                className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <CircleNotch size={14} className="animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Create project</span>
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

