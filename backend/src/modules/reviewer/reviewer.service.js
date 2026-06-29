const prisma = require("../../config/prisma");
const { decryptField, hashMobile, maskEmail, maskMobile } = require("../../utils/crypto.util");
const { validatePAN, hashPAN } = require("../kyc/pan.utils");
const { getAutoChecksForKyc } = require("../auto-checks/autoChecks.service");
const { createSecureKycLinkForKyc } = require("../kyc-link/kycLink.service");
const { sendKycEmail } = require("../email/email.service");
const {
  resubmissionEmail,
  kycApprovedEmail,
  kycRejectedEmail
} = require("../email/email.templates");

const REVIEW_ALLOWED_STATUSES = ["submitted", "under_review", "resubmission_required"];

function normalizeDecision(decision) {
  return String(decision || "").trim().toLowerCase();
}

/**
 * Resolves user ids (reviewedBy / audit actorId) to display names so the
 * UI can show WHO did each action. Unknown ids (legacy "dev-reviewer",
 * system actors) simply resolve to undefined.
 */
async function buildUserNameMap(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, fullName: true, role: true }
  });

  return new Map(users.map((user) => [user.id, user]));
}

function canReviewKycStatus(status) {
  return REVIEW_ALLOWED_STATUSES.includes(status);
}

