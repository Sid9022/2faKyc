const express = require("express");

const {
  listCases,
  getCaseDetail,
  reviewDocument,
  reviewVideo,
  finalDecision
} = require("./reviewer.controller");
const { createManualKyc } = require("../admin/admin.service");
const { requireAuth, requireRole } = require("../../middleware/auth.middleware");

const router = express.Router();

// Every reviewer route requires a logged-in reviewer or admin.
router.use(requireAuth, requireRole("reviewer", "admin"));

router.get("/kyc-cases", listCases);
router.get("/kyc-cases/:kycId", getCaseDetail);

router.post("/documents/:submissionId/review", reviewDocument);
router.post("/video/:declarationId/review", reviewVideo);

router.post("/kyc-cases/:kycId/final-decision", finalDecision);

router.post("/manual-kyc", async (req, res, next) => {
  try {
    const result = await createManualKyc(req);
    return res.status(result?.statusCode || 200).json(
      result?.success === undefined ? { success: true, data: result } : result
    );
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
