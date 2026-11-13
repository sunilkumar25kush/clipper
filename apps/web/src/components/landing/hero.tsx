"use client";

import * as React from "react";
import { Sparkle, ArrowRight, Play, CheckCircle } from "phosphor-react";

export function Hero() {
  const [videoUrl, setVideoUrl] = React.useState("");
  const [demoState, setDemoState] = React.useState<"idle" | "simulating" | "preview">("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const handleDemoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrl.trim()) {
      setErrorMsg("Please paste a direct video link or try the sample link below.");
      return;
    }
    setErrorMsg(null);
    setDemoState("simulating");
    setTimeout(() => {
      setDemoState("preview");
    }, 1200);
  };

  const handleUseSample = () => {
    setVideoUrl("https://media.clipforge.ai/samples/founder_podcast_ep42.mp4");
    setErrorMsg(null);
  };

  return (
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-32 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Value Tagline Pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50/80 px-3.5 py-1 text-xs font-medium text-zinc-700 mb-8 shadow-xs">
          <Sparkle size={14} weight="fill" className="text-zinc-950" />
          <span>Multimodal Moment Detection with Whisper and Gemini</span>
        </div>

        {/* Heading */}
        <h1 className="mx-auto max-w-[680px] text-4xl font-bold tracking-tight text-zinc-950 sm:text-6xl text-balance">
          Turn long videos into short, engaging clips with AI
        </h1>

        {/* Subheading */}
        <p className="mx-auto mt-6 max-w-[680px] text-base leading-relaxed text-zinc-600 sm:text-lg text-pretty">
          Upload any podcast, interview, or webinar. ClipForge AI transcribes every word,
          identifies high-retention stories and punchlines, reframes active speakers into vertical
          format, and generates ready-to-publish short clips.
        </p>

        {/* Primary & Secondary Action CTAs */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/dashboard"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-950 px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 active:bg-zinc-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
          >
            <span>Start Free Trial</span>
            <ArrowRight size={16} weight="bold" />
          </a>
          <a
            href="#how-it-works"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-6 py-3.5 text-sm font-semibold text-zinc-800 shadow-xs hover:bg-zinc-50 active:bg-zinc-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
          >
            <Play size={16} weight="fill" className="text-zinc-500" />
            <span>See How It Works</span>
          </a>
        </div>

        {/* Risk Reversal Guarantee */}
        <div className="mt-4 flex items-center justify-center gap-6 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <CheckCircle size={14} weight="fill" className="text-emerald-600" />
            60 free minutes monthly
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle size={14} weight="fill" className="text-emerald-600" />
            No credit card required
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle size={14} weight="fill" className="text-emerald-600" />
            Cancel anytime
          </span>
        </div>

        {/* Interactive URL Demonstration Box */}
        <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 sm:p-4 shadow-sm">
          <form onSubmit={handleDemoSubmit} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Paste video file link (e.g. .mp4, direct link)..."
              aria-label="Demo Video Link"
              className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
            />
            <button
              type="submit"
              disabled={demoState === "simulating"}
              className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-zinc-800 active:bg-zinc-950 transition-colors disabled:opacity-50"
            >
              {demoState === "simulating" ? "Analyzing..." : "Generate Demo Clips"}
            </button>
          </form>

          {/* Quick Sample Button */}
          <div className="mt-2.5 flex items-center justify-between px-1 text-xs text-zinc-500">
            <span>
              Interactive demonstration: simulates AI detection pipeline.
            </span>
            <button
              type="button"
              onClick={handleUseSample}
              className="text-zinc-900 underline underline-offset-2 hover:text-zinc-700"
            >
              Use sample video link
            </button>
          </div>

          {errorMsg && (
            <p className="mt-2 text-left text-xs font-medium text-red-600 px-1" role="alert">
              {errorMsg}
            </p>
          )}

          {/* Simulated Pipeline Results Banner */}
          {demoState === "preview" && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-left animate-in fade-in-50">
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-block rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                    Demo Simulated
                  </span>
                  <h4 className="mt-1 text-sm font-semibold text-emerald-950">
                    Sample Detected: 8 Standalone Short Clips
                  </h4>
                  <p className="text-xs text-emerald-800/90 mt-0.5">
                    Opening hook scored 94/100 • Word boundaries aligned to 0.12s • Speaker tracked
                  </p>
                </div>
                <a
                  href="/dashboard"
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800"
                >
                  Process in Dashboard →
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Product Preview Card */}
        <div className="mx-auto mt-14 max-w-5xl rounded-2xl border border-zinc-200 bg-zinc-900 p-2 sm:p-3 shadow-xl">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 text-left">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                <div className="h-3 w-3 rounded-full bg-green-500/80" />
                <span className="ml-2 text-xs font-mono text-zinc-400">
                  clipforge-workspace / podcast_ep42_cuts
                </span>
              </div>
              <span className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-mono text-zinc-300">
                1080x1920 (9:16)
              </span>
            </div>

            {/* Mock Editor Workspace Preview */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* Vertical Video Phone Frame */}
              <div className="md:col-span-4 mx-auto w-48 sm:w-56 aspect-[9/16] rounded-xl border border-zinc-800 bg-zinc-900 flex flex-col justify-between p-3 relative overflow-hidden shadow-inner">
                <div className="flex justify-between items-center text-[10px] text-zinc-400 z-10">
                  <span className="bg-black/60 px-2 py-0.5 rounded">00:34 / 00:46</span>
                  <span className="bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
                    94 Hook
                  </span>
                </div>

                {/* Subtitle Karaoke Simulation */}
                <div className="my-auto text-center z-10 px-2">
                  <div className="inline-block bg-black/80 px-2.5 py-1.5 rounded-lg text-xs font-black tracking-wide text-white uppercase leading-snug">
                    <span className="text-yellow-400">Ninety percent</span> of founders fail at distribution
                  </div>
                </div>

                <div className="text-[10px] text-zinc-400 flex justify-between items-center z-10">
                  <span>Auto Reframed</span>
                  <span className="text-zinc-500">1080p 60fps</span>
                </div>
              </div>

              {/* Transcript & Scoring Telemetry */}
              <div className="md:col-span-8 flex flex-col space-y-4">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                    <span className="font-semibold text-zinc-200">
                      Why Most Micro-SaaS Founders Fail at Distribution
                    </span>
                    <span className="text-emerald-400 font-mono font-medium">91/100 Potential</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed font-mono">
                    [0412.40s - 0458.85s] SPEAKER_00: &quot;Ninety percent of founders fail at distribution because they build in stealth for six months without talking to an actual buyer...&quot;
                  </p>
                </div>

                {/* Multi-Factor Score Bars */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                    <span className="text-[11px] text-zinc-400">Hook Score</span>
                    <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5">94%</p>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-emerald-500 w-[94%]" />
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                    <span className="text-[11px] text-zinc-400">Engagement</span>
                    <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5">89%</p>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-emerald-500 w-[89%]" />
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                    <span className="text-[11px] text-zinc-400">Context</span>
                    <p className="text-lg font-bold text-zinc-100 font-mono mt-0.5">92%</p>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-emerald-500 w-[92%]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
