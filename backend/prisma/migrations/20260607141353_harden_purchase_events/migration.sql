-- AlterTable
ALTER TABLE "purchase_events" ADD COLUMN     "conflictCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastConflictAt" TIMESTAMP(3),
ADD COLUMN     "lastRetriedAt" TIMESTAMP(3),
ADD COLUMN     "lastRetryType" TEXT,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0;
