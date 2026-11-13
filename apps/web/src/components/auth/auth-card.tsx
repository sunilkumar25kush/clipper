"use client";

import * as React from "react";
import Link from "next/link";
import { Scissors } from "phosphor-react";

interface AuthCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <div className="w-full max-w-md mx-auto">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 mb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
          aria-label="Back to ClipForge AI Home"
        >
          <span className="w-10 h-10 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-bold">
            <Scissors weight="bold" className="w-5 h-5" />
          </span>
          <span className="font-semibold text-zinc-950 dark:text-zinc-50 text-xl tracking-tight">
            ClipForge AI
          </span>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 text-balance">
          {title}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 text-pretty">
          {description}
        </p>
      </div>

      {/* Main Form Card */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-8 shadow-xs">
        {children}
      </div>

      {/* Secondary / Footer Navigation */}
      {footer && (
        <div className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          {footer}
        </div>
      )}
    </div>
  );
}

