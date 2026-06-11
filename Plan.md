# KYC Automation App — Deep Analysis & Production Roadmap

> Generated from a full code review of `backend/` and `frontend/` on 2026-06-11.
> Companion document: [DatabaseGuide.md](DatabaseGuide.md) (full schema + relations).

---

## ✅ STATUS UPDATE — 2026-06-11 (implementation pass complete)

Phases A–E and most of G were **implemented, tested, and verified** on 2026-06-11:

| Finding / Phase | Status |
|---|---|
| S1 Reviewer auth | ✅ Fixed — JWT login (`/api/auth/*`), bcrypt users table, `requireRole` middleware on all reviewer/admin routes |
| S2 Public file serving | ✅ Fixed — static `/uploads` removed; authed streaming endpoints (`/api/reviewer/files/:id`, token-scoped buyer endpoints); access audit-logged |
| S3 Dev route leak | ✅ Fixed — `/api/dev/*` hard-gated out of production; `TestConnection` + test-db route deleted |
| S4 Secret fallbacks | ✅ Fixed — `config/env.js` validates at boot, crashes in production if missing |
| S5 Plaintext PII | ✅ Fixed — AES-256-GCM for email/mobile (legacy plaintext passthrough); raw PAN stripped from `rawPayload` |
| S6 Client-trusted video | ⚠️ Mitigated — labeled `client_reported` everywhere + advisory auto-check; server-side FFmpeg/transcription remains future work (Phase F) |
| S7 File content validation | ✅ Fixed — magic-byte sniffing + sha256 `fileHash` on every upload |
| S8 Rate limiting | ✅ Fixed — express-rate-limit on public/login/webhook; `trust proxy`; shared request-meta util |
| S9/S10 Error handler, CORS, link revocation, healthz, shutdown | ✅ Fixed — prod-safe errors with request IDs, env-driven CORS, links revoked on terminal decisions, `/healthz`, graceful shutdown |
| L1 RAM uploads | ✅ Fixed — multer diskStorage + async moves; no buffering, no sync writes |
| L2 Intake races | ✅ Fixed — transactional branches + P2002 retry-as-idempotent |
| L3 File/DB ordering | ✅ Fixed — files moved into place before transaction, cleaned up on failure |
| L4 Skipped→submitted | ✅ Fixed — skipped stays skipped; reviewer blocked from reviewing skipped docs |
| L5 Live checklist | ✅ Fixed — checklist snapshotted into submissions at KYC creation (admin edits affect new KYCs only) |
| L6 Video resubmission guard | ✅ Fixed — upload requires `resubmissionRequestedAt` in resubmission mode |
| Phase A (Auth+RBAC) | ✅ Done — incl. refresh-token rotation, login rate limit, frontend login + route guards |
| Phase B (Hardening) | ✅ Done — 13 unit tests green (`npm test`) |
| Phase C (Webhook+Email+Reminders) | ✅ Done — HMAC-signed `/api/webhooks/purchase-created`; **email is pure Node** (native fetch → Dial2Verify HTTP gateway, no PHP service); `EmailLog` + simulated mode; interval reminder scheduler with `ReminderState` |
| Phase D (Admin panel) | ✅ Done — admin APIs + React console (dashboard, document config, users, settings, email logs) |
| Phase E (Auto-checks) | ✅ Done (rule-based) — duplicate file hash, completeness, name similarity, advisory face check; OCR/LLM remains future work (needs API keys) |
| Phase F (Server-side video verification) | ⏳ Not started — needs FFmpeg + transcription keys |
| Phase G (Deployment) | ✅ Scaffolded — Dockerfiles, docker-compose, nginx config; S3/R2 migration remains future work |

**Verification:** `backend\scripts\e2e-smoke.js` walks the full lifecycle (intake → consent → uploads incl. malicious-file rejection → video → reviewer accept → approval → webhook signature checks) — all 31 checks pass. `npm test` runs 13 unit tests — all pass.

**Decision change vs original Goal.md:** the email integration uses the Dial2Verify HTTP endpoint **directly from Node** (`backend/src/modules/email/email.service.js`) instead of a PHP cURL microservice — one less moving part, same provider.

The sections below are the original analysis, kept for reference.

---

## 1. Where the project stands today

The app is a **PAN-based KYC workflow engine** for 2Factor SMS/WhatsApp buyers. The current build (matching `CurrentStage.md`) genuinely covers the full happy-path lifecycle:

