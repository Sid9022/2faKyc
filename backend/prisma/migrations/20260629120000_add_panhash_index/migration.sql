-- panHash lost its UNIQUE constraint when duplicate PANs were allowed
-- (20260626101807_allow_duplicate_pans). Reviewer/admin PAN search still
-- runs `WHERE panHash = ?` for an exact lookup, so add a plain (non-unique)
-- index to keep that query fast as the table grows.

CREATE INDEX "kyc_masters_panHash_idx" ON "kyc_masters"("panHash");
