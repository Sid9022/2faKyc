const crypto = require("crypto");

const prisma = require("../../config/prisma");
const env = require("../../config/env");
const { detectEntityFromPAN, maskPAN, hashPAN } = require("./pan.utils");
const { createSecureKycLinkForKyc } = require("../kyc-link/kycLink.service");
const {
  encryptField,
  maskEmail,
  maskMobile,
  sha256
} = require("../../utils/crypto.util");
const { getSetting } = require("../../utils/settings.util");
const { sendKycEmail } = require("../email/email.service");
const { kycLinkEmail } = require("../email/email.templates");

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

/**
 * What we persist in rawPayload columns. Never the raw PAN,
 * never plaintext contact details.
 */
function sanitizePayloadForStorage(normalizedPurchase, panMasked) {
  return {
    ...normalizedPurchase,
    pan: panMasked,
    buyerEmail: maskEmail(normalizedPurchase.buyerEmail),
    buyerMobile: maskMobile(normalizedPurchase.buyerMobile)
  };
}

function formatKycResponse(kyc, checklist = []) {
  return {
    kycId: kyc.id,
    purchaseId: kyc.purchaseId,
    buyerName: kyc.buyerName,
    panMasked: kyc.panMasked,
    entityType: kyc.entityType,
    entityLabel: kyc.entityLabel,
    overallStatus: kyc.overallStatus,
    currentStage: kyc.currentStage,
    checklist,
    createdAt: kyc.createdAt
  };
}

async function getActiveRequirements(entityKey) {
  const entityType = await prisma.entityType.findUnique({
    where: { key: entityKey },
    include: {
      requirements: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" }
      }
    }
  });

  return entityType?.requirements || [];
}

