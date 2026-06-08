const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const PAN_ENTITY_MAP = {
  P: {
    key: "individual",
    label: "Individual",
    description: "Individual PAN holder. Use individual KYC checklist."
  },
  C: {
    key: "company",
    label: "Company",
    description: "Company PAN holder. Use company KYC checklist."
  },
  F: {
    key: "firm_llp",
    label: "Firm / LLP",
    description: "Firm or LLP PAN holder. Use firm/LLP checklist."
  }
};

function normalizePAN(pan) {
  if (!pan || typeof pan !== "string") {
    return "";
  }

  return pan.trim().toUpperCase();
}

function validatePAN(pan) {
  const normalizedPAN = normalizePAN(pan);

  return {
    isValid: PAN_REGEX.test(normalizedPAN),
    normalizedPAN
  };
}

function detectEntityFromPAN(pan) {
  const { isValid, normalizedPAN } = validatePAN(pan);

  if (!isValid) {
    return {
      success: false,
      error: "Invalid PAN format. Expected format: AAAAA9999A"
    };
  }

  const entityChar = normalizedPAN[3];
  const entity = PAN_ENTITY_MAP[entityChar];

  if (!entity) {
    return {
      success: false,
      error: `Unsupported PAN entity character: ${entityChar}. Currently supported types are P = Individual, C = Company, F = Firm / LLP.`,
      entityChar,
      supportedTypes: Object.keys(PAN_ENTITY_MAP)
    };
  }

  return {
    success: true,
    pan: normalizedPAN,
    entityChar,
    entity
  };
}

function maskPAN(pan) {
  const normalizedPAN = normalizePAN(pan);

  if (!PAN_REGEX.test(normalizedPAN)) {
    return null;
  }

  // Example:
  // ABCPE1234P -> ABCP****4P
  // ABCCE1234P -> ABCC****4P
  // Shows enough for debugging while hiding most of the PAN.
  return `${normalizedPAN.slice(0, 4)}****${normalizedPAN[8]}${normalizedPAN[9]}`;
}

module.exports = {
  PAN_REGEX,
  PAN_ENTITY_MAP,
  normalizePAN,
  validatePAN,
  detectEntityFromPAN,
  maskPAN
};
