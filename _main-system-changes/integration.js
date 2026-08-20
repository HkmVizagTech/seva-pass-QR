const express = require("express");
const router = express.Router();
const integrationController = require("../controllers/integrationController");
const prasadamController = require("../controllers/prasadamIntegrationController");

const requireApiKey = (req, res, next) => {
  const expectedKey = process.env.INTEGRATION_API_KEY;

  if (!expectedKey) {
    console.error("INTEGRATION_API_KEY is not set");
    return res.status(503).json({ status: false, message: "Integration not configured" });
  }

  const header = req.headers["x-api-key"] || "";
  const bearer = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  const provided = header || bearer;

  if (!provided || provided !== expectedKey) {
    return res.status(401).json({ status: false, message: "Invalid API key" });
  }

  next();
};

router.get("/status", integrationController.status);
router.get("/events", requireApiKey, integrationController.getAllEvents);
router.get("/events/:eventCode/venues", requireApiKey, integrationController.getEventVenues);
router.get("/events/:eventCode/entry-points", requireApiKey, integrationController.getEventEntryPoints);
router.get("/events/:eventCode/categories", requireApiKey, integrationController.getEventCategories);
router.patch("/events/:eventCode/devotee-categories", requireApiKey, integrationController.updateDevoteeCategories);
router.post("/generate-volunteer-qr", requireApiKey, integrationController.generateVolunteerQR);
router.post("/prasadam/qr", requireApiKey, prasadamController.issueSingle);
router.post("/prasadam/qr/bulk", requireApiKey, prasadamController.issueBulk);

// Preacher management via integration API
router.post("/preachers", requireApiKey, integrationController.createPreacher);
router.get("/preachers", requireApiKey, integrationController.listPreachers);
router.delete("/preachers/:id", requireApiKey, integrationController.deletePreacher);

// QR pass details for integration partners (live status + scan history)
router.get("/qr/:qrId", requireApiKey, integrationController.getQRDetails);

// ── Holder type + category management ──────────────────────────────────────
// These let the main site's admin UI manage categories within holder types.
// GET  /api/integration/holder-types/:eventCode
//   → Returns all holder types for an event with their associated categories.
// PATCH /api/integration/holder-types/:eventCode/:holderTypeId/categories
//   → Update categories for a specific holder type (create/update/unlink).
router.get("/holder-types/:eventCode", requireApiKey, integrationController.getHolderTypes);
router.patch("/holder-types/:eventCode/:holderTypeId/categories", requireApiKey, integrationController.updateHolderTypeCategories);

module.exports = router;