| Area | Status | Quality |
|---|---|---|
| Purchase intake + idempotency (`PurchaseEvent`) | ✅ Done | Good design (retry / conflict / duplicate-PAN handling) |
| PAN validation, entity detection, masking, hashing | ✅ Done | Solid |
| One-KYC-per-PAN + duplicate logs | ✅ Done | Solid |
| Secure tokenized KYC link (hash-only storage, expiry, click logs) | ✅ Done | Good |
| Consent capture (versioned, IP/UA logged) | ✅ Done | Good |
| Document wizard (draft/save, versioned files, skip optional) | ✅ Done | Good structure, gaps below |
| Video declaration (runtime code, script, attempts, face metadata) | ✅ Done | Client-trusted (see findings) |
| Reviewer dashboard (per-item accept/resubmission, final decision) | ✅ Done | Logic mostly correct |
| Targeted resubmission (only failed items editable, versions preserved) | ✅ Done | Good |
| Audit logs on every action | ✅ Done | Very good coverage |
| **Authentication / RBAC** | ❌ Missing | **Critical gap** |
| Email (Dial2Verify), reminders, OCR, auto-checks, admin panel | ❌ Missing | Planned phases |
| Cloud storage, signed URLs, rate limiting, deployment | ❌ Missing | Planned phases |

The architecture decisions are genuinely good: token hashes instead of raw tokens, PAN hash + mask, file/video versioning with `isCurrent`, immutable audit trail, item-level review. **The skeleton is production-shaped. The walls (auth, storage security, hardening) are not built yet.**

---

## 2. Critical findings — security & role-based access

These are ordered by severity. Items 1–4 must be fixed before anything goes near the internet.

### 🔴 S1. Reviewer routes are completely unauthenticated
`reviewer.routes.js` has zero middleware. Identity comes from spoofable request headers in `reviewer.controller.js:19-20`:
```js
reviewerId: req.headers["x-reviewer-id"] || "dev-reviewer"
```
**Anyone who can reach the API can approve or reject any KYC**, and the audit log will record whatever name they sent. The frontend even hardcodes `reviewer-001 / Aryan Reviewer` in `kycApi.js`.
**Fix:** `users` table + bcrypt + JWT (short-lived access + refresh) + `requireRole("reviewer")` middleware. This is Phase A in the roadmap below.

### 🔴 S2. Uploaded KYC documents and videos are publicly served
`server.js:35-43` serves `uploads/` via `express.static` with CORP relaxed. Every `publicPath` stored in the DB is a working, permanent, unauthenticated URL to someone's PAN card, Aadhaar, or KYC video. Paths contain UUIDs (hard to guess) but they leak through API responses, browser history, logs, and referrers — and never expire.
**Fix:** remove the static mount. Serve files only via an authenticated endpoint (`GET /api/reviewer/files/:fileId` with role check + audit log), or move to S3/R2 private bucket with short-lived signed URLs. Buyers should only ever see their own current files via their token.

### 🔴 S3. All `/api/dev/*` routes leak everything, unauthenticated
`/api/dev/kyc-records`, `/purchase-events`, `/duplicate-logs`, `/document-submissions`, `/video-declarations`, `/purchase-event-logs` (all audit logs!), plus `POST /api/dev/dummy-purchase` lets anyone create KYC cases.
**Fix:** gate the whole `/api/dev` router behind `NODE_ENV !== "production"` **and** an admin auth check; delete `POST /api/dev/test-db` and the `TestConnection` model.

### 🔴 S4. Secrets silently fall back to hardcoded dev values
`kyc.service.js:6,16` and `kycLink.utils.js:10` default to `"local-dev-secret"`, `"local-dev-pan-secret"`, `"local-dev-kyc-link-secret"`. If an env var is missing in production, the app runs with publicly-known secrets and nobody notices. Also note: changing `PAN_HASH_SECRET` later breaks all duplicate-PAN detection, since lookups go by `panHash`.
**Fix:** add a config module that validates required env vars at boot (zod) and **crashes** if any are missing in production. Document that `PAN_HASH_SECRET` is permanent once set.

### 🟠 S5. PII stored in plaintext
`buyerEmail`, `buyerMobile` are plain columns; `rawPayload` JSON in `PurchaseEvent`/`KycDuplicateLog` contains the **full unmasked PAN** (via `normalizedPurchase.pan`) plus email/mobile. The Goal doc explicitly calls for encrypted email/mobile and never storing raw PAN.
**Fix:** AES-256-GCM field encryption (`ENCRYPTION_KEY`) for email/mobile; strip or mask `pan` from `rawPayload` before persisting (this is the most urgent part — raw PAN is currently in the DB twice).

