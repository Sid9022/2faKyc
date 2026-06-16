# KYC Automation — Database Guide

> Source of truth: [backend/prisma/schema.prisma](backend/prisma/schema.prisma) (PostgreSQL, Prisma 7).
> §1–3 document what exists today. §4 documents the tables you still need (referenced by [Plan.md](Plan.md) phases).
> For **data flow start→end, normalization/redundancy analysis, volumetrics, and the index optimization plan**, see [DatabaseFlow.md](DatabaseFlow.md).

---

## 1. Entity-relationship overview

`KycMaster` is the hub — one row per PAN, everything else hangs off it.

```txt
                          ┌──────────────────┐
                          │   PurchaseEvent  │  1 purchase = 1 event (idempotency ledger)
                          └────────┬─────────┘
                                   │ linkedKycId (optional)
┌─────────────────┐       ┌───────▼─────────┐        ┌──────────────────┐
│ KycDuplicateLog │ N───1 │    KycMaster    │ 1────N │   KycAuditLog    │
└─────────────────┘       │  (1 per PAN)    │        └──────────────────┘
                          └───────┬─────────┘
        ┌──────────────┬──────────┼─────────────┬───────────────┬─────────────┐
        │ 1:N          │ 1:1      │ 1:N         │ 1:1           │ 1:N         │
┌───────▼──────┐ ┌─────▼─────┐ ┌──▼───────────────────┐ ┌───────▼─────────┐ ┌─▼──────────────┐
│   KycLink    │ │KycConsent │ │KycDocumentSubmission │ │KycVideoDeclar.  │ │ KycFinalReview │
└───────┬──────┘ └───────────┘ └──┬───────────────────┘ └───────┬─────────┘ └────────────────┘
        │ 1:N                     │ 1:N                         │ 1:N
┌───────▼─────────┐        ┌──────▼──────────┐          ┌───────▼─────────┐
│ KycLinkClickLog │        │ KycDocumentFile │          │ KycVideoAttempt │
└─────────────────┘        └─────────────────┘          └─────────────────┘

Config side:                         Plus 1:1: KycMaster ── KycDocumentProgress
┌────────────┐ 1────N ┌─────────────────────┐
│ EntityType │        │ DocumentRequirement │──N:1──> KycDocumentSubmission.requirementId
└────────────┘        └─────────────────────┘
```

Cardinality summary:

| Relation | Type | Enforced by |
|---|---|---|
| KycMaster → panHash | 1 KYC per PAN | `@unique panHash` |
| PurchaseEvent → purchaseId | 1 event per purchase | `@unique purchaseId` |
| KycMaster ↔ KycConsent / KycDocumentProgress / KycVideoDeclaration | 1:1 | `@unique kycId` |
| KycMaster ↔ links, submissions, audit logs, final reviews | 1:N | FK + index |
| (kycId, requirementId) → submission | one submission per doc per KYC | `@@unique([kycId, requirementId])` |
| (entityTypeId, documentKey) → requirement | no duplicate doc keys per entity | `@@unique` |
| KycLink.tokenHash | raw token never stored | `@unique tokenHash` |

---

## 2. Table-by-table reference (current schema)

### 2.1 `kyc_masters` (KycMaster) — the hub
One row per unique PAN. Holds buyer identity, entity classification, and the overall state machine.

| Column | Notes |
|---|---|
| `panHash` | SHA-256(pan + PAN_HASH_SECRET). **Unique** — blind index for one-KYC-per-PAN dedup + exact search. ⚠️ Changing the secret orphans all dedup history. |
| `panMasked` | `ABCP****P` — shown on buyer/public endpoints |
| `panEnc` | AES-256-GCM (`enc:v1:`) reversible ciphertext of the full PAN. Decrypted ONLY in admin/reviewer services so staff can view the full PAN. |
| `buyerEmail`, `buyerMobile` | ⚠️ currently plaintext — encrypt (Plan S5) |
| `amount` | ⚠️ `Float` — migrate to `Decimal(12,2)` |
| `entityChar/Type/Label` | derived from PAN[3]: P→individual, C→company, F→firm_llp |
| `overallStatus` | enum, see state machine §3 |
| `currentStage` | free-text sub-stage (see §3) — consider enum later |

