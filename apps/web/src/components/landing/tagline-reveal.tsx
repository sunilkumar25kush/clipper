"use client";

import * as React from "react";

export function TaglineReveal() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [revealedCount, setRevealedCount] = React.useState(0);

  const words = [
    "Most", "tools", "cut", "at", "audio", "spikes.",
    "ClipForge", "AI", "understands", "the", "entire", "conversation,",
    "preserving", "vital", "context", "and", "delivering", "stories",
    "that", "captivate", "audiences", "instantly."
  ];

  React.useEffect(() => {
    // Respect prefers-reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRevealedCount(words.length);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            let current = 0;
            const interval = setInterval(() => {
              current++;
              setRevealedCount(current);
              if (current >= words.length) clearInterval(interval);
            }, 55);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.3 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [words.length]);

  return (
    <section className="py-24 md:py-32 border-t border-zinc-100 bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center" ref={containerRef}>
        <p className="text-xs font-mono font-medium text-zinc-400 uppercase tracking-widest mb-6">
          The ClipForge Difference
        </p>
        <h2 className="mx-auto max-w-[680px] text-3xl font-bold tracking-tight sm:text-5xl leading-tight text-balance">
          {words.map((word, index) => {
            const isRevealed = index < revealedCount;
            return (
              <span
                key={index}
                className={`inline-block mr-2.5 transition-colors duration-300 ${
                  isRevealed ? "text-white" : "text-zinc-700"
                }`}
              >
                {word}
              </span>
            );
          })}
        </h2>
      </div>
    </section>
  );
}

