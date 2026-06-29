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
 * Short-lived, read-only token for media streaming. <img>/<video> tags
 * cannot send Authorization headers, so the token has to ride in the URL
 * query string — where it can leak via history, Referer and proxy logs.
 * To keep that leak harmless we never put the full access token in a URL:
 * we mint a separate token that (a) expires quickly and (b) is marked
 * `scope: "media"`, so even if captured it cannot call any mutating API.
 */
function signMediaToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, scope: "media" },
    env.JWT_SECRET,
    {
      expiresIn: env.MEDIA_TOKEN_TTL || "30m",
      issuer: "kyc-api",
      audience: "kyc-app"
    }
  );
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
 * Auth for GET media-streaming routes only. Two ways in:
 *   - Authorization: Bearer <access token>  (normal API clients)
 *   - ?mt=<media token>                      (<img>/<video> tags)
 *
 * A token presented in the query string MUST be a `scope: "media"` token
 * (see signMediaToken). A full access token is only ever accepted from the
 * Authorization header, so leaking a media URL never leaks API access.
 * Never mount this on mutating routes.
 */
function requireMediaToken(req, res, next) {
  const headerToken = extractBearerToken(req);
  const queryToken = req.query.mt ? String(req.query.mt) : null;
  const token = headerToken || queryToken;

  if (!token) {
    return res.status(401).json({
      success: false,
      code: "AUTH_REQUIRED",
      message: "Authentication required."
    });
  }

  try {
    const payload = verifyAccessToken(token);

    // A token from the query string is only trusted if it is media-scoped.
    if (!headerToken && payload.scope !== "media") {
      return res.status(401).json({
        success: false,
        code: "INVALID_TOKEN",
        message: "Invalid media token."
      });
    }

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
  requireMediaToken,
  signMediaToken,
  requireRole
};
