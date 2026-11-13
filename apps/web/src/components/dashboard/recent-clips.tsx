"use client";

import * as React from "react";
import Link from "next/link";
import { FilmSlate, ArrowRight, Sparkle, Play } from "phosphor-react";
import { ClipDTO } from "@clipforge/shared-types";

interface RecentClipsProps {
  clips: ClipDTO[];
}

export function RecentClips({ clips }: RecentClipsProps) {
  if (clips.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-8 text-center shadow-xs">
        <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-[#272727] text-zinc-500 mx-auto flex items-center justify-center mb-3">
          <FilmSlate size={24} weight="bold" />
        </div>
        <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50 mb-1">
          No generated clips yet
        </h3>
        <p className="text-xs text-zinc-500 max-w-sm mx-auto text-pretty">
          Clips created from your video projects will appear here, scored and ready to download.
        </p>
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-5 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Recent Generated Clips</h2>
          <p className="text-xs text-zinc-500">AI-extracted moments ready to review</p>
        </div>
        <Link
          href="/dashboard/clips"
          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors"
        >
          <span>View gallery</span>
          <ArrowRight size={12} weight="bold" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {clips.map((clip) => (
          <div
            key={clip.id}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#1F1F1F] p-3.5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                  {clip.category}
                </span>

                {clip.overallScore !== undefined && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40">
                    <Sparkle size={11} weight="fill" />
                    {clip.overallScore}/100
                  </span>
                )}
              </div>

              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2 mb-1.5">
                {clip.title}
              </h4>

              {clip.projectTitle && (
                <p className="text-xs text-zinc-500 truncate mb-3">
                  From: {clip.projectTitle}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-200/60 dark:border-zinc-800 text-xs text-zinc-500">
              <span className="flex items-center gap-1">
                <Play size={12} weight="fill" />
                {formatDuration(clip.duration)}
              </span>
              <span>{clip.aspectRatio.replace("RATIO_", "").replace("_", ":")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

