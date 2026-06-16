# ChatGPT prompt — generate the optimized KYC database structure

Copy everything inside the code block below into ChatGPT.

````text
You are a senior database architect. I will give you the exact, already-optimized
and normalized schema of a PAN-based KYC automation platform (PostgreSQL). Your job
is NOT to redesign it — it is to render it clearly so I can understand it.

Produce, in this order:
1. A **DBML schema** (dbdiagram.io compatible) with every table, column, type,
   primary key, foreign key, unique constraint, and index exactly as specified.
2. A **Mermaid `erDiagram`** showing all tables and their relationships with correct
   cardinality (1–1, 1–N).
3. A **plain-English explanation** of each relationship (one line each) and the
   overall data flow in 5–6 sentences.
4. A short **normalization note**: confirm the design is in 3NF, and explicitly
   list the deliberate "snapshot" denormalizations (see notes) — do NOT try to
   normalize those away; they are intentional and correct.

Rules:
- Use the table names, columns, keys, and indexes EXACTLY as given. Do not invent,
  rename, merge, or drop anything.
- Every table has a surrogate primary key `id` of type uuid unless stated otherwise.
- Mark foreign keys clearly and point them at the right parent table.
- Columns annotated "(encrypted)" or "(hash)" or "(masked)" are privacy-handled —
  represent them as normal columns and add a comment; do NOT create extra tables.
- Columns annotated "(snapshot)" are intentional point-in-time copies — keep them
  and note WHY in the normalization section.
- jsonb columns hold sparse/flexible data and are not joined on.

============================================================
ENUMS
============================================================
UserRole:              admin | reviewer
UserStatus:            active | disabled
EmailStatus:           queued | sent | failed | simulated
KycOverallStatus:      created | link_sent | opened | in_progress | submitted |
                       under_review | resubmission_required | approved | rejected |
                       expired | cancelled
PurchaseEventStatus:   kyc_created | duplicate_pan_ignored | purchase_id_conflict |
                       retry_same_payload | retry_same_pan_changed_payload
KycLinkStatus:         active | expired | revoked
RequirementInputMode:  upload | live_photo_front | live_photo_front_back |
                       upload_or_live_photo | live_video
KycDocumentStatus:     not_started | draft_saved | skipped | submitted |
                       under_review | accepted | rejected | resubmission_required
KycFileSlot:           front | back | document | extra
KycVideoStatus:        session_started | recording_uploaded | submitted |
                       quality_flagged | accepted | rejected | resubmission_required
KycVideoAttemptStatus: uploaded | submitted | discarded
KycFinalDecision:      approved | resubmission_required | rejected
ActorType:             system | buyer | admin | reviewer

============================================================
TABLES  (PK = primary key, FK = foreign key, U = unique, * = indexed)
============================================================

# ---- STAFF / AUTH ----

users
- id              PK uuid
- email           varchar  U
- passwordHash    varchar
- fullName        varchar
- role            UserRole *
- status          UserStatus  default active
- lastLoginAt     timestamp NULL
- createdAt       timestamp
- updatedAt       timestamp

refresh_tokens
- id          PK uuid
- userId      FK -> users.id   *
- tokenHash   varchar  U                 (hash)
- expiresAt   timestamp
- revokedAt   timestamp NULL
- ipAddress   varchar NULL
- userAgent   varchar NULL
- createdAt   timestamp

# ---- CONFIG (admin-managed) ----

entity_types
- id           PK uuid
- key          varchar U          (individual | company | firm_llp)
- label        varchar
- panChar      varchar(1) NULL    (P | C | F)
- description  varchar NULL
- isActive     boolean default true
- createdAt    timestamp
- updatedAt    timestamp

document_requirements
- id           PK uuid
- entityTypeId FK -> entity_types.id
- documentKey  varchar  *
- documentName varchar
- inputMode    RequirementInputMode
- isRequired   boolean default true
- needsFront   boolean default false
- needsBack    boolean default false
- ocrEnabled   boolean default false
- sortOrder    int default 0
- isActive     boolean default true
- createdAt    timestamp
- updatedAt    timestamp
- UNIQUE (entityTypeId, documentKey)

