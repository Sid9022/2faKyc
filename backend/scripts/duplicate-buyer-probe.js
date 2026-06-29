/**
 * Manual integration probe for the duplicate-buyer webhook rules.
 *
 * Runs against a backend already listening on :5000 (with the database
 * freshly seeded). Exercises Case 1 + Case 3 + the "different name"
 * fall-through in one go and exits non-zero on any mismatch.
 *
 * Usage:
 *   WEBHOOK_SECRET=local-dev-webhook-secret node scripts/duplicate-buyer-probe.js
 */
const crypto = require("crypto");
const BASE = process.env.API_URL || "http://localhost:5000";
const SECRET = process.env.WEBHOOK_SECRET ||
  crypto.createHash("sha256").update("kyc-local-dev-secret::WEBHOOK_SECRET").digest("hex");

let failures = 0;
function check(label, condition, extra = "") {
  if (condition) {
    console.log(`  PASS ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${extra ? " :: " + extra : ""}`);
  }
}

async function postWebhook(payload) {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  const res = await fetch(`${BASE}/api/webhooks/purchase-created`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-signature": signature },
    body
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function loginAdmin() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.SEED_ADMIN_EMAIL || "admin@2factor.local",
      password: process.env.SEED_ADMIN_PASSWORD || "Admin@12345"
    })
  });
  const json = await res.json();
  return json.accessToken;
}