### 🟠 S6. Client-trusted video verification
`uploadVideoDeclaration` accepts `faceCheckPassed`, `faceQualityMetadata`, and `durationSeconds` straight from the request body (`kycVideo.service.js:391-393`). A buyer can POST `faceCheckPassed=true` with any video file. The runtime code is never verified against the audio (no transcription yet).
**Fix (MVP):** treat all of this as *advisory only* and label it clearly in the reviewer UI ("client-reported"). **Fix (later phase):** server-side FFmpeg probe (real duration, has audio/video streams), server-side face detection sampling, Whisper transcription + runtime-code match.

### 🟠 S7. File content is never validated
`documentUpload.middleware.js` checks only `file.mimetype` — a client-supplied string. A `.exe` renamed with `Content-Type: image/png` passes. There is also no file-hash dedup (Goal called for it) and no malware scanning.
**Fix:** magic-byte sniffing (`file-type` package) after upload; store SHA-256 `fileHash` on `KycDocumentFile` (also enables the "same file uploaded for PAN and GST" auto-check later); optional ClamAV in a later phase.

### 🟠 S8. No rate limiting, no brute-force protection
Public token routes, consent, uploads, and (future) login have no limits. The 48-byte token is unguessable, but endpoints can be hammered to flood `KycLinkClickLog`/`KycAuditLog` and disk.
**Fix:** `express-rate-limit` — strict on `/api/public/*` (e.g. 60/min/IP) and very strict on future `/api/auth/login` (5/min). Set `app.set("trust proxy", 1)` so `x-forwarded-for` is handled by Express instead of being parsed manually (current manual parse in controllers is spoofable).

### 🟡 S9. Error handler leaks internals
`server.js:104` returns `err.message` for any unhandled error (Prisma errors include table/column names). Return a generic message in production; log the real error server-side with a request ID.

### 🟡 S10. Misc hardening
- CORS origin should come from env, not hardcoded `localhost:5173`.
- `runtimeCode` stored plaintext (Goal suggested hash) — low priority since reviewer needs to read it anyway.
- KYC links are not revoked when a case reaches `approved`/`rejected` (blocked logically, but revoke for defense-in-depth).
- No request logging (pino + request IDs), no health endpoint (`/healthz`), no graceful shutdown (`prisma.$disconnect` on SIGTERM).

---

## 3. Logic & workflow bugs found in the current code

### 🔴 L1. Memory: uploads are buffered fully in RAM
Both multer configs use `memoryStorage()` and then `fs.writeFileSync` (synchronous!). An 80 MB video occupies 80 MB of heap per request, and the sync write **blocks the event loop** for every other user while it flushes (`kycVideo.service.js:422`, `kycDocument.service.js:354`). A handful of concurrent video uploads can OOM the process.
**Fix:** switch multer to `diskStorage` writing directly to a temp dir, then `fs.promises.rename` into the final versioned folder (or stream to S3 later). This is the single biggest *runtime* memory-management fix in the app.

### 🔴 L2. Race conditions in purchase intake
`createKycFromPurchase` does `findUnique` → branch → `create` without holding any lock:
- Two concurrent requests with the same **new purchaseId** both pass the check; the second `purchaseEvent.create` throws P2002 → unhandled 500 (caller sees an error even though KYC was created).
- Two concurrent requests with the same **new PAN** but different purchaseIds both pass the `kycMaster.findUnique` → second `kycMaster.create` throws P2002 → 500, and its PurchaseEvent is never written.
- The duplicate-PAN branch (`Rule 2`) writes `KycDuplicateLog`, `PurchaseEvent`, and the audit log as three **separate** non-transactional writes — partial state on failure.
**Fix:** wrap each branch in one transaction, and catch Prisma `P2002` to retry-as-idempotent instead of 500ing. (A webhook provider that retries on 5xx will hammer this exact path.)

### 🟠 L3. File writes happen outside the DB transaction
In `saveDocumentStep`, the transaction marks old files `isCurrent: false` and bumps `currentVersion`, **then** files are written to disk and `KycDocumentFile` rows created after commit (`kycDocument.service.js:679-687`). If the write fails, the submission says "version N, draft_saved" but has zero current files; old files were already demoted. `finalSubmitDocuments` would then pass `hasRequiredFiles` only because status checks happen on the formatted step — actually it would *block* (no current files), stranding the buyer.
**Fix:** write files to disk first (temp), then run the DB transaction (demote old + insert new + bump version), then move/rename. Clean up temp files on failure.

