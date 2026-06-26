const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  validatePAN,
  detectEntityFromPAN,
  maskPAN
} = require("../src/modules/kyc/pan.utils");
const {
  encryptField,
  decryptField,
  maskEmail,
  maskMobile,
  sha256
} = require("../src/utils/crypto.util");
const {
  validateDocumentFile,
  validateVideoFile
} = require("../src/utils/fileValidation.util");
const { nameSimilarity } = require("../src/modules/auto-checks/autoChecks.service");
const { lookupIpGeolocation } = require("../src/utils/ipGeolocation.util");
const {
  isResubmissionMode,
  isFinalKycStatus,
  RESUBMISSION_STAGES,
  FINAL_KYC_STATUSES
} = require("../src/utils/kycStage.util");

// ---------- PAN utils ----------

test("PAN validation accepts valid PAN and normalizes case", () => {
  const result = validatePAN("abcpe1234f");
  assert.equal(result.isValid, true);
  assert.equal(result.normalizedPAN, "ABCPE1234F");
});

test("PAN validation rejects malformed PANs", () => {
  for (const bad of ["ABC", "ABCDE12345", "1BCPE1234F", "ABCPE1234", ""]) {
    assert.equal(validatePAN(bad).isValid, false, `should reject ${bad}`);
  }
});

test("entity detection maps 4th character", () => {
  assert.equal(detectEntityFromPAN("ABCPE1234F").entity.key, "individual");
  assert.equal(detectEntityFromPAN("ABCCE1234F").entity.key, "company");
  assert.equal(detectEntityFromPAN("ABCFE1234F").entity.key, "firm_llp");
  assert.equal(detectEntityFromPAN("ABCXE1234F").success, false);
});

test("PAN masking hides middle characters", () => {
  assert.equal(maskPAN("ABCPE1234F"), "ABCP****4F");
  assert.equal(maskPAN("invalid"), null);
});

// ---------- crypto utils ----------

test("field encryption round-trips", () => {
  const cipher = encryptField("buyer@example.com");
  assert.ok(cipher.startsWith("enc:v1:"));
  assert.equal(decryptField(cipher), "buyer@example.com");
});

test("decryptField passes through legacy plaintext", () => {
  assert.equal(decryptField("plain@example.com"), "plain@example.com");
  assert.equal(decryptField(null), null);
});

test("two encryptions of the same value differ (random IV)", () => {
  assert.notEqual(encryptField("same"), encryptField("same"));
});

test("email/mobile masking", () => {
  assert.equal(maskEmail(""), "");
  assert.equal(maskEmail(null), "");
  assert.equal(maskEmail(undefined), "");
  assert.equal(maskEmail("aryan@test.com"), "a***n@test.com");
  // Local part of length 1 is fully masked (single "*").
  assert.equal(maskEmail("a@b.com"), "*@b.com");
  assert.equal(maskEmail("aryan.sharma@2factor.in"), "a***a@2factor.in");
  assert.equal(maskMobile("9876543210"), "******3210");
});

test("sha256 is deterministic and secret-dependent", () => {
  assert.equal(sha256("x", "s1"), sha256("x", "s1"));
  assert.notEqual(sha256("x", "s1"), sha256("x", "s2"));
});

// ---------- magic-byte validation ----------

function writeTemp(bytes) {
  const file = path.join(os.tmpdir(), `kyc-test-${Date.now()}-${Math.random()}`);
  fs.writeFileSync(file, bytes);
  return file;
}

test("document validation accepts real PNG/JPG/PDF headers", () => {
  const png = writeTemp(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 1, 1, 1, 1, 1, 1, 1]));
  const jpg = writeTemp(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]));
  const pdf = writeTemp(Buffer.from("%PDF-1.7 something"));

  assert.equal(validateDocumentFile(png).detectedType, "image/png");
  assert.equal(validateDocumentFile(jpg).detectedType, "image/jpeg");
  assert.equal(validateDocumentFile(pdf).detectedType, "application/pdf");

  for (const f of [png, jpg, pdf]) fs.unlinkSync(f);
});

test("document validation rejects renamed executables", () => {
  const fake = writeTemp(Buffer.from("MZ this is not an image"));
  assert.equal(validateDocumentFile(fake).isValid, false);
  fs.unlinkSync(fake);
});

