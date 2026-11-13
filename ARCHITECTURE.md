# ClipForge AI — Root Architecture Overview & Blueprint Governance

| Metadata                  | Details                                                        |
| :------------------------ | :------------------------------------------------------------- |
| **System Name**           | ClipForge AI                                                   |
| **Blueprint Version**     | 1.0.0                                                          |
| **Related Detailed Spec** | [`docs/SYSTEM_ARCHITECTURE.md`](./docs/SYSTEM_ARCHITECTURE.md) |

---

## 1. Executive Architecture Blueprint

ClipForge AI is architected as a **Polyglot, Queue-Driven Media & AI SaaS Monorepo**. It cleanly separates **Synchronous User Control Operations** from **Asynchronous Heavy Media & AI Compute**:

1. **Client & Edge Layer (`apps/web`, `apps/admin`)**: Next.js 15 App Router applications deployed on Vercel. Uses TanStack Query for server state/job polling and Zustand for high-frequency (`60fps`) clip editor playhead synchronization.
2. **Control Plane (`apps/api`)**: Stateless Node.js + Express + TypeScript REST API. Manages Argon2id/JWT authentication, Razorpay/Stripe webhooks, atomic credit ledger reservations (`UsageCredit` / `UsageHistory`), S3/R2 presigned multipart upload coordination, and BullMQ job dispatching.
3. **State & Messaging Plane**:
   - **PostgreSQL 16 (via Prisma ORM)**: Primary relational source of truth (`packages/database/prisma/schema.prisma`) storing 17 normalized entities.
   - **Redis 7 + BullMQ**: Priority job queues (`project-analysis-queue`, `clip-render-queue`, `maintenance-cleanup-queue`), live job progress cache, and sliding-window rate limiters.
   - **Cloudflare R2 (S3-Compatible Object Storage)**: Stores raw uploaded videos, intermediate `16kHz` mono WAV audio, rendered `.mp4` exports, and `.jpg` thumbnails with zero egress fees.
4. **Media & AI Compute Plane (`services/video-worker` & `services/ai-service`)**:
   - **`services/video-worker`**: Node.js BullMQ worker that streams source videos to isolated NVMe scratch directories (`/tmp/clipforge/jobs/{jobId}`), runs `ffprobe` and `ffmpeg` for audio extraction, coordinates with `ai-service`, generates `.ass` dynamic subtitle files, and executes single-pass `libx264` + `libass` video rendering.
   - **`services/ai-service`**: Internal Python FastAPI microservice executing `faster-whisper` (word-level STT), `pyannote.audio` (speaker diarization), `Google Gemini` (semantic clip detection & multi-factor scoring), and `OpenCV + MediaPipe` (scene cut detection & smoothed active-speaker `9:16` cropping).

---

## 2. Architectural Rules Compliance Matrix

Every requirement in the Master Architectural Rules is enforced across this blueprint:

