const express = require("express");
const {
  createDummyPurchase,
  listDevKycRecords,
  listDevDuplicateLogs,
  listDevPurchaseEvents,
  listDevPurchaseEventLogs,
  listDevEntityConfig
} = require("./purchase.controller");

const router = express.Router();

router.post("/dummy-purchase", createDummyPurchase);

router.get("/kyc-records", listDevKycRecords);
router.get("/duplicate-logs", listDevDuplicateLogs);
router.get("/purchase-events", listDevPurchaseEvents);
router.get("/purchase-event-logs", listDevPurchaseEventLogs);
router.get("/entity-config", listDevEntityConfig);

module.exports = router;
