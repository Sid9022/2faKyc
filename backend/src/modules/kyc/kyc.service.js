const crypto = require("crypto");
const prisma = require("../../config/prisma");
const { detectEntityFromPAN, maskPAN } = require("./pan.utils");
const { createSecureKycLinkForKyc } = require("../kyc-link/kycLink.service");

function hashValue(value, secret = "local-dev-secret") {
  return crypto
    .createHash("sha256")
    .update(String(value) + "::" + secret)
    .digest("hex");
}

function hashPAN(pan) {
  return hashValue(
    pan,
    process.env.PAN_HASH_SECRET || "local-dev-pan-secret"
  );
}

function hashPayload(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizePurchasePayload(purchasePayload, normalizedPAN) {
  return {
    purchaseId: String(purchasePayload.purchaseId).trim(),
    buyerName: String(purchasePayload.buyerName).trim(),
    buyerEmail: normalizeEmail(purchasePayload.buyerEmail),
    buyerMobile: purchasePayload.buyerMobile
      ? String(purchasePayload.buyerMobile).trim()
      : null,
    pan: normalizedPAN,
    serviceType: purchasePayload.serviceType,
    amount: purchasePayload.amount || null,
    purchasedAt: purchasePayload.purchasedAt || null
  };
}

async function getChecklistFromDb(entityKey) {
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

function formatKycResponse(kyc, checklist = []) {
  return {
    kycId: kyc.id,
    purchaseId: kyc.purchaseId,
    buyerName: kyc.buyerName,
    buyerEmail: kyc.buyerEmail,
    panMasked: kyc.panMasked,
    entityType: kyc.entityType,
    entityLabel: kyc.entityLabel,
    overallStatus: kyc.overallStatus,
    currentStage: kyc.currentStage,
    checklist,
    createdAt: kyc.createdAt
  };
}

async function createKycFromPurchase(purchasePayload, requestMeta = {}) {
  const entityResult = detectEntityFromPAN(purchasePayload.pan);

  if (!entityResult.success) {
    return {
      success: false,
      statusCode: 400,
      code: "INVALID_OR_UNSUPPORTED_PAN",
      message: entityResult.error
    };
  }

  const pan = entityResult.pan;
  const panHash = hashPAN(pan);
  const panMasked = maskPAN(pan);

  const normalizedPurchase = normalizePurchasePayload(purchasePayload, pan);
  const payloadHash = hashPayload(normalizedPurchase);

  /**
   * Rule 1:
   * Same purchaseId should not create duplicate effects.
   */
  const existingPurchaseEvent = await prisma.purchaseEvent.findUnique({
    where: {
      purchaseId: normalizedPurchase.purchaseId
    }
  });

  if (existingPurchaseEvent) {
    /**
     * Same purchaseId but different PAN = conflict.
     */
    if (existingPurchaseEvent.panHash !== panHash) {
      await prisma.purchaseEvent.update({
        where: { id: existingPurchaseEvent.id },
        data: {
          conflictCount: {
            increment: 1
          },
          lastConflictAt: new Date()
        }
      });

      await prisma.kycAuditLog.create({
        data: {
          kycId: existingPurchaseEvent.linkedKycId || null,
          actorType: "system",
          action: "purchase_id_conflict",
          ipAddress: requestMeta.ipAddress || null,
          userAgent: requestMeta.userAgent || null,
          metadata: {
            purchaseId: normalizedPurchase.purchaseId,
            existingPanMasked: existingPurchaseEvent.panMasked,
            attemptedPanMasked: panMasked,
            message:
              "Same purchaseId was received with a different PAN. Request rejected."
          }
        }
      });

      return {
        success: false,
        statusCode: 409,
        code: "PURCHASE_ID_CONFLICT",
        message:
          "This purchaseId has already been processed with another PAN. Request rejected to prevent incorrect KYC creation.",
        existingPurchase: {
          purchaseId: normalizedPurchase.purchaseId,
          panMasked: existingPurchaseEvent.panMasked,
          status: existingPurchaseEvent.status,
          linkedKycId: existingPurchaseEvent.linkedKycId || null
        },
        attemptedPurchase: {
          purchaseId: normalizedPurchase.purchaseId,
          panMasked,
          entityType: entityResult.entity.key
        }
      };
    }

    const eventType =
      existingPurchaseEvent.payloadHash === payloadHash
        ? "retry_same_payload"
        : "retry_same_pan_changed_payload";

    await prisma.purchaseEvent.update({
      where: { id: existingPurchaseEvent.id },
      data: {
        retryCount: {
          increment: 1
        },
        lastRetryType: eventType,
        lastRetriedAt: new Date()
      }
    });

    await prisma.kycAuditLog.create({
      data: {
        kycId: existingPurchaseEvent.linkedKycId || null,
        actorType: "system",
        action: eventType,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          purchaseId: normalizedPurchase.purchaseId,
          panMasked,
          message:
            "PurchaseId was already processed earlier. Request treated as idempotent retry."
        }
      }
    });

    return {
      ...existingPurchaseEvent.responseSnapshot,
      idempotent: true,
      message:
        "This purchaseId was already processed earlier. Returning existing result without creating a new KYC."
    };
  }

  /**
   * Rule 2:
   * Same PAN should not create another KYC master.
   */
  const existingKyc = await prisma.kycMaster.findUnique({
    where: {
      panHash
    }
  });

  if (existingKyc) {
    const duplicateLog = await prisma.kycDuplicateLog.create({
      data: {
        purchaseId: normalizedPurchase.purchaseId,
        panHash,
        panMasked,
        originalKycId: existingKyc.id,
        reason: "Duplicate PAN request ignored",
        rawPayload: normalizedPurchase
      }
    });

    const responseSnapshot = {
      success: true,
      duplicate: true,
      idempotent: false,
      message:
        "KYC already exists for this PAN. Duplicate request logged and ignored.",
      existingKyc: {
        kycId: existingKyc.id,
        panMasked: existingKyc.panMasked,
        entityType: existingKyc.entityType,
        overallStatus: existingKyc.overallStatus
      },
      duplicateLog: {
        id: duplicateLog.id,
        reason: duplicateLog.reason,
        panMasked: duplicateLog.panMasked,
        purchaseId: duplicateLog.purchaseId,
        originalKycId: duplicateLog.originalKycId,
        receivedAt: duplicateLog.createdAt
      }
    };

    await prisma.purchaseEvent.create({
      data: {
        purchaseId: normalizedPurchase.purchaseId,
        panHash,
        panMasked,
        payloadHash,
        status: "duplicate_pan_ignored",
        linkedKycId: existingKyc.id,
        responseSnapshot,
        rawPayload: normalizedPurchase
      }
    });

    await prisma.kycAuditLog.create({
      data: {
        kycId: existingKyc.id,
        actorType: "system",
        action: "duplicate_pan_ignored",
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          duplicatePurchaseId: normalizedPurchase.purchaseId,
          duplicateLogId: duplicateLog.id
        }
      }
    });

    return responseSnapshot;
  }

  /**
   * Rule 3:
   * New purchaseId + new PAN = create KYC.
   */
  const checklist = await getChecklistFromDb(entityResult.entity.key);

  const result = await prisma.$transaction(async (tx) => {
    const kyc = await tx.kycMaster.create({
      data: {
        purchaseId: normalizedPurchase.purchaseId,
        buyerName: normalizedPurchase.buyerName,
        buyerEmail: normalizedPurchase.buyerEmail,
        buyerMobile: normalizedPurchase.buyerMobile,
        serviceType: normalizedPurchase.serviceType,
        amount: normalizedPurchase.amount,

        panHash,
        panMasked,

        entityChar: entityResult.entityChar,
        entityType: entityResult.entity.key,
        entityLabel: entityResult.entity.label,

        overallStatus: "link_sent",
        currentStage: "kyc_link_generated"
      }
    });

    const responseSnapshot = {
      success: true,
      duplicate: false,
      idempotent: false,
      message: "Dummy purchase accepted. KYC master created in database.",
      kyc: formatKycResponse(kyc, checklist)
    };

    await tx.purchaseEvent.create({
      data: {
        purchaseId: normalizedPurchase.purchaseId,
        panHash,
        panMasked,
        payloadHash,
        status: "kyc_created",
        linkedKycId: kyc.id,
        responseSnapshot,
        rawPayload: normalizedPurchase
      }
    });

    await tx.kycAuditLog.create({
      data: {
        kycId: kyc.id,
        actorType: "system",
        action: "dummy_purchase_received",
        newStatus: "link_sent",
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          purchaseId: normalizedPurchase.purchaseId
        }
      }
    });

    await tx.kycAuditLog.create({
      data: {
        kycId: kyc.id,
        actorType: "system",
        action: "entity_detected_from_pan",
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          entityChar: entityResult.entityChar,
          entityType: entityResult.entity.key
        }
      }
    });

    const secureLink = await createSecureKycLinkForKyc(kyc.id, {
      tx,
      requestMeta
    });

    return {
      ...responseSnapshot,
      kycLink: {
        linkId: secureLink.linkId,
        buyerKycUrl: secureLink.buyerKycUrl,
        devApiUrl: secureLink.devApiUrl,
        expiresAt: secureLink.expiresAt
      }
    };
  });

  return result;
}

