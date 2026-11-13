# Comprehensive Testing Strategy: ClipForge AI

| Document Metadata | Details |
| :--- | :--- |
| **Project Name** | ClipForge AI |
| **Document Version** | 1.0.0 |
| **Coverage Target** | `>= 85%` on Core Business Logic (Credits, Scoring, Snapping, Auth); `100%` on Critical E2E User Flows |

---

## 1. Testing Pyramid & Tooling Matrix

| Testing Layer | Scope | Primary Tools & Frameworks | Execution Trigger |
| :--- | :--- | :--- | :--- |
| **1. Unit Testing** | Pure functions, credit math, boundary snapping, IoU filtering, `.ass` subtitle generation | **Vitest** (TypeScript), **Pytest** (Python) | Pre-commit & Every PR |
| **2. Integration Testing** | Prisma DB transactions, Redis BullMQ job flows, S3/MinIO multipart uploads | **Vitest** + **Testcontainers** (Postgres, Redis, MinIO) | Every PR |
| **3. REST API Testing** | HTTP status codes, Zod payload validation, JWT auth guards, rate limiters | **Supertest** + **Vitest** (`apps/api`), **HTTPX** (`services/ai-service`) | Every PR |
| **4. Frontend Component Testing** | React components, hooks, Zustand editor store, form validation | **Vitest** + **React Testing Library (RTL)** + **MSW (Mock Service Worker)** | Every PR |
| **5. AI Pipeline Testing** | Whisper alignment, chunking, Gemini schema compliance, deterministic scoring | **Pytest** + Golden Transcript Fixtures + Recorded LLM Vassettes | Every PR & Nightly Eval |
| **6. Video Rendering Testing** | FFmpeg cutting, `9:16` crop dimensions, audio/video sync, `.ass` burn-in verification | **Vitest** + `ffprobe` output inspection + Structural Similarity (**SSIM**) frame checks | Every PR touching `video-worker` |
| **7. End-to-End (E2E) Testing** | Full browser-to-worker flows (Register → Upload → Generate → Edit → Export) | **Playwright** | Pre-merge to `main` & Staging |
| **8. Load & Stress Testing** | API concurrency, BullMQ queue backpressure, worker memory stability | **k6** (Grafana k6) | Pre-release / Staging |
| **9. Security Testing** | SSRF bypasses, IDOR tenant isolation, webhook spoofing, malformed media fuzzing | **OWASP ZAP**, Custom Security Regression Suite (Supertest), **Trivy** | Every PR & Weekly Scan |

---

## 2. Detailed Testing Specifications & Example Test Cases

### 2.1 Unit Testing (`Vitest` & `Pytest`)
Focuses on deterministic algorithms without network or database I/O.

#### Key Test Cases:
- **TC-UNIT-01 (Credit Calculation & Hold Invariant)**:
  - *Input*: Source video duration `841.2 seconds` (`14m 01.2s`).
  - *Expected*: `calculateRequiredCredits(841.2)` returns `15` credits (rounded up to nearest minute).
- **TC-UNIT-02 (Word Boundary Snapping - `boundary_optimizer.py`)**:
  - *Input*: Gemini proposes `start_time = 100.0s`, `end_time = 135.0s`. Whisper words show a sentence starting at `98.40s` (`"Never"`) and ending at `135.60s` (`"growth."`).
  - *Expected*: Optimizer snaps `startTime` to `98.28s` (`98.40s - 0.12s` pre-roll) and `endTime` to `135.80s` (`135.60s + 0.20s` post-roll).
- **TC-UNIT-03 (Temporal NMS IoU De-duplication)**:
  - *Input*: Candidate A (`[100s, 150s]`, `overallScore: 92`) and Candidate B (`[110s, 155s]`, `overallScore: 85`).
  - *Expected*: Computed $\text{IoU} = \frac{40}{55} = 0.727 > 0.15$; Candidate B is discarded and only Candidate A is retained.
