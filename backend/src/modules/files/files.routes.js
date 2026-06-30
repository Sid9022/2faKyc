const express = require("express");
const path = require("path");

const {
  findDocumentFile,
  findVideoAttempt,
  getKycIdByToken,
  fileExists,
  logFileAccess
} = require("./files.service");
const {
  requireMediaToken,
  requireRole
} = require("../../middleware/auth.middleware");
const { getRequestMeta } = require("../../utils/request.util");
const { UPLOAD_ROOT } = require("../../utils/fileStorage.util");
const { publicLimiter } = require("../../middleware/rateLimit.middleware");

const router = express.Router();

function sendStoredFile(res, record) {
  res.setHeader("Content-Type", record.mimeType || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(record.originalName || "file")}"`
  );
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  const resolvedPath = path.resolve(record.storagePath);
  if (!resolvedPath.startsWith(UPLOAD_ROOT)) {
    return res.status(403).json({ success: false, message: "Forbidden path" });
  }

  // res.sendFile supports Range requests (video seeking) out of the box.
  res.sendFile(resolvedPath);
}

function notFound(res) {
  return res.status(404).json({
    success: false,
    code: "FILE_NOT_FOUND",
    message: "File not found."
  });
}

/**
 * Reviewer/admin access — JWT required (Authorization header, or a
 * short-lived media token via ?mt= for <img>/<video> tags). Every access
 * is audit-logged.
 */
router.get(
  "/reviewer/files/:fileId",
  requireMediaToken,
  requireRole("reviewer", "admin"),
  async (req, res, next) => {
    try {
      const file = await findDocumentFile(req.params.fileId);
      if (!file || !fileExists(file.storagePath)) return notFound(res);

      await logFileAccess({
        kycId: file.kycId,
        actorType: req.user.role,
        actorId: req.user.id,
        fileId: file.id,
        kind: "document",
        requestMeta: getRequestMeta(req)
      });

      return sendStoredFile(res, file);
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  "/reviewer/video-attempts/:attemptId/stream",
  requireMediaToken,
  requireRole("reviewer", "admin"),
  async (req, res, next) => {
    try {
      const attempt = await findVideoAttempt(req.params.attemptId);
      if (!attempt || !fileExists(attempt.storagePath)) return notFound(res);

      await logFileAccess({
        kycId: attempt.kycId,
        actorType: req.user.role,
        actorId: req.user.id,
        fileId: attempt.id,
        kind: "video",
        requestMeta: getRequestMeta(req)
      });

      return sendStoredFile(res, attempt);
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Buyer access — scoped to the KYC that owns the link token.
 */
router.get(
  "/public/kyc/:token/files/:fileId",
  publicLimiter,
  async (req, res, next) => {
    try {
      const kycId = await getKycIdByToken(req.params.token);
      if (!kycId) return notFound(res);

      const file = await findDocumentFile(req.params.fileId);
      if (!file || file.kycId !== kycId || !fileExists(file.storagePath)) {
        return notFound(res);
      }

      return sendStoredFile(res, file);
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  "/public/kyc/:token/video-attempts/:attemptId/stream",
  publicLimiter,
  async (req, res, next) => {
    try {
      const kycId = await getKycIdByToken(req.params.token);
      if (!kycId) return notFound(res);

      const attempt = await findVideoAttempt(req.params.attemptId);
      if (!attempt || attempt.kycId !== kycId || !fileExists(attempt.storagePath)) {
        return notFound(res);
      }

      return sendStoredFile(res, attempt);
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
