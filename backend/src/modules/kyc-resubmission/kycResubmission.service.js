const prisma = require("../../config/prisma");
const { hashKycToken } = require("../kyc-link/kycLink.utils");

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
    mode:
      kyc.overallStatus === "resubmission_required" ||
      kyc.currentStage?.startsWith("resubmission")
        ? "resubmission_required"
        : "not_in_resubmission",
    nextAction,
    kyc: {
      kycId: kyc.id,
      buyerName: kyc.buyerName,
      buyerEmail: kyc.buyerEmail,
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
    acceptedDocuments: acceptedDocuments.map(formatDocument),
    documentsNeedingResubmission: documentsNeedingResubmission.map(formatDocument),
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
          latestAttempt: video.attempts?.[0] || null
        }
      : null
  };
}

function formatDocument(doc) {
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
      publicPath: file.publicPath,
      version: file.version,
      uploadedAt: file.uploadedAt
    })) || []
  };
}

module.exports = {
  getResubmissionWorkspace
};
