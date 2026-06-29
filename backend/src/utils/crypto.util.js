const crypto = require("crypto");
const env = require("../config/env");

const ENC_PREFIX = "enc:v1:";

function getEncryptionKey() {
  // Accept any string secret; derive a 32-byte key deterministically.
  return crypto.createHash("sha256").update(env.ENCRYPTION_KEY).digest();
}

/**
 * AES-256-GCM field encryption.
 * Output format: enc:v1:<iv b64>:<authTag b64>:<ciphertext b64>
 */
function encryptField(plain) {
  if (plain === null || plain === undefined || plain === "") return plain;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(String(plain), "utf8"),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypts enc:v1 values. Non-encrypted values (legacy plaintext rows)
 * pass through unchanged so old data keeps working.
 */
function decryptField(value) {
  if (value === null || value === undefined || value === "") return value;
  if (!String(value).startsWith(ENC_PREFIX)) return value;

  try {
    const [ivB64, tagB64, dataB64] = String(value)
      .slice(ENC_PREFIX.length)
      .split(":");

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return "[decryption-failed]";
  }
}

function sha256(value, secret = "") {
  return crypto
    .createHash("sha256")
    .update(String(value) + (secret ? `::${secret}` : ""))
    .digest("hex");
}

/**
 * Deterministic buyer-mobile hash. Mirrors `hashPAN` but keyed by
 * `MOBILE_HASH_SECRET` (falls back to `PAN_HASH_SECRET` in env.js).
 * Stored on `KycMaster.mobileHash` so the reviewer / admin dashboards
 * can do exact-match search of every KYC record tied to a phone number.
 *
 * Returns `null` when no mobile is supplied so the column stays NULL
 * rather than carrying a meaningless hash of "".
 */
function hashMobile(mobile) {
  const normalized = mobile == null ? "" : String(mobile).trim();
  if (!normalized) return null;
  return sha256(normalized, env.MOBILE_HASH_SECRET);
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function maskEmail(email) {
  const value = String(email || "");
  const atIndex = value.indexOf("@");

  if (atIndex <= 1) return value ? `*${value.slice(atIndex)}` : "";

  return `${value[0]}***${value[atIndex - 1]}${value.slice(atIndex)}`;
}

function maskMobile(mobile) {
  const value = String(mobile || "");
  if (value.length < 4) return value ? "****" : "";
  return `******${value.slice(-4)}`;
}

function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  encryptField,
  decryptField,
  sha256,
  sha256Buffer,
  hashMobile,
  maskEmail,
  maskMobile,
  timingSafeEqualHex
};
