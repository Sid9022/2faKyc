const fs = require("fs");

const prisma = require("../../config/prisma");
const { hashKycToken } = require("../kyc-link/kycLink.utils");

async function findDocumentFile(fileId) {
  return prisma.kycDocumentFile.findUnique({
    where: { id: fileId }
  });
}

async function findVideoAttempt(attemptId) {
  return prisma.kycVideoAttempt.findUnique({
    where: { id: attemptId }
  });
}

/**
 * Resolves the KYC id owned by a buyer link token (active or not — buyers
 * may need to see their own already-submitted files even after decisions).
 *
 * Bug B12: the previous implementation returned null for any link
 * that wasn't `active` AND unexpired. The doc-comment above promised
 * post-decision access. Honoring it now: any valid link → its kycId,
 * regardless of status or expiry. Cross-KYC isolation is enforced at
 * the route layer (file.kycId === link.kycId), so a revoked link
 * still cannot read another buyer's files — it can only read its own
 * already-submitted artifacts.
 */
async function getKycIdByToken(rawToken) {
  const link = await prisma.kycLink.findUnique({
    where: { tokenHash: hashKycToken(rawToken) },
    select: { kycId: true, status: true, expiresAt: true }
  });

  if (!link) return null;

  return link.kycId;
}

function fileExists(storagePath) {
  try {
    return fs.statSync(storagePath).isFile();
  } catch {
    return false;
  }
}

async function logFileAccess({ kycId, actorType, actorId, fileId, kind, requestMeta }) {
  await prisma.kycAuditLog.create({
    data: {
      kycId,
      actorType,
      actorId: actorId || null,
      action: "file_accessed",
      ipAddress: requestMeta?.ipAddress || null,
      userAgent: requestMeta?.userAgent || null,
      metadata: { fileId, kind }
    }
  });
}

module.exports = {
  findDocumentFile,
  findVideoAttempt,
  getKycIdByToken,
  fileExists,
  logFileAccess
};
