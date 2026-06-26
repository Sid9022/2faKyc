// Regression tests for the security hardening bugs (Phase 8):
// B5 specifically on the frontend side.
//
// Run: node --test tests/securityHardening.test.js

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = (p) => join(ROOT, p);
const read = (p) => readFileSync(SRC(p), "utf8");

// ---------- B5: NewKycPage success card no longer displays raw URL ----------

test("B5: NewKycPage successResult stores linkId but not buyerKycUrl", () => {
  const src = read("src/reviewer/pages/NewKycPage.jsx");
  // The success state is built without buyerKycUrl.
  assert.ok(
    /setSuccessResult\(\s*\{[\s\S]*?linkId:[\s\S]*?\}\s*\)/.test(src),
    "successResult must contain linkId"
  );
  assert.ok(
    !/setSuccessResult\([\s\S]{0,200}buyerKycUrl/.test(src),
    "successResult must NOT contain buyerKycUrl — B5"
  );
});

test("B5: copyToClipboard copies the linkId, not a URL", () => {
  const src = read("src/reviewer/pages/NewKycPage.jsx");
  // The copy helper must read from successResult.linkId.
  const copyFn = src.match(
    /const\s+copyToClipboard\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*;/
  );
  assert.ok(copyFn, "copyToClipboard function must exist");
  const body = copyFn[0];
  assert.ok(
    /successResult\?\.linkId/.test(body),
    "copy must read successResult.linkId"
  );
  assert.ok(
    !/successResult\?\.buyerKycUrl/.test(body),
    "copy must NOT read successResult.buyerKycUrl"
  );
  // And the linkId value is what's written to clipboard.
  assert.ok(
    /const\s+text\s*=\s*successResult\.linkId/.test(body),
    "clipboard text must be the linkId"
  );
});

test("B5: success card markup no longer renders {successResult.buyerKycUrl}", () => {
  const src = read("src/reviewer/pages/NewKycPage.jsx");
  // The success card JSX must not reference buyerKycUrl at all.
  assert.ok(
    !/\{successResult\.buyerKycUrl\}/.test(src),
    "JSX must not render {successResult.buyerKycUrl} — B5"
  );
});
