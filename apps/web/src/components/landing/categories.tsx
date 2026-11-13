"use client";

import * as React from "react";
import {
  Fire,
  Smiley,
  GraduationCap,
  Heart,
  BookOpen,
  Chats,
  Lightbulb,
} from "phosphor-react";

const categories = [
  {
    name: "Strong Hooks",
    desc: "Contrarian statements, surprising facts, or pattern-interrupting openers.",
    icon: Fire,
  },
  {
    name: "Humor & Banter",
    desc: "Genuinely funny punchlines, witty comebacks, and shared laughter.",
    icon: Smiley,
  },
  {
    name: "Educational Frameworks",
    desc: "Step-by-step mental models, tutorials, and actionable takeaways.",
    icon: GraduationCap,
  },
  {
    name: "Emotional Moments",
    desc: "Deep human vulnerability, intense convictions, and personal revelations.",
    icon: Heart,
  },
  {
    name: "Storytelling Arcs",
    desc: "Complete narratives with setup, inciting conflict, and clear resolution.",
    icon: BookOpen,
  },
  {
    name: "Debates & Discussions",
    desc: "Fast turn-taking disagreements and energetic multi-speaker banter.",
    icon: Chats,
  },
  {
    name: "Actionable Insights",
    desc: "Rare industry secrets, contrarian lessons, and high-density knowledge.",
    icon: Lightbulb,
  },
];

export function Categories() {
  return (
    <section id="categories" className="py-20 md:py-28 border-t border-zinc-100 bg-zinc-50/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Categorized Clip Archetypes
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl text-balance">
            Trained to detect moments human editors look for
          </p>
          <p className="mt-4 text-base text-zinc-600">
            Filter generated clips by intent so you always publish the right tone for each social platform.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categories.map((cat, idx) => {
            const Icon = cat.icon;
            return (
              <div
                key={idx}
                className="flex items-start gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-xs"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900 mt-0.5">
                  <Icon size={18} weight="bold" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-950">{cat.name}</h3>
                  <p className="mt-1 text-xs text-zinc-500 leading-relaxed">{cat.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

