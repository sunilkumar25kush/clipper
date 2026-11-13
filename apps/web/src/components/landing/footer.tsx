"use client";

import * as React from "react";
import { Scissors, GithubLogo, TwitterLogo, YoutubeLogo } from "phosphor-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131209] text-zinc-600 dark:text-zinc-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Brand info */}
          <div className="md:col-span-1">
            <a href="#" className="flex items-center gap-2 mb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm">
              <span className="w-8 h-8 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 flex items-center justify-center font-bold">
                <Scissors weight="bold" className="w-4 h-4" />
              </span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-base tracking-tight">
                ClipForge AI
              </span>
            </a>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6 text-pretty leading-relaxed">
              AI-powered video clipping software. Automatically turn podcasts and long recordings into ready-to-publish short-form clips.
            </p>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>All systems operational</span>
            </div>
          </div>

          {/* Product links */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-4">
              Product
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <a href="#how-it-works" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  How it works
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  AI Features
                </a>
              </li>
              <li>
                <a href="#categories" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Clip Archetypes
                </a>
              </li>
              <li>
                <a href="#formats" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Aspect Ratios
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Plans and Pricing
                </a>
              </li>
            </ul>
          </div>

          {/* Resources & Support */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-4">
              Resources
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <a href="#faq" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  FAQ
                </a>
              </li>
              <li>
                <a href="#hero-url-demo" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  URL Simulation Demo
                </a>
              </li>
              <li>
                <a href="mailto:support@clipforge.ai" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Contact Support
                </a>
              </li>
              <li>
                <a href="/robots.txt" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Robots Index
                </a>
              </li>
              <li>
                <a href="/sitemap.xml" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Sitemap XML
                </a>
              </li>
            </ul>
          </div>

          {/* Legal & Compliance */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-4">
              Legal
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <a href="#privacy" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#terms" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#cookies" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Cookie Policy
                </a>
              </li>
              <li>
                <a href="#security" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                  Security Overview
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>
            © {currentYear} ClipForge AI, Inc. All rights reserved.
          </p>

          <div className="flex items-center gap-4">
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Twitter Profile"
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <TwitterLogo weight="fill" className="w-4 h-4" />
            </a>
            <a
              href="https://youtube.com"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="YouTube Channel"
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <YoutubeLogo weight="fill" className="w-4 h-4" />
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="GitHub Repository"
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <GithubLogo weight="fill" className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

