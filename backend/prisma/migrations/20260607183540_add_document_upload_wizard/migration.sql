-- CreateEnum
CREATE TYPE "KycDocumentStatus" AS ENUM ('not_started', 'draft_saved', 'skipped', 'submitted', 'under_review', 'accepted', 'rejected', 'resubmission_required');

-- CreateEnum
CREATE TYPE "KycFileSlot" AS ENUM ('front', 'back', 'document', 'extra');

-- CreateTable
CREATE TABLE "kyc_document_submissions" (
    "id" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "documentKey" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "inputMode" "RequirementInputMode" NOT NULL,
    "isRequired" BOOLEAN NOT NULL,
    "status" "KycDocumentStatus" NOT NULL DEFAULT 'not_started',
    "notes" TEXT,
    "reviewerRemarks" TEXT,
    "saveCount" INTEGER NOT NULL DEFAULT 0,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "lastSavedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_document_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_document_files" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "fileSlot" "KycFileSlot" NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "publicPath" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_document_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_document_progress" (
    "id" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "currentRequirementId" TEXT,
    "currentDocumentKey" TEXT,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "completedSteps" INTEGER NOT NULL DEFAULT 0,
    "isFinalSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "finalSubmittedAt" TIMESTAMP(3),
    "lastAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_document_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kyc_document_submissions_kycId_idx" ON "kyc_document_submissions"("kycId");

-- CreateIndex
CREATE INDEX "kyc_document_submissions_requirementId_idx" ON "kyc_document_submissions"("requirementId");

-- CreateIndex
CREATE INDEX "kyc_document_submissions_status_idx" ON "kyc_document_submissions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_document_submissions_kycId_requirementId_key" ON "kyc_document_submissions"("kycId", "requirementId");

-- CreateIndex
CREATE INDEX "kyc_document_files_submissionId_idx" ON "kyc_document_files"("submissionId");

-- CreateIndex
CREATE INDEX "kyc_document_files_kycId_idx" ON "kyc_document_files"("kycId");

-- CreateIndex
CREATE INDEX "kyc_document_files_fileSlot_idx" ON "kyc_document_files"("fileSlot");

-- CreateIndex
CREATE INDEX "kyc_document_files_isCurrent_idx" ON "kyc_document_files"("isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_document_progress_kycId_key" ON "kyc_document_progress"("kycId");

-- AddForeignKey
ALTER TABLE "kyc_document_submissions" ADD CONSTRAINT "kyc_document_submissions_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "kyc_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_document_submissions" ADD CONSTRAINT "kyc_document_submissions_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "document_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_document_files" ADD CONSTRAINT "kyc_document_files_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "kyc_document_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_document_progress" ADD CONSTRAINT "kyc_document_progress_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "kyc_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
