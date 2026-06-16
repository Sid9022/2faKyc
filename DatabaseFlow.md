# Database Deep Dive — Data Flow, Normalization, Volumetrics & Optimization

> Companion to [DatabaseGuide.md](DatabaseGuide.md) (schema reference + state machines).
> This doc answers: *how does data flow in from start to end (with logs + edge cases), is the schema normalized / redundant, how big will it get, and what should be optimized.*

---

## 1. The 21 tables, grouped by job

Thinking of the tables in **functional groups** makes the whole thing click:

```txt
┌─ INTAKE & IDENTITY ──────────────┐   ┌─ CONFIG (admin-managed) ─────────┐
│ kyc_masters        (the hub)     │   │ entity_types                     │
│ purchase_events    (idempotency) │   │ document_requirements            │
│ kyc_duplicate_logs (dup PANs)    │   │ app_settings                     │
└──────────────────────────────────┘   └──────────────────────────────────┘

┌─ ACCESS (the buyer link) ────────┐   ┌─ STAFF / AUTH ───────────────────┐
│ kyc_links                        │   │ users                            │
│ kyc_link_click_logs              │   │ refresh_tokens                   │
└──────────────────────────────────┘   └──────────────────────────────────┘

┌─ BUYER SUBMISSION ───────────────────────────────────────────────────────┐
│ kyc_consents            kyc_document_submissions   kyc_document_files      │
│ kyc_document_progress   kyc_video_declarations     kyc_video_attempts      │
└───────────────────────────────────────────────────────────────────────────┘

┌─ REVIEW & DECISIONS ─────────────┐   ┌─ COMMS ──────────────────────────┐
│ kyc_auto_checks (advisory)       │   │ email_logs                       │
│ kyc_final_reviews (history)      │   │ reminder_states                  │
└──────────────────────────────────┘   └──────────────────────────────────┘

┌─ CROSS-CUTTING ──────────────────────────────────────────────────────────┐
│ kyc_audit_logs  — one append-only row for EVERY meaningful action          │
└───────────────────────────────────────────────────────────────────────────┘
```

Mental model: **`kyc_masters` is the spine**; almost everything else hangs off `kycId`. `kyc_audit_logs` is the "black box recorder" written alongside every state change.

---

## 2. Data flow: start → end (every write, every log, every edge case)

Each row below is one user/system action and shows **exactly which tables are touched** and the audit action recorded. `+` = INSERT, `~` = UPDATE.

