const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const prisma = require("../../config/prisma");
const { hashKycToken } = require("../kyc-link/kycLink.utils");

const FINAL_KYC_STATUSES = ["approved", "rejected", "expired", "cancelled"];

function isResubmissionMode(kyc) {
  return (
    kyc.overallStatus === "resubmission_required" ||
    kyc.currentStage === "resubmission_required"
  );
}

function getUploadRoot() {
  return path.join(process.cwd(), "uploads", "kyc-documents");
}

function safeFileName(name = "file") {
  const ext = path.extname(name);
  const base = path
    .basename(name, ext)
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .slice(0, 40);

  return `${base || "file"}${ext}`;
}

function getFilesFromRequest(files = {}) {
  const result = [];

  for (const slot of ["front", "back", "document", "extra"]) {
    const slotFiles = files[slot] || [];

    for (const file of slotFiles) {
      result.push({
        slot,
        file
      });
    }
  }

  return result;
}

function getRequiredSlots(inputMode) {
  switch (inputMode) {
    case "live_photo_front":
      return ["front"];

    case "live_photo_front_back":
      return ["front", "back"];

    case "upload":
      return ["document"];

    case "upload_or_live_photo":
      return ["document"];

    default:
      return ["document"];
  }
}

function getAllowedSlots(inputMode) {
  switch (inputMode) {
    case "live_photo_front":
      return ["front", "document"];

    case "live_photo_front_back":
      return ["front", "back"];

    case "upload":
      return ["document"];

    case "upload_or_live_photo":
      return ["document", "front"];

    default:
      return ["document"];
  }
}

