"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle, CircleNotch, EnvelopeSimple, WarningCircle } from "phosphor-react";
import { AuthCard } from "@/components/auth/auth-card";
import { fetchApi, ApiError, getErrorMessage } from "@/lib/api-client";
import { useAuth } from "@/context/auth-context";

export default function VerifyEmailPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center p-8">
          <CircleNotch size={24} className="animate-spin text-zinc-500" />
        </div>
      }
    >
      <VerifyEmailContent />
    </React.Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const urlToken = searchParams.get("token") || "";
  const isSentNotification = searchParams.get("sent") === "true";
  const { user, fetchProfile } = useAuth();

  const [token, setToken] = React.useState(urlToken);
  const [resendEmail, setResendEmail] = React.useState(user?.email || "");
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [isVerified, setIsVerified] = React.useState(Boolean(user?.emailVerifiedAt));
  const [isResending, setIsResending] = React.useState(false);
  const [resendSuccess, setResendSuccess] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // If token is in URL on load, verify automatically
  React.useEffect(() => {
    if (urlToken && !isVerified) {
      handleVerify(urlToken);
    }
  }, [urlToken]);

  const handleVerify = async (tokenToVerify: string) => {
    setIsVerifying(true);
    setError(null);
    try {
      await fetchApi<{ user: { emailVerifiedAt: string } }>("/api/v1/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token: tokenToVerify.trim() }),
      });
      setIsVerified(true);
      await fetchProfile();
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          "Verification link is invalid or has expired.",
        ),
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResendSuccess(false);

    if (!resendEmail.trim()) {
      setError("Please enter your registered email address.");
      return;
    }

    setIsResending(true);
    try {
      await fetchApi<{ message: string }>("/api/v1/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      setResendSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Unable to resend verification. Please try again.");
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthCard
      title={isVerified ? "Email verified" : "Verify your email"}
      description={
        isVerified
          ? "Your email has been confirmed. You now have full access to your workspace."
          : "Please confirm your email address to activate all platform features."
      }
      footer={
        <p>
          Need help?{" "}
          <Link
            href="/support"
            className="font-semibold text-zinc-950 dark:text-zinc-50 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xs"
          >
            Contact support
          </Link>
        </p>
      }
    >
      {isVerified ? (
        <div className="space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <CheckCircle weight="fill" size={28} />
          </div>

          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Account verified successfully
          </h3>

          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed text-pretty">
            Your identity has been authenticated. You can now upload long-form videos and generate short clips.
          </p>

          <Link
            href="/dashboard"
            className="w-full mt-4 inline-flex items-center justify-center rounded-xl bg-zinc-950 dark:bg-zinc-100 px-4 py-3 text-sm font-semibold text-white dark:text-zinc-950 shadow-xs hover:bg-zinc-800 dark:hover:bg-white transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/30 p-3.5 text-xs text-red-700 dark:text-red-400"
            >
              <WarningCircle weight="fill" className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}

          {isSentNotification && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] p-4 text-center">
              <EnvelopeSimple size={32} className="mx-auto text-zinc-500 mb-2" />
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed text-pretty">
                We sent a confirmation link to your email address. Click the link in your email to verify.
              </p>
            </div>
          )}

          {/* Manual token input form */}
          <div>
            <label
              htmlFor="token"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5"
            >
              Verification token
            </label>
            <div className="flex gap-2">
              <input
                id="token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste verification token"
                disabled={isVerifying}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] px-3.5 py-2.5 text-sm text-zinc-950 dark:text-zinc-50 font-mono placeholder:font-sans placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-200 transition-colors disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => handleVerify(token)}
                disabled={isVerifying || !token.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-950 dark:bg-zinc-100 px-4 py-2.5 text-xs font-semibold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50 transition-colors"
              >
                {isVerifying ? <CircleNotch size={14} className="animate-spin" /> : "Verify"}
              </button>
            </div>
          </div>

          {/* Resend section */}
          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80">
            <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
              Didn&apos;t receive the email?
            </h4>

            {resendSuccess ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                A fresh verification link has been dispatched to your email.
              </p>
            ) : (
              <form onSubmit={handleResend} className="flex gap-2">
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  disabled={isResending}
                  className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] px-3.5 py-2 text-xs text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-200 transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isResending}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-colors disabled:opacity-50"
                >
                  {isResending ? <CircleNotch size={14} className="animate-spin" /> : "Resend"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </AuthCard>
  );
}

