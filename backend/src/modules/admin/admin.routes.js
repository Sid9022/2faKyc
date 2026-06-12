const express = require("express");

const {
  listEntityTypes,
  upsertEntityType,
  createRequirement,
  updateRequirement,
  listUsers,
  createUser,
  updateUser,
  getSettings,
  patchSettings,
  getDashboardStats,
  listAdminKycCases,
  listEmailLogs
} = require("./admin.service");
const { requireAuth, requireRole } = require("../../middleware/auth.middleware");

const router = express.Router();

router.use(requireAuth, requireRole("admin"));

function handle(serviceCall) {
  return async (req, res, next) => {
    try {
      const result = await serviceCall(req);
      return res.status(result?.statusCode || 200).json(
        result?.success === undefined ? { success: true, data: result } : result
      );
    } catch (error) {
      return next(error);
    }
  };
}

router.get("/dashboard", handle(() => getDashboardStats()));
router.get("/kyc-cases", handle((req) => listAdminKycCases(req.query)));

router.get("/entity-types", handle(() => listEntityTypes()));
router.post("/entity-types", handle((req) => upsertEntityType(req.body)));

router.post("/document-requirements", handle((req) => createRequirement(req.body)));
router.patch(
  "/document-requirements/:id",
  handle((req) => updateRequirement(req.params.id, req.body))
);

router.get("/users", handle(() => listUsers()));
router.post("/users", handle((req) => createUser(req.body, req.user.id)));
router.patch("/users/:id", handle((req) => updateUser(req.params.id, req.body, req.user.id)));

router.get("/settings", handle(() => getSettings()));
router.patch("/settings", handle((req) => patchSettings(req.body, req.user.id)));

router.get("/email-logs", handle((req) => listEmailLogs(req.query)));

module.exports = router;
