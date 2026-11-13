"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleNotch, Eye, EyeSlash, WarningCircle } from "phosphor-react";
import { AuthCard } from "@/components/auth/auth-card";
import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api-client";

export default function RegisterPage() {
  const router = useRouter();
  const { register, user } = useAuth();

  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // If already logged in, redirect
  React.useEffect(() => {
    if (user) {
      router.push("/dashboard");
    }
  }, [user, router]);

  // Validation rules
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumberOrSpecial = /[0-9!@#$%^&*]/.test(password);
  const isPasswordValid = hasMinLength && hasUpper && hasLower && hasNumberOrSpecial;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim() || !password) {
      setError("Please complete all required fields.");
      return;
    }

    if (!isPasswordValid) {
      setError("Please ensure your password meets all security criteria.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await register(email, password, fullName);
      if (res.devVerificationToken) {
        // Store dev verification token temporarily in session storage for convenient local testing
        sessionStorage.setItem("dev_verification_token", res.devVerificationToken);
      }
      router.push("/verify-email?sent=true");
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          "Unable to complete registration. Please check your details and try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      description="Start turning long recordings into short viral clips in minutes."
      footer={
        <p>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-zinc-950 dark:text-zinc-50 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xs"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <div className="mb-6 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/20 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>Free tier includes 60 free processing minutes every month.</span>
      </div>

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
            htmlFor="fullName"
            className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5"
          >
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Alex Rivera"
            disabled={isSubmitting}
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] px-3.5 py-2.5 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-200 transition-colors disabled:opacity-50"
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5"
          >
            Work email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@studio.com"
            disabled={isSubmitting}
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1F1F1F] px-3.5 py-2.5 text-sm text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-200 transition-colors disabled:opacity-50"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a strong password"
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

          {/* Password requirement checklist */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
            <div className={`flex items-center gap-1.5 ${hasMinLength ? "text-emerald-600 font-medium" : ""}`}>
              <Check size={14} className={hasMinLength ? "text-emerald-600" : "text-zinc-300"} />
              <span>8+ characters</span>
            </div>
            <div className={`flex items-center gap-1.5 ${hasUpper ? "text-emerald-600 font-medium" : ""}`}>
              <Check size={14} className={hasUpper ? "text-emerald-600" : "text-zinc-300"} />
              <span>1 uppercase letter</span>
            </div>
            <div className={`flex items-center gap-1.5 ${hasLower ? "text-emerald-600 font-medium" : ""}`}>
              <Check size={14} className={hasLower ? "text-emerald-600" : "text-zinc-300"} />
              <span>1 lowercase letter</span>
            </div>
            <div className={`flex items-center gap-1.5 ${hasNumberOrSpecial ? "text-emerald-600 font-medium" : ""}`}>
              <Check size={14} className={hasNumberOrSpecial ? "text-emerald-600" : "text-zinc-300"} />
              <span>1 number or symbol</span>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 dark:bg-zinc-100 px-4 py-3 text-sm font-semibold text-white dark:text-zinc-950 shadow-xs hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {isSubmitting ? (
            <>
              <CircleNotch size={18} className="animate-spin" />
              <span>Creating account...</span>
            </>
          ) : (
            <span>Create account</span>
          )}
        </button>

        <p className="text-[11px] text-zinc-500 text-center text-pretty pt-2">
          By signing up, you agree to ClipForge AI&apos;s{" "}
          <Link href="/terms" className="underline hover:text-zinc-800">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline hover:text-zinc-800">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthCard>
  );
}

