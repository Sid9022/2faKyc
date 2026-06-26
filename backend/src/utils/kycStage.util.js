/**
 * Single source of truth for the buyer KYC state machine.
 *
 * Why this exists: the document and video services previously had
 * different (inconsistent) definitions of `isResubmissionMode`. The
 * divergence caused the buyer's "Continue to video declaration" button
 * to render in states where it shouldn't (when the video was already
 * accepted and the master was in `resubmission_submitted`). See bug
 * A15 / A1 in the audit catalog.
 *
 * The wider definition (matching the video service's) is the correct
 * one — it covers every stage where the buyer is operating inside a
 * resubmission cycle.
 */

const RESUBMISSION_STAGES = new Set([
  "resubmission_required",
  "resubmission_document_upload_in_progress",
  "resubmission_video_pending",
  "resubmission_video_declaration_started",
  "resubmission_submitted"
]);

/**
 * `FINAL_KYC_STATUSES` is exposed as an Array (not a Set) so existing
 * service code that does `FINAL_KYC_STATUSES.includes(...)` keeps
 * working. Adding it back to a Set after the regression caused a 500
 * on every buyer document load.
 */
const FINAL_KYC_STATUSES = [
  "approved",
  "rejected",
  "expired",
  "cancelled"
];

const FINAL_KYC_STATUS_SET = new Set(FINAL_KYC_STATUSES);

/**
 * True when the KYC is in any resubmission sub-state, regardless of
 * whether the document service or the video service is being asked.
 * Use this from every service that needs to gate on resubmission mode.
 */
function isResubmissionMode(kyc) {
  if (!kyc) return false;
  if (kyc.overallStatus === "resubmission_required") return true;
  if (kyc.currentStage && RESUBMISSION_STAGES.has(kyc.currentStage)) return true;
  return false;
}

/**
 * True for terminal overall statuses (no further buyer or reviewer
 * action is allowed). Used by the buyer endpoints to refuse further
 * writes and by the link handler to decide if a fresh link is needed.
 */
function isFinalKycStatus(kyc) {
  return Boolean(kyc?.overallStatus && FINAL_KYC_STATUS_SET.has(kyc.overallStatus));
}

module.exports = {
  RESUBMISSION_STAGES,
  FINAL_KYC_STATUSES,
  FINAL_KYC_STATUS_SET,
  isResubmissionMode,
  isFinalKycStatus
};
