require("dotenv").config();
const path = require("path");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const prisma = require("./config/prisma");

const purchaseRoutes = require("./modules/purchase/purchase.routes");
const kycLinkRoutes = require("./modules/kyc-link/kycLink.routes");
const kycDocumentRoutes = require("./modules/kyc-documents/kycDocument.routes");
const kycVideoRoutes = require("./modules/kyc-video/kycVideo.routes");
const reviewerRoutes = require("./modules/reviewer/reviewer.routes");

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    }
  })
);

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true
  })
);

app.use(express.json({ limit: "1mb" }));

app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
    next();
  },
  express.static(path.join(process.cwd(), "uploads"))
);

app.get("/", (req, res) => {
  res.json({
    success: true,
    app: process.env.APP_NAME || "KYC Automation API",
    status: "running",
    message: "KYC backend foundation is ready"
  });
});

app.use("/api/dev", purchaseRoutes);
app.use("/api", kycLinkRoutes);
app.use("/api", kycDocumentRoutes);
app.use("/api", kycVideoRoutes);
app.use("/api/reviewer", reviewerRoutes);

app.post("/api/dev/test-db", async (req, res) => {
  try {
    const record = await prisma.testConnection.create({
      data: {
        message: "PostgreSQL + Prisma 7 connected successfully"
      }
    });

    return res.json({
      success: true,
      message: "Database test record created",
      record
    });
  } catch (error) {
    console.error("DB test error:", error);

    return res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message
    });
  }
});

app.use((err, req, res, next) => {
  console.error("Global error handler:", err.message);

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      code: "FILE_TOO_LARGE",
      message: "File is too large. Maximum allowed size is 80 MB."
    });
  }

  if (err.message?.includes("Invalid video type")) {
    return res.status(400).json({
      success: false,
      code: "INVALID_VIDEO_TYPE",
      message: err.message
    });
  }

  return res.status(500).json({
    success: false,
    message: err.message || "Something went wrong"
  });
});

// 404 handler should always be LAST
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`KYC backend running on port ${PORT}`);
});