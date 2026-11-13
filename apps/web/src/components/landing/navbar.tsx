"use client";

import * as React from "react";
import { List, X } from "phosphor-react";

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <a href="/" className="flex items-center gap-2.5 outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 rounded-md">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-950 text-white font-bold text-sm shadow-sm">
            CF
          </div>
          <span className="text-base font-semibold tracking-tight text-zinc-950">
            ClipForge<span className="text-zinc-500 font-normal ml-0.5">AI</span>
          </span>
        </a>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-600">
          <a href="#how-it-works" className="hover:text-zinc-950 transition-colors">
            How it works
          </a>
          <a href="#features" className="hover:text-zinc-950 transition-colors">
            Features
          </a>
          <a href="#categories" className="hover:text-zinc-950 transition-colors">
            Categories
          </a>
          <a href="#pricing" className="hover:text-zinc-950 transition-colors">
            Pricing
          </a>
          <a href="#faq" className="hover:text-zinc-950 transition-colors">
            FAQ
          </a>
        </nav>

        {/* Action CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <a
            href="/login"
            className="rounded-md px-3.5 py-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-950 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
          >
            Sign in
          </a>
          <a
            href="/register"
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 active:bg-zinc-900 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
          >
            Start free
          </a>
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="rounded-md p-2 text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
          >
            {mobileMenuOpen ? (
              <X size={22} weight="bold" />
            ) : (
              <List size={22} weight="bold" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-zinc-200 bg-white px-4 pt-3 pb-6 animate-in slide-in-from-top-3">
          <div className="flex flex-col space-y-3.5 text-sm font-medium text-zinc-700">
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 rounded-md hover:bg-zinc-100"
            >
              How it works
            </a>
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 rounded-md hover:bg-zinc-100"
            >
              Features
            </a>
            <a
              href="#categories"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 rounded-md hover:bg-zinc-100"
            >
              Categories
            </a>
            <a
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 rounded-md hover:bg-zinc-100"
            >
              Pricing
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 rounded-md hover:bg-zinc-100"
            >
              FAQ
            </a>
            <div className="pt-3 border-t border-zinc-100 flex flex-col gap-2">
              <a
                href="/login"
                className="w-full text-center rounded-md border border-zinc-200 py-2 text-sm font-medium text-zinc-800"
              >
                Sign in
              </a>
              <a
                href="/register"
                className="w-full text-center rounded-md bg-zinc-950 py-2 text-sm font-medium text-white shadow-sm"
              >
                Start free
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

