# Technical Requirements Document (TRD): ClipForge AI

| Document Metadata | Details |
| :--- | :--- |
| **Project Name** | ClipForge AI |
| **Document Version** | 1.0.0 |
| **Architecture Pattern** | Modular Polyglot Monorepo (TypeScript Web/API + Python AI Service + Distributed FFmpeg Workers) |

---

## 1. Executive Technical Summary

ClipForge AI separates low-latency user interactions (handled by **Next.js** and a **Node.js/Express TypeScript API**) from compute-intensive media and machine learning workloads (handled by a **Python FastAPI AI Service** and **FFmpeg Video Workers** orchestrated via **Redis + BullMQ**).

This polyglot separation ensures:
1. **The API server never blocks** on CPU/GPU-heavy tasks like audio extraction, speech recognition, LLM inference, or video encoding.
2. **Type safety across the web stack** via shared TypeScript packages (`@clipforge/shared-types`, `@clipforge/validation`) and Prisma ORM.
3. **First-class access to the Python AI/ML ecosystem** (`faster-whisper`, `pyannote.audio`, `opencv-python`, `google-genai`, `pydantic`) without brittle Node-to-Python shell spawning.
4. **Zero-copy media transfers through Cloud Object Storage** (Cloudflare R2 / S3), eliminating API server bandwidth bottlenecks.

---

## 2. Technology Stack & Architectural Justifications

### 2.1 Frontend Layer (`apps/web` & `apps/admin`)
| Technology | Version Target | Responsibility | Architectural Justification |
| :--- | :--- | :--- | :--- |
| **Next.js (App Router)** | 15.x | Core web framework, SSR/RSC for initial dashboard load, client components for interactive clip editor | Provides optimal routing, layouts, middleware-based route protection, and seamless Vercel deployment. |
| **React & TypeScript** | 19.x / 5.x | UI library and static type checking | Prevents runtime errors across complex clip timeline and transcript data structures. |
| **Tailwind CSS + shadcn/ui** | 3.4+ / Latest | Styling and accessible UI primitives (Radix UI) | Full ownership of component source code in `packages/ui`, consistent dark-mode creator aesthetic, zero runtime CSS overhead. |
| **TanStack Query (React Query)** | 5.x | Server state caching, optimistic updates, job progress polling | Eliminates manual `useEffect` fetching; provides built-in polling intervals for active `ProcessingJob` status tracking. |
| **Zustand** | 5.x | Client-only global state (active video playhead, selected word index, subtitle style preview state) | High-frequency playhead updates (`60fps` `timeupdate`) in the clip editor require lightweight, selector-scoped state without full React tree re-renders. |
| **React Hook Form + Zod** | 7.x / 3.x | Form state management and schema validation | Shares identical Zod validation schemas (`@clipforge/validation`) with the Node.js backend API. |
| **Video.js (or Vidstack)** | 8.x | Custom video player for source preview and vertical (`9:16`) clip playback | Reliable cross-browser playback, frame-accurate seeking, and custom HTML/CSS overlay layers for real-time subtitle preview before burning in. |

### 2.2 Backend API Layer (`apps/api`)
| Technology | Version Target | Responsibility | Architectural Justification |
| :--- | :--- | :--- | :--- |
| **Node.js + Express.js** | Node 22 LTS / Express 4.x | REST API server, auth, billing webhooks, presigned URL generation, BullMQ job producer | Battle-tested ecosystem, minimal overhead, clear middleware pipeline for authentication, rate limiting, and error handling. |
| **TypeScript** | 5.x | Strict typing across controllers, services, and repositories | Enforces strict contract adherence between database models, API payloads, and BullMQ job payloads. |
| **Prisma ORM** | 6.x | Database client, declarative schema management, and migrations | Auto-generates strongly typed queries for complex relational graphs (`VideoProject` → `Clip` → `ClipScore` + `ClipCaption`). |
| **JWT (`jose` / `jsonwebtoken`) + Argon2id** | Latest | Short-lived access tokens (`15m`), HTTP-only refresh tokens (`7d`), password hashing | Stateless API verification for speed, combined with database-backed `Session` records for instant revocation on logout/password reset. |
| **Pino** | 9.x | Structured JSON logging with correlation IDs (`x-request-id`, `jobId`) | High-performance asynchronous logging essential for tracing requests across API, Redis queues, and workers. |