test("video validation accepts webm/mp4, rejects others", () => {
  const webm = writeTemp(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 1, 1, 1, 1, 1, 1, 1]));
  const mp4 = writeTemp(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42aaaa")]));
  const fake = writeTemp(Buffer.from("not a video at all"));

  assert.equal(validateVideoFile(webm).detectedType, "video/webm");
  assert.equal(validateVideoFile(mp4).detectedType, "video/mp4");
  assert.equal(validateVideoFile(fake).isValid, false);

  for (const f of [webm, mp4, fake]) fs.unlinkSync(f);
});

// ---------- name similarity ----------

test("name similarity flags mismatches and passes matches", () => {
  assert.ok(nameSimilarity("Demo Private Limited", "Demo Pvt Ltd") >= 60);
  assert.ok(nameSimilarity("Aryan Sharma", "Aryan S Sharma") >= 60);
  assert.ok(nameSimilarity("Completely Different Co", "Unrelated Business") < 60);
  assert.equal(nameSimilarity("", "anything"), 0);
});

// ---------- IP geolocation fallback ----------

test("IP geolocation rejects empty / loopback / private IPs without making a network call", async () => {
  for (const ip of [null, undefined, "", "127.0.0.1", "10.0.0.5", "192.168.1.1", "::1", "fe80::1", "169.254.0.1", "not-an-ip"]) {
    const result = await lookupIpGeolocation(ip);
    assert.equal(result, null, `should return null for ${ip}`);
  }
});

test("IP geolocation handles a failed network lookup gracefully (returns null, never throws)", async () => {
  // An IP that passes the public-IP filter but has no real DNS record.
  // The lookup either resolves (rare) or times out / 404s — either way, no throw.
  const result = await lookupIpGeolocation("203.0.113.1");
  if (result !== null) {
    assert.equal(result.source, "ip");
    assert.equal(typeof result.latitude, "number");
    assert.equal(typeof result.longitude, "number");
  }
});

// ---------- KYC stage helpers (regression for bug A15) ----------

test("isResubmissionMode is true for every resubmission_* stage (regression for A15)", () => {
  // The document service previously only matched two of these, causing
  // the buyer to see a "Continue to video" button on the locked
  // document view when the video was already accepted.
  for (const stage of RESUBMISSION_STAGES) {
    assert.equal(
      isResubmissionMode({ overallStatus: "resubmission_required", currentStage: stage }),
      true,
      `should be true for stage ${stage} with resubmission_required status`
    );
  }
});

test("isResubmissionMode is true when only overallStatus is resubmission_required", () => {
  assert.equal(
    isResubmissionMode({ overallStatus: "resubmission_required", currentStage: null }),
    true
  );
  assert.equal(
    isResubmissionMode({ overallStatus: "resubmission_required", currentStage: "kyc_link_generated" }),
    true
  );
});

test("isResubmissionMode is false for non-resubmission states (regression for A15)", () => {
  for (const overallStatus of ["link_sent", "opened", "in_progress", "submitted", "under_review", "approved", "rejected"]) {
    for (const currentStage of [null, "kyc_link_generated", "consent_completed", "documents_completed", "video_declaration_started", "buyer_submission_completed", "review_in_progress", "kyc_approved", "kyc_rejected"]) {
      assert.equal(
        isResubmissionMode({ overallStatus, currentStage }),
        false,
        `should be false for ${overallStatus} / ${currentStage}`
      );
    }
  }
});

test("isResubmissionMode is false for null / undefined kyc (defensive)", () => {
  assert.equal(isResubmissionMode(null), false);
  assert.equal(isResubmissionMode(undefined), false);
  assert.equal(isResubmissionMode({}), false);
});

test("isFinalKycStatus recognises every terminal status (regression for B12)", () => {
  for (const status of FINAL_KYC_STATUSES) {
    assert.equal(isFinalKycStatus({ overallStatus: status }), true, `should be true for ${status}`);
  }
  for (const status of ["link_sent", "opened", "in_progress", "submitted", "under_review", "resubmission_required", null, undefined]) {
    assert.equal(isFinalKycStatus({ overallStatus: status }), false, `should be false for ${status}`);
  }
  assert.equal(isFinalKycStatus(null), false);
  assert.equal(isFinalKycStatus(undefined), false);
});

// ---------- Document-load 500 regression (2026-06-25) ----------
//
// Bug: changing FINAL_KYC_STATUSES from Array to Set broke 5 callers
// that did `FINAL_KYC_STATUSES.includes(...)` (Array API), causing
// TypeError -> 500 on every buyer `GET /api/public/kyc/{token}/documents`.
// Locking the contract: FINAL_KYC_STATUSES must stay iterable by .includes().

