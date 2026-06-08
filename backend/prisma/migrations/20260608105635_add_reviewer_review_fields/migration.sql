-- CreateEnum
CREATE TYPE "KycFinalDecision" AS ENUM ('approved', 'resubmission_required', 'rejected');

-- AlterEnum
ALTER TYPE "KycVideoStatus" ADD VALUE 'resubmission_required';

-- AlterTable
ALTER TABLE "kyc_document_submissions" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT;

-- AlterTable
ALTER TABLE "kyc_video_declarations" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "reviewerRemarks" TEXT;

-- CreateTable
CREATE TABLE "kyc_final_reviews" (
    "id" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "decision" "KycFinalDecision" NOT NULL,
    "remarks" TEXT,
    "reviewedBy" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_final_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kyc_final_reviews_kycId_idx" ON "kyc_final_reviews"("kycId");

-- CreateIndex
CREATE INDEX "kyc_final_reviews_decision_idx" ON "kyc_final_reviews"("decision");

-- AddForeignKey
ALTER TABLE "kyc_final_reviews" ADD CONSTRAINT "kyc_final_reviews_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "kyc_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
