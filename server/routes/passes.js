import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import Pass, { PASS_TYPES, PASS_STATUSES } from '../models/Pass.js';
import User from '../models/User.js';
import { isWhatsAppConfigured, sendPassQrWhatsApp } from '../services/whatsapp.js';
import { isMainSystemConfigured, claimQr, consumeQr, toMainCategory, MainSystemError } from '../services/mainSystem.js';

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

async function serializePassWithQr(doc) {
  return { ...serializePass(doc), qr_svg: await qrSvg(doc.qr_content) };
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
    filter.$or = [{ donor_name: rx }, { phone: rx }, { email: rx }, { token: rx }];
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
    valid_from = '',
    valid_until = '',
    baseUrl = '',
  } = req.body || {};

  if (!donor_name) {
    return res.status(400).json({ error: 'Donor / invitee name is required' });
  }
  if (!PASS_TYPES.includes(pass_type)) {
    return res.status(400).json({ error: `pass_type must be one of: ${PASS_TYPES.join(', ')}` });
  }
  if (event_id && !mongoose.isValidObjectId(event_id)) {
    return res.status(400).json({ error: 'Invalid event_id' });
  }

  // ---- Devotee quota: each devotee may hold up to `quota` non-revoked passes ----
  const user = await User.findById(req.user.id);
  const quota = user?.quota || 30;
  const used = await quotaUsed(req.user.id);
  if (used >= quota) {
    return res.status(403).json({
      error: `Quota exceeded: ${used} of ${quota} passes already issued. Revoke an unused pass to free up quota.`,
    });
  }

  const token = crypto.randomBytes(16).toString('hex');
  const origin = baseUrl && /^https?:\/\//i.test(baseUrl) ? baseUrl.replace(/\/+$/, '') : '';

  // ---- When the main system is configured, the QR comes from there (by phone) ----
  let source = 'local';
  let recipientId = null;
  let qrToken = '';
  let qrContent = origin ? `${origin}/pass?t=${token}` : token;

  if (isMainSystemConfigured()) {
    if (!phone.trim()) {
      return res.status(400).json({ error: 'Phone number is required to claim a QR from the main system' });
    }
    try {
      const claimed = await claimQr({ phone: phone.trim(), name: donor_name.trim(), category: toMainCategory(pass_type) });
      source = 'main-system';
      recipientId = claimed.recipientId || null;
      qrToken = claimed.qrToken || '';
      qrContent = claimed.qrContent || qrToken || qrContent;
    } catch (err) {
      if (err instanceof MainSystemError) {
        return res.status(err.status || 502).json({ error: `Main system: ${err.message}` });
      }
      throw err;
    }
  }

  const pass = await Pass.create({
    token,
    donor_name: donor_name.trim(),
    phone: phone.trim(),
    email: email.trim(),
    pass_type,
    notes: notes.trim(),
    qr_content: qrContent,
    source,
    recipient_id: recipientId,
    qr_token: qrToken,
    event_id: event_id || null,
    issued_by: req.user.id,
    valid_from: valid_from || null,
    valid_until: valid_until || null,
  });

  res.status(201).json({ pass: await serializePassWithQr(await loadPassById(pass._id)) });
}));

router.get('/:id/qr.png', wrap(async (req, res) => {
  const pass = await Pass.findById(req.params.id);
  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }
  const buf = await QRCode.toBuffer(pass.qr_content, { type: 'png', margin: 1, width: 600 });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="pass-${pass.token.slice(0, 8)}.png"`);
  res.send(buf);
}));

router.get('/:id', wrap(async (req, res) => {
  const pass = await loadPassById(req.params.id);
  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }
  res.json({ pass: await serializePassWithQr(pass) });
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

router.post('/:token/check-in', wrap(async (req, res) => {
  const scanned = req.params.token.trim();
  // The QR may encode our local token or the main system's QR token.
  const pass = await Pass.findOne({ $or: [{ token: scanned }, { qr_token: scanned }] });
  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }
  if (pass.status === 'revoked') {
    return res.status(409).json({
      error: 'This pass has been revoked',
      pass: await serializePassWithQr(await loadPassById(pass._id)),
    });
  }

  // If the pass came from the main system, tell the main system this QR was used.
  let already = pass.status === 'used';
  let sync = 'none';
  if (pass.source === 'main-system' && pass.qr_token && isMainSystemConfigured()) {
    try {
      const consumed = await consumeQr(pass.qr_token);
      if (consumed.alreadyConsumed) already = true;
      sync = 'ok';
    } catch (err) {
      // Local check-in still proceeds; flag that the main system was not updated.
      sync = 'failed';
    }
  }

  if (!already) {
    pass.status = 'used';
    pass.checked_in_at = new Date();
    await pass.save();
  }

  const serialized = await serializePassWithQr(await loadPassById(pass._id));
  res.json({ pass: serialized, already, sync });
}));

router.post('/:id/revoke', wrap(async (req, res) => {
  const pass = await Pass.findById(req.params.id);
  if (!pass) {
    return res.status(404).json({ error: 'Pass not found' });
  }
  pass.status = 'revoked';
  await pass.save();
  res.json({ pass: await serializePassWithQr(await loadPassById(pass._id)) });
}));

export default router;