function requirementsToChecklist(requirements) {
  return requirements.map((item) => ({
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

function isUniqueViolation(error) {
  return error?.code === "P2002";
}

async function handlePurchaseIdConflict(existingPurchaseEvent, normalizedPurchase, panMasked, entityResult, requestMeta) {
  await prisma.$transaction(async (tx) => {
    await tx.purchaseEvent.update({
      where: { id: existingPurchaseEvent.id },
      data: {
        conflictCount: { increment: 1 },
        lastConflictAt: new Date()
      }
    });

    await tx.kycAuditLog.create({
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

async function handlePurchaseRetry(existingPurchaseEvent, normalizedPurchase, panMasked, payloadHash, requestMeta) {
  const eventType =
    existingPurchaseEvent.payloadHash === payloadHash
      ? "retry_same_payload"
      : "retry_same_pan_changed_payload";

  await prisma.$transaction(async (tx) => {
    await tx.purchaseEvent.update({
      where: { id: existingPurchaseEvent.id },
      data: {
        retryCount: { increment: 1 },
        lastRetryType: eventType,
        lastRetriedAt: new Date()
      }
    });

    await tx.kycAuditLog.create({
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
  });

  return {
    ...existingPurchaseEvent.responseSnapshot,
    idempotent: true,
    message:
      "This purchaseId was already processed earlier. Returning existing result without creating a new KYC."
  };
}

async function handleDuplicatePan(existingKyc, normalizedPurchase, panHash, panMasked, payloadHash, requestMeta) {
  const sanitizedPayload = sanitizePayloadForStorage(normalizedPurchase, panMasked);

  const result = await prisma.$transaction(async (tx) => {
    const duplicateLog = await tx.kycDuplicateLog.create({
      data: {
        purchaseId: normalizedPurchase.purchaseId,
        panHash,
        panMasked,
        originalKycId: existingKyc.id,
        reason: "Duplicate PAN request ignored",
        rawPayload: sanitizedPayload
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

    await tx.purchaseEvent.create({
      data: {
        purchaseId: normalizedPurchase.purchaseId,
        panHash,
        panMasked,
        payloadHash,
        status: "duplicate_pan_ignored",
        linkedKycId: existingKyc.id,
        responseSnapshot,
        rawPayload: sanitizedPayload
      }
    });

    await tx.kycAuditLog.create({
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
  });

  return result;
}

async function createKycFromPurchase(purchasePayload, requestMeta = {}, options = {}) {
  const intakeAction = options.intakeAction || "dummy_purchase_received";

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

  // Rule 1: same purchaseId never creates duplicate effects.
  const existingPurchaseEvent = await prisma.purchaseEvent.findUnique({
    where: { purchaseId: normalizedPurchase.purchaseId }
  });

  if (existingPurchaseEvent) {
    if (existingPurchaseEvent.panHash !== panHash) {
      return handlePurchaseIdConflict(
        existingPurchaseEvent,
        normalizedPurchase,
        panMasked,
        entityResult,
        requestMeta
      );
    }

    return handlePurchaseRetry(
      existingPurchaseEvent,
      normalizedPurchase,
      panMasked,
      payloadHash,
      requestMeta
    );
  }

  // Rule 2: same PAN never creates another KYC master.
  const existingKyc = await prisma.kycMaster.findUnique({
    where: { panHash }
  });

  if (existingKyc) {
    try {
      return await handleDuplicatePan(
        existingKyc,
        normalizedPurchase,
        panHash,
        panMasked,
        payloadHash,
        requestMeta
      );
    } catch (error) {
      // Concurrent retry of the same purchaseId — replay idempotently.
      if (isUniqueViolation(error)) {
        const event = await prisma.purchaseEvent.findUnique({
          where: { purchaseId: normalizedPurchase.purchaseId }
        });
        if (event) {
          return { ...event.responseSnapshot, idempotent: true };
        }
      }
      throw error;
    }
  }

  // Rule 3: new purchaseId + new PAN = create KYC.
  const requirements = await getActiveRequirements(entityResult.entity.key);
  const checklist = requirementsToChecklist(requirements);
  const sanitizedPayload = sanitizePayloadForStorage(normalizedPurchase, panMasked);
  const reminderIntervalHours = Number(await getSetting("reminder_interval_hours")) || 24;
  const maxReminders = Number(await getSetting("max_reminders")) || 5;

  let result;

  try {
    result = await prisma.$transaction(async (tx) => {
      const kyc = await tx.kycMaster.create({
        data: {
          purchaseId: normalizedPurchase.purchaseId,
          buyerName: normalizedPurchase.buyerName,
          buyerEmail: encryptField(normalizedPurchase.buyerEmail),
          buyerMobile: encryptField(normalizedPurchase.buyerMobile),
          serviceType: normalizedPurchase.serviceType,
          amount: normalizedPurchase.amount,

          panHash,
          panMasked,
          panEnc: encryptField(pan),

          entityChar: entityResult.entityChar,
          entityType: entityResult.entity.key,
          entityLabel: entityResult.entity.label,

          overallStatus: "link_sent",
          currentStage: "kyc_link_generated"
        }
      });

      // Snapshot the checklist so admin edits never change in-flight KYCs.
      const documentRequirements = requirements.filter(
        (item) => item.inputMode !== "live_video"
      );

      for (const requirement of documentRequirements) {
        await tx.kycDocumentSubmission.create({
          data: {
            kycId: kyc.id,
            requirementId: requirement.id,
            documentKey: requirement.documentKey,
            documentName: requirement.documentName,
            inputMode: requirement.inputMode,
            isRequired: requirement.isRequired,
            needsFront: requirement.needsFront,
            needsBack: requirement.needsBack,
            ocrEnabled: requirement.ocrEnabled,
            sortOrder: requirement.sortOrder,
            status: "not_started"
          }
        });
      }

      const nextDueAt = new Date();
      nextDueAt.setHours(nextDueAt.getHours() + reminderIntervalHours);

      await tx.reminderState.create({
        data: {
          kycId: kyc.id,
          maxReminders,
          nextDueAt
        }
      });

      const responseSnapshot = {
        success: true,
        duplicate: false,
        idempotent: false,
        message: "Purchase accepted. KYC master created.",
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
          rawPayload: sanitizedPayload
        }
      });

      await tx.kycAuditLog.create({
        data: {
          kycId: kyc.id,
          actorType: "system",
          action: intakeAction,
          newStatus: "link_sent",
          ipAddress: requestMeta.ipAddress || null,
          userAgent: requestMeta.userAgent || null,
          metadata: { purchaseId: normalizedPurchase.purchaseId }
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
          expiresAt: secureLink.expiresAt
        },
        _internal: {
          kycId: kyc.id,
          buyerName: kyc.buyerName,
          buyerEmailPlain: normalizedPurchase.buyerEmail,
          buyerKycUrl: secureLink.buyerKycUrl,
          expiresAt: secureLink.expiresAt
        }
      };
    });
  } catch (error) {
    // Concurrent request created the same purchaseId or PAN first.
    if (isUniqueViolation(error)) {
      const event = await prisma.purchaseEvent.findUnique({
        where: { purchaseId: normalizedPurchase.purchaseId }
      });
      if (event?.responseSnapshot) {
        return { ...event.responseSnapshot, idempotent: true };
      }

      const kycNow = await prisma.kycMaster.findUnique({ where: { panHash } });
      if (kycNow) {
        return handleDuplicatePan(
          kycNow,
          normalizedPurchase,
          panHash,
          panMasked,
          payloadHash,
          requestMeta
        );
      }
    }
    throw error;
  }

  // Email after commit — a mail failure must never roll back the KYC.
  const internal = result._internal;
  delete result._internal;

  const template = kycLinkEmail({
    buyerName: internal.buyerName,
    kycUrl: internal.buyerKycUrl,
    expiresAt: internal.expiresAt
  });

  await sendKycEmail({
    kycId: internal.kycId,
    emailType: "kyc_link_sent",
    to: internal.buyerEmailPlain,
    subject: template.subject,
    body: template.body
  });

  return result;
}

async function getDevKycRecords() {
  const records = await prisma.kycMaster.findMany({
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return records.map((kyc) => ({
    kycId: kyc.id,
    purchaseId: kyc.purchaseId,
    buyerName: kyc.buyerName,
    panMasked: kyc.panMasked,
    entityType: kyc.entityType,
    overallStatus: kyc.overallStatus,
    currentStage: kyc.currentStage,
    createdAt: kyc.createdAt
  }));
}

async function getDevDuplicateLogs() {
  return prisma.kycDuplicateLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100
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
    orderBy: { createdAt: "desc" },
    take: 100
  });
}

async function getDevPurchaseEventLogs() {
  return prisma.kycAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200
  });
}

async function getDevEntityConfig() {
  return prisma.entityType.findMany({
    include: {
      requirements: {
        orderBy: { sortOrder: "asc" }
      }
    },
    orderBy: { label: "asc" }
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
