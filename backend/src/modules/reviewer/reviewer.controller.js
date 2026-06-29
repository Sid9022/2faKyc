const {
  listKycCases,
  getKycCaseDetail,
  reviewDocumentSubmission,
  reviewVideoDeclaration,
  finalDecisionForKyc,
  reopenKycCase
} = require("./reviewer.service");
const { getRequestMeta } = require("../../utils/request.util");
const { signMediaToken } = require("../../middleware/auth.middleware");
const prisma = require("../../config/prisma");

/**
 * Reviewer identity comes from the verified JWT (req.user) — never
 * from request headers.
 */
function getReviewer(req) {
  return {
    reviewerId: req.user.id,
    reviewerName: req.user.name
  };
}

/**
 * Bug B3: write an audit row every time a reviewer (or admin) opens a
 * case detail. We don't fail the request if the audit write fails —
 * a missing audit row is bad but not as bad as a missing case read.
 */
async function logReviewerCaseRead(req, kycId) {
  if (!kycId || !req.user?.id) return;
  await prisma.kycAuditLog.create({
    data: {
      kycId,
      actorType: req.user.role === "admin" ? "admin" : "reviewer",
      actorId: req.user.id,
      action: "case_detail_read",
      ipAddress: req.ip || null,
      userAgent: req.get("user-agent") || null,
      metadata: {
        reviewerEmail: req.user.email || null
      }
    }
  });
}

async function listCases(req, res, next) {
  try {
    const cases = await listKycCases({
      status: req.query.status,
      pan: req.query.pan,
      mobile: req.query.mobile,
      limit: req.query.limit
    });

    return res.json({ success: true, cases });
  } catch (error) {
    return next(error);
  }
}

async function getCaseDetail(req, res, next) {
  try {
    const result = await getKycCaseDetail(req.params.kycId, signMediaToken(req.user));
    // Bug B3: every detail-page read is sensitive (full PAN, email,
    // mobile). Audit-log it so we can answer "who looked at which
    // case, when, from where" without relying on access logs.
    logReviewerCaseRead(req, result?.case?.kycId).catch((err) =>
      console.error("[audit] case_read log failed:", err.message)
    );
    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function reviewDocument(req, res, next) {
  try {
    const result = await reviewDocumentSubmission(
      req.params.submissionId,
      req.body,
      getRequestMeta(req),
      getReviewer(req)
    );

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function reviewVideo(req, res, next) {
  try {
    const result = await reviewVideoDeclaration(
      req.params.declarationId,
      req.body,
      getRequestMeta(req),
      getReviewer(req)
    );

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function finalDecision(req, res, next) {
  try {
    const result = await finalDecisionForKyc(
      req.params.kycId,
      req.body,
      getRequestMeta(req),
      getReviewer(req)
    );

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function reopenCase(req, res, next) {
  try {
    const result = await reopenKycCase(
      req.params.kycId,
      getRequestMeta(req),
      getReviewer(req)
    );

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listCases,
  getCaseDetail,
  reviewDocument,
  reviewVideo,
  finalDecision,
  reopenCase
};
