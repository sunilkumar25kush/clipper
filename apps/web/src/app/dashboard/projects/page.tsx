"use client";

import * as React from "react";
import Link from "next/link";
import {
  FolderSimple,
  MagnifyingGlass,
  Plus,
  Play,
  FilmStrip,
  CaretLeft,
  CaretRight,
  CircleNotch,
} from "phosphor-react";
import { fetchApi } from "@/lib/api-client";
import { VideoProjectDTO, ProjectStatus } from "@clipforge/shared-types";
import { CreateProjectModal } from "@/components/dashboard/create-project-modal";

export default function MyProjectsPage() {
  const [projects, setProjects] = React.useState<VideoProjectDTO[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
  const [isLoading, setIsLoading] = React.useState(true);
  const [createModalOpen, setCreateModalOpen] = React.useState(false);

  const loadProjects = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "9");
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetchApi<{
        projects: VideoProjectDTO[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/api/v1/projects?${params.toString()}`);

      if (Array.isArray(res)) {
        setProjects(res);
        setTotal(res.length);
        setTotalPages(1);
      } else if (res && typeof res === "object" && "projects" in res) {
        const data = res as { projects: VideoProjectDTO[]; total: number; totalPages: number };
        setProjects(data.projects || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      } else {
        setProjects([]);
      }
    } catch {
      // In case of network delay or initial empty state
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, search]);

  React.useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadProjects();
  };

  const getStatusBadge = (status: ProjectStatus) => {
    switch (status) {
      case "COMPLETED":
        return <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">Completed</span>;
      case "PROCESSING":
        return <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full">Processing</span>;
      case "QUEUED":
        return <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">Queued</span>;
      case "FAILED":
        return <span className="text-[11px] font-semibold text-red-600 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full">Failed</span>;
      default:
        return <span className="text-[11px] font-semibold text-zinc-600 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">Draft</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
            My Projects
          </h1>
          <p className="text-xs text-zinc-500">
            {total > 0
              ? `${total} video project${total === 1 ? "" : "s"} archived`
              : "Manage your long-form video archives and extracted clip sets."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-950 shadow-xs hover:bg-zinc-800 dark:hover:bg-white transition-colors self-start sm:self-center"
        >
          <Plus size={14} weight="bold" />
          <span>New project</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Status filters */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs font-medium">
          {["ALL", "COMPLETED", "PROCESSING", "DRAFT"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl transition-colors ${
                statusFilter === st
                  ? "bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold"
                  : "bg-white dark:bg-[#181818] border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
              }`}
            >
              {st === "ALL" ? "All projects" : st.charAt(0) + st.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative sm:w-64">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title..."
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] pl-9 pr-3 py-1.5 text-xs text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950"
          />
        </form>
      </div>

      {/* Project Grid */}
      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <CircleNotch size={28} className="animate-spin text-zinc-400" />
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-12 text-center">
          <FolderSimple size={32} className="mx-auto text-zinc-400 mb-2" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
            No projects found
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-4">
            {search || statusFilter !== "ALL"
              ? "No projects match your current filters. Try resetting search."
              : "You have not created any video clipping projects yet."}
          </p>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-950"
          >
            <Plus size={14} weight="bold" />
            <span>Create new project</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((proj) => (
            <Link
              key={proj.id}
              href={`/dashboard/projects/${proj.id}`}
              className="group rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-5 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-[#272727] text-zinc-700 dark:text-zinc-300 flex items-center justify-center group-hover:bg-zinc-950 group-hover:text-white transition-colors">
                    <Play size={14} weight="fill" />
                  </div>
                  {getStatusBadge(proj.status)}
                </div>

                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2 mb-2 group-hover:text-primary transition-colors">
                  {proj.title}
                </h3>

                <div className="space-y-1 text-xs text-zinc-500 mb-4">
                  <p>Aspect: {proj.targetAspect.replace("RATIO_", "").replace("_", ":")}</p>
                  <p>Source: {proj.sourceType === "AUTHORIZED_URL" ? "URL" : "Uploaded File"}</p>
                  <p className="flex items-center gap-1">
                    <FilmStrip size={13} />
                    <span>{proj.clipCount ?? 0} extracted clips</span>
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Created {new Date(proj.createdAt).toLocaleDateString()}</span>
                <span className="font-medium text-primary group-hover:translate-x-0.5 transition-transform">
                  View clips &rarr;
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 disabled:opacity-40"
            aria-label="Previous page"
          >
            <CaretLeft size={16} />
          </button>
          <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium px-2">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 disabled:opacity-40"
            aria-label="Next page"
          >
            <CaretRight size={16} />
          </button>
        </div>
      )}

      <CreateProjectModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={() => loadProjects()}
      />
    </div>
  );
}
