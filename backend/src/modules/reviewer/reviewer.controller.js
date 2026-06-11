const {
  listKycCases,
  getKycCaseDetail,
  reviewDocumentSubmission,
  reviewVideoDeclaration,
  finalDecisionForKyc
} = require("./reviewer.service");
const { getRequestMeta } = require("../../utils/request.util");

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

async function listCases(req, res, next) {
  try {
    const cases = await listKycCases({
      status: req.query.status,
      pan: req.query.pan,
      limit: req.query.limit
    });

    return res.json({ success: true, cases });
  } catch (error) {
    return next(error);
  }
}

async function getCaseDetail(req, res, next) {
  try {
    const result = await getKycCaseDetail(req.params.kycId);
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

module.exports = {
  listCases,
  getCaseDetail,
  reviewDocument,
  reviewVideo,
  finalDecision
};
