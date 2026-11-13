# REST API Documentation: ClipForge AI

| Document Metadata | Details |
| :--- | :--- |
| **Base URL** | `https://api.clipforge.ai/api/v1` (Local: `http://localhost:4000/api/v1`) |
| **Authentication** | `Authorization: Bearer <accessToken>` (15m TTL) + HTTP-Only Cookie `cf_refresh_token` (7d TTL) |
| **Content-Type** | `application/json` |

---

## 1. Standardized Envelope & Error Format

### 1.1 Success Response Envelope
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_01J9Z8X7W6V5",
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalItems": 42,
      "totalPages": 3
    }
  }
}
```

### 1.2 Standardized Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "This video requires 45 credits, but your available balance is 20 credits.",
    "details": [
      { "field": "projectId", "issue": "Required credits (45) exceed available balance (20)" }
    ],
    "requestId": "req_01J9Z8X7W6V5"
  }
}
```

---

## 2. Authentication Endpoints (`/api/v1/auth`)

### 2.1 `POST /api/v1/auth/register`
- **Auth**: Public
- **Rate Limit**: `5 requests / 15 minutes / IP`
- **Validation**:
  - `email`: valid email, normalized lowercase, max 255 chars
  - `password`: min 8 chars, max 72 chars, at least 1 uppercase, 1 lowercase, 1 number/special char
  - `fullName`: min 2 chars, max 120 chars
- **Request Body**:
```json
{
  "email": "rohan@creator.in",
  "password": "StrongPassword#2026",
  "fullName": "Rohan Sharma"
}
```
- **Response (`201 Created`)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "b7e2a112-45c1-4a8e-9b32-0192837465ab",
      "email": "rohan@creator.in",
      "fullName": "Rohan Sharma",
      "role": "USER",
      "emailVerifiedAt": null
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```
- **Error Responses**: `400 VALIDATION_ERROR`, `409 EMAIL_ALREADY_EXISTS`, `429 RATE_LIMIT_EXCEEDED`

---

### 2.2 `POST /api/v1/auth/login`
- **Auth**: Public
- **Rate Limit**: `10 requests / 15 minutes / IP`
- **Request Body**:
```json
{
  "email": "rohan@creator.in",
  "password": "StrongPassword#2026"
}
```
- **Response (`200 OK`)**: Sets `Set-Cookie: cf_refresh_token=...; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` and returns `user` + `accessToken`.
- **Error Responses**: `401 INVALID_CREDENTIALS`, `403 ACCOUNT_DISABLED`, `429 RATE_LIMIT_EXCEEDED`

---

### 2.3 `POST /api/v1/auth/refresh` *(Added for Session Rotation)*
- **Auth**: Cookie `cf_refresh_token`
- **Rate Limit**: `30 requests / 15 minutes / IP`
- **Description**: Rotates the refresh token in the `Session` table and issues a fresh 15-minute `accessToken`.
- **Response (`200 OK`)**: `{ "success": true, "data": { "accessToken": "eyJ..." } }`
- **Error Responses**: `401 SESSION_EXPIRED_OR_REVOKED`

---

### 2.4 `POST /api/v1/auth/logout`
- **Auth**: Bearer JWT (or `cf_refresh_token` cookie)
- **Rate Limit**: `30 requests / 15 minutes / User`
- **Description**: Marks `Session.revokedAt = NOW()` and clears the `cf_refresh_token` cookie.
- **Response (`200 OK`)**: `{ "success": true, "data": { "loggedOut": true } }`

---

### 2.5 `POST /api/v1/auth/forgot-password`
- **Auth**: Public
- **Rate Limit**: `3 requests / 15 minutes / IP`
- **Request Body**: `{ "email": "rohan@creator.in" }`
- **Response (`200 OK`)**: Always returns `200 OK` (`{ "message": "If that account exists, a reset link has been sent." }`) to prevent user enumeration.

---

### 2.6 `GET /api/v1/auth/me`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `120 requests / minute / User`
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "b7e2a112-45c1-4a8e-9b32-0192837465ab",
      "email": "rohan@creator.in",
      "fullName": "Rohan Sharma",
      "role": "USER",
      "emailVerifiedAt": "2026-11-13T05:30:00Z"
    },
    "subscription": {
      "planTier": "PRO",
      "status": "ACTIVE",
      "currentPeriodEnd": "2026-12-13T05:30:00Z"
    },
    "credits": {
      "totalAllocated": 1000,
      "usedCredits": 120,
      "heldCredits": 45,
      "bonusCredits": 0,
      "availableCredits": 835
    }
  }
}
```

