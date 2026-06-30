const crypto = require("crypto");

const prisma = require("../../config/prisma");
const env = require("../../config/env");
const { detectEntityFromPAN, maskPAN, hashPAN } = require("./pan.utils");
const { createSecureKycLinkForKyc } = require("../kyc-link/kycLink.service");
const {
  encryptField,
  decryptField,
  hashMobile,
  maskEmail,
  maskMobile,
  sha256
} = require("../../utils/crypto.util");
const { getSetting } = require("../../utils/settings.util");
const { sendKycEmail } = require("../email/email.service");
const { kycLinkEmail } = require("../email/email.templates");

/**
 * `overallStatus` values that mean the buyer has actually engaged with
 * the KYC. Used by Rule 2 (duplicate-buyer check) to decide whether a
 * fresh webhook for the same (PAN, buyerName, mobile) should re-send a
 * link or be ignored. Excludes the "just received the link, never
 * clicked" states (`created`, `link_sent`) and the link-level terminal
 * states (`expired`, `cancelled`) — those should fall through and
 * produce a fresh KYC.
 */
const KYC_DONE_STATUSES = new Set([
  "opened",
  "in_progress",
  "submitted",
  "under_review",
  "resubmission_required",
  "approved",
  "rejected"
]);

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

// isUniqueViolation removed

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

// handleDuplicatePan removed

/**
 * Rule 2 (duplicate-buyer check).
 *
 * Look up every KYC we already have for this `panHash` and see whether
 * any of them was opened by the *same* buyer. Two outcomes:
 *
 *   Case 1 — same PAN + same buyerName + same mobile + KYC is in a
 *     "done" state (anything past `link_sent`). The buyer already has
 *     a live case; we acknowledge the webhook, write a PurchaseEvent,
 *     and DO NOT create a new KYC / send a new link.
 *
 *   Case 3 — same PAN + same buyerName but a *different* mobile. Write
 *     a new `KycMaster` row in `cancelled` state so the new mobile is
 *     searchable (encrypted `buyerMobile` + `mobileHash`), write a
 *     PurchaseEvent, and DO NOT issue a buyer link. This is the
 *     "fraud-search trail" the operations team asked for: every
 *     mobile ever tried against a given PAN+name becomes retrievable.
 *
 *   Otherwise (different buyerName, or no same-name KYC, or same-name
 *   KYC is still in `created` / `link_sent` only) we fall through to
 *   Rule 3 and create a fresh KYC.
 */
async function handleDuplicateBuyer(
  existingKycsForPan,
  normalizedPurchase,
  pan,
  panHash,
  panMasked,
  payloadHash,
  entityResult,
  requestMeta
) {
  const normalizedInputName = normalizedPurchase.buyerName.toLowerCase().trim();
  const normalizedInputMobile = normalizedPurchase.buyerMobile || null;

  const sameNameMatch = existingKycsForPan.find(
    (k) => k.buyerName.toLowerCase().trim() === normalizedInputName
  );

  if (!sameNameMatch) {
    return null; // different buyerName — fall through to Rule 3
  }

  const inputMobileHash = hashMobile(normalizedInputMobile);
  const mobileMatches = inputMobileHash === sameNameMatch.mobileHash;

  if (mobileMatches && KYC_DONE_STATUSES.has(sameNameMatch.overallStatus)) {
    // Case 1: same buyer, same mobile, already progressed past
    // `link_sent`. Bypass and log the duplicate purchase.
    return handleDuplicateBuyerBypass(
      sameNameMatch,
      normalizedPurchase,
      panHash,
      panMasked,
      payloadHash,
      requestMeta
    );
  }

  if (!mobileMatches) {
    // Case 3: same PAN + same buyerName with a DIFFERENT mobile. Write
    // an audit-only KycMaster so the new mobile is searchable later.
    return handleDuplicateBuyerDifferentMobile(
      sameNameMatch,
      normalizedPurchase,
      pan,
      panHash,
      panMasked,
      payloadHash,
      entityResult,
      requestMeta
    );
  }

  // Same mobile but the previous KYC never progressed past `link_sent`
  // (still in `created` / `link_sent`). The reminder scheduler will
  // already be re-issuing the link, but a brand-new purchase should
  // still produce a fresh KYC so the buyer can resume. Fall through.
  return null;
}