test("FINAL_KYC_STATUSES keeps the Array .includes() API (regression 2026-06-25)", () => {
  assert.equal(typeof FINAL_KYC_STATUSES.includes, "function",
    "FINAL_KYC_STATUSES must support .includes() — 5 service callers depend on it");
  assert.ok(Array.isArray(FINAL_KYC_STATUSES),
    "FINAL_KYC_STATUSES must remain an Array for backwards compatibility");
  for (const status of ["approved", "rejected", "expired", "cancelled"]) {
    assert.equal(FINAL_KYC_STATUSES.includes(status), true, `${status} must be a final status`);
  }
  for (const status of ["link_sent", "submitted", "under_review", "resubmission_required"]) {
    assert.equal(FINAL_KYC_STATUSES.includes(status), false, `${status} must NOT be a final status`);
  }
});

// ---------- A17 / A18 contract for the resubmission workspace ----------

test("A17: getResubmissionWorkspace refuses to serve finalized KYCs (contract)", () => {
  // We can't easily exercise the full HTTP path without a live DB,
  // so we lock in the contract that the service-level guard exists
  // and uses the shared helper. The service module must require
  // `isFinalKycStatus` from kycStage.util (it does at the top of
  // kycResubmission.service.js). We assert by importing the service
  // and inspecting its source for the guard string.
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(
    path.join(__dirname, "../src/modules/kyc-resubmission/kycResubmission.service.js"),
    "utf8"
  );
  assert.ok(
    src.includes("isFinalKycStatus") && src.includes("KYC_ALREADY_FINALIZED"),
    "service must guard against finalized KYCs and return KYC_ALREADY_FINALIZED"
  );
  // The guard must come BEFORE the workspace response is built.
  const guardIdx = src.indexOf("KYC_ALREADY_FINALIZED");
  const responseIdx = src.indexOf("documentsNeedingResubmission: documentsNeedingResubmission.map");
  assert.ok(guardIdx > 0 && guardIdx < responseIdx, "guard must precede the workspace build");
});

test("A18: getResubmissionWorkspace does not decrypt the buyer's email (contract)", () => {
  // Same approach: assert the service uses maskEmail, not decryptField.
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(
    path.join(__dirname, "../src/modules/kyc-resubmission/kycResubmission.service.js"),
    "utf8"
  );
  // The previous bug was `decryptField(kyc.buyerEmail)`. The fix uses
  // `maskEmail(kyc.buyerEmail)`. The workspace-build section is the
  // entire response object that follows the `return {` line.
  assert.ok(
    !src.includes("decryptField(kyc.buyerEmail)"),
    "service must not decrypt the buyer's email"
  );
  assert.ok(
    src.includes("maskEmail(kyc.buyerEmail)"),
    "service must mask the buyer's email"
  );
});

// ---------- Phase 8: security hardening regressions (B1, B2, B3, B4,
// B5, B11, B12) ----------

test("B1, B2: reviewer listKycCases returns panMasked and masked email (no full PII)", () => {
  const src = read(
    path.join(__dirname, "../src/modules/reviewer/reviewer.service.js"),
    "utf8"
  );
  // Find the list response builder. The substring after "return cases.map"
  // must contain maskEmail(...) for buyerEmail and must NOT contain
  // decryptField(...).
  const listMap = src.match(/return\s+cases\.map\([^)]+\)\s*=>\s*\{[\s\S]*?\}\s*\)\s*;/);
  assert.ok(listMap, "listKycCases map block must exist");
  const body = listMap[0];
  assert.ok(
    body.includes("maskEmail(") && body.includes("item.buyerEmail"),
    "list must use maskEmail(item.buyerEmail) — B2"
  );
  assert.ok(
    !body.includes("decryptField(item.buyerEmail)"),
    "list must NOT decrypt the buyer's email — B2"
  );
  // PAN: must NOT decrypt panEnc, must reference panMasked.
  assert.ok(
    !body.includes("decryptField(item.panEnc)"),
    "list must NOT decrypt panEnc — B1"
  );
  assert.ok(
    body.includes("panMasked"),
    "list must reference panMasked — B1"
  );
});