async function listKycCases(filters = {}) {
  const status = filters.status;

  const where = status
    ? { overallStatus: status }
    : {
        overallStatus: {
          in: ["submitted", "under_review", "resubmission_required", "approved", "rejected"]
        }
      };

  // Exact PAN search: raw PANs are never stored, so the searched PAN is
  // hashed with the same secret and matched against panHash.
  if (filters.pan) {
    const { isValid, normalizedPAN } = validatePAN(filters.pan);

    if (!isValid) {
      return [];
    }

    where.panHash = hashPAN(normalizedPAN);
    delete where.overallStatus; // a direct PAN lookup ignores status filters
    if (status) where.overallStatus = status;
  }

  // Mobile search: mirror of the PAN search — the input mobile is
  // trimmed, hashed with MOBILE_HASH_SECRET, and matched against
  // mobileHash. Used by the fraud-trail case 3 rows: each different
  // mobile ever tried against a PAN+name is queryable here. Empty /
  // unparseable inputs are silently ignored rather than 400-ing the
  // whole list — clients commonly pass `?mobile=` with no value.
  if (filters.mobile) {
    const mobileHash = hashMobile(filters.mobile);
    if (mobileHash) {
      where.mobileHash = mobileHash;
      delete where.overallStatus;
      if (status) where.overallStatus = status;
    }
  }

  const cases = await prisma.kycMaster.findMany({
    where,
    include: {
      consent: true,
      documentProgress: true,
      videoDeclaration: true,
      documentSubmissions: {
        select: {
          id: true,
          documentKey: true,
          documentName: true,
          isRequired: true,
          status: true,
          reviewedAt: true
        }
      }
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(Number(filters.limit) || 100, 300)
  });

  return cases.map((item) => {
    const documents = item.documentSubmissions || [];

    const requiredDocs = documents.filter((doc) => doc.isRequired);
    const acceptedRequiredDocs = requiredDocs.filter(
      (doc) => doc.status === "accepted"
    );

    const failedDocs = documents.filter((doc) =>
      ["rejected", "resubmission_required"].includes(doc.status)
    );

    return {
      kycId: item.id,
      purchaseId: item.purchaseId,
      buyerName: item.buyerName,
      // Bug B1 + B2: never decrypt PII in the list response. The list
      // view can render up to 300 cases per page — exposing full PAN +
      // email makes the entire buyer DB one screenshot / shoulder-surf
      // away. Detail-page endpoints still return full PII for the
      // reviewer's working case.
      buyerEmail: maskEmail(item.buyerEmail),
      buyerMobile: maskMobile(decryptField(item.buyerMobile)),
      pan: item.panMasked,
      panMasked: item.panMasked,
      entityType: item.entityType,
      entityLabel: item.entityLabel,
      serviceType: item.serviceType,
      overallStatus: item.overallStatus,
      currentStage: item.currentStage,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,

      documentSummary: {
        total: documents.length,
        required: requiredDocs.length,
        acceptedRequired: acceptedRequiredDocs.length,
        failed: failedDocs.length,
        finalSubmitted: item.documentProgress?.isFinalSubmitted || false
      },

      videoSummary: {
        status: item.videoDeclaration?.status || "not_started",
        faceCheckPassed: item.videoDeclaration?.faceCheckPassed || false,
        attemptCount: item.videoDeclaration?.attemptCount || 0
      },

      consent: item.consent
        ? {
            acceptedAt: item.consent.acceptedAt,
            language: item.consent.language,
            consentVersion: item.consent.consentVersion
          }
        : null
    };
  });
}

async function getKycCaseDetail(kycId) {
  const kyc = await prisma.kycMaster.findUnique({
    where: { id: kycId },
    include: {
      consent: true,
      documentProgress: true,
      documentSubmissions: {
        include: {
          files: {
            orderBy: [{ isCurrent: "desc" }, { uploadedAt: "desc" }]
          }
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      },
      videoDeclaration: {
        include: {
          attempts: {
            orderBy: { uploadedAt: "desc" }
          }
        }
      },
      kycLinks: {
        select: {
          id: true,
          status: true,
          expiresAt: true,
          clickCount: true,
          firstClickedAt: true,
          lastClickedAt: true,
          createdAt: true,
          clickLogs: {
            orderBy: { clickedAt: "desc" },
            take: 20
          }
        },
        orderBy: { createdAt: "desc" },
        take: 10
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        take: 100
      },
      finalReviews: {
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!kyc) {
    return {
      success: false,
      statusCode: 404,
      code: "KYC_NOT_FOUND",
      message: "KYC case not found."
    };
  }

  const autoChecks = await getAutoChecksForKyc(kycId);

  // Resolve every reviewer/admin id involved in this case to a name.
  const nameMap = await buildUserNameMap([
    ...kyc.documentSubmissions.map((doc) => doc.reviewedBy),
    kyc.videoDeclaration?.reviewedBy,
    ...kyc.finalReviews.map((review) => review.reviewedBy),
    ...kyc.auditLogs.map((log) => log.actorId)
  ]);

  const nameOf = (id) => nameMap.get(id)?.fullName || null;

  return {
    success: true,
    case: {
      kycId: kyc.id,
      purchaseId: kyc.purchaseId,
      buyerName: kyc.buyerName,
      buyerEmail: decryptField(kyc.buyerEmail),
      buyerMobile: decryptField(kyc.buyerMobile),
      pan: decryptField(kyc.panEnc) || kyc.panMasked,
      panMasked: kyc.panMasked,
      entityType: kyc.entityType,
      entityLabel: kyc.entityLabel,
      serviceType: kyc.serviceType,
      amount: kyc.amount,
      overallStatus: kyc.overallStatus,
      currentStage: kyc.currentStage,
      createdAt: kyc.createdAt,
      updatedAt: kyc.updatedAt
    },
    consent: kyc.consent,
    documentProgress: kyc.documentProgress,
    autoChecks,
    documents: kyc.documentSubmissions.map((doc) => ({
      id: doc.id,
      requirementId: doc.requirementId,
      documentKey: doc.documentKey,
      documentName: doc.documentName,
      inputMode: doc.inputMode,
      isRequired: doc.isRequired,
      status: doc.status,
      notes: doc.notes,
      reviewerRemarks: doc.reviewerRemarks,
      reviewedBy: doc.reviewedBy,
      reviewedByName: nameOf(doc.reviewedBy),
      reviewedAt: doc.reviewedAt,
      saveCount: doc.saveCount,
      currentVersion: doc.currentVersion,
      lastSavedAt: doc.lastSavedAt,
      submittedAt: doc.submittedAt,
      acceptedAt: doc.acceptedAt,
      rejectedAt: doc.rejectedAt,
      files: doc.files.map((file) => ({
        id: file.id,
        fileSlot: file.fileSlot,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        fileHash: file.fileHash,
        // Authenticated streaming endpoint — append your access token.
        fileUrl: `/api/reviewer/files/${file.id}`,
        version: file.version,
        isCurrent: file.isCurrent,
        uploadedAt: file.uploadedAt,
        ipAddress: file.ipAddress,
        userAgent: file.userAgent
      }))
    })),
    videoDeclaration: kyc.videoDeclaration
      ? {
          id: kyc.videoDeclaration.id,
          declarantFullName: kyc.videoDeclaration.declarantFullName,
          declarantRole: kyc.videoDeclaration.declarantRole,
          businessName: kyc.videoDeclaration.businessName,
          serviceType: kyc.videoDeclaration.serviceType,
          language: kyc.videoDeclaration.language,
          scriptVersion: kyc.videoDeclaration.scriptVersion,
          scriptText: kyc.videoDeclaration.scriptText,
          runtimeCode: kyc.videoDeclaration.runtimeCode,
          status: kyc.videoDeclaration.status,
          reviewerRemarks: kyc.videoDeclaration.reviewerRemarks,
          reviewedBy: kyc.videoDeclaration.reviewedBy,
          reviewedByName: nameOf(kyc.videoDeclaration.reviewedBy),
          reviewedAt: kyc.videoDeclaration.reviewedAt,
          attemptCount: kyc.videoDeclaration.attemptCount,
          currentAttemptId: kyc.videoDeclaration.currentAttemptId,
          faceCheckPassed: kyc.videoDeclaration.faceCheckPassed,
          faceCheckSource: "client_reported",
          faceQualityMetadata: kyc.videoDeclaration.faceQualityMetadata,
          startedAt: kyc.videoDeclaration.startedAt,
          submittedAt: kyc.videoDeclaration.submittedAt,
          ipAddress: kyc.videoDeclaration.ipAddress || null,
          userAgent: kyc.videoDeclaration.userAgent || null,
          latitude: kyc.videoDeclaration.latitude ?? null,
          longitude: kyc.videoDeclaration.longitude ?? null,
          attempts: kyc.videoDeclaration.attempts.map((attempt) => ({
            id: attempt.id,
            status: attempt.status,
            streamUrl: `/api/reviewer/video-attempts/${attempt.id}/stream`,
            mimeType: attempt.mimeType,
            sizeBytes: attempt.sizeBytes,
            durationSeconds: attempt.durationSeconds,
            faceCheckPassed: attempt.faceCheckPassed,
            faceQualityMetadata: attempt.faceQualityMetadata,
            uploadedAt: attempt.uploadedAt,
            submittedAt: attempt.submittedAt,
            ipAddress: attempt.ipAddress || null,
            userAgent: attempt.userAgent || null,
            latitude: attempt.latitude ?? null,
            longitude: attempt.longitude ?? null
          }))
        }
      : null,
    links: kyc.kycLinks,
    auditLogs: kyc.auditLogs.map((log) => ({
      ...log,
      actorName: nameOf(log.actorId)
    })),
    finalReviews: kyc.finalReviews.map((review) => ({
      ...review,
      reviewedByName: nameOf(review.reviewedBy)
    }))
  };
}

async function ensureCaseMovesToUnderReview(tx, kycId, requestMeta = {}, reviewer = {}) {
  const kyc = await tx.kycMaster.findUnique({
    where: { id: kycId }
  });

  if (!kyc) {
    const error = new Error("KYC case not found.");
    error.statusCode = 404;
    throw error;
  }

  if (!canReviewKycStatus(kyc.overallStatus)) {
    const error = new Error(
      `This KYC is currently ${kyc.overallStatus}. It cannot be reviewed now.`
    );
    error.statusCode = 409;
    throw error;
  }

  if (kyc.overallStatus === "submitted") {
    await tx.kycMaster.update({
      where: { id: kycId },
      data: {
        overallStatus: "under_review",
        currentStage: "review_in_progress"
      }
    });

    await tx.kycAuditLog.create({
      data: {
        kycId,
        actorType: "reviewer",
        actorId: reviewer.reviewerId || null,
        action: "kyc_review_started",
        oldStatus: "submitted",
        newStatus: "under_review",
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: { reviewerName: reviewer.reviewerName || null }
      }
    });
  }

  return kyc;
}

async function reviewDocumentSubmission(submissionId, payload = {}, requestMeta = {}, reviewer = {}) {
  const decision = normalizeDecision(payload.decision);
  const remarks = String(payload.remarks || "").trim();

  if (!["accepted", "resubmission_required"].includes(decision)) {
    return {
      success: false,
      statusCode: 400,
      code: "INVALID_DOCUMENT_REVIEW_DECISION",
      message: "Decision must be accepted or resubmission_required."
    };
  }

  if (decision === "resubmission_required" && remarks.length < 3) {
    return {
      success: false,
      statusCode: 400,
      code: "REMARKS_REQUIRED",
      message: "Remarks are required when asking for resubmission."
    };
  }

  const existing = await prisma.kycDocumentSubmission.findUnique({
    where: { id: submissionId },
    include: { kyc: true }
  });

  if (!existing) {
    return {
      success: false,
      statusCode: 404,
      code: "DOCUMENT_SUBMISSION_NOT_FOUND",
      message: "Document submission not found."
    };
  }

  if (existing.status === "skipped") {
    return {
      success: false,
      statusCode: 400,
      code: "DOCUMENT_SKIPPED",
      message:
        "This optional document was skipped by the buyer — there is nothing to review."
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    await ensureCaseMovesToUnderReview(tx, existing.kycId, requestMeta, reviewer);

    const updated = await tx.kycDocumentSubmission.update({
      where: { id: submissionId },
      data:
        decision === "accepted"
          ? {
              status: "accepted",
              reviewerRemarks: remarks || "Accepted.",
              reviewedBy: reviewer.reviewerId,
              reviewedAt: new Date(),
              acceptedAt: new Date(),
              rejectedAt: null,
              resubmissionRequestedAt: null
            }
          : {
              status: "resubmission_required",
              reviewerRemarks: remarks,
              reviewedBy: reviewer.reviewerId,
              reviewedAt: new Date(),
              acceptedAt: null,
              rejectedAt: new Date(),
              resubmissionRequestedAt: new Date(),
              resubmissionCycle: { increment: 1 }
            }
    });

    await tx.kycAuditLog.create({
      data: {
        kycId: existing.kycId,
        actorType: "reviewer",
        actorId: reviewer.reviewerId,
        action:
          decision === "accepted"
            ? "document_accepted"
            : "document_resubmission_required",
        oldStatus: existing.status,
        newStatus: updated.status,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          reviewerName: reviewer.reviewerName,
          submissionId,
          documentKey: existing.documentKey,
          documentName: existing.documentName,
          remarks
        }
      }
    });

    return updated;
  });

  return {
    success: true,
    message:
      decision === "accepted"
        ? "Document accepted successfully."
        : "Document marked for resubmission.",
    document: result
  };
}

async function reviewVideoDeclaration(declarationId, payload = {}, requestMeta = {}, reviewer = {}) {
  const decision = normalizeDecision(payload.decision);
  const remarks = String(payload.remarks || "").trim();

  if (!["accepted", "resubmission_required"].includes(decision)) {
    return {
      success: false,
      statusCode: 400,
      code: "INVALID_VIDEO_REVIEW_DECISION",
      message: "Decision must be accepted or resubmission_required."
    };
  }

  if (decision === "resubmission_required" && remarks.length < 3) {
    return {
      success: false,
      statusCode: 400,
      code: "REMARKS_REQUIRED",
      message: "Remarks are required when asking for video resubmission."
    };
  }

  const existing = await prisma.kycVideoDeclaration.findUnique({
    where: { id: declarationId },
    include: { kyc: true }
  });

  if (!existing) {
    return {
      success: false,
      statusCode: 404,
      code: "VIDEO_DECLARATION_NOT_FOUND",
      message: "Video declaration not found."
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    await ensureCaseMovesToUnderReview(tx, existing.kycId, requestMeta, reviewer);

    const updated = await tx.kycVideoDeclaration.update({
      where: { id: declarationId },
      data:
        decision === "accepted"
          ? {
              status: "accepted",
              reviewerRemarks: remarks || "Video declaration accepted.",
              reviewedBy: reviewer.reviewerId,
              reviewedAt: new Date(),
              resubmissionRequestedAt: null
            }
          : {
              status: "resubmission_required",
              reviewerRemarks: remarks,
              reviewedBy: reviewer.reviewerId,
              reviewedAt: new Date(),
              resubmissionRequestedAt: new Date(),
              resubmissionCycle: { increment: 1 }
            }
    });

    await tx.kycAuditLog.create({
      data: {
        kycId: existing.kycId,
        actorType: "reviewer",
        actorId: reviewer.reviewerId,
        action:
          decision === "accepted"
            ? "video_declaration_accepted"
            : "video_declaration_resubmission_required",
        oldStatus: existing.status,
        newStatus: updated.status,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          reviewerName: reviewer.reviewerName,
          declarationId,
          remarks
        }
      }
    });

    return updated;
  });

  return {
    success: true,
    message:
      decision === "accepted"
        ? "Video declaration accepted successfully."
        : "Video declaration marked for resubmission.",
    videoDeclaration: result
  };
}

async function sendFinalDecisionEmail(kyc, decision, remarks, failedItems, acceptedItems = []) {
  const buyerEmail = decryptField(kyc.buyerEmail);

  if (!buyerEmail || buyerEmail === "[decryption-failed]") return;

  let template;
  let emailType;

  if (decision === "approved") {
    template = kycApprovedEmail({ buyerName: kyc.buyerName });
    emailType = "kyc_approved";
  } else if (decision === "rejected") {
    template = kycRejectedEmail({ buyerName: kyc.buyerName, remarks });
    emailType = "kyc_rejected";
  } else {
    // Resubmission: issue a fresh link (raw tokens are never stored).
    const secureLink = await createSecureKycLinkForKyc(kyc.id, {
      preserveStatus: true,
      requestMeta: {}
    });

    template = resubmissionEmail({
      buyerName: kyc.buyerName,
      kycUrl: secureLink.buyerKycUrl,
      failedItems,
      acceptedItems,
      remarks
    });
    emailType = "resubmission_requested";
  }

  await sendKycEmail({
    kycId: kyc.id,
    emailType,
    to: buyerEmail,
    subject: template.subject,
    body: template.body
  });
}

async function finalDecisionForKyc(kycId, payload = {}, requestMeta = {}, reviewer = {}) {
  const decision = normalizeDecision(payload.decision);
  const remarks = String(payload.remarks || "").trim();

  if (!["approved", "resubmission_required", "rejected"].includes(decision)) {
    return {
      success: false,
      statusCode: 400,
      code: "INVALID_FINAL_DECISION",
      message: "Decision must be approved, resubmission_required, or rejected."
    };
  }

  if (["resubmission_required", "rejected"].includes(decision) && remarks.length < 3) {
    return {
      success: false,
      statusCode: 400,
      code: "REMARKS_REQUIRED",
      message: "Remarks are required for resubmission or rejection."
    };
  }

  const detail = await prisma.kycMaster.findUnique({
    where: { id: kycId },
    include: {
      documentSubmissions: true,
      videoDeclaration: true
    }
  });

  if (!detail) {
    return {
      success: false,
      statusCode: 404,
      code: "KYC_NOT_FOUND",
      message: "KYC case not found."
    };
  }

  if (!canReviewKycStatus(detail.overallStatus)) {
    return {
      success: false,
      statusCode: 409,
      code: "KYC_NOT_REVIEWABLE",
      message: `KYC is currently ${detail.overallStatus}. Final decision cannot be applied.`
    };
  }

  const requiredDocs = detail.documentSubmissions.filter((doc) => doc.isRequired);

  const notAcceptedRequiredDocs = requiredDocs.filter(
    (doc) => doc.status !== "accepted"
  );

  const failedDocs = detail.documentSubmissions.filter((doc) =>
    ["rejected", "resubmission_required"].includes(doc.status)
  );

  const videoStatus = detail.videoDeclaration?.status || "not_started";
  const videoAccepted = videoStatus === "accepted";
  const videoFailed = ["rejected", "resubmission_required"].includes(videoStatus);

  if (decision === "approved") {
    if (notAcceptedRequiredDocs.length > 0 || !videoAccepted) {
      return {
        success: false,
        statusCode: 400,
        code: "REQUIRED_ITEMS_NOT_ACCEPTED",
        message:
          "KYC cannot be approved until all required documents and video declaration are accepted.",
        pendingItems: {
          documents: notAcceptedRequiredDocs.map((doc) => ({
            id: doc.id,
            documentKey: doc.documentKey,
            documentName: doc.documentName,
            status: doc.status
          })),
          video: videoAccepted
            ? null
            : {
                id: detail.videoDeclaration?.id || null,
                status: videoStatus
              }
        }
      };
    }
  }

  if (decision === "resubmission_required") {
    if (failedDocs.length === 0 && !videoFailed) {
      return {
        success: false,
        statusCode: 400,
        code: "NO_FAILED_ITEMS_FOR_RESUBMISSION",
        message:
          "Mark at least one document/video for resubmission before final resubmission decision."
      };
    }
  }

  const statusMap = {
    approved: {
      overallStatus: "approved",
      currentStage: "kyc_approved",
      auditAction: "kyc_approved"
    },
    resubmission_required: {
      overallStatus: "resubmission_required",
      currentStage: "resubmission_required",
      auditAction: "kyc_resubmission_required"
    },
    rejected: {
      overallStatus: "rejected",
      currentStage: "kyc_rejected",
      auditAction: "kyc_rejected"
    }
  };

  const next = statusMap[decision];

  const result = await prisma.$transaction(async (tx) => {
    const finalReview = await tx.kycFinalReview.create({
      data: {
        kycId,
        decision,
        remarks,
        reviewedBy: reviewer.reviewerId,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          reviewerName: reviewer.reviewerName,
          requiredDocumentCount: requiredDocs.length,
          failedDocumentCount: failedDocs.length,
          videoStatus
        }
      }
    });

    const updatedKyc = await tx.kycMaster.update({
      where: { id: kycId },
      data: {
        overallStatus: next.overallStatus,
        currentStage: next.currentStage
      }
    });

    if (decision === "resubmission_required") {
      const firstFailedDoc = failedDocs[0];

      if (firstFailedDoc) {
        await tx.kycDocumentProgress.upsert({
          where: { kycId },
          update: {
            currentStepIndex: 0,
            currentRequirementId: firstFailedDoc.requirementId,
            currentDocumentKey: firstFailedDoc.documentKey,
            totalSteps: failedDocs.length,
            completedSteps: 0,
            isFinalSubmitted: false,
            finalSubmittedAt: null,
            lastAction: "resubmission_required"
          },
          create: {
            kycId,
            currentStepIndex: 0,
            currentRequirementId: firstFailedDoc.requirementId,
            currentDocumentKey: firstFailedDoc.documentKey,
            totalSteps: failedDocs.length,
            completedSteps: 0,
            isFinalSubmitted: false,
            lastAction: "resubmission_required"
          }
        });
      }
    }

    // Terminal decisions kill the buyer link.
    if (["approved", "rejected"].includes(decision)) {
      await tx.kycLink.updateMany({
        where: { kycId, status: "active" },
        data: { status: "revoked" }
      });
    }

    await tx.kycAuditLog.create({
      data: {
        kycId,
        actorType: "reviewer",
        actorId: reviewer.reviewerId,
        action: next.auditAction,
        oldStatus: detail.overallStatus,
        newStatus: next.overallStatus,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          reviewerName: reviewer.reviewerName,
          finalReviewId: finalReview.id,
          remarks
        }
      }
    });

    return { finalReview, updatedKyc };
  });

  // Notify the buyer after commit — email failures never roll back decisions.
  const failedItems = [
    ...failedDocs.map((doc) => doc.documentName),
    ...(videoFailed ? ["Live Video Declaration"] : [])
  ];

  // Bug A2: the buyer email should also call out items that were already
  // accepted, so they don't panic-re-accept something they were told is
  // locked. We only include these when the reviewer issued a
  // resubmission decision (not approved / rejected).
  const acceptedItems =
    decision === "resubmission_required"
      ? [
          ...detail.documentSubmissions
            .filter((doc) => doc.status === "accepted")
            .map((doc) => doc.documentName),
          ...(videoAccepted ? ["Live Video Declaration"] : [])
        ]
      : [];

  sendFinalDecisionEmail(detail, decision, remarks, failedItems, acceptedItems).catch((error) =>
    console.error("[email] final decision notification failed:", error.message)
  );

  return {
    success: true,
    message: `KYC final decision applied: ${decision}.`,
    finalReview: result.finalReview,
    kyc: {
      kycId: result.updatedKyc.id,
      overallStatus: result.updatedKyc.overallStatus,
      currentStage: result.updatedKyc.currentStage
    }
  };
}

async function reopenKycCase(kycId, requestMeta = {}, reviewer = {}) {
  const existing = await prisma.kycMaster.findUnique({
    where: { id: kycId }
  });

  if (!existing) {
    return {
      success: false,
      statusCode: 404,
      code: "KYC_NOT_FOUND",
      message: "KYC case not found."
    };
  }

  if (existing.overallStatus !== "rejected") {
    return {
      success: false,
      statusCode: 400,
      code: "INVALID_STATE",
      message: "Only rejected cases can be reopened."
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const kyc = await tx.kycMaster.update({
      where: { id: kycId },
      data: {
        overallStatus: "under_review",
        currentStage: "reopened"
      }
    });

    await tx.kycAuditLog.create({
      data: {
        kycId: kyc.id,
        actorType: "reviewer",
        actorId: reviewer.reviewerId,
        action: "case_reopened",
        oldStatus: "rejected",
        newStatus: "under_review",
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          reviewerName: reviewer.reviewerName
        }
      }
    });

    return kyc;
  });

  return {
    success: true,
    message: "Case reopened successfully.",
    kyc: updated
  };
}

module.exports = {
  listKycCases,
  getKycCaseDetail,
  reviewDocumentSubmission,
  reviewVideoDeclaration,
  finalDecisionForKyc,
  reopenKycCase,
  buildUserNameMap
};