async function getDevKycRecords() {
  const records = await prisma.kycMaster.findMany({
    orderBy: {
      createdAt: "desc"
    }
  });

  return records.map((kyc) => ({
    kycId: kyc.id,
    purchaseId: kyc.purchaseId,
    buyerName: kyc.buyerName,
    buyerEmail: kyc.buyerEmail,
    panMasked: kyc.panMasked,
    entityType: kyc.entityType,
    overallStatus: kyc.overallStatus,
    currentStage: kyc.currentStage,
    createdAt: kyc.createdAt
  }));
}

async function getDevDuplicateLogs() {
  return prisma.kycDuplicateLog.findMany({
    orderBy: {
      createdAt: "desc"
    }
  });
}

async function getDevPurchaseEvents() {
  return prisma.purchaseEvent.findMany({
    select: {
      id: true,
      purchaseId: true,
      panMasked: true,
      status: true,
      linkedKycId: true,
      retryCount: true,
      lastRetryType: true,
      lastRetriedAt: true,
      conflictCount: true,
      lastConflictAt: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

async function getDevPurchaseEventLogs() {
  return prisma.kycAuditLog.findMany({
    orderBy: {
      createdAt: "desc"
    }
  });
}

async function getDevEntityConfig() {
  return prisma.entityType.findMany({
    include: {
      requirements: {
        orderBy: {
          sortOrder: "asc"
        }
      }
    },
    orderBy: {
      label: "asc"
    }
  });
}

module.exports = {
  createKycFromPurchase,
  getDevKycRecords,
  getDevDuplicateLogs,
  getDevPurchaseEvents,
  getDevPurchaseEventLogs,
  getDevEntityConfig
};
