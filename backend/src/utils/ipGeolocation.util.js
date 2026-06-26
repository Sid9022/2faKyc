/**
 * Best-effort IP geolocation fallback for when the buyer's browser refuses to
 * share precise GPS coords (insecure context over HTTP, denied permission,
 * no geolocation API, etc).
 *
 * Uses ipapi.co's free HTTPS endpoint. Times out aggressively and never throws
 * — callers can blindly do `const coords = await lookupIpGeolocation(ip)`
 * and check whether `coords` is null. This keeps the request path hot even
 * if the third-party service is slow or down.
 *
 * Result is cached per-IP for 24h to limit outbound traffic.
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 1500;

const cache = new Map();

function isPublicIpv4(ip) {
  if (!ip) return false;
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;

  const [a, b] = nums;
  if (a === 10) return false;
  if (a === 127) return false;
  if (a === 0) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a >= 224) return false; // multicast / reserved
  return true;
}

function isPublicIpv6(ip) {
  if (!ip || !ip.includes(":")) return false;
  const lower = ip.toLowerCase();
  if (lower === "::1") return false;
  if (lower.startsWith("fe80:")) return false; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return false; // ULA
  if (lower.startsWith("ff")) return false; // multicast
  return true;
}

function isPublicIp(ip) {
  if (!ip) return false;
  // Strip an IPv6-mapped IPv4 prefix (`::ffff:1.2.3.4`).
  const cleaned = ip.replace(/^::ffff:/i, "");
  if (cleaned.includes(":")) return isPublicIpv6(cleaned);
  return isPublicIpv4(cleaned);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("GEOLOCATION_TIMEOUT")), ms);
    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * @param {string|null|undefined} ip  Client IP (req.ip).
 * @returns {Promise<{latitude:number, longitude:number, city?:string, country?:string, source:"ip"}|null>}
 */
async function lookupIpGeolocation(ip) {
  if (!ip || !isPublicIp(ip)) return null;

  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const url = `https://ipapi.co/${encodeURIComponent(ip)}/json/`;

  try {
    const response = await withTimeout(
      fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "kyc-automation/1.0" }
      }),
      REQUEST_TIMEOUT_MS
    );

    if (!response.ok) {
      cacheMiss(ip);
      return null;
    }

    const data = await response.json();
    const latitude = Number(data?.latitude);
    const longitude = Number(data?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      cacheMiss(ip);
      return null;
    }

    const value = {
      latitude,
      longitude,
      city: data?.city || undefined,
      country: data?.country_name || data?.country || undefined,
      source: "ip"
    };

    cache.set(ip, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (err) {
    console.warn(`[ipGeolocation] lookup failed for ${ip}: ${err.message}`);
    cacheMiss(ip);
    return null;
  }
}

function cacheMiss(ip) {
  // Negative cache for a short window so we don't hammer the service.
  cache.set(ip, { value: null, expiresAt: Date.now() + 5 * 60 * 1000 });
}

module.exports = { lookupIpGeolocation };
