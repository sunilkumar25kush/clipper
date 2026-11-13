"use client";

import * as React from "react";
import { Check } from "phosphor-react";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/month",
    description: "Ideal for testing automated clipping on short episodes.",
    credits: "60 minutes monthly",
    features: [
      "Up to 30 min source video length",
      "Up to 5 clips per video",
      "720p HD exports",
      "ClipForge AI watermark",
      "Standard queue priority",
      "7 days cloud storage",
    ],
    cta: "Start Free",
    href: "/dashboard",
    popular: false,
  },
  {
    name: "Starter",
    price: "$19",
    period: "/month",
    description: "Designed for solo creators publishing weekly Shorts & Reels.",
    credits: "300 minutes monthly",
    features: [
      "Up to 90 min source video length",
      "Up to 15 clips per video",
      "1080p 60fps Full HD exports",
      "No watermark",
      "Medium queue priority",
      "All aspect ratios (9:16, 1:1, 16:9)",
      "30 days cloud storage",
    ],
    cta: "Get Starter",
    href: "/dashboard?plan=starter",
    popular: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/month",
    description: "For active podcasters and growing creator channels.",
    credits: "1,000 minutes monthly",
    features: [
      "Up to 180 min source video length",
      "Up to 30 clips per video",
      "1080p 60fps Full HD exports",
      "No watermark",
      "High queue priority",
      "All aspect ratios & custom styles",
      "90 days cloud storage",
    ],
    cta: "Get Pro",
    href: "/dashboard?plan=pro",
    popular: true,
  },
  {
    name: "Business",
    price: "$129",
    period: "/month",
    description: "For agencies and media teams managing multiple client shows.",
    credits: "3,000 minutes monthly",
    features: [
      "Up to 240 min source video length",
      "Up to 50 clips per video",
      "1080p 60fps Full HD exports",
      "No watermark",
      "Top priority processing",
      "All aspect ratios & batch downloads",
      "180 days cloud storage",
    ],
    cta: "Get Business",
    href: "/dashboard?plan=business",
    popular: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-20 md:py-28 border-t border-zinc-100 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Simple, Transparent Pricing
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl text-balance">
            Predictable plans based on analyzed video minutes
          </p>
          <p className="mt-4 text-base text-zinc-600">
            One credit equals one analyzed minute. Re-editing subtitles or switching aspect ratios never costs extra credits.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`flex flex-col justify-between rounded-2xl border p-6 shadow-xs relative ${
                plan.popular
                  ? "border-zinc-950 bg-white shadow-md ring-1 ring-zinc-950"
                  : "border-zinc-200 bg-zinc-50/50"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-zinc-950 px-3 py-0.5 text-[11px] font-semibold text-white tracking-wide">
                  MOST POPULAR
                </div>
              )}

              <div>
                <h3 className="text-base font-semibold text-zinc-950">{plan.name}</h3>
                <p className="mt-1 text-xs text-zinc-500 min-h-[32px]">{plan.description}</p>

                <div className="mt-4 flex items-baseline">
                  <span className="text-3xl font-bold tracking-tight text-zinc-950 font-mono">
                    {plan.price}
                  </span>
                  <span className="ml-1 text-xs text-zinc-500">{plan.period}</span>
                </div>

                <div className="mt-2 text-xs font-semibold text-zinc-800 bg-zinc-200/50 px-2.5 py-1 rounded-md inline-block font-mono">
                  {plan.credits}
                </div>

                <ul className="mt-6 space-y-3 text-xs text-zinc-600 border-t border-zinc-200/80 pt-6">
                  {plan.features.map((feature, fIdx) => (
                    <li key={fIdx} className="flex items-start gap-2">
                      <Check size={14} weight="bold" className="text-zinc-950 shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <a
                href={plan.href}
                className={`mt-8 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 ${
                  plan.popular
                    ? "bg-zinc-950 text-white shadow-sm hover:bg-zinc-800"
                    : "border border-zinc-200 bg-white text-zinc-900 shadow-xs hover:bg-zinc-100"
                }`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

