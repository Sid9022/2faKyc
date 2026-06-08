const { z } = require("zod");

const dummyPurchaseSchema = z.object({
  purchaseId: z.string().min(3, "purchaseId is required"),
  buyerName: z.string().min(2, "buyerName is required"),
  buyerEmail: z.string().email("Valid buyerEmail is required"),
  buyerMobile: z.string().min(8).optional(),
  pan: z.string().min(10, "PAN is required"),
  serviceType: z.enum(["SMS", "WHATSAPP", "SMS_WHATSAPP"]),
  amount: z.number().positive().optional(),
  purchasedAt: z.string().optional()
});

module.exports = {
  dummyPurchaseSchema
};
