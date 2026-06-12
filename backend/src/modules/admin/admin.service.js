const bcrypt = require("bcryptjs");
const { z } = require("zod");

const prisma = require("../../config/prisma");
const { getAllSettings, setSetting } = require("../../utils/settings.util");
const { listEmailLogs } = require("../email/email.service");
const { decryptField } = require("../../utils/crypto.util");
const { buildUserNameMap } = require("../reviewer/reviewer.service");

/**
 * Turns a zod error into a response that always carries a readable
 * message (the UI shows `message` directly).
 */
function validationFailure(code, zodError) {
  const fieldErrors = zodError.flatten().fieldErrors;
  const message = Object.entries(fieldErrors)
    .map(([field, messages]) => `${field}: ${messages?.[0] || "invalid"}`)
    .join(" | ");

  return {
    success: false,
    statusCode: 400,
    code,
    message: message || "Validation failed.",
    errors: fieldErrors
  };
}

// ---------- Entity types ----------

async function listEntityTypes() {
  return prisma.entityType.findMany({
    include: {
      requirements: { orderBy: { sortOrder: "asc" } }
    },
    orderBy: { label: "asc" }
  });
}

const entityTypeSchema = z.object({
  key: z.string().min(2).regex(/^[a-z0-9_]+$/),
  label: z.string().min(2),
  panChar: z.string().length(1).optional().nullable(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional()
});

async function upsertEntityType(payload) {
  const parsed = entityTypeSchema.safeParse(payload);

  if (!parsed.success) {
    return validationFailure("INVALID_ENTITY_TYPE", parsed.error);
  }

  const data = parsed.data;

  const saved = await prisma.entityType.upsert({
    where: { key: data.key },
    update: {
      label: data.label,
      panChar: data.panChar ?? null,
      description: data.description ?? null,
      isActive: data.isActive ?? true
    },
    create: {
      key: data.key,
      label: data.label,
      panChar: data.panChar ?? null,
      description: data.description ?? null,
      isActive: data.isActive ?? true
    }
  });

  return { success: true, entityType: saved };
}

// ---------- Document requirements ----------

const requirementSchema = z.object({
  entityTypeId: z.string().uuid(),
  documentKey: z.string().min(2).regex(/^[a-z0-9_]+$/),
  documentName: z.string().min(2),
  inputMode: z.enum([
    "upload",
    "live_photo_front",
    "live_photo_front_back",
    "upload_or_live_photo",
    "live_video"
  ]),
  isRequired: z.boolean().optional(),
  needsFront: z.boolean().optional(),
  needsBack: z.boolean().optional(),
  ocrEnabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional()
});

async function createRequirement(payload) {
  const parsed = requirementSchema.safeParse(payload);

  if (!parsed.success) {
    return validationFailure("INVALID_REQUIREMENT", parsed.error);
  }

  const data = parsed.data;

  try {
    const created = await prisma.documentRequirement.create({
      data: {
        entityTypeId: data.entityTypeId,
        documentKey: data.documentKey,
        documentName: data.documentName,
        inputMode: data.inputMode,
        isRequired: data.isRequired ?? true,
        needsFront: data.needsFront ?? false,
        needsBack: data.needsBack ?? false,
        ocrEnabled: data.ocrEnabled ?? false,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true
      }
    });

    return { success: true, requirement: created };
  } catch (error) {
    if (error.code === "P2002") {
      return {
        success: false,
        statusCode: 409,
        code: "DUPLICATE_DOCUMENT_KEY",
        message: "This documentKey already exists for the entity type."
      };
    }
    throw error;
  }
}

const requirementPatchSchema = requirementSchema
  .omit({ entityTypeId: true, documentKey: true })
  .partial();

async function updateRequirement(requirementId, payload) {
  const parsed = requirementPatchSchema.safeParse(payload);

  if (!parsed.success) {
    return validationFailure("INVALID_REQUIREMENT", parsed.error);
  }

  const existing = await prisma.documentRequirement.findUnique({
    where: { id: requirementId }
  });

  if (!existing) {
    return {
      success: false,
      statusCode: 404,
      code: "REQUIREMENT_NOT_FOUND",
      message: "Document requirement not found."
    };
  }

  const updated = await prisma.documentRequirement.update({
    where: { id: requirementId },
    data: parsed.data
  });

  return {
    success: true,
    requirement: updated,
    note: "Changes apply to NEW KYC cases only - existing cases keep their snapshotted checklist."
  };
}

// ---------- Users ----------

const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  role: z.enum(["admin", "reviewer"]),
  password: z.string().min(10, "Password must be at least 10 characters")
});

