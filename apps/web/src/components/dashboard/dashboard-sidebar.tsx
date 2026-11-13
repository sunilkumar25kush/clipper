"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  Scissors,
  FolderSimple,
  FilmSlate,
  Gear,
  CreditCard,
  Lightning,
  SignOut,
  X,
} from "phosphor-react";
import { useAuth } from "@/context/auth-context";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number | string; weight?: "regular" | "bold" | "fill" | "duotone"; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: House },
  { label: "My Projects", href: "/dashboard/projects", icon: FolderSimple },
  { label: "My Clips", href: "/dashboard/clips", icon: FilmSlate },
  { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { label: "Settings", href: "/dashboard/settings", icon: Gear },
];

interface DashboardSidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  onOpenCreateModal: () => void;
}

export function DashboardSidebar({
  mobileOpen = false,
  onCloseMobile,
  onOpenCreateModal,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const { user, credits, logout } = useAuth();

  const availableMins = credits?.availableCredits ?? 60;
  const totalMins = credits?.totalAllocated ?? 60;
  const percentUsed = Math.min(100, Math.round(((totalMins - availableMins) / totalMins) * 100));

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between bg-white dark:bg-[#181818] border-r border-zinc-200 dark:border-zinc-800 p-4">
      {/* Top branding + Navigation */}
      <div>
        {/* Brand header */}
        <div className="flex items-center justify-between px-2 py-3 mb-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
          >
            <span className="w-8 h-8 rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center font-bold">
              <Scissors weight="bold" className="w-4 h-4" />
            </span>
            <span className="font-semibold text-zinc-950 dark:text-zinc-50 text-base tracking-tight">
              ClipForge AI
            </span>
          </Link>

          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="md:hidden p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-md"
              aria-label="Close menu"
            >
              <X size={20} weight="bold" />
            </button>
          )}
        </div>

        {/* Quick Action Button */}
        <div className="mb-6 px-1">
          <button
            type="button"
            onClick={() => {
              if (onCloseMobile) onCloseMobile();
              onOpenCreateModal();
            }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 dark:bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-white dark:text-zinc-950 shadow-xs hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.99] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Scissors size={16} weight="bold" />
            <span>Create clips</span>
          </button>
        </div>

        {/* Navigation list */}
        <nav className="space-y-1 px-1" aria-label="Dashboard Sidebar">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-100 dark:bg-[#272727] text-zinc-950 dark:text-zinc-50 font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-[#1F1F1F] hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={18} weight={isActive ? "fill" : "regular"} className={isActive ? "text-zinc-950 dark:text-zinc-50" : "text-zinc-400"} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom info: Credits widget & User profile */}
      <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 px-1">
        {/* Credits balance card */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] p-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
              <Lightning size={14} weight="fill" className="text-amber-500" />
              Processing credits
            </span>
            <span className="font-semibold text-zinc-950 dark:text-zinc-50">
              {availableMins}m left
            </span>
          </div>

          <div className="w-full bg-zinc-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden mb-2">
            <div
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${percentUsed}%` }}
              role="progressbar"
              aria-valuenow={availableMins}
              aria-valuemin={0}
              aria-valuemax={totalMins}
              aria-label="Remaining video processing credits"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>{totalMins}m monthly plan</span>
            <Link href="/dashboard/billing" className="text-primary font-medium hover:underline">
              Upgrade
            </Link>
          </div>
        </div>

        {/* User bar */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center font-bold text-xs uppercase shrink-0">
              {user?.fullName?.charAt(0) || "U"}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-950 dark:text-zinc-50 truncate">
                {user?.fullName || "User"}
              </p>
              <p className="text-[11px] text-zinc-500 truncate">{user?.email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => logout()}
            className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <SignOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:block w-64 h-screen sticky top-0 shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