async function handleDuplicateBuyerBypass(
  existingKyc,
  normalizedPurchase,
  panHash,
  panMasked,
  payloadHash,
  requestMeta
) {
  const sanitizedPayload = sanitizePayloadForStorage(
    normalizedPurchase,
    panMasked
  );

  return prisma.$transaction(async (tx) => {
    const responseSnapshot = {
      success: true,
      bypassed: true,
      duplicate: true,
      code: "DUPLICATE_BUYER_BYPASSED",
      message:
        "A KYC already exists for this PAN and buyer name; no new KYC link will be sent.",
      existingKyc: {
        kycId: existingKyc.id,
        panMasked: existingKyc.panMasked,
        overallStatus: existingKyc.overallStatus
      }
    };

    await tx.purchaseEvent.create({
      data: {
        purchaseId: normalizedPurchase.purchaseId,
        panHash,
        panMasked,
        payloadHash,
        status: "kyc_bypassed_duplicate_buyer",
        linkedKycId: existingKyc.id,
        responseSnapshot,
        rawPayload: sanitizedPayload
      }
    });

    await tx.kycAuditLog.create({
      data: {
        kycId: existingKyc.id,
        actorType: "system",
        action: "duplicate_buyer_purchase_received",
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          purchaseId: normalizedPurchase.purchaseId,
          message:
            "Webhook acknowledged for a (PAN, buyerName, mobile) that already has a live KYC. No new KYC was created; no link was sent."
        }
      }
    });

    return responseSnapshot;
  });
}

