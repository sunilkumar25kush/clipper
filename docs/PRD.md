# Product Requirements Document (PRD): ClipForge AI

| Document Metadata | Details |
| :--- | :--- |
| **Product Name** | ClipForge AI (Working Title) |
| **Document Version** | 1.0.0 |
| **Status** | Approved for MVP Engineering |
| **Target Release** | Phase 1–14 Iterative Rollout (MVP Target: v1.0) |
| **Product Category** | B2C / B2B AI Video Repurposing & Editing SaaS |

---

## 1. Product Vision & Strategy

### 1.1 Product Mission
Empower creators, educators, podcasters, and marketing teams to transform long-form spoken and visual content into high-retention, contextually complete short-form videos in minutes—without manual timeline scrubbing or professional video editing expertise.

### 1.2 Product Vision
To become the most intelligent, context-aware AI video editor that understands human conversation, emotional arcs, humor, storytelling, and educational value—acting as an autonomous creative producer rather than a mechanical timestamp splitter.

### 1.3 Problem Statement
Content creators and organizations produce millions of hours of high-value long-form video (podcasts, webinars, interviews, streams, lectures, and commentary). However, audience discovery increasingly happens on short-form vertical feeds (YouTube Shorts, Instagram Reels, TikTok, LinkedIn Video). Repurposing a single 60-minute video into 10 polished short clips manually requires **6 to 10 hours** of:
1. Re-watching the entire video to spot engaging moments.
2. Identifying natural entry hooks and clean narrative conclusions.
3. Cutting, reframing horizontal (16:9) footage into vertical (9:16) while keeping active speakers centered.
4. Transcribing, timing, and styling burned-in dynamic captions.
5. Exporting, writing metadata, and managing versions.

Existing basic tools either slice videos at arbitrary intervals or rely on naive keyword matching, resulting in clips that start mid-thought, cut off before the punchline, or miss visual context.

### 1.4 Proposed Solution
**ClipForge AI** is an end-to-end automated video clipping SaaS platform. Users upload a video file or provide a link to an authorized video source. ClipForge AI extracts the audio and visual metadata, produces a word-accurate diarized transcript, and uses multimodal/semantic large language models (Google Gemini) combined with acoustic and visual signals to identify self-contained, high-engagement segments. It scores each candidate across multiple engagement dimensions, reframes the video around the active speaker, burns in customizable word-level subtitles, and outputs ready-to-publish MP4 clips in `9:16`, `16:9`, or `1:1` aspect ratios.

### 1.5 Competitive Positioning & Product Differentiators
| Dimension | Legacy Manual Editors (Premiere, CapCut) | First-Gen AI Clippers | ClipForge AI |
| :--- | :--- | :--- | :--- |
| **Moment Discovery** | 100% Manual | Keyword / Audio peak heuristics | Deep semantic & narrative arc analysis via Gemini |
| **Boundary Precision** | Manual frame cutting | Often cuts mid-sentence | Word-timestamp snapping + sentence completeness validation |
| **Transparent Scoring** | None | Opaque "virality score" | Multi-factor breakdown (Hook, Engagement, Context Completeness) with explicit AI rationale |
| **Rights & Compliance** | Local files only | Unregulated scraping | Strict source verification & rights attestation workflow |
| **Payment & Localization** | Global cards only | USD/Stripe only | Native Indian payment rails (Razorpay: UPI, Cards, Netbanking) + International (Stripe-ready) |

---

## 2. Target Audience & User Personas

### 2.1 Target User Segments
1. **Independent Content Creators & YouTubers**: Long-form video essayists, vloggers, and streamers looking to grow top-of-funnel discovery via Shorts and Reels.
2. **Podcasters & Interview Hosts**: Video podcast producers turning 1–3 hour conversations into 10–15 daily promotional clips.
3. **Coaches, Consultants & Educators**: Course creators and webinar hosts extracting actionable educational nuggets for LinkedIn and Instagram.
4. **Digital Marketers & Social Media Managers**: In-house brand marketers repurposing product demos, town halls, and customer testimonials.
5. **Video Production & Repurposing Agencies**: High-volume teams managing 10+ client channels who need rapid first-draft clip generation and consistent caption quality.

### 2.2 Detailed User Personas

#### Persona 1: Rohan — The Indie Tech Podcaster
- **Profile**: Solo host of a weekly 90-minute video podcast; works a full-time job.
- **Pain Point**: Spends his entire Sunday editing 5 vertical clips in CapCut; often misses posting schedules.
- **Goal**: Upload his Friday recording, get 10 ranked clips with speaker-tracked 9:16 framing and bold captions in 15 minutes, pick the top 5, and download.

