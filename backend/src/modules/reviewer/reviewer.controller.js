const {
  listKycCases,
  getKycCaseDetail,
  reviewDocumentSubmission,
  reviewVideoDeclaration,
  finalDecisionForKyc
} = require("./reviewer.service");

function getRequestMeta(req) {
  return {
    ipAddress:
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null,
    userAgent: req.headers["user-agent"] || null,

    // Dev mode reviewer identity.
    // Later this will come from JWT/auth middleware.
    reviewerId: req.headers["x-reviewer-id"] || "dev-reviewer",
    reviewerName: req.headers["x-reviewer-name"] || "Development Reviewer"
  };
}

async function listCases(req, res) {
  try {
    const cases = await listKycCases({
      status: req.query.status
    });

    return res.json({
      success: true,
      cases
    });
  } catch (error) {
    console.error("List reviewer cases error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to list KYC cases"
    });
  }
}

async function getCaseDetail(req, res) {
  try {
    const result = await getKycCaseDetail(req.params.kycId);

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    console.error("Get reviewer case detail error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch KYC case detail"
    });
  }
}

async function reviewDocument(req, res) {
  try {
    const result = await reviewDocumentSubmission(
      req.params.submissionId,
      req.body,
      getRequestMeta(req)
    );

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    console.error("Review document error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to review document"
    });
  }
}

async function reviewVideo(req, res) {
  try {
    const result = await reviewVideoDeclaration(
      req.params.declarationId,
      req.body,
      getRequestMeta(req)
    );

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    console.error("Review video error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to review video declaration"
    });
  }
}

async function finalDecision(req, res) {
  try {
    const result = await finalDecisionForKyc(
      req.params.kycId,
      req.body,
      getRequestMeta(req)
    );

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    console.error("Final decision error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to apply final decision"
    });
  }
}

module.exports = {
  listCases,
  getCaseDetail,
  reviewDocument,
  reviewVideo,
  finalDecision
};
