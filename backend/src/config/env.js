require("dotenv").config();

const crypto = require("crypto");
const { z } = require("zod");

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";

/**
 * Secrets that MUST be set in production. In development we derive
 * deterministic fallbacks so the app still runs, but we warn loudly.
 *
 * WARNING: PAN_HASH_SECRET is permanent once real data exists.
 * Changing it breaks duplicate-PAN detection for all existing rows.
 *
 * MOBILE_HASH_SECRET is the equivalent for buyer mobile numbers — it
 * powers exact-match fraud search by mobile. New field, no legacy data
 * to break; falls back to PAN_HASH_SECRET when not explicitly set so
 * existing deployments keep working.
 */
const SECRET_KEYS = [
  "PAN_HASH_SECRET",
  "KYC_LINK_SECRET",
  "JWT_SECRET",
  "ENCRYPTION_KEY",
  "WEBHOOK_SECRET"
];

function devFallbackSecret(name) {
  return crypto
    .createHash("sha256")
    .update(`kyc-local-dev-secret::${name}`)
    .digest("hex");
}

const missingSecrets = SECRET_KEYS.filter((key) => !process.env[key]);

if (missingSecrets.length > 0) {
  if (isProduction) {
    console.error(
      `FATAL: Missing required secrets in production: ${missingSecrets.join(", ")}`
    );
    process.exit(1);
  }

  console.warn(
    `[env] WARNING: Using insecure dev fallbacks for: ${missingSecrets.join(", ")}. ` +
      "Set them in backend/.env before going anywhere near production."
  );
}

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(5000),
  APP_NAME: z.string().default("KYC Automation API"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  PAN_HASH_SECRET: z.string().min(16),
  KYC_LINK_SECRET: z.string().min(16),
  JWT_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(16),
  WEBHOOK_SECRET: z.string().min(16),

  // Mobile-hash secret for buyerMobile exact-match fraud search.
  // Optional — falls back to PAN_HASH_SECRET when unset. In production
  // set this to its own value so a leaked mobile-hash table can't be
  // correlated back to PAN hashes.
  MOBILE_HASH_SECRET: z.string().min(16).optional(),

  ACCESS_TOKEN_TTL: z.string().default("30m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),

  // Short-lived, read-only token used for media (<img>/<video>) URLs so the
  // full access token never has to appear in a query string.
  MEDIA_TOKEN_TTL: z.string().default("30m"),

  KYC_LINK_EXPIRY_DAYS: z.coerce.number().default(30),
  KYC_BUYER_BASE_URL: z.string().default("https://localhost:5173"),
  KYC_API_BASE_URL: z.string().default("https://localhost:5000"),

  CORS_ORIGIN: z.string().default("https://localhost:5173"),

  EMAIL_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  EMAIL_PROVIDER_URL: z
    .string()
    .default("https://api.dial2verify.com/v2.5/sendMail_SMTP.php"),
  EMAIL_FROM: z.string().default("no-reply@2factor.in"),

  REMINDER_SCHEDULER_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),

  // External PAN-card recognizer (Hugging Face space).
  PAN_VALIDATION_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  PAN_VALIDATION_URL: z
    .string()
    .default("https://aryans3-2fakyc.hf.space/analyze-pan?include_full_pan=true"),
  // On network/timeout errors: true = allow upload (flag for reviewer),
  // false = block and ask the buyer to retry.
  PAN_VALIDATION_FAIL_OPEN: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  // true = reject when the card's PAN doesn't match the KYC's PAN.
  PAN_MATCH_STRICT: z
    .string()
    .default("false")
    .transform((v) => v === "true"),

  SEED_ADMIN_EMAIL: z.string().default("admin@2factor.local"),
  SEED_ADMIN_PASSWORD: z.string().default("Admin@12345"),

  // Live flow log (dev tool): writes every request + DB operation to a file.
  // Forced off in production to avoid logging SQL/args.
  FLOW_LOG_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  FLOW_LOG_SQL: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  FLOW_LOG_FILE: z.string().default("flow.log")
});

const parsed = envSchema.safeParse({
  ...process.env,
  ...Object.fromEntries(
    missingSecrets.map((key) => [key, devFallbackSecret(key)])
  )
});

if (!parsed.success) {
  console.error("FATAL: Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = {
  ...parsed.data,
  isProduction,
  // If MOBILE_HASH_SECRET is not explicitly configured, reuse
  // PAN_HASH_SECRET so old deployments and the dev fallback keep
  // working. Production should set its own value.
  MOBILE_HASH_SECRET: parsed.data.MOBILE_HASH_SECRET || parsed.data.PAN_HASH_SECRET
};

module.exports = env;
