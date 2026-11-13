"use client";

import * as React from "react";
import { Lightning, CheckCircle, ArrowRight } from "phosphor-react";
import { useAuth } from "@/context/auth-context";

export default function BillingPage() {
  const { user, subscription, credits } = useAuth();

  const totalAllocated = credits?.totalAllocated ?? 60;
  const usedCredits = credits?.usedCredits ?? 0;
  const availableCredits = credits?.availableCredits ?? 60;
  const percentUsed = Math.min(100, Math.round((usedCredits / totalAllocated) * 100));

  const plans = [
    {
      name: "Starter",
      price: "$19",
      period: "/month",
      minutes: "120 processing minutes",
      features: ["Auto 9:16 reframe", "Whisper captions", "1080p exports", "No watermark"],
      recommended: false,
    },
    {
      name: "Pro",
      price: "$49",
      period: "/month",
      minutes: "350 processing minutes",
      features: [
        "Everything in Starter",
        "Active speaker auto-crop",
        "Virality score AI",
        "Custom font and brand kits",
        "Priority processing queue",
      ],
      recommended: true,
    },
    {
      name: "Business",
      price: "$129",
      period: "/month",
      minutes: "1,000 processing minutes",
      features: [
        "Everything in Pro",
        "Multi-speaker side-by-side cuts",
        "Batch video processing",
        "Custom webhook endpoints",
        "Dedicated support manager",
      ],
      recommended: false,
    },
  ];

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
          Billing & Processing Credits
        </h1>
        <p className="text-xs text-zinc-500">
          Monitor your video processing wallet and manage your monthly subscription.
        </p>
      </div>

      {/* Current plan & Wallet card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Plan status card */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Current Plan
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40">
                {subscription?.status || "ACTIVE"}
              </span>
            </div>

            <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">
              {subscription?.planTier || "FREE"} Plan
            </h3>

            <p className="text-xs text-zinc-500 leading-relaxed">
              Account email: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{user?.email}</span>
            </p>
          </div>

          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
            Next renewal cycle:{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              {subscription?.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                : "Continuous"}
            </span>
          </div>
        </div>

        {/* Credit wallet card */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                <Lightning size={16} weight="fill" className="text-amber-500" />
                Credit Balance
              </span>
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                {availableCredits} minutes available
              </span>
            </div>

            <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden mb-2">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${percentUsed}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>{usedCredits}m consumed</span>
              <span>{totalAllocated}m total allocated</span>
            </div>
          </div>

          <p className="text-[11px] text-zinc-400 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            Credits correspond 1:1 with input video length. Failed tasks automatically refund held credits.
          </p>
        </div>
      </div>

      {/* Upgrade Options */}
      <div>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50 mb-4">
          Available Subscription Plans
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl border p-6 flex flex-col justify-between relative transition-colors ${
                p.recommended
                  ? "border-zinc-950 dark:border-zinc-100 bg-white dark:bg-[#1F1F1F] shadow-sm"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818]"
              }`}
            >
              {p.recommended && (
                <span className="absolute -top-2.5 right-6 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950">
                  Most Popular
                </span>
              )}

              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">
                  {p.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-3xl font-extrabold text-zinc-950 dark:text-zinc-50">
                    {p.price}
                  </span>
                  <span className="text-xs text-zinc-500">{p.period}</span>
                </div>
                <p className="text-xs font-semibold text-primary mb-4">{p.minutes}</p>

                <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400 mb-6">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <CheckCircle size={14} weight="fill" className="text-emerald-500 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                  p.recommended
                    ? "bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white"
                    : "border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-[#272727]"
                }`}
              >
                <span>Upgrade to {p.name}</span>
                <ArrowRight size={14} weight="bold" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