async function handleDuplicateBuyerDifferentMobile(
  existingKyc,
  normalizedPurchase,
  pan,
  panHash,
  panMasked,
  payloadHash,
  entityResult,
  requestMeta
) {
  const sanitizedPayload = sanitizePayloadForStorage(
    normalizedPurchase,
    panMasked
  );

  return prisma.$transaction(async (tx) => {
    // Audit-only KycMaster: terminal `cancelled` so the reminder
    // scheduler ignores it, the new mobile is stored encrypted for
    // admin / reviewer dashboards, and mobileHash enables fast exact
    // match by phone number.
    const auditKyc = await tx.kycMaster.create({
      data: {
        purchaseId: normalizedPurchase.purchaseId,
        buyerName: normalizedPurchase.buyerName,
        buyerEmail: encryptField(normalizedPurchase.buyerEmail),
        buyerMobile: encryptField(normalizedPurchase.buyerMobile),
        mobileHash: hashMobile(normalizedPurchase.buyerMobile),
        serviceType: normalizedPurchase.serviceType,
        amount: normalizedPurchase.amount,

        panHash,
        panMasked,
        panEnc: encryptField(pan),

        entityChar: entityResult.entityChar,
        entityType: entityResult.entity.key,
        entityLabel: entityResult.entity.label,

        overallStatus: "cancelled",
        currentStage: "duplicate_buyer_different_mobile_logged"
      }
    });

    const responseSnapshot = {
      success: true,
      duplicate: true,
      logged: true,
      code: "DUPLICATE_BUYER_DIFFERENT_MOBILE_LOGGED",
      message:
        "Same PAN and buyer name with a different mobile number. Audit entry created so the new mobile is searchable later; no KYC link was sent.",
      existingKyc: {
        kycId: existingKyc.id,
        panMasked: existingKyc.panMasked,
        overallStatus: existingKyc.overallStatus
      },
      newKyc: {
        kycId: auditKyc.id,
        panMasked: auditKyc.panMasked,
        overallStatus: auditKyc.overallStatus,
        buyerMobile: normalizedPurchase.buyerMobile
      }
    };

    await tx.purchaseEvent.create({
      data: {
        purchaseId: normalizedPurchase.purchaseId,
        panHash,
        panMasked,
        payloadHash,
        status: "kyc_logged_duplicate_buyer_different_mobile",
        linkedKycId: auditKyc.id,
        responseSnapshot,
        rawPayload: sanitizedPayload
      }
    });

    await tx.kycAuditLog.create({
      data: {
        kycId: auditKyc.id,
        actorType: "system",
        action: "duplicate_buyer_different_mobile_logged",
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          purchaseId: normalizedPurchase.purchaseId,
          relatedKycId: existingKyc.id,
          message:
            "Webhook for an existing (PAN, buyerName) with a different mobile. Audit row written; no buyer link / email issued."
        }
      }
    });

    return responseSnapshot;
  });
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

  // Rule 2: same PAN + same buyerName → duplicate-buyer check.
  //   - same buyer, same mobile, KYC has progressed past link_sent → bypass (no link).
  //   - same buyer, different mobile → write an audit-only KycMaster
  //     so the new mobile is searchable (no link, no email).
  //   - same buyer, same mobile, KYC only in link_sent/created → fall through to Rule 3.
  //   - different buyerName (or no same-name KYC at all) → fall through to Rule 3.
  // Sorted by `updatedAt desc` so the *most recent* KYC for a given
  // (PAN, buyerName) wins when there are multiple — that is the one
  // carrying the mobile we need to compare against, and the one whose
  // overallStatus reflects the buyer's current state.
  const existingKycsForPan = await prisma.kycMaster.findMany({
    where: { panHash },
    orderBy: { updatedAt: "desc" }
  });

  if (existingKycsForPan.length > 0) {
    const duplicateBuyerResult = await handleDuplicateBuyer(
      existingKycsForPan,
      normalizedPurchase,
      pan,
      panHash,
      panMasked,
      payloadHash,
      entityResult,
      requestMeta
    );

    if (duplicateBuyerResult) {
      return duplicateBuyerResult;
    }
  }

  // Rule 3: fresh purchaseId + (any) PAN + (any name) → create a new KYC and send the link.
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
          mobileHash: hashMobile(normalizedPurchase.buyerMobile),
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
          // Bug B11: when an admin creates a KYC manually, the audit
          // row must record who did it. For the regular webhook path
          // this stays "system".
          actorType: options.actorId ? "admin" : "system",
          actorId: options.actorId || null,
          action: intakeAction,
          newStatus: "link_sent",
          ipAddress: requestMeta.ipAddress || null,
          userAgent: requestMeta.userAgent || null,
          metadata: {
            purchaseId: normalizedPurchase.purchaseId,
            ...(options.actorEmail ? { actorEmail: options.actorEmail } : {})
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

      // Bug B5: never return the raw one-time buyer KYC URL to the
      // caller. The URL is delivered to the buyer by email. Anyone
      // capturing this response (proxy logs, browser dev tools, a
      // compromised reviewer account) could open the buyer's KYC
      // without ever receiving the email. Keep only the opaque
      // linkId + expiry for debugging.
      return {
        ...responseSnapshot,
        kycLink: {
          linkId: secureLink.linkId,
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
    // Concurrent request created the same purchaseId first.
    if (error?.code === "P2002") {
      const event = await prisma.purchaseEvent.findUnique({
        where: { purchaseId: normalizedPurchase.purchaseId }
      });
      if (event?.responseSnapshot) {
        return { ...event.responseSnapshot, idempotent: true };
      }
    }
    throw error;
  }

  // Email after commit — a mail failure must never roll back the KYC.
  // Bug B13: the initial email is the only `kycLinkEmail` send. If the
  // buyer loses it (or the link expires before they click), the
  // reminder scheduler is the recovery path — it issues a fresh
  // link via `createSecureKycLinkForKyc({preserveStatus: true})` every
  // reminder cycle until `maxReminders`. There is no buyer self-service
  // "resend link" endpoint by design (it would need an email-matching
  // gate + rate limit + audit log to be safe).
  const internal = result._internal;
  if (!options.exposeUrl) {
    delete result._internal;
  } else {
    result.kycLink.buyerKycUrl = internal.buyerKycUrl;
  }

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
