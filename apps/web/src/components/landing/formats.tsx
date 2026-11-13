"use client";

import * as React from "react";
import { DeviceMobile, Monitor, SquaresFour } from "phosphor-react";

const formats = [
  {
    ratio: "9:16 Vertical",
    dims: "1080 × 1920",
    destinations: "YouTube Shorts, Instagram Reels, TikTok",
    icon: DeviceMobile,
    desc: "AI face centering automatically reframes horizontal speakers into vertical feeds.",
  },
  {
    ratio: "1:1 Square",
    dims: "1080 × 1080",
    destinations: "LinkedIn Video, Instagram Feed, Twitter / X",
    icon: SquaresFour,
    desc: "Balanced framing optimized for professional social feeds and square video embeds.",
  },
  {
    ratio: "16:9 Landscape",
    dims: "1920 × 1080",
    destinations: "YouTube Standard, Facebook Video, Web Portals",
    icon: Monitor,
    desc: "Preserves full wide shots with dynamic karaoke subtitles added to bottom safe zones.",
  },
];

export function Formats() {
  return (
    <section className="py-20 md:py-28 border-t border-zinc-100 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Export Flexibility
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl text-balance">
            Every platform format rendered in one click
          </p>
          <p className="mt-4 text-base text-zinc-600">
            Full 1080p 60fps high-bitrate MP4 exports with perfectly burned subtitle overlays.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
          {formats.map((fmt, idx) => {
            const Icon = fmt.icon;
            return (
              <div
                key={idx}
                className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-zinc-50/50 p-6"
              >
                <div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 text-white mb-5 shadow-xs">
                    <Icon size={20} weight="bold" />
                  </div>
                  <h3 className="text-base font-semibold text-zinc-950">{fmt.ratio}</h3>
                  <span className="inline-block mt-1 font-mono text-xs text-zinc-500 bg-zinc-200/60 px-2 py-0.5 rounded">
                    {fmt.dims}
                  </span>
                  <p className="mt-3 text-sm text-zinc-600 leading-relaxed">{fmt.desc}</p>
                </div>
                <div className="mt-6 pt-4 border-t border-zinc-200/60">
                  <span className="text-xs font-medium text-zinc-700">Best for: </span>
                  <span className="text-xs text-zinc-500">{fmt.destinations}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

