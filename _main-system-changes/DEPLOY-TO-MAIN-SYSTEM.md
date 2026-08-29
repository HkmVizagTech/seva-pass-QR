# Deploy to Main System (iskcon-seva-pass-backend)

These are the **additions** needed on the main system. No existing endpoints are modified.

## 1. New controller handler: `sevaPassIssue`

Add to `src/controllers/integrationController.js` (at the end, before `module.exports`):

```js
// ─── Seva Pass app — dedicated single-holder QR endpoint ───────────────────
// POST /api/integration/seva-pass/issue
//
// Dedicated for the Seva Pass app (devotee-facing). Accepts flat format
// and issues a single QR pass. Does NOT interfere with
// /generate-volunteer-qr used by other consumers.
//
// Request body:
//   { event_id, user_phone_number, user_email?, name?, venue?, category?,
//     preacher?, preacherId? }
// Response:
//   { status: true, message, qr_code: <base64 PNG data URL>, qr_id }

exports.sevaPassIssue = async (req, res) => {
  try {
    const {
      event_id, user_phone_number, user_email, venue,
      category: categoryParam, name: holderName, preacher, preacherId,
    } = req.body;

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

    // ── Resolve category: prefer the one sent by the Seva Pass app ─────────
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
      console.warn("[SevaPass] holder type lookup failed:", e.message);
    }

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
    console.log(`[SevaPass] QR generated for ${phone} (${resolvedName}) at event ${event.eventCode} [${category.catCode}]${venueLabel}`);

    await trySendWhatsApp(phone, qrImage, holder, event, entryPoints);

    return res.status(200).json({
      status: true, message: "QR code generated successfully",
      qr_code: qrImage, qr_id: qrId,
    });
  } catch (error) {
    console.error("[SevaPass] sevaPassIssue error:", error);
    return res.status(500).json({ status: false, message: "Failed to generate QR code" });
  }
};
```

## 2. New route

Add to `src/routes/integration.js` (after the `generate-volunteer-qr` route):

```js
// ─── Seva Pass app — dedicated single-holder QR endpoint ───────────────────
// POST /api/integration/seva-pass/issue
router.post("/seva-pass/issue", requireApiKey, integrationController.sevaPassIssue);
```

## 3. Preacher management endpoints (if not already deployed)

These enable the Seva Pass app to list, create, and delete preachers.

### Routes — add to `src/routes/integration.js`:

```js
// Preacher management via integration API
router.post("/preachers", requireApiKey, integrationController.createPreacher);
router.get("/preachers", requireApiKey, integrationController.listPreachers);
router.delete("/preachers/:id", requireApiKey, integrationController.deletePreacher);
```

### Controller handlers — add to `src/controllers/integrationController.js`:

```js
const User = require("../models/User");

/** POST /api/integration/preachers */
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

/** GET /api/integration/preachers */
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

/** DELETE /api/integration/preachers/:id */
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
```

---

## Summary of what gets deployed

| # | Endpoint | Purpose |
|---|---|---|
| 1 | `POST /api/integration/seva-pass/issue` | **New.** Single-holder QR for Seva Pass app |
| 2 | `GET /api/integration/preachers` | **New.** List preachers (enables devotees page) |
| 3 | `POST /api/integration/preachers` | **New.** Create preacher (syncs from app) |
| 4 | `DELETE /api/integration/preachers/:id` | **New.** Soft-delete preacher |

**No existing endpoints are modified.** All other systems remain unaffected.
