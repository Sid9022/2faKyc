const express = require("express");
const uploadVideoMiddleware = require("./videoUpload.middleware");

const {
  loadVideoWorkspace,
  startVideoSession,
  uploadVideo,
  listDevVideoDeclarations,
  listDevVideoAttempts
} = require("./kycVideo.controller");

const router = express.Router();

router.get("/public/kyc/:token/video", loadVideoWorkspace);

router.post("/public/kyc/:token/video/start", startVideoSession);

router.post(
  "/public/kyc/:token/video/upload",
  uploadVideoMiddleware.single("video"),
  uploadVideo
);

router.get("/dev/video-declarations", listDevVideoDeclarations);
router.get("/dev/video-attempts", listDevVideoAttempts);

module.exports = router;