#### Persona 2: Priya — Agency Social Media Manager
- **Profile**: Manages short-form video output for 6 startup founders and coaches.
- **Pain Point**: Watching 12 hours of raw client webinars every week to find 30-second soundbites is mentally exhausting and unscalable.
- **Goal**: Use AI clip categorization (Educational, Motivational, Hook) and transparent selection reasons to quickly curate, tweak subtitles, and export client deliverables.

#### Persona 3: Arjun — EdTech Instructor
- **Profile**: Records 45-minute coding and career mentorship sessions.
- **Pain Point**: Needs clips that preserve the full technical explanation without cutting off the conclusion.
- **Goal**: Filter clips by high **Context Completeness Score** and export in both `9:16` (Reels/Shorts) and `1:1` (LinkedIn).

---

## 3. Core Functional Requirements

### 3.1 Authentication & Account Management
- **FR-AUTH-01 (Email/Password Registration)**: Users can register with full name, email address, and a strong password (min 8 chars, 1 uppercase, 1 lowercase, 1 number/symbol).
- **FR-AUTH-02 (Email Verification)**: New accounts receive a time-limited cryptographic verification token via email before processing jobs can be triggered.
- **FR-AUTH-03 (Login & Logout)**: Secure login issuing short-lived HTTP-only JWT access tokens (15m) paired with rotating refresh tokens (7d) persisted in PostgreSQL (`Session` table).
- **FR-AUTH-04 (OAuth Future-Readiness)**: Database schema (`Account` model) and auth service interfaces support plugging in Google OAuth 2.0 without schema migration.
- **FR-AUTH-05 (Password Recovery)**: Forgot-password flow generating a single-use, 30-minute expiring reset token sent via email; invalidates all active sessions upon password change.
- **FR-AUTH-06 (User Profile & Security)**: Users can update display name, avatar, timezone, password, and view active login sessions.

### 3.2 User Dashboard
- **FR-DASH-01 (Project Overview)**: Displays a paginated grid/list of recent `VideoProject` items with status badges (`UPLOADED`, `QUEUED`, `ANALYZING`, `RENDERING`, `COMPLETED`, `FAILED`).
- **FR-DASH-02 (Usage & Credit Telemetry)**: Real-time display of remaining monthly processing credits (measured in video source minutes), current billing cycle reset date, and active subscription tier.
- **FR-DASH-03 (Quick Ingestion Bar)**: Prominent dropzone and authorized URL input box at the top of the dashboard for immediate project creation.
- **FR-DASH-04 (Analytics Summary)**: Aggregate cards showing total projects processed, total clips generated, and total storage consumed.

### 3.3 Video Input & Ingestion
- **FR-INGEST-01 (Direct File Upload)**: Support `.mp4`, `.mov`, `.m4v`, and `.webm` formats via multipart presigned URL uploads directly to Cloudflare R2 / S3 object storage.
- **FR-INGEST-02 (Authorized URL Ingestion)**: Support pasting direct media URLs (e.g., public S3/R2 links, cloud storage direct links, or authorized platform links where the user holds explicit redistribution rights).
- **FR-INGEST-03 (Rights & Permission Attestation)**: Mandatory user confirmation checkbox and source domain validation verifying the user owns or is licensed to repurpose the video content.
- **FR-INGEST-04 (Pre-flight Validation)**: Client-side and server-side validation of MIME type, container magic bytes, file size (tier-dependent), and video duration prior to queueing AI processing.
- **FR-INGEST-05 (Upload & Processing Progress)**: Real-time progress bar for multipart upload (%) followed by granular pipeline stage updates (`Extracting Audio` → `Transcribing` → `Analyzing Semantics` → `Cutting & Cropping` → `Rendering Subtitles`).
- **FR-INGEST-06 (Graceful Source Error Handling)**: Clear, actionable user error states for private URLs, geo-blocked links, corrupted containers, videos without audio tracks, or unsupported codecs.

