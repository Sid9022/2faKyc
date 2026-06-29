-- Mobile hash for fast exact-match search of buyerMobile.
-- Mirrors the panHash pattern: raw mobile is never stored, only the
-- SHA-256( mobile + MOBILE_HASH_SECRET ). Lets the reviewer / admin
-- dashboards run `WHERE mobileHash = ?` to find every KYC record tied
-- to a given phone number — needed for fraud lookup when the same
-- PAN+name comes in with a new mobile.

ALTER TABLE "kyc_masters" ADD COLUMN "mobileHash" TEXT;

CREATE INDEX "kyc_masters_mobileHash_idx" ON "kyc_masters"("mobileHash");

-- Two new PurchaseEventStatus values for the duplicate-buyer rules:
--   kyc_bypassed_duplicate_buyer              — case 1: same PAN + same
--     buyerName + same mobile + existing KYC has progressed past
--     `link_sent`. The webhook is acknowledged but no new KYC is
--     created and no link is sent.
--   kyc_logged_duplicate_buyer_different_mobile — case 3: same PAN + same
--     buyerName but a DIFFERENT mobile number. A new KycMaster row is
--     written in `cancelled` state so the new mobile is searchable;
--     no buyer link / email is issued.

ALTER TYPE "PurchaseEventStatus" ADD VALUE 'kyc_bypassed_duplicate_buyer';

ALTER TYPE "PurchaseEventStatus" ADD VALUE 'kyc_logged_duplicate_buyer_different_mobile';