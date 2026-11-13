"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, CheckCircle, CircleNotch, Eye, EyeSlash, WarningCircle } from "phosphor-react";
import { AuthCard } from "@/components/auth/auth-card";
import { fetchApi, getErrorMessage } from "@/lib/api-client";

export default function ResetPasswordPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center p-8">
          <CircleNotch size={24} className="animate-spin text-zinc-500" />
        </div>
      }
    >
      <ResetPasswordContent />
    </React.Suspense>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const initialToken = searchParams.get("token") || "";

  const [token, setToken] = React.useState(initialToken);
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Validation rules
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumberOrSpecial = /[0-9!@#$%^&*]/.test(password);
  const isPasswordValid = hasMinLength && hasUpper && hasLower && hasNumberOrSpecial;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError("Reset token is missing. Please open the reset link sent to your email.");
      return;
    }

    if (!isPasswordValid) {
      setError("Please ensure your new password satisfies all criteria.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await fetchApi<{ message: string }>("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setIsSuccess(true);
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          "Failed to reset password. The link may have expired.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Set new password"
      description="Choose a strong, unique password to secure your ClipForge account."
      footer={
        <p>
          Remember your password?{" "}
          <Link
            href="/login"
            className="font-semibold text-zinc-950 dark:text-zinc-50 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xs"
          >
            Sign in
          </Link>
        </p>
      }
    >
      {isSuccess ? (
        <div className="space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <CheckCircle weight="fill" size={28} />
          </div>

          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Password updated successfully
          </h3>

          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed text-pretty">
            Your credentials have been securely updated and previous sessions have been signed out.
          </p>

          <Link
            href="/login"
            className="w-full mt-4 inline-flex items-center justify-center rounded-xl bg-zinc-950 dark:bg-zinc-100 px-4 py-3 text-sm font-semibold text-white dark:text-zinc-950 shadow-xs hover:bg-zinc-800 dark:hover:bg-white transition-colors"
          >
            Sign in with new password
          </Link>
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

          {!initialToken && (
            <div>
              <label
                htmlFor="token"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5"
              >
                Reset Token
              </label>
              <input
                id="token"
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token from reset email"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] px-3.5 py-2.5 text-sm text-zinc-950 dark:text-zinc-50 font-mono placeholder:font-sans placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-200 transition-colors disabled:opacity-50"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="new-password"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              New password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] pl-3.5 pr-10 py-2.5 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-200 transition-colors disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 focus:outline-none"
              >
                {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Checklist */}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
              <div className={`flex items-center gap-1.5 ${hasMinLength ? "text-emerald-600 font-medium" : ""}`}>
                <Check size={14} className={hasMinLength ? "text-emerald-600" : "text-zinc-300"} />
                <span>8+ characters</span>
              </div>
              <div className={`flex items-center gap-1.5 ${hasUpper ? "text-emerald-600 font-medium" : ""}`}>
                <Check size={14} className={hasUpper ? "text-emerald-600" : "text-zinc-300"} />
                <span>1 uppercase</span>
              </div>
              <div className={`flex items-center gap-1.5 ${hasLower ? "text-emerald-600 font-medium" : ""}`}>
                <Check size={14} className={hasLower ? "text-emerald-600" : "text-zinc-300"} />
                <span>1 lowercase</span>
              </div>
              <div className={`flex items-center gap-1.5 ${hasNumberOrSpecial ? "text-emerald-600 font-medium" : ""}`}>
                <Check size={14} className={hasNumberOrSpecial ? "text-emerald-600" : "text-zinc-300"} />
                <span>1 number or symbol</span>
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
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
                <span>Updating password...</span>
              </>
            ) : (
              <span>Reset password</span>
            )}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
