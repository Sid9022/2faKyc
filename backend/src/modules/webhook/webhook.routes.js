const crypto = require("crypto");
const express = require("express");

const env = require("../../config/env");
const { dummyPurchaseSchema } = require("../purchase/purchase.schema");
const { createKycFromPurchase } = require("../kyc/kyc.service");
const { webhookLimiter } = require("../../middleware/rateLimit.middleware");
const { getRequestMeta } = require("../../utils/request.util");
const { timingSafeEqualHex } = require("../../utils/crypto.util");

const router = express.Router();

/**
 * Production purchase intake.
 *
 * The caller must sign the raw JSON body:
 *   signature = hex( HMAC-SHA256( rawBody, WEBHOOK_SECRET ) )
 * and send it in the `x-webhook-signature` header.
 *
 * req.rawBody is captured by the express.json verify hook in server.js.
 */
router.post("/purchase-created", webhookLimiter, async (req, res, next) => {
  try {
    const signature = String(req.headers["x-webhook-signature"] || "");

    if (!signature || !req.rawBody) {
      return res.status(401).json({
        success: false,
        code: "WEBHOOK_SIGNATURE_REQUIRED",
        message: "Missing webhook signature."
      });
    }

    const expected = crypto
      .createHmac("sha256", env.WEBHOOK_SECRET)
      .update(req.rawBody)
      .digest("hex");

    if (!timingSafeEqualHex(signature.toLowerCase(), expected)) {
      return res.status(401).json({
        success: false,
        code: "WEBHOOK_SIGNATURE_INVALID",
        message: "Invalid webhook signature."
      });
    }

    const parsed = dummyPurchaseSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        code: "INVALID_WEBHOOK_PAYLOAD",
        message: "Webhook payload validation failed.",
        errors: parsed.error.flatten().fieldErrors
      });
    }

    const result = await createKycFromPurchase(
      parsed.data,
      getRequestMeta(req),
      { intakeAction: "purchase_webhook_received" }
    );

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
