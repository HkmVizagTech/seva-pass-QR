// ─── Integration controller ────────────────────────────────────────────────
// Handles the inbound endpoint from the third-party system:
//   POST /api/integration/generate-volunteer-qr
//   GET  /api/integration/events/:eventCode/entry-points
//   GET  /api/integration/events/:eventCode/venues
//
// When someone marks interest on their platform, they call this endpoint.
// We create/find the holder in our system and return the QR code.

const Event = require("../models/Event");
const Category = require("../models/Category");
const EntryPoint = require("../models/EntryPoint");
const Holder = require("../models/Holder");
const HolderType = require("../models/HolderType");
const QRPass = require("../models/QRPass");
const qrService = require("../services/qrService");
const thirdPartyService = require("../services/thirdPartyService");
const whatsappService = require("../services/whatsappService");

// Helper: normalise phone
function normalisePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/[\+\s\-\(\)]/g, "");
  if (digits.length === 10) return "91" + digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  return digits;
}

// Send the QR to the holder's phone via the main system's Flaxxa integration.
// Non-fatal - WhatsApp failure must never block QR issuance.
async function trySendWhatsApp(phone, qrImage, holder, event, entryPoints) {
  try {
    await whatsappService.sendQRMessage(phone, qrImage, holder.name, event.name, {
      entryPoints: (entryPoints || []).map((ep) => ({
        name: ep.name || ep.stationLabel,
        stationLabel: ep.stationLabel || ep.name,
      })),
      validFrom: event.dateStart,
      venue: (event.venue && event.venue[0] && event.venue[0].name) || "ISKCON Temple, Visakhapatnam",
      isSponsor: false,
    });
    console.log(`[Integration] WhatsApp QR sent to ${phone} for ${event.eventCode}`);
  } catch (error) {
    console.error(`[Integration] WhatsApp send skipped for ${phone}:`, error.message);
  }
}

/** Find an event by eventCode or MongoDB _id. */
async function findEvent(eventCode) {
  return Event.findOne({
    $or: [
      { eventCode: String(eventCode).toUpperCase() },
      { _id: String(eventCode).match(/^[0-9a-fA-F]{24}$/) ? eventCode : null },
    ],
  });
}

/**
 * Resolve which entry points to use for a QR pass.
 * If venue is provided, filter by location.building matching the venue name.
 * Otherwise, use the category defaults.
 */