Indexes: `purchaseId`, `entityType`, `overallStatus`.

### 2.2 `purchase_events` (PurchaseEvent) — intake idempotency ledger
One row per `purchaseId` ever received. Records how the webhook was resolved:
`kyc_created` | `duplicate_pan_ignored` | `purchase_id_conflict` | `retry_same_payload` | `retry_same_pan_changed_payload`.
Stores `payloadHash` (detects changed retries), `responseSnapshot` (replayed verbatim on retry), `retryCount`, `conflictCount`.
⚠️ `rawPayload` currently contains the **unmasked PAN** — strip before insert.

### 2.3 `kyc_duplicate_logs` — same-PAN-again attempts, pointing at the original KYC. Compliance/debug trail. Same `rawPayload` PAN warning.

### 2.4 `entity_types` + `document_requirements` — admin-configurable checklist
Requirement fields: `inputMode` (`upload` / `live_photo_front` / `live_photo_front_back` / `upload_or_live_photo` / `live_video`), `isRequired`, `needsFront/Back`, `ocrEnabled`, `sortOrder`, `isActive`. Seeded by `prisma/seed.js`.
⚠️ Checklist is resolved **live** at every request — snapshot into submissions at KYC creation (Plan L5) before building the admin edit UI.

### 2.5 `kyc_links` + `kyc_link_click_logs`
Only `tokenHash` stored (sha256(token + KYC_LINK_SECRET)); raw 48-byte token shown once. One active link per KYC (older ones revoked on regeneration). Click log captures IP/UA per open.

### 2.6 `kyc_consents` — 1:1, immutable once written (second submit is idempotent). Records language, version, the four acceptance booleans, IP/UA.

### 2.7 `kyc_document_submissions` — per-document workflow state
One per (kyc, requirement). Carries denormalized copies of the requirement (`documentKey`, `documentName`, `inputMode`, `isRequired`) — good, this is the start of the snapshot pattern. Tracks `status` (§3), reviewer fields (`reviewerRemarks/By/At`, `acceptedAt`, `rejectedAt`), `resubmissionRequestedAt` + `resubmissionCycle`, and versioning counters (`saveCount`, `currentVersion`).

### 2.8 `kyc_document_files` — versioned file metadata
Files live on disk (`uploads/kyc-documents/<kycId>/<submissionId>/v<N>/`); DB stores `fileSlot` (front/back/document/extra), names, mime, size, `storagePath`, `publicPath`, `version`, `isCurrent`, IP/UA. Old versions preserved for the reviewer.
⚠️ Missing: `fileHash` (sha256) — needed for dedup auto-check + integrity. ⚠️ `publicPath` is an unauthenticated URL today (Plan S2).

### 2.9 `kyc_document_progress` — 1:1 wizard resume state: step index, totals, `isFinalSubmitted` (the edit lock). Reset on resubmission decisions.

### 2.10 `kyc_video_declarations` + `kyc_video_attempts`
Declaration is the 1:1 session: declarant info, language, `scriptText`, `runtimeCode` (plaintext), status, reviewer fields, resubmission tracking, `attemptCount`/`currentAttemptId`, face metadata. Attempts are 1:N uploaded recordings with their own face metadata + IP/UA.
⚠️ `faceCheckPassed`/`faceQualityMetadata`/`durationSeconds` are **client-reported** (Plan S6).

### 2.11 `kyc_audit_logs` — append-only event log
`actorType` (system/buyer/admin/reviewer), `actorId`, `action`, `oldStatus→newStatus`, IP/UA, JSON metadata. Indexed by `kycId`, `action`, `actorType`. ⚠️ `actorId` is spoofable until real auth lands (Plan S1).

### 2.12 `kyc_final_reviews` — one row per final decision (`approved` / `resubmission_required` / `rejected`), so multi-cycle history is preserved.