---

## 3. Project Endpoints (`/api/v1/projects`)

### 3.1 `POST /api/v1/projects`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `20 requests / minute / User`
- **Validation**:
  - `title`: string, `1..255` chars
  - `sourceType`: `"FILE_UPLOAD" | "AUTHORIZED_URL"`
  - `rightsAttested`: must be `true` (`z.literal(true)`)
  - `targetAspect`: `"RATIO_9_16" | "RATIO_16_9" | "RATIO_1_1"` (default `"RATIO_9_16"`)
  - `minClipDuration`: integer `10..120` (default `15`)
  - `maxClipDuration`: integer `15..180` (`>= minClipDuration + 10`, default `60`)
  - `maxClipsToGen`: integer `1..50` (bounded by user's `PlanTier` limit)
- **Request Body**:
```json
{
  "title": "Founder Podcast Ep 42 - Scaling SaaS",
  "sourceType": "FILE_UPLOAD",
  "rightsAttested": true,
  "targetAspect": "RATIO_9_16",
  "minClipDuration": 30,
  "maxClipDuration": 60,
  "maxClipsToGen": 12
}
```
- **Response (`201 Created`)**: Returns the created `VideoProject` record (`status: "DRAFT"`).
- **Error Responses**: `400 VALIDATION_ERROR`, `403 RIGHTS_ATTESTATION_REQUIRED`

---

### 3.2 `GET /api/v1/projects`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `60 requests / minute / User`
- **Query Params**: `page` (default `1`), `limit` (default `12`, max `50`), `status` (optional filter), `search` (optional title substring).
- **Response (`200 OK`)**: Paginated list of `VideoProject` objects with clip count, active job progress, and thumbnail URL.

---

### 3.3 `GET /api/v1/projects/:id`
- **Auth**: Bearer JWT Required (Must own project)
- **Rate Limit**: `60 requests / minute / User`
- **Response (`200 OK`)**: Full `VideoProject` details including `assets`, latest `ProcessingJob`, `speakers`, and summary clip counts.
- **Error Responses**: `404 PROJECT_NOT_FOUND`

---

### 3.4 `DELETE /api/v1/projects/:id`
- **Auth**: Bearer JWT Required (Must own project)
- **Rate Limit**: `20 requests / minute / User`
- **Description**: Soft-deletes the project (`deletedAt = NOW()`), cancels any queued jobs, and schedules immediate R2 object deletion for associated `VideoAsset` and `Export` files.
- **Response (`200 OK`)**: `{ "success": true, "data": { "deleted": true } }`

---

## 4. Video Ingestion Endpoints (`/api/v1/videos`)

### 4.1 `POST /api/v1/videos/upload/initiate`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `10 requests / 15 minutes / User`
- **Validation**:
  - `projectId`: UUID (must belong to user and be in `DRAFT` status)
  - `fileName`: string ending in `.mp4`, `.mov`, `.m4v`, or `.webm`
  - `mimeType`: `"video/mp4" | "video/quicktime" | "video/webm" | "video/x-m4v"`
  - `fileSizeBytes`: positive integer `<= tierMaxUploadBytes` (e.g., 500MB Free, 5GB Pro)
- **Request Body**:
```json
{
  "projectId": "7a8b9c0d-1234-5678-9abc-def012345678",
  "fileName": "ep42_raw.mp4",
  "mimeType": "video/mp4",
  "fileSizeBytes": 845219840
}
```
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "assetId": "c1d2e3f4-5678-4321-8765-abcdef123456",
    "uploadId": "ibZBv_75...",
    "partSizeBytes": 20971520,
    "parts": [
      { "partNumber": 1, "presignedUrl": "https://r2.cloudflarestorage.com/..." },
      { "partNumber": 2, "presignedUrl": "https://r2.cloudflarestorage.com/..." }
    ]
  }
}
```
- **Error Responses**: `400 UNSUPPORTED_FILE_FORMAT`, `413 FILE_SIZE_EXCEEDS_TIER_LIMIT`

---

### 4.2 `POST /api/v1/videos/upload/complete`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `20 requests / 15 minutes / User`
- **Request Body**:
```json
{
  "assetId": "c1d2e3f4-5678-4321-8765-abcdef123456",
  "uploadId": "ibZBv_75...",
  "parts": [
    { "partNumber": 1, "etag": "\"a1b2c3d4e5f6...\"" },
    { "partNumber": 2, "etag": "\"f6e5d4c3b2a1...\"" }
  ]
}
```
- **Response (`200 OK`)**: Completes S3/R2 multipart upload, updates `VideoAsset.status = "UPLOADED"` and `VideoProject.status = "UPLOADED"`.

---

### 4.3 `POST /api/v1/videos/url`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `10 requests / 15 minutes / User`
- **Validation**:
  - `projectId`: UUID
  - `sourceUrl`: valid `https://` URL, blocked against private IP ranges (`127.0.0.0/8`, `10.0.0.0/8`, `169.254.169.254`, etc.)
  - `rightsAttested`: `true`