async function resolveEntryPoints(event, category, venue) {
  if (venue) {
    const eps = await EntryPoint.find({
      eventId: event._id,
      isActive: true,
      "location.building": new RegExp("^" + venue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"),
    });
    // Fall back to category defaults if no entry points match the venue
    return eps.length > 0 ? eps : (category.entryPoints || []);
  }
  return category.entryPoints || [];
}

/**
 * GET /api/integration/events
 *
 * Returns all events from the main system. Used by the Seva Pass app to
 * sync events so the admin doesn't have to create them manually.
 */
exports.getAllEvents = async (req, res) => {
  try {
    const events = await Event.find({})
      .select("name eventCode dateStart dateEnd venue description")
      .sort({ dateStart: -1 });
    res.json(events);
  } catch (error) {
    console.error("[Integration] getAllEvents error:", error);
    res.status(500).json({ status: false, message: "Failed to fetch events" });
  }
};

/**
 * GET /api/integration/events/:eventCode/venues
 *
 * Returns the venues array for an event. Used by the Seva Pass app to
 * populate the venue selector on the IssuePass form.
 */
exports.getEventVenues = async (req, res) => {
  try {
    const event = await findEvent(req.params.eventCode);
    if (!event) {
      return res.status(404).json({ status: false, message: "Event not found" });
    }
    const venues = (event.venue || []).map((v, i) => ({
      index: i,
      name: v.name,
      address: v.address || "",
      coordinates: v.coordinates || null,
    }));
    res.json(venues);
  } catch (error) {
    console.error("[Integration] getEventVenues error:", error);
    res.status(500).json({ status: false, message: "Failed to fetch venues" });
  }
};

/**
 * GET /api/integration/events/:eventCode/entry-points
 *
 * Returns active entry points for an event, optionally filtered by venue.
 * ?venue=<name> filters by location.building (case-insensitive match).
 */
exports.getEventEntryPoints = async (req, res) => {
  try {
    const event = await findEvent(req.params.eventCode);
    if (!event) {
      return res.status(404).json({ status: false, message: "Event not found" });
    }
    const query = { eventId: event._id, isActive: true };
    const { venue } = req.query;
    if (venue) {
      query["location.building"] = new RegExp("^" + venue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i");
    }
    const entryPoints = await EntryPoint.find(query)
      .select("name stationLabel type location maxCapacity currentCount")
      .sort({ type: 1, name: 1 });
    res.json(entryPoints);
  } catch (error) {
    console.error("[Integration] getEventEntryPoints error:", error);
    res.status(500).json({ status: false, message: "Failed to fetch entry points" });
  }
};

/**
 * POST /api/integration/generate-volunteer-qr
 *
 * Request body:
 *   { event_id, user_phone_number, user_email?, venue? }
 *
 * If venue is provided, entry points for the QR pass are filtered to those
 * whose location.building matches the venue name.
 */
exports.generateVolunteerQR = async (req, res) => {
  try {
    const { event_id, user_phone_number, user_email, venue, category: categoryParam, name: holderName, preacher, preacherId } = req.body;

    if (!event_id) {
      return res.status(400).json({ status: false, message: "event_id is required" });
    }
    if (!user_phone_number) {
      return res.status(400).json({ status: false, message: "user_phone_number is required" });
    }

    const phone = normalisePhone(String(user_phone_number));
    if (!phone) {
      return res.status(400).json({ status: false, message: "Invalid phone number" });
    }

    const event = await findEvent(event_id);
    if (!event) {
      return res.status(404).json({ status: false, message: `Event not found for event_id: ${event_id}` });
    }

    // ── Check if holder already has an active pass ──────────────────────────
    const existingHolder = await Holder.findOne({ eventId: event._id, phone });
    if (existingHolder) {
      const existingPass = await QRPass.findOne({ holderId: existingHolder._id, status: "active" });
      if (existingPass) {
        const existingCategory = await Category.findById(existingPass.catId).populate("entryPoints").lean();
        const entryPoints = await resolveEntryPoints(event, existingCategory || null, venue);
        const payload = qrService.createPayload(
          { ...existingHolder.toObject(), qrId: existingPass.qrId },
          event, existingCategory, entryPoints,
        );
        const { image: qrImage } = await qrService.generateQRCode(payload);
        await trySendWhatsApp(phone, qrImage, existingHolder, event, entryPoints);
        return res.json({
          status: true,
          message: "QR code already exists — returning existing pass",
          qr_code: qrImage,
          qr_id: existingPass.qrId,
        });
      }
    }

    // ── Resolve category: prefer the one sent by the third-party app ────────
    // The Seva Pass app sends a category name (e.g. "VIP", "General Public").
    // We try to match it by name or catCode first. If not found, fall back to
    // the default GN/Volunteer category.
    let category = null;
    if (categoryParam && categoryParam.trim()) {
      const term = categoryParam.trim();
      category = await Category.findOne({
        eventId: event._id,
        $or: [
          { name: new RegExp("^" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") },
          { catCode: term.toUpperCase() },
        ],
      }).populate("entryPoints");
    }
    if (!category) {
      category = await Category.findOne({
        eventId: event._id,
        $or: [{ catCode: "GN" }, { name: /general/i }, { name: /volunteer/i }],
      }).populate("entryPoints");
    }

    if (!category) {
      return res.status(400).json({
        status: false,
        message: "No suitable category found for this event. Please configure a General Public or Volunteer category.",
      });
    }

    // ── Resolve entry points (filtered by venue if provided) ────────────────
    const entryPoints = await resolveEntryPoints(event, category, venue);

    // ── Create or update holder ─────────────────────────────────────────────
    let holderTypeId = null;
    let holderTypeLabel = "self";
    try {
      const typeName = (process.env.INTEGRATION_HOLDER_TYPE || "invitee").trim();
      let holderType = await HolderType.findOne({
        eventId: event._id, isActive: true,
        $or: [{ code: typeName.toUpperCase() }, { name: new RegExp("^" + typeName + "$", "i") }],
      });
      if (!holderType) {
        holderType = await HolderType.findOne({ eventId: event._id, isDefault: true, isActive: true });
      }
      if (holderType) { holderTypeId = holderType._id; holderTypeLabel = holderType.name; }
    } catch (e) {
      console.warn("[Integration] holder type lookup failed:", e.message);
    }

    // Use the name from the third-party app if provided, otherwise fall back
    const resolvedName = (holderName && holderName.trim())
      ? holderName.trim()
      : (user_email ? user_email.split("@")[0] : `Devotee ${phone.slice(-4)}`);

    const holderData = {
      eventId: event._id, catId: category._id, phone,
      email: user_email || undefined,
      name: resolvedName,
      holderType: holderTypeLabel, holderTypeId,
      source: "third_party",
      issuedBy: preacherId || null,
      ...(preacher ? { thirdPartyAttribution: preacher } : {}),
    };

    let holder;
    try {
      holder = await Holder.create(holderData);
    } catch (e) {
      if (e.code === 11000) {
        holder = await Holder.findOne({ eventId: event._id, phone });
        if (!holder) throw e;
        // Update name if a better one was provided
        if (resolvedName && holder.name !== resolvedName) {
          holder.name = resolvedName;
          if (preacher) holder.thirdPartyAttribution = preacher;
          if (preacherId) holder.issuedBy = preacherId;
          await holder.save();
        }
      } else { throw e; }
    }

    // ── Generate QR pass ────────────────────────────────────────────────────
    const qrId = await qrService.generateQRId(event.eventCode, category.catCode);
    const payload = qrService.createPayload(
      { ...holder.toObject(), qrId }, event, category, entryPoints,
    );
    const { image: qrImage, signedPayload } = await qrService.generateQRCode(payload);

    await QRPass.create({
      qrId, holderId: holder._id, eventId: event._id, catId: category._id,
      entryPoints: entryPoints.map((ep) => ep._id),
      payloadSigned: signedPayload,
      validFrom: event.dateStart, validUntil: event.dateEnd,
      deliveryMethod: "third_party", deliveryStatus: "sent", deliveredAt: new Date(),
    });

    const venueLabel = venue ? ` at ${venue}` : "";
    console.log(`[Integration] QR generated for ${phone} (${resolvedName}) at event ${event.eventCode} [${category.catCode}]${venueLabel} via third-party`);

    await trySendWhatsApp(phone, qrImage, holder, event, entryPoints);

    return res.status(200).json({
      status: true, message: "QR code generated successfully",
      qr_code: qrImage, qr_id: qrId,
    });
  } catch (error) {
    console.error("[Integration] generateVolunteerQR error:", error);
    return res.status(500).json({ status: false, message: "Failed to generate QR code" });
  }
};

/**
 * GET /api/integration/status
 */
exports.status = (req, res) => {
  res.json({ status: true, message: "ISKCON Seva Pass API is operational", timestamp: new Date().toISOString() });
};

/**
 * GET /api/integration/qr/:qrId
 *
 * Returns live QR pass status and redemption history for integration partners.
 * Protected by requireApiKey (x-api-key header).
 * Returns a flat response so the Seva Pass app can enrich pass lists with
 * scanned status without needing JWT authentication.
 */
exports.getQRDetails = async (req, res) => {
  try {
    const { qrId } = req.params;
    if (!qrId) {
      return res.status(400).json({ status: false, message: "qrId is required" });
    }

    const qrPass = await QRPass.findOne({ qrId })
      .populate("holderId", "name phone email")
      .populate("eventId", "name eventCode")
      .populate("catId", "name catCode")
      .populate("entryPoints", "name stationLabel")
      .lean();

    if (!qrPass) {
      return res.status(404).json({ status: false, message: "QR pass not found" });
    }

    // Return flat response — status and redemptionHistory at top level
    // so the Seva Pass app can read them directly without unwrapping.
    return res.json({
      status: qrPass.status || "active",
      redemptionHistory: qrPass.redemptionHistory || [],
      qrId: qrPass.qrId,
      holder: qrPass.holderId || null,
      event: qrPass.eventId || null,
      category: qrPass.catId || null,
      entryPoints: qrPass.entryPoints || [],
      validFrom: qrPass.validFrom || null,
      validUntil: qrPass.validUntil || null,
    });
  } catch (error) {
    console.error("[Integration] getQRDetails error:", error);
    return res.status(500).json({ status: false, message: "Failed to fetch QR details" });
  }
};

// ─── Preacher management via integration API ─────────────────────────────────
// These endpoints allow the third-party Seva Pass app to create, list, and
// delete preachers on the main system using the integration API key.

const User = require("../models/User");

/**
 * POST /api/integration/preachers
 * Create a preacher on the main system.
 * Body: { name, email?, phone?, password, shortCode }
 */
exports.createPreacher = async (req, res) => {
  try {
    const { name, email, phone, password, shortCode } = req.body;

    if (!name || !password || !shortCode) {
      return res.status(400).json({ status: false, message: "name, password, and shortCode are required" });
    }
    if (!email && !phone) {
      return res.status(400).json({ status: false, message: "email or phone is required" });
    }

    const cleanCode = String(shortCode).trim().toUpperCase();
    if (cleanCode.length < 2 || cleanCode.length > 10 || !/^[A-Z0-9]+$/.test(cleanCode)) {
      return res.status(400).json({ status: false, message: "shortCode must be 2-10 alphanumeric characters" });
    }

    // Check uniqueness
    const existingCode = await User.findOne({ shortCode: cleanCode });
    if (existingCode) {
      return res.status(409).json({ status: false, message: `Short code "${cleanCode}" already exists` });
    }
    if (email) {
      const existingEmail = await User.findOne({ email: String(email).trim().toLowerCase() });
      if (existingEmail) {
        return res.status(409).json({ status: false, message: "Email already exists" });
      }
    }

    const preacher = await User.create({
      name: name.trim(),
      email: email ? String(email).trim().toLowerCase() : undefined,
      phone: phone ? String(phone).trim() : undefined,
      password,
      shortCode: cleanCode,
      role: "preacher",
      isActive: true,
    });

    return res.status(201).json({
      status: true,
      message: "Preacher created",
      preacher: { id: preacher._id, name: preacher.name, shortCode: preacher.shortCode },
    });
  } catch (error) {
    console.error("[Integration] createPreacher error:", error);
    return res.status(500).json({ status: false, message: "Failed to create preacher" });
  }
};

/**
 * GET /api/integration/preachers
 * List all active preachers.
 */
exports.listPreachers = async (req, res) => {
  try {
    const preachers = await User.find({ role: "preacher" })
      .select("name email phone shortCode isActive createdAt")
      .sort({ createdAt: -1 })
      .lean();
    return res.json(preachers);
  } catch (error) {
    console.error("[Integration] listPreachers error:", error);
    return res.status(500).json({ status: false, message: "Failed to list preachers" });
  }
};

/**
 * DELETE /api/integration/preachers/:id
 * Soft-delete a preacher (set isActive: false).
 * :id can be the MongoDB _id or the shortCode.
 */
exports.deletePreacher = async (req, res) => {
  try {
    const { id } = req.params;
    const filter = /^[0-9a-fA-F]{24}$/.test(id)
      ? { _id: id }
      : { shortCode: String(id).toUpperCase() };

    const preacher = await User.findOneAndUpdate(
      { ...filter, role: "preacher" },
      { isActive: false },
      { new: true }
    );
    if (!preacher) {
      return res.status(404).json({ status: false, message: "Preacher not found" });
    }
    return res.json({ status: true, message: "Preacher deactivated" });
  } catch (error) {
    console.error("[Integration] deletePreacher error:", error);
    return res.status(500).json({ status: false, message: "Failed to delete preacher" });
  }
};
