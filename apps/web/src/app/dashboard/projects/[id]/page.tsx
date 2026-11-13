"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CircleNotch,
  DownloadSimple,
  FilmSlate,
  Funnel,
  PencilSimple,
  Play,
  Trash,
  MagnifyingGlass,
  Flame,
  WarningCircle,
} from "phosphor-react";
import { fetchApi, getErrorMessage } from "@/lib/api-client";
import {
  ProjectDetailDTO,
  ClipDetailDTO,
  ProjectStatus,
} from "@clipforge/shared-types";
import { LazyVideoEditorModal } from "@/components/editor";

export default function ProjectWorkspacePage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [project, setProject] = React.useState<ProjectDetailDTO | null>(null);
  const [clips, setClips] = React.useState<ClipDetailDTO[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filters and sorting
  const [searchQuery, setSearchQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("ALL");
  const [sortBy, setSortBy] = React.useState<"score" | "hook" | "duration">("score");

  // Selected clip for lazy-loaded editor modal
  const [editingClip, setEditingClip] = React.useState<ClipDetailDTO | null>(null);
  const [isEditorOpen, setIsEditorOpen] = React.useState(false);

  const loadProject = React.useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await fetchApi<ProjectDetailDTO>(`/api/v1/projects/${projectId}`);
      setProject(data);
      setClips(data.clips || []);
      setError(null);
    } catch (err) {
      if (!silent) {
        setError(getErrorMessage(err, "Failed to load project details"));
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [projectId]);

  // Initial load
  React.useEffect(() => {
    if (projectId) {
      loadProject();
    }
  }, [projectId, loadProject]);

  // Polling if job is processing or queued
  React.useEffect(() => {
    if (
      project?.status === ProjectStatus.PROCESSING ||
      project?.status === ProjectStatus.QUEUED
    ) {
      const interval = setInterval(() => {
        loadProject(true);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [project?.status, loadProject]);

  const handleOpenEditor = (clip: ClipDetailDTO) => {
    setEditingClip(clip);
    setIsEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setEditingClip(null);
  };

  const handleClipUpdated = (updated: ClipDetailDTO) => {
    setClips((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setEditingClip(updated);
  };

  const handleDeleteClip = async (clipId: string, clipTitle: string) => {
    if (!window.confirm(`Are you sure you want to delete "${clipTitle}"?`)) {
      return;
    }

    try {
      await fetchApi(`/api/v1/clips/${clipId}`, {
        method: "DELETE",
      });
      setClips((prev) => prev.filter((c) => c.id !== clipId));
    } catch (err) {
      alert(getErrorMessage(err, "Failed to delete clip"));
    }
  };

  // Filter and sort clips
  const filteredClips = React.useMemo(() => {
    let result = [...clips];

    if (categoryFilter !== "ALL") {
      result = result.filter((c) => c.category === categoryFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q),
      );
    }

    result.sort((a, b) => {
      if (sortBy === "score") {
        return (b.overallScore ?? 0) - (a.overallScore ?? 0);
      }
      if (sortBy === "hook") {
        return (b.hookScore ?? 0) - (a.hookScore ?? 0);
      }
      if (sortBy === "duration") {
        return b.duration - a.duration;
      }
      return 0;
    });

    return result;
  }, [clips, categoryFilter, searchQuery, sortBy]);

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainingSecs = Math.floor(sec % 60);
    return `${mins}:${remainingSecs < 10 ? "0" : ""}${remainingSecs}`;
  };

  const categories = [
    "ALL",
    "HOOK",
    "EDUCATIONAL",
    "FUNNY",
    "MOTIVATIONAL",
    "STORYTELLING",
    "EMOTIONAL",
    "DISCUSSION",
    "INSIGHT",
  ];

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-3">
        <CircleNotch size={32} className="animate-spin text-zinc-400" />
        <p className="text-xs text-zinc-500">Loading project workspace...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-8 text-center max-w-lg mx-auto my-12">
        <WarningCircle size={32} className="mx-auto text-red-500 mb-2" />
        <h2 className="text-sm font-semibold text-red-950 dark:text-red-200 mb-1">
          {error || "Project Not Found"}
        </h2>
        <p className="text-xs text-red-700 dark:text-red-400 mb-4">
          This project may have been deleted or you do not have permission to access it.
        </p>
        <Link
          href="/dashboard/projects"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-semibold"
        >
          <ArrowLeft size={14} />
          <span>Back to Projects</span>
        </Link>
      </div>
    );
  }

  const isProcessing =
    project.status === ProjectStatus.PROCESSING || project.status === ProjectStatus.QUEUED;

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div>
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
          <Link
            href="/dashboard/projects"
            className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors flex items-center gap-1"
          >
            <ArrowLeft size={12} />
            <span>Projects</span>
          </Link>
          <span>/</span>
          <span className="text-zinc-900 dark:text-zinc-100 font-medium truncate max-w-xs">
            {project.title}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
                {project.title}
              </h1>
              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                  project.status === ProjectStatus.COMPLETED
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40"
                    : isProcessing
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {project.status}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
              <span>Target: {project.targetAspect.replace("RATIO_", "").replace("_", ":")}</span>
              <span>•</span>
              <span>{clips.length} AI-extracted clips</span>
              <span>•</span>
              <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Processing Pipeline Bar (if active) */}
      {isProcessing && (
        <div className="rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-2">
              <CircleNotch size={14} className="animate-spin text-blue-600" />
              <span>
                Processing Video:{" "}
                <span className="font-normal capitalize">
                  {project.activeJobStage ? project.activeJobStage.replace("_", " ").toLowerCase() : "analyzing media"}...
                </span>
              </span>
            </span>
            <span className="font-bold text-blue-700 dark:text-blue-400">
              {project.activeJobProgress ?? 10}%
            </span>
          </div>

          <div className="w-full h-2 rounded-full bg-blue-200/60 dark:bg-blue-900/40 overflow-hidden">
            <div
              className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${project.activeJobProgress ?? 10}%` }}
            />
          </div>

          <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80">
            ClipForge AI is transcribing audio, identifying high-hook moments, and burning dynamic captions. Clips will automatically populate below once ready.
          </p>
        </div>
      )}

      {/* Search, Filter and Sorting Controls */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-sm">
            <MagnifyingGlass
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clips by keyword or category..."
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] pl-9 pr-3.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950"
            />
          </div>

          {/* Sort selector */}
          <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
            <span className="text-zinc-500 font-medium flex items-center gap-1">
              <Funnel size={13} />
              <span>Sort by:</span>
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "score" | "hook" | "duration")}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-950"
            >
              <option value="score">Highest Overall Score</option>
              <option value="hook">Hook Strength</option>
              <option value="duration">Duration</option>
            </select>
          </div>
        </div>

        {/* Category filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-medium">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap ${
                categoryFilter === cat
                  ? "bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold"
                  : "bg-white dark:bg-[#181818] border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              {cat === "ALL" ? "All Clips" : cat.charAt(0) + cat.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Clip Gallery Grid */}
      {filteredClips.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-12 text-center">
          <FilmSlate size={36} className="mx-auto text-zinc-400 mb-2" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
            {isProcessing ? "Generating clips..." : "No clips found"}
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            {isProcessing
              ? "Your source video is currently in the AI processing queue. Extracted clips will appear here shortly."
              : searchQuery
              ? `No clips matching "${searchQuery}". Try a different search term.`
              : "No clips match the selected category filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredClips.map((clip) => (
            <div
              key={clip.id}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] overflow-hidden shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between"
            >
              <div>
                {/* Media Preview Box */}
                <div
                  onClick={() => handleOpenEditor(clip)}
                  className="relative aspect-9/16 sm:aspect-video w-full bg-zinc-950 flex items-center justify-center cursor-pointer group overflow-hidden"
                >
                  {clip.thumbnailUrl ? (
                    <img
                      src={clip.thumbnailUrl}
                      alt={clip.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-zinc-500">
                      <FilmSlate size={28} />
                      <span className="text-[10px] mt-1">Clip Preview</span>
                    </div>
                  )}

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                    <div className="w-10 h-10 rounded-full bg-white/90 text-zinc-950 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                      <Play size={16} weight="fill" className="ml-0.5" />
                    </div>
                  </div>

                  {/* Duration Tag */}
                  <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-xs text-[10px] font-semibold text-white">
                    {formatSeconds(clip.duration)}
                  </div>

                  {/* Viral Score Badge */}
                  {clip.overallScore !== undefined && (
                    <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/90 text-black shadow-sm">
                      <Flame size={12} weight="fill" />
                      <span>{clip.overallScore}/100</span>
                    </div>
                  )}
                </div>

                {/* Card Content */}
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      {clip.category}
                    </span>
                    {clip.hookScore !== undefined && (
                      <span className="text-[10px] text-zinc-500 font-medium">
                        Hook: {clip.hookScore}%
                      </span>
                    )}
                  </div>

                  <h3
                    onClick={() => handleOpenEditor(clip)}
                    className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2 mb-1.5 cursor-pointer hover:underline"
                  >
                    {clip.title}
                  </h3>

                  <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                    {clip.description}
                  </p>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEditor(clip)}
                    className="inline-flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors"
                  >
                    <PencilSimple size={14} />
                    <span>Open Editor</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteClip(clip.id, clip.title)}
                    title="Delete clip"
                    aria-label={`Delete clip: ${clip.title}`}
                    className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                  >
                    <Trash size={14} />
                  </button>
                </div>

                {clip.downloadUrl && (
                  <a
                    href={clip.downloadUrl}
                    download={`clipforge_${clip.id}.mp4`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold hover:bg-zinc-800 dark:hover:bg-white transition-colors"
                  >
                    <DownloadSimple size={13} weight="bold" />
                    <span>Download</span>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lazy-Loaded Video Editor Modal */}
      {isEditorOpen && editingClip && (
        <LazyVideoEditorModal
          clip={editingClip}
          isOpen={isEditorOpen}
          onClose={handleCloseEditor}
          onClipUpdated={handleClipUpdated}
        />
      )}
    </div>
  );
}
