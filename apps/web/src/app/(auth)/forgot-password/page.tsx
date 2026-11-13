"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle, CircleNotch, WarningCircle, ArrowLeft } from "phosphor-react";
import { AuthCard } from "@/components/auth/auth-card";
import { fetchApi, getErrorMessage } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSubmitted, setIsSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [devResetToken, setDevResetToken] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Please enter your registered email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetchApi<{ message: string; devResetToken?: string }>(
        "/api/v1/auth/forgot-password",
        {
          method: "POST",
          body: JSON.stringify({ email }),
        },
      );

      setIsSubmitted(true);
      if (res.devResetToken) {
        setDevResetToken(res.devResetToken);
      }
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          "Failed to process password reset request. Please try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email address and we'll send you a secure link to reset your credentials."
      footer={
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 font-semibold text-zinc-950 dark:text-zinc-50 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xs"
        >
          <ArrowLeft size={14} weight="bold" />
          <span>Back to sign in</span>
        </Link>
      }
    >
      {isSubmitted ? (
        <div className="space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <CheckCircle weight="fill" size={28} />
          </div>

          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Check your inbox
          </h3>

          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed text-pretty">
            If an account exists for <span className="font-semibold text-zinc-900 dark:text-zinc-100">{email}</span>,
            we have sent instructions to reset your password. The link will expire in 1 hour.
          </p>

          {devResetToken && (
            <div className="mt-4 p-3 rounded-xl bg-zinc-100 dark:bg-[#272727] border border-zinc-200 dark:border-zinc-700 text-left">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                Development Quick Link
              </p>
              <Link
                href={`/reset-password?token=${devResetToken}`}
                className="text-xs text-primary underline break-all font-mono"
              >
                Continue to Reset Password &rarr;
              </Link>
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setIsSubmitted(false);
                setEmail("");
              }}
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
            >
              Try another email address
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/30 p-3.5 text-xs text-red-700 dark:text-red-400"
            >
              <WarningCircle weight="fill" className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Account email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@creator.com"
              disabled={isSubmitting}
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] px-3.5 py-2.5 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-200 transition-colors disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 dark:bg-zinc-100 px-4 py-3 text-sm font-semibold text-white dark:text-zinc-950 shadow-xs hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {isSubmitting ? (
              <>
                <CircleNotch size={18} className="animate-spin" />
                <span>Sending link...</span>
              </>
            ) : (
              <span>Send reset link</span>
            )}
          </button>
        </form>
      )}
    </AuthCard>
  );
}

