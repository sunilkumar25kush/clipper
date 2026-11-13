# Complete Monorepo Folder Structure: ClipForge AI

| Document Metadata | Details |
| :--- | :--- |
| **Project Name** | ClipForge AI |
| **Document Version** | 1.0.0 |
| **Workspace Manager** | `pnpm` Workspaces + Turborepo (`turbo.json`) + Python `uv` / `poetry` for AI Service |

---

## 1. Root Monorepo Overview

```text
clipforge-ai/
├── apps/
│   ├── web/                        # [Frontend] Next.js 15 creator-facing SaaS application
│   ├── api/                        # [Backend] Node.js + Express + TypeScript REST API server
│   └── admin/                      # [Frontend] Internal Next.js operational & support dashboard
├── services/
│   ├── ai-service/                 # [AI] Python FastAPI service (Whisper, Pyannote, Gemini, OpenCV)
│   └── video-worker/               # [Worker] Node.js BullMQ consumer + FFmpeg rendering pipeline
├── packages/
│   ├── database/                   # [Shared] Prisma schema, migrations, and typed Prisma client
│   ├── shared-types/               # [Shared] TypeScript interfaces, enums, DTOs, and queue contracts
│   ├── validation/                 # [Shared] Isomorphic Zod schemas for API & frontend forms
│   ├── config/                     # [Shared] ESLint, TypeScript (tsconfig), and Tailwind presets
│   └── ui/                         # [Shared] Reusable React + Tailwind + shadcn/ui component library
├── infrastructure/
│   ├── docker/                     # [Infra] Production Dockerfiles for API, AI Service, and Worker
│   ├── nginx/                      # [Infra] Reverse proxy, TLS termination, and rate-limit configs
│   └── scripts/                    # [Infra] DB seeding, FFmpeg verification, and cleanup scripts
├── docs/                           # [Docs] Complete product, architecture, API, and AI specifications
├── docker-compose.yml              # Local development stack (Postgres, Redis, MinIO/R2 mock, services)
├── package.json                    # Root scripts and workspace orchestration
├── pnpm-workspace.yaml             # pnpm workspace package definitions
├── turbo.json                      # Build, lint, and test caching pipeline
├── .env.example                    # Master environment variable template
├── .gitignore                      # Git ignore rules for Node, Python, Docker, and media scratch files
└── README.md                       # Project entry point and developer quickstart guide
```

> **Note on `packages/database`**: While the logical architecture groups database access under the backend and worker layers, placing the Prisma schema and generated client in `packages/database` allows both `apps/api` and `services/video-worker` to import the exact same Prisma types without code duplication.

---

## 2. Detailed Internal Directory Structures

### 2.1 User-Facing Frontend (`apps/web/`)
- **Domain**: Frontend (`Next.js 15 App Router`, `React 19`, `TypeScript`)
- **Used By**: End users (Creators, Podcasters, Agencies)

