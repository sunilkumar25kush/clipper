"use client";

import * as React from "react";
import { CaretDown } from "phosphor-react";

interface FAQItem {
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    question: "How does the AI identify the best moments in a video?",
    answer:
      "ClipForge AI uses speech-to-text transcription combined with language models and audio visual heuristics. The system analyzes dialogue context, topic transitions, hook strength, speaker energy, and narrative payoff to select coherent segments instead of cutting arbitrarily.",
  },
  {
    question: "What video platforms and file formats are supported?",
    answer:
      "You can paste URLs from YouTube, Loom, and Google Drive, or upload raw MP4, MOV, and WebM files up to 2 GB each. Exported clips are rendered in standard H.264/AAC formats ready for direct publishing.",
  },
  {
    question: "How does 9:16 vertical reframing keep speakers centered?",
    answer:
      "Our AI worker detects active speakers and faces frame-by-frame. When two people converse, the engine dynamically crops and pans to keep the current speaker in frame, or generates a stacked two-person split view automatically.",
  },
  {
    question: "How accurate are the automatically generated captions?",
    answer:
      "Captions are powered by Whisper large-v3 models with word-level timestamps. Word error rates typically stay below 3% in clear audio. You can also edit any word, punctuation, or styling directly before exporting.",
  },
  {
    question: "How are processing minutes and credits calculated?",
    answer:
      "Credits correspond 1:1 with input video length. Processing a 30-minute podcast episode consumes exactly 30 minutes from your monthly allowance, regardless of whether you generate 3 or 10 clips from it.",
  },
  {
    question: "Do I retain full commercial rights to exported clips?",
    answer:
      "Yes. You retain 100% ownership and commercial rights to all generated clips, edited captions, and derivative media created from your source files.",
  },
  {
    question: "Can I cancel or change my subscription at any time?",
    answer:
      "Yes. You can upgrade, downgrade, or cancel directly from your account settings at any moment. When cancelling, your plan remains active until the end of your current billing period with zero cancellation fees.",
  },
  {
    question: "What happens if a video fails to process?",
    answer:
      "If any processing task fails due to an unsupported codec or transcription timeout, your account is immediately credited back the full video duration with an actionable failure summary.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <section id="faq" className="py-24 px-4 sm:px-6 lg:px-8 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818]">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">
            Got Questions
          </p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 text-balance mb-4">
            Frequently asked questions
          </h2>
          <p className="text-base text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto text-pretty">
            Everything you need to know about processing credits, AI transcript accuracy, and commercial usage.
          </p>
        </div>

        <div className="space-y-4" role="region" aria-label="Frequently Asked Questions Accordion">
          {FAQS.map((item, idx) => {
            const isOpen = openIndex === idx;
            const contentId = `faq-content-${idx}`;
            const headerId = `faq-header-${idx}`;

            return (
              <div
                key={item.question}
                className="border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50/50 dark:bg-[#1F1F1F] overflow-hidden transition-colors duration-300"
              >
                <h3>
                  <button
                    id={headerId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={contentId}
                    onClick={() => toggle(idx)}
                    className="w-full flex items-center justify-between text-left px-6 py-5 text-base font-medium text-zinc-900 dark:text-zinc-100 hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                  >
                    <span className="pr-4">{item.question}</span>
                    <CaretDown
                      weight="bold"
                      className={`w-5 h-5 flex-shrink-0 text-zinc-500 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        isOpen ? "transform rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                <div
                  id={contentId}
                  role="region"
                  aria-labelledby={headerId}
                  hidden={!isOpen}
                  className={`px-6 pb-5 pt-1 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed text-pretty ${
                    isOpen ? "block" : "hidden"
                  }`}
                >
                  <p>{item.answer}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] text-center">
          <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-2">
            Have a question that is not covered here?
          </p>
          <a
            href="mailto:support@clipforge.ai"
            className="text-sm font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
          >
            Contact support team
          </a>
        </div>
      </div>
    </section>
  );
}

