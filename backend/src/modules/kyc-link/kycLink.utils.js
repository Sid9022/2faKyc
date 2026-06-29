const crypto = require("crypto");
const env = require("../../config/env");

function generateRawKycToken() {
  return crypto.randomBytes(48).toString("hex");
}

function hashKycToken(token) {
  // Single source of truth: env.KYC_LINK_SECRET is boot-validated (the app
  // refuses to start in production without it) and shares the same dev
  // fallback as every other secret. Never reach for an ad-hoc literal here.
  return crypto
    .createHash("sha256")
    .update(String(token) + "::" + env.KYC_LINK_SECRET)
    .digest("hex");
}

function getKycLinkExpiryDate() {
  const days = Number(process.env.KYC_LINK_EXPIRY_DAYS || 30);

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);

  return expiry;
}

function buildBuyerKycUrl(rawToken) {
  const baseUrl = process.env.KYC_BUYER_BASE_URL || "https://localhost:5173";
  return `${baseUrl}/kyc/start/${rawToken}`;
}

function buildDevApiKycUrl(rawToken) {
  const baseUrl = process.env.KYC_API_BASE_URL || "https://localhost:5000";
  return `${baseUrl}/api/public/kyc/${rawToken}`;
}

module.exports = {
  generateRawKycToken,
  hashKycToken,
  getKycLinkExpiryDate,
  buildBuyerKycUrl,
  buildDevApiKycUrl
};
