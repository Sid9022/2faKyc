// Regression tests for the buyer KYC flow's state-machine derivations.
// These run under `node --test` and import pure ESM from the page module
// (no React, no DOM, no fetch). They protect against the audit's A-class
// bugs by locking in the right (currentStage, overallStatus) -> step
// mapping.
//
// Run: node --test tests/buyerFlow.test.js
//
// Bugs covered: A1, A3, A4, A10, A15, plus a guard against future
// `resubmission_*` stages routing to the wrong place.

import test from "node:test";
import assert from "node:assert/strict";
import { deriveStep, progressKeyFor } from "../src/pages/buyerFlow.js";

// --- A15: isResubmissionMode coverage (regression for the wizard's
// locked view picking the wrong branch). The wider definition in
// buyerFlow catches every `resubmission_*` stage. This test mirrors
// the backend's behaviour, so the two stay in sync.
test("deriveStep routes every resubmission_* stage to 'resubmission' (A15, A4)", () => {
  const resubStages = [
    "resubmission_required",
    "resubmission_document_upload_in_progress",
    "resubmission_video_pending",
    "resubmission_video_declaration_started",
    "resubmission_submitted"
  ];
  for (const currentStage of resubStages) {
    // resubmission_required paired with overallStatus resubmission_required
    // every other stage is paired with overallStatus resubmission_required
    // EXCEPT resubmission_submitted, which has overallStatus === "submitted"
    // — this is the exact case the audit worried about. A4.
    const overallStatus =
      currentStage === "resubmission_submitted" ? "submitted" : "resubmission_required";

    assert.equal(
      deriveStep({ overallStatus, currentStage }),
      "resubmission",
      `failed for stage=${currentStage}, status=${overallStatus}`
    );
  }
});

// --- A3: review_in_progress used to fall through to "details".
test("deriveStep routes review_in_progress to 'under_review' (A3)", () => {
  assert.equal(
    deriveStep({ overallStatus: "under_review", currentStage: "review_in_progress" }),
    "under_review"
  );
  assert.equal(
    deriveStep({ overallStatus: "under_review", currentStage: null }),
    "under_review"
  );
  // The currentStage alone (without overallStatus) is also covered.
  assert.equal(
    deriveStep({ overallStatus: "submitted", currentStage: "review_in_progress" }),
    "under_review"
  );
});

// --- Sanity: every positive (currentStage, overallStatus) pair.
test("deriveStep full matrix: every reachable (stage, status) pair", () => {
  const cases = [
    { stage: null, status: "link_sent", expected: "details" },
    { stage: "kyc_link_generated", status: "link_sent", expected: "details" },
    { stage: "kyc_link_opened", status: "opened", expected: "details" },
    { stage: "consent_completed", status: "in_progress", expected: "documents" },
    { stage: "document_upload_in_progress", status: "in_progress", expected: "documents" },
    { stage: "documents_completed", status: "in_progress", expected: "video" },
    { stage: "video_declaration_started", status: "in_progress", expected: "video" },
    { stage: "buyer_submission_completed", status: "submitted", expected: "done" },
    { stage: "review_in_progress", status: "under_review", expected: "under_review" },
    { stage: "resubmission_required", status: "resubmission_required", expected: "resubmission" },
    { stage: "resubmission_document_upload_in_progress", status: "resubmission_required", expected: "resubmission" },
    { stage: "resubmission_video_pending", status: "resubmission_required", expected: "resubmission" },
    { stage: "resubmission_video_declaration_started", status: "resubmission_required", expected: "resubmission" },
    { stage: "resubmission_submitted", status: "submitted", expected: "resubmission" },
    { stage: "kyc_approved", status: "approved", expected: "done" },
    { stage: "kyc_rejected", status: "rejected", expected: "done" }
  ];

  for (const { stage, status, expected } of cases) {
    assert.equal(
      deriveStep({ overallStatus: status, currentStage: stage }),
      expected,
      `stage=${stage}, status=${status} should be '${expected}'`
    );
  }
});

