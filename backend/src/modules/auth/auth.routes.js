const express = require("express");

const {
  loginHandler,
  refreshHandler,
  logoutHandler,
  meHandler
} = require("./auth.controller");
const { requireAuth } = require("../../middleware/auth.middleware");
const { loginLimiter, refreshLimiter } = require("../../middleware/rateLimit.middleware");

const router = express.Router();

router.post("/login", loginLimiter, loginHandler);
router.post("/refresh", refreshLimiter, refreshHandler);
router.post("/logout", requireAuth, logoutHandler);
router.get("/me", requireAuth, meHandler);

module.exports = router;
