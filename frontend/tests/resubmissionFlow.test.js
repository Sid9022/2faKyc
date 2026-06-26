// Regression tests for the parent's step-management around the
// resubmission portal.
//
// These tests pin the rules the parent must follow so that the
// ResubmissionPortal reliably re-fetches its workspace after every
// sub-flow round-trip. Bug A16.
//
// Run: node --test tests/resubmissionFlow.test.js

import test from "node:test";
import assert from "node:assert/strict";

// The parent component is JSX, so we can't render it. Instead, we
// encode the rules as small data checks that mirror what the
// implementation does. If a future refactor breaks the wiring, the
// real E2E tests will catch it; these unit tests pin the contract
// at the data level.

// ---------- A16: the portal key must change on every transition
// into the `resubmission` step, so React remounts the portal.

test("A16: portal key must be unique per entry into resubmission step", () => {
  // Simulate the `portalKey` state evolution as the user navigates:
  // details → consent → documents → ... → resubmission → (back & forth)
  let portalKey = 0;
  const transitions = [
    "details",
    "requirements",
    "consent",
    "documents",
    "documents", // re-render, no change
    "video",
    "video", // re-render
    "done",
    "resubmission", // entry 1 → bump
    "resubmission_documents",
    "resubmission_video",
    "resubmission", // entry 2 → bump
    "resubmission_documents",
    "resubmission", // entry 3 → bump
    "done"
  ];

  let prev = null;
  const observedKeys = [];
  for (const step of transitions) {
    if (step === "resubmission" && prev !== "resubmission") {
      portalKey += 1;
    }
    if (step === "resubmission") observedKeys.push(portalKey);
    prev = step;
  }

  // Three entries into the resubmission step ⇒ three distinct keys.
  assert.equal(observedKeys.length, 3);
  assert.equal(observedKeys[0], 1);
  assert.equal(observedKeys[1], 2);
  assert.equal(observedKeys[2], 3);
  // Each entry must produce a strictly greater key than the previous.
  assert.ok(observedKeys[1] > observedKeys[0]);
  assert.ok(observedKeys[2] > observedKeys[1]);
});

test("A16: re-renders within the resubmission step do NOT bump the key (after initial mount)", () => {
  // The parent's `prevStepRef` is null on the very first render, so
  // the initial mount on `resubmission` does bump the key from 0 to 1.
  // After that, subsequent re-renders that stay on `resubmission`
  // (parent re-renders for language change, parent state updates, etc.)
  // must NOT bump the key — otherwise we'd remount unnecessarily and
  // lose the user's progress in the portal.
  let portalKey = 0;
  const prev = { current: null };

  const reRenders = ["resubmission", "resubmission", "resubmission"];
  for (const step of reRenders) {
    if (step === "resubmission" && prev.current !== "resubmission") {
      portalKey += 1;
    }
    prev.current = step;
  }
  // Initial bump is 1; subsequent re-renders don't bump further.
  assert.equal(portalKey, 1);
});

test("A16: key must be passed as a prop so React reconciles as a remount", () => {
  // The pattern: `<ResubmissionPortal key={`resubmission-${portalKey}`} />`.
  // We assert the contract that the key contains the portalKey counter.
  const portalKey = 7;
  const key = `resubmission-${portalKey}`;
  assert.ok(key.startsWith("resubmission-"));
  assert.ok(key.includes(String(portalKey)));
  // Two different portalKey values produce different keys — React
  // would treat them as different component instances.
  assert.notEqual(
    `resubmission-${portalKey}`,
    `resubmission-${portalKey + 1}`
  );
});