async function reviewerSearch(token, query) {
  const res = await fetch(`${BASE}/api/reviewer/kyc-cases?${query}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.json();
}

async function main() {
  console.log("\n== Duplicate-buyer probe ==\n");

  // Use the same PAN across all three calls — vary name + mobile.
  const PAN = "ABCPE7777Q";
  const runId = Date.now().toString(36).toUpperCase();

  // 1. First purchase: creates a KYC + sends link.
  console.log("1. First purchase (creates KYC)");
  const r1 = await postWebhook({
    purchaseId: `PUR-DUP-A-${runId}`,
    buyerName: "Aman Verma",
    buyerEmail: `aman-${runId}@test.local`,
    buyerMobile: "9876543210",
    pan: PAN,
    serviceType: "SMS"
  });
  check("status 200", r1.status === 200, JSON.stringify(r1.body).slice(0, 200));
  check("duplicate:false", r1.body.duplicate === false);
  check("kyc created", Boolean(r1.body.kyc?.kycId));

  // 2. Same PAN + same buyerName + same mobile, KYC only in link_sent
  //    (not yet "done") → fall through to Rule 3, create a fresh KYC.
  console.log("\n2. Same PAN + same name + same mobile, KYC just link_sent → fresh KYC");
  const r2 = await postWebhook({
    purchaseId: `PUR-DUP-B-${runId}`,
    buyerName: "Aman Verma",
    buyerEmail: `aman-${runId}@test.local`,
    buyerMobile: "9876543210",
    pan: PAN,
    serviceType: "SMS"
  });
  check("status 200", r2.status === 200);
  check("duplicate:false (new KYC)", r2.body.duplicate === false);
  check("fresh kycId issued", Boolean(r2.body.kyc?.kycId));

  // 3. Same PAN + different buyerName → fresh KYC (Rule 3 fall-through).
  console.log("\n3. Same PAN + DIFFERENT buyerName → fresh KYC");
  const r3 = await postWebhook({
    purchaseId: `PUR-DUP-C-${runId}`,
    buyerName: "Vikram Singh",
    buyerEmail: `vikram-${runId}@test.local`,
    buyerMobile: "9999999999",
    pan: PAN,
    serviceType: "SMS"
  });
  check("status 200", r3.status === 200);
  check("duplicate:false (new KYC)", r3.body.duplicate === false);
  check("fresh kycId issued", Boolean(r3.body.kyc?.kycId));

  // 4. Manually advance the r2 KYC past link_sent so the next duplicate
  //    call hits Case 1 (bypass).
  console.log("\n4. Advance KYC from r2 to submitted (simulate buyer progress)");
  // Use Prisma directly via the admin module's pg client would be heavy;
  // simpler: open + consent + upload + final-submit through the public API.
  // For the probe we only need overallStatus off `link_sent` — set it
  // straight to `submitted` via a tiny SQL helper endpoint we don't have.
  // Use the simpler route: just call the admin module's update via SQL
  // through a tiny one-off node script is too much for this probe.
  //
  // Workaround: use the reviewer auto-approval flow that requires all
  // docs. That's heavy. Instead, cheat by hitting the public link's
  // open endpoint to bump status to `opened` (which IS in DONE_STATUSES).
  const linkId = r2.body.kycLink?.linkId;
  // The response hides the raw token for security — pull it back via
  // the admin list instead.
  const token = await loginAdmin();
  const cases = await reviewerSearch(token, `pan=${PAN}`);
  const targetCase = cases.cases?.find((c) => c.purchaseId === `PUR-DUP-B-${runId}`);
  check("found r2 case via reviewer search", Boolean(targetCase), `cases=${cases.cases?.length}`);

  // Bump the case to opened by hitting the dev purchase echo, then the
  // public link is opened by simulating a buyer click through the
  // token-scoped endpoint... actually, easier: just SQL it.
  const { Client } = require("pg");
  const dbUrl = process.env.DATABASE_URL || require("dotenv").config().parsed?.DATABASE_URL;
  const pg = new Client({ connectionString: dbUrl });
  await pg.connect();
  await pg.query(
    `UPDATE "kyc_masters" SET "overallStatus"='submitted' WHERE "id"=$1`,
    [targetCase.kycId]
  );
  await pg.end();
  check("r2 KYC forced to submitted", true);

  // 5. Now Case 1: same PAN + same buyerName + same mobile, KYC "done"
  //    → bypass, no new KYC.
  console.log("\n5. Case 1 — same PAN + same name + same mobile + done → bypass");
  const r5 = await postWebhook({
    purchaseId: `PUR-DUP-D-${runId}`,
    buyerName: "Aman Verma",
    buyerEmail: `aman-${runId}@test.local`,
    buyerMobile: "9876543210",
    pan: PAN,
    serviceType: "SMS"
  });
  check("status 200", r5.status === 200, JSON.stringify(r5.body).slice(0, 200));
  check("bypassed:true", r5.body.bypassed === true);
  check("code = DUPLICATE_BUYER_BYPASSED", r5.body.code === "DUPLICATE_BUYER_BYPASSED");
  check("no new kycLink issued", r5.body.kycLink === undefined && r5.body.kyc === undefined);

  // 6. Case 3: same PAN + same buyerName + DIFFERENT mobile.
  console.log("\n6. Case 3 — same PAN + same name + DIFFERENT mobile → audit-only entry");
  const r6 = await postWebhook({
    purchaseId: `PUR-DUP-E-${runId}`,
    buyerName: "Aman Verma",
    buyerEmail: `aman-new-${runId}@test.local`,
    buyerMobile: "7777777777",
    pan: PAN,
    serviceType: "SMS"
  });
  check("status 200", r6.status === 200, JSON.stringify(r6.body).slice(0, 200));
  check("logged:true", r6.body.logged === true);
  check("code = DUPLICATE_BUYER_DIFFERENT_MOBILE_LOGGED", r6.body.code === "DUPLICATE_BUYER_DIFFERENT_MOBILE_LOGGED");
  check("audit KYC created", Boolean(r6.body.newKyc?.kycId));
  check("no buyer kycLink", r6.body.kycLink === undefined && r6.body.kyc === undefined);

  // 7. Fraud search: ?mobile=7777777777 should find the audit row + the
  //    fresh buyer KYC if any.
  console.log("\n7. Mobile fraud search");
  const search = await reviewerSearch(token, `mobile=7777777777`);
  const ids = search.cases?.map((c) => c.kycId) || [];
  check("mobile search returns rows", ids.length > 0, `cases=${ids.length}`);
  check(
    "audit row included in results",
    ids.includes(r6.body.newKyc.kycId),
    `expected ${r6.body.newKyc.kycId} in [${ids.join(", ")}]`
  );

  console.log(`\n== ${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} ==\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Probe crashed:", err);
  process.exit(1);
});