import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import Pass, { PASS_TYPES, PASS_STATUSES } from '../models/Pass.js';
import Event from '../models/Event.js';
import User from '../models/User.js';
import { isWhatsAppConfigured, sendPassQrWhatsApp } from '../services/whatsapp.js';
import { isMainSystemConfigured, claimQr, fetchCategories, fetchVenues, MainSystemError } from '../services/mainSystem.js';

const router = Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function qrSvg(content) {
  const svg = await QRCode.toString(content, { type: 'svg', margin: 1, width: 240 });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function serializePass(doc) {
  return {
    id: doc._id.toString(),
    token: doc.token,
    donor_name: doc.donor_name,
    phone: doc.phone,
    email: doc.email,
    pass_type: doc.pass_type,
    notes: doc.notes,
    qr_content: doc.qr_content,
    status: doc.status,
    source: doc.source || 'local',
    recipient_id: doc.recipient_id || null,
    qr_token: doc.qr_token || '',
    main_qr_id: doc.qr_token || '',
    event_id: doc.event_id ? doc.event_id._id?.toString() || doc.event_id.toString() : null,
    event_name: doc.event_id?.name || null,
    issued_by: doc.issued_by ? doc.issued_by._id?.toString() || doc.issued_by.toString() : null,
    issuer_name: doc.issued_by?.name || null,
    checked_in_at: doc.checked_in_at || null,
    valid_from: doc.valid_from || null,
    valid_until: doc.valid_until || null,
    created_at: doc.created_at || null,
  };
}

// qr_image (the main system's own PNG) is included so WhatsApp sharing
// can send the actual gate-scannable QR, not just a pass URL link.
async function serializePassWithQr(doc, { includeImage = false } = {}) {
  const base = serializePass(doc);
  const extra = {};
  // Always include qr_image when available — needed for WhatsApp sharing
  if (doc.main_qr_image) extra.qr_image = doc.main_qr_image;
  return { ...base, ...extra, qr_svg: await qrSvg(doc.qr_content) };
}

async function loadPassById(id) {
  return Pass.findById(id).populate('event_id', 'name').populate('issued_by', 'name').lean();
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', wrap(async (req, res) => {
  const { q = '', status = '', event_id = '' } = req.query;
  const filter = {};

  if (q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [{ donor_name: rx }, { phone: rx }, { email: rx }, { token: rx }, { qr_token: rx }];
  }
  if (status && PASS_STATUSES.includes(status)) {
    filter.status = status;
  }
  if (event_id && mongoose.isValidObjectId(event_id)) {
    filter.event_id = event_id;
  }

  const passes = await Pass.find(filter)
    .sort({ created_at: -1 })
    .limit(500)
    .populate('event_id', 'name')
    .populate('issued_by', 'name')
    .lean();

  const withQr = await Promise.all(passes.map((p) => serializePassWithQr(p)));
  res.json({ passes: withQr, pass_types: PASS_TYPES });
}));

// Fetch available venues for an event from the main system.
// Returns an empty array if the main system is not configured or the endpoint
// doesn't exist yet (graceful degradation).
router.get('/venues', wrap(async (req, res) => {
  const { event_code = '' } = req.query;
  if (!event_code) {
    return res.json({ venues: [] });
  }
  const venues = await fetchVenues(event_code);
  res.json({ venues });
}));

// Fetch the pass types (categories) available for an event from the main
// system, so the Issue Pass form can offer the event's real types instead of
// a static list. Empty array on failure (falls back to the static list).
router.get('/categories', wrap(async (req, res) => {
  const { event_code = '' } = req.query;
  if (!event_code) {
    return res.json({ categories: [] });
  }
  const categories = await fetchCategories(event_code);
  res.json({ categories });
}));

async function quotaUsed(userId) {
  return Pass.countDocuments({ issued_by: userId, status: { $ne: 'revoked' } });
}