test("B4: admin listAdminKycCases returns panMasked and masked email", () => {
  const src = read(
    path.join(__dirname, "../src/modules/admin/admin.service.js"),
    "utf8"
  );
  const listMap = src.match(/return\s+\{[\s\S]*?kycId:\s*item\.id[\s\S]*?\}\s*;\s*\}\s*\);/);
  assert.ok(listMap, "admin list response must exist");
  const body = listMap[0];
  assert.ok(
    body.includes("maskEmail(item.buyerEmail)"),
    "admin list must use maskEmail — B4"
  );
  assert.ok(
    !body.includes("decryptField(item.buyerEmail)"),
    "admin list must NOT decrypt email — B4"
  );
  assert.ok(
    !body.includes("decryptField(item.panEnc)"),
    "admin list must NOT decrypt panEnc — B4"
  );
});

test("B5: createKycFromPurchase response does not contain raw buyerKycUrl", () => {
  const src = read(
    path.join(__dirname, "../src/modules/kyc/kyc.service.js"),
    "utf8"
  );
  // The kycLink object in the return block must not include buyerKycUrl.
  // The URL is allowed in _internal (server-side only) — it must
  // remain ONLY there.
  const responseBlock = /kycLink:\s*\{[\s\S]*?\}\s*,?\s*_internal:/;
  const m = src.match(responseBlock);
  assert.ok(m, "kycLink + _internal block must exist");
  const kycLinkBody = m[0].split("_internal:")[0];
  assert.ok(
    !/buyerKycUrl/.test(kycLinkBody),
    "kycLink in response must NOT contain buyerKycUrl — B5"
  );
  // _internal may still have it — that's fine, it's server-side.
});

test("B5: NewKycPage success card no longer displays the raw URL", () => {
  const src = read(
    path.join(__dirname, "../../frontend/src/reviewer/pages/NewKycPage.jsx"),
    "utf8"
  );
  assert.ok(
    !/successResult\.buyerKycUrl/.test(src),
    "frontend must not render successResult.buyerKycUrl — B5"
  );
  // The success card should still show a linkId-style reference.
  assert.ok(
    /successResult\.linkId/.test(src),
    "frontend must display the linkId instead — B5"
  );
});

