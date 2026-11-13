"use client";

import * as React from "react";
import {
  Lightning,
  TextAa,
  UserFocus,
  ChartBar,
  FileVideo,
  ShieldCheck,
} from "phosphor-react";

const features = [
  {
    icon: Lightning,
    title: "Multimodal Moment Detection",
    description:
      "Gemini analyzes dialogue structure, humor, emotional peaks, and narrative turns to surface the top clips.",
  },
  {
    icon: UserFocus,
    title: "Deadzone Face Tracking",
    description:
      "OpenCV and MediaPipe track active speaker coordinates with deadzone stabilization, preventing shaky jitter in 9:16 cuts.",
  },
  {
    icon: TextAa,
    title: "Word-Level Karaoke Subtitles",
    description:
      "Dynamic .ass subtitle styling burned directly into video frames with millisecond word-by-word active highlighting.",
  },
  {
    icon: ChartBar,
    title: "Transparent Multi-Factor Scoring",
    description:
      "View separate Hook, Engagement, and Context Completeness scores alongside the AI's explicit selection reasoning.",
  },
  {
    icon: FileVideo,
    title: "Multi-Aspect Ratio Exports",
    description:
      "Export directly in 9:16 (Shorts/Reels/TikTok), 1:1 (LinkedIn/Instagram feed), or 16:9 widescreen formats.",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise Rights & SSRF Protection",
    description:
      "Strict tenant isolation, presigned direct S3/R2 uploads, and verified IP protection on all ingested media sources.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-20 md:py-28 border-t border-zinc-100 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Intelligent Video Engineering
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl text-balance">
            Engineered to preserve context and maximize watch retention
          </p>
          <p className="mt-4 text-base text-zinc-600">
            Most clippers slice at random volume spikes. ClipForge AI extracts complete, standalone thoughts.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="rounded-xl border border-zinc-200 bg-white p-7 shadow-xs hover:border-zinc-300 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 text-white mb-5 shadow-xs">
                  <Icon size={20} weight="bold" />
                </div>
                <h3 className="text-base font-semibold text-zinc-950">{feature.title}</h3>
                <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