- **TC-UNIT-04 (`.ass` Subtitle Escape & Generation - `subtitle-generator.ts`)**:
  - *Input*: User edits word text to `"100% {growth} \N hack"`.
  - *Expected*: Generator strips/escapes `{`, `}`, and `\` control characters so FFmpeg `libass` does not interpret user text as override tags, and outputs valid `Dialogue:` lines with millisecond timing (`0:00:00.00` format).
- **TC-UNIT-05 (OpenCV Deadzone Crop Smoother - `crop_smoother.py`)**:
  - *Input*: Face center $X$ oscillates by $\pm 15\text{px}$ across 30 consecutive frames (natural head bobbing while speaking).
  - *Expected*: Output crop window $X$ remains completely stationary (`0px` movement) because oscillations fall within the 25% deadzone threshold.

---

### 2.2 Integration Testing (`Testcontainers`)
Spins up ephemeral PostgreSQL, Redis, and MinIO containers to test stateful interactions.

#### Key Test Cases:
- **TC-INT-01 (Atomic Credit Hold, Commit & Refund Under Concurrency)**:
  - *Scenario*: User has `50` available credits. Two parallel requests attempt to start a 30-credit job simultaneously (`Promise.all`).
  - *Expected*: PostgreSQL row-level locking (`SELECT ... FOR UPDATE`) allows exactly one job to transition to `QUEUED` (`heldCredits = 30`, available `= 20`) and rejects the second request with `402 INSUFFICIENT_CREDITS`.
- **TC-INT-02 (Idempotent Job Recovery & Checkpoint Resumption)**:
  - *Scenario*: A `FULL_PROJECT_ANALYSIS` job completes Whisper transcription (`Transcript` persisted in DB), then fails on attempt #1 due to a simulated Gemini `503` timeout. BullMQ retries attempt #2.
  - *Expected*: Attempt #2 detects the existing `Transcript` record for `projectId`, skips FFmpeg audio extraction and Whisper transcription, and resumes directly at the Gemini semantic analysis step.
- **TC-INT-03 (Razorpay Webhook Idempotency)**:
  - *Scenario*: Razorpay delivers the same `payment.captured` webhook payload twice within 2 seconds.
  - *Expected*: Unique constraint on `Payment.providerOrderId` / `providerPaymentId` ensures user's `UsageCredit` balance is incremented **once**, and both webhook requests return `200 OK`.

---

### 2.3 REST API Testing (`Supertest`)
Tests every endpoint in `API_DOCUMENTATION.md` for contract compliance.

#### Key Test Cases:
- **TC-API-01 (Rights Attestation Enforcement)**:
  - `POST /api/v1/projects` with `"rightsAttested": false` → Returns `400 VALIDATION_ERROR`.
- **TC-API-02 (Tier Upload Limit Enforcement)**:
  - Authenticated `FREE` tier user calls `POST /api/v1/videos/upload/initiate` with `fileSizeBytes: 1073741824` (1 GB > 500 MB Free limit) → Returns `413 FILE_SIZE_EXCEEDS_TIER_LIMIT`.
- **TC-API-03 (Cross-Tenant IDOR Protection)**:
  - User A requests `GET /api/v1/projects/{userB_projectId}` or `PATCH /api/v1/clips/{userB_clipId}` → Returns `404 NOT_FOUND` (never leaking resource existence).

---

### 2.4 Frontend Component & State Testing (`RTL` + `MSW`)
Tests interactive UI components in `apps/web` in isolation.

#### Key Test Cases:
- **TC-FE-01 (Synchronized Transcript Word Highlighting)**:
  - *Scenario*: `editor.store.ts` updates `currentPlaybackTime` to `14.52s`.
  - *Expected*: `TranscriptWordEditor` highlights the exact word whose `[startRel, endRel]` spans `14.52s` and scrolls it into view.
- **TC-FE-02 (Job Status Polling Auto-Stop)**:
  - *Scenario*: `use-job-polling.ts` polls `GET /api/v1/jobs/:id` while status is `RUNNING`, then MSW returns `status: "COMPLETED"`.
  - *Expected*: Polling stops immediately and invalidates `["project-clips", projectId]` query cache to render the clip gallery.

---

### 2.5 AI Pipeline & LLM Evaluation Testing
Tests both deterministic schema handling and semantic clip quality.

#### Key Test Cases:
- **TC-AI-01 (Malformed / Hallucinated Timestamp Rejection)**:
  - *Scenario*: Mock Gemini response returns a clip with `end_time: 5400.0` on a `1800.0s` (30-minute) video, or `end_time < start_time`.
  - *Expected*: Pydantic validator catches out-of-bounds timestamps, discards/clamps the invalid candidate, or triggers a structured repair retry.
- **TC-AI-02 (Golden Dataset Recall Benchmark - Nightly CI)**:
  - *Scenario*: Run the semantic detector against 5 human-annotated benchmark transcripts (1 tech podcast, 1 comedy interview, 1 coding lecture, 1 motivational keynote, 1 founder Q&A) where human editors marked 25 ground-truth highlight segments.
  - *Expected*: AI candidate clips achieve `>= 75%` temporal overlap recall with human-selected highlights and `overallScore` correlates positively with complete narrative arcs.

---

### 2.6 Video Rendering & Media Verification (`FFmpeg` + `ffprobe`)
Uses a synthetic 60-second 1080p test video (with a speaking human face for 40s and a static code screen-share for 20s) in CI.

#### Key Test Cases:
- **TC-VID-01 (Output Container & Stream Spec Verification)**:
  - Run `clip-render.processor.ts` for `RATIO_9_16` (`RES_1080P`) and inspect output via `ffprobe`:
  - *Expected*: `width === 1080`, `height === 1920`, `codec_name === "h264"`, `pix_fmt === "yuv420p"`, audio `codec_name === "aac"`, and `duration` matches `clip.duration ± 0.10s`.
- **TC-VID-02 (Free Tier Watermark Verification)**:
  - Render clip for a `FREE` tier project (`hasWatermark: true`) vs `PRO` tier (`hasWatermark: false`) and compare top-right corner ROI pixel variance.
  - *Expected*: Watermark pixels are visibly burned into the `FREE` tier export and absent from the `PRO` tier export.
- **TC-VID-03 (Scratch Disk Cleanup Verification)**:
  - Trigger a render failure (e.g., invalid font path) and inspect `/tmp/clipforge/jobs/{jobId}`.
  - *Expected*: Directory `/tmp/clipforge/jobs/{jobId}` does not exist after the processor exits.

---

### 2.7 End-to-End (E2E) Testing (`Playwright`)
Runs against the full Docker Compose stack (with a fast deterministic mock mode for Gemini/Whisper in CI, plus 1 live-model smoke test).

#### Critical E2E User Journey (`e2e/clip-lifecycle.spec.ts`):
1. Register a new account → Verify email via test mail catcher → Land on `/dashboard` showing `60 / 60 mins` available credits.
2. Upload `sample-podcast-2min.mp4`, check the Rights Attestation box, select `9:16` and `15–45s` duration, and click **Generate Clips**.
3. Observe progress transition through `Extracting Audio` → `Transcribing` → `Analyzing Semantics` → `Rendering Clips` → `Completed`.
4. Verify credit balance updates to `58 / 60 mins` (`2 credits` consumed).
5. Open Clip #1 in the **Clip Editor**, verifyHook/Engagement/Context scores are displayed, edit the first subtitle word, and click **Regenerate**.
6. Click **Download MP4** and assert the downloaded file has `Content-Type: video/mp4` and byte size `> 100 KB`.

---

### 2.8 Load & Security Testing
- **Load Testing (`k6`)**:
  - Simulate **200 concurrent users** browsing dashboards and polling `/api/v1/jobs/:id` while **50 video processing jobs** are enqueued simultaneously.
  - *Pass Criteria*: API `p95` latency stays `< 200ms`, zero HTTP `5xx` errors, and BullMQ processes all 50 jobs in priority order (`BUSINESS` → `PRO` → `STARTER` → `FREE`) without worker OOM crashes.
- **Security Regression Suite**:
  - **SSRF Test Matrix**: Test `POST /api/v1/videos/url` against `http://localhost:4000`, `https://127.0.0.1`, `https://[::1]`, `https://169.254.169.254/latest/meta-data/`, and DNS-rebinding records resolving to `10.0.0.1` → All must be blocked before opening a socket.
  - **Malformed Container Fuzzing**: Upload a text file renamed to `exploit.mp4` and an HLS `.m3u8` file referencing `file:///etc/passwd` → Worker must reject both during Step 1/Step 2 validation without leaking local file contents.

