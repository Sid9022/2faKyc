/**
 * Single source of truth for request metadata.
 * req.ip respects Express "trust proxy" config (set in server.js),
 * so we never parse x-forwarded-for by hand.
 */
function getRequestMeta(req) {
  return {
    ipAddress: req.ip || null,
    userAgent: req.headers["user-agent"] || null
  };
}

module.exports = { getRequestMeta };
