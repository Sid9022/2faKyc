// Regression tests for the stale-data race bugs (Phase 7):
// B7, B8, B9, B10.
//
// Run: node --test tests/staleDataRaces.test.js

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = (p) => join(ROOT, p);

function read(p) {
  return readFileSync(SRC(p), "utf8");
}

// ---------- B7: ReviewerCaseDetailPage ignores stale responses on KYC switch ----------

test("B7: ReviewerCaseDetailPage has a request-sequence guard", () => {
  const src = read("src/reviewer/pages/ReviewerCaseDetailPage.jsx");

  // The component must increment a sequence on every load and refuse
  // to commit a response whose sequence no longer matches.
  assert.ok(
    /requestSeqRef/.test(src) || /requestSeq/.test(src),
    "component must maintain a request sequence counter"
  );
  assert.ok(
    /myRequest\s*!==\s*requestSeqRef\.current/.test(src),
    "responses must be discarded when a newer request has started"
  );
  assert.ok(/\+\+requestSeqRef\.current/.test(src), "counter must increment per call");
});

test("B7: ReviewerCaseDetailPage error path also discards stale responses", () => {
  const src = read("src/reviewer/pages/ReviewerCaseDetailPage.jsx");
  // The catch branch must also check the sequence, not just the success
  // branch — otherwise an error from an older request could overwrite
  // the current view's error message.
  const catchMatches = src.match(
    /catch\s*\(\s*err\s*\)\s*\{[\s\S]*?myRequest\s*!==\s*requestSeqRef\.current[\s\S]*?\}/g
  );
  assert.ok(
    catchMatches && catchMatches.length >= 1,
    "catch branch must discard stale responses"
  );
});

// ---------- B8: ReviewerCaseDetailPage clears detail on error ----------

test("B8: ReviewerCaseDetailPage clears detail on error path", () => {
  const src = read("src/reviewer/pages/ReviewerCaseDetailPage.jsx");
  // The catch block and the !result.success branch must both clear
  // detail so the previous case's PII doesn't bleed into the error
  // banner.
  const successBranch =
    /if\s*\(\s*!\s*result\.success\s*\)\s*\{[\s\S]*?setDetail\(null\)[\s\S]*?\}/;
  const catchBranch = /catch\s*\([^)]+\)\s*\{[\s\S]*?setDetail\(null\)[\s\S]*?\}/;
  assert.ok(successBranch.test(src), "must clear detail in the !success branch");
  assert.ok(catchBranch.test(src), "must clear detail in the catch branch");
});

// ---------- B9: DocumentUploadWizard clears workspace on error ----------

test("B9: DocumentUploadWizard clears workspace on error", () => {
  const src = read("src/components/DocumentUploadWizard.jsx");
  const body = extractFunctionBody(src, "loadWorkspace");
  assert.ok(body, "loadWorkspace function must exist");
  // The !result.success branch must setWorkspace(null).
  assert.ok(
    /if\s*\(\s*!\s*result\.success\s*\)\s*\{[\s\S]*?setWorkspace\(null\)[\s\S]*?\}/.test(
      body
    ),
    "loadWorkspace must clear workspace on !result.success (B9)"
  );
  // The catch branch must also clear it.
  assert.ok(
    /catch\s*\([^)]*\)\s*\{[\s\S]*?setWorkspace\(null\)[\s\S]*?\}/.test(body),
    "loadWorkspace must clear workspace in catch (B9)"
  );
  // And the function should clear it on both error paths.
  const nullClears = (body.match(/setWorkspace\(null\)/g) || []).length;
  assert.ok(
    nullClears >= 2,
    `expected >=2 setWorkspace(null) calls (one per error path); found ${nullClears}`
  );
});

// ---------- B10: ResubmissionPortal clears workspace on error ----------

test("B10: ResubmissionPortal clears workspace on error", () => {
  const src = read("src/components/ResubmissionPortal.jsx");
  const body = extractFunctionBody(src, "loadWorkspace");
  assert.ok(body, "loadWorkspace function must exist");
  assert.ok(
    /if\s*\(\s*!\s*result\.success\s*\)\s*\{[\s\S]*?setWorkspace\(null\)[\s\S]*?\}/.test(
      body
    ),
    "loadWorkspace must clear workspace on !result.success (B10)"
  );
  assert.ok(
    /catch\s*\([^)]*\)\s*\{[\s\S]*?setWorkspace\(null\)[\s\S]*?\}/.test(body),
    "loadWorkspace must clear workspace in catch (B10)"
  );
  const nullClears = (body.match(/setWorkspace\(null\)/g) || []).length;
  assert.ok(
    nullClears >= 2,
    `expected >=2 setWorkspace(null) calls; found ${nullClears}`
  );
});

// ---------- Helper: extract a top-level function body from JSX ----------

function extractFunctionBody(src, name) {
  // Find the function header, then walk braces to find the matching
  // closing brace. The simple non-greedy regex stops at the first `\n\s*}`
  // which is usually an inner block; we need depth tracking.
  const headerRe = new RegExp(
    `(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`
  );
  const headerMatch = src.match(headerRe);
  if (!headerMatch) return null;

  const startIdx = headerMatch.index + headerMatch[0].length - 1; // at `{`
  let depth = 1;
  let i = startIdx + 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  if (depth !== 0) return null;
  return src.slice(startIdx + 1, i - 1);
}

// ---------- Simulated B7 race: stale response must not overwrite current view ----------

test("B7 (simulated): a stale response arriving after a fresh one is ignored", () => {
  // We simulate the race with a tiny in-memory model:
  //   1. Buyer opens Case A → request A starts
  //   2. Buyer switches to Case B → request B starts, requestSeqRef becomes 2
  //   3. Request A's response arrives → myRequest (1) !== current (2) → ignored
  //   4. Request B's response arrives → myRequest (2) === current (2) → committed
  let currentKyc = null;
  let requestSeqRef = 0;
  const pending = [];

  async function loadDetail(kycId, networkDelayMs) {
    const myRequest = ++requestSeqRef;
    // Simulate network latency. The response resolves later.
    await new Promise((resolve) => setTimeout(resolve, networkDelayMs));
    // Discard if a newer request has been issued.
    if (myRequest !== requestSeqRef) return;
    currentKyc = kycId;
  }

  // Buyer opens Case A (slow), then quickly switches to Case B (fast).
  const reqA = loadDetail("A", 50);
  const reqB = loadDetail("B", 10);
  return Promise.all([reqA, reqB]).then(() => {
    assert.equal(
      currentKyc,
      "B",
      "stale response from A must not overwrite the view; current view must be B"
    );
    // requestSeqRef must have been incremented twice (once per call).
    assert.equal(requestSeqRef, 2);
  });
});
