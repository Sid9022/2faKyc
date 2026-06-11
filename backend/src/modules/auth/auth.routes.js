const express = require("express");

const {
  loginHandler,
  refreshHandler,
  logoutHandler,
  meHandler
} = require("./auth.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const { loginLimiter } = require("../../middleware/rateLimit.middleware");

const router = express.Router();

router.post("/login", loginLimiter, loginHandler);
router.post("/refresh", refreshHandler);
router.post("/logout", logoutHandler);
router.get("/me", requireAuth, meHandler);

module.exports = router;