app_settings
- key        PK varchar           (e.g. max_reminders, reminder_interval_hours)
- value      jsonb
- updatedBy  uuid NULL
- updatedAt  timestamp

# ---- INTAKE & IDENTITY (the hub) ----

kyc_masters
- id            PK uuid
- purchaseId    varchar  *
- buyerName     varchar
- buyerEmail    varchar             (encrypted)
- buyerMobile   varchar NULL        (encrypted)
- serviceType   varchar
- amount        decimal(12,2) NULL
- panHash       varchar U           (deterministic blind index: dedup + search)
- panMasked     varchar             (e.g. ABCP****4F; shown on public endpoints)
- panEnc        varchar NULL        (encrypted; reversible full PAN for admin/reviewer)
- entityChar    varchar(1)          (P | C | F, from PAN 4th char)
- entityType    varchar  *          (logical ref to entity_types.key)
- overallStatus KycOverallStatus *
- currentStage  varchar NULL
- createdAt     timestamp
- updatedAt     timestamp  *
NOTE: entityLabel is intentionally NOT stored (derive from entity_types.label) to
avoid redundancy.

purchase_events                      (idempotency ledger: one row per purchaseId)
- id               PK uuid
- purchaseId       varchar U
- panHash          varchar *         (hash)
- panMasked        varchar
- payloadHash      varchar
- status           PurchaseEventStatus *
- linkedKycId      FK -> kyc_masters.id  NULL
- responseSnapshot jsonb NULL         (snapshot - replayed on idempotent retry)
- rawPayload       jsonb NULL         (snapshot - PAN masked before storing)
- retryCount       int default 0
- lastRetryType    varchar NULL
- lastRetriedAt    timestamp NULL
- conflictCount    int default 0
- lastConflictAt   timestamp NULL
- createdAt        timestamp
- updatedAt        timestamp

kyc_duplicate_logs                   (a 2nd purchase reusing an existing PAN)
- id            PK uuid
- purchaseId    varchar *
- panHash       varchar *            (hash)
- panMasked     varchar
- originalKycId FK -> kyc_masters.id
- reason        varchar
- rawPayload    jsonb NULL           (snapshot - PAN masked)
- createdAt     timestamp

# ---- ACCESS (the buyer link) ----

kyc_links
- id             PK uuid
- kycId          FK -> kyc_masters.id  *
- tokenHash      varchar U            (hash; raw token never stored)
- status         KycLinkStatus *  default active
- expiresAt      timestamp *
- clickCount     int default 0
- firstClickedAt timestamp NULL
- lastClickedAt  timestamp NULL
- createdAt      timestamp
- updatedAt      timestamp

kyc_link_click_logs
- id         PK uuid
- kycLinkId  FK -> kyc_links.id  *
- ipAddress  varchar NULL
- userAgent  varchar NULL
- metadata   jsonb NULL
- clickedAt  timestamp

# ---- BUYER SUBMISSION ----

kyc_consents                         (1:1 with kyc_masters)
- id                         PK uuid
- kycId                      FK -> kyc_masters.id  U
- language                   varchar *  default en
- consentVersion             varchar
- acceptedTerms              boolean
- acceptedPrivacy            boolean
- acceptedDocumentProcessing boolean
- acceptedVideoRecording     boolean
- ipAddress                  varchar NULL
- userAgent                  varchar NULL
- metadata                   jsonb NULL
- acceptedAt                 timestamp
- createdAt                  timestamp
- updatedAt                  timestamp

kyc_document_submissions             (one per checklist item per KYC)
- id                      PK uuid
- kycId                   FK -> kyc_masters.id  *
- requirementId           FK -> document_requirements.id  *
- documentKey             varchar          (snapshot)
- documentName            varchar          (snapshot)
- inputMode               RequirementInputMode (snapshot)
- isRequired              boolean          (snapshot)
- needsFront              boolean          (snapshot)
- needsBack               boolean          (snapshot)
- ocrEnabled              boolean          (snapshot)
- sortOrder               int              (snapshot)
- status                  KycDocumentStatus * default not_started
- notes                   varchar NULL
- reviewerRemarks         varchar NULL
- reviewedBy              FK -> users.id NULL
- reviewedAt              timestamp NULL
- resubmissionRequestedAt timestamp NULL
- resubmissionCycle       int default 0
- saveCount               int default 0
- currentVersion          int default 0
- lastSavedAt             timestamp NULL
- submittedAt             timestamp NULL
- acceptedAt              timestamp NULL
- rejectedAt              timestamp NULL
- createdAt               timestamp
- updatedAt               timestamp
- UNIQUE (kycId, requirementId)

