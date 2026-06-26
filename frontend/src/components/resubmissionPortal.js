/**
 * Pure helpers for the buyer resubmission portal.
 *
 * Extracted from ResubmissionPortal.jsx so they're testable with the
 * built-in `node --test` runner (the component is JSX).
 *
 * Regression tests live in /frontend/tests/resubmissionPortal.test.js.
 */

/**
 * The "Documents to correct" summary tile should only render when the
 * count is greater than zero. Showing "0" reads as a warning state and
 * clutters the portal when only the video needs correction. Bug A7.
 */
function shouldShowDocumentsToCorrectTile(summary) {
  if (!summary) return false;
  const count = Number(summary.documentsNeedingResubmissionCount || 0);
  return count > 0;
}

/**
 * Detect whether the KYC went through at least one resubmission cycle.
 * Used to differentiate the "approved" terminal copy so the buyer gets
 * acknowledgement when their corrections were processed. Bug A22.
 *
 * The workspace exposes `resubmissionCycle` on each accepted document
 * and on the video declaration. A value > 0 on any of them means the
 * buyer has been through at least one correction round.
 */
function wentThroughResubmission(workspace) {
  if (!workspace) return false;

  const docs = Array.isArray(workspace.acceptedDocuments)
    ? workspace.acceptedDocuments
    : [];
  if (docs.some((doc) => Number(doc?.resubmissionCycle || 0) > 0)) {
    return true;
  }

  const video = workspace.video;
  if (video && Number(video.resubmissionCycle || 0) > 0) {
    return true;
  }

  return false;
}

/**
 * Copy variants for the "approved" terminal state. Bug A22.
 */
function approvedCopy(wentThroughResubmissionFlag) {
  return wentThroughResubmissionFlag
    ? {
        title: "Resubmission accepted",
        description:
          "Your corrections have been reviewed and accepted. Your KYC is now fully approved."
      }
    : {
        title: "KYC approved",
        description: "Your KYC has been verified and approved."
      };
}

export {
  shouldShowDocumentsToCorrectTile,
  wentThroughResubmission,
  approvedCopy
};
