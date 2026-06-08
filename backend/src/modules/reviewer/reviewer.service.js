const prisma = require("../../config/prisma");

const FINAL_KYC_STATUSES = ["approved", "rejected"];
const REVIEW_ALLOWED_STATUSES = ["submitted", "under_review", "resubmission_required"];

function normalizeDecision(decision) {
  return String(decision || "").trim().toLowerCase();
}

function getReviewerIdentity(meta = {}) {
  return {
    reviewerId: meta.reviewerId || "dev-reviewer",
    reviewerName: meta.reviewerName || "Development Reviewer"
  };
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
    orderBy: {
      updatedAt: "desc"
    }
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
      buyerEmail: item.buyerEmail,
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
            orderBy: [
              { isCurrent: "desc" },
              { uploadedAt: "desc" }
            ]
          },
          requirement: true
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      videoDeclaration: {
        include: {
          attempts: {
            orderBy: {
              uploadedAt: "desc"
            }
          }
        }
      },
      kycLinks: {
        include: {
          clickLogs: {
            orderBy: {
              clickedAt: "desc"
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      },
      auditLogs: {
        orderBy: {
          createdAt: "desc"
        }
      },
      finalReviews: {
        orderBy: {
          createdAt: "desc"
        }
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

  return {
    success: true,
    case: {
      kycId: kyc.id,
      purchaseId: kyc.purchaseId,
      buyerName: kyc.buyerName,
      buyerEmail: kyc.buyerEmail,
      buyerMobile: kyc.buyerMobile,
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
        publicPath: file.publicPath,
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
          reviewedAt: kyc.videoDeclaration.reviewedAt,
          attemptCount: kyc.videoDeclaration.attemptCount,
          currentAttemptId: kyc.videoDeclaration.currentAttemptId,
          faceCheckPassed: kyc.videoDeclaration.faceCheckPassed,
          faceQualityMetadata: kyc.videoDeclaration.faceQualityMetadata,
          startedAt: kyc.videoDeclaration.startedAt,
          submittedAt: kyc.videoDeclaration.submittedAt,
          attempts: kyc.videoDeclaration.attempts.map((attempt) => ({
            id: attempt.id,
            status: attempt.status,
            publicPath: attempt.publicPath,
            mimeType: attempt.mimeType,
            sizeBytes: attempt.sizeBytes,
            durationSeconds: attempt.durationSeconds,
            faceCheckPassed: attempt.faceCheckPassed,
            faceQualityMetadata: attempt.faceQualityMetadata,
            uploadedAt: attempt.uploadedAt,
            submittedAt: attempt.submittedAt
          }))
        }
      : null,
    links: kyc.kycLinks,
    auditLogs: kyc.auditLogs,
    finalReviews: kyc.finalReviews
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
        metadata: {
          reviewerName: reviewer.reviewerName || null
        }
      }
    });
  }

  return kyc;
}

async function reviewDocumentSubmission(submissionId, payload = {}, requestMeta = {}) {
  const decision = normalizeDecision(payload.decision);
  const remarks = String(payload.remarks || "").trim();
  const reviewer = getReviewerIdentity(requestMeta);

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
    include: {
      kyc: true
    }
  });

  if (!existing) {
    return {
      success: false,
      statusCode: 404,
      code: "DOCUMENT_SUBMISSION_NOT_FOUND",
      message: "Document submission not found."
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    await ensureCaseMovesToUnderReview(
      tx,
      existing.kycId,
      requestMeta,
      reviewer
    );

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
              rejectedAt: null
            }
          : {
              status: "resubmission_required",
              reviewerRemarks: remarks,
              reviewedBy: reviewer.reviewerId,
              reviewedAt: new Date(),
              acceptedAt: null,
              rejectedAt: new Date()
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

async function reviewVideoDeclaration(declarationId, payload = {}, requestMeta = {}) {
  const decision = normalizeDecision(payload.decision);
  const remarks = String(payload.remarks || "").trim();
  const reviewer = getReviewerIdentity(requestMeta);

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
    include: {
      kyc: true
    }
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
    await ensureCaseMovesToUnderReview(
      tx,
      existing.kycId,
      requestMeta,
      reviewer
    );

    const updated = await tx.kycVideoDeclaration.update({
      where: { id: declarationId },
      data:
        decision === "accepted"
          ? {
              status: "accepted",
              reviewerRemarks: remarks || "Video declaration accepted.",
              reviewedBy: reviewer.reviewerId,
              reviewedAt: new Date()
            }
          : {
              status: "resubmission_required",
              reviewerRemarks: remarks,
              reviewedBy: reviewer.reviewerId,
              reviewedAt: new Date()
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

async function finalDecisionForKyc(kycId, payload = {}, requestMeta = {}) {
  const decision = normalizeDecision(payload.decision);
  const remarks = String(payload.remarks || "").trim();
  const reviewer = getReviewerIdentity(requestMeta);

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

    return {
      finalReview,
      updatedKyc
    };
  });

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

module.exports = {
  listKycCases,
  getKycCaseDetail,
  reviewDocumentSubmission,
  reviewVideoDeclaration,
  finalDecisionForKyc
};
