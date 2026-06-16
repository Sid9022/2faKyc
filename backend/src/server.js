const env = require("./config/env");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const prisma = require("./config/prisma");
const { flowLogMiddleware } = require("./config/flowLogger");
const { publicLimiter } = require("./middleware/rateLimit.middleware");
const { startReminderScheduler, stopReminderScheduler } = require("./modules/reminders/reminder.scheduler");

const authRoutes = require("./modules/auth/auth.routes");
const webhookRoutes = require("./modules/webhook/webhook.routes");
const filesRoutes = require("./modules/files/files.routes");
const purchaseRoutes = require("./modules/purchase/purchase.routes");
const kycLinkRoutes = require("./modules/kyc-link/kycLink.routes");
const kycDocumentRoutes = require("./modules/kyc-documents/kycDocument.routes");
const kycVideoRoutes = require("./modules/kyc-video/kycVideo.routes");
const reviewerRoutes = require("./modules/reviewer/reviewer.routes");
const adminRoutes = require("./modules/admin/admin.routes");
const kycResubmissionRoutes = require("./modules/kyc-resubmission/kycResubmission.routes");

const app = express();

// Respect the first proxy (nginx) for req.ip; never parse XFF by hand.
app.set("trust proxy", 1);

app.use(
  helmet({
    // The frontend runs on a different origin; media (<img>/<video>) loads
    // would be blocked by the default same-origin CORP header. File access
    // itself is still protected by JWT / link-token auth.
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true
  })
);

// Capture the raw body so webhook HMAC signatures can be verified.
app.use(
  express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
      if (req.originalUrl.startsWith("/api/webhooks")) {
        req.rawBody = buf;
      }
    }
  })
);

// Live flow log: tag every request + its DB operations (dev only, no-op in prod).
app.use(flowLogMiddleware);

app.get("/", (req, res) => {
  res.json({
    success: true,
    app: env.APP_NAME,
    status: "running"
  });
});

app.get("/healthz", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ success: true, db: "up" });
  } catch {
    return res.status(503).json({ success: false, db: "down" });
  }
});

// Rate-limit the whole public buyer namespace.
app.use("/api/public", publicLimiter);

// Hard gate: no /api/dev/* route exists in production, regardless of
// which router defines it.
if (env.isProduction) {
  app.use("/api/dev", (req, res) =>
    res.status(404).json({ success: false, message: "Route not found" })
  );
}

app.use("/api/auth", authRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api", filesRoutes);
app.use("/api", kycLinkRoutes);
app.use("/api", kycDocumentRoutes);
app.use("/api", kycVideoRoutes);
app.use("/api", kycResubmissionRoutes);
app.use("/api/reviewer", reviewerRoutes);
app.use("/api/admin", adminRoutes);

// Dev/testing routes never exist in production builds.
if (!env.isProduction) {
  app.use("/api/dev", purchaseRoutes);
}

app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      code: "FILE_TOO_LARGE",
      message: "File is too large. Maximum allowed size is 80 MB."
    });
  }

  if (err.message?.includes("Invalid video type") || err.message?.includes("files are allowed")) {
    return res.status(400).json({
      success: false,
      code: "INVALID_FILE_TYPE",
      message: err.message
    });
  }

  const requestId = Math.random().toString(36).slice(2, 10);
  console.error(`[error ${requestId}] ${req.method} ${req.originalUrl}:`, err);

  // Never leak internals (Prisma table names, stack traces) in production.
  return res.status(err.statusCode || 500).json({
    success: false,
    message: env.isProduction
      ? `Something went wrong. Reference: ${requestId}`
      : err.message || "Something went wrong",
    requestId
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

const server = app.listen(env.PORT, () => {
  console.log(`KYC backend running on port ${env.PORT} (${env.NODE_ENV})`);
  startReminderScheduler();
});

async function shutdown(signal) {
  console.log(`${signal} received — shutting down gracefully.`);
  stopReminderScheduler();

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

  // Force-exit if connections refuse to drain.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
