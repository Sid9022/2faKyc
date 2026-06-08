const { dummyPurchaseSchema } = require("./purchase.schema");
const {
  createKycFromPurchase,
  getDevKycRecords,
  getDevDuplicateLogs,
  getDevPurchaseEvents,
  getDevPurchaseEventLogs,
  getDevEntityConfig
} = require("../kyc/kyc.service");

async function createDummyPurchase(req, res) {
  try {
    const parsed = dummyPurchaseSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid dummy purchase payload",
        errors: parsed.error.flatten()
      });
    }

    const requestMeta = {
      ipAddress:
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        null,
      userAgent: req.headers["user-agent"] || null
    };

    const result = await createKycFromPurchase(parsed.data, requestMeta);

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    console.error("Dummy purchase error:", error);

    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Unique constraint failed. This record may already exist.",
        code: "UNIQUE_CONSTRAINT_FAILED"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Something went wrong while processing dummy purchase",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

async function listDevKycRecords(req, res) {
  const records = await getDevKycRecords();

  return res.json({
    success: true,
    records
  });
}

async function listDevDuplicateLogs(req, res) {
  const duplicateLogs = await getDevDuplicateLogs();

  return res.json({
    success: true,
    duplicateLogs
  });
}

async function listDevPurchaseEvents(req, res) {
  const purchaseEvents = await getDevPurchaseEvents();

  return res.json({
    success: true,
    purchaseEvents
  });
}

async function listDevPurchaseEventLogs(req, res) {
  const purchaseEventLogs = await getDevPurchaseEventLogs();

  return res.json({
    success: true,
    purchaseEventLogs
  });
}

async function listDevEntityConfig(req, res) {
  const entityConfig = await getDevEntityConfig();

  return res.json({
    success: true,
    entityConfig
  });
}

module.exports = {
  createDummyPurchase,
  listDevKycRecords,
  listDevDuplicateLogs,
  listDevPurchaseEvents,
  listDevPurchaseEventLogs,
  listDevEntityConfig
};
