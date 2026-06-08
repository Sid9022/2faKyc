const prisma = require("../../config/prisma");
const {
  generateRawKycToken,
  hashKycToken,
  getKycLinkExpiryDate,
  buildBuyerKycUrl,
  buildDevApiKycUrl
} = require("./kycLink.utils");

const FINAL_KYC_STATUSES = ["approved", "rejected", "expired", "cancelled"];
const OPEN_LINK_STATUSES = ["created", "link_sent"];

async function getChecklistByEntityType(entityKey) {
  const entityType = await prisma.entityType.findUnique({
    where: { key: entityKey },
    include: {
      requirements: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" }
      }
    }
  });

  if (!entityType) {
    return [];
  }

  return entityType.requirements.map((item) => ({
    id: item.id,
    key: item.documentKey,
    label: item.documentName,
    inputMode: item.inputMode,
    required: item.isRequired,
    needsFront: item.needsFront,
    needsBack: item.needsBack,
    ocrEnabled: item.ocrEnabled,
    status: "pending"
  }));
}

async function createSecureKycLinkForKyc(
  kycId,
  options = {}
) {
  const db = options.tx || prisma;
  const requestMeta = options.requestMeta || {};

  const kyc = await db.kycMaster.findUnique({
    where: { id: kycId }
  });

  if (!kyc) {
    const error = new Error("KYC record not found");
    error.statusCode = 404;
    throw error;
  }

  const rawToken = generateRawKycToken();
  const tokenHash = hashKycToken(rawToken);
  const expiresAt = getKycLinkExpiryDate();

  /**
   * Keep only one active link at a time.
   * Older active links become revoked.
   */
  await db.kycLink.updateMany({
    where: {
      kycId,
      status: "active"
    },
    data: {
      status: "revoked"
    }
  });

  const link = await db.kycLink.create({
    data: {
      kycId,
      tokenHash,
      status: "active",
      expiresAt
    }
  });

  if (!FINAL_KYC_STATUSES.includes(kyc.overallStatus)) {
    await db.kycMaster.update({
      where: { id: kycId },
      data: {
        overallStatus: "link_sent",
        currentStage: "kyc_link_generated"
      }
    });
  }

  await db.kycAuditLog.create({
    data: {
      kycId,
      actorType: "system",
      action: "kyc_link_generated",
      oldStatus: kyc.overallStatus,
      newStatus: FINAL_KYC_STATUSES.includes(kyc.overallStatus)
        ? kyc.overallStatus
        : "link_sent",
      ipAddress: requestMeta.ipAddress || null,
      userAgent: requestMeta.userAgent || null,
      metadata: {
        linkId: link.id,
        expiresAt,
        note: "Raw token was returned once but not stored in database."
      }
    }
  });

  return {
    linkId: link.id,
    token: rawToken,
    tokenHash: link.tokenHash,
    expiresAt: link.expiresAt,
    buyerKycUrl: buildBuyerKycUrl(rawToken),
    devApiUrl: buildDevApiKycUrl(rawToken)
  };
}