### 3.4 AI Video Analysis Engine
- **FR-AI-01 (Audio Extraction)**: Lossless speech-band audio extraction (`16kHz`, mono PCM WAV) from the source video via FFmpeg.
- **FR-AI-02 (Word-Level Speech-to-Text)**: High-accuracy transcription using `faster-whisper` producing both segment-level and word-level start/end timestamps with confidence scores.
- **FR-AI-03 (Speaker Diarization)**: Identification of distinct speakers (`SPEAKER_00`, `SPEAKER_01`, etc.) using `pyannote.audio` aligned with Whisper word timestamps to detect turn-taking and multi-person dialogue.
- **FR-AI-04 (Scene & Visual Activity Analysis)**: OpenCV frame sampling to detect shot boundaries, scene cuts, and face bounding box coordinates over time.
- **FR-AI-05 (Semantic & Narrative Analysis)**: Windowed transcript analysis via Gemini API to map topic shifts, emotional tone, humor, educational explanations, storytelling arcs, and debate/discussion peaks.

### 3.5 AI Clip Detection & Multi-Factor Scoring
- **FR-CLIP-01 (Archetype Identification)**: The AI identifies candidate segments across 10 core archetypes:
  1. Strong Opening Hooks
  2. Funny / Humorous Moments
  3. Unexpected / Contrarian Statements
  4. High-Value Important Information
  5. Emotional / Vulnerable Moments
  6. Engaging Multi-Speaker Discussions
  7. Step-by-Step Educational Explanations
  8. Motivational / Inspirational Soundbites
  9. Self-Contained Storytelling Segments
  10. Strong Summary Conclusions
- **FR-CLIP-02 (Structured Clip Metadata)**: Every detected clip includes:
  - `startTime` (seconds, float to millisecond precision)
  - `endTime` (seconds, float)
  - `duration` (seconds)
  - `title` (compelling, scroll-stopping working title)
  - `description` (2–3 sentence summary of the clip context)
  - `category` (`HOOK`, `FUNNY`, `EDUCATIONAL`, `EMOTIONAL`, `STORYTELLING`, `MOTIVATIONAL`, `DISCUSSION`, `INSIGHT`)
  - `selectionReason` (human-readable explanation of *why* the AI chose this segment)
- **FR-CLIP-03 (Multi-Factor Engagement Scoring)**: Each candidate is evaluated on a `0–100` scale across four transparent metrics:
  - **Hook Score (`0–100`)**: Strength of the first 3–5 seconds in capturing attention.
  - **Engagement Score (`0–100`)**: Pacing, emotional resonance, humor, or information density throughout the body.
  - **Context Completeness Score (`0–100`)**: How well the clip stands alone without requiring external context from earlier in the video.
  - **Overall Potential Score (`0–100`)**: Weighted composite score (`0.30 * Hook + 0.40 * Engagement + 0.30 * Context Completeness`).
  - *Policy Constraint*: The UI and documentation must frame scores strictly as **Estimated Engagement Potential** and never guarantee virality.

### 3.6 Clip Generation & Automatic Editing
- **FR-EDIT-01 (Configurable Target Durations)**: Users can specify preferred clip length constraints before processing (e.g., `15–30s`, `30–60s`, `60–90s`, or `Auto (15–90s)`).
- **FR-EDIT-02 (De-duplication & Overlap Prevention)**: IoU (Intersection over Union) temporal filtering prevents generating overlapping clips covering the same point unless explicitly requested.
- **FR-EDIT-03 (Multi-Aspect Ratio Support)**: Render clips in `9:16` (Vertical: 1080x1920), `16:9` (Horizontal: 1920x1080), and `1:1` (Square: 1080x1080).
- **FR-EDIT-04 (Smart Reframing & Speaker Cropping)**:
  - Single active speaker in frame: Dynamically center crop (`9:16` or `1:1`) around the smoothed face bounding box trajectory using OpenCV + deadzone stabilization to avoid jitter.
  - No face detected (e.g., screen share / slides): Fallback to center crop or blurred pillarbox/letterbox background mode.
- **FR-EDIT-05 (Automatic Dynamic Subtitles)**:
  - Burned-in subtitles via FFmpeg `libass` (`.ass` Advanced SubStation Alpha format) generated from word-level timestamps.
  - Configurable styling presets (Font family, font size, primary text color, active word highlight color, stroke/outline thickness, background box, and vertical safe-zone positioning: Top, Middle, Bottom-Safe).
- **FR-EDIT-06 (Thumbnail Generation)**: Extract the highest-sharpness frame (via Laplacian variance) containing a clear face expression within the clip's first 5 seconds as a `.jpg` thumbnail.

