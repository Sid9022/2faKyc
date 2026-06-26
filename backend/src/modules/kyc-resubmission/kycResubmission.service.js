const prisma = require("../../config/prisma");
const { hashKycToken } = require("../kyc-link/kycLink.utils");
const { maskEmail } = require("../../utils/crypto.util");
const { isResubmissionMode, isFinalKycStatus } = require("../../utils/kycStage.util");

async function getResubmissionWorkspace(rawToken) {
  const tokenHash = hashKycToken(rawToken);

  const link = await prisma.kycLink.findUnique({
    where: { tokenHash },
    include: {
      kyc: {
        include: {
          documentSubmissions: {
            include: {
              files: {
                where: {
                  isCurrent: true
                },
                orderBy: {
                  uploadedAt: "desc"
                }
              }
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
          documentProgress: true
        }
      }
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

  if (link.expiresAt <= new Date()) {
    await prisma.kycLink.update({
      where: { id: link.id },
      data: { status: "expired" }
    });

    return {
      success: false,
      statusCode: 410,
      code: "KYC_LINK_EXPIRED",
      message: "This KYC link has expired."
    };
  }

  // Bug A17: a buyer with a still-active link can otherwise keep
  // hitting this endpoint after a terminal decision (approved / rejected
  // / expired / cancelled). The document and video endpoints refuse
  // this with `KYC_ALREADY_FINALIZED`; the resubmission endpoint must
  // match. Without the guard, an approved KYC's full PII stays reachable
  // via the resubmission workspace until the link expires.
  if (isFinalKycStatus(link.kyc)) {
    return {
      success: false,
      statusCode: 409,
      code: "KYC_ALREADY_FINALIZED",
      message:
        "This KYC has already been finalized. No further changes can be made."
    };
  }

  const kyc = link.kyc;

  const documents = kyc.documentSubmissions || [];

  const documentsNeedingResubmission = documents.filter(
    (doc) =>
      doc.resubmissionRequestedAt &&
      ["resubmission_required", "draft_saved", "submitted"].includes(doc.status)
  );

  const acceptedDocuments = documents.filter((doc) => doc.status === "accepted");

  const pendingDocuments = documents.filter((doc) =>
    ["submitted", "draft_saved"].includes(doc.status)
  );

  const video = kyc.videoDeclaration;

  const videoNeedingResubmission =
    video?.resubmissionRequestedAt &&
    ["resubmission_required", "session_started", "submitted"].includes(
      video.status
    )
      ? video
      : null;

  const videoAccepted = video?.status === "accepted";

  let nextAction = "none";

  const docsStillNeedBuyerAction = documentsNeedingResubmission.some((doc) =>
    ["resubmission_required", "draft_saved"].includes(doc.status)
  );

  const docsSubmittedForReview = documentsNeedingResubmission.some(
    (doc) => doc.status === "submitted"
  );

  const videoStillNeedsBuyerAction =
    videoNeedingResubmission &&
    ["resubmission_required", "session_started"].includes(
      videoNeedingResubmission.status
    );

  const videoSubmittedForReview =
    videoNeedingResubmission?.status === "submitted";

  if (docsStillNeedBuyerAction) {
    nextAction = "resubmit_documents";
  } else if (videoStillNeedsBuyerAction) {
    nextAction = "resubmit_video";
  } else if (docsSubmittedForReview || videoSubmittedForReview) {
    nextAction = "waiting_for_review";
  }

  return {
    success: true,
    message: "Resubmission workspace loaded.",
    mode: isResubmissionMode(kyc) ? "resubmission_required" : "not_in_resubmission",
    nextAction,
    kyc: {
      kycId: kyc.id,
      buyerName: kyc.buyerName,
      // Bug A18: never decrypt the buyer's email on a buyer-facing
      // endpoint. The other buyer endpoints (openKycLink, getDocument
      // workspace) only return masked PII. Return the masked email
      // (`a***e@domain.com`) so the field stays useful for debugging
      // without leaking plaintext. The frontend does not currently
      // render this field.
      buyerEmail: maskEmail(kyc.buyerEmail),
      panMasked: kyc.panMasked,
      entityType: kyc.entityType,
      entityLabel: kyc.entityLabel,
      serviceType: kyc.serviceType,
      overallStatus: kyc.overallStatus,
      currentStage: kyc.currentStage
    },
    summary: {
      acceptedDocumentsCount: acceptedDocuments.length,
      documentsNeedingResubmissionCount: documentsNeedingResubmission.length,
      pendingDocumentsCount: pendingDocuments.length,
      videoAccepted,
      videoNeedsResubmission: Boolean(videoNeedingResubmission)
    },
    acceptedDocuments: acceptedDocuments.map((doc) => formatDocument(doc, rawToken)),
    documentsNeedingResubmission: documentsNeedingResubmission.map((doc) =>
      formatDocument(doc, rawToken)
    ),
    video: video
      ? {
          id: video.id,
          status: video.status,
          declarantFullName: video.declarantFullName,
          businessName: video.businessName,
          runtimeCode: video.runtimeCode,
          scriptText: video.scriptText,
          reviewerRemarks: video.reviewerRemarks,
          resubmissionRequestedAt: video.resubmissionRequestedAt,
          resubmissionCycle: video.resubmissionCycle,
          latestAttempt: video.attempts?.[0]
            ? {
                id: video.attempts[0].id,
                status: video.attempts[0].status,
                streamUrl: `/api/public/kyc/${rawToken}/video-attempts/${video.attempts[0].id}/stream`,
                mimeType: video.attempts[0].mimeType,
                durationSeconds: video.attempts[0].durationSeconds,
                uploadedAt: video.attempts[0].uploadedAt
              }
            : null
        }
      : null
  };
}

function formatDocument(doc, rawToken) {
  return {
    id: doc.id,
    requirementId: doc.requirementId,
    documentKey: doc.documentKey,
    documentName: doc.documentName,
    inputMode: doc.inputMode,
    isRequired: doc.isRequired,
    status: doc.status,
    notes: doc.notes,
    reviewerRemarks: doc.reviewerRemarks,
    resubmissionRequestedAt: doc.resubmissionRequestedAt,
    resubmissionCycle: doc.resubmissionCycle,
    currentVersion: doc.currentVersion,
    files: doc.files?.map((file) => ({
      id: file.id,
      fileSlot: file.fileSlot,
      originalName: file.originalName,
      mimeType: file.mimeType,
      fileUrl: `/api/public/kyc/${rawToken}/files/${file.id}`,
      version: file.version,
      uploadedAt: file.uploadedAt
    })) || []
  };
}

module.exports = {
  getResubmissionWorkspace
};
