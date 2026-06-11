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
 */
async function getKycIdByToken(rawToken) {
  const link = await prisma.kycLink.findUnique({
    where: { tokenHash: hashKycToken(rawToken) },
    select: { kycId: true, status: true, expiresAt: true }
  });

  if (!link) return null;
  if (link.status !== "active" || link.expiresAt <= new Date()) return null;

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
