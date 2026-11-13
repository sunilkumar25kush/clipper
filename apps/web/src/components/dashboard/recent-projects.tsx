"use client";

import * as React from "react";
import Link from "next/link";
import { FolderSimple, ArrowRight, FilmStrip, Plus, Play, Clock } from "phosphor-react";
import { VideoProjectDTO, ProjectStatus } from "@clipforge/shared-types";

interface RecentProjectsProps {
  projects: VideoProjectDTO[];
  onOpenCreateModal: () => void;
}

export function RecentProjects({ projects, onOpenCreateModal }: RecentProjectsProps) {
  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-8 text-center shadow-xs">
        <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-[#272727] text-zinc-500 mx-auto flex items-center justify-center mb-3">
          <FolderSimple size={24} weight="bold" />
        </div>
        <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50 mb-1">
          No projects created yet
        </h3>
        <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-5 text-pretty">
          Upload a long-form video or paste a YouTube URL to automatically detect and extract high-retention short clips.
        </p>
        <button
          type="button"
          onClick={onOpenCreateModal}
          className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-950 shadow-xs hover:bg-zinc-800 dark:hover:bg-white transition-colors"
        >
          <Plus size={14} weight="bold" />
          <span>Create your first project</span>
        </button>
      </div>
    );
  }

  const getStatusBadge = (status: ProjectStatus, progress?: number | null) => {
    switch (status) {
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Completed
          </span>
        );
      case "PROCESSING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Processing {progress !== null ? `${progress}%` : ""}
          </span>
        );
      case "QUEUED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40">
            <Clock size={12} />
            Queued
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/40">
            Failed
          </span>
        );
      case "DRAFT":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
            Draft
          </span>
        );
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-5 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Recent Projects</h2>
          <p className="text-xs text-zinc-500">Your recent long-form video extractions</p>
        </div>
        <Link
          href="/dashboard/projects"
          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors"
        >
          <span>View all</span>
          <ArrowRight size={12} weight="bold" />
        </Link>
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
        {projects.map((project) => (
          <div
            key={project.id}
            className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-[#272727] text-zinc-600 dark:text-zinc-300 flex items-center justify-center shrink-0 mt-0.5">
                <Play size={16} weight="fill" />
              </div>

              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-primary transition-colors">
                  {project.title}
                </h3>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-zinc-500">
                  <span>{project.sourceType === "AUTHORIZED_URL" ? "URL Ingestion" : "File Upload"}</span>
                  <span>•</span>
                  <span>{project.targetAspect.replace("RATIO_", "").replace("_", ":")}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
                    <FilmStrip size={13} />
                    {project.clipCount ?? 0} clips
                  </span>
                  <span>•</span>
                  <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              {getStatusBadge(project.status, project.activeJobProgress)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
