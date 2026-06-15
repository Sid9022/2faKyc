const path = require("path");

const prisma = require("../../config/prisma");
const { hashKycToken } = require("../kyc-link/kycLink.utils");
const { validateDocumentFile } = require("../../utils/fileValidation.util");
const {
  UPLOAD_ROOT,
  generateStoredName,
  hashFile,
  moveIntoPlace,
  removeQuietly,
  cleanupRequestFiles
} = require("../../utils/fileStorage.util");
const { runAutoChecksForKyc } = require("../auto-checks/autoChecks.service");
const {
  isPanDocument,
  validatePanCardForKyc
} = require("../pan-validation/panValidation.service");

const FINAL_KYC_STATUSES = ["approved", "rejected", "expired", "cancelled"];

function isResubmissionMode(kyc) {
  return (
    kyc.overallStatus === "resubmission_required" ||
    kyc.currentStage === "resubmission_required"
  );
}

function getFilesFromRequest(files = {}) {
  const result = [];

  for (const slot of ["front", "back", "document", "extra"]) {
    const slotFiles = files[slot] || [];

    for (const file of slotFiles) {
      result.push({ slot, file });
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
    case "upload_or_live_photo":
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
        include: { consent: true }
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

  return { success: true, link, kyc: link.kyc };
}

/**
 * Legacy fallback: KYCs created before checklist snapshotting have no
 * submission rows until first save. Snapshot them now.
 */
async function ensureSnapshotExists(kyc) {
  const count = await prisma.kycDocumentSubmission.count({
    where: { kycId: kyc.id }
  });

  if (count > 0) return;

  const entityType = await prisma.entityType.findUnique({
    where: { key: kyc.entityType },
    include: {
      requirements: {
        where: { isActive: true, inputMode: { not: "live_video" } },
        orderBy: { sortOrder: "asc" }
      }
    }
  });

  for (const requirement of entityType?.requirements || []) {
    await prisma.kycDocumentSubmission.create({
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
}

/**
 * The buyer's checklist comes from the snapshotted submission rows —
 * admin edits to DocumentRequirement never change an in-flight KYC.
 */
async function getSubmissionStepsForKyc(kyc) {
  await ensureSnapshotExists(kyc);

  if (isResubmissionMode(kyc)) {
    return prisma.kycDocumentSubmission.findMany({
      where: {
        kycId: kyc.id,
        resubmissionRequestedAt: { not: null },
        status: { in: ["resubmission_required", "draft_saved", "submitted"] }
      },
      include: {
        files: {
          where: { isCurrent: true },
          orderBy: { uploadedAt: "desc" }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });
  }

  return prisma.kycDocumentSubmission.findMany({
    where: { kycId: kyc.id },
    include: {
      files: {
        where: { isCurrent: true },
        orderBy: { uploadedAt: "desc" }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
}

function formatCurrentFiles(files = [], rawToken = null) {
  return files.map((file) => ({
    id: file.id,
    fileSlot: file.fileSlot,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    version: file.version,
    uploadedAt: file.uploadedAt,
    fileUrl: rawToken ? `/api/public/kyc/${rawToken}/files/${file.id}` : null
  }));
}

function formatStep(submission, rawToken) {
  return {
    requirementId: submission.requirementId,
    submissionId: submission.id,
    documentKey: submission.documentKey,
    documentName: submission.documentName,
    inputMode: submission.inputMode,
    isRequired: submission.isRequired,
    needsFront: submission.needsFront,
    needsBack: submission.needsBack,
    ocrEnabled: submission.ocrEnabled,
    sortOrder: submission.sortOrder,
    status: submission.status,
    notes: submission.notes || "",
    reviewerRemarks: submission.reviewerRemarks || null,
    saveCount: submission.saveCount,
    currentVersion: submission.currentVersion,
    lastSavedAt: submission.lastSavedAt,
    submittedAt: submission.submittedAt,
    currentFiles: formatCurrentFiles(submission.files || [], rawToken)
  };
}

async function getDocumentWorkspace(rawToken) {
  const auth = await getActiveKycByToken(rawToken);

  if (!auth.success) return auth;

  const { kyc } = auth;

  const submissions = await getSubmissionStepsForKyc(kyc);
  const steps = submissions.map((submission) => formatStep(submission, rawToken));

  const completedSteps = steps.filter((step) =>
    ["draft_saved", "skipped", "submitted", "accepted"].includes(step.status)
  ).length;

  let progress = await prisma.kycDocumentProgress.findUnique({
    where: { kycId: kyc.id }
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
      where: { kycId: kyc.id },
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

/**
 * Validates magic bytes + hashes each uploaded temp file.
 * Returns { success } | { success: false, ... } and enriches items.
 */
async function validateIncomingFiles(incomingFiles) {
  for (const item of incomingFiles) {
    const validation = validateDocumentFile(item.file.path);

    if (!validation.isValid) {
      return {
        success: false,
        statusCode: 400,
        code: "INVALID_FILE_CONTENT",
        message: `${item.file.originalname} is not a valid JPG, PNG, WEBP, or PDF file. File content does not match its type.`
      };
    }

    item.detectedType = validation.detectedType;
    item.fileHash = await hashFile(item.file.path);
  }

  return { success: true };
}

async function saveDocumentStep(rawToken, requirementId, body = {}, files = {}, requestMeta = {}) {
  const incomingFiles = getFilesFromRequest(files);

  try {
    return await saveDocumentStepInner(
      rawToken,
      requirementId,
      body,
      incomingFiles,
      requestMeta
    );
  } finally {
    // Whatever happened, temp files must not pile up.
    await cleanupRequestFiles(files);
  }
}

async function saveDocumentStepInner(rawToken, requirementId, body, incomingFiles, requestMeta) {
  const auth = await getActiveKycByToken(rawToken);

  if (!auth.success) return auth;

  const { kyc } = auth;

  const progress = await prisma.kycDocumentProgress.findUnique({
    where: { kycId: kyc.id }
  });

  if (progress?.isFinalSubmitted && !isResubmissionMode(kyc)) {
    return {
      success: false,
      statusCode: 409,
      code: "DOCUMENTS_ALREADY_FINAL_SUBMITTED",
      message: "Documents are already final submitted. Editing is locked."
    };
  }

  const submissions = await getSubmissionStepsForKyc(kyc);

  const submissionIndex = submissions.findIndex(
    (item) => item.requirementId === requirementId
  );

  const submission = submissions[submissionIndex];

  if (!submission) {
    return {
      success: false,
      statusCode: 404,
      code: "DOCUMENT_REQUIREMENT_NOT_FOUND",
      message: "Document requirement not found for this KYC."
    };
  }

  const skipOptional = body.skipOptional === "true" || body.skipOptional === true;

  if (skipOptional && submission.isRequired) {
    return {
      success: false,
      statusCode: 400,
      code: "REQUIRED_DOCUMENT_CANNOT_BE_SKIPPED",
      message: "Required document cannot be skipped."
    };
  }

  const allowedSlots = getAllowedSlots(submission.inputMode);

  const invalidSlot = incomingFiles.find(
    (item) => !allowedSlots.includes(item.slot)
  );

  if (invalidSlot) {
    return {
      success: false,
      statusCode: 400,
      code: "INVALID_FILE_SLOT",
      message: `${invalidSlot.slot} file is not allowed for ${submission.documentName}.`
    };
  }

  const resubmissionMode = isResubmissionMode(kyc);

  if (resubmissionMode) {
    if (skipOptional) {
      return {
        success: false,
        statusCode: 400,
        code: "SKIP_NOT_ALLOWED_IN_RESUBMISSION",
        message:
          "Please upload the corrected document. Skipping is not allowed during resubmission."
      };
    }

    if (!submission.resubmissionRequestedAt) {
      return {
        success: false,
        statusCode: 403,
        code: "DOCUMENT_LOCKED",
        message: "This document is already accepted or not requested for correction."
      };
    }
  }

  const existingSlots = new Set(
    (submission.files || []).map((file) => file.fileSlot)
  );
  const incomingSlots = new Set(incomingFiles.map((item) => item.slot));
  const combinedSlots = new Set([...existingSlots, ...incomingSlots]);

  if (!skipOptional) {
    const requiredSlots = getRequiredSlots(submission.inputMode);

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

  // Content validation BEFORE anything is persisted.
  if (isReplacingFiles) {
    const validation = await validateIncomingFiles(incomingFiles);
    if (!validation.success) return validation;
  }

  // PAN-card gate: a PAN document's primary image must be recognized as a real
  // PAN card before we keep it. Runs on the temp file, before it's stored.
  let panValidationRecord = null;

  if (isReplacingFiles && isPanDocument(submission.documentKey)) {
    const isImage = (item) =>
      String(item.detectedType || item.file.mimetype).startsWith("image/");

    const target =
      incomingFiles.find((item) => item.slot === "front" && isImage(item)) ||
      incomingFiles.find((item) => item.slot === "document" && isImage(item)) ||
      incomingFiles.find(isImage) ||
      incomingFiles[0];

    const panResult = await validatePanCardForKyc({
      filePath: target.file.path,
      mimeType: target.detectedType || target.file.mimetype,
      kyc
    });

    panValidationRecord = panResult.record || null;

    if (panResult.gate === "reject") {
      // File is NOT saved — record the rejection for the audit trail.
      await prisma.kycAuditLog.create({
        data: {
          kycId: kyc.id,
          actorType: "buyer",
          action: "pan_card_validation_rejected",
          ipAddress: requestMeta.ipAddress || null,
          userAgent: requestMeta.userAgent || null,
          metadata: {
            documentKey: submission.documentKey,
            code: panResult.code,
            ...(panResult.record || {})
          }
        }
      });

      return {
        success: false,
        statusCode: 400,
        code: panResult.code,
        message: panResult.message
      };
    }
  }

  const nextVersion = isReplacingFiles
    ? submission.currentVersion + 1
    : submission.currentVersion;

  // Move files into their final folder BEFORE the DB transaction, so a
  // crash leaves orphan files (harmless) instead of DB rows without files.
  const movedFiles = [];

  if (isReplacingFiles) {
    const finalDir = path.join(
      UPLOAD_ROOT,
      "kyc-documents",
      kyc.id,
      submission.id,
      `v${nextVersion}`
    );

    for (const item of incomingFiles) {
      const storedName = generateStoredName(item.file.originalname);
      const finalPath = await moveIntoPlace(item.file.path, finalDir, storedName);

      movedFiles.push({
        slot: item.slot,
        originalName: item.file.originalname,
        storedName,
        mimeType: item.detectedType || item.file.mimetype,
        sizeBytes: item.file.size,
        storagePath: finalPath,
        fileHash: item.fileHash
      });
    }
  }

  let result;

  try {
    result = await prisma.$transaction(async (tx) => {
      if (isReplacingFiles) {
        await tx.kycDocumentFile.updateMany({
          where: {
            submissionId: submission.id,
            isCurrent: true
          },
          data: { isCurrent: false }
        });

        for (const moved of movedFiles) {
          await tx.kycDocumentFile.create({
            data: {
              submissionId: submission.id,
              kycId: kyc.id,
              fileSlot: moved.slot,
              originalName: moved.originalName,
              storedName: moved.storedName,
              mimeType: moved.mimeType,
              sizeBytes: moved.sizeBytes,
              fileHash: moved.fileHash,
              storagePath: moved.storagePath,
              publicPath: null,
              version: nextVersion,
              isCurrent: true,
              ipAddress: requestMeta.ipAddress || null,
              userAgent: requestMeta.userAgent || null,
              metadata: {
                source: "buyer_document_upload",
                ...(panValidationRecord
                  ? { panValidation: panValidationRecord }
                  : {})
              }
            }
          });
        }
      }

      const updatedSubmission = await tx.kycDocumentSubmission.update({
        where: { id: submission.id },
        data: {
          status: skipOptional ? "skipped" : "draft_saved",
          notes: body.notes || null,
          saveCount: { increment: isReplacingFiles ? 1 : 0 },
          currentVersion: nextVersion,
          lastSavedAt: new Date(),

          reviewedBy: resubmissionMode ? null : submission.reviewedBy,
          reviewedAt: resubmissionMode ? null : submission.reviewedAt,
          acceptedAt: resubmissionMode ? null : submission.acceptedAt,
          rejectedAt: resubmissionMode ? null : submission.rejectedAt
        }
      });

      const nextStepIndex = Math.min(submissionIndex + 1, submissions.length - 1);
      const nextSubmission = submissions[nextStepIndex];

      const lastAction = skipOptional
        ? "optional_document_skipped"
        : isReplacingFiles
          ? "document_draft_saved"
          : "document_step_continued_without_file_change";

      await tx.kycDocumentProgress.upsert({
        where: { kycId: kyc.id },
        update: {
          currentStepIndex: nextStepIndex,
          currentRequirementId: nextSubmission?.requirementId || submission.requirementId,
          currentDocumentKey: nextSubmission?.documentKey || submission.documentKey,
          totalSteps: submissions.length,
          lastAction
        },
        create: {
          kycId: kyc.id,
          currentStepIndex: nextStepIndex,
          currentRequirementId: nextSubmission?.requirementId || submission.requirementId,
          currentDocumentKey: nextSubmission?.documentKey || submission.documentKey,
          totalSteps: submissions.length,
          lastAction
        }
      });

      await tx.kycMaster.update({
        where: { id: kyc.id },
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
            requirementId: submission.requirementId,
            documentKey: submission.documentKey,
            documentName: submission.documentName,
            version: nextVersion,
            fileCount: incomingFiles.length,
            reusedExistingFile: !isReplacingFiles,
            ...(panValidationRecord ? { panValidation: panValidationRecord } : {})
          }
        }
      });

      return updatedSubmission;
    });
  } catch (error) {
    // DB failed after files moved — remove the orphans, then rethrow.
    await Promise.all(movedFiles.map((moved) => removeQuietly(moved.storagePath)));
    throw error;
  }

  return getDocumentWorkspace(rawToken);
}

async function updateDocumentProgress(rawToken, payload = {}, requestMeta = {}) {
  const auth = await getActiveKycByToken(rawToken);

  if (!auth.success) return auth;

  const { kyc } = auth;
  const submissions = await getSubmissionStepsForKyc(kyc);

  const nextIndex = Math.max(
    0,
    Math.min(Number(payload.currentStepIndex || 0), submissions.length - 1)
  );

  const current = submissions[nextIndex];

  const progress = await prisma.kycDocumentProgress.upsert({
    where: { kycId: kyc.id },
    update: {
      currentStepIndex: nextIndex,
      currentRequirementId: current?.requirementId || null,
      currentDocumentKey: current?.documentKey || null,
      totalSteps: submissions.length,
      lastAction: "document_step_changed"
    },
    create: {
      kycId: kyc.id,
      currentStepIndex: nextIndex,
      currentRequirementId: current?.requirementId || null,
      currentDocumentKey: current?.documentKey || null,
      totalSteps: submissions.length,
      lastAction: "document_step_changed"
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
    where: { kycId: kyc.kycId }
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
    // Only drafts become submitted — skipped optionals STAY skipped so the
    // reviewer never sees a file-less "submitted" document.
    await tx.kycDocumentSubmission.updateMany({
      where: {
        kycId: kyc.kycId,
        status: "draft_saved"
      },
      data: {
        status: "submitted",
        submittedAt: new Date()
      }
    });

    const updatedProgress = await tx.kycDocumentProgress.update({
      where: { kycId: kyc.kycId },
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
        where: { kycId: kyc.kycId }
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
      where: { id: kyc.kycId },
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

    return { updatedKyc, updatedProgress };
  });

  // Resubmission went straight back to "submitted" — refresh auto-checks.
  if (result.updatedKyc.overallStatus === "submitted") {
    runAutoChecksForKyc(kyc.kycId).catch((error) =>
      console.error("[auto-checks] failed:", error.message)
    );
  }

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
      files: { orderBy: { uploadedAt: "desc" } }
    },
    orderBy: { updatedAt: "desc" },
    take: 100
  });
}

async function getDevDocumentProgress() {
  return prisma.kycDocumentProgress.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100
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