```text
apps/web/
├── public/
│   ├── fonts/                      # Subtitle preview fonts (Inter, Montserrat, Komika Axis)
│   └── images/                     # Marketing assets, placeholders, and watermarks
├── src/
│   ├── app/                        # Next.js App Router pages and layouts
│   │   ├── (marketing)/            # Public landing page, pricing, terms, privacy policy
│   │   │   ├── page.tsx
│   │   │   ├── pricing/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (auth)/                 # Unauthenticated routes (login, register, forgot-password, verify)
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   ├── forgot-password/page.tsx
│   │   │   ├── verify-email/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/            # Protected SaaS application routes
│   │   │   ├── dashboard/          # Main overview, quick upload bar, credit telemetry
│   │   │   │   └── page.tsx
│   │   │   ├── projects/           # Video projects list and individual project workspace
│   │   │   │   ├── page.tsx
│   │   │   │   └── [projectId]/
│   │   │   │       ├── page.tsx    # Ranked gallery of generated clips + job progress tracker
│   │   │   │       └── clips/
│   │   │   │           └── [clipId]/
│   │   │   │               └── page.tsx  # Interactive Clip & Subtitle Editor
│   │   │   ├── billing/            # Subscription plans, Razorpay checkout, credit history
│   │   │   │   └── page.tsx
│   │   │   ├── settings/           # User profile, password update, active sessions
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx          # Sidebar navigation, top header, credit badge
│   │   ├── layout.tsx              # Root HTML shell, QueryProvider, ThemeProvider, Toaster
│   │   └── globals.css             # Tailwind directives and CSS variables
│   ├── components/
│   │   ├── auth/                   # LoginForm, RegisterForm, RightsAttestationCheckbox
│   │   ├── dashboard/              # StatsCards, CreditUsageMeter, RecentProjectsList
│   │   ├── upload/                 # VideoDropzone, UrlIngestionInput, UploadProgressModal
│   │   ├── projects/               # JobStatusPipeline, ProjectHeader, ClipFilterBar
│   │   ├── clips/                  # ClipCard, ScoreBreakdownBadge, CategoryPill
│   │   └── editor/                 # VideoPlayer9x16, TranscriptWordEditor, SubtitleStylePanel, AspectRatioSelector
│   ├── hooks/
│   │   ├── use-auth.ts             # Current user session & login/logout mutations
│   │   ├── use-multipart-upload.ts # Orchestrates chunked S3/R2 PUT requests with progress %
│   │   ├── use-job-polling.ts      # TanStack Query hook polling GET /api/v1/jobs/:id
│   │   └── use-clips.ts            # Queries and optimistic mutations for clip edits & regeneration
│   ├── services/
│   │   ├── api-client.ts           # Axios/Fetch wrapper with automatic JWT refresh interceptor
│   │   ├── auth.service.ts         # Auth API calls
│   │   ├── project.service.ts      # Project & video ingestion API calls
│   │   ├── clip.service.ts         # Clip CRUD, caption updates, and export API calls
│   │   └── billing.service.ts      # Razorpay order creation and subscription status calls
│   ├── stores/
│   │   ├── editor.store.ts         # Zustand store: currentPlaybackTime, activeWordId, subtitleStyleDraft, cropMode
│   │   └── upload.store.ts         # Zustand store: active upload queue, abort controllers, byte progress
│   ├── lib/
│   │   ├── utils.ts                # Timecode formatters (seconds -> MM:SS.ms), file size formatters
│   │   └── constants.ts            # Supported MIME types, subtitle preset definitions
│   └── middleware.ts               # Next.js edge middleware redirecting unauthenticated users
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

### 2.2 Admin Operations Portal (`apps/admin/`)
- **Domain**: Frontend (`Next.js 15`, `TypeScript`)
- **Used By**: Platform administrators and support engineers
- **Responsibility**: View system-wide BullMQ queue health, inspect and retry failed `ProcessingJob` records, manage user credit adjustments, and monitor Gemini/Whisper compute costs.

```text
apps/admin/
├── src/
│   ├── app/
│   │   ├── jobs/page.tsx           # Live queue monitor, failed job inspector, one-click retry
│   │   ├── users/page.tsx          # User lookup, credit grant/refund tool, plan overrides
│   │   └── page.tsx                # System KPIs (daily active jobs, error rates, avg render time)
│   └── services/admin-api.ts
└── package.json
```

---

### 2.3 Backend REST API Server (`apps/api/`)
- **Domain**: Backend (`Node.js`, `Express.js`, `TypeScript`, `Prisma`, `BullMQ Producer`)
- **Used By**: `apps/web`, `apps/admin`, and Payment Gateways (Razorpay/Stripe webhooks)

```text
apps/api/
├── src/
│   ├── config/
│   │   ├── env.ts                  # Zod-validated environment configuration loader
│   │   ├── storage.config.ts       # Cloudflare R2 / S3 client initialization
│   │   ├── redis.config.ts         # ioredis connection singleton for BullMQ and rate-limiting
│   │   └── plans.config.ts         # Configurable subscription tier limits (Free, Starter, Pro, Business)
│   ├── routes/
│   │   ├── index.ts                # Mounts /api/v1/* routers
│   │   ├── auth.routes.ts          # /api/v1/auth/*
│   │   ├── project.routes.ts       # /api/v1/projects/*
│   │   ├── video.routes.ts         # /api/v1/videos/*
│   │   ├── job.routes.ts           # /api/v1/jobs/*
│   │   ├── clip.routes.ts          # /api/v1/clips/*
│   │   ├── export.routes.ts        # /api/v1/exports/*
│   │   └── billing.routes.ts       # /api/v1/billing/* and webhook endpoints
│   ├── controllers/
│   │   ├── auth.controller.ts      # Handles HTTP request/response formatting for auth
│   │   ├── project.controller.ts   # Project CRUD & processing trigger controller
│   │   ├── video.controller.ts     # Multipart upload init/complete & URL ingestion controller
│   │   ├── job.controller.ts       # Job status retrieval and cancellation controller
│   │   ├── clip.controller.ts      # Clip listing, metadata/subtitle updates, regeneration trigger
│   │   ├── export.controller.ts    # High-res export creation and signed download URL generation
│   │   └── billing.controller.ts   # Checkout initiation & Razorpay/Stripe webhook verification
│   ├── services/
│   │   ├── auth.service.ts         # Argon2 hashing, JWT signing, session rotation, email tokens
│   │   ├── project.service.ts      # Project lifecycle and ownership checks
│   │   ├── storage.service.ts      # S3 Presigned PUT/GET URL generation, multipart completion
│   │   ├── url-validator.service.ts# SSRF protection, DNS resolution checks, content-type probing
│   │   ├── credit.service.ts       # Atomic credit HOLD, COMMIT, and REFUND ledger operations
│   │   ├── clip.service.ts         # Clip updates, caption edits, and triggering re-render jobs
│   │   └── payment/
│   │       ├── payment.interface.ts# IPaymentGateway contract
│   │       ├── razorpay.provider.ts# Razorpay orders, subscriptions, and HMAC-SHA256 webhook checks
│   │       └── stripe.provider.ts  # Future-ready Stripe adapter
│   ├── repositories/
│   │   ├── user.repository.ts      # Data access layer for User, Account, Session
│   │   ├── project.repository.ts   # Data access layer for VideoProject, VideoAsset, ProcessingJob
│   │   ├── clip.repository.ts      # Data access layer for Clip, ClipScore, ClipCaption, Export
│   │   └── credit.repository.ts    # Transactional queries for UsageCredit and UsageHistory
│   ├── middlewares/
│   │   ├── auth.middleware.ts      # Verifies Bearer JWT and attaches req.user
│   │   ├── validate.middleware.ts  # Validates req.body / req.query / req.params against Zod schemas
│   │   ├── rate-limit.middleware.ts# Redis-backed sliding window rate limiters per endpoint group
│   │   └── error.middleware.ts     # Centralized error handler returning standardized JSON errors
│   ├── queues/
│   │   ├── queue.names.ts          # Constants for project-analysis-queue & clip-render-queue
│   │   └── job.producer.ts         # Enqueues jobs with tier-based priority and deterministic IDs
│   ├── utils/
│   │   ├── app-error.ts            # Custom AppError class with HTTP status and machine errorCode
│   │   ├── logger.ts               # Pino structured JSON logger
│   │   └── crypto.ts               # Token generation and webhook HMAC verification helpers
│   ├── app.ts                      # Express app setup (CORS, Helmet, routes, error handler)
│   └── server.ts                   # HTTP server entrypoint & graceful shutdown handler
├── tsconfig.json
└── package.json
```

---

### 2.4 Python AI Service (`services/ai-service/`)
- **Domain**: AI / Machine Learning (`Python 3.11+`, `FastAPI`, `faster-whisper`, `pyannote.audio`, `google-genai`, `OpenCV`)
- **Used By**: `services/video-worker` over internal network

```text
services/ai-service/
├── app/
│   ├── api/
│   │   ├── router.py               # Main APIRouter mounting internal endpoints
│   │   ├── deps.py                 # Internal service API key verification (X-Internal-Service-Key)
│   │   └── endpoints/
│   │       ├── health.py           # GET /health (verifies CUDA/CPU availability & model weights)
│   │       ├── transcription.py    # POST /internal/v1/transcribe (Whisper + Pyannote diarization)
│   │       ├── clip_detection.py   # POST /internal/v1/detect-clips (Gemini semantic analysis + scoring)
│   │       └── vision.py           # POST /internal/v1/compute-crop (OpenCV face tracking & scene cuts)
│   ├── core/
│   │   ├── config.py               # Pydantic BaseSettings loading environment variables
│   │   ├── logging.py              # Structured JSON logging with jobId context
│   │   └── exceptions.py           # Custom AI service exception handlers
│   ├── services/
│   │   ├── transcription/
│   │   │   ├── whisper_engine.py   # faster-whisper model singleton, VAD filtering, word timestamps
│   │   │   ├── diarization.py      # pyannote.audio speaker diarization pipeline
│   │   │   └── aligner.py          # Merges Whisper words with Pyannote speaker turns
│   │   ├── semantic_analysis/
│   │   │   ├── chunker.py          # Sliding-window semantic transcript chunker for long videos
│   │   │   ├── gemini_client.py    # Google Gemini API client with retry & token budget tracking
│   │   │   ├── prompts.py          # System instructions and archetype detection prompt templates
│   │   │   ├── clip_detector.py    # Orchestrates Gemini calls across chunks and merges candidates
│   │   │   ├── clip_scorer.py      # Computes and normalizes Hook, Engagement, Context, and Overall scores
│   │   │   └── boundary_optimizer.py# Snaps raw LLM timestamps to exact Whisper word/sentence boundaries & removes IoU overlaps
│   │   └── vision/
│   │       ├── scene_detector.py   # Detects hard camera cuts via histogram/frame diffs
│   │       ├── face_tracker.py     # MediaPipe/OpenCV face bounding box detection & active speaker correlation
│   │       └── crop_smoother.py    # Exponential moving average + deadzone filter for jitter-free 9:16 panning
│   ├── schemas/
│   │   ├── transcript_schema.py    # Pydantic models for Word, Segment, Speaker, DiarizedTranscript
│   │   ├── clip_schema.py          # Pydantic models enforcing Gemini JSON output structure & 0-100 scores
│   │   └── vision_schema.py        # Pydantic models for crop keyframes and thumbnail timestamps
│   └── main.py                     # FastAPI application entrypoint and lifespan model pre-loader
├── tests/                          # Pytest unit and integration suites
├── requirements.txt                # Pinned Python dependencies
├── pyproject.toml                  # Ruff linter, mypy type checker, and pytest config
└── Dockerfile                      # CUDA / CPU multi-stage Docker image
```

---

### 2.5 Video Processing Worker (`services/video-worker/`)
- **Domain**: Media Processing & Rendering (`Node.js`, `TypeScript`, `BullMQ Worker`, `FFmpeg 7`)
- **Used By**: Consumes jobs from Redis queued by `apps/api`

```text
services/video-worker/
├── src/
│   ├── config/
│   │   └── worker.config.ts        # Concurrency, scratch disk path (/tmp/clipforge), FFmpeg binary paths
│   ├── ingestion/
│   │   ├── storage-downloader.ts   # Streams source video from R2/S3 to local scratch disk
│   │   └── url-ingester.ts         # Downloads authorized direct media URLs with byte-limit & SSRF guards
│   ├── ffmpeg/
│   │   ├── ffprobe.ts              # Extracts duration, resolution, FPS, codecs, and audio stream presence
│   │   ├── audio-extractor.ts      # Extracts 16kHz mono PCM WAV for Whisper
│   │   ├── clip-cutter.ts          # Frame-accurate segment cutting with keyframe alignment
│   │   ├── smart-cropper.ts        # Builds FFmpeg crop/scale/pad/boxblur filtergraphs from AI crop keyframes
│   │   ├── subtitle-Generator.ts   # Converts ClipCaption word timestamps + style config into .ass format
│   │   ├── thumbnail-generator.ts  # Extracts high-sharpness JPEG frame for each clip
│   │   └── render-pipeline.ts      # Executes single-pass FFmpeg encode (H.264 + AAC + libass burn-in)
│   ├── clients/
│   │   └── ai-service.client.ts    # Typed HTTP client for calling services/ai-service endpoints
│   ├── processors/
│   │   ├── project-analysis.processor.ts # Executes Steps 1–11 (Probe -> Audio -> STT -> Gemini -> Save Clips)
│   │   ├── clip-render.processor.ts      # Executes Steps 12–15 (Crop calc -> .ass -> FFmpeg -> Upload R2)
│   │   └── cleanup.processor.ts          # Purges expired R2 assets and stale local /tmp directories
│   ├── utils/
│   │   ├── scratch-disk.ts         # Creates and guarantees deletion of /tmp/clipforge/jobs/{jobId}
│   │   └── progress-reporter.ts    # Publishes granular % and stage updates to Redis & PostgreSQL
│   └── index.ts                    # Registers BullMQ workers and handles SIGTERM graceful drain
├── tsconfig.json
└── package.json
```

---

### 2.6 Shared Packages (`packages/`)

| Package Path | Responsibility | Consumers |
| :--- | :--- | :--- |
| **`packages/database/`** | Contains `prisma/schema.prisma`, SQL migrations, seed scripts, and exports the singleton `PrismaClient`. | `apps/api`, `services/video-worker` |
| **`packages/shared-types/`** | Pure TypeScript type definitions: API Request/Response DTOs, Job Stage enums, Clip Category enums, Subtitle Style interfaces, and BullMQ job payload contracts. | `apps/web`, `apps/admin`, `apps/api`, `services/video-worker` |
| **`packages/validation/`** | Shared Zod schemas (`authSchemas`, `projectSchemas`, `clipUpdateSchema`, `subtitleStyleSchema`, `aiClipResponseSchema`). Ensures client forms and API controllers validate with identical rules. | `apps/web`, `apps/api`, `services/video-worker` |
| **`packages/ui/`** | Shared design system built on Tailwind CSS and `shadcn/ui` primitives (`Button`, `Dialog`, `Select`, `Slider`, `Badge`, `Progress`, `Card`). | `apps/web`, `apps/admin` |
| **`packages/config/`** | Base `tsconfig.base.json`, ESLint flat configs, and shared Tailwind theme tokens. | All TypeScript apps and packages |

---

### 2.7 Infrastructure (`infrastructure/`)
- **`infrastructure/docker/Dockerfile.api`**: Multi-stage Node 22 Alpine build for `apps/api`.
- **`infrastructure/docker/Dockerfile.worker`**: Node 22 Debian Bookworm image pre-installed with `ffmpeg 7.x` (with `libass`, `libx264`, `libfreetype` enabled) and custom subtitle fonts in `/usr/share/fonts/truetype/clipforge/`.
- **`infrastructure/docker/Dockerfile.ai`**: Python 3.11 slim/CUDA image with `libsndfile1`, `ffmpeg`, and pre-cached Whisper/Pyannote weights.
- **`infrastructure/nginx/nginx.conf`**: Production reverse proxy configuration with security headers, gzip/brotli compression, and upstream routing.
- **`infrastructure/scripts/`**: Operational bash/ts scripts (`verify-ffmpeg.sh`, `seed-plans.ts`, `setup-r2-cors.ts`).

