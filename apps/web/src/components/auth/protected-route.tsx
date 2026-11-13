"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { CircleNotch } from "phosphor-react";
import { useAuth } from "@/context/auth-context";

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requireVerifiedEmail?: boolean;
}

export function ProtectedRoute({
  children,
  fallback,
  requireVerifiedEmail = false,
}: ProtectedRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  React.useEffect(() => {
    if (!isLoading) {
      if (!user) {
        const redirectUrl = `/login?redirect=${encodeURIComponent(pathname || "/dashboard")}`;
        router.push(redirectUrl);
      } else if (requireVerifiedEmail && !user.emailVerifiedAt) {
        router.push("/verify-email");
      }
    }
  }, [user, isLoading, pathname, router, requireVerifiedEmail]);

  if (isLoading) {
    return (
      fallback || (
        <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#000000]">
          <div className="flex flex-col items-center gap-3">
            <CircleNotch size={32} className="animate-spin text-zinc-600 dark:text-zinc-400" />
            <p className="text-xs text-zinc-500 font-medium">Verifying session...</p>
          </div>
        </div>
      )
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}

