# KYC Automation — API Endpoint Guide

> Base URL (local): `http://localhost:5000`
> All requests/responses are JSON unless stated otherwise (file uploads are `multipart/form-data`, file downloads are binary streams).
> Companion docs: [DatabaseGuide.md](DatabaseGuide.md) (schema + state machines) • [CurrentStage.md](CurrentStage.md) (run instructions).

---

## Table of contents

1. [Conventions](#1-conventions)
2. [Authentication & token model](#2-authentication--token-model)
3. [Health endpoints](#3-health-endpoints)
4. [Auth API](#4-auth-api) — `/api/auth/*`
5. [Webhook API](#5-webhook-api) — `/api/webhooks/*`
6. [Public buyer API](#6-public-buyer-api) — `/api/public/kyc/:token/*`
7. [Reviewer API](#7-reviewer-api) — `/api/reviewer/*`
8. [Admin API](#8-admin-api) — `/api/admin/*`
9. [Dev API (non-production only)](#9-dev-api-non-production-only) — `/api/dev/*`
10. [Error codes reference](#10-error-codes-reference)
11. [Full lifecycle walkthrough](#11-full-lifecycle-walkthrough)

---

## 1. Conventions

### Response envelope

Every JSON endpoint returns the same envelope:

```jsonc
// success
{ "success": true, "message": "…", /* payload fields */ }

// failure
{ "success": false, "code": "MACHINE_READABLE_CODE", "message": "Human readable reason", /* extras */ }
```

- `code` is stable and machine-readable — branch on it, not on `message`.
- HTTP status mirrors the outcome: `200` ok, `400` validation, `401` auth, `403` forbidden, `404` not found, `409` conflict, `410` gone (expired/revoked link), `429` rate-limited, `500` server error (production returns a `requestId` instead of internals).

### The three "callers"

| Caller | How they authenticate | Routes |
|---|---|---|
| **Buyer** | Secure link token *in the URL path* (`/api/public/kyc/:token/…`). No login. | `/api/public/*` |
| **Staff** (reviewer/admin) | JWT Bearer token from `/api/auth/login` | `/api/reviewer/*`, `/api/admin/*` |
| **Machine** (2Factor purchase system) | HMAC signature header | `/api/webhooks/*` |

### Rate limits (per IP)

| Scope | Limit |
|---|---|
| `/api/public/*` | 120 req/min |
| `/api/auth/login` | 10 req/15 min |
| `/api/webhooks/*` | 120 req/min |

Exceeding a limit returns `429` with `code: "RATE_LIMITED"`.

### IDs and tokens — what's what

- **Link token** — 96-char hex string in the buyer URL. Shown once at creation; only its SHA-256 hash is stored. A KYC has exactly one *active* link; regenerating revokes the old one.
- **kycId / submissionId / declarationId / fileId / attemptId** — UUIDs used by staff routes.
- **PAN** — never stored or returned raw. APIs accept a full PAN only for hashing (intake, search) and return `panMasked` (`ABCP****4F`).

---

## 2. Authentication & token model

Staff auth is JWT-based:

1. `POST /api/auth/login` → returns a short-lived **access token** (default 30 min) and a long-lived **refresh token** (default 7 days).
2. Send the access token on every staff request: `Authorization: Bearer <accessToken>`.
3. When the access token expires (`401 INVALID_TOKEN`), call `POST /api/auth/refresh` with the refresh token. Refresh tokens **rotate**: each refresh revokes the old one and returns a new pair.
4. `POST /api/auth/logout` revokes the refresh token server-side.

**Media-tag exception:** `<img>`/`<video>` tags can't send headers, so the two *streaming GET* routes (`/api/reviewer/files/:fileId`, `/api/reviewer/video-attempts/:attemptId/stream`) also accept the access token as a query parameter: `?access_token=<jwt>`. No other route accepts query-string auth.

**Roles:** `admin` can do everything a `reviewer` can, plus `/api/admin/*`. A `reviewer` calling an admin route gets `403 FORBIDDEN`.

---

## 3. Health endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | none | App name + running status |
| GET | `/healthz` | none | Liveness + DB check. `200 {"success":true,"db":"up"}` or `503` if Postgres is unreachable. Point your uptime monitor here. |

---

## 4. Auth API

### POST `/api/auth/login`
Authenticates a staff user. Rate-limited (10/15 min). Failed and successful attempts are audit-logged.

**Request**
```json
{ "email": "admin@2factor.local", "password": "Admin@12345" }
```

**Response `200`**
```json
{
  "success": true,
  "message": "Login successful.",
  "accessToken": "eyJhbGciOiJIUzI1NiIs…",
  "refreshToken": "f3c9…96-byte-hex…",
  "user": { "id": "uuid", "email": "admin@2factor.local", "fullName": "System Admin", "role": "admin" }
}
```

**Errors:** `401 INVALID_CREDENTIALS` (wrong email/password *or* disabled account — intentionally indistinguishable), `429 RATE_LIMITED`.

```bash
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@2factor.local","password":"Admin@12345"}'
```

### POST `/api/auth/refresh`
Exchanges a refresh token for a fresh access+refresh pair. The old refresh token is revoked (rotation), so store the new one.

**Request** `{ "refreshToken": "<hex>" }`
**Errors:** `400 REFRESH_TOKEN_REQUIRED`, `401 INVALID_REFRESH_TOKEN` (expired, revoked, reused, or user disabled).

### POST `/api/auth/logout`
Revokes the given refresh token. Always returns `200` (idempotent).

**Request** `{ "refreshToken": "<hex>" }`

### GET `/api/auth/me` 🔒 Bearer
Returns the current user — use it to validate a stored session on app start.

```bash
curl -s http://localhost:5000/api/auth/me -H "Authorization: Bearer $TOKEN"
```

---

## 5. Webhook API

### POST `/api/webhooks/purchase-created`
Production intake: 2Factor's purchase system calls this when a buyer purchases SMS/WhatsApp service. Creates the KYC case, snapshots the document checklist, generates the secure link, schedules reminders, and emails the buyer — all in one call.

**Signature (required).** Sign the **raw JSON body** with HMAC-SHA256 using `WEBHOOK_SECRET`, hex-encoded, in the `x-webhook-signature` header:

```js
// Node sender example
const crypto = require("crypto");
const body = JSON.stringify(payload);
const signature = crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");

await fetch("https://kyc.example.com/api/webhooks/purchase-created", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-webhook-signature": signature },
  body                      // send the EXACT string you signed
});
```

> ⚠️ Sign the exact bytes you transmit. Re-serializing the object after signing (key order, whitespace) breaks the signature.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `purchaseId` | string ≥3 | ✅ | Idempotency key — one purchase, one effect, forever |
| `buyerName` | string ≥2 | ✅ | |
| `buyerEmail` | email | ✅ | Stored encrypted |
| `buyerMobile` | string ≥8 | — | Stored encrypted |
| `pan` | string | ✅ | `AAAAA9999A`; 4th char picks entity: P=individual, C=company, F=firm_llp |
| `serviceType` | enum | ✅ | `SMS` \| `WHATSAPP` \| `SMS_WHATSAPP` |
| `amount` | number > 0 | — | |
| `purchasedAt` | string | — | |

**Possible outcomes**

| Case | HTTP | What you get |
|---|---|---|
| New purchaseId + new PAN | 200 | `{success:true, duplicate:false, kyc:{…checklist…}, kycLink:{buyerKycUrl, expiresAt}}` — KYC created, email sent |
| Same purchaseId again (any payload) | 200 | Original response replayed with `idempotent:true` — nothing re-created |
| New purchaseId, PAN already has a KYC | 200 | `{success:true, duplicate:true, existingKyc:{…}, duplicateLog:{…}}` — logged and ignored |
| Same purchaseId with a **different** PAN | 409 | `code:"PURCHASE_ID_CONFLICT"` — rejected |
| Bad/missing signature | 401 | `WEBHOOK_SIGNATURE_REQUIRED` / `WEBHOOK_SIGNATURE_INVALID` |
| Invalid payload | 400 | `INVALID_WEBHOOK_PAYLOAD` + field errors |
| Invalid/unsupported PAN | 400 | `INVALID_OR_UNSUPPORTED_PAN` |

It is **safe to retry on any 5xx** — idempotency is guaranteed by `purchaseId`.

---

## 6. Public buyer API

Everything under `/api/public/kyc/:token/…` where `:token` is the raw link token from the buyer's email. Common failures on **every** route here:

| HTTP | code | Meaning |
|---|---|---|
| 404 | `INVALID_KYC_LINK` | Token unknown |
| 410 | `KYC_LINK_NOT_ACTIVE` | Link revoked (a newer link was issued) |
| 410 | `KYC_LINK_EXPIRED` | Past `expiresAt` |
| 409 | `KYC_ALREADY_FINALIZED` | Case already approved/rejected |
| 403 | `CONSENT_REQUIRED` | Trying to upload before consenting |

### GET `/api/public/kyc/:token`
Opens the link: validates it, increments click count, logs IP/UA, moves a fresh case to `opened`, and returns the buyer-safe summary + checklist (from the snapshot, with live per-item statuses).

```bash
curl -s http://localhost:5000/api/public/kyc/$LINK_TOKEN
```
```jsonc
{
  "success": true,
  "link": { "status": "active", "clickCount": 1, "expiresAt": "…" },
  "kyc": {
    "buyerName": "Demo Pvt Ltd", "panMasked": "ABCC****4P",
    "entityType": "company", "overallStatus": "opened",
    "checklist": [
      { "key": "company_pan", "label": "Company PAN Proof", "inputMode": "upload_or_live_photo", "required": true, "status": "pending" },
      { "key": "live_video_declaration", "label": "Live Video Declaration", "inputMode": "live_video", "required": true, "status": "pending" }
    ]
  }
}
```

### POST `/api/public/kyc/:token/consent`
Records consent (DPDP requirement). All four booleans must be `true`. Immutable — a second call returns the original consent with `idempotent:true`.

```json
{
  "acceptedTerms": true,
  "acceptedPrivacy": true,
  "acceptedDocumentProcessing": true,
  "acceptedVideoRecording": true,
  "language": "en",            // "en" | "hi"
  "consentVersion": "v1"
}
```
**Errors:** `400 CONSENT_REQUIRED` with `missingFields`.

### GET `/api/public/kyc/:token/documents`
Loads the document wizard workspace: `steps[]` (one per checklist item, with status, saved files, reviewer remarks) + `progress` (current step, totals, `isFinalSubmitted` lock). In **resubmission mode** only the flagged items are returned.

Each file in `steps[].currentFiles[]` carries a ready-to-use `fileUrl` (token-scoped, see file streaming below).

### POST `/api/public/kyc/:token/documents/:requirementId/save`
Saves one document step. `multipart/form-data`:

| Field | Type | Notes |
|---|---|---|
| `front` / `back` / `document` / `extra` | file | Which slots are allowed/required depends on the step's `inputMode` (`live_photo_front_back` → front+back; `upload` → document; …) |
| `skipOptional` | `"true"` | Skip an **optional** document instead of uploading |
| `notes` | string | Optional buyer note |

Files: JPG/PNG/WEBP/PDF, ≤10 MB each. **Content is verified by magic bytes** — a renamed `.exe` is rejected with `400 INVALID_FILE_CONTENT`. Re-uploading creates version N+1; old versions are kept for the reviewer.

**PAN-card gate.** If the document is a PAN card (`documentKey` contains `pan` — `pan_card`, `company_pan`, `firm_llp_pan`), the uploaded image is sent to an external recognizer **before it is saved**. A non-PAN / unreadable image is rejected and **not stored**:

| HTTP | code | Meaning |
|---|---|---|
| 400 | `PAN_CARD_INVALID` | Not a recognizable PAN card — `message` tells the buyer to upload a clear photo |
| 400 | `PAN_MISMATCH` | (only when `PAN_MATCH_STRICT=true`) The card's PAN ≠ this KYC's PAN |
| 400 | `PAN_VALIDATION_UNAVAILABLE` | (only when `PAN_VALIDATION_FAIL_OPEN=false`) Validator unreachable; ask the buyer to retry |

On success the extracted PAN (masked) and holder classification are cross-checked against the KYC and surfaced to the reviewer as the `pan_card_validation` auto-check. Controlled by `PAN_VALIDATION_*` env vars (see `.env.example`); set `PAN_VALIDATION_ENABLED=false` to bypass (e.g. for the synthetic e2e smoke test).

```bash
curl -s -X POST \
  http://localhost:5000/api/public/kyc/$LINK_TOKEN/documents/$REQUIREMENT_ID/save \
  -F "document=@/path/to/gst-certificate.pdf"
```

**Errors:** `400 REQUIRED_DOCUMENT_CANNOT_BE_SKIPPED` • `400 INVALID_FILE_SLOT` • `400 DOCUMENT_FILES_REQUIRED` (+`missingSlots`) • `400 INVALID_FILE_CONTENT` • `409 DOCUMENTS_ALREADY_FINAL_SUBMITTED` • resubmission guards: `403 DOCUMENT_LOCKED`, `400 SKIP_NOT_ALLOWED_IN_RESUBMISSION`.

### POST `/api/public/kyc/:token/documents/progress`
Persists the wizard position so the buyer can resume later. `{ "currentStepIndex": 2 }`.

### POST `/api/public/kyc/:token/documents/final-submit`
Locks document editing. Validates every required step has its required file slots; flips drafts to `submitted` (skipped optionals stay `skipped`). Idempotent.
**Errors:** `400 REQUIRED_DOCUMENTS_MISSING` with `missingRequired[]`.

### GET `/api/public/kyc/:token/video`
Video workspace: the declaration (script, runtime code, status) and previous attempts (with `streamUrl`s). Requires documents final-submitted first (`403 DOCUMENTS_REQUIRED`).

### POST `/api/public/kyc/:token/video/start`
Starts (or restarts) a declaration session. Generates a fresh 6-digit **runtime code** and the script the buyer must read.

```json
{ "declarantFullName": "Aryan Sharma", "declarantRole": "Director", "businessName": "Demo Pvt Ltd", "language": "en" }
```
**Response** includes `declaration.scriptText` and `declaration.runtimeCode`.
**Errors:** `400 INVALID_VIDEO_DECLARATION_DETAILS`, `403 VIDEO_ALREADY_ACCEPTED`, `403 VIDEO_NOT_REQUESTED_FOR_RESUBMISSION`.

### POST `/api/public/kyc/:token/video/upload`
Uploads the recording and completes the buyer submission (case → `submitted`, advisory auto-checks run). `multipart/form-data`:

| Field | Notes |
|---|---|
| `video` (file) | WEBM/MP4/MOV, ≤80 MB, content verified by magic bytes |
| `faceCheckPassed` | `"true"` required (browser MediaPipe result — recorded as *client-reported*, advisory only) |
| `faceQualityMetadata` | JSON string of the MediaPipe report |
| `durationSeconds` | number |

**Errors:** `400 VIDEO_FILE_REQUIRED` / `VIDEO_SESSION_REQUIRED` / `FACE_CHECK_NOT_PASSED` / `INVALID_VIDEO_CONTENT`, `409 VIDEO_ALREADY_SUBMITTED`, `403 VIDEO_ALREADY_ACCEPTED` / `VIDEO_NOT_REQUESTED_FOR_RESUBMISSION`.

### GET `/api/public/kyc/:token/resubmission`
The correction workspace after a reviewer requests fixes. Returns `mode`, a `summary`, `acceptedDocuments[]` (locked), `documentsNeedingResubmission[]` (with reviewer remarks), video state, and **`nextAction`** — drive your UI off it: `resubmit_documents` | `resubmit_video` | `waiting_for_review` | `none`.

### File streaming (buyer-scoped)

| Method | Path | Description |
|---|---|---|
| GET | `/api/public/kyc/:token/files/:fileId` | Streams one of the buyer's own document files (inline, correct MIME) |
| GET | `/api/public/kyc/:token/video-attempts/:attemptId/stream` | Streams a video attempt; supports HTTP `Range` (seeking) |

A file belonging to a different KYC returns `404` — the token is the authorization.

---

## 7. Reviewer API

🔒 All routes require `Authorization: Bearer <accessToken>` with role `reviewer` **or** `admin`. Every action is audit-logged with the real user id.

### GET `/api/reviewer/kyc-cases`
Lists reviewable cases (default statuses: submitted, under_review, resubmission_required, approved, rejected).

**Query params**

| Param | Example | Notes |
|---|---|---|
| `status` | `submitted` | Filter to one status |
| `pan` | `ABCPE1234F` | **Exact PAN lookup** — the value is hashed server-side and matched against `panHash` (any status). Invalid PAN format returns `[]`. Raw PANs are never stored. |
| `limit` | `100` | Max 300 |

```bash
curl -s "http://localhost:5000/api/reviewer/kyc-cases?pan=abcpe1234f" -H "Authorization: Bearer $TOKEN"
```

Each case includes `documentSummary` (total/required/acceptedRequired/failed/finalSubmitted), `videoSummary`, consent info, and the decrypted buyer email.

### GET `/api/reviewer/kyc-cases/:kycId`
The full case file: buyer details (decrypted email/mobile), consent, `documents[]` (all versions of all files with `fileUrl`s, reviewer remarks, **`reviewedByName`**), `videoDeclaration` (script, runtime code, attempts with `streamUrl`s, client-reported face metadata), `autoChecks[]` (advisory), `links` + click logs, `auditLogs[]` (latest 100, with **`actorName`**), and `finalReviews[]` history.

### POST `/api/reviewer/documents/:submissionId/review`
Accept or flag one document.

```json
{ "decision": "accepted", "remarks": "Document is clear." }
// or
{ "decision": "resubmission_required", "remarks": "Back side is blurry — please re-upload." }
```
Rules: `remarks` required (≥3 chars) for resubmission; first review moves the case `submitted → under_review`; skipped optional docs cannot be reviewed (`400 DOCUMENT_SKIPPED`).
**Errors:** `400 INVALID_DOCUMENT_REVIEW_DECISION` / `REMARKS_REQUIRED`, `404 DOCUMENT_SUBMISSION_NOT_FOUND`, `409` if case not reviewable.

### POST `/api/reviewer/video/:declarationId/review`
Same contract as document review, for the video declaration.

### POST `/api/reviewer/kyc-cases/:kycId/final-decision`
The only way a case ends.

```json
{ "decision": "approved", "remarks": "All verified." }
```

| decision | Server-enforced precondition | Side effects |
|---|---|---|
| `approved` | **Every required document AND the video are `accepted`** — otherwise `400 REQUIRED_ITEMS_NOT_ACCEPTED` with `pendingItems` | Link revoked, approval email sent |
| `resubmission_required` | At least one item flagged — otherwise `400 NO_FAILED_ITEMS_FOR_RESUBMISSION` | Wizard reset to flagged items, fresh link generated, resubmission email (with item list + remarks) sent |
| `rejected` | remarks required | Link revoked, rejection email sent |

### File streaming (staff)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/reviewer/files/:fileId` | Streams any document file. Accepts `?access_token=<jwt>` for `<img>` tags. Access itself is audit-logged. |
| GET | `/api/reviewer/video-attempts/:attemptId/stream` | Video stream with Range support. Same auth options. |

```html
<img src="http://localhost:5000/api/reviewer/files/FILE_ID?access_token=JWT" />
```

---

## 8. Admin API

🔒 Role `admin` only. (`reviewer` → `403 FORBIDDEN`.)

### GET `/api/admin/dashboard`
Console overview:
```jsonc
{
  "success": true,
  "data": {
    "totals": { "kycs": 21, "newThisWeek": 21 },
    "kycByStatus": { "approved": 3, "submitted": 2, "link_sent": 9, "…": 0 },
    "emails": { "total": 14, "failed": 0 },
    "recentAudit": [
      {
        "action": "kyc_approved", "actorType": "reviewer",
        "actorName": "System Admin",                 // resolved from user id
        "buyerName": "Demo Pvt Ltd", "panMasked": "ABCC****4P",
        "oldStatus": "under_review", "newStatus": "approved",
        "kycId": "uuid", "createdAt": "…"
      }
    ]
  }
}
```

### GET `/api/admin/kyc-cases`
Pipeline oversight — every case (all statuses), with **who reviewed what**:

| Query | Notes |
|---|---|
| `status` | optional filter |
| `limit` | default 200, max 500 |

Per case: buyer (full decrypted email), `progress` (accepted/required docs, flagged count, video status, finalSubmitted), `reviewers[]` (distinct reviewer **names** who touched the case), `lastDecision` (`{decision, remarks, byName, at}`).

### Entity types & document requirements

| Method | Path | Body / notes |
|---|---|---|
| GET | `/api/admin/entity-types` | All entity types with their requirements |
| POST | `/api/admin/entity-types` | Upsert by `key`: `{key, label, panChar?, description?, isActive?}` |
| POST | `/api/admin/document-requirements` | `{entityTypeId, documentKey, documentName, inputMode, isRequired?, needsFront?, needsBack?, ocrEnabled?, sortOrder?, isActive?}` — `409 DUPLICATE_DOCUMENT_KEY` if key exists for that entity |
| PATCH | `/api/admin/document-requirements/:id` | Partial update of the flags above (not `entityTypeId`/`documentKey`) |

> ⚠️ Config changes affect **new KYC cases only** — in-flight cases keep the checklist snapshotted at their creation. An `isActive:false` requirement never enters new checklists, so its `isRequired`/`ocrEnabled` flags are dormant until reactivated.

```bash
curl -s -X PATCH http://localhost:5000/api/admin/document-requirements/$REQ_ID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"isRequired": false}'
```

### Users

| Method | Path | Body / notes |
|---|---|---|
| GET | `/api/admin/users` | List team (no password hashes) |
| POST | `/api/admin/users` | `{email, fullName, role: "admin"\|"reviewer", password}` — password ≥10 chars; `409 EMAIL_TAKEN` on duplicate |
| PATCH | `/api/admin/users/:id` | Any of `{status: "active"\|"disabled", role, password, fullName}`. **Disabling revokes all of the user's sessions.** You cannot disable yourself (`400 CANNOT_DISABLE_SELF`). |

Validation failures return a readable `message`, e.g. `"password: Password must be at least 10 characters"`.

### Settings

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/settings` | Current settings merged over defaults |
| PATCH | `/api/admin/settings` | Allowed keys: `max_reminders`, `reminder_interval_hours`, `consent_version`, `video_script_version`. Unknown keys are ignored. |

### GET `/api/admin/email-logs`
Every email the system sent. Query: `kycId`, `status` (`queued|sent|failed|simulated`), `emailType`, `limit` (≤500).
Each row includes `recipient` — the **full address** (stored encrypted, decrypted for admins; pre-migration rows fall back to the masked form), plus `subject`, `status`, `providerResponse`, `error`, timestamps.

---

## 9. Dev API (non-production only)

These exist **only when `NODE_ENV !== "production"`** — in production every `/api/dev/*` path is hard-gated to 404. They are for local testing and have no auth.

| Method | Path | Description |
|---|---|---|
| POST | `/api/dev/dummy-purchase` | Same payload/behavior as the webhook, **without** the HMAC signature. The fastest way to create a test KYC — the response contains `kycLink.buyerKycUrl`. |
| GET | `/api/dev/kyc-records` | Latest 100 KYC masters (masked) |
| GET | `/api/dev/purchase-events` | Intake ledger (retries/conflicts) |
| GET | `/api/dev/duplicate-logs` | Duplicate-PAN attempts |
| GET | `/api/dev/purchase-event-logs` | Latest 200 audit logs |
| GET | `/api/dev/entity-config` | Entity types + requirements |
| POST | `/api/dev/kyc/:kycId/generate-link` | Issue a fresh buyer link (revokes the old one) |
| GET | `/api/dev/kyc-links` / `/api/dev/kyc-link-clicks` / `/api/dev/kyc-consents` | Link + consent inspection |
| GET | `/api/dev/document-submissions` / `/api/dev/document-progress` | Document state inspection |
| GET | `/api/dev/video-declarations` / `/api/dev/video-attempts` | Video state inspection |

```bash
curl -s -X POST http://localhost:5000/api/dev/dummy-purchase \
  -H "Content-Type: application/json" \
  -d '{
    "purchaseId": "PUR-7001",
    "buyerName": "Demo Private Limited",
    "buyerEmail": "demo@example.com",
    "pan": "ABCCE1234P",
    "serviceType": "WHATSAPP"
  }'
```

---

## 10. Error codes reference

| Code | HTTP | Where | Meaning |
|---|---|---|---|
| `AUTH_REQUIRED` / `INVALID_TOKEN` | 401 | staff routes | Missing / expired-invalid JWT |
| `FORBIDDEN` | 403 | staff routes | Wrong role |
| `INVALID_CREDENTIALS` | 401 | login | Bad email/password or disabled user |
| `INVALID_REFRESH_TOKEN` / `REFRESH_TOKEN_REQUIRED` | 401/400 | refresh | Session ended — re-login |
| `RATE_LIMITED` | 429 | public/login/webhook | Slow down |
| `WEBHOOK_SIGNATURE_REQUIRED` / `WEBHOOK_SIGNATURE_INVALID` | 401 | webhook | HMAC missing/wrong |
| `INVALID_WEBHOOK_PAYLOAD` | 400 | webhook | Zod validation failed (`errors` per field) |
| `INVALID_OR_UNSUPPORTED_PAN` | 400 | intake | Bad format or unsupported 4th char |
| `PURCHASE_ID_CONFLICT` | 409 | intake | Same purchaseId, different PAN |
| `INVALID_KYC_LINK` | 404 | public | Unknown token |
| `KYC_LINK_NOT_ACTIVE` / `KYC_LINK_EXPIRED` | 410 | public | Revoked / expired link |
| `KYC_ALREADY_FINALIZED` | 409 | public | Case closed |
| `CONSENT_REQUIRED` | 400/403 | public | Consent missing/incomplete |
| `DOCUMENTS_ALREADY_FINAL_SUBMITTED` | 409 | documents | Editing locked |
| `REQUIRED_DOCUMENT_CANNOT_BE_SKIPPED` / `SKIP_NOT_ALLOWED_IN_RESUBMISSION` | 400 | documents | Skip rules |
| `INVALID_FILE_SLOT` / `DOCUMENT_FILES_REQUIRED` | 400 | documents | Wrong/missing slots for input mode |
| `INVALID_FILE_CONTENT` / `INVALID_VIDEO_CONTENT` | 400 | uploads | Magic-byte check failed |
| `PAN_CARD_INVALID` | 400 | documents | Uploaded PAN image isn't a recognizable PAN card |
| `PAN_MISMATCH` | 400 | documents | PAN on card ≠ KYC PAN (strict mode only) |
| `PAN_VALIDATION_UNAVAILABLE` | 400 | documents | Recognizer unreachable (fail-closed mode only) |
| `FILE_TOO_LARGE` / `INVALID_FILE_TYPE` | 400 | uploads | Multer limits (10 MB docs / 80 MB video) |
| `DOCUMENT_LOCKED` / `DOCUMENT_NOT_EDITABLE` | 403 | resubmission | Item not flagged for correction |
| `DOCUMENTS_REQUIRED` | 403 | video | Final-submit documents first |
| `VIDEO_SESSION_REQUIRED` / `VIDEO_FILE_REQUIRED` / `FACE_CHECK_NOT_PASSED` | 400 | video | Upload preconditions |
| `VIDEO_ALREADY_SUBMITTED` | 409 | video | Duplicate upload outside resubmission |
| `VIDEO_ALREADY_ACCEPTED` / `VIDEO_NOT_REQUESTED_FOR_RESUBMISSION` | 403 | video | Locked video |
| `INVALID_DOCUMENT_REVIEW_DECISION` / `INVALID_VIDEO_REVIEW_DECISION` / `INVALID_FINAL_DECISION` | 400 | reviewer | Unknown decision value |
| `REMARKS_REQUIRED` | 400 | reviewer | Remarks needed for negative decisions |
| `DOCUMENT_SKIPPED` | 400 | reviewer | Skipped optionals aren't reviewable |
| `REQUIRED_ITEMS_NOT_ACCEPTED` | 400 | final decision | Approval blocked (`pendingItems` lists why) |
| `NO_FAILED_ITEMS_FOR_RESUBMISSION` | 400 | final decision | Nothing flagged |
| `KYC_NOT_FOUND` / `KYC_NOT_REVIEWABLE` | 404/409 | reviewer | Bad id / wrong state |
| `INVALID_USER` / `INVALID_USER_UPDATE` / `EMAIL_TAKEN` / `CANNOT_DISABLE_SELF` / `USER_NOT_FOUND` | 400/409/404 | admin users | User management |
| `INVALID_ENTITY_TYPE` / `INVALID_REQUIREMENT` / `DUPLICATE_DOCUMENT_KEY` / `REQUIREMENT_NOT_FOUND` | 400/409/404 | admin config | Config management |
| `FILE_NOT_FOUND` | 404 | file streaming | Unknown id, wrong owner, or missing on disk |

---

## 11. Full lifecycle walkthrough

A complete happy-path + resubmission cycle using `curl` (dev mode). This is exactly what `backend/scripts/e2e-smoke.js` automates — run `npm run test:e2e` to execute it.

```bash
BASE=http://localhost:5000

# ── 1. Purchase comes in (dev shortcut; production uses the signed webhook) ──
RESP=$(curl -s -X POST $BASE/api/dev/dummy-purchase -H "Content-Type: application/json" -d '{
  "purchaseId":"PUR-9001","buyerName":"Walkthrough Pvt Ltd",
  "buyerEmail":"buyer@example.com","pan":"ABCCW1234K","serviceType":"SMS"}')
LINK=$(echo $RESP | jq -r .kycLink.buyerKycUrl)   # buyer receives this by email
TOKEN=${LINK##*/}                                  # raw link token

# ── 2. Buyer opens the link and consents ──
curl -s $BASE/api/public/kyc/$TOKEN | jq .kyc.overallStatus          # "opened"
curl -s -X POST $BASE/api/public/kyc/$TOKEN/consent -H "Content-Type: application/json" \
  -d '{"acceptedTerms":true,"acceptedPrivacy":true,"acceptedDocumentProcessing":true,"acceptedVideoRecording":true,"language":"en"}'

# ── 3. Buyer uploads each document step, then locks them ──
WS=$(curl -s $BASE/api/public/kyc/$TOKEN/documents)
REQ_ID=$(echo $WS | jq -r '.steps[0].requirementId')
curl -s -X POST $BASE/api/public/kyc/$TOKEN/documents/$REQ_ID/save -F "document=@pan-card.png"
# …repeat per step; skip optionals with -F "skipOptional=true"…
curl -s -X POST $BASE/api/public/kyc/$TOKEN/documents/final-submit

# ── 4. Buyer records the video declaration ──
curl -s -X POST $BASE/api/public/kyc/$TOKEN/video/start -H "Content-Type: application/json" \
  -d '{"declarantFullName":"Aryan Sharma","businessName":"Walkthrough Pvt Ltd","language":"en"}'
curl -s -X POST $BASE/api/public/kyc/$TOKEN/video/upload \
  -F "video=@declaration.webm" -F "faceCheckPassed=true" -F "durationSeconds=14"
# case is now "submitted" — auto-checks ran, reviewer sees it

# ── 5. Reviewer logs in and reviews ──
JWT=$(curl -s -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@2factor.local","password":"Admin@12345"}' | jq -r .accessToken)
AUTH="Authorization: Bearer $JWT"

KYC_ID=$(curl -s "$BASE/api/reviewer/kyc-cases?status=submitted" -H "$AUTH" | jq -r '.cases[0].kycId')
DETAIL=$(curl -s $BASE/api/reviewer/kyc-cases/$KYC_ID -H "$AUTH")

# Flag one document instead of accepting it:
SUB_ID=$(echo $DETAIL | jq -r '.documents[0].id')
curl -s -X POST $BASE/api/reviewer/documents/$SUB_ID/review -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"decision":"resubmission_required","remarks":"Image is blurry, please re-upload."}'
# Accept the rest + the video, then:
curl -s -X POST $BASE/api/reviewer/kyc-cases/$KYC_ID/final-decision -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"decision":"resubmission_required","remarks":"One document needs correction."}'
# → buyer gets a resubmission email with a FRESH link (old token is revoked)

# ── 6. Buyer fixes only the flagged item (new token from the email) ──
curl -s $BASE/api/public/kyc/$NEW_TOKEN/resubmission | jq .nextAction    # "resubmit_documents"
curl -s -X POST $BASE/api/public/kyc/$NEW_TOKEN/documents/$REQ_ID/save -F "document=@pan-card-clear.png"
curl -s -X POST $BASE/api/public/kyc/$NEW_TOKEN/documents/final-submit   # back to "submitted"

# ── 7. Reviewer accepts the fixed item and approves ──
curl -s -X POST $BASE/api/reviewer/documents/$SUB_ID/review -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"decision":"accepted","remarks":"Clear now."}'
curl -s -X POST $BASE/api/reviewer/kyc-cases/$KYC_ID/final-decision -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"decision":"approved","remarks":"All verified."}'
# → status "approved", buyer link revoked, approval email sent ✅
```

### Quick reference card

```txt
Staff:    POST /api/auth/login → Bearer token → /api/reviewer/* , /api/admin/*
Buyer:    email link → /api/public/kyc/:token/{consent → documents → video → resubmission}
Machine:  POST /api/webhooks/purchase-created  (HMAC x-webhook-signature)
Files:    /api/reviewer/files/:id?access_token=JWT   |   /api/public/kyc/:token/files/:id
Health:   GET /healthz
Testing:  POST /api/dev/dummy-purchase (non-production)  •  npm run test:e2e
```
