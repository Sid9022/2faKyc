const rateLimit = require("express-rate-limit");

const standardOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: "RATE_LIMITED",
    message: "Too many requests. Please try again shortly."
  }
};

// Public buyer routes (token link, consent, workspaces, media streaming —
// video seeking can fire many Range requests, so this is generous)
const publicLimiter = rateLimit({
  ...standardOptions,
  windowMs: 60 * 1000,
  limit: 120
});

// Heavy public routes (file/video uploads)
const uploadLimiter = rateLimit({
  ...standardOptions,
  windowMs: 60 * 1000,
  limit: 20
});

// Login brute-force protection
const loginLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10
});

// Webhook endpoint
const webhookLimiter = rateLimit({
  ...standardOptions,
  windowMs: 60 * 1000,
  limit: 120
});

module.exports = {
  publicLimiter,
  uploadLimiter,
  loginLimiter,
  webhookLimiter
};
