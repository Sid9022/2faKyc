-- CreateTable
CREATE TABLE "kyc_consents" (
    "id" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "consentVersion" TEXT NOT NULL DEFAULT 'v1',
    "acceptedTerms" BOOLEAN NOT NULL DEFAULT false,
    "acceptedPrivacy" BOOLEAN NOT NULL DEFAULT false,
    "acceptedDocumentProcessing" BOOLEAN NOT NULL DEFAULT false,
    "acceptedVideoRecording" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kyc_consents_kycId_key" ON "kyc_consents"("kycId");

-- CreateIndex
CREATE INDEX "kyc_consents_language_idx" ON "kyc_consents"("language");

-- AddForeignKey
ALTER TABLE "kyc_consents" ADD CONSTRAINT "kyc_consents_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "kyc_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
