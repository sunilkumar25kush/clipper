import * as React from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ComponentType<{ size?: number | string; weight?: "regular" | "bold" | "fill" | "duotone"; className?: string }>;
}

export function MetricCard({ label, value, subtext, icon: Icon }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-5 shadow-xs transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-[#272727] flex items-center justify-center text-zinc-700 dark:text-zinc-300">
          <Icon size={18} weight="bold" />
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
          {value}
        </span>
      </div>

      {subtext && (
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {subtext}
        </p>
      )}
    </div>
  );
}

