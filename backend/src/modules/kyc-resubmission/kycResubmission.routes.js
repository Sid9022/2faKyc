const express = require("express");
const {
  loadResubmissionWorkspace
} = require("./kycResubmission.controller");

const router = express.Router();

router.get("/public/kyc/:token/resubmission", loadResubmissionWorkspace);

module.exports = router;
