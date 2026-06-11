Yes. Below is a **proper phase-wise roadmap + setup guide + prompts** for building this KYC automation app.

I’ll design it like a **real production-grade workflow system**, not just an upload form.

---

# Final Recommended Tech Stack

## Best practical stack

| Layer                      | Use                                                      |
| -------------------------- | -------------------------------------------------------- |
| Frontend                   | React + Vite + Tailwind                                  |
| Admin Panel                | React + Tailwind + TanStack Table                        |
| Main Backend               | Node.js + Express/NestJS                                 |
| Database                   | PostgreSQL                                               |
| ORM                        | Prisma                                                   |
| Queue/Cron                 | BullMQ + Redis                                           |
| File Storage               | Cloudflare R2 or AWS S3                                  |
| Existing Email Integration | PHP 8 cURL service for Dial2Verify                       |
| OCR                        | Google Vision OCR first, Tesseract/PaddleOCR fallback    |
| AI Extraction              | GPT-5 nano / GPT-5 mini / GPT-5.4 mini depending on task |
| Video Processing           | FFmpeg                                                   |
| Speech-to-Text             | gpt-4o-mini-transcribe / Whisper                         |
| Face/Basic Liveness        | OpenCV / MediaPipe                                       |
| Deployment                 | Docker + Nginx + VPS/AWS                                 |
| Monitoring                 | Sentry + basic logs                                      |

Cloudflare R2 is good for this because it is S3-compatible and does not charge egress, which helps when reviewers repeatedly open uploaded documents/videos. ([Cloudflare][1]) Google Vision OCR is affordable for MVP because the first 1000 units/month are free and text/document text detection is listed at $1.50 per 1000 units after that tier. ([Google Cloud][2])

For OpenAI, use **GPT-5 nano** for cheap classification, **GPT-5 mini** for OCR text cleanup/extraction, and **GPT-5.4 mini** only for better reviewer summaries or complex mismatch reasoning. OpenAI currently lists GPT-5 nano, GPT-5 mini, and GPT-5.4 mini as cheaper model options compared with larger models. ([OpenAI][3]) For video script checking, OpenAI’s speech-to-text docs list `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, and Whisper-style transcription options; pricing currently shows `gpt-4o-mini-transcribe` around $0.003/minute and Whisper around $0.006/minute. ([OpenAI Platform][4])

---

# Overall System Architecture

```txt
2Factor Purchase System
        |
        | Webhook/API Request
        v
KYC Backend
        |
        | PAN validation + duplicate check
        v
KYC Master Record
        |
        | Entity detection from PAN 4th character
        v
Document Requirement Engine
        |
        | Secure link generation
        v
Email Service: PHP cURL + Dial2Verify
        |
        v
Buyer KYC Portal
        |
        | Docs + Live Video + Logs
        v
Storage + OCR + AI/Logical Checks
        |
        v
Reviewer Dashboard
        |
        | Accept / Reject / Resubmit failed items only
        v
Final Approval / Rejection
```

---

# Phase 0: Requirement Freezing + Compliance Foundation

## Goal

Before coding, freeze the workflow rules.

## What to define

1. Entity types:

   * Individual
   * Company
   * Firm/LLP
   * Later: Trust, HUF, Government, Society, etc.

2. PAN mapping:

```js
const panEntityMap = {
  P: "individual",
  C: "company",
  F: "firm_llp"
};
```

3. Document matrix:

   * required/optional
   * upload/live photo/video
   * front/back
   * OCR required or not
   * manual review required or not

4. Consent:

   * why data is collected
   * how data is processed
   * how long it is stored
   * automated checks + manual review notice

This matters because India’s DPDP Act says consent should be free, specific, informed, unconditional, unambiguous, and limited to necessary personal data. ([Indian Kanoon][5]) For Aadhaar, prefer masked Aadhaar or UIDAI Offline Aadhaar XML/QR, because UIDAI’s offline e-KYC method allows verification without collecting or storing the Aadhaar number. ([UIDAI][6])

## Prompt for this phase

```txt
Act as a senior product architect for an Indian KYC automation platform.