### 🟠 L4. `finalSubmitDocuments` erases the `skipped` status
`updateMany` flips both `draft_saved` **and** `skipped` to `submitted` (`kycDocument.service.js:803-814`). A skipped optional GST cert then appears to the reviewer as a *submitted document with no files*. The reviewer can even mark it `resubmission_required`, forcing the buyer to upload a doc they legitimately skipped.
**Fix:** only transition `draft_saved → submitted`; leave `skipped` as-is, and render skipped items distinctly in the reviewer UI.

### 🟠 L5. Checklist is resolved live, not snapshotted
Submissions are created lazily on first save, and the checklist is re-read from `DocumentRequirement` on every workspace load. When the admin panel arrives, editing a requirement mid-flow will change the checklist under an in-progress buyer (and `@@unique([entityTypeId, documentKey])` rows that get deactivated will orphan progress counts).
**Fix:** at KYC creation, snapshot all active requirements into `KycDocumentSubmission` rows (status `not_started`). Everything downstream (progress totals, resubmission, review) then works off the snapshot. This also removes the duplicated checklist-builder code in `kyc.service.js` and `kycLink.service.js`.

### 🟡 L6. Video resubmission guard is asymmetric
`startVideoDeclaration` blocks restarting an unflagged video in resubmission mode, but `uploadVideoDeclaration` doesn't check `resubmissionRequestedAt`. Sequence: docs-only resubmission, video declaration still `submitted` (never reviewed) → buyer can upload a fresh video that was never requested, resetting `reviewedBy/At`.
**Fix:** in resubmission mode, allow video upload only when `declaration.resubmissionRequestedAt` is set (mirror the document-side guard).

### 🟡 L7. Reviewer can act while buyer is mid-resubmission
`REVIEW_ALLOWED_STATUSES` includes `resubmission_required`, so a reviewer can flag *additional* documents while the buyer is editing, after the buyer already saw the failed-items list. Not corrupting, but confusing; consider blocking item reviews while `currentStage` starts with `resubmission_` until the buyer resubmits.

### 🟡 L8. Smaller issues
- `amount` is `Float` — use `Decimal` for money.
- `getKycCaseDetail` returns **all** audit logs/links/clicks unpaginated; reviewer list endpoint is unpaginated and unfiltered by date — will degrade with volume.
- `updateDocumentProgress` doesn't reject after final submit (cosmetic, but writes audit noise).
- Duplicate `getActiveKycByToken` implementations in document/video services (drift risk — they already differ in checks); extract one shared `kyc-access` helper.
- `console.log` of MIME types in upload middleware; use a real logger.
- No automated tests of any kind — the status-machine logic (the riskiest code) is exactly what unit tests are cheapest for.
- One KYC per PAN **forever**: there's no re-KYC/expiry concept. A repeat purchase years later silently reuses the old approval. Define a business rule (e.g. re-KYC after N months or per-service) before launch.

---

## 4. Roadmap to production

Recommended order — each phase is shippable and de-risks the next. (This refines the Goal.md ordering: auth and storage security move ahead of email/OCR because every later feature depends on them.)

### Phase A — Authentication + RBAC *(do first, ~the current "Phase 5")*
1. Add `User` / `Role` models (see DatabaseGuide.md §4.1) + seed an admin.
2. `POST /api/auth/login` (bcrypt, rate-limited), short-lived JWT access token + refresh token, `auth.middleware.js` with `requireRole("admin" | "reviewer")`.
3. Protect `/api/reviewer/*`; replace header identity with `req.user`; audit logs use real `userId`.
4. Gate `/api/dev/*` behind env check + admin role; delete `TestConnection` + `/api/dev/test-db`.
5. Frontend: login page, token storage (httpOnly cookie preferred), route guards for `/reviewer/*`.

