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
router.post("/generate-volunteer-qr", requireApiKey, integrationController.generateVolunteerQR);
router.post("/prasadam/qr", requireApiKey, prasadamController.issueSingle);
router.post("/prasadam/qr/bulk", requireApiKey, prasadamController.issueBulk);

module.exports = router;
