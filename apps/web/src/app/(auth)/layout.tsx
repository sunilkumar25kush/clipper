import * as React from "react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-zinc-50 dark:bg-[#131209] py-12 px-4 sm:px-6 lg:px-8">
      <div className="flex-1 flex items-center justify-center">
        {children}
      </div>

      <footer className="mt-8 text-center text-xs text-zinc-500">
        <div className="flex items-center justify-center gap-6 mb-2">
          <Link href="/terms" className="hover:underline">Terms of Service</Link>
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          <Link href="/support" className="hover:underline">Support</Link>
        </div>
        <p>© {new Date().getFullYear()} ClipForge AI, Inc. All rights reserved.</p>
      </footer>
    </div>
  );
}