### 2.3 Database & Asynchronous Messaging
| Technology | Version Target | Responsibility | Architectural Justification |
| :--- | :--- | :--- | :--- |
| **PostgreSQL** | 16.x | Primary system of record for users, credits, projects, transcripts, clips, and payments | ACID compliance is mandatory for atomic credit reservations/deductions (`UsageCredit`, `UsageHistory`) and relational integrity. |
| **Redis** | 7.x | Backing store for BullMQ job queues, distributed locks, rate limiting, and real-time job progress cache | Sub-millisecond latency required for atomic queue state transitions and rate-limiter sliding windows. |
| **BullMQ** | 5.x | Distributed job queue orchestration, retries, dead-letter handling, and priority queues | Supports priority queuing (Business/Pro users jump ahead of Free users), parent-child job flows, and robust stalled-job recovery. |

### 2.4 AI Processing Service (`services/ai-service`)
| Technology | Version Target | Responsibility | Architectural Justification |
| :--- | :--- | :--- | :--- |
| **Python + FastAPI** | Python 3.11+ / FastAPI 0.115+ | Internal HTTP microservice exposing transcription, diarization, scene analysis, and Gemini clip detection endpoints | Native async HTTP server with automatic Pydantic v2 validation and OpenAPI schema generation. |
| **faster-whisper (CTranslate2)** | 1.x | Speech-to-text transcription with word-level timestamps and VAD (Voice Activity Detection) | Up to 4x faster than standard OpenAI Whisper with 50% lower VRAM/RAM consumption while maintaining identical word-timestamp accuracy. |
| **Google Gemini API (`google-genai`)** | Gemini 2.5 Pro / Flash | Semantic transcript analysis, narrative arc detection, clip boundary proposal, and multi-factor engagement scoring | Industry-leading context window (1M+ tokens) capable of holding an entire 3-hour diarized transcript in a single prompt or large sliding window with Native Structured Outputs (`response_schema`). |
| **pyannote.audio** | 3.x | Speaker diarization (`who spoke when`) | Accurately distinguishes hosts and guests in podcasts/interviews to inform both semantic dialogue analysis and active-speaker cropping. |
| **OpenCV (`opencv-python-headless`) + MediaPipe** | 4.x | Scene boundary detection, face bounding box detection, and active speaker localization | Lightweight, deterministic visual tracking for computing `9:16` crop windows without requiring heavy deep-learning video generation models. |
| **Pydantic v2** | 2.x | Strict validation of Gemini JSON outputs and internal API schemas | Guarantees that LLM outputs strictly match the database schema and score constraints (`0–100`) before persisting. |

### 2.5 Video Processing & Rendering Worker (`services/video-worker`)
| Technology | Version Target | Responsibility | Architectural Justification |
| :--- | :--- | :--- | :--- |
| **Node.js + BullMQ Worker + Python/FFmpeg Subprocesses** | Node 22 LTS + FFmpeg 7.x | Consumes `video-ingestion`, `ai-orchestration`, and `clip-rendering` queues; invokes FFmpeg for audio extraction, cutting, dynamic cropping, `.ass` subtitle burn-in, and thumbnail extraction | Directly integrates with BullMQ (native TypeScript/Node library) while executing deterministic, hardware-accelerated or multi-threaded `ffmpeg` and `ffprobe` binaries on isolated worker nodes. |
| **FFmpeg (`libx264`, `aac`, `libass`)** | 7.x | Media container probing, `16kHz` WAV extraction, frame-accurate segment cutting, aspect ratio scaling/padding, and dynamic subtitle rendering | The industry gold standard for deterministic, high-performance video processing. |

