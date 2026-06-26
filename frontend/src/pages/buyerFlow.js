/**
 * Pure helpers for the buyer KYC flow's state-machine step derivation.
 *
 * Extracted from KycStartPage.jsx so they're testable with `node --test`
 * (the React component is JSX, which the built-in runner can't parse).
 *
 * Regression tests live in /frontend/tests/buyerFlow.test.js.
 */

// Bug A5: explicit allowlist of resubmission stages. The previous
// implementation used `currentStage.startsWith("resubmission")` which
// is too coarse — any future stage named like
// `resubmission_admin_paused` or `resubmission_x` would silently route
// to the buyer resubmission portal. Future additions must update both
// this set AND the backend's `RESUBMISSION_STAGES` in
// `utils/kycStage.util.js` together.
const RESUBMISSION_STAGES = new Set([
  "resubmission_required",
  "resubmission_document_upload_in_progress",
  "resubmission_video_pending",
  "resubmission_video_declaration_started",
  "resubmission_submitted"
]);

/**
 * Map a KYC master's (currentStage, overallStatus) pair to the buyer-UI
 * step the page should land on.
 *
 * Decision order is significant — do not reorder without re-running the
 * regression suite, especially the resubmission_* tests. See bug A4 in
 * the audit catalog.
 */
function deriveStep(kyc) {
  if (!kyc) return "details";

  // 1. Resubmission cycle: any stage in `RESUBMISSION_STAGES` OR
  //    `overallStatus === "resubmission_required"`. This MUST come
  //    before the "done" branch because `resubmission_submitted` also
  //    has `overallStatus === "submitted"` and would otherwise be
  //    misrouted to the "done" view. Bug A4.
  if (
    kyc.overallStatus === "resubmission_required" ||
    (typeof kyc.currentStage === "string" &&
      RESUBMISSION_STAGES.has(kyc.currentStage))
  ) {
    return "resubmission";
  }

  // 2. Reviewer opened the case but hasn't decided yet. Buyer's link
  //    is still active (only terminal decisions revoke it), so without
  //    this branch the buyer would fall through to "details" and see a
  //    "Next: required documents" button that does nothing. Bug A3.
  if (
    kyc.overallStatus === "under_review" ||
    kyc.currentStage === "review_in_progress"
  ) {
    return "under_review";
  }

  // 3. Terminal / awaiting-review: stay on the completion view.
  if (
    kyc.overallStatus === "submitted" ||
    kyc.overallStatus === "approved" ||
    kyc.overallStatus === "rejected" ||
    kyc.currentStage === "buyer_submission_completed"
  ) {
    return "done";
  }

  // 4. Documents done, video pending or in progress.
  if (
    kyc.currentStage === "documents_completed" ||
    kyc.currentStage === "video_declaration_started"
  ) {
    return "video";
  }

  // 5. Document sub-flow (consent done, or first document saved).
  if (
    kyc.currentStage === "consent_completed" ||
    kyc.currentStage === "document_upload_in_progress"
  ) {
    return "documents";
  }

  // 6. Generic in-progress: default to documents.
  if (kyc.overallStatus === "in_progress") {
    return "documents";
  }

  // 7. Anything else: welcome screen.
  return "details";
}

/**
 * Map an internal step name to the BuyerLayout milestone key that
 * drives the progress bar. Keeps the % clean: 20/40/60/80/100.
 */
function progressKeyFor(step) {
  if (step === "details" || step === "requirements") return "details";
  if (step === "consent" || step === "consent_done") return "consent";
  if (step === "resubmission" || step === "resubmission_documents") {
    return "documents";
  }
  if (step === "resubmission_video") return "video";
  if (
    step === "documents" ||
    step === "video" ||
    step === "done" ||
    step === "under_review"
  ) {
    return step === "under_review" ? "done" : step;
  }
  return "details";
}

export { deriveStep, progressKeyFor };
