// Regression tests for the smaller correctness bugs (Phase 6):
// A2, A9, A12, A13, A14.
//
// Run: node --test tests/smallBugs.test.js

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- A2: resubmission email surfaces accepted items ----------

const EMAIL_TPL_PATH = join(ROOT, "../backend/src/modules/email/email.templates.js");
const REVIEWER_SVC_PATH = join(ROOT, "../backend/src/modules/reviewer/reviewer.service.js");

test("A2: resubmissionEmail template renders the accepted-items block when provided", () => {
  const { resubmissionEmail } = loadCjs(EMAIL_TPL_PATH);
  const out = resubmissionEmail({
    buyerName: "Aryan",
    kycUrl: "https://x/y",
    failedItems: ["PAN Card"],
    acceptedItems: ["Aadhaar", "Live Video Declaration"]
  });
  const html = Array.isArray(out.body) ? out.body.join("") : out.body;
  assert.ok(html.includes("PAN Card"), "failed item must be listed");
  assert.ok(html.includes("Aadhaar"), "accepted item must be listed");
  assert.ok(html.includes("Live Video Declaration"), "accepted video must be listed");
  assert.ok(
    html.includes("Already accepted") || html.includes("already accepted"),
    "accepted items block must be labelled"
  );
});

test("A2: resubmissionEmail template omits the accepted block when none are provided", () => {
  const { resubmissionEmail } = loadCjs(EMAIL_TPL_PATH);
  const out = resubmissionEmail({
    buyerName: "Aryan",
    kycUrl: "https://x/y",
    failedItems: ["PAN Card"],
    acceptedItems: []
  });
  const html = Array.isArray(out.body) ? out.body.join("") : out.body;
  assert.ok(!html.includes("Already accepted"), "no accepted block when list is empty");
  assert.ok(html.includes("PAN Card"), "failed item still listed");
});

test("A2: reviewer service computes acceptedItems for resubmission decision", () => {
  const src = readFileSync(REVIEWER_SVC_PATH, "utf8");
  // The function must compute and forward `acceptedItems` only on the
  // resubmission path, not on approved/rejected (those use a different
  // template).
  assert.ok(
    src.includes("acceptedItems") && src.includes("decision === \"resubmission_required\""),
    "reviewer service must compute acceptedItems on the resubmission path"
  );
  assert.ok(
    src.includes("resubmissionEmail({") && src.includes("acceptedItems"),
    "resubmissionEmail must receive the acceptedItems"
  );
});

// ---------- A9: Skip button hidden in resubmission mode ----------

test("A9: handleSkipOptional guard includes isResubmissionMode", () => {
  const src = readFileSync(
    join(ROOT, "src/components/DocumentUploadWizard.jsx"),
    "utf8"
  );
  // The handler must check isResubmissionMode AND the two Skip buttons
  // (mobile + desktop) must both gate on it.
  assert.ok(
    /isResubmissionMode\s*\|\|/.test(src) ||
      /isResubmissionMode[\s\S]{0,80}\}/.test(src),
    "handleSkipOptional guard must mention isResubmissionMode"
  );
  const skipButtonPattern = /!\s*activeStep\.isRequired\s*&&\s*!\s*isResubmissionMode/;
  const matches = src.match(new RegExp(skipButtonPattern.source, "g")) || [];
  assert.ok(
    matches.length >= 2,
    `expected both Skip buttons (mobile + desktop) to be gated on !isResubmissionMode, found ${matches.length}`
  );
});

// ---------- A12: isSubmitted effect does not fire mid-recording ----------

test("A12: isSubmitted effect explicitly guards against isRecording", () => {
  const src = readFileSync(
    join(ROOT, "src/components/VideoDeclarationScreen.jsx"),
    "utf8"
  );
  // Find the useEffect that auto-routes to "done" on isSubmitted.
  // It must include !isRecording in the guard and in the deps.
  assert.ok(
    /isSubmitted\s*&&\s*!\s*isRecording/.test(src),
    "auto-route to done must guard against isRecording (A12)"
  );
  // And the effect dep must include isRecording.
  const effectMatch = src.match(
    /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?isSubmitted\s*&&\s*!\s*isRecording[\s\S]*?\},\s*\[isSubmitted,?[^\]]*\]/
  );
  assert.ok(effectMatch, "isRecording must be in the effect's deps array");
});

// ---------- A13: sessionStorage persistence ----------

test("A13: VideoDeclarationScreen persists screen + declaration + form to sessionStorage", () => {
  const src = readFileSync(
    join(ROOT, "src/components/VideoDeclarationScreen.jsx"),
    "utf8"
  );
  // Required building blocks:
  //   - sessionStorage read on init
  //   - sessionStorage write in setters
  //   - token-scoped key
  //   - cleanup on successful submit
  assert.ok(src.includes("sessionStorage"), "component must use sessionStorage");
  assert.ok(
    src.includes("loadPersisted") && src.includes("savePersisted"),
    "helper functions must exist"
  );
  assert.ok(
    src.includes("kyc-video-state:") || src.includes("kycVideoState"),
    "storage key must be token-scoped"
  );
  // After successful submit, the persisted state should be cleared.
  assert.ok(
    /savePersisted\([^,]+,\s*null\)/.test(src),
    "component must clear persisted state after submit (savePersisted(key, null))"
  );
});

