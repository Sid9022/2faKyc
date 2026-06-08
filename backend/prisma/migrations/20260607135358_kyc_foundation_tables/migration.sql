-- CreateEnum
CREATE TYPE "KycOverallStatus" AS ENUM ('created', 'link_sent', 'opened', 'in_progress', 'submitted', 'under_review', 'resubmission_required', 'approved', 'rejected', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "PurchaseEventStatus" AS ENUM ('kyc_created', 'duplicate_pan_ignored', 'purchase_id_conflict', 'retry_same_payload', 'retry_same_pan_changed_payload');

-- CreateEnum
CREATE TYPE "RequirementInputMode" AS ENUM ('upload', 'live_photo_front', 'live_photo_front_back', 'upload_or_live_photo', 'live_video');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('system', 'buyer', 'admin', 'reviewer');

-- CreateTable
CREATE TABLE "kyc_masters" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerMobile" TEXT,
    "serviceType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "panHash" TEXT NOT NULL,
    "panMasked" TEXT NOT NULL,
    "entityChar" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityLabel" TEXT NOT NULL,
    "overallStatus" "KycOverallStatus" NOT NULL DEFAULT 'created',
    "currentStage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_events" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "panHash" TEXT NOT NULL,
    "panMasked" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "PurchaseEventStatus" NOT NULL,
    "linkedKycId" TEXT,
    "responseSnapshot" JSONB,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_duplicate_logs" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "panHash" TEXT NOT NULL,
    "panMasked" TEXT NOT NULL,
    "originalKycId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_duplicate_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_types" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "panChar" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_requirements" (
    "id" TEXT NOT NULL,
    "entityTypeId" TEXT NOT NULL,
    "documentKey" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "inputMode" "RequirementInputMode" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "needsFront" BOOLEAN NOT NULL DEFAULT false,
    "needsBack" BOOLEAN NOT NULL DEFAULT false,
    "ocrEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_audit_logs" (
    "id" TEXT NOT NULL,
    "kycId" TEXT,
    "actorType" "ActorType" NOT NULL DEFAULT 'system',
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "oldStatus" TEXT,
    "newStatus" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kyc_masters_panHash_key" ON "kyc_masters"("panHash");

-- CreateIndex
CREATE INDEX "kyc_masters_purchaseId_idx" ON "kyc_masters"("purchaseId");

-- CreateIndex
CREATE INDEX "kyc_masters_entityType_idx" ON "kyc_masters"("entityType");

-- CreateIndex
CREATE INDEX "kyc_masters_overallStatus_idx" ON "kyc_masters"("overallStatus");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_events_purchaseId_key" ON "purchase_events"("purchaseId");

-- CreateIndex
CREATE INDEX "purchase_events_panHash_idx" ON "purchase_events"("panHash");

-- CreateIndex
CREATE INDEX "purchase_events_status_idx" ON "purchase_events"("status");

-- CreateIndex
CREATE INDEX "kyc_duplicate_logs_purchaseId_idx" ON "kyc_duplicate_logs"("purchaseId");

-- CreateIndex
CREATE INDEX "kyc_duplicate_logs_panHash_idx" ON "kyc_duplicate_logs"("panHash");

-- CreateIndex
CREATE UNIQUE INDEX "entity_types_key_key" ON "entity_types"("key");

-- CreateIndex
CREATE INDEX "document_requirements_documentKey_idx" ON "document_requirements"("documentKey");

-- CreateIndex
CREATE UNIQUE INDEX "document_requirements_entityTypeId_documentKey_key" ON "document_requirements"("entityTypeId", "documentKey");

-- CreateIndex
CREATE INDEX "kyc_audit_logs_kycId_idx" ON "kyc_audit_logs"("kycId");

-- CreateIndex
CREATE INDEX "kyc_audit_logs_action_idx" ON "kyc_audit_logs"("action");

-- CreateIndex
CREATE INDEX "kyc_audit_logs_actorType_idx" ON "kyc_audit_logs"("actorType");

-- AddForeignKey
ALTER TABLE "purchase_events" ADD CONSTRAINT "purchase_events_linkedKycId_fkey" FOREIGN KEY ("linkedKycId") REFERENCES "kyc_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_duplicate_logs" ADD CONSTRAINT "kyc_duplicate_logs_originalKycId_fkey" FOREIGN KEY ("originalKycId") REFERENCES "kyc_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "entity_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_audit_logs" ADD CONSTRAINT "kyc_audit_logs_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "kyc_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
