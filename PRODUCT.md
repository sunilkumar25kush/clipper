# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui

## Users

1. **Solo Content Creators, Podcasters, and YouTubers**: Recording 30–120 minute episodes and needing fast, contextually complete vertical clips (`9:16`) for Shorts, Reels, and TikTok without manual scrub-editing.
2. **Social Media Managers & Video Production Agencies**: Managing multiple client channels with high repurposing volumes, needing rapid candidate filtering, category tagging, transparent AI score breakdowns, and fast subtitle/export workflows.

## Product Purpose

ClipForge AI automatically identifies the most engaging, humorous, educational, or emotional moments from long-form video, evaluates each segment's standalone narrative completeness and hook potential, and renders vertical short-form videos with active-speaker framing and burned-in animated subtitles. Success means saving creators 5–8 hours per episode while producing soundbites that make complete narrative sense without context collapse.

## Positioning

Unlike basic clippers that cut at arbitrary audio spikes or keyword mentions (often cutting off speakers mid-sentence or mid-thought), ClipForge AI combines semantic LLM analysis (Gemini) with word-level speech alignment (Whisper) and multi-factor engagement scoring (Hook, Engagement, Context Completeness) to ensure every clip works as an autonomous, self-contained story.

## Operating Context

- Creators and editors operating on desktop screens (`1024px+`) reviewing ranked clip candidate galleries, adjusting word boundaries on an interactive transcript, and tweaking subtitle presets.
- Secondary mobile workflow (`375px+`) for reviewing preview videos, checking scores, and triggering or downloading exports on the go.
- Fast turnaround expectations: 30-minute videos analyzed and rendered into 5–15 clips in under 6 minutes.

## Capabilities and Constraints

- **Input Ingestion**: Direct multipart browser upload to Cloudflare R2/S3 (MP4, MOV, WebM up to tier limits) and SSRF-guarded direct media URLs with user rights attestation.
- **AI Processing**: Asynchronous Whisper word-level transcription, Pyannote speaker diarization, and Gemini structured JSON semantic moment detection.
- **Editing & Rendering**: OpenCV/MediaPipe active-speaker tracking with deadzone stabilization, dynamic `.ass` karaoke subtitle burn-in, multi-aspect export (`9:16`, `1:1`, `16:9`), and thumbnail generation.
- **Monetization & Billing**: Configurable 4-tier credit quota system (Free, Starter, Pro, Business) integrated with Razorpay (India: UPI/cards) and Stripe adapter architecture.
- **Constraints**: No unauthorized third-party site scraping; strict tenant isolation per `userId`; non-blocking API server design.

## Brand Commitments

- **Visual Direction**: Clean, minimal light-mode SaaS interface (Notion/Vercel-style aesthetic) emphasizing high legibility, subtle borders, disciplined neutral typography, and calm status indicators over noisy gamer-style neon accents.
- **Voice**: Professional, transparent, and creator-focused. Transparent about estimated engagement potential without deceptive "guaranteed virality" claims.

## Evidence on Hand

- Complete technical blueprint and specifications in `docs/`:
  - `docs/PRD.md` (Product Requirements Document)
  - `docs/TRD.md` (Technical Requirements Document)
  - `docs/SYSTEM_ARCHITECTURE.md` (System Architecture & Sequence Flows)
  - `docs/DATABASE_SCHEMA.md` (PostgreSQL Prisma Schema)
  - `docs/API_DOCUMENTATION.md` (REST API Endpoints)
  - `docs/AI_PIPELINE.md` (15-step AI Analysis Pipeline)
  - `docs/SECURITY_AND_SCALABILITY.md` (Security, SSRF, & Worker Scaling)
  - `docs/DEVELOPMENT_ROADMAP.md` (14-Phase Implementation Plan)
  - `docs/TESTING_STRATEGY.md` (9-Layer Verification Plan)

## Product Principles

1. **Context Completeness Over Raw Clicks**: A clip must never start or stop mid-thought. A complete story creates higher retention than an unresolved soundbite.
2. **Deterministic, Non-Blocking Infrastructure**: Heavy AI and video rendering workloads must never run on the web server; they belong in background worker queues with real-time telemetry.
3. **Transparent Evaluation**: Show creators _why_ a clip was selected with clear Hook, Engagement, and Context scores.
4. **Effortless Defaults with Precision Control**: Provide immediate 1-click publishing-ready clips, but let creators fine-tune word captions and boundary trims when needed.
5. **Calm, High-Legibility Interface**: A productivity tool for creators should be uncluttered, responsive, and predictable.

## Accessibility & Inclusion

- WCAG 2.1 AA compliant color contrast across light-mode neutrals and action buttons.
- Full keyboard seek and navigation controls in the video player and transcript editor.
- Clear error states, progress percentages, and semantic ARIA labeling on status badges.