### 3.7 Clip Management & Lightweight Editor
- **FR-MGMT-01 (Clip Gallery & Filtering)**: View all generated clips for a project; sort by Overall Potential Score, Hook Score, Duration, or Chronological Order; filter by Category.
- **FR-MGMT-02 (Interactive Preview)**: Built-in video player with synchronized transcript view.
- **FR-MGMT-03 (Metadata & Caption Editing)**: Edit clip title, description, and correct typos in individual subtitle words/lines before re-rendering.
- **FR-MGMT-04 (Boundary Trimming & Regeneration)**: Adjust clip start/end timestamps by dragging word boundaries in the transcript and trigger a fast re-render (`POST /api/v1/clips/:id/regenerate`).
- **FR-MGMT-05 (Export & Download)**: Download rendered MP4 files in the user's tier resolution (720p or 1080p) via signed CDN/object storage URLs.

---

## 4. Subscription & Monetization Model

Pricing values are **configurable via environment/database configuration** so business teams can run pricing experiments without code changes. Below is the capability matrix across tiers:

| Capability / Limit | Free Tier | Starter Tier | Pro Tier | Business Tier |
| :--- | :--- | :--- | :--- | :--- |
| **Monthly Price** | Configurable (`$0` / `₹0`) | Configurable | Configurable | Configurable |
| **Monthly Processing Credits** | 60 source minutes / mo | 300 source minutes / mo | 1,000 source minutes / mo | 3,000 source minutes / mo |
| **Max Source Video Duration** | 30 minutes | 90 minutes | 180 minutes (3 hrs) | 240 minutes (4 hrs) |
| **Max Upload File Size** | 500 MB | 2 GB | 5 GB | 10 GB |
| **Max Clips Generated / Video** | Up to 5 clips | Up to 15 clips | Up to 30 clips | Up to 50 clips |
| **Max Export Resolution** | 720p (`720x1280`) | 1080p (`1080x1920`) | 1080p (`1080x1920`) | 1080p (`1080x1920`) |
| **Watermark Policy** | ClipForge AI watermark burned in | No watermark | No watermark | No watermark |
| **Queue Priority** | Standard (Low priority `10`) | Medium priority (`5`) | High priority (`2`) | Critical priority (`1`) |
| **Project Storage Retention** | 7 days | 30 days | 90 days | 180 days |
| **Aspect Ratios** | `9:16` only | `9:16`, `16:9`, `1:1` | `9:16`, `16:9`, `1:1` | `9:16`, `16:9`, `1:1` |

### Credit Deduction Rules
- **1 Credit = 1 Minute of Source Video Analyzed** (rounded up to the nearest minute; e.g., a 14m 20s video consumes 15 credits).
- Credits are reserved (`HELD`) when a job starts and permanently deducted (`COMMITTED`) once AI analysis and initial clip generation succeed.
- If a system failure causes the job to fail permanently, held credits are automatically refunded (`REFUNDED`) to the user's balance.
- Re-rendering an existing clip (e.g., fixing a subtitle typo or changing aspect ratio) does **not** consume additional source analysis credits (subject to a fair-use limit of 5 exports per clip).

---

## 5. Non-Functional Requirements (NFRs)

1. **Performance**:
   - Standard API read endpoints (`GET /projects`, `GET /clips`) must respond in **< 200ms (p95)**.
   - End-to-end processing time for a 30-minute 1080p source video (audio extraction, transcription, Gemini analysis, and rendering 10 clips) must complete in **< 6 minutes** under normal queue load (~0.2x real-time).
2. **Scalability**:
   - Stateless Node.js API tier horizontally scalable behind a load balancer.
   - Decoupled AI workers and FFmpeg rendering workers that autoscale independently based on BullMQ queue depth.
3. **Security**:
   - OWASP Top 10 compliance, Argon2id password hashing, strict tenant isolation on all database queries, presigned S3/R2 URLs with short TTLs (15 minutes), and SSRF guards on URL ingestion.
4. **Reliability & Idempotency**:
   - Target **99.5% uptime** for the web app and API.
   - All background jobs must be idempotent; worker crashes during FFmpeg rendering or Whisper transcription must safely retry up to 3 times with exponential backoff without duplicating database records or double-charging user credits.
5. **Accessibility & Responsive Design**:
   - WCAG 2.1 AA compliant color contrast and keyboard navigation across dashboard and clip review interfaces.
   - Fully responsive web interface supporting desktop editing workflows (`>= 1024px`) and mobile clip review/downloading (`375px+`).
6. **Data Privacy & Compliance**:
   - Users retain full intellectual property ownership of uploaded source videos and generated clips.
   - Automated lifecycle cron policies purge expired source videos and temporary working files from object storage and worker scratch disks.

---

## 6. User Stories & Acceptance Criteria

