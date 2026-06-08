const {
  createSecureKycLinkForKyc,
  openPublicKycLink,
  submitKycConsent,
  getDevKycLinks,
  getDevKycLinkClicks,
  getDevKycConsents
} = require("./kycLink.service");

function getRequestMeta(req) {
  return {
    ipAddress:
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null,
    userAgent: req.headers["user-agent"] || null
  };
}

async function generateDevKycLink(req, res) {
  try {
    const { kycId } = req.params;

    const link = await createSecureKycLinkForKyc(kycId, {
      requestMeta: getRequestMeta(req)
    });

    return res.json({
      success: true,
      message: "Secure KYC link generated.",
      link
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to generate KYC link"
    });
  }
}

async function openKycLink(req, res) {
  try {
    const { token } = req.params;

    const result = await openPublicKycLink(token, getRequestMeta(req));

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    console.error("Open KYC link error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to open KYC link"
    });
  }
}

async function listDevKycLinks(req, res) {
  const links = await getDevKycLinks();

  return res.json({
    success: true,
    links
  });
}

async function listDevKycLinkClicks(req, res) {
  const clicks = await getDevKycLinkClicks();

  return res.json({
    success: true,
    clicks
  });
}

async function submitConsent(req, res) {
  try {
    const { token } = req.params;

    const result = await submitKycConsent(
      token,
      req.body,
      getRequestMeta(req)
    );

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    console.error("Submit consent error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to submit consent"
    });
  }
}

async function listDevKycConsents(req, res) {
  const consents = await getDevKycConsents();

  return res.json({
    success: true,
    consents
  });
}

module.exports = {
  generateDevKycLink,
  openKycLink,
  submitConsent,
  listDevKycLinks,
  listDevKycLinkClicks,
  listDevKycConsents
};