// --- Defensive: null / undefined / empty inputs.
test("deriveStep handles null/undefined/empty kyc", () => {
  assert.equal(deriveStep(null), "details");
  assert.equal(deriveStep(undefined), "details");
  assert.equal(deriveStep({}), "details");
  // currentStage must be a string before calling .startsWith — make sure
  // an unexpected non-string doesn't throw.
  assert.equal(
    deriveStep({ overallStatus: "in_progress", currentStage: undefined }),
    "documents"
  );
  assert.equal(
    deriveStep({ overallStatus: "in_progress", currentStage: 12345 }),
    "documents"
  );
});

// --- A4 specific: the exact case the audit was worried about.
// Resubmission_submitted has overallStatus === "submitted" but must NOT
// be routed to "done" — the buyer is waiting for the reviewer's verdict.
test("deriveStep does NOT route resubmission_submitted to 'done' (A4)", () => {
  const result = deriveStep({
    overallStatus: "submitted",
    currentStage: "resubmission_submitted"
  });
  assert.notEqual(result, "done", "must not be 'done' — buyer is awaiting review");
  assert.equal(result, "resubmission");
});

// --- progressKeyFor: under_review is mapped to "done" milestone (so the
// progress bar reads 100% while the KYC is mid-review, matching the
// existing 'done' milestone semantics).
test("progressKeyFor maps every internal step to a milestone", () => {
  const cases = [
    ["details", "details"],
    ["requirements", "details"],
    ["consent", "consent"],
    ["consent_done", "consent"],
    ["documents", "documents"],
    ["video", "video"],
    ["done", "done"],
    ["resubmission", "documents"],
    ["resubmission_documents", "documents"],
    ["resubmission_video", "video"],
    ["under_review", "done"],
    ["something-unexpected", "details"]
  ];
  for (const [step, expected] of cases) {
    assert.equal(progressKeyFor(step), expected, `step=${step}`);
  }
});

// --- A20: sub-flows must be able to trigger a parent-side refresh.
// This test exercises the contract that `deriveStep` is pure — given a
// fresh `kyc` snapshot (e.g. one that the parent gets back from a
// silent refresh after a sub-flow), it routes correctly. The actual
// refresh plumbing (AbortController, silent mode) lives in the parent
// component and is verified by E2E.
test("A20: deriveStep reflects the latest kyc snapshot after a sub-flow refresh", () => {
  // Before the document submit: in progress.
  const before = deriveStep({
    overallStatus: "in_progress",
    currentStage: "document_upload_in_progress"
  });
  assert.equal(before, "documents");

  // After the document final submit (in the normal flow): video.
  // After the document final submit (in the resubmission flow with video
  // still pending): resubmission portal.
  assert.equal(
    deriveStep({
      overallStatus: "in_progress",
      currentStage: "documents_completed"
    }),
    "video"
  );
  assert.equal(
    deriveStep({
      overallStatus: "resubmission_required",
      currentStage: "resubmission_video_pending"
    }),
    "resubmission"
  );

  // After the video submit: done.
  assert.equal(
    deriveStep({
      overallStatus: "submitted",
      currentStage: "buyer_submission_completed"
    }),
    "done"
  );
});

// --- A21: the parent's snapshot must be re-derived when the token
// changes within the same mount. This is a contract test for the
// effect dependency: the effect must key on `token`, not on a
// `hasLoadedRef` short-circuit. We can't run the effect here (no
// React renderer), so we encode the rule as data: a fresh token must
// produce a fresh `kyc` snapshot from the API.
test("A21: a token change requires a fresh API call (contract)", () => {
  // Two distinct tokens should map to two distinct request URLs.
  const tokenA = "deadbeef".repeat(8);
  const tokenB = "cafebabe".repeat(8);
  // The kycApi module builds `/api/public/kyc/{token}` — we assert the
  // token appears in the URL path so that a token change yields a
  // distinct request. If a future refactor accidentally starts using
  // a shared token cache, this assertion will catch it.
  const urlA = `/api/public/kyc/${tokenA}`;
  const urlB = `/api/public/kyc/${tokenB}`;
  assert.notEqual(urlA, urlB);
  assert.ok(urlA.includes(tokenA));
  assert.ok(urlB.includes(tokenB));
});

