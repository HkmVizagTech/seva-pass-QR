import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import { generateStyledQrPng, generateStyledQrSvg } from '../services/styledQr.js';
import Pass, { PASS_TYPES, PASS_STATUSES } from '../models/Pass.js';
import Event from '../models/Event.js';
import User from '../models/User.js';
import { isWhatsAppConfigured, sendPassQrWhatsApp } from '../services/whatsapp.js';
import { isMainSystemConfigured, claimQr, fetchCategories, fetchVenues, MainSystemError, getQrPassDetails, batchGetQrPassDetails } from '../services/mainSystem.js';
import { deliverPass } from '../services/deliverySweep.js';

const router = Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Whether the event has a Vaikuntham community-app id mapped (so community
// push is possible even when the pass has no phone number).
async function passHasCommunityApp(eventId) {
  if (!eventId || !mongoose.isValidObjectId(eventId)) return false;
  const ev = await Event.findById(eventId).lean();
  return Boolean(ev?.third_party_event_id);
}

async function qrSvg(content) {
  try {
    const svg = await generateStyledQrSvg(content, { width: 300, height: 300 });
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  } catch {
    // Fallback to plain qrcode if styled generation fails.
    const svg = await QRCode.toString(content, { type: 'svg', margin: 1, width: 240 });
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
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
    live_status: doc.live_status || null,
    redemption_history: doc.redemption_history || [],
    delivery_status: doc.delivery_status || 'pending',
    delivery_error: doc.delivery_error || '',
    community_app_sync: doc.community_app_sync || '',
    source: doc.source || 'local',
    recipient_id: doc.recipient_id || null,
    qr_token: doc.qr_token || '',
    main_qr_id: doc.qr_token || '',
    event_id: doc.event_id ? doc.event_id._id?.toString() || doc.event_id.toString() : null,
    event_name: doc.event_id?.name || null,
    issued_by: doc.issued_by ? doc.issued_by._id?.toString() || doc.issued_by.toString() : null,
    issuer_name: doc.issued_by?.name || null,
    preacher_id: doc.preacher_id ? doc.preacher_id._id?.toString() || doc.preacher_id.toString() : null,
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
  return Pass.findById(id).populate('event_id', 'name').populate('issued_by', 'name').populate('preacher_id', 'name short_code').lean();
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

  // Non-admin users only see their own passes + passes assigned to them.
  if (req.user.role !== 'admin') {
    filter.$or = filter.$or || [];
    filter.$or.push({ issued_by: req.user.id });
    filter.$or.push({ preacher_id: req.user.id });
    if (filter.$or.length === 0) delete filter.$or;
  }

  const passes = await Pass.find(filter)
    .sort({ created_at: -1 })
    .limit(500)
    .populate('event_id', 'name')
    .populate('issued_by', 'name')
    .populate('preacher_id', 'name short_code')
    .lean();

  const withQr = await Promise.all(passes.map((p) => serializePassWithQr(p)));

  // Enrich with live status from the main system for main-system passes.
  if (isMainSystemConfigured()) {
    const qrIds = withQr.filter((p) => p.source === 'main-system' && p.qr_token).map((p) => p.qr_token);
    if (qrIds.length) {
      try {
        const liveMap = await batchGetQrPassDetails(qrIds);
        withQr.forEach((p) => {
          const live = liveMap.get(p.qr_token);
          if (live) {
            p.live_status = live.status || null;
            p.redemption_history = live.redemptionHistory || [];
          }
        });
      } catch {
        // Enrichment is best-effort; listing still works without it.
      }
    }
  }

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

// Diagnostic: check main-system connectivity (admin only).
router.get('/test-main-system', wrap(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  const { isMainSystemConfigured } = await import('../services/mainSystem.js');
  const configured = isMainSystemConfigured();
  if (!configured) {
    return res.json({ configured: false, error: 'MAIN_SYSTEM_API_URL is not set' });
  }
  try {
    const { fetchEvents } = await import('../services/mainSystem.js');
    const events = await fetchEvents();
    res.json({ configured: true, events: events.length, sample: events.slice(0, 3) });
  } catch (err) {
    res.json({ configured: true, error: err.message });
  }
}));

async function quotaUsed(userId, eventId, category) {
  const filter = { issued_by: userId, status: { $ne: 'revoked' } };
  if (eventId) filter.event_id = eventId;
  if (category) {
    filter.pass_type = new RegExp(`^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  }
  return Pass.countDocuments(filter);
}

// Per-user mutex to make quota check + pass creation atomic.
// Prevents two concurrent requests from the same user exceeding the quota.
const userLocks = new Map();
async function withUserLock(userId, fn) {
  const prev = userLocks.get(userId) || Promise.resolve();
  const next = prev.then(fn, fn);
  userLocks.set(userId, next.catch(() => {}));
  // Clean up completed locks to prevent memory leaks.
  next.then(() => { if (userLocks.get(userId) === next) userLocks.delete(userId); });
  return next;
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
    // When admin issues a pass for a specific preacher, pass their user ID.
    preacher_id = '',
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
  // Main-system devotees (with main_token) are not quota-limited — the main
  // system governs their issuance. The app user is also loaded for short
  // code attribution below.
  let appUser = null;

  // Build the pass data. For local devotees, wrap in a per-user lock so the
  // quota check + pass creation are atomic (prevents concurrent over-issuance).
  const buildPass = async () => {
    if (!req.user.main_token) {
      appUser = await User.findById(req.user.id);
      const rawQuota = event_id && appUser?.event_quotas?.get(String(event_id));
      // rawQuota can be: number (old format) or {catCode: num} (per-category)
      let quota;
      let categoryLimit = null;
      if (rawQuota && typeof rawQuota === 'object' && !Array.isArray(rawQuota)) {
        // Per-category format: sum of all category limits = total for this event
        quota = Object.values(rawQuota).reduce((s, v) => s + (Number(v) || 0), 0) || appUser?.quota || 30;
        // If a specific category was selected, check its individual limit
        const catCode = (category || passType || '').trim().toUpperCase();
        if (catCode && rawQuota[catCode] != null) {
          categoryLimit = Number(rawQuota[catCode]);
        }
      } else {
        quota = rawQuota || appUser?.quota || 30;
      }
      const used = await quotaUsed(req.user.id, event_id || null);
      if (used >= quota) {
        return { error: `Quota exceeded: ${used} of ${quota} passes already issued for this event. Revoke an unused pass to free up quota.` };
      }
      if (categoryLimit !== null) {
        const catUsed = await quotaUsed(req.user.id, event_id || null, (category || passType || '').trim());
        if (catUsed >= categoryLimit) {
          return { error: `Category limit reached: ${catUsed} of ${categoryLimit} ${(category || passType || '').trim()} passes already issued for this event.` };
        }
      }
    }

    const token = crypto.randomBytes(16).toString('hex');
    const origin = baseUrl && /^https?:\/\//i.test(baseUrl) ? baseUrl.replace(/\/+$/, '') : '';

    let source = 'local';
    let recipientId = null;
    let qrToken = '';
    let mainQrImage = '';
    let qrContent = origin ? `${origin}/pass?t=${token}` : token;

    if (isMainSystemConfigured()) {
      if (!phone.trim()) {
        return { error: 'Phone number is required to claim a QR from the main system', status: 400 };
      }
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
          preacher:
            req.user.main_token
              ? req.user.name || ''
              : (appUser?.short_code || '').trim(),
          preacherId: req.user.main_token ? req.user.id || null : null,
        });
        source = 'main-system';
        recipientId = claimed.qrId || null;
        qrToken = claimed.qrId || '';
        mainQrImage = claimed.qrImage || '';
        qrContent = claimed.qrId || qrContent;
      } catch (err) {
        if (err instanceof MainSystemError) {
          console.error(`[Passes] Main system claim failed: ${err.message}`);
          return { error: `Could not generate gate QR: ${err.message}`, status: 502 };
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
      issued_by: req.user.id,
      // Admin can assign a pass to a specific preacher by user ID.
      preacher_id: req.user.role === 'admin' && preacher_id && mongoose.isValidObjectId(preacher_id) ? preacher_id : null,
      valid_from: valid_from || null,
      valid_until: valid_until || null,
    });

    // Auto-deliver: send via Gupshup WhatsApp + push to the Vaikuntham
    // community app. Best-effort — the pass is created regardless, and the
    // background sweep retries pending/failed deliveries later.
    if (phone.trim() || (await passHasCommunityApp(event_id))) {
      try {
        await deliverPass(await Pass.findById(pass._id));
      } catch (err) {
        console.error('[Passes] Auto-delivery failed:', err.message);
      }
    }

    return { pass: await serializePassWithQr(await loadPassById(pass._id), { includeImage: true }) };
  };

  const result = req.user.main_token
    ? await buildPass()
    : await withUserLock(req.user.id, buildPass);
  if (result.error) {
    return res.status(result.status || 403).json({ error: result.error });
  }
  res.status(201).json(result);
}));

router.get('/:id/qr.png', wrap(async (req, res) => {
  const pass = await Pass.findById(req.params.id);
  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }
  res.setHeader('Content-Disposition', `attachment; filename="pass-${pass.token.slice(0, 8)}.png"`);
  const buf = await generateStyledQrPng(pass.qr_content);
  res.setHeader('Content-Type', 'image/png');
  res.send(buf);
}));

router.get('/:id', wrap(async (req, res) => {
  const pass = await loadPassById(req.params.id);
  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }
  const serialized = await serializePassWithQr(pass, { includeImage: true });

  // Enrich with live status from the main system.
  if (serialized.source === 'main-system' && serialized.qr_token && isMainSystemConfigured()) {
    try {
      const live = await getQrPassDetails(serialized.qr_token);
      if (live) {
        serialized.live_status = live.status || null;
        serialized.redemption_history = live.redemptionHistory || [];
      }
    } catch {
      // Best-effort enrichment.
    }
  }

  res.json({ pass: serialized });
}));

// ---- Helper: only admins or the pass issuer can operate on a pass. ----
function assertOwnership(req, pass) {
  if (req.user.role === 'admin') return; // admins can do anything
  if (String(pass.issued_by) === String(req.user.id)) return; // issuer owns it
  return false;
}

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
  if (assertOwnership(req, pass) === false) {
    return res.status(403).json({ error: 'You do not have permission to send WhatsApp for this pass' });
  }
  const result = await sendPassQrWhatsApp(pass);
  pass.delivery_status = 'sent';
  await pass.save();
  res.json({ ok: true, result });
}));

router.post('/:id/revoke', wrap(async (req, res) => {
  const pass = await Pass.findById(req.params.id);
  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }
  if (assertOwnership(req, pass) === false) {
    return res.status(403).json({ error: 'You do not have permission to revoke this pass' });
  }
  pass.status = 'revoked';
  await pass.save();
  res.json({ pass: await serializePassWithQr(await loadPassById(pass._id), { includeImage: true }) });
}));

// Retry auto-delivery (Gupshup WhatsApp + Vaikuntham community app) for a pass
// that failed or was never delivered. Triggers the same pipeline as on-create.
router.post('/:id/retry-delivery', wrap(async (req, res) => {
  const pass = await Pass.findById(req.params.id);
  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }
  if (assertOwnership(req, pass) === false) {
    return res.status(403).json({ error: 'You do not have permission to retry this pass' });
  }
  if (pass.status === 'revoked') {
    return res.status(400).json({ error: 'Cannot deliver a revoked pass' });
  }
  const result = await deliverPass(await Pass.findById(pass._id));
  res.json({ ok: true, pass: await serializePassWithQr(await loadPassById(pass._id), { includeImage: true }), delivery: result });
}));

export default router;