### Phase B — Hardening pass on what already exists
1. Boot-time env validation (fail fast) — kills S4.
2. Private file serving (`GET /api/reviewer/files/:fileId`, `GET /api/public/kyc/:token/files/:fileId` scoped to own KYC) — kills S2. Remove static `/uploads`.
3. Multer → diskStorage; async file ops; file-write-before-transaction ordering — kills L1/L3.
4. Magic-byte validation + `fileHash` column — kills S7.
5. Transactional + P2002-safe purchase intake — kills L2.
6. Fix L4 (skipped docs), L6 (video guard), checklist snapshot (L5).
7. `express-rate-limit`, `trust proxy`, prod-safe error handler, pino logging, `/healthz`, graceful shutdown.
8. Encrypt email/mobile; strip raw PAN from `rawPayload` — kills S5.
9. **Unit tests** for: PAN utils, purchase idempotency matrix (3 rules × races), status transitions, resubmission flows, final-decision gating.

### Phase C — Real intake + Email + Reminders
1. `POST /api/webhooks/purchase-created` with HMAC signature validation (keep `/api/dev/dummy-purchase` for testing only).
2. Email module: `EmailLog` table, Dial2Verify PHP service (or direct HTTP call from Node — evaluate whether the PHP microservice is actually needed), templates for: link sent, reminder, resubmission needed, approved, rejected.
3. Reminder cron: start with plain `node-cron` + a DB-driven loop (BullMQ/Redis can wait until you actually need queues); `ReminderLog` table, configurable max (default 5) and interval; mark `expired` when exhausted.
4. Hook emails into existing transitions (link generated, final decision, resubmission requested).

### Phase D — Admin panel
1. Admin CRUD APIs for `EntityType` and `DocumentRequirement` (changes affect only **new** KYCs thanks to the checklist snapshot from Phase B).
2. Reminder settings + video script templates as `AppSetting` rows.
3. Admin dashboard pages (cases by status, reviewer activity from audit logs).
4. User management (create reviewers, deactivate, reset password).

### Phase E — OCR + logical verification (assist, never auto-approve)
1. `KycOcrResult` + `KycAutoCheck` tables (DatabaseGuide §4.3).
2. On upload: queue OCR (Google Vision → Tesseract fallback), regex extraction (PAN/GSTIN), then rule engine: PAN-format, GSTIN→PAN match, entity mismatch, fuzzy name match, duplicate `fileHash`.
3. LLM cleanup of OCR text only (never raw images), reviewer summary + risk score surfaced in dashboard.

### Phase F — Server-side video verification
1. FFmpeg probe (real duration, stream presence) on upload.
2. Audio extraction → transcription (whisper / gpt-4o-mini-transcribe) → runtime-code spoken check + script similarity.
3. Optional server-side face presence sampling. All results advisory to the reviewer.

### Phase G — Storage & deployment
1. Move uploads to S3/R2 private bucket (storage abstraction layer first: `saveFile/getStream/getSignedUrl`), migrate existing files.
2. Dockerize backend + frontend + Postgres; nginx + TLS; staging/production envs; managed Postgres with backups; Sentry; log aggregation.
3. Data retention policy (purge old attempts/videos after N months per DPDP), backup/restore drill.

### Definition of "production ready" checklist
- [x] No unauthenticated route can read or mutate KYC data (S1–S3)
- [x] App refuses to boot with missing secrets (S4)
- [x] No plaintext PAN/email/mobile at rest (S5)
- [x] Files private + signed/authorized access only (S2)
- [x] Uploads streamed, not RAM-buffered (L1)
- [x] Purchase intake survives concurrent retries (L2)
- [x] Rate limits + health checks + graceful shutdown
- [x] Unit tests green (`npm test`) + E2E smoke (`npm run test:e2e`)
- [x] Real webhook with HMAC signature, Node email notifications, reminder scheduler
- [ ] Backups + retention policy documented and tested (remaining)
- [ ] Cloud object storage (S3/R2) migration (remaining)
- [ ] Server-side video verification — FFmpeg probe + transcription (remaining, Phase F)
- [ ] OCR pipeline (Google Vision/Tesseract) + LLM extraction (remaining, needs API keys)

---

## 5. Memory & context management for development

- **Runtime memory:** the Phase B multer/diskStorage fix is the critical one. Also cap `express.json` (already 1 MB ✓), paginate reviewer/audit queries, and avoid `include`-everything in `getKycCaseDetail` (select only current files by default, lazy-load history).
- **Project context:** a `CLAUDE.md` has been added at the repo root with run commands, architecture map, and conventions so any session (or developer) can resume with full context cheaply. Key facts are also stored in persistent memory. Update `CurrentStage.md` at the end of each phase — it is the single source of truth for "where we are".
