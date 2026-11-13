"use client";

import * as React from "react";
import {
  DownloadSimple,
  ArrowsClockwise,
  CheckCircle,
  CircleNotch,
  FileVideo,
} from "phosphor-react";

export interface ExportSettingsPanelProps {
  clipId: string;
  durationSeconds: number;
  downloadUrl?: string | null;
  onRegenerate: () => Promise<void>;
  isRegenerating: boolean;
  hasWatermark?: boolean;
}

export const ExportSettingsPanel: React.FC<ExportSettingsPanelProps> = ({
  clipId,
  durationSeconds,
  downloadUrl,
  onRegenerate,
  isRegenerating,
  hasWatermark = false,
}) => {
  const [resolution, setResolution] = React.useState<"1080p" | "720p">("1080p");
  const [isSuccess, setIsSuccess] = React.useState(false);

  // Approximate file size estimate based on standard 1080p 6Mbps / 720p 3Mbps presets
  const bitrateMbps = resolution === "1080p" ? 6 : 3;
  const estimatedSizeBytes = (durationSeconds * bitrateMbps * 1024 * 1024) / 8;
  const estimatedSizeMb = (estimatedSizeBytes / (1024 * 1024)).toFixed(1);

  const handleRegenerateClick = async () => {
    setIsSuccess(false);
    await onRegenerate();
    setIsSuccess(true);
    setTimeout(() => setIsSuccess(false), 3000);
  };

  return (
    <div className="space-y-5 text-xs">
      {/* Resolution & Quality Options */}
      <div>
        <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 mb-2">
          <FileVideo size={15} />
          <span>Export Quality & Resolution</span>
        </span>

        <div className="grid grid-cols-2 gap-2">
          {[
            {
              id: "1080p",
              title: "1080p FHD",
              desc: "1080x1920 • 60fps (Recommended for Reels & Shorts)",
            },
            {
              id: "720p",
              title: "720p HD",
              desc: "720x1280 • Fast export & smaller file size",
            },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setResolution(item.id as "1080p" | "720p")}
              className={`p-3 rounded-xl border text-left transition-all ${
                resolution === item.id
                  ? "border-zinc-950 dark:border-zinc-100 bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-xs"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
              }`}
            >
              <span className="font-semibold block mb-0.5">{item.title}</span>
              <p className="text-[10px] opacity-75">{item.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Export Metadata Summary */}
      <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#181818] space-y-2">
        <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
          <span>Format & Codec</span>
          <span className="font-mono text-zinc-900 dark:text-zinc-100 font-semibold">
            MP4 (H.264 / AAC 192k)
          </span>
        </div>
        <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
          <span>Estimated File Size</span>
          <span className="font-mono text-zinc-900 dark:text-zinc-100 font-semibold">
            ~{estimatedSizeMb} MB
          </span>
        </div>
        <div className="flex justify-between text-zinc-600 dark:text-zinc-400 items-center">
          <span>Branding Watermark</span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              hasWatermark
                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
            }`}
          >
            {hasWatermark ? "Watermarked (Free Tier)" : "No Watermark"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-2">
        <button
          type="button"
          disabled={isRegenerating}
          onClick={handleRegenerateClick}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 font-semibold shadow-xs hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50 transition-colors"
        >
          {isRegenerating ? (
            <>
              <CircleNotch size={15} className="animate-spin" />
              <span>Queueing Render Job...</span>
            </>
          ) : isSuccess ? (
            <>
              <CheckCircle size={15} weight="fill" className="text-emerald-400" />
              <span>Queued For Re-Render!</span>
            </>
          ) : (
            <>
              <ArrowsClockwise size={15} weight="bold" />
              <span>Regenerate Clip With Changes</span>
            </>
          )}
        </button>

        {downloadUrl && (
          <a
            href={downloadUrl}
            download={`clipforge_${clipId}.mp4`}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] text-zinc-900 dark:text-zinc-100 font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <DownloadSimple size={15} weight="bold" />
            <span>Download MP4 Now</span>
          </a>
        )}
      </div>
    </div>
  );
};
