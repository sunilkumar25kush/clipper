"use client";

import * as React from "react";
import { ArrowRight, CheckCircle, Play } from "phosphor-react";

export function CTASection() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#181818]">
      <div className="max-w-5xl mx-auto">
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1F1F1F] p-8 sm:p-12 lg:p-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#272727] text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-6">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Ready for your next episode
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 max-w-2xl mx-auto text-balance mb-6">
            Start turning long videos into high-impact clips today
          </h2>

          <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto text-pretty mb-10">
            Join content creators, podcasters, and media teams scaling their audience without hours of manual video cutting.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto mb-10">
            <a
              href="#pricing"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 font-medium text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Start free trial
              <ArrowRight weight="bold" className="w-4 h-4" />
            </a>

            <a
              href="#hero-url-demo"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Play weight="fill" className="w-4 h-4 text-zinc-500" />
              Try interactive demo
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-500 dark:text-zinc-400 pt-6 border-t border-zinc-100 dark:border-zinc-800/80">
            <div className="flex items-center gap-2">
              <CheckCircle weight="fill" className="w-4 h-4 text-emerald-500" />
              <span>15 minutes free trial included</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle weight="fill" className="w-4 h-4 text-emerald-500" />
              <span>No credit card required to start</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle weight="fill" className="w-4 h-4 text-emerald-500" />
              <span>Cancel or pause subscription anytime</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