// ---------- A14: stopCamera runs on screen transition ----------

test("A14: camera stream is released only when LEAVING camera/recording screens", () => {
  const src = readFileSync(
    join(ROOT, "src/components/VideoDeclarationScreen.jsx"),
    "utf8"
  );

  // The component must track the previous screen so the effect body
  // can distinguish a camera→recording transition (keep stream alive)
  // from a recording→preview/done transition (release stream).
  assert.ok(
    /prevScreenRef/.test(src),
    "must track previous screen with a ref so cleanup knows whether the buyer is moving between camera/recording or leaving both"
  );

  // The body of the screen effect must guard stopCamera() with a check
  // that the buyer is actually leaving the camera/recording screens —
  // not transitioning between them.
  const screenEffectMatch = src.match(
    /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?screen\s*===\s*"camera"[\s\S]*?prevScreenRef\.current\s*=\s*screen;[\s\S]*?\},\s*\[screen,?[^\]]*\]/
  );
  assert.ok(
    screenEffectMatch,
    "screen effect must update prevScreenRef and gate stopCamera on the previous screen"
  );
  // The stopCamera() call must be guarded by `wasInCameraOrRecording && !isInCameraOrRecording`
  // (or equivalent) so it never fires on camera→recording.
  assert.ok(
    /wasInCameraOrRecording[\s\S]*?stopCamera\(\)/.test(src) ||
      /prevScreenRef\.current[\s\S]*?stopCamera\(\)/.test(src),
    "stopCamera() must be guarded by a previous-screen check (A14+)"
  );

  // The component must also have a final unmount safety-net that
  // releases the camera stream when the component is torn down.
  assert.ok(
    /return\s*\(\s*\)\s*=>\s*stopCamera\(\s*\)/.test(src),
    "component must release the camera on unmount"
  );
});

// ---------- Helper: load a CommonJS module from ESM ----------

function loadCjs(absPath) {
  // Node's ESM loader exposes `createRequire` so we can `require()`
  // the CJS module without going through the package.json `exports`
  // resolution (which might not exist for legacy files).
  const req = createRequire(absPath);
  return req(absPath);
}

// ---------- Regression 2026-06-25: blank VideoDeclarationScreen ----------
//
// Bug: the screen-state useState was named `screenRaw` but the JSX
// referenced `screen` (undefined). Every `{screen === "..." && ...}`
// evaluated to false, so the component rendered an empty <div> — the
// buyer saw a blank content area with only the sidebar visible.
// Same shape applied to `formRaw` vs `form`.

test("VideoDeclarationScreen state variables are named to match JSX usage (regression 2026-06-25)", () => {
  const src = readFileSync(
    join(ROOT, "src/components/VideoDeclarationScreen.jsx"),
    "utf8"
  );

  // The JSX uses `screen` in the render switches — make sure the state
  // declaration produces a binding named exactly `screen` (not `screenRaw`).
  const screenDecl = src.match(/const\s+\[\s*(\w+)\s*,\s*setScreenRaw\s*\]/);
  assert.ok(screenDecl, "screen state must use setScreenRaw as the setter");
  assert.equal(
    screenDecl[1],
    "screen",
    `screen state must be destructured into a variable named 'screen' (was '${screenDecl[1]}')`
  );

  // Same check for form.
  const formDecl = src.match(/const\s+\[\s*(\w+)\s*,\s*setFormRaw\s*\]/);
  assert.ok(formDecl, "form state must use setFormRaw as the setter");
  assert.equal(
    formDecl[1],
    "form",
    `form state must be destructured into a variable named 'form' (was '${formDecl[1]}')`
  );

  // And `declaration` was already correct — assert it stayed correct.
  const declDecl = src.match(/const\s+\[\s*(\w+)\s*,\s*setDeclarationRaw\s*\]/);
  assert.ok(declDecl, "declaration state must use setDeclarationRaw as the setter");
  assert.equal(
    declDecl[1],
    "declaration",
    `declaration state must be destructured into a variable named 'declaration' (was '${declDecl[1]}')`
  );

  // Sanity: the render switches reference `screen` directly, not `screenRaw`.
  assert.ok(
    /\{screen\s*===\s*"permissions"/.test(src),
    "render switches must reference `screen` (the renamed state)"
  );
  assert.ok(
    !/\{screenRaw\s*===/.test(src),
    "render switches must NOT reference the old `screenRaw` name"
  );
});