| #      | Architectural Rule                            | How It Is Enforced in ClipForge AI                                                                                                                          | Reference Document                                                                    |
| :----- | :-------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------ |
| **1**  | **MVP first, extensible architecture**        | Strict separation of MVP features from V2/V3; extensible interfaces for OAuth (`Account` table) and Payments (`IPaymentGateway` for Razorpay + Stripe).     | [`docs/PRD.md`](./docs/PRD.md) (§7)                                                   |
| **2**  | **TypeScript for frontend & Node.js backend** | End-to-end strict TypeScript across `apps/web`, `apps/admin`, `apps/api`, `services/video-worker`, and `packages/*`.                                        | [`docs/TRD.md`](./docs/TRD.md) (§2)                                                   |
| **3**  | **Python for AI & vision orchestration**      | `services/ai-service` uses Python 3.11+, FastAPI, `faster-whisper`, `pyannote.audio`, `google-genai`, and `OpenCV`.                                         | [`docs/AI_PIPELINE.md`](./docs/AI_PIPELINE.md)                                        |
| **4**  | **FFmpeg for actual video rendering**         | All cutting, dynamic cropping, scaling, padding, and `.ass` subtitle burn-in run in a single deterministic FFmpeg 7 filtergraph pass.                       | [`docs/AI_PIPELINE.md`](./docs/AI_PIPELINE.md) (§2, Steps 13–14)                      |
| **5**  | **Background workers for long-running tasks** | All audio extraction, transcription, semantic analysis, and rendering execute inside `services/video-worker`.                                               | [`docs/SYSTEM_ARCHITECTURE.md`](./docs/SYSTEM_ARCHITECTURE.md) (§4)                   |
| **6**  | **Never block the API server**                | Direct browser-to-R2 multipart uploads bypass the API completely; `POST /projects/:id/process` enqueues a BullMQ job and returns `202 Accepted` in `<50ms`. | [`docs/TRD.md`](./docs/TRD.md) (§4.1)                                                 |
| **7**  | **PostgreSQL as primary relational DB**       | 17 normalized tables managed via Prisma ORM with ACID transactions for credit reservations and job state updates.                                           | [`docs/DATABASE_SCHEMA.md`](./docs/DATABASE_SCHEMA.md)                                |
| **8**  | **Redis & BullMQ for background processing**  | Three dedicated BullMQ queues with priority tiers, exponential backoff retries, cancellation flags, and dead-letter handling.                               | [`docs/SYSTEM_ARCHITECTURE.md`](./docs/SYSTEM_ARCHITECTURE.md) (§4.1–4.4)             |
| **9**  | **Store large video files in object storage** | PostgreSQL stores only `storageBucket` and `storageKey` in `VideoAsset` and `Export`; media bytes reside exclusively in Cloudflare R2 / S3.                 | [`docs/DATABASE_SCHEMA.md`](./docs/DATABASE_SCHEMA.md) (§2.3, §2.5)                   |
| **10** | **Structured AI outputs with validation**     | Gemini uses Native Structured Outputs (`response_schema`), validated by Pydantic v2 in Python and Zod in TypeScript.                                        | [`docs/AI_PIPELINE.md`](./docs/AI_PIPELINE.md) (§3)                                   |
| **11** | **Do not expose API keys in the frontend**    | `GEMINI_API_KEY`, `R2_SECRET_ACCESS_KEY`, `RAZORPAY_KEY_SECRET`, and `INTERNAL_SERVICE_API_KEY` are backend/worker-only secrets.                            | [`.env.example`](./.env.example)                                                      |
| **12** | **No unauthorized third-party downloading**   | Mandatory `rightsAttested: true` check, SSRF guard, and support restricted strictly to user uploads and authorized direct media URLs.                       | [`docs/SECURITY_AND_SCALABILITY.md`](./docs/SECURITY_AND_SCALABILITY.md) (§1.5, §1.8) |
| **13** | **Secure auth, billing, and user data**       | Argon2id hashing, rotating `Session` refresh tokens, HMAC-SHA256 webhook verification, and strict `userId` tenant scoping on every query.                   | [`docs/SECURITY_AND_SCALABILITY.md`](./docs/SECURITY_AND_SCALABILITY.md) (§1)         |
| **14** | **Avoid unnecessary microservices**           | Consolidated into just 2 backend runtime services (`apps/api` and `services/ai-service`) plus 1 queue worker (`services/video-worker`).                     | [`docs/FOLDER_STRUCTURE.md`](./docs/FOLDER_STRUCTURE.md)                              |
| **15** | **Do not implement future features in MVP**   | Social auto-publishing, multi-language dubbing, team workspaces, and custom brand fonts are deferred to V2/V3.                                              | [`docs/PRD.md`](./docs/PRD.md) (§7)                                                   |
| **16** | **Reusable components & consistent naming**   | Shared `@clipforge/ui`, `@clipforge/shared-types`, and `@clipforge/validation` packages across the monorepo.                                                | [`docs/FOLDER_STRUCTURE.md`](./docs/FOLDER_STRUCTURE.md) (§2.6)                       |
| **17** | **Proper logging and error handling**         | Structured Pino JSON logging with correlation IDs (`requestId`, `jobId`) and standardized REST error envelopes.                                             | [`docs/API_DOCUMENTATION.md`](./docs/API_DOCUMENTATION.md) (§1.2)                     |
| **18** | **Make every decision explainable**           | Explicit architectural justifications documented for R2 zero-egress, `.ass` subtitle burn-in, `faster-whisper`, and payment abstraction.                    | [`docs/TRD.md`](./docs/TRD.md) (§2, §4)                                               |