- **Request Body**:
```json
{
  "projectId": "7a8b9c0d-1234-5678-9abc-def012345678",
  "sourceUrl": "https://cdn.example-creator.com/podcasts/ep42.mp4",
  "rightsAttested": true
}
```
- **Response (`200 OK`)**: Validates remote `HEAD` headers (`Content-Type`, `Content-Length`) and updates `VideoProject.sourceUrl`.
- **Error Responses**: `400 UNSUPPORTED_OR_INACCESSIBLE_URL`, `403 SSRF_BLOCKED_HOST`

---

### 4.4 `GET /api/v1/videos/:id`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `60 requests / minute / User`
- **Description**: Returns `VideoAsset` technical metadata (`durationSeconds`, `width`, `height`, `fps`, `videoCodec`) and a 15-minute presigned `GET` streaming URL.

---

## 5. Processing & Job Endpoints (`/api/v1/projects/:id/process` & `/api/v1/jobs`)

### 5.1 `POST /api/v1/projects/:id/process`
- **Auth**: Bearer JWT Required (`emailVerifiedAt` must be non-null)
- **Rate Limit**: `5 requests / 5 minutes / User`
- **Headers**: Optional `Idempotency-Key: <UUID>`
- **Description**: Validates project readiness, checks credit balance, holds estimated credits (`ceil(durationSeconds / 60)`), creates a `ProcessingJob`, and enqueues it in BullMQ `project-analysis-queue`.
- **Response (`202 Accepted`)**:
```json
{
  "success": true,
  "data": {
    "jobId": "99887766-5544-3322-1100-aabbccddeeff",
    "projectId": "7a8b9c0d-1234-5678-9abc-def012345678",
    "status": "QUEUED",
    "stage": "QUEUED",
    "creditsHeld": 45
  }
}
```
- **Error Responses**: `402 INSUFFICIENT_CREDITS`, `403 EMAIL_NOT_VERIFIED`, `409 JOB_ALREADY_RUNNING`

---

### 5.2 `GET /api/v1/jobs/:id`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `120 requests / minute / User` (Designed for 3-second frontend polling)
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "id": "99887766-5544-3322-1100-aabbccddeeff",
    "projectId": "7a8b9c0d-1234-5678-9abc-def012345678",
    "jobType": "FULL_PROJECT_ANALYSIS",
    "status": "RUNNING",
    "stage": "ANALYZING_SEMANTICS",
    "progressPercent": 58,
    "errorCode": null,
    "errorMessage": null,
    "startedAt": "2026-11-13T06:00:05Z",
    "completedAt": null
  }
}
```

---

### 5.3 `POST /api/v1/jobs/:id/cancel`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `10 requests / minute / User`
- **Response (`200 OK`)**: Signals worker cancellation, transitions job to `CANCELLING`/`CANCELLED`, and refunds held credits if cancelled prior to AI clip generation.

---

## 6. Clip & Editor Endpoints (`/api/v1/clips`)

### 6.1 `GET /api/v1/projects/:id/clips`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `60 requests / minute / User`
- **Query Params**:
  - `category`: Optional `ClipCategory` filter
  - `sortBy`: `"overallScore" | "hookScore" | "engagementScore" | "contextScore" | "startTime"` (default `"overallScore"`)
  - `order`: `"asc" | "desc"` (default `"desc"`)
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "clips": [
      {
        "id": "11223344-5566-7788-99aa-bbccddeeff00",
        "rankOrder": 1,
        "title": "Why 90% of Micro-SaaS Founders Fail at Distribution",
        "description": "Rohan breaks down the exact cold-outreach mistake engineering founders make in month one.",
        "category": "EDUCATIONAL",
        "selectionReason": "Opens with a contrarian statistic hook in the first 3.2 seconds and delivers a complete 3-step framework with a clear takeaway conclusion.",
        "startTime": 412.40,
        "endTime": 458.85,
        "duration": 46.45,
        "aspectRatio": "RATIO_9_16",
        "cropMode": "FACE_TRACK",
        "status": "READY",
        "thumbnailUrl": "https://cdn.clipforge.ai/thumbs/11223344.jpg?sig=...",
        "previewVideoUrl": "https://cdn.clipforge.ai/exports/11223344_1080p.mp4?sig=...",
        "score": {
          "hookScore": 94,
          "engagementScore": 89,
          "contextScore": 92,
          "overallScore": 91
        }
      }
    ]
  }
}
```