### 2.13 `test_connections` — ❌ delete before production (with `/api/dev/test-db`).

---

## 3. State machines

### KYC overall (`KycMaster.overallStatus`)
```txt
created ─► link_sent ─► opened ─► in_progress ─► submitted ─► under_review ─┬─► approved   (terminal)
                                      ▲                            │         ├─► rejected   (terminal)
                                      │                            │         └─► resubmission_required
                                      │                            │                      │
                                      └────── buyer fixes items ◄──┴──────────────────────┘
                                              (resubmission_* stages → submitted again)
expired / cancelled : terminal, set by link expiry / ops
```
`currentStage` values in use: `kyc_link_generated`, `kyc_link_opened`, `consent_completed`, `document_upload_in_progress`, `documents_completed`, `video_declaration_started`, `buyer_submission_completed`, `review_in_progress`, `kyc_approved`, `kyc_rejected`, `resubmission_required`, `resubmission_document_upload_in_progress`, `resubmission_video_pending`, `resubmission_video_declaration_started`, `resubmission_submitted`.

### Document submission (`KycDocumentSubmission.status`)
```txt
not_started ─► draft_saved ─► submitted ─► accepted (locked)
     │             ▲              │
     └► skipped    │              └─► resubmission_required ─► draft_saved (new version) ─► submitted …
        (optional) └────────────────────────────┘
rejected: defined in enum, currently only used as a hard-fail terminal
```
⚠️ Known bug: final submit also flips `skipped → submitted` (Plan L4).

### Video declaration (`KycVideoDeclaration.status`)
```txt
session_started ─► submitted ─► accepted (locked)
       ▲               │
       └───────────────┴─► resubmission_required ─► session_started (new code+script) ─► submitted …
(recording_uploaded / quality_flagged / rejected exist in the enum, not yet used)
```

### Link (`KycLink.status`): `active ─► expired` (on open after expiry) or `active ─► revoked` (new link generated).

---

## 4. Tables you still need (with suggested Prisma)

> **✅ Implemented 2026-06-11:** `users`, `refresh_tokens`, `email_logs`, `reminder_states`, `kyc_auto_checks`, `app_settings` plus `fileHash` and snapshot columns (`needsFront/needsBack/ocrEnabled/sortOrder`) on `kyc_document_submissions` are now live in `schema.prisma` (migration `20260611120504_auth_email_reminders_autochecks_settings`). `test_connections` was dropped, `amount` is now `Decimal(12,2)`, and email/mobile are encrypted in place (`enc:v1:` prefix). The only table below that differs from the final implementation: `EmailLog` uses `recipientMasked` instead of `recipientEnc`, and `KycOcrResult` is still future work. The Prisma blocks below are the original proposals, kept for reference.

### 4.1 Users & roles — Phase A (blocks everything)
Simple enum-role is enough; don't over-model a permission matrix yet.
```prisma
enum UserRole { admin  reviewer }
enum UserStatus { active  disabled }

model User {
  id           String     @id @default(uuid())
  email        String     @unique
  passwordHash String
  fullName     String
  role         UserRole
  status       UserStatus @default(active)
  lastLoginAt  DateTime?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  refreshTokens RefreshToken[]
  @@map("users")
}

model RefreshToken {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  tokenHash  String   @unique          // hash only, like KycLink
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime @default(now())
  ipAddress  String?
  userAgent  String?
  @@index([userId])
  @@map("refresh_tokens")
}
```
Then: `KycDocumentSubmission.reviewedBy`, `KycVideoDeclaration.reviewedBy`, `KycFinalReview.reviewedBy`, `KycAuditLog.actorId` should hold real `User.id`s (keep them as `String?` — no FK needed on audit logs, FKs optional elsewhere).