### US-01: Upload Video & Trigger AI Clipping
- **As a** Podcaster,
- **I want to** upload a 45-minute MP4 episode and select my preferred clip duration (`30–60s`) and aspect ratio (`9:16`),
- **So that** the platform automatically extracts the best standalone segments without manual editing.
- **Acceptance Criteria**:
  - [ ] Given an authenticated user with `>= 45` available credits, when they select a valid `.mp4` file (`<= tier max size`), the file uploads directly to object storage with a live progress bar.
  - [ ] When the user clicks "Generate Clips", the backend verifies credit balance, places 45 credits on hold, creates a `ProcessingJob`, and returns `202 Accepted`.
  - [ ] The UI displays real-time status transitions (`Queued` → `Transcribing` → `Analyzing Moments` → `Rendering Clips` → `Completed`).
  - [ ] Upon completion, the user sees a ranked gallery of generated clips with playable previews.

### US-02: Evaluate Clips via Multi-Factor AI Scores
- **As a** Social Media Manager,
- **I want to** see why each clip was chosen along with separate Hook, Engagement, and Context Completeness scores,
- **So that** I can prioritize exporting the highest-potential clips first.
- **Acceptance Criteria**:
  - [ ] Each clip card displays the Overall Potential Score (`0–100`) and a tooltip/drawer showing Hook Score, Engagement Score, Context Completeness Score, Category badge, and the AI's `selectionReason`.
  - [ ] Users can filter clips by category (e.g., `EDUCATIONAL`, `FUNNY`) and sort by any score dimension.
  - [ ] No UI copy claims "Guaranteed Viral".

### US-03: Edit Subtitle Text & Re-Render Clip
- **As a** Content Creator,
- **I want to** fix a misspelled proper noun in the generated subtitles and change the caption style preset,
- **So that** my exported video looks professional and accurate.
- **Acceptance Criteria**:
  - [ ] In the Clip Editor view, clicking any word in the synchronized transcript allows inline text editing.
  - [ ] Clicking "Save & Re-render" updates the `ClipCaption` JSON, queues a lightweight `RENDER_CLIP` job (skipping Whisper and Gemini), and produces an updated MP4 within 30 seconds.
  - [ ] No additional source analysis credits are deducted for the re-render.

### US-04: Purchase Subscription via Razorpay
- **As an** Indian Creator on the Free tier,
- **I want to** upgrade to the Pro tier using UPI or a credit card via Razorpay,
- **So that** I can process 2-hour videos and export 1080p watermark-free clips.
- **Acceptance Criteria**:
  - [ ] Selecting "Upgrade to Pro" creates a Razorpay order/subscription and opens the checkout modal.
  - [ ] Upon verified `payment.captured` / `subscription.activated` webhook signature validation, the user's `Subscription` record updates to `ACTIVE` on the `PRO` plan, and `1,000` credits are provisioned in `UsageCredit`.

---

## 7. Scope Matrix: MVP vs. V2 vs. Future Roadmap

To ensure focused execution and rapid time-to-market, features are strictly partitioned:

| Feature Module | MVP (Phase 1–14 Release) | Version 2.0 (Post-Launch) | Future Roadmap (V3+) |
| :--- | :--- | :--- | :--- |
| **Authentication** | Email/Password, JWT + Refresh Sessions, Email Verification, Password Reset | Google OAuth 2.0, Magic Links | SSO (SAML), Two-Factor Auth (2FA) |
| **Video Ingestion** | Direct MP4/MOV Multipart Upload, Authorized Direct Media URLs | Cloud Drive imports (Google Drive, Dropbox) | Live stream real-time clipping |
| **Transcription & AI** | English Whisper STT, Pyannote Diarization, Gemini Semantic Analysis & Multi-Factor Scoring | Multi-language STT + Cross-lingual subtitle translation | AI voiceover dubbing, B-roll auto-insertion |
| **Framing & Editing** | `9:16`, `16:9`, `1:1` export; Single-speaker face centering + blurred background fallback; 3 curated subtitle presets | Split-screen two-speaker layouts; AI-generated visual hooks & custom brand templates/fonts/watermarks | Timeline multi-track editor, AI zoom/SFX automation |
| **Publishing & Sharing** | MP4 Download, Thumbnail Download, Clip metadata copy | AI-generated platform captions & hashtag suggestions; Direct publishing to YouTube Shorts, Instagram Reels, TikTok | Scheduled content calendar, Team workspaces & approval workflows, Public REST API |
| **Billing** | Razorpay integration + Credit ledger | Stripe integration for multi-currency global billing | Enterprise custom invoicing & usage-based overage billing |

