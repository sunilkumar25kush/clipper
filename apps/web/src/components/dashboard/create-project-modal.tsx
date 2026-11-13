"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X, CircleNotch, WarningCircle, FilmStrip, Link as LinkIcon, UploadSimple } from "phosphor-react";
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
  const [targetAspect, setTargetAspect] = React.useState<"RATIO_9_16" | "RATIO_16_9" | "RATIO_1_1">("RATIO_9_16");
  const [minClipDuration, setMinClipDuration] = React.useState(15);
  const [maxClipDuration, setMaxClipDuration] = React.useState(60);
  const [rightsAttested, setRightsAttested] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
      setError("Maximum clip duration must be greater than minimum duration.");
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
        className="relative w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-6 shadow-xl z-10 animate-in fade-in zoom-in-95 duration-200"
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
              <p className="text-xs text-zinc-500">Transform your long video into viral shorts</p>
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
                Min clip duration
              </label>
              <select
                id="min-dur"
                value={minClipDuration}
                onChange={(e) => setMinClipDuration(Number(e.target.value))}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] px-3 py-2 text-xs text-zinc-950 dark:text-zinc-50"
              >
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={45}>45 seconds</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="max-dur"
                className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Max clip duration
              </label>
              <select
                id="max-dur"
                value={maxClipDuration}
                onChange={(e) => setMaxClipDuration(Number(e.target.value))}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] px-3 py-2 text-xs text-zinc-950 dark:text-zinc-50"
              >
                <option value={60}>60 seconds (Shorts/Reels)</option>
                <option value={90}>90 seconds</option>
                <option value={120}>120 seconds</option>
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

