const express = require("express");

const {
  listCases,
  getCaseDetail,
  reviewDocument,
  reviewVideo,
  finalDecision
} = require("./reviewer.controller");

const router = express.Router();

router.get("/kyc-cases", listCases);
router.get("/kyc-cases/:kycId", getCaseDetail);

router.post("/documents/:submissionId/review", reviewDocument);
router.post("/video/:declarationId/review", reviewVideo);

router.post("/kyc-cases/:kycId/final-decision", finalDecision);

module.exports = router;