test("B11: manual-kyc route is admin-only", () => {
  const src = read(
    path.join(__dirname, "../src/modules/reviewer/reviewer.routes.js"),
    "utf8"
  );
  // The manual-kyc POST must add an extra requireRole("admin") guard
  // on top of the router-level requireRole("reviewer", "admin").
  const m = src.match(
    /router\.post\(\s*["']\/manual-kyc["']\s*,[^,]+,/
  );
  assert.ok(m, "manual-kyc route must exist");
  assert.ok(
    /requireRole\(\s*["']admin["']\s*\)/.test(m[0]),
    "manual-kyc must requireRole('admin') in addition to router guard — B11"
  );
});

test("B11: handleDuplicatePan response does not leak existingKycId or overallStatus", () => {
  const src = read(
    path.join(__dirname, "../src/modules/kyc/kyc.service.js"),
    "utf8"
  );
  const m = src.match(
    /responseSnapshot\s*=\s*\{[\s\S]*?duplicateLog:\s*\{/
  );
  assert.ok(m, "responseSnapshot block must exist");
  const body = m[0];
  assert.ok(
    !/existingKyc:\s*\{[^}]*kycId:/.test(body) &&
      !/existingKyc:\s*\{[^}]*overallStatus:/.test(body),
    "existingKyc must NOT include kycId or overallStatus — B11"
  );
});

test("B11: createKycFromPurchase writes actor info to audit log when actorId provided", () => {
  const src = read(
    path.join(__dirname, "../src/modules/kyc/kyc.service.js"),
    "utf8"
  );
  // The first audit log row must conditionally set actorType based on
  // options.actorId, and must record actorId + (optionally) actorEmail.
  assert.ok(
    /options\.actorId\s*\?\s*["']admin["']\s*:\s*["']system["']/.test(src),
    "audit log must set actorType = 'admin' when actorId is provided — B11"
  );
  assert.ok(
    /actorId:\s*options\.actorId/.test(src),
    "audit log must record actorId — B11"
  );
});

test("B3: reviewer getCaseDetail writes a case_detail_read audit row", () => {
  const src = read(
    path.join(__dirname, "../src/modules/reviewer/reviewer.controller.js"),
    "utf8"
  );
  // The handler must call a logger that writes a `case_detail_read`
  // audit row, including the reviewer's identity.
  assert.ok(
    /logReviewerCaseRead/.test(src),
    "controller must invoke a case-read audit logger — B3"
  );
  assert.ok(
    /action:\s*["']case_detail_read["']/.test(src),
    "audit logger must write action='case_detail_read' — B3"
  );
  assert.ok(
    /actorId:\s*req\.user\.id/.test(src),
    "audit logger must record the reviewer's id — B3"
  );
});

test("B12: files.service getKycIdByToken no longer rejects non-active links", () => {
  const src = read(
    path.join(__dirname, "../src/modules/files/files.service.js"),
    "utf8"
  );
  // The previous implementation returned null when status !== 'active'
  // or expiresAt <= now. The new implementation must return the kycId
  // regardless of status / expiry (per the doc-comment).
  const fn = src.match(/async\s+function\s+getKycIdByToken[\s\S]*?^\}/m);
  assert.ok(fn, "getKycIdByToken function must exist");
  const body = fn[0];
  assert.ok(
    !/link\.status\s*!==\s*["']active["']/.test(body) &&
      !/link\.expiresAt\s*<=\s*new Date\(\)/.test(body),
    "getKycIdByToken must NOT short-circuit on status/expiry — B12"
  );
  // Cross-KYC isolation is enforced at the route layer.
});

function read(p) {
  return require("node:fs").readFileSync(p, "utf8");
}

// ---------- B14: reminder template branches on master state ----------

test("B14: kycReminderEmail branches on mode (resubmission vs fresh)", () => {
  // Import the live template (CommonJS) and verify the output differs.
  const { kycReminderEmail } = readKycEmailTemplates();
  const args = {
    buyerName: "Aryan",
    kycUrl: "https://x/y",
    reminderNumber: 2,
    maxReminders: 5
  };
  const fresh = kycReminderEmail({ ...args, mode: "fresh" });
  const resub = kycReminderEmail({ ...args, mode: "resubmission_required" });

  assert.ok(
    fresh.subject.includes("Your 2Factor KYC is pending"),
    "fresh-mode subject must say 'Your 2Factor KYC is pending' — B14"
  );
  assert.ok(
    resub.subject.toLowerCase().includes("correction"),
    "resubmission-mode subject must mention 'correction' — B14"
  );
  assert.notEqual(
    fresh.subject,
    resub.subject,
    "subjects must differ between modes — B14"
  );

  const freshBody = JSON.stringify(fresh.body);
  const resubBody = JSON.stringify(resub.body);
  assert.ok(
    /Your KYC verification has not been completed/.test(freshBody),
    "fresh body must say 'complete your KYC' — B14"
  );
  assert.ok(
    /need correction|re-submit|fix/i.test(resubBody),
    "resubmission body must reference correction — B14"
  );
});

test("B14: reminder scheduler passes mode based on overallStatus", () => {
  const src = read(
    path.join(__dirname, "../src/modules/reminders/reminder.scheduler.js"),
    "utf8"
  );
  // The template call must include a mode derived from the kyc's state.
  assert.ok(
    /kycReminderEmail\(\s*\{[\s\S]*?mode:/.test(src),
    "scheduler must pass mode to kycReminderEmail — B14"
  );
  // The mode must be conditional on the resubmission status.
  assert.ok(
    /kyc\.overallStatus\s*===\s*["']resubmission_required["']\s*\?\s*["']resubmission_required["']\s*:\s*["']fresh["']/.test(
      src
    ),
    "scheduler must pick mode from kyc.overallStatus — B14"
  );
});

// ---------- B13: initial kycLinkEmail is the only initial send; reminder
// scheduler is the recovery path (no buyer self-service endpoint) ----------

test("B13: createKycFromPurchase documents the reminder-as-recovery path", () => {
  const src = read(
    path.join(__dirname, "../src/modules/kyc/kyc.service.js"),
    "utf8"
  );
  // The service must call out that the reminder scheduler is the
  // recovery path so future maintainers don't accidentally remove the
  // reminder-based link rotation.
  assert.ok(
    /reminder scheduler is the recovery path/.test(src) ||
      /reminder scheduler handles link recovery/.test(src),
    "kyc.service.js must document the reminder-as-recovery contract — B13"
  );
});

function readKycEmailTemplates() {
  // CJS file: just `require` directly.
  return require(
    path.join(__dirname, "../src/modules/email/email.templates.js")
  );
}
