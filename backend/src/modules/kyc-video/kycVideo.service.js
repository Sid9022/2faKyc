const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const prisma = require("../../config/prisma");
const { hashKycToken } = require("../kyc-link/kycLink.utils");

const FINAL_KYC_STATUSES = ["approved", "rejected", "expired", "cancelled"];

function isResubmissionMode(kyc) {
  return (
    kyc.overallStatus === "resubmission_required" ||
    kyc.currentStage === "resubmission_required" ||
    kyc.currentStage === "resubmission_document_upload_in_progress"
  );
}

function generateRuntimeCode() {
  return String(crypto.randomInt(100000, 999999));
}

function getUploadRoot() {
  return path.join(process.cwd(), "uploads", "kyc-videos");
}

function safeFileName(name = "video.webm") {
  const ext = path.extname(name) || ".webm";
  const base = path
    .basename(name, ext)
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .slice(0, 40);

  return `${base || "video"}${ext}`;
}

function normalizeLanguage(language) {
  return ["en", "hi"].includes(language) ? language : "en";
}

function buildVideoScript({
  language,
  declarantFullName,
  businessName,
  serviceType,
  runtimeCode
}) {
  if (language === "hi") {
    return `Main ${declarantFullName} hoon. Main confirm karta/karti hoon ki main ${businessName} ke liye KYC submit karne ke liye authorized hoon. Mujhe apne business ke liye 2Factor ${serviceType} service chahiye. Mera verification code ${runtimeCode} hai.`;
  }

  return `I am ${declarantFullName}. I confirm that I am authorized to submit KYC for ${businessName}. I need 2Factor ${serviceType} service for my business. My verification code is ${runtimeCode}.`;
}

