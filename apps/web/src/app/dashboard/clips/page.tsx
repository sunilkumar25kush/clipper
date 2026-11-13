"use client";

import * as React from "react";
import {
  FilmSlate,
  Play,
  DownloadSimple,
  PencilSimple,
  Trash,
  MagnifyingGlass,
  Funnel,
  CaretLeft,
  CaretRight,
  Flame,
  CircleNotch,
} from "phosphor-react";
import { fetchApi, getErrorMessage } from "@/lib/api-client";
import { ClipDTO, ClipDetailDTO, DashboardMetricsDTO } from "@clipforge/shared-types";
import { LazyVideoEditorModal } from "@/components/editor";

export default function MyClipsPage() {
  const [clips, setClips] = React.useState<ClipDTO[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("ALL");
  const [sortBy, setSortBy] = React.useState<"score" | "duration">("score");
  const [isLoading, setIsLoading] = React.useState(true);

  // Pagination for large clip lists (virtualized / chunked pagination)
  const [page, setPage] = React.useState(1);
  const pageSize = 9;

  // Selected clip for lazy-loaded editor
  const [editingClip, setEditingClip] = React.useState<ClipDetailDTO | null>(null);
  const [isEditorOpen, setIsEditorOpen] = React.useState(false);

  const loadClips = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchApi<DashboardMetricsDTO>("/api/v1/dashboard/metrics");
      setClips(data.recentClips || []);
    } catch {
      setClips([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadClips();
  }, [loadClips]);

  const handleOpenEditor = async (clipId: string) => {
    try {
      const detail = await fetchApi<ClipDetailDTO>(`/api/v1/clips/${clipId}`);
      setEditingClip(detail);
      setIsEditorOpen(true);
    } catch (err) {
      alert(getErrorMessage(err, "Failed to load clip details for editing"));
    }
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setEditingClip(null);
  };

  const handleClipUpdated = (updated: ClipDetailDTO) => {
    setClips((prev) =>
      prev.map((c) =>
        c.id === updated.id
          ? {
              ...c,
              title: updated.title,
              description: updated.description,
              category: updated.category,
              overallScore: updated.overallScore,
              duration: updated.duration,
            }
          : c,
      ),
    );
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

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Filter and sort clips
  const filteredClips = React.useMemo(() => {
    let result = [...clips];

    if (selectedCategory !== "ALL") {
      result = result.filter((c) => c.category === selectedCategory);
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
      if (sortBy === "duration") {
        return b.duration - a.duration;
      }
      return 0;
    });

    return result;
  }, [clips, selectedCategory, searchQuery, sortBy]);

  // Paginated slice
  const totalPages = Math.ceil(filteredClips.length / pageSize) || 1;
  const paginatedClips = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredClips.slice(start, start + pageSize);
  }, [filteredClips, page, pageSize]);

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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
            My Generated Clips
          </h1>
          <p className="text-xs text-zinc-500">
            Browse, customize, and export high-retention short-form video clips extracted by ClipForge AI.
          </p>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
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
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search clips by title or category..."
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] pl-9 pr-3.5 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950"
            />
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 self-end sm:self-auto text-xs">
            <span className="text-zinc-500 font-medium flex items-center gap-1">
              <Funnel size={13} />
              <span>Sort by:</span>
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "score" | "duration")}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-950"
            >
              <option value="score">Highest Overall Score</option>
              <option value="duration">Clip Duration</option>
            </select>
          </div>
        </div>

        {/* Category filter pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-medium">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setSelectedCategory(cat);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? "bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold"
                  : "bg-white dark:bg-[#181818] border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
              }`}
            >
              {cat === "ALL" ? "All categories" : cat.charAt(0) + cat.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Clip Cards Grid */}
      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <CircleNotch size={28} className="animate-spin text-zinc-400" />
        </div>
      ) : filteredClips.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-12 text-center">
          <FilmSlate size={32} className="mx-auto text-zinc-400 mb-2" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
            No clips found
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            {searchQuery
              ? `No clips matching "${searchQuery}". Try a different keyword.`
              : selectedCategory !== "ALL"
              ? `No clips categorized under ${selectedCategory.toLowerCase()}.`
              : "Create a project to generate your first set of short viral clips."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {paginatedClips.map((clip) => {
            const downloadUrl = `/api/v1/videos/storage/exports%2Fclip_${clip.id}.mp4`;
            return (
              <div
                key={clip.id}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-4 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                      {clip.category}
                    </span>

                    {clip.overallScore !== undefined && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40">
                        <Flame size={12} weight="fill" className="text-amber-500" />
                        {clip.overallScore}/100
                      </span>
                    )}
                  </div>

                  <h3
                    onClick={() => handleOpenEditor(clip.id)}
                    className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2 mb-1.5 cursor-pointer hover:underline"
                  >
                    {clip.title}
                  </h3>

                  <p className="text-xs text-zinc-500 line-clamp-2 mb-3">
                    {clip.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Play size={12} weight="fill" />
                    {formatDuration(clip.duration)}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditor(clip.id)}
                      className="inline-flex items-center gap-1 font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors"
                    >
                      <PencilSimple size={13} />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteClip(clip.id, clip.title)}
                      title="Delete clip"
                      aria-label={`Delete clip: ${clip.title}`}
                      className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      <Trash size={13} />
                    </button>

                    <a
                      href={downloadUrl}
                      download={`clip_${clip.id}.mp4`}
                      className="inline-flex items-center gap-1 font-semibold text-primary hover:underline ml-1"
                    >
                      <DownloadSimple size={13} />
                      <span>Export</span>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls for Large Lists */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 disabled:opacity-40"
            aria-label="Previous page"
          >
            <CaretLeft size={16} />
          </button>
          <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium px-2">
            Page {page} of {totalPages} ({filteredClips.length} total clips)
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 disabled:opacity-40"
            aria-label="Next page"
          >
            <CaretRight size={16} />
          </button>
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
