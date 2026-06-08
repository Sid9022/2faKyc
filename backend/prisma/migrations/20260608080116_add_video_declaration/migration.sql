-- CreateEnum
CREATE TYPE "KycVideoStatus" AS ENUM ('session_started', 'recording_uploaded', 'submitted', 'quality_flagged', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "KycVideoAttemptStatus" AS ENUM ('uploaded', 'submitted', 'discarded');

-- CreateTable
CREATE TABLE "kyc_video_declarations" (
    "id" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "declarantFullName" TEXT NOT NULL,
    "declarantRole" TEXT,
    "businessName" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "scriptVersion" TEXT NOT NULL DEFAULT 'v1',
    "scriptText" TEXT NOT NULL,
    "runtimeCode" TEXT NOT NULL,
    "status" "KycVideoStatus" NOT NULL DEFAULT 'session_started',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "currentAttemptId" TEXT,
    "faceCheckPassed" BOOLEAN NOT NULL DEFAULT false,
    "faceQualityMetadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_video_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_video_attempts" (
    "id" TEXT NOT NULL,
    "declarationId" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "status" "KycVideoAttemptStatus" NOT NULL DEFAULT 'uploaded',
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "publicPath" TEXT,
    "durationSeconds" DOUBLE PRECISION,
    "faceCheckPassed" BOOLEAN NOT NULL DEFAULT false,
    "faceQualityMetadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "kyc_video_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kyc_video_declarations_kycId_key" ON "kyc_video_declarations"("kycId");

-- CreateIndex
CREATE INDEX "kyc_video_declarations_status_idx" ON "kyc_video_declarations"("status");

-- CreateIndex
CREATE INDEX "kyc_video_attempts_declarationId_idx" ON "kyc_video_attempts"("declarationId");

-- CreateIndex
CREATE INDEX "kyc_video_attempts_kycId_idx" ON "kyc_video_attempts"("kycId");

-- CreateIndex
CREATE INDEX "kyc_video_attempts_status_idx" ON "kyc_video_attempts"("status");

-- AddForeignKey
ALTER TABLE "kyc_video_declarations" ADD CONSTRAINT "kyc_video_declarations_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "kyc_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_video_attempts" ADD CONSTRAINT "kyc_video_attempts_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "kyc_video_declarations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
