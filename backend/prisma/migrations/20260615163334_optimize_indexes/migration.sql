-- DropIndex
DROP INDEX "kyc_audit_logs_action_idx";

-- DropIndex
DROP INDEX "kyc_audit_logs_actorType_idx";

-- DropIndex
DROP INDEX "kyc_audit_logs_kycId_idx";

-- CreateIndex
CREATE INDEX "email_logs_createdAt_idx" ON "email_logs"("createdAt");

-- CreateIndex
CREATE INDEX "kyc_audit_logs_kycId_createdAt_idx" ON "kyc_audit_logs"("kycId", "createdAt");

-- CreateIndex
CREATE INDEX "kyc_audit_logs_createdAt_idx" ON "kyc_audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "kyc_masters_updatedAt_idx" ON "kyc_masters"("updatedAt");

