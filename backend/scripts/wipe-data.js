/**
 * Dev utility: wipe ALL data from every table (keeps the schema) so you can
 * start fresh. Re-run `npm run prisma:seed` afterwards to recreate the entity
 * types, default settings, and the seed admin user.
 *
 * Refuses to run in production.
 *
 *   node scripts/wipe-data.js
 */

const env = require("../src/config/env");
const prisma = require("../src/config/prisma");

// Every application table (NOT _prisma_migrations). CASCADE + the full list
// keep us safe regardless of FK order.
const TABLES = [
  "kyc_audit_logs",
  "kyc_link_click_logs",
  "kyc_document_files",
  "kyc_video_attempts",
  "kyc_auto_checks",
  "kyc_final_reviews",
  "kyc_document_submissions",
  "kyc_document_progress",
  "kyc_video_declarations",
  "kyc_consents",
  "kyc_links",
  "reminder_states",
  "email_logs",
  "kyc_duplicate_logs",
  "purchase_events",
  "kyc_masters",
  "refresh_tokens",
  "users",
  "document_requirements",
  "entity_types",
  "app_settings"
];

async function main() {
  if (env.isProduction) {
    console.error("Refusing to wipe data in production.");
    process.exit(1);
  }

  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`
  );

  console.log(`Wiped ${TABLES.length} tables. Run "npm run prisma:seed" next.`);
}

main()
  .catch((error) => {
    console.error("Wipe failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