Create a complete requirement document for a KYC system where:
- one KYC master record exists per PAN
- PAN format is AAAAA9999A
- 4th PAN character decides entity type
- admins can configure document requirements
- buyers complete KYC in English or Hindi
- reviewers can accept/reject individual documents
- only rejected documents require resubmission
- live video declaration uses a runtime code
- OCR and AI assist manual review
- all actions require audit logs

Give:
1. user roles
2. workflow stages
3. statuses
4. document matrix
5. edge cases
6. security rules
7. audit log requirements
```

---

# Phase 1: Project Setup

## Goal

Create the base project structure.

## Recommended folder structure

```txt
kyc-automation/
│
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── webhook/
│   │   │   ├── kyc/
│   │   │   ├── documents/
│   │   │   ├── video-kyc/
│   │   │   ├── ocr/
│   │   │   ├── ai-checks/
│   │   │   ├── email/
│   │   │   ├── reminders/
│   │   │   └── audit/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── queues/
│   │   └── server.ts
│   │
│   ├── prisma/
│   │   └── schema.prisma
│   │
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── features/
│   │   ├── api/
│   │   └── App.jsx
│   └── package.json
│
├── email-service-php/
│   └── KycEmailService.php
│
├── docker-compose.yml
└── README.md
```

## Backend setup commands

```bash
mkdir kyc-automation
cd kyc-automation

mkdir backend
cd backend

npm init -y

npm install express cors helmet dotenv zod jsonwebtoken bcrypt multer
npm install @prisma/client prisma
npm install bullmq ioredis
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm install axios pino uuid
npm install -D typescript ts-node-dev @types/node @types/express
```

## Prisma setup

```bash
npx prisma init
```

## Frontend setup

```bash
cd ..
npm create vite@latest frontend
cd frontend
npm install
npm install axios react-router-dom lucide-react
npm install tailwindcss @tailwindcss/vite
```

## Docker services

Use Docker for:

```txt
PostgreSQL
Redis
Backend
Frontend
```

## Prompt for this phase

```txt
Act as a senior full-stack architect.

Create a production-ready folder structure for a KYC automation app using:
- React + Vite + Tailwind frontend
- Node.js + Express + TypeScript backend
- PostgreSQL + Prisma
- Redis + BullMQ
- Cloudflare R2/S3 storage
- PHP email microservice