async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true
    }
  });

  return users;
}

async function createUser(payload, actorId) {
  const parsed = createUserSchema.safeParse(payload);

  if (!parsed.success) {
    return validationFailure("INVALID_USER", parsed.error);
  }

  const data = parsed.data;

  try {
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        fullName: data.fullName,
        role: data.role,
        passwordHash: await bcrypt.hash(data.password, 10)
      }
    });

    await prisma.kycAuditLog.create({
      data: {
        actorType: "admin",
        actorId,
        action: "user_created",
        metadata: { userId: user.id, role: user.role }
      }
    });

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status
      }
    };
  } catch (error) {
    if (error.code === "P2002") {
      return {
        success: false,
        statusCode: 409,
        code: "EMAIL_TAKEN",
        message: "A user with this email already exists."
      };
    }
    throw error;
  }
}

const patchUserSchema = z.object({
  status: z.enum(["active", "disabled"]).optional(),
  role: z.enum(["admin", "reviewer"]).optional(),
  password: z.string().min(10).optional(),
  fullName: z.string().min(2).optional()
});

async function updateUser(userId, payload, actorId) {
  const parsed = patchUserSchema.safeParse(payload);

  if (!parsed.success) {
    return validationFailure("INVALID_USER_UPDATE", parsed.error);
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });

  if (!existing) {
    return {
      success: false,
      statusCode: 404,
      code: "USER_NOT_FOUND",
      message: "User not found."
    };
  }

  if (userId === actorId && parsed.data.status === "disabled") {
    return {
      success: false,
      statusCode: 400,
      code: "CANNOT_DISABLE_SELF",
      message: "You cannot disable your own account."
    };
  }

  const data = { ...parsed.data };

  if (data.password) {
    data.passwordHash = await bcrypt.hash(data.password, 10);
    delete data.password;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data
  });

  // Disabling a user kills their sessions.
  if (parsed.data.status === "disabled") {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  await prisma.kycAuditLog.create({
    data: {
      actorType: "admin",
      actorId,
      action: "user_updated",
      metadata: {
        userId,
        changes: Object.keys(parsed.data).filter((k) => k !== "password"),
        passwordReset: Boolean(parsed.data.password)
      }
    }
  });

  return {
    success: true,
    user: {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      role: updated.role,
      status: updated.status
    }
  };
}

// ---------- Settings ----------

const ALLOWED_SETTINGS = [
  "max_reminders",
  "reminder_interval_hours",
  "consent_version",
  "video_script_version"
];

async function getSettings() {
  return getAllSettings();
}

async function patchSettings(payload = {}, actorId) {
  const updates = {};

  for (const [key, value] of Object.entries(payload)) {
    if (!ALLOWED_SETTINGS.includes(key)) continue;
    await setSetting(key, value, actorId);
    updates[key] = value;
  }

  await prisma.kycAuditLog.create({
    data: {
      actorType: "admin",
      actorId,
      action: "settings_updated",
      metadata: { updates }
    }
  });

  return { success: true, updated: updates, settings: await getAllSettings() };
}

// ---------- Dashboard ----------