kyc_document_files                   (versioned file metadata; blobs live in storage)
- id           PK uuid
- submissionId FK -> kyc_document_submissions.id  *
- kycId        FK -> kyc_masters.id  *   (denormalized on purpose: query files by KYC)
- fileSlot     KycFileSlot *
- originalName varchar
- storedName   varchar
- mimeType     varchar
- sizeBytes    int
- fileHash     varchar NULL *           (sha256, for duplicate detection)
- storagePath  varchar                  (path/key to the actual file)
- version      int default 1
- isCurrent    boolean default true  *
- ipAddress    varchar NULL
- userAgent    varchar NULL
- metadata     jsonb NULL               (e.g. PAN-validation result)
- uploadedAt   timestamp
NOTE: no publicPath column — files are served only via authenticated/token-scoped
streaming endpoints using storagePath.

kyc_document_progress                (1:1 with kyc_masters; wizard resume state)
- id                   PK uuid
- kycId                FK -> kyc_masters.id  U
- currentStepIndex     int default 0
- currentRequirementId uuid NULL
- currentDocumentKey   varchar NULL
- totalSteps           int default 0
- completedSteps       int default 0
- isFinalSubmitted     boolean default false
- finalSubmittedAt     timestamp NULL
- lastAction           varchar NULL
- createdAt            timestamp
- updatedAt            timestamp

kyc_video_declarations               (1:1 with kyc_masters)
- id                  PK uuid
- kycId               FK -> kyc_masters.id  U
- declarantFullName   varchar
- declarantRole       varchar NULL
- businessName        varchar
- serviceType         varchar
- language            varchar default en
- scriptVersion       varchar
- scriptText          text
- runtimeCode         varchar
- status              KycVideoStatus * default session_started
- reviewerRemarks     varchar NULL
- reviewedBy          FK -> users.id NULL
- reviewedAt          timestamp NULL
- resubmissionRequestedAt timestamp NULL
- resubmissionCycle   int default 0
- attemptCount        int default 0
- currentAttemptId    FK -> kyc_video_attempts.id  NULL   (the live attempt)
- faceCheckPassed     boolean default false  (cache of current attempt; advisory)
- faceQualityMetadata jsonb NULL             (cache of current attempt; advisory)
- startedAt           timestamp
- submittedAt         timestamp NULL
- ipAddress           varchar NULL
- userAgent           varchar NULL
- createdAt           timestamp
- updatedAt           timestamp

kyc_video_attempts                   (every recording uploaded)
- id                  PK uuid
- declarationId       FK -> kyc_video_declarations.id  *
- kycId               FK -> kyc_masters.id  *   (denormalized on purpose)
- status              KycVideoAttemptStatus * default uploaded
- originalName        varchar
- storedName          varchar
- mimeType            varchar
- sizeBytes           int
- storagePath         varchar
- durationSeconds     float NULL
- faceCheckPassed     boolean default false   (client-reported, advisory)
- faceQualityMetadata jsonb NULL
- ipAddress           varchar NULL
- userAgent           varchar NULL
- uploadedAt          timestamp
- submittedAt         timestamp NULL
NOTE: no publicPath column (same reason as kyc_document_files).

# ---- REVIEW & DECISIONS ----

kyc_auto_checks                      (advisory rule-engine results; never auto-decide)
- id        PK uuid
- kycId     FK -> kyc_masters.id  *
- checkKey  varchar *               (duplicate_file_hash | pan_card_validation | ...)
- passed    boolean NULL
- score     float NULL
- details   jsonb NULL
- createdAt timestamp