router.post('/', wrap(async (req, res) => {
  const {
    donor_name,
    phone = '',
    email = '',
    pass_type = 'General',
    notes = '',
    event_id = null,
    venue = '',
    // `category` is the pass type chosen from the event's categories on the
    // main system (a category name or code). Falls back to pass_type.
    category = '',
    valid_from = '',
    valid_until = '',
    baseUrl = '',
  } = req.body || {};

  if (!donor_name) {
    return res.status(400).json({ error: 'Donor / invitee name is required' });
  }
  // Pass types come from the selected event's categories (e.g. Invitee, Sponsor,
  // General Public), so no fixed allow-list — just require a non-empty value.
  const passType = (pass_type || '').trim() || 'General';
  if (event_id && !mongoose.isValidObjectId(event_id)) {
    return res.status(400).json({ error: 'Invalid event_id' });
  }

  // ---- Devotee quota: each app devotee may hold up to `quota` non-revoked passes.
  // Preachers (main-system devotees) are not quota-limited — the main system
  // governs their issuance. The app user is also loaded for preachers' short
  // code attribution below.
  let appUser = null;
  if (req.user.role !== 'preacher') {
    appUser = await User.findById(req.user.id);
    const quota = appUser?.quota || 30;
    const used = await quotaUsed(req.user.id);
    if (used >= quota) {
      return res.status(403).json({
        error: `Quota exceeded: ${used} of ${quota} passes already issued. Revoke an unused pass to free up quota.`,
      });
    }
  }

  const token = crypto.randomBytes(16).toString('hex');
  const origin = baseUrl && /^https?:\/\//i.test(baseUrl) ? baseUrl.replace(/\/+$/, '') : '';

  // ---- When the main system is configured, the QR comes from there (by phone) ----
  let source = 'local';
  let recipientId = null;
  let qrToken = '';
  let mainQrImage = '';
  let qrContent = origin ? `${origin}/pass?t=${token}` : token;

  if (isMainSystemConfigured()) {
    if (!phone.trim()) {
      return res.status(400).json({ error: 'Phone number is required to claim a QR from the main system' });
    }
    // Look up the selected event's event_code to send to the main system.
    // Falls back to the env var (MAIN_SYSTEM_EVENT_ID) if no event is selected or it has no code.
    let eventCode = '';
    if (event_id) {
      const ev = await Event.findById(event_id).lean();
      eventCode = ev?.event_code || '';
    }
    try {
      const claimed = await claimQr({
        phone: phone.trim(),
        name: donor_name.trim(),
        email: email.trim(),
        eventCode,
        venue: venue || '',
        category: (category || passType).trim(),
        // Preachers get their passes attributed to them on the main system,
        // so they show up under that preacher's "My Passes". App devotees are
        // attributed by their 4-char preacher code (the link between the two).
        preacher:
          req.user.role === 'preacher'
            ? req.user.name || ''
            : (appUser?.short_code || '').trim(),
        preacherId: req.user.role === 'preacher' ? req.user.id || null : null,
      });
      source = 'main-system';
      recipientId = claimed.qrId || null;
      qrToken = claimed.qrId || '';
      mainQrImage = claimed.qrImage || '';
      // The main system's gate also accepts a bare QR id, so the fallback QR
      // content (used if the image is missing) is the id itself.
      qrContent = claimed.qrId || qrContent;
    } catch (err) {
      // If the main system doesn't have this event, fall back to local QR.
      // This allows events created only in the Seva Pass system to work.
      if (err instanceof MainSystemError) {
        console.warn(`[Passes] Main system claim failed (${err.message}), falling back to local QR`);
      } else {
        throw err;
      }
    }
  }

  const pass = await Pass.create({
    token,
    donor_name: donor_name.trim(),
    phone: phone.trim(),
    email: email.trim(),
    pass_type: passType,
    notes: notes.trim(),
    qr_content: qrContent,
    source,
    recipient_id: recipientId,
    qr_token: qrToken,
    main_qr_image: mainQrImage,
    event_id: event_id || null,
    // Preacher-issued passes are attributed on the main system (holder.preacherId)
    // — their id isn't an app user, so don't store it as issued_by.
    issued_by: req.user.role === 'preacher' ? null : req.user.id,
    valid_from: valid_from || null,
    valid_until: valid_until || null,
  });

  res.status(201).json({ pass: await serializePassWithQr(await loadPassById(pass._id), { includeImage: true }) });
}));

router.get('/:id/qr.png', wrap(async (req, res) => {
  const pass = await Pass.findById(req.params.id);
  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }
  res.setHeader('Content-Disposition', `attachment; filename="pass-${pass.token.slice(0, 8)}.png"`);
  // Main-system passes: hand back the main system's own QR image.
  if (pass.main_qr_image) {
    const base64 = String(pass.main_qr_image).replace(/^data:image\/\w+;base64,/, '');
    res.setHeader('Content-Type', 'image/png');
    return res.send(Buffer.from(base64, 'base64'));
  }
  const buf = await QRCode.toBuffer(pass.qr_content, { type: 'png', margin: 1, width: 600 });
  res.setHeader('Content-Type', 'image/png');
  res.send(buf);
}));

router.get('/:id', wrap(async (req, res) => {
  const pass = await loadPassById(req.params.id);
  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }
  res.json({ pass: await serializePassWithQr(pass, { includeImage: true }) });
}));

router.post('/:id/send-whatsapp', wrap(async (req, res) => {
  if (!isWhatsAppConfigured()) {
    return res.status(501).json({
      error: 'WhatsApp delivery is not configured yet. Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID in server/.env.',
    });
  }
  const pass = await Pass.findById(req.params.id).populate('event_id', 'name');
  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }
  const result = await sendPassQrWhatsApp(pass);
  res.json({ ok: true, result });
}));

router.post('/:id/revoke', wrap(async (req, res) => {
  const pass = await Pass.findById(req.params.id);
  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }
  pass.status = 'revoked';
  await pass.save();
  res.json({ pass: await serializePassWithQr(await loadPassById(pass._id), { includeImage: true }) });
}));

export default router;
