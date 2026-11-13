import "./globals.css";
import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/context/auth-context";

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://clipforge.ai"),
  title: "ClipForge AI — Turn Long Videos Into Short, Engaging Clips With AI",
  description:
    "Transform podcasts, interviews, and long videos into contextually complete, high-retention vertical clips for YouTube Shorts, Instagram Reels, and TikTok automatically.",
  keywords: [
    "AI video clipping",
    "video repurposing",
    "YouTube Shorts generator",
    "TikTok clip maker",
    "Instagram Reels editor",
    "automated video editor",
    "podcast highlights",
  ],
  authors: [{ name: "ClipForge AI" }],
  creator: "ClipForge AI",
  publisher: "ClipForge AI",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "https://clipforge.ai",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://clipforge.ai",
    siteName: "ClipForge AI",
    title: "ClipForge AI — Turn Long Videos Into Short, Engaging Clips With AI",
    description:
      "Transform podcasts, interviews, and long videos into contextually complete, high-retention vertical clips for YouTube Shorts, Instagram Reels, and TikTok automatically.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ClipForge AI — Automated AI Video Clipping",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ClipForge AI — Turn Long Videos Into Short, Engaging Clips With AI",
    description:
      "Transform long-form videos into high-retention vertical clips with smart speaker reframing and animated subtitles.",
    creator: "@clipforgeai",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="bg-white text-zinc-950 antialiased selection:bg-zinc-900 selection:text-white">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:outline-none focus:ring-2 focus:ring-zinc-950"
        >
          Skip to main content
        </a>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
