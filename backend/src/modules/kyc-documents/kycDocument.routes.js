const express = require("express");
const upload = require("./documentUpload.middleware");

const {
  loadDocuments,
  saveDocument,
  saveProgress,
  finalSubmit,
  listDevDocumentSubmissions,
  listDevDocumentProgress
} = require("./kycDocument.controller");

const router = express.Router();

router.get("/public/kyc/:token/documents", loadDocuments);

router.post(
  "/public/kyc/:token/documents/:requirementId/save",
  upload.fields([
    { name: "front", maxCount: 1 },
    { name: "back", maxCount: 1 },
    { name: "document", maxCount: 1 },
    { name: "extra", maxCount: 2 }
  ]),
  saveDocument
);

router.post("/public/kyc/:token/documents/progress", saveProgress);
router.post("/public/kyc/:token/documents/final-submit", finalSubmit);

router.get("/dev/document-submissions", listDevDocumentSubmissions);
router.get("/dev/document-progress", listDevDocumentProgress);

module.exports = router;
