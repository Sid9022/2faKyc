# KYC Automation App — Project Context

PAN-based KYC workflow engine for 2Factor SMS/WhatsApp buyers. One KYC case per PAN; buyers complete docs + video declaration via a secure tokenized link; reviewers accept/reject per item; only failed items are resubmitted. **Hardened build: auth/RBAC, encrypted PII, private file serving, webhook+email+reminders, admin console are all implemented (2026-06-11).**

## Key documents (read these first)
- [Plan.md](Plan.md) — analysis + roadmap; the STATUS UPDATE table at the top shows what's done vs remaining
- [DatabaseGuide.md](DatabaseGuide.md) — schema reference, ER diagram, state machines
- [CurrentStage.md](CurrentStage.md) — what works now + run instructions (update at end of each phase)
- [Goal.md](Goal.md) — original product vision

## Running locally
Prereqs: Node 20+, PostgreSQL. `backend/.env` needs `DATABASE_URL`; secrets fall back to dev defaults outside production (see `backend/.env.example`).

```bash
cd backend && npm install && npx prisma migrate deploy && npm run prisma:seed && npm run dev   # :5000
cd frontend && npm install && npm run dev                                                       # :5173
```

- Staff login: `/login` — seeded `admin@2factor.local` / `Admin@12345`
- Buyer flow: `POST /api/dev/dummy-purchase` (dev only) → open `kycLink.buyerKycUrl`; PAN 4th char picks entity (P/C/F)
- Production intake: `POST /api/webhooks/purchase-created` with `x-webhook-signature: hex(hmac-sha256(rawBody, WEBHOOK_SECRET))`
- Tests: `npm test` (unit) • `npm run test:e2e` (full lifecycle, server must be running)
- Docker: `docker compose up --build` at repo root (secrets via root `.env`)

## Architecture map
- `backend/src/config/env.js` — boot-time env validation (crashes prod if secrets missing)
- `backend/src/middleware/` — `auth.middleware.js` (JWT, `requireRole`, query-token variant for media tags), `rateLimit.middleware.js`
- `backend/src/utils/` — `crypto.util.js` (AES-256-GCM field enc, hashes, masks), `fileStorage.util.js` (tmp→final moves, hashing), `fileValidation.util.js` (magic bytes), `settings.util.js`, `request.util.js`
- `backend/src/modules/` — `auth`, `webhook`, `purchase` (dev intake), `kyc` (PAN + intake core), `kyc-link`, `kyc-documents`, `kyc-video`, `kyc-resubmission`, `reviewer`, `admin`, `email` (Node→Dial2Verify), `reminders` (interval scheduler), `auto-checks`, `files` (authed streaming)
- Pattern: `*.routes.js → *.controller.js → *.service.js`; services return `{success, statusCode?, code?, message, ...}` instead of throwing
- `frontend/src/api/kycApi.js` — all API calls + auth storage/refresh + `reviewerMediaUrl`/`buyerMediaUrl`
- Frontend: buyer flow `components/` + `pages/KycStartPage`, staff `pages/LoginPage`, `reviewer/`, `admin/AdminPage`, guard `components/RequireRole.jsx`

## Invariants (do not break)
- Raw PAN and raw link/refresh tokens are NEVER stored — only sha256 hashes + masks; check every JSON/metadata write
- buyerEmail/buyerMobile are encrypted (`enc:v1:` prefix); use `decryptField` to read (passes legacy plaintext through)
- Checklist is SNAPSHOTTED into `kyc_document_submissions` at KYC creation — never resolve a buyer's checklist from `DocumentRequirement` live
- Every state change writes a `KycAuditLog` row inside the same transaction
- File/video versions never deleted; `isCurrent` flags the live one; files are moved into place BEFORE the DB transaction
- Auto-checks and face metadata are ADVISORY — nothing auto-approves
- No `/uploads` static serving; all file access goes through authed/token-scoped streaming endpoints
- `PAN_HASH_SECRET` is permanent once real data exists

## Remaining work (see Plan.md status table)
S3/R2 storage migration • server-side video verification (FFmpeg + transcription) • OCR/LLM extraction (needs API keys) • backups/retention/Sentry • re-KYC policy
