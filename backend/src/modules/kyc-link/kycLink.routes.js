const express = require("express");
const {
  generateDevKycLink,
  openKycLink,
  submitConsent,
  listDevKycLinks,
  listDevKycLinkClicks,
  listDevKycConsents
} = require("./kycLink.controller");

const router = express.Router();

router.post("/dev/kyc/:kycId/generate-link", generateDevKycLink);

router.get("/dev/kyc-links", listDevKycLinks);
router.get("/dev/kyc-link-clicks", listDevKycLinkClicks);
router.get("/dev/kyc-consents", listDevKycConsents);

router.get("/public/kyc/:token", openKycLink);
router.post("/public/kyc/:token/consent", submitConsent);

module.exports = router;