Generate:
1. folder structure
2. package dependencies
3. environment variables
4. base Express server setup
5. Prisma setup
6. Docker compose file
7. recommended coding conventions
```

---

# Phase 2: Database Schema Design

## Goal

Create all core tables before business logic.

## Must-have tables

```txt
users
roles
kyc_masters
kyc_duplicate_logs
kyc_links
kyc_link_click_logs
entity_types
document_requirements
kyc_documents
kyc_ocr_results
kyc_auto_checks
kyc_video_declarations
email_logs
reminder_logs
kyc_audit_logs
```

## Most important table: `kyc_masters`

```prisma
model KycMaster {
  id            String   @id @default(uuid())
  panHash       String   @unique
  panMasked     String
  entityType    String
  buyerName     String
  buyerEmailEnc String
  buyerMobileEnc String?
  purchaseId    String
  serviceType   String
  overallStatus String   @default("created")
  currentStage  String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

## Document status logic

Each document should have its own status:

```txt
pending
uploaded
ocr_processing
ocr_failed
auto_checked
under_review
accepted
rejected
resubmission_required
```

## KYC status logic

```txt
created
link_sent
opened
in_progress
submitted
under_review
resubmission_required
approved
rejected
expired
```

## Prompt for this phase

```txt
Act as a senior database architect.

Design a PostgreSQL + Prisma schema for a KYC automation system with:
- one master KYC per PAN
- duplicate PAN logs
- secure KYC link with click tracking
- entity type configuration
- document requirement configuration
- uploaded document attempts
- OCR result storage
- AI/logical check result storage
- live video declaration storage
- reviewer decision logs
- reminder logs
- email logs
- audit logs

Return:
1. Prisma schema
2. important indexes
3. enum/status design
4. relationships
5. data privacy notes for PAN/Aadhaar/email/mobile
```

---

# Phase 3: Webhook Intake + PAN Master Logic

## Goal

When purchase happens, KYC starts automatically.

## API

```txt
POST /api/webhooks/purchase-created
```

## Webhook steps

1. Validate webhook secret/signature.
2. Validate payload.
3. Normalize PAN to uppercase.
4. Validate PAN regex.
5. Hash PAN.
6. Check existing `kyc_masters`.
7. If duplicate:

   * save in `kyc_duplicate_logs`
   * return ignored response
8. If new:

   * detect entity type
   * create KYC master
   * create required checklist from admin config
   * generate secure link
   * queue email

## PAN detection code

```js
function detectEntityFromPAN(pan) {
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    throw new Error("Invalid PAN format");
  }

  const entityChar = pan[3];

  const map = {
    P: "individual",
    C: "company",
    F: "firm_llp"
  };

  return map[entityChar] || "unknown";
}
```

## Prompt for this phase

```txt
Act as a senior backend developer.

Build a webhook module in Node.js + Express + Prisma for a KYC automation app.

Requirements:
- endpoint: POST /api/webhooks/purchase-created
- validate webhook signature
- validate payload using Zod
- validate PAN using regex ^[A-Z]{5}[0-9]{4}[A-Z]$
- hash PAN before database lookup
- one KYC master per PAN
- if duplicate PAN, insert record into kyc_duplicate_logs and ignore new request
- detect entity type using PAN[3]
- create KYC master for new PAN
- generate secure KYC link
- create audit log
- push email job to BullMQ

Return complete code with:
1. route
2. controller
3. service
4. validation schema
5. Prisma calls
6. error handling
```

---

# Phase 4: Secure KYC Link + Click Tracking

## Goal

Buyer should get a unique secure KYC link.

## Link example

```txt
https://kyc.2factor.in/kyc/start/:token
```

## Security rules

Do not store raw token.

Store:

```txt
token_hash
expires_at
click_count
first_clicked_at
last_clicked_at
status
```

When buyer opens link, log:

```txt
IP address
user agent
timestamp
device
city/country approx
```

## API

```txt
GET /api/public/kyc-link/:token
POST /api/public/kyc-link/:token/start
```

## Prompt for this phase

```txt
Act as a senior security-focused backend developer.

Create secure KYC link generation and verification logic.

Requirements:
- generate random 48-byte token
- store only SHA-256 hash of token
- create expiry date
- increment click_count whenever link is opened
- store click logs with IP, user agent, timestamp, approximate location
- reject expired links
- reject disabled links
- never expose internal kyc_id directly
- return public-safe KYC details and required stages

Generate:
1. token generation utility
2. link creation service
3. public link verification endpoint
4. click tracking endpoint
5. audit log integration
```

---

# Phase 5: Email Service Integration

## Goal

Send KYC link using existing Dial2Verify provider.

## Existing provider

```txt
http://api.dial2verify.com/v2.5/sendMail_SMTP.php
```

## Required query params

```txt
Subject
From
To
Msg
```

## PHP service behavior

Use:

```php
http_build_query($params, '', '&', PHP_QUERY_RFC3986);
```

Use cURL, not shell command.

## Email types

```txt
kyc_link_sent
kyc_reminder
document_rejected
resubmission_requested
kyc_approved
kyc_rejected
```

## Prompt for this phase

```txt
Act as a senior PHP 8 developer.

Create code/KycEmailService.php for sending KYC emails through Dial2Verify.

Provider endpoint:
http://api.dial2verify.com/v2.5/sendMail_SMTP.php

Required params:
- Subject
- From=no-reply@2factor.in
- To
- Msg

Requirements:
- use PHP cURL, not shell backticks
- use http_build_query with RFC3986 encoding
- support practical timeout: 15s connect, 30s total
- return structured response
- log email_type, recipient hash, encrypted recipient email, subject, provider response, status, error
- support cc only if provider supports it, otherwise send separate emails
- handle failures safely

Return complete PHP class with usage example.
```

---

# Phase 6: Admin Config Panel

## Goal

Admin can configure entity types and document requirements without code changes.

## Admin screens

1. Entity Types
2. Document Requirements
3. Reminder Settings
4. Video Script Settings
5. Reviewer Roles
6. KYC Status Dashboard

## Example config

```json
{
  "entity_type": "company",
  "document_name": "Certificate of Incorporation",
  "input_mode": "upload",
  "is_required": true,
  "needs_front": false,
  "needs_back": false,
  "ocr_enabled": true
}
```

## APIs

```txt
GET /api/admin/entity-types
POST /api/admin/entity-types

GET /api/admin/document-requirements
POST /api/admin/document-requirements
PATCH /api/admin/document-requirements/:id

GET /api/admin/reminder-settings
PATCH /api/admin/reminder-settings
```

## Prompt for this phase

```txt
Act as a senior full-stack developer.

Build an admin configuration module for a KYC automation app.

Requirements:
- admins can create/edit entity types
- admins can create/edit document requirements per entity type
- each requirement has name, key, required flag, input mode, front/back flags, OCR enabled flag, active flag, sort order
- admins can configure reminder count and reminder interval
- admins can configure video declaration scripts in English and Hindi
- use React + Tailwind frontend
- use Node.js + Express + Prisma backend

Generate:
1. Prisma models if needed
2. backend APIs
3. React admin pages
4. validation
5. role-based access checks
```

---

# Phase 7: Buyer KYC Portal

## Goal

Buyer completes KYC in English/Hindi.

## Buyer flow

1. Open link.
2. Language selection.
3. Consent page.
4. Basic details confirmation.
5. Upload required documents.
6. Capture live photo if needed.
7. Complete live video declaration.
8. Submit KYC.
9. Track status.

## Frontend pages

```txt
/kyc/start/:token
/kyc/consent
/kyc/basic-details
/kyc/documents
/kyc/video
/kyc/review-submit
/kyc/status
```

## Buyer document upload rules

For each upload:

store:

```txt
document_id
file_url
file_hash
mime_type
file_size
uploaded_ip
uploaded_at
user_agent
status
attempt_no
```

## Prompt for this phase

```txt
Act as a senior React developer.

Build a buyer KYC portal using React + Vite + Tailwind.

Requirements:
- public secure token based route
- language selection: English/Hindi
- consent screen
- show document checklist based on entity type
- support upload/live photo input mode
- support front/back upload if required
- show per-document status
- allow resubmission only for rejected documents
- show progress bar
- collect IP/action timestamps through backend
- responsive mobile-first design
- clean professional UI

Generate:
1. route structure
2. components
3. API integration
4. state management approach
5. UI design
6. validation
```

---

# Phase 8: Document Upload + Storage

## Goal

Securely store documents.

## Use storage

Recommended:

```txt
Cloudflare R2 or AWS S3
```

## Important rules

1. Private bucket only.
2. No public URLs.
3. Use signed URLs for reviewer viewing.
4. Save file hash to detect duplicate uploads.
5. Limit file types:

   * JPG
   * PNG
   * PDF
   * WebP
6. Limit size:

   * images: 5 MB
   * PDFs: 10 MB
   * video: 50–100 MB

## Prompt for this phase

```txt
Act as a senior backend developer.

Build secure document upload for a KYC automation app.

Requirements:
- use multer for receiving files
- validate file type and size
- upload to S3-compatible storage
- store private object key, not public URL
- generate file hash
- save metadata in kyc_documents
- store uploaded IP, user agent, timestamp
- update document status to uploaded
- create audit log
- queue OCR job if OCR is enabled
- generate signed URL for reviewers only

Return complete backend code.
```

---

# Phase 9: OCR Pipeline

## Goal

Extract text from PAN/GST/Aadhaar/DL/passport.

## OCR flow

```txt
Document Uploaded
      |
      v
OCR Job Queue
      |
      v
Google Vision OCR / Tesseract / PaddleOCR
      |
      v
Raw text saved
      |
      v
Regex + logical extraction
      |
      v
AI cleanup if needed
      |
      v
Reviewer summary
```

Google Vision supports `TEXT_DETECTION` and `DOCUMENT_TEXT_DETECTION`; document text detection is optimized for dense documents. ([Google Cloud Documentation][7]) Tesseract is free/open-source and supports UTF-8 plus more than 100 languages, while PaddleOCR has multilingual OCR capability and can be useful as a self-hosted fallback. ([GitHub][8])

## OCR extraction targets

### PAN

```json
{
  "document_type": "pan",
  "pan_number": "ABCDE1234F",
  "name": "ARYAN SHARMA",
  "father_name": "XYZ",
  "dob": "2000-01-01"
}
```

### GST

```json
{
  "document_type": "gst",
  "gstin": "27ABCDE1234F1Z5",
  "pan_from_gstin": "ABCDE1234F",
  "legal_name": "ABC PRIVATE LIMITED"
}
```

## Runtime AI prompt for OCR cleanup

```txt
You are a KYC OCR extraction assistant.

You will receive OCR text from an Indian identity/business document.

Return JSON only.

Expected document type: <DOCUMENT_TYPE>
Expected PAN: <PAN>
Expected entity type: <ENTITY_TYPE>

Extract:
- document_type
- name_or_legal_name
- pan_number
- gstin
- dob
- address
- issue_date
- document_number_masked
- confidence_score
- mismatch_flags
- reviewer_summary

Rules:
- Do not approve or reject.
- Do not guess missing values.
- If uncertain, return null.
- Mask Aadhaar number if present.
- Do not store or output full Aadhaar number.
- Return only valid JSON.
```

## Prompt for implementation

```txt
Act as a senior AI backend engineer.

Build an OCR pipeline for KYC documents.

Requirements:
- when document is uploaded, push OCR job to BullMQ
- call Google Vision OCR first
- support fallback to Tesseract/PaddleOCR
- save raw OCR text
- extract PAN/GST/Aadhaar/DL/passport fields
- run regex checks before LLM
- call GPT-5 nano/mini only with OCR text, not raw image
- store extracted JSON
- create auto-check records
- update document status
- handle OCR failure safely

Return:
1. queue worker
2. OCR provider abstraction
3. extraction logic
4. LLM prompt
5. Prisma writes
6. error handling
```

---

# Phase 10: Logical Verification Engine

## Goal

Save money by using rules before AI.

## Checks to implement

### PAN format check

```js
/^[A-Z]{5}[0-9]{4}[A-Z]$/
```

### GST PAN match

```js
const panFromGstin = gstin.substring(2, 12);
const isMatch = panFromGstin === submittedPan;
```

### Entity mismatch

```txt
PAN says Individual but uploaded Company documents.
```

### Name fuzzy match

```txt
Buyer Name: Aryan Sharma
PAN OCR Name: Aryan S Sharma
Score: 86%
```

### Duplicate document hash

```txt
Same file uploaded for PAN and GST proof.
```

## Risk score

```json
{
  "risk_level": "medium",
  "score": 62,
  "flags": [
    "GST PAN does not match submitted PAN",
    "Name match score below threshold"
  ]
}
```

## Prompt for this phase

```txt
Act as a senior backend engineer.

Build a rule-based KYC verification engine.

Requirements:
- PAN format validation
- PAN entity type detection
- GSTIN format validation
- GSTIN to PAN match
- fuzzy name matching
- duplicate file hash detection
- required document completion check
- rejected document resubmission check
- risk scoring
- store results in kyc_auto_checks
- never auto-approve final KYC
- generate reviewer-friendly summary

Return complete service code and test cases.
```

---

# Phase 11: Reviewer Dashboard

## Goal

Reviewer manually accepts/rejects each document/video.

## Reviewer actions

```txt
accept_document
reject_document
request_resubmission
accept_video
reject_video
approve_kyc
reject_kyc
```

## Reviewer screen should show

1. Buyer info
2. PAN/entity type
3. Document checklist
4. Each document status
5. OCR result
6. Auto-check result
7. File preview
8. Upload IP/timestamp
9. Previous attempts
10. Rejection reason box

## API

```txt
GET /api/reviewer/kycs
GET /api/reviewer/kycs/:id
PATCH /api/reviewer/documents/:id/review
PATCH /api/reviewer/videos/:id/review
PATCH /api/reviewer/kycs/:id/final-review
```

## Prompt for this phase

```txt
Act as a senior full-stack developer.

Build a reviewer dashboard for KYC verification.

Requirements:
- list KYC records by status
- filter by entity type, status, date
- show each document with OCR result and AI/logical checks
- show signed file preview URL
- allow accept/reject/resubmission per document
- ask rejection reason for failed document
- allow final KYC approval only when all required docs/videos are accepted
- create audit logs for every action
- send resubmission email when needed
- frontend in React + Tailwind
- backend in Node.js + Prisma

Generate APIs, React components, and status update logic.
```

---

# Phase 12: Live Video KYC

## Goal

Buyer records a video reading the script with unique runtime code.

## Flow

1. Buyer clicks “Start Video KYC”.
2. Backend generates runtime code.
3. Frontend displays script.
4. Browser records video.
5. Upload video.
6. Backend stores metadata.
7. Extract audio using FFmpeg.
8. Transcribe audio.
9. Match runtime code.
10. Match script similarity.
11. Send to reviewer.

## Clean Hindi script

```txt
मेरा नाम <PersonName> है। मैं <CompanyName> के लिए अधिकृत व्यक्ति हूँ। हमें अपने संचार उपयोग के लिए 2Factor के साथ SMS/WhatsApp सेवा खाते की आवश्यकता है। मैं अनिवार्य नियामक आवश्यकताओं को पूरा करने का आश्वासन देता/देती हूँ। मेरा सत्यापन कोड <RuntimeCode> है।
```

## Video checks

```json
{
  "face_detected": true,
  "audio_detected": true,
  "runtime_code_spoken": true,
  "script_similarity": 88,
  "duration_seconds": 14,
  "language": "hi"
}
```

## Runtime AI prompt for transcript check

```txt
You are a video KYC declaration checker.

Expected language: <LANGUAGE>
Expected runtime code: <CODE>
Expected script:
<SCRIPT>

Transcript:
<TRANSCRIPT>

Return JSON only:
{
  "runtime_code_spoken": true/false,
  "spoken_code": "",
  "script_similarity_score": 0-100,
  "missing_required_parts": [],
  "suspicious_flags": [],
  "reviewer_summary": ""
}

Rules:
- Do not approve or reject.
- Only assist manual reviewer.
- If transcript is unclear, mark confidence low.
```

## Prompt for implementation

```txt
Act as a senior video KYC engineer.

Build live video declaration module.

Requirements:
- generate unique runtime code
- store code hash, script version, language
- show English/Hindi script
- record video in browser
- upload video securely
- store video metadata, IP, timestamp, user agent
- extract audio using FFmpeg
- transcribe using gpt-4o-mini-transcribe or Whisper
- verify runtime code spoken
- calculate script similarity
- detect basic face presence using OpenCV/MediaPipe
- store results
- send to reviewer dashboard
- do not auto-approve

Return backend APIs, frontend recording component, worker logic, and database updates.
```

---

# Phase 13: Resubmission Flow

## Goal

User should resubmit only failed items.

## Example

If Aadhaar back rejected:

```txt
PAN card: accepted
Aadhaar front: accepted
Aadhaar back: resubmission_required
Live video: accepted
```

Buyer only sees Aadhaar back upload again.

## Logic

1. Reviewer rejects document.
2. Status becomes `resubmission_required`.
3. KYC overall status becomes `resubmission_required`.
4. Email goes to buyer.
5. Buyer opens same link.
6. Only rejected fields are editable.
7. New upload creates `attempt_no + 1`.
8. Old rejected attempt is preserved.

## Prompt

```txt
Act as a senior workflow engineer.

Build targeted resubmission logic for a KYC system.

Requirements:
- reviewer can reject individual document/video
- buyer can resubmit only rejected items
- accepted documents remain locked
- every new upload creates a new attempt
- old attempts remain stored
- overall KYC status updates correctly
- email is sent with failed item list
- audit log records reviewer reason and buyer resubmission

Return backend logic, frontend behavior, and status transition rules.
```

---

# Phase 14: Reminder Cron

## Goal

Send reminders up to configured limit.

## Default

```txt
max_reminders = 5
```

## Cron logic

Run every day or every few hours.

Find KYC where:

```txt
status in created/link_sent/opened/in_progress/resubmission_required
reminder_count < max_reminders
last_reminder_at older than configured gap
```

Then:

1. Send reminder email.
2. Increment count.
3. Save reminder log.
4. If count exhausted:

   * mark expired or escalation_required.

## Prompt

```txt
Act as a senior backend automation engineer.

Build reminder cron for KYC app using BullMQ + Redis.

Requirements:
- configurable reminder limit, default 5
- configurable reminder interval
- send reminders for incomplete KYC
- send separate reminder for resubmission pending
- log every reminder
- stop after max limit
- mark KYC expired or escalated after max reminders
- use email queue
- avoid duplicate reminders

Return worker code, scheduler code, Prisma queries, and email templates.
```

---

# Phase 15: Audit Logs + Security Hardening

## Goal

Make it production-safe.

## Must log

Every important action:

```txt
webhook_received
kyc_created
duplicate_pan_ignored
kyc_link_sent
kyc_link_opened
document_uploaded
ocr_completed
auto_check_completed
document_accepted
document_rejected
video_uploaded
video_accepted
video_rejected
kyc_approved
kyc_rejected
reminder_sent
```

## Security checklist

1. Hash PAN for uniqueness.
2. Encrypt email/mobile.
3. Mask PAN in frontend.
4. Never show full Aadhaar.
5. Private storage bucket.
6. Signed URLs only.
7. Role-based access.
8. Rate limit public links.
9. Webhook signature.
10. Admin/reviewer activity logs.
11. File malware scanning if possible.
12. Backup policy.
13. Data retention policy.
14. Consent record.

## Prompt

```txt
Act as a senior security architect.

Create a security and audit layer for a KYC automation platform.

Requirements:
- audit every user/admin/reviewer/system action
- store actor type, actor id, IP, user agent, metadata
- encrypt sensitive fields
- hash PAN for uniqueness
- mask PAN/Aadhaar in UI
- use signed URLs for file viewing
- rate-limit public KYC links
- validate webhook signature
- define role-based permissions
- define retention policy
- define backup strategy

Return implementation plan, middleware, Prisma schema additions, and code examples.
```

---

# Phase 16: Final Production Deployment

## Recommended deployment

For MVP:

```txt
Frontend: Vercel / Nginx
Backend: VPS/AWS EC2/DigitalOcean
Database: Managed PostgreSQL
Redis: Managed Redis / Docker Redis
Storage: Cloudflare R2
PHP Email Service: same VPS or existing 2Factor server
```

For serious production:

```txt
Dockerized backend
Nginx reverse proxy
SSL
PostgreSQL backups
Redis queue monitoring
Sentry error tracking
Centralized logs
Separate staging + production
```

## Environment variables

```env
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
WEBHOOK_SECRET=

R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_ENDPOINT=

OPENAI_API_KEY=
GOOGLE_APPLICATION_CREDENTIALS=

KYC_BASE_URL=
EMAIL_SERVICE_URL=

ENCRYPTION_KEY=
PAN_HASH_SECRET=
```

## Prompt

```txt
Act as a DevOps engineer.

Create production deployment setup for a KYC automation system.

Stack:
- React frontend
- Node.js backend
- PostgreSQL
- Redis
- PHP email service
- Cloudflare R2
- OCR/AI workers

Generate:
1. Dockerfile for backend
2. Docker compose for local/staging
3. Nginx reverse proxy config
4. environment variable list
5. deployment steps
6. backup plan
7. monitoring plan
8. staging/production separation
```

---

# Best Phase Order for Development

Build in this exact order:

```txt
Phase 0: Requirements + compliance
Phase 1: Project setup
Phase 2: Database schema
Phase 3: Webhook + PAN master
Phase 4: Secure KYC link
Phase 5: Email service
Phase 6: Admin document matrix
Phase 7: Buyer KYC portal
Phase 8: Document upload/storage
Phase 9: Reviewer dashboard basic
Phase 10: Resubmission flow
Phase 11: Reminder cron
Phase 12: OCR pipeline
Phase 13: Logical verification
Phase 14: Live video KYC
Phase 15: AI reviewer summaries
Phase 16: Security hardening
Phase 17: Production deployment
```

---

# MVP Version vs Full Version

## MVP should include first

```txt
Webhook
PAN validation
Duplicate PAN blocking
Entity detection
Secure KYC link
Email sending
Buyer document upload
Admin document requirement config
Reviewer accept/reject
Targeted resubmission
Reminder cron
Audit logs
```

## Add after MVP

```txt
Google Vision OCR
PAN/GST logical checks
AI extraction summary
Live video declaration
Speech-to-text verification
Face detection
Risk score
Advanced analytics
```

This prevents you from getting stuck in AI/video complexity before the core KYC workflow is stable.

---

# Cheapest AI Usage Strategy

Use AI only where it gives value.

| Stage                 | Use AI? | Tool                                  |
| --------------------- | ------: | ------------------------------------- |
| PAN format validation |      No | Regex                                 |
| Entity detection      |      No | PAN[3]                                |
| GST PAN match         |      No | String logic                          |
| File duplicate        |      No | File hash                             |
| OCR raw extraction    |   Maybe | Google Vision / Tesseract / PaddleOCR |
| OCR cleanup           |     Yes | GPT-5 nano / GPT-5 mini               |
| Reviewer summary      |     Yes | GPT-5 mini / GPT-5.4 mini             |
| Video transcript      |     Yes | gpt-4o-mini-transcribe / Whisper      |
| Final approval        |      No | Manual reviewer                       |

Golden rule:

> **Do not send raw documents to LLM unless necessary. First use OCR, then send only extracted text to the model.**

This will reduce cost and improve privacy.

---

# Final Build Strategy

Your app should be built as a:

```txt
PAN-based KYC workflow engine
```

Not as:

```txt
simple upload form
```

Because your requirements need:

* one KYC per PAN
* duplicate handling
* entity-based checklist
* secure link tracking
* document-wise status
* video-wise status
* OCR status
* AI/logical status
* reviewer decision status
* reminder status
* complete audit history

That workflow-engine thinking will make the project scalable, professional, and production-ready.

[1]: https://www.cloudflare.com/product/r2?utm_source=chatgpt.com "Cloudflare R2 - Egress-Free Object Storage"
[2]: https://cloud.google.com/vision/pricing?utm_source=chatgpt.com "Pricing  |  Cloud Vision API  |  Google Cloud"
[3]: https://openai.com/api/pricing?utm_source=chatgpt.com "Pricing | OpenAI"
[4]: https://platform.openai.com/docs/guides/speech-to-text?lang=javascript&utm_source=chatgpt.com "Speech to text | OpenAI API"
[5]: https://indiankanoon.org/doc/3510545/?utm_source=chatgpt.com "THE DIGITAL PERSONAL DATA PROTECTION ACT, 2023"
[6]: https://uidai.gov.in/307-faqs/aadhaar-online-services/aadhaar-paperless-offline-e-kyc/10726-what-is-aadhaar-offline-e-kyc.html?utm_source=chatgpt.com "What is Aadhaar Paperless Offline e-KYC? - Unique Identification Authority of India | Government of India"
[7]: https://docs.cloud.google.com/vision/docs/ocr?utm_source=chatgpt.com "Detect text in images  |  Cloud Vision API  |  Google Cloud Documentation"
[8]: https://github.com/tesseract-ocr/tesseract?utm_source=chatgpt.com "GitHub - tesseract-ocr/tesseract: Tesseract Open Source OCR Engine (main repository) · GitHub"
