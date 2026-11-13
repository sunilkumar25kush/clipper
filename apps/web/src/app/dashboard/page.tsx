"use client";

import * as React from "react";
import {
  FolderSimple,
  FilmSlate,
  Clock,
  Lightning,
  Plus,
  ArrowClockwise,
  WarningCircle,
} from "phosphor-react";
import { useAuth } from "@/context/auth-context";
import { fetchApi, ApiError } from "@/lib/api-client";
import { DashboardMetricsDTO, VideoProjectDTO } from "@clipforge/shared-types";
import { MetricCard } from "@/components/dashboard/metric-card";
import { RecentProjects } from "@/components/dashboard/recent-projects";
import { RecentClips } from "@/components/dashboard/recent-clips";
import { CreateProjectModal } from "@/components/dashboard/create-project-modal";

export default function DashboardOverviewPage() {
  const { user } = useAuth();
  const [metrics, setMetrics] = React.useState<DashboardMetricsDTO | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = React.useState(false);

  const loadMetrics = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchApi<DashboardMetricsDTO>("/api/v1/dashboard/metrics");
      setMetrics(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load dashboard metrics. Please refresh.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const handleProjectCreated = (newProject: VideoProjectDTO) => {
    setMetrics((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        totalProjects: prev.totalProjects + 1,
        recentProjects: [newProject, ...prev.recentProjects.slice(0, 4)],
      };
    });
  };

  return (
    <div className="space-y-8">
      {/* Welcome & Action Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
              Welcome back, {user?.fullName || "Creator"}
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              {metrics?.planTier || "FREE"} PLAN
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Monitor your video ingestion pipelines, AI processing jobs, and extracted clips.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 dark:bg-zinc-100 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white dark:text-zinc-950 shadow-xs hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.99] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary self-start sm:self-center"
        >
          <Plus size={16} weight="bold" />
          <span>New project</span>
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/30 p-4 text-xs text-red-700 dark:text-red-400"
        >
          <div className="flex items-center gap-2.5">
            <WarningCircle weight="fill" size={18} className="shrink-0" />
            <p>{error}</p>
          </div>
          <button
            type="button"
            onClick={loadMetrics}
            className="inline-flex items-center gap-1 font-semibold underline hover:no-underline"
          >
            <ArrowClockwise size={14} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Loading Skeletons vs Real Metric Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-5 animate-pulse flex flex-col justify-between"
            >
              <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded-md w-24" />
              <div className="h-8 bg-zinc-200 dark:bg-zinc-700 rounded-md w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Projects"
            value={metrics?.totalProjects ?? 0}
            subtext="Long-form videos processed"
            icon={FolderSimple}
          />
          <MetricCard
            label="Generated Clips"
            value={metrics?.generatedClips ?? 0}
            subtext="AI-extracted short moments"
            icon={FilmSlate}
          />
          <MetricCard
            label="Processing Videos"
            value={metrics?.processingVideos ?? 0}
            subtext="Active rendering & transcription"
            icon={Clock}
          />
          <MetricCard
            label="Available Credits"
            value={`${metrics?.availableCredits ?? 60}m`}
            subtext={`Of ${metrics?.totalAllocatedCredits ?? 60}m monthly allowance`}
            icon={Lightning}
          />
        </div>
      )}

      {/* Main Content Sections: Projects & Clips */}
      <div className="space-y-6">
        <RecentProjects
          projects={metrics?.recentProjects || []}
          onOpenCreateModal={() => setCreateModalOpen(true)}
        />

        <RecentClips clips={metrics?.recentClips || []} />
      </div>

      <CreateProjectModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleProjectCreated}
      />
    </div>
  );
}