async function getActiveKycByToken(rawToken) {
  const tokenHash = hashKycToken(rawToken);

  const link = await prisma.kycLink.findUnique({
    where: { tokenHash },
    include: {
      kyc: {
        include: {
          consent: true,
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
      message: "Please complete consent before video declaration."
    };
  }

  if (!link.kyc.documentProgress?.isFinalSubmitted) {
    return {
      success: false,
      statusCode: 403,
      code: "DOCUMENTS_REQUIRED",
      message: "Please final submit documents before video declaration."
    };
  }

  return {
    success: true,
    link,
    kyc: link.kyc
  };
}

function validateStartPayload(payload = {}) {
  const declarantFullName = String(payload.declarantFullName || "").trim();
  const declarantRole = String(payload.declarantRole || "").trim();
  const businessName = String(payload.businessName || "").trim();
  const language = normalizeLanguage(payload.language);

  const errors = {};

  if (declarantFullName.length < 2) {
    errors.declarantFullName = "Declarant full name is required.";
  }

  if (businessName.length < 2) {
    errors.businessName = "Business name is required.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    data: {
      declarantFullName,
      declarantRole: declarantRole || null,
      businessName,
      language
    }
  };
}

async function startVideoDeclaration(rawToken, payload = {}, requestMeta = {}) {
  const auth = await getActiveKycByToken(rawToken);

  if (!auth.success) return auth;

  const { kyc } = auth;

  const validation = validateStartPayload(payload);

  if (!validation.isValid) {
    return {
      success: false,
      statusCode: 400,
      code: "INVALID_VIDEO_DECLARATION_DETAILS",
      message: "Please provide required video declaration details.",
      errors: validation.errors
    };
  }

  const existing = await prisma.kycVideoDeclaration.findUnique({
    where: {
      kycId: kyc.id
    }
  });

  if (existing?.status === "accepted") {
    return {
      success: false,
      statusCode: 403,
      code: "VIDEO_ALREADY_ACCEPTED",
      message: "Video declaration is already accepted and locked."
    };
  }

  if (existing?.status === "submitted" && !isResubmissionMode(kyc)) {
    return {
      success: true,
      idempotent: true,
      message: "Video declaration was already submitted.",
      declaration: formatDeclaration(existing)
    };
  }

  if (
    isResubmissionMode(kyc) &&
    existing &&
    !["resubmission_required", "session_started"].includes(existing.status)
  ) {
    return {
      success: false,
      statusCode: 403,
      code: "VIDEO_NOT_REQUESTED_FOR_RESUBMISSION",
      message: "Video declaration is not requested for resubmission."
    };
  }

  const runtimeCode = generateRuntimeCode();

  const scriptText = buildVideoScript({
    language: validation.data.language,
    declarantFullName: validation.data.declarantFullName,
    businessName: validation.data.businessName,
    serviceType: kyc.serviceType,
    runtimeCode
  });

  const declaration = await prisma.$transaction(async (tx) => {
    const saved = await tx.kycVideoDeclaration.upsert({
      where: {
        kycId: kyc.id
      },
      update: {
        declarantFullName: validation.data.declarantFullName,
        declarantRole: validation.data.declarantRole,
        businessName: validation.data.businessName,
        serviceType: kyc.serviceType,
        language: validation.data.language,
        scriptVersion: "v1",
        scriptText,
        runtimeCode,
        status: "session_started",
        currentAttemptId: null,
        faceCheckPassed: false,
        faceQualityMetadata: null,
        reviewerRemarks: existing?.reviewerRemarks || null,
        reviewedBy: null,
        reviewedAt: null,
        startedAt: new Date(),
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null
      },
      create: {
        kycId: kyc.id,
        declarantFullName: validation.data.declarantFullName,
        declarantRole: validation.data.declarantRole,
        businessName: validation.data.businessName,
        serviceType: kyc.serviceType,
        language: validation.data.language,
        scriptVersion: "v1",
        scriptText,
        runtimeCode,
        status: "session_started",
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null
      }
    });

    const isResubmission = isResubmissionMode(kyc);

    await tx.kycMaster.update({
      where: {
        id: kyc.id
      },
      data: isResubmission
        ? {
            overallStatus: "resubmission_required",
            currentStage: "resubmission_video_declaration_started"
          }
        : {
            overallStatus: "in_progress",
            currentStage: "video_declaration_started"
          }
    });

    await tx.kycAuditLog.create({
      data: {
        kycId: kyc.id,
        actorType: "buyer",
        action: isResubmission
          ? "video_declaration_resubmission_started"
          : "video_declaration_session_started",
        oldStatus: kyc.overallStatus,
        newStatus: isResubmission ? "resubmission_required" : "in_progress",
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          declarationId: saved.id,
          scriptVersion: saved.scriptVersion,
          language: saved.language
        }
      }
    });

    return saved;
  });

  return {
    success: true,
    message: "Video declaration session started.",
    declaration: formatDeclaration(declaration)
  };
}

function parseFaceMetadata(raw) {
  if (!raw) return null;

  if (typeof raw === "object") return raw;

  try {
    return JSON.parse(raw);
  } catch {
    return {
      raw
    };
  }
}

function parseBoolean(value) {
  return value === true || value === "true";
}

function parseNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

async function uploadVideoDeclaration(rawToken, body = {}, file, requestMeta = {}) {
  const auth = await getActiveKycByToken(rawToken);

  if (!auth.success) return auth;

  const { kyc } = auth;

  if (!file) {
    return {
      success: false,
      statusCode: 400,
      code: "VIDEO_FILE_REQUIRED",
      message: "Video file is required."
    };
  }

  const declaration = await prisma.kycVideoDeclaration.findUnique({
    where: {
      kycId: kyc.id
    }
  });

  if (!declaration) {
    return {
      success: false,
      statusCode: 400,
      code: "VIDEO_SESSION_REQUIRED",
      message: "Please start video declaration session first."
    };
  }

  const resubmissionMode = isResubmissionMode(kyc);

  if (declaration.status === "accepted") {
    return {
      success: false,
      statusCode: 403,
      code: "VIDEO_ALREADY_ACCEPTED",
      message: "Video declaration is already accepted and locked."
    };
  }

  if (declaration.status === "submitted" && !resubmissionMode) {
    return {
      success: false,
      statusCode: 409,
      code: "VIDEO_ALREADY_SUBMITTED",
      message: "Video declaration is already submitted."
    };
  }

  const faceCheckPassed = parseBoolean(body.faceCheckPassed);
  const faceQualityMetadata = parseFaceMetadata(body.faceQualityMetadata);
  const durationSeconds = parseNumber(body.durationSeconds);

  if (!faceCheckPassed) {
    return {
      success: false,
      statusCode: 400,
      code: "FACE_CHECK_NOT_PASSED",
      message: "Face readiness check must pass before submitting video."
    };
  }

  const nextAttemptNumber = declaration.attemptCount + 1;

  const uploadFolder = path.join(
    getUploadRoot(),
    kyc.id,
    declaration.id,
    `attempt-${nextAttemptNumber}`
  );

  fs.mkdirSync(uploadFolder, { recursive: true });

  const originalName = file.originalname || "video.webm";
  const storedName = `${Date.now()}-${crypto.randomUUID()}-${safeFileName(
    originalName
  )}`;

  const storagePath = path.join(uploadFolder, storedName);

  fs.writeFileSync(storagePath, file.buffer);

  const publicPath = `/uploads/kyc-videos/${kyc.id}/${declaration.id}/attempt-${nextAttemptNumber}/${storedName}`;

  const result = await prisma.$transaction(async (tx) => {
    const attempt = await tx.kycVideoAttempt.create({
      data: {
        declarationId: declaration.id,
        kycId: kyc.id,
        status: "submitted",
        originalName,
        storedName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath,
        publicPath,
        durationSeconds,
        faceCheckPassed,
        faceQualityMetadata,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        submittedAt: new Date()
      }
    });

    const updatedDeclaration = await tx.kycVideoDeclaration.update({
      where: {
        id: declaration.id
      },
      data: {
        status: "submitted",
        attemptCount: {
          increment: 1
        },
        currentAttemptId: attempt.id,
        faceCheckPassed,
        faceQualityMetadata,
        reviewedBy: null,
        reviewedAt: null,
        submittedAt: new Date()
      }
    });

    const updatedKyc = await tx.kycMaster.update({
      where: {
        id: kyc.id
      },
      data: {
        overallStatus: "submitted",
        currentStage: resubmissionMode
          ? "resubmission_submitted"
          : "buyer_submission_completed"
      }
    });

    await tx.kycAuditLog.create({
      data: {
        kycId: kyc.id,
        actorType: "buyer",
        action: resubmissionMode
          ? "video_declaration_resubmitted"
          : "video_declaration_submitted",
        oldStatus: kyc.overallStatus,
        newStatus: "submitted",
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: {
          declarationId: declaration.id,
          attemptId: attempt.id,
          faceCheckPassed,
          durationSeconds,
          currentStage: resubmissionMode
            ? "resubmission_submitted"
            : "buyer_submission_completed"
        }
      }
    });

    return {
      attempt,
      declaration: updatedDeclaration,
      kyc: updatedKyc
    };
  });

  return {
    success: true,
    message: "Video declaration submitted successfully. Buyer KYC submission is complete.",
    declaration: formatDeclaration(result.declaration),
    attempt: {
      id: result.attempt.id,
      publicPath: result.attempt.publicPath,
      mimeType: result.attempt.mimeType,
      sizeBytes: result.attempt.sizeBytes,
      durationSeconds: result.attempt.durationSeconds,
      submittedAt: result.attempt.submittedAt
    },
    kyc: {
      kycId: result.kyc.id,
      overallStatus: result.kyc.overallStatus,
      currentStage: result.kyc.currentStage
    }
  };
}

async function getVideoDeclarationWorkspace(rawToken) {
  const auth = await getActiveKycByToken(rawToken);

  if (!auth.success) return auth;

  const { kyc } = auth;

  const declaration = await prisma.kycVideoDeclaration.findUnique({
    where: {
      kycId: kyc.id
    },
    include: {
      attempts: {
        orderBy: {
          uploadedAt: "desc"
        }
      }
    }
  });

  return {
    success: true,
    message: "Video declaration workspace loaded.",
    kyc: {
      kycId: kyc.id,
      buyerName: kyc.buyerName,
      panMasked: kyc.panMasked,
      entityType: kyc.entityType,
      entityLabel: kyc.entityLabel,
      serviceType: kyc.serviceType,
      overallStatus: kyc.overallStatus,
      currentStage: kyc.currentStage
    },
    declaration: declaration ? formatDeclaration(declaration) : null,
    attempts:
      declaration?.attempts?.map((attempt) => ({
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
      })) || []
  };
}

function formatDeclaration(declaration) {
  return {
    id: declaration.id,
    kycId: declaration.kycId,
    declarantFullName: declaration.declarantFullName,
    declarantRole: declaration.declarantRole,
    businessName: declaration.businessName,
    serviceType: declaration.serviceType,
    language: declaration.language,
    scriptVersion: declaration.scriptVersion,
    scriptText: declaration.scriptText,
    runtimeCode: declaration.runtimeCode,
    status: declaration.status,
    attemptCount: declaration.attemptCount,
    currentAttemptId: declaration.currentAttemptId,
    faceCheckPassed: declaration.faceCheckPassed,
    faceQualityMetadata: declaration.faceQualityMetadata,
    startedAt: declaration.startedAt,
    submittedAt: declaration.submittedAt
  };
}

async function getDevVideoDeclarations() {
  return prisma.kycVideoDeclaration.findMany({
    orderBy: {
      updatedAt: "desc"
    }
  });
}

async function getDevVideoAttempts() {
  return prisma.kycVideoAttempt.findMany({
    orderBy: {
      uploadedAt: "desc"
    }
  });
}

module.exports = {
  startVideoDeclaration,
  uploadVideoDeclaration,
  getVideoDeclarationWorkspace,
  getDevVideoDeclarations,
  getDevVideoAttempts
};