async function openPublicKycLink(rawToken, requestMeta = {}) {
  const tokenHash = hashKycToken(rawToken);

  const link = await prisma.kycLink.findUnique({
    where: { tokenHash },
    include: {
      kyc: true
    }
  });

  if (!link) {
    return {
      success: false,
      statusCode: 404,
      code: "INVALID_KYC_LINK",
      message: "Invalid KYC link."
    };
  }

  if (link.status !== "active") {
    return {
      success: false,
      statusCode: 410,
      code: "KYC_LINK_NOT_ACTIVE",
      message: `This KYC link is ${link.status}.`
    };
  }

  const now = new Date();

  if (link.expiresAt <= now) {
    await prisma.kycLink.update({
      where: { id: link.id },
      data: {
        status: "expired"
      }
    });

    await prisma.kycAuditLog.create({
      data: {
        kycId: link.kycId,
        actorType: "system",
        action: "kyc_link_expired",
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          linkId: link.id,
          expiredAt: now
        }
      }
    });

    return {
      success: false,
      statusCode: 410,
      code: "KYC_LINK_EXPIRED",
      message: "This KYC link has expired."
    };
  }

  const shouldMarkAsOpened = OPEN_LINK_STATUSES.includes(link.kyc.overallStatus);

  const nextOverallStatus = shouldMarkAsOpened
    ? "opened"
    : link.kyc.overallStatus;

  const nextCurrentStage = shouldMarkAsOpened
    ? "kyc_link_opened"
    : link.kyc.currentStage;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedLink = await tx.kycLink.update({
      where: { id: link.id },
      data: {
        clickCount: {
          increment: 1
        },
        firstClickedAt: link.firstClickedAt || now,
        lastClickedAt: now
      }
    });

    await tx.kycLinkClickLog.create({
      data: {
        kycLinkId: link.id,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          source: "public_kyc_link_opened"
        }
      }
    });

    if (shouldMarkAsOpened) {
      await tx.kycMaster.update({
        where: { id: link.kycId },
        data: {
          overallStatus: "opened",
          currentStage: "kyc_link_opened"
        }
      });
    }

    await tx.kycAuditLog.create({
      data: {
        kycId: link.kycId,
        actorType: "buyer",
        action: "kyc_link_opened",
        oldStatus: link.kyc.overallStatus,
        newStatus: nextOverallStatus,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          linkId: link.id,
          clickCount: updatedLink.clickCount
        }
      }
    });

    return updatedLink;
  });

  const checklist = await getChecklistByEntityType(link.kyc.entityType);

  return {
    success: true,
    message: "KYC link opened successfully.",
    link: {
      status: link.status,
      clickCount: updated.clickCount,
      expiresAt: link.expiresAt
    },
    kyc: {
      buyerName: link.kyc.buyerName,
      panMasked: link.kyc.panMasked,
      entityType: link.kyc.entityType,
      entityLabel: link.kyc.entityLabel,
      serviceType: link.kyc.serviceType,
      overallStatus: nextOverallStatus,
      currentStage: nextCurrentStage,
      checklist
    }
  };
}

