const fsp = require("fs/promises");

const env = require("../../config/env");
const { hashPAN, maskPAN } = require("../kyc/pan.utils");

/**
 * External PAN-card validator integration.
 *
 * Any document whose key contains "pan" (pan_card, company_pan, firm_llp_pan)
 * is treated as a PAN card and gated through the recognizer before its image
 * is saved — this keeps random/spoofed uploads out of the main identity doc.
 */

const PAN_DOC_REGEX = /pan/i;

function isPanDocument(documentKey = "") {
  return PAN_DOC_REGEX.test(documentKey);
}

async function callValidator(filePath, mimeType) {
  const buffer = await fsp.readFile(filePath);

  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type: mimeType || "image/jpeg" }),
    "kyc_upload.jpg"
  );

  const controller = new AbortController();
  // HF spaces can cold-start, so allow generous time before giving up.
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(env.PAN_VALIDATION_URL, {
      method: "POST",
      body: form,
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, statusCode: response.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Validates a PAN-card image and cross-checks the extracted PAN against this
 * KYC. Returns one of:
 *   { gate: "skip",   record? }                      → not applicable, just save
 *   { gate: "allow",  record }                       → save + attach advisory record
 *   { gate: "reject", code, message, record }        → do NOT save, tell the buyer
 */
async function validatePanCardForKyc({ filePath, mimeType, kyc }) {
  if (!env.PAN_VALIDATION_ENABLED) {
    return { gate: "skip", reason: "disabled" };
  }

  // The recognizer only handles images; PDFs/others are saved unvalidated.
  if (!String(mimeType || "").startsWith("image/")) {
    return {
      gate: "allow",
      record: {
        status: "skipped",
        note: "Non-image PAN file was not auto-validated."
      }
    };
  }

  let outcome;
  try {
    outcome = await callValidator(filePath, mimeType);
  } catch (error) {
    const record = {
      status: "error",
      error: String(error.message || error).slice(0, 200)
    };

    // Network/timeout/abort — honor the fail-open policy.
    if (env.PAN_VALIDATION_FAIL_OPEN) {
      return { gate: "allow", record };
    }

    return {
      gate: "reject",
      code: "PAN_VALIDATION_UNAVAILABLE",
      message:
        "We couldn't verify your PAN card right now. Please try again in a moment.",
      record
    };
  }

  const data = outcome.data || {};

  // Definitive "not a PAN card" — always blocks, regardless of fail-open.
  if (data.status !== "accepted") {
    const reason = data.reason || "This does not look like a valid PAN card.";
    return {
      gate: "reject",
      code: "PAN_CARD_INVALID",
      message: `${reason} Please upload a clear, well-lit photo of your physical PAN card.`,
      record: { status: "rejected", reason }
    };
  }

  // Accepted — cross-check against what we know about this KYC.
  const extractedPan = String(data.data?.pan_number || "").toUpperCase();
  const classificationCode = data.data?.classification_code || null;

  const panMatchesPurchase = extractedPan
    ? hashPAN(extractedPan) === kyc.panHash
    : null;
  const classificationMatchesEntity = classificationCode
    ? classificationCode === kyc.entityChar
    : null;

  const record = {
    status: "accepted",
    extractedPanMasked: maskPAN(extractedPan),
    classificationCode,
    classificationName: data.data?.classification_name || null,
    panMatchesPurchase,
    classificationMatchesEntity
  };

  // Optional strict gate: the card's PAN must equal the KYC's PAN.
  if (env.PAN_MATCH_STRICT && panMatchesPurchase === false) {
    return {
      gate: "reject",
      code: "PAN_MISMATCH",
      message: `The PAN on this card (${record.extractedPanMasked}) does not match the PAN registered for this KYC. Please upload the correct PAN card.`,
      record
    };
  }

  return { gate: "allow", record };
}

module.exports = {
  isPanDocument,
  validatePanCardForKyc
};