| # | Action | Tables written | `kyc_audit_logs` action | Edge cases handled |
|---|---|---|---|---|
| 1 | Purchase arrives (`/api/webhooks/purchase-created` or dev) | `+kyc_masters` `+purchase_events` `+kyc_document_submissions`×N (snapshot) `+reminder_states` `+kyc_links` `+email_logs` | `purchase_webhook_received`, `entity_detected_from_pan`, `kyc_link_generated` | **Same purchaseId again** → no new rows, `~purchase_events.retryCount`, replay snapshot (`retry_same_payload`). **Same purchaseId, different PAN** → `~purchase_events.conflictCount`, `409` (`purchase_id_conflict`). **New purchaseId, PAN already exists** → `+kyc_duplicate_logs` `+purchase_events`, ignored (`duplicate_pan_ignored`). **Bad/invalid PAN** → nothing written, `400`. **Concurrent dup** → P2002 caught, replays idempotently. All wrapped in one transaction. |
| 2 | Buyer opens link (`GET /public/kyc/:token`) | `~kyc_links` (clickCount, timestamps) `+kyc_link_click_logs` `~kyc_masters` (→`opened`) | `kyc_link_opened` | **Invalid token** `404`; **revoked** `410`; **expired** → `~kyc_links.status=expired`, `410`. Status only advances `link_sent/created → opened` (won't regress a further-along case). |
| 3 | Consent (`POST …/consent`) | `+kyc_consents` `~kyc_masters` (→`in_progress`) | `kyc_consent_accepted` | **Missing a checkbox** `400` (no write). **Already consented** → idempotent, returns existing (`kyc_consent_already_recorded`). |
| 4 | Save a document step (`POST …/documents/:id/save`) | `~kyc_document_files` (old → `isCurrent:false`) `+kyc_document_files` (new version) `~kyc_document_submissions` `~kyc_document_progress` `~kyc_masters` | `kyc_document_saved` (or skip / no-change variants); `pan_card_validation_rejected` on PAN gate fail | **Fake image** (magic-byte fail) `400`, nothing saved. **PAN doc not a real PAN card** → external validator `400`, **not saved**. **Wrong file slot** / **missing required slot** `400`. **Skip a required doc** `400`. **After final-submit** `409` (locked). Files moved to disk **before** the DB tx; tx failure → orphan files cleaned up. |
| 5 | Final-submit documents (`POST …/final-submit`) | `~kyc_document_submissions` (drafts→`submitted`; skipped stays skipped) `~kyc_document_progress` (`isFinalSubmitted`) `~kyc_masters` | `kyc_documents_final_submitted` | **Required doc missing** `400` with list. **Already submitted** → idempotent. |
| 6 | Start video (`POST …/video/start`) | `+/~kyc_video_declarations` (script + runtime code) `~kyc_masters` | `video_declaration_session_started` | **Before docs final-submit** `403`. **Already accepted** `403`. Restart regenerates a fresh runtime code. |
| 7 | Upload video (`POST …/video/upload`) | `+kyc_video_attempts` `~kyc_video_declarations` (currentAttempt, →`submitted`) `~kyc_masters` (→`submitted`) `+kyc_auto_checks`×~5 (async) | `video_declaration_submitted`, then `auto_checks_completed` | **No session** `400`. **`faceCheckPassed≠true`** `400`. **Non-video bytes** `400`. **Already submitted** (outside resubmission) `409`. File moved before tx; failure → file removed. |
| 8 | Reviewer opens case (`GET /reviewer/kyc-cases/:id`) | `+kyc_audit_logs` per file/video streamed | `file_accessed` | Reads decrypt email/mobile in-memory only. |
| 9 | Reviewer reviews an item (`POST …/documents/:id/review`) | `~kyc_document_submissions` (or `~kyc_video_declarations`) `~kyc_masters` (first review: `submitted→under_review`) | `document_accepted` / `document_resubmission_required` / `video_*`; first: `kyc_review_started` | **Resubmission needs remarks** `400`. **Skipped optional** can't be reviewed `400`. **Case not reviewable** `409`. |
| 10a | Final decision = **approved** (`POST …/final-decision`) | `+kyc_final_reviews` `~kyc_masters` (→`approved`) `~kyc_links` (revoked) `+email_logs` | `kyc_approved` | **Blocked** `400` if any required doc/video not `accepted` (returns `pendingItems`). |
| 10b | Final decision = **resubmission_required** | `+kyc_final_reviews` `~kyc_masters` (→`resubmission_required`) `~kyc_document_progress` (reset to flagged) `+kyc_links` (fresh link) `+email_logs` | `kyc_resubmission_required` | **Blocked** `400` if nothing flagged. |
| 10c | Final decision = **rejected** | `+kyc_final_reviews` `~kyc_masters` (→`rejected`) `~kyc_links` (revoked) `+email_logs` | `kyc_rejected` | Remarks required. |
| 11 | Resubmission cycle | Buyer reopens (fresh link) → repeats steps 4–7 for **only flagged items** → back to `submitted` → reviewer re-reviews (9) → decision (10) | same as above | Only `resubmissionRequestedAt`-flagged items are editable; accepted items locked (`403 DOCUMENT_LOCKED`). |
| ⏰ | Reminder scheduler (every 15 min) | `~reminder_states` `+kyc_links` (fresh) `+email_logs` | `reminder_sent`, eventually `reminder_limit_exhausted` | Stops at `maxReminders`; skips cases that already progressed. |
| 🔐 | Staff login / refresh | `+refresh_tokens` `~users.lastLoginAt` (refresh: `~refresh_tokens.revokedAt` + new) | `login_succeeded` / `login_failed` | Wrong creds / disabled user → `401`, `login_failed`. Refresh rotates (old revoked). |

**The golden rule the code enforces:** every state change writes its `kyc_audit_logs` row **inside the same transaction** as the change — so the audit trail can never drift from reality.

---

## 3. Normalization analysis (1NF / 2NF / 3NF)

### What's already correct
- **1NF** — every column is atomic. JSON columns (`metadata`, `faceQualityMetadata`, `responseSnapshot`, `extractedJson`) are Postgres `jsonb`, used for *sparse / flexible* data we don't join on — that's an accepted, deliberate use, not a 1NF break.
- **2NF** — every table has a surrogate `id` primary key, so there are no partial-key dependencies. The only composite *unique* (`kyc_document_submissions(kycId, requirementId)`) is a constraint, not the PK.
- **3NF (mostly)** — lookups are referenced by FK (`entityTypeId`, `requirementId`, `kycId`, `userId`), not duplicated.

### Intentional denormalization (keep — it's a feature, not a bug)
These are **point-in-time snapshots**, the textbook-correct pattern for data that must stay frozen even when its source changes:

| Table | Copied-in columns | Source | Why it must be a copy |
|---|---|---|---|
| `kyc_document_submissions` | `documentName, inputMode, isRequired, needsFront, needsBack, ocrEnabled, sortOrder` | `document_requirements` | An admin editing a requirement must **not** change a buyer's in-flight checklist. The snapshot is the buyer's contract at creation time. |
| `purchase_events.responseSnapshot`, `kyc_duplicate_logs.rawPayload` | full response/payload JSON | the request | Lets a retried webhook get the **exact** original response replayed; forensic record. |
| `kyc_audit_logs.oldStatus/newStatus/metadata` | values at the moment | various | An audit log must record what was true **then**, not a live join. |

### Accidental / soft redundancy (candidates to clean — see §6)

| # | Where | Redundancy | Recommendation |
|---|---|---|---|
| R1 | `kyc_masters.entityType`, `entityLabel` | Both derive from `entityChar` (and `entityLabel` duplicates `entity_types.label`) — a transitive dependency (`entityChar → entityType → entityLabel`). | **Keep** `entityChar`+`entityType` (cheap, read-hot, stable). Drop reliance on `entityLabel` long-term — derive in the API. Low priority. |
| R2 | `kyc_video_declarations.faceCheckPassed`, `faceQualityMetadata` | Mirror the **current** attempt's values (`currentAttemptId → kyc_video_attempts.*`). | **Keep** (saves a join on the hot reviewer view) but treat the attempt row as the source of truth. Acceptable cache. |
| R3 | `email_logs.recipientMasked` | Derivable from `recipientEnc` (decrypt → mask). | **Keep** — it's the display fallback for legacy rows that predate `recipientEnc`, and avoids decrypting on every list. Acceptable. |
| R4 | `kyc_document_files.publicPath`, `kyc_video_attempts.publicPath` | **Always `null` now** (files are served via `storagePath` through authed endpoints). Pure dead weight. | **Drop the columns** (safe — functionally unused). See §6. |
| R5 | `kyc_document_files.kycId`, `kyc_video_attempts.kycId` | Derivable via `submissionId/declarationId → kycId`. | **Keep** — deliberate denormalization so we can index/query files directly by KYC (auto-checks, case detail). Justified. |
| R6 | `kyc_masters.currentStage` | Free-text string, not constrained. ~18 known values. | **Optional:** promote to an enum for integrity. Low priority, cosmetic. |

**Verdict:** the schema is well-normalized. The only true cruft is **R4 (dead `publicPath` columns)**. Everything else is either justified denormalization or a deliberate snapshot.

---

## 4. Volumetric analysis (how big does this get?)

### Rows written per **one completed KYC** (happy path, no resubmission)

| Table | Rows / KYC | Notes |
|---|---:|---|
| `kyc_masters` | 1 | one per PAN, forever |
| `purchase_events` | 1 | retries update, don't insert |
| `reminder_states` | 1 | |
| `kyc_consents` | 1 | |
| `kyc_document_progress` | 1 | |
| `kyc_video_declarations` | 1 | |
| `kyc_final_reviews` | 1 | +1 per extra decision cycle |
| `kyc_links` | 1 → 1 + reminders + resubmissions | each reminder/resubmission issues a fresh link |
| `kyc_document_submissions` | 2–4 | per entity type (individual 1–2, company/firm 4) |
| `kyc_document_files` | 3–6 | front/back × versions |
| `kyc_video_attempts` | 1–3 | retries add rows |
| `kyc_auto_checks` | ~5 | delete+recreate each run → **stays ~5** |
| `kyc_link_click_logs` | 1–5 | one per link open |
| `email_logs` | 2–7 | link + up to 5 reminders + decision |
| **`kyc_audit_logs`** | **~25–30** | **the dominant table** (every action; +10–15 per resubmission cycle) |

### Projection (mix of completed + abandoned cases)

Assume ~20 audit rows/KYC blended, ~3 click logs, ~5 files:

| Table | @ 10k KYC | @ 100k KYC | @ 1M KYC |
|---|---:|---:|---:|
| `kyc_audit_logs` | ~200k | ~2.0M | ~20M |
| `kyc_document_files` | ~50k | ~500k | ~5M |
| `kyc_link_click_logs` | ~30k | ~300k | ~3M |
| `email_logs` | ~30k | ~300k | ~3M |
| `kyc_masters` | 10k | 100k | 1M |
| everything else | ≤ 1× KYC | | |

**Hot tables (watch these):** `kyc_audit_logs` ≫ `kyc_document_files` ≈ `kyc_link_click_logs` ≈ `email_logs`. Audit logs grow ~20× faster than cases.

### Storage reality check
- **Database:** audit rows carry small JSON (~0.5–1 KB). At 100k KYC ≈ **2M audit rows ≈ 1.5–2.5 GB** + indexes. Totally manageable on managed Postgres.
- **Files (the real volume):** documents ≤10 MB, videos ≤80 MB. At 100k KYC, even at ~15 MB docs + ~10 MB video average ≈ **~2.5 TB on disk**. → This is *the* reason S3/R2 migration + a retention policy matter far more than DB tuning. The DB stays small; the blobs explode.

---

## 5. Index review (query patterns vs what exists)

Indexes earn their keep on reads but **tax every write** — and `kyc_audit_logs` is the most write-heavy table, so its indexes matter most.

| Table | Real query | Before | Verdict |
|---|---|---|---|
| `kyc_audit_logs` | case detail: `where kycId order createdAt desc`; dashboard: `order createdAt desc` | `[kycId]`, `[action]`, `[actorType]` | ❌ `action`/`actorType` **never queried** (write tax); no `createdAt` index for ordering → **fixed in §6** |
| `kyc_masters` | reviewer/admin lists: `order updatedAt desc` | `[purchaseId]`,`[entityType]`,`[overallStatus]` | ⚠️ no `updatedAt` → **added** |
| `email_logs` | admin: `order createdAt desc` | `[kycId]`,`[emailType]`,`[status]` | ⚠️ no `createdAt` → **added** |
| `kyc_document_submissions` | by kyc, by status | `[kycId]`,`[requirementId]`,`[status]`,unique | ✅ good |
| `kyc_links` | token lookup is by **unique** `tokenHash`; scheduler by `expiresAt` | unique + `[kycId]`,`[status]`,`[expiresAt]` | ✅ good |
| `reminder_states` | scheduler: `where exhausted=false, nextDueAt<=now` | `[nextDueAt]`,`[exhausted]` | ✅ good |
| `kyc_document_files` | by submission, by kyc, dup by fileHash | 5 indexes | ✅ good |

---

## 6. Optimization plan

### ✅ Applied now (additive/cleanup index migration — pure win, no data change)
1. `kyc_audit_logs`: **drop** unused `[action]` and `[actorType]`; **replace** `[kycId]` with composite **`[kycId, createdAt]`**; **add `[createdAt]`**. → fewer indexes on the hottest table (less write amplification) *and* the two real queries (case timeline, global dashboard) are now index-served.
2. `kyc_masters`: **add `[updatedAt]`** — serves the reviewer/admin case lists.
3. `email_logs`: **add `[createdAt]`** — serves the admin email-log list.

### 🔜 Recommended next (when you touch the schema again)
4. **Drop dead columns** `kyc_document_files.publicPath` and `kyc_video_attempts.publicPath` (R4) — always null, unused.
5. **Retention / archival** (also a DPDP requirement): the unbounded tables are `kyc_audit_logs` and `kyc_link_click_logs`. Options, easiest → strongest:
   - Scheduled purge of click logs older than N months and audit logs for **terminal** KYCs older than your legal retention window.
   - Postgres **range partitioning** of `kyc_audit_logs` by month once you pass a few million rows (drop old partitions instantly instead of `DELETE`).
6. **Object storage** (S3/R2) for files — the storage util is already isolated (`fileStorage.util.js`), so this is the highest-leverage volumetric win. Keep only metadata + key in the DB.
7. **Old file/video version pruning** — `kyc_document_files`/`kyc_video_attempts` keep every version forever. After approval + retention window, prune non-`isCurrent` versions to reclaim the bulk of blob storage.

### 🧊 Optional / cosmetic
8. Promote `kyc_masters.currentStage` to an enum (R6) for integrity.
9. Derive `entityLabel` in the API instead of storing it (R1).

### Things that are already right (don't change)
- Surrogate PKs everywhere; FK references for lookups; transactional audit; snapshot denormalization; `jsonb` for sparse metadata; hash-only secrets; encrypted PII; `isCurrent` versioning.

---

## 7. One-screen flow summary

```txt
purchase ─► kyc_masters(+) ─► document_submissions(+ snapshot) ─► kyc_links(+) ─► email_logs(+)
   │             │
   │             └─ every step ─────────────────────────────────► kyc_audit_logs(+)  ← the recorder
   ▼
open link ─► consent ─► documents (files versioned, PAN-gated) ─► video (attempts)
   │                                                                   │
   ▼                                                                   ▼
status: link_sent → opened → in_progress → submitted ──► auto_checks(+, advisory)
                                                │
reviewer ─► per-item accept/flag ─► final_reviews(+) ─► approved │ rejected │ resubmission_required
                                                                          │
                                                  (fresh link + email) ◄──┘  loop until approved/rejected
```