---

### 6.2 `GET /api/v1/clips/:id`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `60 requests / minute / User`
- **Response (`200 OK`)**: Full clip object including `score`, `caption` (with full word-level `captionsJson` and styling settings), and all `exports`.

---

### 6.3 `PATCH /api/v1/clips/:id`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `30 requests / minute / User`
- **Description**: Updates clip metadata, trim boundaries, aspect ratio, crop mode, or subtitle styling/text without immediately re-rendering (or prior to calling `/regenerate`).
- **Request Body**:
```json
{
  "title": "The #1 Micro-SaaS Distribution Mistake",
  "startTime": 412.10,
  "endTime": 459.20,
  "aspectRatio": "RATIO_9_16",
  "cropMode": "FACE_TRACK",
  "caption": {
    "presetId": "hormozi-bold",
    "fontFamily": "Montserrat",
    "fontSize": 68,
    "primaryColorHex": "#FFFFFF",
    "highlightColorHex": "#22C55E",
    "position": "BOTTOM_SAFE",
    "wordsPerLine": 3,
    "captionsJson": [
      { "id": "w_1", "word": "Ninety", "startRel": 0.0, "endRel": 0.38, "highlight": true },
      { "id": "w_2", "word": "percent", "startRel": 0.38, "endRel": 0.76, "highlight": false }
    ]
  }
}
```
- **Response (`200 OK`)**: Updated `Clip` and `ClipCaption` records.

---

### 6.4 `DELETE /api/v1/clips/:id`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `30 requests / minute / User`
- **Response (`200 OK`)**: Marks `Clip.isDeleted = true` and queues R2 cleanup for its exports.

---

### 6.5 `POST /api/v1/clips/:id/regenerate`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `10 requests / 5 minutes / User`
- **Description**: Enqueues a `SINGLE_CLIP_RENDER` job in `clip-render-queue` using the latest `Clip` boundaries, `aspectRatio`, `cropMode`, and `ClipCaption` styling.
- **Response (`202 Accepted`)**: `{ "success": true, "data": { "jobId": "a1b2c3...", "clipStatus": "RENDERING" } }`

---

## 7. Export & Billing Endpoints

### 7.1 `POST /api/v1/clips/:id/export`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `15 requests / 5 minutes / User`
- **Request Body**: `{ "resolution": "RES_1080P", "aspectRatio": "RATIO_9_16" }`
- **Description**: Enforces plan tier export rules (e.g., Free tier restricted to `RES_720P` with `hasWatermark: true`). If a matching `READY` export already exists for the current clip state, returns it immediately; otherwise queues a render job.

### 7.2 `GET /api/v1/exports/:id`
- **Auth**: Bearer JWT Required
- **Rate Limit**: `60 requests / minute / User`
- **Response (`200 OK`)**: Returns `Export` status and a signed `Content-Disposition: attachment` download URL (`downloadUrl`, valid for 15 minutes).

### 7.3 `POST /api/v1/billing/checkout` & `POST /api/v1/billing/webhooks/razorpay`
- **`POST /api/v1/billing/checkout`**: Authenticated endpoint creating a Razorpay Subscription/Order for `STARTER`, `PRO`, or `BUSINESS` tier.
- **`POST /api/v1/billing/webhooks/razorpay`**: Public webhook endpoint verified using `X-Razorpay-Signature` HMAC-SHA256 validation against raw request body (`express.raw({ type: 'application/json' })`). Atomically updates `Subscription` and grants tier credits in `UsageCredit`.

