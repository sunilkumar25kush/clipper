"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle, WarningCircle, User, ShieldCheck, SignOut } from "phosphor-react";
import { useAuth } from "@/context/auth-context";

export default function SettingsPage() {
  const { user, logout } = useAuth();

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
          Account Settings
        </h1>
        <p className="text-xs text-zinc-500">
          Manage your personal identity, security credentials, and platform preferences.
        </p>
      </div>

      {/* Email verification status alert if not verified */}
      {!user?.emailVerifiedAt ? (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/30 p-4 text-xs text-amber-800 dark:text-amber-300 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <WarningCircle weight="fill" size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Your email address is unverified</p>
              <p className="text-zinc-600 dark:text-zinc-400 mt-0.5">
                Please verify your email address to enable high-priority background rendering.
              </p>
            </div>
          </div>
          <Link
            href="/verify-email"
            className="font-semibold underline shrink-0 hover:no-underline"
          >
            Verify now &rarr;
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/20 p-4 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2.5">
          <CheckCircle weight="fill" size={18} />
          <span>Your email address is verified and in good standing.</span>
        </div>
      )}

      {/* Profile info section */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <User size={18} weight="bold" className="text-zinc-600 dark:text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Personal Information
          </h2>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1">
                Full name
              </label>
              <input
                type="text"
                disabled
                value={user?.fullName || ""}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] px-3.5 py-2 text-xs text-zinc-950 dark:text-zinc-50 opacity-80"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1">
                Email address
              </label>
              <input
                type="email"
                disabled
                value={user?.email || ""}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] px-3.5 py-2 text-xs text-zinc-950 dark:text-zinc-50 opacity-80"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1">
              Account role
            </label>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
              {user?.role || "USER"}
            </span>
          </div>
        </div>
      </div>

      {/* Security credentials section */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#181818] p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <ShieldCheck size={18} weight="bold" className="text-zinc-600 dark:text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Security & Authentication
          </h2>
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Password
            </p>
            <p className="text-[11px] text-zinc-500">
              Need to update your password? Request a secure password reset link.
            </p>
          </div>

          <Link
            href="/forgot-password"
            className="rounded-xl border border-zinc-200 dark:border-zinc-700 px-3.5 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-[#272727] transition-colors"
          >
            Reset password
          </Link>
        </div>
      </div>

      {/* Sign out section */}
      <div className="pt-4 flex justify-end">
        <button
          type="button"
          onClick={() => logout()}
          className="inline-flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/20 px-4 py-2 text-xs font-semibold text-red-600 dark:text-red-400 transition-colors"
        >
          <SignOut size={16} />
          <span>Sign out of account</span>
        </button>
      </div>
    </div>
  );
}