kyc_final_reviews                    (one row per final decision; full history)
- id         PK uuid
- kycId      FK -> kyc_masters.id  *
- decision   KycFinalDecision *
- remarks    varchar NULL
- reviewedBy FK -> users.id NULL
- ipAddress  varchar NULL
- userAgent  varchar NULL
- metadata   jsonb NULL
- createdAt  timestamp

# ---- COMMS ----

email_logs
- id              PK uuid
- kycId           FK -> kyc_masters.id  NULL *
- emailType       varchar *              (kyc_link_sent | kyc_reminder | ...)
- recipientHash   varchar                (hash, for lookup)
- recipientMasked varchar                (display fallback)
- recipientEnc    varchar NULL           (encrypted full address)
- subject         varchar
- status          EmailStatus * default queued
- providerResponse jsonb NULL
- error           varchar NULL
- attemptCount    int default 0
- sentAt          timestamp NULL
- createdAt       timestamp *

reminder_states                      (1:1 with kyc_masters)
- id             PK uuid
- kycId          FK -> kyc_masters.id  U
- reminderCount  int default 0
- maxReminders   int default 5
- lastReminderAt timestamp NULL
- nextDueAt      timestamp NULL *
- exhausted      boolean default false *
- createdAt      timestamp
- updatedAt      timestamp

# ---- CROSS-CUTTING (the recorder) ----

kyc_audit_logs                       (append-only; one row per meaningful action)
- id         PK uuid
- kycId      FK -> kyc_masters.id  NULL
- actorType  ActorType default system
- actorId    FK -> users.id NULL    (set only for admin/reviewer actions)
- action     varchar
- oldStatus  varchar NULL
- newStatus  varchar NULL
- ipAddress  varchar NULL
- userAgent  varchar NULL
- metadata   jsonb NULL
- createdAt  timestamp
- INDEX (kycId, createdAt)           (case timeline, newest first)
- INDEX (createdAt)                  (global activity feed)

============================================================
RELATIONSHIP / CARDINALITY SUMMARY
============================================================
- users 1—N refresh_tokens
- users 1—N kyc_document_submissions (reviewedBy), kyc_video_declarations
  (reviewedBy), kyc_final_reviews (reviewedBy), kyc_audit_logs (actorId)
- entity_types 1—N document_requirements
- document_requirements 1—N kyc_document_submissions
- kyc_masters 1—1 : kyc_consents, kyc_document_progress, kyc_video_declarations,
  reminder_states
- kyc_masters 1—N : kyc_links, kyc_document_submissions, kyc_auto_checks,
  kyc_final_reviews, kyc_audit_logs, email_logs, kyc_video_attempts,
  kyc_document_files
- kyc_masters 0..N : purchase_events (linkedKycId), kyc_duplicate_logs (originalKycId)
- kyc_links 1—N kyc_link_click_logs
- kyc_document_submissions 1—N kyc_document_files
- kyc_video_declarations 1—N kyc_video_attempts, and 1—1 its currentAttemptId

============================================================
NORMALIZATION NOTES (state these in your output)
============================================================
- The design is in 3NF: surrogate PKs everywhere, lookups via FKs, no harmful
  transitive dependencies.
- Deliberate snapshot denormalizations (KEEP — do not "fix"):
  * kyc_document_submissions copies the document_requirements fields marked
    (snapshot) so an admin editing a requirement never changes a buyer's
    in-flight checklist.
  * purchase_events.responseSnapshot / rawPayload and kyc_duplicate_logs.rawPayload
    are frozen request/response copies for idempotent replay and forensics.
  * kyc_audit_logs.oldStatus/newStatus/metadata record values as-of the event.
- Justified denormalization: kyc_document_files.kycId and kyc_video_attempts.kycId
  duplicate the parent's kycId so files/attempts can be indexed and queried
  directly by KYC.
- Cache (acceptable): kyc_video_declarations.faceCheckPassed/faceQualityMetadata
  mirror the current attempt; the kyc_video_attempts row is the source of truth.
- PII: PAN is stored reversibly encrypted (panEnc, AES-256-GCM) for admin/reviewer
  viewing, plus a deterministic panHash blind index and panMasked; raw link/refresh
  tokens are never stored (only hashes); buyer email/mobile and email recipient are
  encrypted at rest.
````