### 2.6 Storage, Payments & Infrastructure
| Technology | Responsibility | Architectural Justification |
| :--- | :--- | :--- |
| **Cloudflare R2 (or AWS S3)** | Object storage for raw source videos, extracted audio WAVs, rendered MP4 clips, and JPG thumbnails | S3-compatible API; Cloudflare R2 charges **zero egress fees**, which is critical when workers download multi-gigabyte raw videos and users stream/download rendered clips. |
| **Razorpay (Primary) + Stripe (Future Adapter)** | Subscription billing, one-time credit packs, UPI/Card payments, webhook lifecycle handling | Razorpay provides native support for Indian payment methods (UPI, RuPay, NetBanking, Indian cards with RBI e-mandate compliance), while a clean `PaymentProvider` interface allows seamless Stripe activation for international expansion. |
| **Vercel** | Hosting for Next.js Frontend (`apps/web`) | Global edge network, automatic preview deployments, zero-config Next.js optimization. |
| **Docker + Cloud VPS / Container Compute (Hetzner / AWS ECS / RunPod)** | Containerized deployment for `apps/api`, `services/ai-service`, and `services/video-worker` | Video encoding and Whisper transcription require dedicated CPU cores, local NVMe scratch disks, and optional GPU acceleration that serverless functions (because of 15-minute timeouts and ephemeral `/tmp` limits) cannot support. |

---

## 3. Distributed Deployment Topology

Services are explicitly designed so they **do not** need to run on a single server:

1. **Edge / Web Tier**: `apps/web` deployed on **Vercel** communicating with `apps/api` over HTTPS (`api.clipforge.ai`).
2. **Control Plane / API Tier**: `apps/api` running in Docker containers on stateless CPU instances behind Nginx / Cloudflare Load Balancer. Connects to **Managed PostgreSQL** (e.g., Supabase, Neon, RDS) and **Managed Redis** (e.g., Upstash, AWS ElastiCache, Redis Cloud).
3. **Media & Compute Plane**:
   - **`services/video-worker`**: Deployed on CPU-optimized compute instances (e.g., 8–16 vCPU, fast NVMe scratch storage at `/tmp/clipforge`) consuming BullMQ jobs from Redis and reading/writing media directly to **Cloudflare R2**.
   - **`services/ai-service`**: Deployed on GPU-enabled (e.g., NVIDIA T4 / L4 for `faster-whisper` + `pyannote`) or high-CPU instances, accessible only over a private VPC network or authenticated internal service token from `video-worker` and `api`.

---

## 4. Technical Design Decisions & Trade-offs

### 4.1 Direct-to-Object-Storage Multipart Uploads
- **Decision**: Video files never pass through the Node.js API server's memory or disk. Instead, `POST /api/v1/videos/upload/initiate` generates S3/R2 Presigned Multipart Upload URLs, and the browser uploads chunks directly to Cloudflare R2.
- **Justification**: Uploading a 5 GB video through the Express server would exhaust RAM/bandwidth and cause gateway timeouts. Presigned multipart uploads allow parallel chunk uploads, pause/resume capability, and infinite horizontal scalability of the API server.

### 4.2 `.ass` (Advanced SubStation Alpha) for Subtitle Burn-in
- **Decision**: Generate `.ass` subtitle files programmatically from word-level timestamps and burn them into the video in a single FFmpeg filtergraph pass (`-vf "crop=...,scale=...,ass=subtitles.ass"`).
- **Justification**: Rendering frame-by-frame HTML overlays via headless Chromium (Puppeteer/Remotion) is 10x–20x slower and consumes massive CPU/RAM. Generating `.ass` files with karaoke/word-level color override tags (`{\c&H00FFFF&}`) and burning them in via `libass` inside FFmpeg runs at 3x–8x real-time speed on standard CPUs.

### 4.3 Payment Gateway Abstraction Pattern
- **Decision**: Implement a unified `IPaymentGateway` interface in `apps/api/src/services/payment/` with `RazorpayProvider` implemented for MVP and `StripeProvider` scaffolded.
- **Justification**: Database tables (`Subscription`, `Payment`) store `provider` (`RAZORPAY` | `STRIPE`), `providerSubscriptionId`, and `providerPaymentId`. This decouples business credit provisioning logic from vendor-specific webhook payloads.

