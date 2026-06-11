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
  assert.equal(maskEmail("aryan@test.com"), "a***n@test.com");
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
