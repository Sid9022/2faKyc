-- CreateEnum
CREATE TYPE "KycLinkStatus" AS ENUM ('active', 'expired', 'revoked');

-- CreateTable
CREATE TABLE "kyc_links" (
    "id" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "KycLinkStatus" NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "firstClickedAt" TIMESTAMP(3),
    "lastClickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_link_click_logs" (
    "id" TEXT NOT NULL,
    "kycLinkId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_link_click_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kyc_links_tokenHash_key" ON "kyc_links"("tokenHash");

-- CreateIndex
CREATE INDEX "kyc_links_kycId_idx" ON "kyc_links"("kycId");

-- CreateIndex
CREATE INDEX "kyc_links_status_idx" ON "kyc_links"("status");

-- CreateIndex
CREATE INDEX "kyc_links_expiresAt_idx" ON "kyc_links"("expiresAt");

-- CreateIndex
CREATE INDEX "kyc_link_click_logs_kycLinkId_idx" ON "kyc_link_click_logs"("kycLinkId");

-- AddForeignKey
ALTER TABLE "kyc_links" ADD CONSTRAINT "kyc_links_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "kyc_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_link_click_logs" ADD CONSTRAINT "kyc_link_click_logs_kycLinkId_fkey" FOREIGN KEY ("kycLinkId") REFERENCES "kyc_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
