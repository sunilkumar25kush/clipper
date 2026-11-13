"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { List, MagnifyingGlass, Lightning, Plus, SignOut, Gear } from "phosphor-react";
import { useAuth } from "@/context/auth-context";

interface DashboardTopnavProps {
  onOpenMobileSidebar: () => void;
  onOpenCreateModal: () => void;
}

export function DashboardTopnav({
  onOpenMobileSidebar,
  onOpenCreateModal,
}: DashboardTopnavProps) {
  const router = useRouter();
  const { user, credits, logout } = useAuth();
  const [search, setSearch] = React.useState("");
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/dashboard/projects?search=${encodeURIComponent(search.trim())}`);
    }
  };

  const availableCredits = credits?.availableCredits ?? 60;

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#181818]/95 backdrop-blur-xs px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
      {/* Left: Mobile hamburger & Search */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="md:hidden p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-[#272727] rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Open sidebar navigation"
        >
          <List size={20} weight="bold" />
        </button>

        <form onSubmit={handleSearchSubmit} className="relative w-full">
          <MagnifyingGlass
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] pl-9 pr-4 py-1.5 text-xs sm:text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-200 transition-colors"
          />
        </form>
      </div>

      {/* Right: Credits pill & Quick action & Avatar dropdown */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/billing"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
        >
          <Lightning size={14} weight="fill" className="text-amber-500" />
          <span>{availableCredits} mins left</span>
        </Link>

        <button
          type="button"
          onClick={onOpenCreateModal}
          className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 dark:bg-zinc-100 px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-white dark:text-zinc-950 shadow-xs hover:bg-zinc-800 dark:hover:bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus size={16} weight="bold" />
          <span className="hidden sm:inline">New project</span>
        </button>

        {/* User avatar dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-8 h-8 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center font-bold text-xs uppercase focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-200"
            aria-expanded={dropdownOpen}
            aria-haspopup="menu"
            aria-label="User account menu"
          >
            {user?.fullName?.charAt(0) || "U"}
          </button>

          {dropdownOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1F1F1F] p-1.5 shadow-lg z-40 text-xs animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800/80 mb-1">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {user?.fullName || "User"}
                </p>
                <p className="text-zinc-500 truncate">{user?.email}</p>
              </div>

              <Link
                href="/dashboard/settings"
                role="menuitem"
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-[#272727] transition-colors"
              >
                <Gear size={16} />
                <span>Account settings</span>
              </Link>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setDropdownOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-left"
              >
                <SignOut size={16} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

