-- AlterTable
ALTER TABLE "kyc_document_submissions" ADD COLUMN     "resubmissionCycle" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resubmissionRequestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "kyc_video_declarations" ADD COLUMN     "resubmissionCycle" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resubmissionRequestedAt" TIMESTAMP(3);
