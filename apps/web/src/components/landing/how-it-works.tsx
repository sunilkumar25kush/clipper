"use client";

import * as React from "react";
import { UploadSimple, Brain, Crop, Export } from "phosphor-react";

const steps = [
  {
    step: "01",
    title: "Ingest Video",
    description:
      "Upload MP4 or MOV files directly up to 10 GB, or paste authorized direct media links with verified rights.",
    icon: UploadSimple,
  },
  {
    step: "02",
    title: "Transcribe & Diarize",
    description:
      "Whisper transcribes every word with millisecond precision while Pyannote diarizes distinct speaker turns.",
    icon: Brain,
  },
  {
    step: "03",
    title: "Detect & Reframe",
    description:
      "Gemini scores narrative moments while OpenCV tracks active speaker faces for stabilized 9:16 vertical cropping.",
    icon: Crop,
  },
  {
    step: "04",
    title: "Export & Publish",
    description:
      "Download high-bitrate 1080p clips with burned-in karaoke subtitles ready for YouTube Shorts, Reels, and TikTok.",
    icon: Export,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 md:py-28 border-t border-zinc-100 bg-zinc-50/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Automated Workflow
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl text-balance">
            From raw episode to viral clips in four simple steps
          </p>
          <p className="mt-4 text-base text-zinc-600">
            No manual timeline scrubbing, keyframe shifting, or transcription editing required.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="relative flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-6 shadow-xs hover:border-zinc-300 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="font-mono text-xs font-semibold text-zinc-400">
                      STEP {item.step}
                    </span>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900">
                      <Icon size={18} weight="bold" />
                    </div>
                  </div>
                  <h3 className="text-base font-semibold text-zinc-950">{item.title}</h3>
                  <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

