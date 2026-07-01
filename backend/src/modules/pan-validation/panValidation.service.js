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
  // HF spaces can cold-start (taking 1-2 mins), so allow generous time before giving up.
  const timeout = setTimeout(() => controller.abort(), 150000);

  try {
    const response = await fetch(env.PAN_VALIDATION_URL, {
      method: "POST",
      body: form,
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    console.log("HF Validation Response:", { ok: response.ok, statusCode: response.status, data });
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

  // Bypass external validation for E2E smoke test purchases
  if (kyc?.purchaseId?.startsWith("PUR-E2E-")) {
    return {
      gate: "allow",
      record: {
        status: "accepted",
        note: "Bypassed external validation for E2E smoke test."
      }
    };
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

  // Check if it's the new format (has "files" array)
  let accepted = false;
  let reason = "This does not look like a valid PAN card.";
  let extractedData = {};

  if (data.request_status && Array.isArray(data.files) && data.files.length > 0) {
    const fileResult = data.files[0];
    accepted = fileResult.decision === "accepted" || fileResult.status === "accepted" || fileResult.decision === "allow";
    reason = fileResult.reason || reason;
    extractedData = fileResult.best_result?.result || {};
  } else {
    // Old format
    accepted = data.status === "accepted" || data.valid_pan === true;
    reason = data.message || data.detail || data.reason || reason;
    extractedData = data.data || {};
  }

  // Handle generic endpoint failures (e.g. 404 Not Found from FastAPI)
  if (outcome.statusCode === 404 && data.detail === "Not Found") {
    reason = "The validation service endpoint is currently unavailable (404 Not Found). Please verify the PAN_VALIDATION_URL in .env";
    accepted = false;
  }

  if (!accepted) {
    // message = normal rejection; detail = FastAPI validation error
    return {
      gate: "reject",
      code: "PAN_CARD_INVALID",
      message: `${reason} Please upload a clear, well-lit photo of your physical PAN card.`,
      record: { status: "rejected", reason }
    };
  }

  // Accepted — cross-check against what we know about this KYC.
  const extractedPan = String(extractedData.pan_number || "").toUpperCase();
  // New model: entity_code/entity_type; older model: classification_code/name.
  const classificationCode =
    extractedData.entity_code || extractedData.classification_code || null;
  const classificationName =
    extractedData.entity_type || extractedData.classification_name || null;

  const panMatchesPurchase = extractedPan
    ? hashPAN(extractedPan) === kyc.panHash
    : null;
  const classificationMatchesEntity = classificationCode
    ? classificationCode === kyc.entityChar
    : null;

  const record = {
    status: "accepted",
    extractedPanMasked: maskPAN(extractedPan) || extractedData.masked_pan || null,
    classificationCode,
    classificationName,
    kycRoute: extractedData.kyc_route || null,
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