async function getDashboardStats() {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [byStatus, totalKycs, newThisWeek, totalEmails, failedEmails, recentAudit] =
    await Promise.all([
      prisma.kycMaster.groupBy({
        by: ["overallStatus"],
        _count: { _all: true }
      }),
      prisma.kycMaster.count(),
      prisma.kycMaster.count({ where: { createdAt: { gte: since7d } } }),
      prisma.emailLog.count(),
      prisma.emailLog.count({ where: { status: "failed" } }),
      prisma.kycAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          kyc: { select: { buyerName: true, panMasked: true } }
        }
      })
    ]);

  const nameMap = await buildUserNameMap(recentAudit.map((log) => log.actorId));

  return {
    totals: { kycs: totalKycs, newThisWeek },
    kycByStatus: Object.fromEntries(
      byStatus.map((row) => [row.overallStatus, row._count._all])
    ),
    emails: { total: totalEmails, failed: failedEmails },
    recentAudit: recentAudit.map((log) => ({
      id: log.id,
      kycId: log.kycId,
      buyerName: log.kyc?.buyerName || null,
      panMasked: log.kyc?.panMasked || null,
      actorType: log.actorType,
      actorName: nameMap.get(log.actorId)?.fullName || null,
      action: log.action,
      oldStatus: log.oldStatus,
      newStatus: log.newStatus,
      metadata: log.metadata,
      createdAt: log.createdAt
    }))
  };
}

// ---------- KYC cases (admin oversight: who reviewed what) ----------

async function listAdminKycCases(filters = {}) {
  const where = {};
  if (filters.status) where.overallStatus = filters.status;

  const cases = await prisma.kycMaster.findMany({
    where,
    include: {
      documentProgress: { select: { isFinalSubmitted: true } },
      documentSubmissions: {
        select: {
          documentName: true,
          isRequired: true,
          status: true,
          reviewedBy: true,
          reviewedAt: true
        }
      },
      videoDeclaration: {
        select: { status: true, reviewedBy: true, reviewedAt: true }
      },
      finalReviews: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          decision: true,
          remarks: true,
          reviewedBy: true,
          createdAt: true
        }
      }
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(Number(filters.limit) || 200, 500)
  });

  const nameMap = await buildUserNameMap(
    cases.flatMap((item) => [
      ...item.documentSubmissions.map((doc) => doc.reviewedBy),
      item.videoDeclaration?.reviewedBy,
      item.finalReviews[0]?.reviewedBy
    ])
  );

  const nameOf = (id) => nameMap.get(id)?.fullName || null;

  return cases.map((item) => {
    const docs = item.documentSubmissions;
    const requiredDocs = docs.filter((doc) => doc.isRequired);

    const reviewerNames = [
      ...new Set(
        [
          ...docs.map((doc) => nameOf(doc.reviewedBy)),
          nameOf(item.videoDeclaration?.reviewedBy)
        ].filter(Boolean)
      )
    ];

    const lastReview = item.finalReviews[0] || null;

    return {
      kycId: item.id,
      purchaseId: item.purchaseId,
      buyerName: item.buyerName,
      buyerEmail: decryptField(item.buyerEmail),
      panMasked: item.panMasked,
      entityLabel: item.entityLabel,
      serviceType: item.serviceType,
      overallStatus: item.overallStatus,
      currentStage: item.currentStage,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,

      progress: {
        requiredDocs: requiredDocs.length,
        acceptedDocs: requiredDocs.filter((doc) => doc.status === "accepted").length,
        failedDocs: docs.filter((doc) =>
          ["rejected", "resubmission_required"].includes(doc.status)
        ).length,
        finalSubmitted: item.documentProgress?.isFinalSubmitted || false,
        videoStatus: item.videoDeclaration?.status || "not_started"
      },

      reviewers: reviewerNames,

      lastDecision: lastReview
        ? {
            decision: lastReview.decision,
            remarks: lastReview.remarks,
            byName: nameOf(lastReview.reviewedBy),
            at: lastReview.createdAt
          }
        : null
    };
  });
}

module.exports = {
  listEntityTypes,
  upsertEntityType,
  createRequirement,
  updateRequirement,
  listUsers,
  createUser,
  updateUser,
  getSettings,
  patchSettings,
  getDashboardStats,
  listAdminKycCases,
  listEmailLogs
};