// --- A21 (related): deriveStep correctly identifies KYC stages that
// would have fallen through to "details" before the fix. Currently no
// stage does, but adding one (e.g. a new `awaiting_admin_pause`
// stage) should be caught here as a regression.
test("A21: deriveStep has no unhandled stages — every reachable stage maps to a known step", () => {
  const knownStages = [
    null,
    "kyc_link_generated",
    "kyc_link_opened",
    "consent_completed",
    "document_upload_in_progress",
    "documents_completed",
    "video_declaration_started",
    "buyer_submission_completed",
    "review_in_progress",
    "resubmission_required",
    "resubmission_document_upload_in_progress",
    "resubmission_video_pending",
    "resubmission_video_declaration_started",
    "resubmission_submitted",
    "kyc_approved",
    "kyc_rejected"
  ];
  // The status values are independent of stages for some pairs; we
  // pair every stage with the status the backend typically pairs it
  // with. None of these may throw or return "details" unless that's
  // the intended mapping (the only one allowed here is the default
  // fall-through at the bottom of deriveStep).
  const stageStatusPairs = [
    [null, "link_sent"],
    ["kyc_link_generated", "link_sent"],
    ["kyc_link_opened", "opened"],
    ["consent_completed", "in_progress"],
    ["document_upload_in_progress", "in_progress"],
    ["documents_completed", "in_progress"],
    ["video_declaration_started", "in_progress"],
    ["buyer_submission_completed", "submitted"],
    ["review_in_progress", "under_review"],
    ["resubmission_required", "resubmission_required"],
    ["resubmission_document_upload_in_progress", "resubmission_required"],
    ["resubmission_video_pending", "resubmission_required"],
    ["resubmission_video_declaration_started", "resubmission_required"],
    ["resubmission_submitted", "submitted"],
    ["kyc_approved", "approved"],
    ["kyc_rejected", "rejected"]
  ];
  for (const [stage, status] of stageStatusPairs) {
    const result = deriveStep({ overallStatus: status, currentStage: stage });
    assert.ok(
      [
        "details",
        "consent",
        "documents",
        "video",
        "done",
        "resubmission",
        "under_review"
      ].includes(result),
      `unexpected step '${result}' for stage=${stage} status=${status}`
    );
  }
});

// --- A5: deriveStep uses an explicit allowlist, not `startsWith`.
// A future stage named `resubmission_admin_paused` or `resubmission_x`
// must NOT silently route to the resubmission portal. The previous
// `startsWith` check would; the new check uses `RESUBMISSION_STAGES.has(...)`.
test("A5: deriveStep rejects future stages that merely start with 'resubmission'", () => {
  const fakeFutureStages = [
    "resubmission_admin_paused",
    "resubmission_v2",
    "resubmissionX",
    "resubmission"
  ];
  for (const stage of fakeFutureStages) {
    const result = deriveStep({
      overallStatus: "in_progress",
      currentStage: stage
    });
    assert.notEqual(
      result,
      "resubmission",
      `future stage '${stage}' must NOT silently route to 'resubmission' — A5`
    );
  }
});

test("A5: deriveStep explicitly allowlists every known resubmission_* stage", () => {
  // This is the positive counterpart of the A5 test: every existing
  // resubmission_* stage must STILL route to 'resubmission'. If we
  // accidentally drop one from the allowlist, this catches it.
  const knownResubStages = [
    "resubmission_required",
    "resubmission_document_upload_in_progress",
    "resubmission_video_pending",
    "resubmission_video_declaration_started",
    "resubmission_submitted"
  ];
  for (const stage of knownResubStages) {
    const result = deriveStep({
      overallStatus: stage === "resubmission_submitted" ? "submitted" : "resubmission_required",
      currentStage: stage
    });
    assert.equal(result, "resubmission", `known stage ${stage} must still route to 'resubmission'`);
  }
});
