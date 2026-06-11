const jwt = require("jsonwebtoken");
const env = require("../config/env");

function extractBearerToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return null;
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: "kyc-api",
    audience: "kyc-app"
  });
}

/**
 * Requires a valid JWT access token in the Authorization header.
 * Sets req.user = { id, role, name, email }.
 */
function requireAuth(req, res, next) {
  const token = extractBearerToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      code: "AUTH_REQUIRED",
      message: "Authentication required."
    });
  }

  try {
    const payload = verifyAccessToken(token);

    req.user = {
      id: payload.sub,
      role: payload.role,
      name: payload.name,
      email: payload.email
    };

    return next();
  } catch {
    return res.status(401).json({
      success: false,
      code: "INVALID_TOKEN",
      message: "Invalid or expired session. Please log in again."
    });
  }
}

/**
 * Same as requireAuth, but also accepts ?access_token= in the query string.
 * ONLY for GET media-streaming routes (<img>/<video> tags cannot send
 * Authorization headers). Never mount this on mutating routes.
 */
function requireAuthAllowQueryToken(req, res, next) {
  const token = extractBearerToken(req) || req.query.access_token;

  if (!token) {
    return res.status(401).json({
      success: false,
      code: "AUTH_REQUIRED",
      message: "Authentication required."
    });
  }

  try {
    const payload = verifyAccessToken(String(token));

    req.user = {
      id: payload.sub,
      role: payload.role,
      name: payload.name,
      email: payload.email
    };

    return next();
  } catch {
    return res.status(401).json({
      success: false,
      code: "INVALID_TOKEN",
      message: "Invalid or expired session. Please log in again."
    });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: "AUTH_REQUIRED",
        message: "Authentication required."
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action."
      });
    }

    return next();
  };
}

module.exports = {
  requireAuth,
  requireAuthAllowQueryToken,
  requireRole
};
