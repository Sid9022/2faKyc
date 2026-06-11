-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'reviewer');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('queued', 'sent', 'failed', 'simulated');

-- AlterTable
ALTER TABLE "kyc_document_files" ADD COLUMN     "fileHash" TEXT;

-- AlterTable
ALTER TABLE "kyc_document_submissions" ADD COLUMN     "needsBack" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "needsFront" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ocrEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "kyc_masters" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- DropTable
DROP TABLE "test_connections";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "kycId" TEXT,
    "emailType" TEXT NOT NULL,
    "recipientHash" TEXT NOT NULL,
    "recipientMasked" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'queued',
    "providerResponse" JSONB,
    "error" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_states" (
    "id" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "maxReminders" INTEGER NOT NULL DEFAULT 5,
    "lastReminderAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3),
    "exhausted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_auto_checks" (
    "id" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "checkKey" TEXT NOT NULL,
    "passed" BOOLEAN,
    "score" DOUBLE PRECISION,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_auto_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "email_logs_kycId_idx" ON "email_logs"("kycId");

-- CreateIndex
CREATE INDEX "email_logs_emailType_idx" ON "email_logs"("emailType");

-- CreateIndex
CREATE INDEX "email_logs_status_idx" ON "email_logs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_states_kycId_key" ON "reminder_states"("kycId");

-- CreateIndex
CREATE INDEX "reminder_states_nextDueAt_idx" ON "reminder_states"("nextDueAt");

-- CreateIndex
CREATE INDEX "reminder_states_exhausted_idx" ON "reminder_states"("exhausted");

-- CreateIndex
CREATE INDEX "kyc_auto_checks_kycId_idx" ON "kyc_auto_checks"("kycId");

-- CreateIndex
CREATE INDEX "kyc_auto_checks_checkKey_idx" ON "kyc_auto_checks"("checkKey");

-- CreateIndex
CREATE INDEX "kyc_document_files_fileHash_idx" ON "kyc_document_files"("fileHash");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