async function getDevKycLinks() {
  return prisma.kycLink.findMany({
    select: {
      id: true,
      kycId: true,
      status: true,
      expiresAt: true,
      clickCount: true,
      firstClickedAt: true,
      lastClickedAt: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

async function getDevKycLinkClicks() {
  return prisma.kycLinkClickLog.findMany({
    orderBy: {
      clickedAt: "desc"
    }
  });
}

function validateConsentPayload(payload = {}) {
  const requiredFields = [
    "acceptedTerms",
    "acceptedPrivacy",
    "acceptedDocumentProcessing",
    "acceptedVideoRecording"
  ];

  const missingFields = requiredFields.filter((field) => payload[field] !== true);

  const language = ["en", "hi"].includes(payload.language)
    ? payload.language
    : "en";

  return {
    isValid: missingFields.length === 0,
    missingFields,
    language,
    consentVersion: payload.consentVersion || "v1"
  };
}

async function submitKycConsent(rawToken, payload = {}, requestMeta = {}) {
  const validation = validateConsentPayload(payload);

  if (!validation.isValid) {
    return {
      success: false,
      statusCode: 400,
      code: "CONSENT_REQUIRED",
      message: "All required consent fields must be accepted before continuing.",
      missingFields: validation.missingFields
    };
  }

  const tokenHash = hashKycToken(rawToken);

  const link = await prisma.kycLink.findUnique({
    where: { tokenHash },
    include: {
      kyc: true
    }
  });

  if (!link) {
    return {
      success: false,
      statusCode: 404,
      code: "INVALID_KYC_LINK",
      message: "Invalid KYC link."
    };
  }

  if (link.status !== "active") {
    return {
      success: false,
      statusCode: 410,
      code: "KYC_LINK_NOT_ACTIVE",
      message: `This KYC link is ${link.status}.`
    };
  }

  const now = new Date();

  if (link.expiresAt <= now) {
    await prisma.kycLink.update({
      where: { id: link.id },
      data: {
        status: "expired"
      }
    });

    return {
      success: false,
      statusCode: 410,
      code: "KYC_LINK_EXPIRED",
      message: "This KYC link has expired."
    };
  }

  if (FINAL_KYC_STATUSES.includes(link.kyc.overallStatus)) {
    return {
      success: false,
      statusCode: 409,
      code: "KYC_ALREADY_FINALIZED",
      message: `KYC is already ${link.kyc.overallStatus}. Consent cannot be submitted now.`
    };
  }

  const existingConsent = await prisma.kycConsent.findUnique({
    where: {
      kycId: link.kycId
    }
  });

  if (existingConsent) {
    const checklist = await getChecklistByEntityType(link.kyc.entityType);

    await prisma.kycAuditLog.create({
      data: {
        kycId: link.kycId,
        actorType: "buyer",
        action: "kyc_consent_already_recorded",
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          consentId: existingConsent.id,
          linkId: link.id
        }
      }
    });

    return {
      success: true,
      idempotent: true,
      message: "Consent was already recorded earlier.",
      consent: {
        id: existingConsent.id,
        language: existingConsent.language,
        consentVersion: existingConsent.consentVersion,
        acceptedAt: existingConsent.acceptedAt
      },
      kyc: {
        buyerName: link.kyc.buyerName,
        panMasked: link.kyc.panMasked,
        entityType: link.kyc.entityType,
        entityLabel: link.kyc.entityLabel,
        serviceType: link.kyc.serviceType,
        overallStatus: link.kyc.overallStatus,
        currentStage: link.kyc.currentStage,
        checklist
      }
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const consent = await tx.kycConsent.create({
      data: {
        kycId: link.kycId,
        language: validation.language,
        consentVersion: validation.consentVersion,

        acceptedTerms: payload.acceptedTerms,
        acceptedPrivacy: payload.acceptedPrivacy,
        acceptedDocumentProcessing: payload.acceptedDocumentProcessing,
        acceptedVideoRecording: payload.acceptedVideoRecording,

        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,

        metadata: {
          linkId: link.id,
          source: "buyer_kyc_portal"
        }
      }
    });

    await tx.kycMaster.update({
      where: { id: link.kycId },
      data: {
        overallStatus: "in_progress",
        currentStage: "consent_completed"
      }
    });

    await tx.kycAuditLog.create({
      data: {
        kycId: link.kycId,
        actorType: "buyer",
        action: "kyc_consent_accepted",
        oldStatus: link.kyc.overallStatus,
        newStatus: "in_progress",
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          consentId: consent.id,
          linkId: link.id,
          language: validation.language,
          consentVersion: validation.consentVersion
        }
      }
    });

    return consent;
  });

  const checklist = await getChecklistByEntityType(link.kyc.entityType);

  return {
    success: true,
    idempotent: false,
    message: "Consent recorded successfully. Buyer session started.",
    consent: {
      id: result.id,
      language: result.language,
      consentVersion: result.consentVersion,
      acceptedAt: result.acceptedAt
    },
    kyc: {
      buyerName: link.kyc.buyerName,
      panMasked: link.kyc.panMasked,
      entityType: link.kyc.entityType,
      entityLabel: link.kyc.entityLabel,
      serviceType: link.kyc.serviceType,
      overallStatus: "in_progress",
      currentStage: "consent_completed",
      checklist
    }
  };
}

async function getDevKycConsents() {
  return prisma.kycConsent.findMany({
    orderBy: {
      acceptedAt: "desc"
    }
  });
}

module.exports = {
  createSecureKycLinkForKyc,
  openPublicKycLink,
  submitKycConsent,
  getDevKycLinks,
  getDevKycLinkClicks,
  getDevKycConsents
};
