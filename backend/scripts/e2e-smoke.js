/**
 * End-to-end smoke test against a running backend (node scripts/e2e-smoke.js).
 * Walks the full lifecycle: purchase -> consent -> documents -> video ->
 * reviewer accept -> final approval. Exits non-zero on first failure.
 *
 * NOTE: this uses synthetic 1x1 images, which the external PAN-card validator
 * will reject. Start the server with PAN_VALIDATION_ENABLED=false when running
 * this smoke test, e.g. (PowerShell):
 *   $env:PAN_VALIDATION_ENABLED="false"; npm run dev
 */

const BASE = process.env.API_URL || "http://localhost:5000";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@2factor.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "Admin@12345";

// Minimal valid file payloads (magic bytes only — enough for validation).
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89
]);
const WEBM_BYTES = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  Buffer.alloc(256, 1)
]);

let failures = 0;

function check(label, condition, extra = "") {
  if (condition) {
    console.log(`  PASS ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label} ${extra}`);
  }
}

async function json(method, path, body, headers = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body instanceof FormData
      ? headers
      : { "Content-Type": "application/json", ...headers },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
  });

  return { status: response.status, data: await response.json().catch(() => ({})) };
}

function fileBlob(bytes, type) {
  return new Blob([bytes], { type });
}

async function main() {
  const runId = Date.now().toString().slice(-6);
  const purchaseId = `PUR-E2E-${runId}`;
  const pan = `ABCCE${String(runId).slice(0, 4)}K`;

  console.log(`\n== E2E smoke (purchase ${purchaseId}, pan ${pan}) ==\n`);

  // 1. Purchase intake
  console.log("1. Purchase intake");
  const purchase = await json("POST", "/api/dev/dummy-purchase", {
    purchaseId,
    buyerName: "E2E Test Private Limited",
    buyerEmail: `e2e-${runId}@test.local`,
    pan,
    serviceType: "WHATSAPP"
  });

  check("KYC created", purchase.data.success === true);
  check("checklist snapshot present", (purchase.data.kyc?.checklist || []).length > 0);

  const buyerUrl = purchase.data.kycLink?.buyerKycUrl || "";
  const token = buyerUrl.split("/").pop();
  check("buyer link token issued", token.length > 40);

  // 2. Open link + consent
  console.log("2. Link + consent");
  const open = await json("GET", `/api/public/kyc/${token}`);
  check("link opens", open.data.success === true);

  const consent = await json("POST", `/api/public/kyc/${token}/consent`, {
    acceptedTerms: true,
    acceptedPrivacy: true,
    acceptedDocumentProcessing: true,
    acceptedVideoRecording: true,
    language: "en"
  });
  check("consent recorded", consent.data.success === true);

  // 3. Documents
  console.log("3. Documents");
  const workspace = await json("GET", `/api/public/kyc/${token}/documents`);
  check("workspace loads", workspace.data.success === true);

  const steps = workspace.data.steps || [];
  check("steps from snapshot", steps.length > 0, `got ${steps.length}`);

  for (const step of steps) {
    const form = new FormData();

    if (!step.isRequired) {
      form.append("skipOptional", "true");
    } else {
      const slot = step.inputMode === "live_photo_front_back" ? null : step.inputMode.startsWith("live_photo") ? "front" : step.inputMode === "upload_or_live_photo" ? "document" : "document";

      if (step.inputMode === "live_photo_front_back") {
        form.append("front", fileBlob(PNG_BYTES, "image/png"), "front.png");
        form.append("back", fileBlob(PNG_BYTES, "image/png"), "back.png");
      } else {
        form.append(slot, fileBlob(PNG_BYTES, "image/png"), "doc.png");
      }
    }

    const save = await json(
      "POST",
      `/api/public/kyc/${token}/documents/${step.requirementId}/save`,
      form
    );
    check(
      `save ${step.documentKey}${step.isRequired ? "" : " (skipped)"}`,
      save.data.success === true,
      JSON.stringify(save.data).slice(0, 160)
    );
  }

  // Bad file content must be rejected.
  const badForm = new FormData();
  badForm.append("document", fileBlob(Buffer.from("MZ executable"), "image/png"), "evil.png");
  const firstUpload = steps.find((s) => s.isRequired && s.inputMode === "upload");
  if (firstUpload) {
    const bad = await json(
      "POST",
      `/api/public/kyc/${token}/documents/${firstUpload.requirementId}/save`,
      badForm
    );
    check("magic-byte validation rejects fake PNG", bad.data.code === "INVALID_FILE_CONTENT");
  }

  const finalSubmit = await json("POST", `/api/public/kyc/${token}/documents/final-submit`);
  check("documents final submit", finalSubmit.data.success === true, JSON.stringify(finalSubmit.data).slice(0, 200));

  // 4. Video
  console.log("4. Video declaration");
  const videoStart = await json("POST", `/api/public/kyc/${token}/video/start`, {
    declarantFullName: "E2E Tester",
    declarantRole: "Director",
    businessName: "E2E Test Private Limited",
    language: "en"
  });
  check("video session starts", videoStart.data.success === true);
  check("runtime code generated", /^\d{6}$/.test(videoStart.data.declaration?.runtimeCode || ""));

  const videoForm = new FormData();
  videoForm.append("video", fileBlob(WEBM_BYTES, "video/webm"), "declaration.webm");
  videoForm.append("faceCheckPassed", "true");
  videoForm.append("durationSeconds", "14");
  videoForm.append(
    "faceQualityMetadata",
    JSON.stringify({ model: "mediapipe_face_detector", faceVisibleRatio: 1 })
  );

  const videoUpload = await json("POST", `/api/public/kyc/${token}/video/upload`, videoForm);
  check("video uploads", videoUpload.data.success === true, JSON.stringify(videoUpload.data).slice(0, 200));
  check("KYC submitted", videoUpload.data.kyc?.overallStatus === "submitted");

  // 5. Reviewer flow
  console.log("5. Reviewer flow");
  const login = await json("POST", "/api/auth/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  });
  check("staff login", login.data.success === true);

  const auth = { Authorization: `Bearer ${login.data.accessToken}` };
  const kycId = videoUpload.data.kyc.kycId;

  const detail = await json("GET", `/api/reviewer/kyc-cases/${kycId}`, null, auth);
  check("case detail loads", detail.data.success === true);
  check("auto-checks present", (detail.data.autoChecks || []).length > 0);
  check(
    "skipped optional stays skipped",
    !(detail.data.documents || []).some(
      (d) => !d.isRequired && d.status === "submitted" && d.files.length === 0
    )
  );

  // File streaming with auth
  const someFile = (detail.data.documents || []).flatMap((d) => d.files)[0];
  if (someFile) {
    const fileResponse = await fetch(`${BASE}${someFile.fileUrl}`, { headers: auth });
    check("reviewer file streaming (authed)", fileResponse.status === 200);

    const unauthFile = await fetch(`${BASE}${someFile.fileUrl}`);
    check("reviewer file blocked without auth", unauthFile.status === 401);
  }

  for (const doc of detail.data.documents) {
    if (doc.status !== "submitted") continue;
    const review = await json(
      "POST",
      `/api/reviewer/documents/${doc.id}/review`,
      { decision: "accepted", remarks: "Looks good." },
      auth
    );
    check(`accept ${doc.documentKey}`, review.data.success === true);
  }

  const videoReview = await json(
    "POST",
    `/api/reviewer/video/${detail.data.videoDeclaration.id}/review`,
    { decision: "accepted", remarks: "Video clear." },
    auth
  );
  check("accept video", videoReview.data.success === true);

  const decision = await json(
    "POST",
    `/api/reviewer/kyc-cases/${kycId}/final-decision`,
    { decision: "approved", remarks: "All verified." },
    auth
  );
  check("final approval", decision.data.success === true);
  check("status approved", decision.data.kyc?.overallStatus === "approved");

  // 6. Webhook signature
  console.log("6. Webhook");
  const crypto = require("crypto");
  const webhookBody = JSON.stringify({
    purchaseId: `PUR-WH-${runId}`,
    buyerName: "Webhook Test",
    buyerEmail: `wh-${runId}@test.local`,
    pan: `ABCPE${String(runId).slice(0, 4)}Z`,
    serviceType: "SMS"
  });

  const unsigned = await fetch(`${BASE}/api/webhooks/purchase-created`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: webhookBody
  });
  check("unsigned webhook rejected", unsigned.status === 401);

  const secret = process.env.WEBHOOK_SECRET ||
    crypto.createHash("sha256").update("kyc-local-dev-secret::WEBHOOK_SECRET").digest("hex");
  const signature = crypto.createHmac("sha256", secret).update(webhookBody).digest("hex");

  const signed = await fetch(`${BASE}/api/webhooks/purchase-created`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-signature": signature },
    body: webhookBody
  });
  const signedData = await signed.json();
  check("signed webhook accepted", signedData.success === true, JSON.stringify(signedData).slice(0, 160));

  console.log(`\n== ${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} ==\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("E2E crashed:", error);
  process.exit(1);
});
