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

  ACCESS_TOKEN_TTL: z.string().default("30m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),

  KYC_LINK_EXPIRY_DAYS: z.coerce.number().default(7),
  KYC_BUYER_BASE_URL: z.string().default("http://localhost:5173"),
  KYC_API_BASE_URL: z.string().default("http://localhost:5000"),

  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  EMAIL_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  EMAIL_PROVIDER_URL: z
    .string()
    .default("http://api.dial2verify.com/v2.5/sendMail_SMTP.php"),
  EMAIL_FROM: z.string().default("no-reply@2factor.in"),

  REMINDER_SCHEDULER_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),

  SEED_ADMIN_EMAIL: z.string().default("admin@2factor.local"),
  SEED_ADMIN_PASSWORD: z.string().default("Admin@12345")
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
  isProduction
};

module.exports = env;
