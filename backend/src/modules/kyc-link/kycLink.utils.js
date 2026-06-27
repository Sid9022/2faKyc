const crypto = require("crypto");

function generateRawKycToken() {
  return crypto.randomBytes(48).toString("hex");
}

function hashKycToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token) + "::" + (process.env.KYC_LINK_SECRET || "local-dev-kyc-link-secret"))
    .digest("hex");
}

function getKycLinkExpiryDate() {
  const days = Number(process.env.KYC_LINK_EXPIRY_DAYS || 30);

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);

  return expiry;
}

function buildBuyerKycUrl(rawToken) {
  const baseUrl = process.env.KYC_BUYER_BASE_URL || "http://localhost:5173";
  return `${baseUrl}/kyc/start/${rawToken}`;
}

function buildDevApiKycUrl(rawToken) {
  const baseUrl = process.env.KYC_API_BASE_URL || "http://localhost:5000";
  return `${baseUrl}/api/public/kyc/${rawToken}`;
}

module.exports = {
  generateRawKycToken,
  hashKycToken,
  getKycLinkExpiryDate,
  buildBuyerKycUrl,
  buildDevApiKycUrl
};