async function getActiveKycByToken(rawToken) {
  const tokenHash = hashKycToken(rawToken);

  const link = await prisma.kycLink.findUnique({
    where: { tokenHash },
    include: {
      kyc: {
        include: {
          consent: true
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

  if (FINAL_KYC_STATUSES.includes(link.kyc.overallStatus)) {
    return {
      success: false,
      statusCode: 409,
      code: "KYC_ALREADY_FINALIZED",
      message: `KYC is already ${link.kyc.overallStatus}.`
    };
  }

  if (!link.kyc.consent) {
    return {
      success: false,
      statusCode: 403,
      code: "CONSENT_REQUIRED",
      message: "Please complete consent before uploading documents."
    };
  }

  return {
    success: true,
    link,
    kyc: link.kyc
  };
}

async function getDocumentRequirementsForKyc(kyc) {
  if (isResubmissionMode(kyc)) {
    const failedSubmissions = await prisma.kycDocumentSubmission.findMany({
      where: {
        kycId: kyc.id,
        resubmissionRequestedAt: {
          not: null
        },
        status: {
          in: ["resubmission_required", "draft_saved", "submitted"]
        }
      },
      include: {
        requirement: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return failedSubmissions
      .map((submission) => submission.requirement)
      .filter(Boolean);
  }

  const entityType = await prisma.entityType.findUnique({
    where: {
      key: kyc.entityType
    },
    include: {
      requirements: {
        where: {
          isActive: true,
          inputMode: {
            not: "live_video"
          }
        },
        orderBy: {
          sortOrder: "asc"
        }
      }
    }
  });

  return entityType?.requirements || [];
}

function formatCurrentFiles(files = []) {
  return files.map((file) => ({
    id: file.id,
    fileSlot: file.fileSlot,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    publicPath: file.publicPath,
    version: file.version,
    uploadedAt: file.uploadedAt
  }));
}

function formatStep(requirement, submission) {
  const currentFiles = submission?.files || [];

  return {
    requirementId: requirement.id,
    documentKey: requirement.documentKey,
    documentName: requirement.documentName,
    inputMode: requirement.inputMode,
    isRequired: requirement.isRequired,
    needsFront: requirement.needsFront,
    needsBack: requirement.needsBack,
    ocrEnabled: requirement.ocrEnabled,
    sortOrder: requirement.sortOrder,
    status: submission?.status || "not_started",
    notes: submission?.notes || "",
    saveCount: submission?.saveCount || 0,
    currentVersion: submission?.currentVersion || 0,
    lastSavedAt: submission?.lastSavedAt || null,
    submittedAt: submission?.submittedAt || null,
    currentFiles: formatCurrentFiles(currentFiles)
  };
}

async function getDocumentWorkspace(rawToken) {
  const auth = await getActiveKycByToken(rawToken);

  if (!auth.success) return auth;

  const { kyc } = auth;

  const requirements = await getDocumentRequirementsForKyc(kyc);

  const submissions = await prisma.kycDocumentSubmission.findMany({
    where: {
      kycId: kyc.id
    },
    include: {
      files: {
        where: {
          isCurrent: true
        },
        orderBy: {
          uploadedAt: "desc"
        }
      }
    }
  });

  const submissionMap = new Map(
    submissions.map((submission) => [submission.requirementId, submission])
  );

  const steps = requirements.map((requirement) =>
    formatStep(requirement, submissionMap.get(requirement.id))
  );

  const completedSteps = steps.filter((step) =>
    ["draft_saved", "skipped", "submitted", "accepted"].includes(step.status)
  ).length;

  let progress = await prisma.kycDocumentProgress.findUnique({
    where: {
      kycId: kyc.id
    }
  });

  if (!progress) {
    progress = await prisma.kycDocumentProgress.create({
      data: {
        kycId: kyc.id,
        currentStepIndex: 0,
        currentRequirementId: steps[0]?.requirementId || null,
        currentDocumentKey: steps[0]?.documentKey || null,
        totalSteps: steps.length,
        completedSteps,
        lastAction: isResubmissionMode(kyc)
          ? "resubmission_document_workspace_opened"
          : "document_workspace_opened"
      }
    });
  } else {
    progress = await prisma.kycDocumentProgress.update({
      where: {
        kycId: kyc.id
      },
      data: {
        totalSteps: steps.length,
        completedSteps
      }
    });
  }

  return {
    success: true,
    message: "Document workspace loaded.",
    kyc: {
      kycId: kyc.id,
      buyerName: kyc.buyerName,
      panMasked: kyc.panMasked,
      entityType: kyc.entityType,
      entityLabel: kyc.entityLabel,
      serviceType: kyc.serviceType,
      overallStatus: kyc.overallStatus,
      currentStage: kyc.currentStage,
      isResubmissionMode: isResubmissionMode(kyc)
    },
    progress,
    steps
  };
}

async function saveUploadedFiles({
  kycId,
  submissionId,
  version,
  incomingFiles,
  requestMeta
}) {
  const createdFiles = [];

  const uploadFolder = path.join(
    getUploadRoot(),
    kycId,
    submissionId,
    `v${version}`
  );

  fs.mkdirSync(uploadFolder, { recursive: true });

  for (const item of incomingFiles) {
    const originalName = item.file.originalname;
    const storedName = `${Date.now()}-${crypto.randomUUID()}-${safeFileName(
      originalName
    )}`;

    const storagePath = path.join(uploadFolder, storedName);

    fs.writeFileSync(storagePath, item.file.buffer);

    const relativePath = `/uploads/kyc-documents/${kycId}/${submissionId}/v${version}/${storedName}`;

    const created = await prisma.kycDocumentFile.create({
      data: {
        submissionId,
        kycId,
        fileSlot: item.slot,
        originalName,
        storedName,
        mimeType: item.file.mimetype,
        sizeBytes: item.file.size,
        storagePath,
        publicPath: relativePath,
        version,
        isCurrent: true,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          source: "buyer_document_upload"
        }
      }
    });

    createdFiles.push(created);
  }

  return createdFiles;
}

async function saveDocumentStep(rawToken, requirementId, body = {}, files = {}, requestMeta = {}) {
  const auth = await getActiveKycByToken(rawToken);

  if (!auth.success) return auth;

  const { kyc } = auth;

  const progress = await prisma.kycDocumentProgress.findUnique({
    where: {
      kycId: kyc.id
    }
  });

  if (progress?.isFinalSubmitted) {
    return {
      success: false,
      statusCode: 409,
      code: "DOCUMENTS_ALREADY_FINAL_SUBMITTED",
      message: "Documents are already final submitted. Editing is locked."
    };
  }

  const requirements = await getDocumentRequirementsForKyc(kyc);

  const requirementIndex = requirements.findIndex(
    (item) => item.id === requirementId
  );

  const requirement = requirements[requirementIndex];

  if (!requirement) {
    return {
      success: false,
      statusCode: 404,
      code: "DOCUMENT_REQUIREMENT_NOT_FOUND",
      message: "Document requirement not found for this KYC."
    };
  }

  const skipOptional = body.skipOptional === "true" || body.skipOptional === true;

  if (skipOptional && requirement.isRequired) {
    return {
      success: false,
      statusCode: 400,
      code: "REQUIRED_DOCUMENT_CANNOT_BE_SKIPPED",
      message: "Required document cannot be skipped."
    };
  }

  const incomingFiles = getFilesFromRequest(files);

  const allowedSlots = getAllowedSlots(requirement.inputMode);

  const invalidSlot = incomingFiles.find(
    (item) => !allowedSlots.includes(item.slot)
  );

  if (invalidSlot) {
    return {
      success: false,
      statusCode: 400,
      code: "INVALID_FILE_SLOT",
      message: `${invalidSlot.slot} file is not allowed for ${requirement.documentName}.`
    };
  }

  const existingSubmissionWithFiles =
    await prisma.kycDocumentSubmission.findUnique({
      where: {
        kycId_requirementId: {
          kycId: kyc.id,
          requirementId: requirement.id
        }
      },
      include: {
        files: {
          where: {
            isCurrent: true
          }
        }
      }
    });

  const resubmissionMode = isResubmissionMode(kyc);

  if (resubmissionMode) {
    if (skipOptional) {
      return {
        success: false,
        statusCode: 400,
        code: "SKIP_NOT_ALLOWED_IN_RESUBMISSION",
        message: "Please upload the corrected document. Skipping is not allowed during resubmission."
      };
    }

    if (!existingSubmissionWithFiles) {
      return {
        success: false,
        statusCode: 403,
        code: "DOCUMENT_NOT_PART_OF_RESUBMISSION",
        message: "This document is not part of the current resubmission request."
      };
    }

    if (!existingSubmissionWithFiles.resubmissionRequestedAt) {
      return {
        success: false,
        statusCode: 403,
        code: "DOCUMENT_LOCKED",
        message: "This document is already accepted or not requested for correction."
      };
    }

    if (
      !["resubmission_required", "draft_saved", "submitted"].includes(
        existingSubmissionWithFiles.status
      )
    ) {
      return {
        success: false,
        statusCode: 403,
        code: "DOCUMENT_NOT_EDITABLE",
        message: `This document is currently ${existingSubmissionWithFiles.status} and cannot be edited.`
      };
    }
  }

  const existingSlots = new Set(
    existingSubmissionWithFiles?.files?.map((file) => file.fileSlot) || []
  );

  const incomingSlots = new Set(incomingFiles.map((item) => item.slot));

  const combinedSlots = new Set([...existingSlots, ...incomingSlots]);

  if (!skipOptional) {
    const requiredSlots = getRequiredSlots(requirement.inputMode);

    const missingSlots = requiredSlots.filter(
      (slot) => !combinedSlots.has(slot)
    );

    if (missingSlots.length > 0) {
      return {
        success: false,
        statusCode: 400,
        code: "DOCUMENT_FILES_REQUIRED",
        message: "Please upload required file(s) before moving next.",
        missingSlots
      };
    }
  }

  const isReplacingFiles = !skipOptional && incomingFiles.length > 0;

  const result = await prisma.$transaction(async (tx) => {
    let submission = await tx.kycDocumentSubmission.findUnique({
      where: {
        kycId_requirementId: {
          kycId: kyc.id,
          requirementId: requirement.id
        }
      }
    });

    if (!submission) {
      submission = await tx.kycDocumentSubmission.create({
        data: {
          kycId: kyc.id,
          requirementId: requirement.id,
          documentKey: requirement.documentKey,
          documentName: requirement.documentName,
          inputMode: requirement.inputMode,
          isRequired: requirement.isRequired,
          status: "not_started"
        }
      });
    }

    const nextVersion = skipOptional
      ? submission.currentVersion
      : isReplacingFiles
        ? submission.currentVersion + 1
        : submission.currentVersion;

    if (isReplacingFiles) {
      await tx.kycDocumentFile.updateMany({
        where: {
          submissionId: submission.id,
          isCurrent: true
        },
        data: {
          isCurrent: false
        }
      });
    }

    const updatedSubmission = await tx.kycDocumentSubmission.update({
      where: {
        id: submission.id
      },
      data: {
        status: skipOptional ? "skipped" : "draft_saved",
        notes: body.notes || null,
        saveCount: {
          increment: isReplacingFiles ? 1 : 0
        },
        currentVersion: nextVersion,
        lastSavedAt: new Date(),

        reviewedBy: resubmissionMode ? null : submission.reviewedBy,
        reviewedAt: resubmissionMode ? null : submission.reviewedAt,
        acceptedAt: resubmissionMode ? null : submission.acceptedAt,
        rejectedAt: resubmissionMode ? null : submission.rejectedAt
      }
    });

    const nextStepIndex = Math.min(requirementIndex + 1, requirements.length - 1);
    const nextRequirement = requirements[nextStepIndex];

    await tx.kycDocumentProgress.upsert({
      where: {
        kycId: kyc.id
      },
      update: {
        currentStepIndex: nextStepIndex,
        currentRequirementId: nextRequirement?.id || requirement.id,
        currentDocumentKey: nextRequirement?.documentKey || requirement.documentKey,
        totalSteps: requirements.length,
        lastAction: skipOptional
          ? "optional_document_skipped"
          : isReplacingFiles
            ? "document_draft_saved"
            : "document_step_continued_without_file_change"
      },
      create: {
        kycId: kyc.id,
        currentStepIndex: nextStepIndex,
        currentRequirementId: nextRequirement?.id || requirement.id,
        currentDocumentKey: nextRequirement?.documentKey || requirement.documentKey,
        totalSteps: requirements.length,
        lastAction: skipOptional
          ? "optional_document_skipped"
          : isReplacingFiles
            ? "document_draft_saved"
            : "document_step_continued_without_file_change"
      }
    });

    await tx.kycMaster.update({
      where: {
        id: kyc.id
      },
      data: resubmissionMode
        ? {
            overallStatus: "resubmission_required",
            currentStage: "resubmission_document_upload_in_progress"
          }
        : {
            overallStatus: "in_progress",
            currentStage: "document_upload_in_progress"
          }
    });

    await tx.kycAuditLog.create({
      data: {
        kycId: kyc.id,
        actorType: "buyer",
        action: resubmissionMode
          ? isReplacingFiles
            ? "kyc_resubmission_document_saved"
            : "kyc_resubmission_document_next_without_changes"
          : skipOptional
            ? "kyc_optional_document_skipped"
            : isReplacingFiles
              ? "kyc_document_saved"
              : "kyc_document_next_without_changes",
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          requirementId: requirement.id,
          documentKey: requirement.documentKey,
          documentName: requirement.documentName,
          version: nextVersion,
          fileCount: incomingFiles.length,
          reusedExistingFile: !isReplacingFiles
        }
      }
    });

    return updatedSubmission;
  });

  if (isReplacingFiles) {
    await saveUploadedFiles({
      kycId: kyc.id,
      submissionId: result.id,
      version: result.currentVersion,
      incomingFiles,
      requestMeta
    });
  }

  return getDocumentWorkspace(rawToken);
}

async function updateDocumentProgress(rawToken, payload = {}, requestMeta = {}) {
  const auth = await getActiveKycByToken(rawToken);

  if (!auth.success) return auth;

  const { kyc } = auth;
  const requirements = await getDocumentRequirementsForKyc(kyc);

  const nextIndex = Math.max(
    0,
    Math.min(Number(payload.currentStepIndex || 0), requirements.length - 1)
  );

  const currentRequirement = requirements[nextIndex];

  const progress = await prisma.kycDocumentProgress.upsert({
    where: {
      kycId: kyc.id
    },
    update: {
      currentStepIndex: nextIndex,
      currentRequirementId: currentRequirement?.id || null,
      currentDocumentKey: currentRequirement?.documentKey || null,
      totalSteps: requirements.length,
      lastAction: "document_step_changed"
    },
    create: {
      kycId: kyc.id,
      currentStepIndex: nextIndex,
      currentRequirementId: currentRequirement?.id || null,
      currentDocumentKey: currentRequirement?.documentKey || null,
      totalSteps: requirements.length,
      lastAction: "document_step_changed"
    }
  });

  await prisma.kycAuditLog.create({
    data: {
      kycId: kyc.id,
      actorType: "buyer",
      action: "kyc_document_step_changed",
      ipAddress: requestMeta.ipAddress || null,
      userAgent: requestMeta.userAgent || null,
      metadata: {
        currentStepIndex: nextIndex,
        documentKey: currentRequirement?.documentKey || null
      }
    }
  });

  return {
    success: true,
    message: "Document progress updated.",
    progress
  };
}

function hasRequiredFiles(step) {
  if (!step.isRequired) return true;

  if (step.status !== "draft_saved" && step.status !== "submitted") {
    return false;
  }

  const slots = new Set(step.currentFiles.map((file) => file.fileSlot));
  const requiredSlots = getRequiredSlots(step.inputMode);

  return requiredSlots.every((slot) => slots.has(slot));
}

async function finalSubmitDocuments(rawToken, requestMeta = {}) {
  const workspace = await getDocumentWorkspace(rawToken);

  if (!workspace.success) return workspace;

  const { kyc, steps } = workspace;
  const resubmissionMode = kyc.isResubmissionMode;

  const progress = await prisma.kycDocumentProgress.findUnique({
    where: {
      kycId: kyc.kycId
    }
  });

  if (progress?.isFinalSubmitted) {
    return {
      success: true,
      idempotent: true,
      message: "Documents were already final submitted earlier.",
      kyc,
      progress
    };
  }

  const missingRequired = steps.filter((step) => !hasRequiredFiles(step));

  if (missingRequired.length > 0) {
    return {
      success: false,
      statusCode: 400,
      code: "REQUIRED_DOCUMENTS_MISSING",
      message: "Please complete all required documents before final submission.",
      missingRequired: missingRequired.map((item) => ({
        requirementId: item.requirementId,
        documentKey: item.documentKey,
        documentName: item.documentName
      }))
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.kycDocumentSubmission.updateMany({
      where: {
        kycId: kyc.kycId,
        status: {
          in: ["draft_saved", "skipped"]
        }
      },
      data: {
        status: "submitted",
        submittedAt: new Date()
      }
    });

    const updatedProgress = await tx.kycDocumentProgress.update({
      where: {
        kycId: kyc.kycId
      },
      data: {
        isFinalSubmitted: true,
        finalSubmittedAt: new Date(),
        completedSteps: steps.length,
        lastAction: resubmissionMode
          ? "resubmission_documents_final_submitted"
          : "documents_final_submitted"
      }
    });

    let nextKycState = resubmissionMode
      ? {
          overallStatus: "submitted",
          currentStage: "resubmission_submitted"
        }
      : {
          overallStatus: "in_progress",
          currentStage: "documents_completed"
        };

    if (resubmissionMode) {
      const videoDeclaration = await tx.kycVideoDeclaration.findUnique({
        where: {
          kycId: kyc.kycId
        }
      });

      const videoStillNeedsCorrection =
        videoDeclaration?.resubmissionRequestedAt &&
        ["resubmission_required", "session_started"].includes(
          videoDeclaration.status
        );

      if (videoStillNeedsCorrection) {
        nextKycState = {
          overallStatus: "resubmission_required",
          currentStage: "resubmission_video_pending"
        };
      }
    }

    const updatedKyc = await tx.kycMaster.update({
      where: {
        id: kyc.kycId
      },
      data: nextKycState
    });

    await tx.kycAuditLog.create({
      data: {
        kycId: kyc.kycId,
        actorType: "buyer",
        action: resubmissionMode
          ? "kyc_resubmission_documents_final_submitted"
          : "kyc_documents_final_submitted",
        oldStatus: kyc.overallStatus,
        newStatus: nextKycState.overallStatus,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          currentStage: nextKycState.currentStage,
          totalSteps: steps.length
        }
      }
    });

    return {
      updatedKyc,
      updatedProgress
    };
  });

  return {
    success: true,
    message: "Documents final submitted successfully. Editing is now locked.",
    kyc: {
      kycId: result.updatedKyc.id,
      overallStatus: result.updatedKyc.overallStatus,
      currentStage: result.updatedKyc.currentStage
    },
    progress: result.updatedProgress
  };
}

async function getDevDocumentSubmissions() {
  return prisma.kycDocumentSubmission.findMany({
    include: {
      files: {
        orderBy: {
          uploadedAt: "desc"
        }
      }
    },
    orderBy: {
      updatedAt: "desc"
    }
  });
}

async function getDevDocumentProgress() {
  return prisma.kycDocumentProgress.findMany({
    orderBy: {
      updatedAt: "desc"
    }
  });
}

module.exports = {
  getDocumentWorkspace,
  saveDocumentStep,
  updateDocumentProgress,
  finalSubmitDocuments,
  getDevDocumentSubmissions,
  getDevDocumentProgress
};