### 4.2 Email + reminders — Phase C
```prisma
enum EmailStatus { queued  sent  failed }

model EmailLog {
  id            String      @id @default(uuid())
  kycId         String?
  emailType     String      // kyc_link_sent | kyc_reminder | resubmission_requested | kyc_approved | kyc_rejected
  recipientHash String      // sha256(email) for lookup without plaintext
  recipientEnc  String      // encrypted address
  subject       String
  status        EmailStatus @default(queued)
  providerResponse Json?
  error         String?
  attemptCount  Int         @default(0)
  sentAt        DateTime?
  createdAt     DateTime    @default(now())
  @@index([kycId]) @@index([emailType]) @@index([status])
  @@map("email_logs")
}

model ReminderState {           // 1:1 with KycMaster
  id             String    @id @default(uuid())
  kycId          String    @unique
  reminderCount  Int       @default(0)
  maxReminders   Int       @default(5)
  lastReminderAt DateTime?
  nextDueAt      DateTime?
  exhausted      Boolean   @default(false)
  @@index([nextDueAt])
  @@map("reminder_states")
}
```
(Per-send history goes in `EmailLog` with `emailType = kyc_reminder` — no separate reminder_logs table needed.)

### 4.3 OCR + auto-checks — Phase E
```prisma
model KycOcrResult {
  id            String   @id @default(uuid())
  fileId        String   @unique   // KycDocumentFile
  kycId         String
  provider      String              // google_vision | tesseract
  rawText       String?
  extractedJson Json?               // {pan_number, name, gstin, dob, ...} — mask Aadhaar before storing
  confidence    Float?
  status        String              // queued | done | failed
  error         String?
  createdAt     DateTime @default(now())
  @@index([kycId])
  @@map("kyc_ocr_results")
}

model KycAutoCheck {
  id        String   @id @default(uuid())
  kycId     String
  checkKey  String              // pan_format | gstin_pan_match | name_fuzzy_match | entity_mismatch | duplicate_file_hash
  passed    Boolean?
  score     Float?
  details   Json?
  createdAt DateTime @default(now())
  @@index([kycId]) @@index([checkKey])
  @@map("kyc_auto_checks")
}
```
Also add to `KycDocumentFile`: `fileHash String?` + `@@index([fileHash])` (Phase B — enables dedup check later).

### 4.4 Settings — Phase D
```prisma
model AppSetting {
  key       String   @id        // reminder_interval_hours, max_reminders, video_script_en, video_script_hi, consent_version ...
  value     Json
  updatedBy String?
  updatedAt DateTime @updatedAt
  @@map("app_settings")
}
```

---

## 5. Schema changes to existing tables (Phase B)

| Table | Change | Why |
|---|---|---|
| `kyc_masters` | `buyerEmail/buyerMobile` → encrypted (`*Enc` columns), `amount Float → Decimal(12,2)` | S5, money correctness |
| `purchase_events`, `kyc_duplicate_logs` | strip raw `pan` from `rawPayload` before insert (mask it) | raw PAN at rest |
| `kyc_document_files` | add `fileHash String` + index | dedup + integrity |
| `kyc_document_files` | stop relying on `publicPath` for access; keep as internal route hint only | S2 |
| `test_connections` | drop table + migration | cleanup |
| optional | revoke active `kyc_links` when KYC hits terminal status | defense in depth |

## 6. Data-privacy rules (enforce in code review)
1. PAN: stored reversibly encrypted (`panEnc`, AES-256-GCM) so admin/reviewer can view the full number, plus `panHash` (blind index) + `panMasked`. The raw PAN must still never appear in `rawPayload`/`metadata` JSON (those store the masked PAN) or on buyer/public endpoints. Decrypt `panEnc` only inside admin/reviewer services.
2. Aadhaar: when OCR lands, mask to last 4 digits before storing `extractedJson`; never store the full number (UIDAI offline e-KYC guidance).
3. Email/mobile: encrypted at rest; `recipientHash` for lookups.
4. Files/videos: private storage, authorized access only, access itself audit-logged.
5. Retention: define purge windows for old file versions, video attempts, click logs (DPDP "limited to necessary" principle) — implement as a cron in Phase G.
