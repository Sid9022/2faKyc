/**
 * Single source of truth for request metadata.
 * req.ip respects Express "trust proxy" config (set in server.js),
 * so we never parse x-forwarded-for by hand.
 */
function getRequestMeta(req) {
  const clientIp = req.body?.publicIp || req.body?.ipAddress || req.query?.ipAddress || req.ip || null;
  return {
    ipAddress: clientIp,
    userAgent: req.headers["user-agent"] || null
  };
}

module.exports = { getRequestMeta };
