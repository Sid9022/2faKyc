# Current Stage — updated 2026-06-11

The app is a **secure, full-lifecycle KYC workflow engine**. The original MVP
(purchase intake → buyer portal → video declaration → reviewer dashboard →
targeted resubmission) is complete, and the production-hardening pass from
[Plan.md](Plan.md) Phases A–E has been implemented and verified.

## What works end-to-end (verified by `backend\scripts\e2e-smoke.js` — 31/31 checks)

1. **Purchase intake** — `/api/dev/dummy-purchase` (dev) and HMAC-signed
   `/api/webhooks/purchase-created` (production). Idempotent retries,
   purchaseId conflicts, duplicate-PAN logging — all transactional and
   race-safe (P2002 handled).
2. **One KYC per PAN** — PAN hashed (`PAN_HASH_SECRET`) + masked; raw PAN
   never stored anywhere (sanitized from `rawPayload` too).
3. **Checklist snapshot** — document requirements are copied into
   `kyc_document_submissions` at creation; admin config edits only affect
   new KYCs.
4. **Secure buyer link** — 48-byte token, hash-only storage, expiry, click
   logs, one active link per KYC, revoked on terminal decisions.
5. **Consent** — versioned, immutable, IP/UA logged.
6. **Document wizard** — drafts, versioned files, optional skip, magic-byte
   content validation (fake PNGs rejected), sha256 fileHash, disk-streamed
   uploads (no RAM buffering), files written before DB commit.
6b. **PAN-card validation** — PAN documents (pan_card/company_pan/firm_llp_pan)
    are gated through an external recognizer (Hugging Face) at upload: a
    non-PAN/unreadable image is rejected before it's stored, and the buyer is
    told to upload a clear photo. On success the extracted PAN is cross-checked
    (privacy-preserving, via panHash) against the purchase PAN and surfaced to
    the reviewer as the `pan_card_validation` auto-check. Toggle via
    `PAN_VALIDATION_*` env (live-verified against the recognizer 2026-06-12).
7. **Video declaration** — runtime code + script, MediaPipe face check
   (recorded as `client_reported`/advisory), webm/mp4 content validation,
   attempt history.
8. **Auto-checks (advisory)** — duplicate file hash across documents,
   required completeness, business-name similarity, face-check flag —
   shown in the reviewer overview; never auto-approve.
9. **Reviewer console** — JWT login required; per-item accept/resubmission,
   final decision gated on all-required-accepted; emails sent on decisions.
   **PAN search**: typing a full PAN in the case-list search box does an
   exact server-side lookup (`?pan=` → hashed → matched against `panHash`,
   any status) — raw PANs are still never stored or listed.
10. **Targeted resubmission** — only flagged items editable; unflagged video
    cannot be replaced; accepted items locked; versions preserved.
11. **Emails (Node, no PHP)** — Dial2Verify HTTP gateway called with native
    fetch; `email_logs` table; `EMAIL_ENABLED=false` simulates in dev.
    Types: link sent, reminder, resubmission requested, approved, rejected.
    **Live-verified 2026-06-11**: `EMAIL_ENABLED=true` is set in
    `backend/.env` and a real KYC-link email was accepted by the gateway
    (provider returned queue id + pending status).
12. **Reminder scheduler** — interval-based, settings-driven (max count +
    cadence), regenerates fresh links, marks exhausted + audit-logs
    escalation.
13. **Admin console** (`/admin`) — dashboard stats, document requirement
    config, user management (create/disable, sessions revoked on disable),
    reminder settings, email logs.
14. **Security layer** — JWT access+refresh (rotation), bcrypt, role
    middleware, rate limits (public/login/webhook), authenticated file
    streaming with audit logs, AES-256-GCM encrypted email/mobile, env
    validation that refuses to boot production without secrets, prod-safe
    error handler, `/healthz`, graceful shutdown.

## How to run

```bash
# Backend
cd backend
npm install
npx prisma migrate deploy
npm run prisma:seed     # entity types + admin user + settings
npm run dev             # http://localhost:5000

# Frontend
cd frontend
npm install
npm run dev             # http://localhost:5173
```

- Staff login: `http://localhost:5173/login` — seeded admin
  `admin@2factor.local` / `Admin@12345` (override via `SEED_ADMIN_EMAIL` /
  `SEED_ADMIN_PASSWORD`; **change after first login**).
- Buyer flow: POST `/api/dev/dummy-purchase` → open `kycLink.buyerKycUrl`.
- Tests: `npm test` (13 unit tests) and `npm run test:e2e` (server must be
  running).
- Docker: `docker compose up --build` (requires secrets in a root `.env`).

## What remains before/after go-live

1. **Cloud storage** — move `backend/uploads` to S3/R2 private bucket
   (storage util is already isolated in `src/utils/fileStorage.util.js`).
2. **Server-side video verification (Phase F)** — FFmpeg probe, audio
   transcription, runtime-code spoken check; current face check is
   client-reported and advisory.
3. **OCR + LLM extraction (Phase E full)** — needs Google Vision / OpenAI
   keys; `ocrEnabled` flags and auto-check plumbing already exist.
4. **Ops** — TLS reverse proxy, managed Postgres backups, Sentry, log
   aggregation, data-retention purge job, re-KYC policy decision.
5. ~~Email go-live~~ — done; gateway verified working from this machine.
   Re-confirm from the production host when deploying.
