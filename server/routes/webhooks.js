import { Router } from 'express';
import Pass from '../models/Pass.js';

const router = Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * POST /api/webhooks/whatsapp
 *
 * Receives delivery status callbacks from Gupshup (and optionally Meta /
 * Flaxxa-style payloads) so the app can update delivery_status to 'delivered'
 * when the message actually reaches the recipient's device.
 *
 * Gupshup callback payload (when a "message" event is subscribed):
 *   { app, ts, version, payload: { type, id, phones: [{ phone, status, ... }, ...] } }
 *
 * We accept a lenient set of shapes and match by message id (delivery_message_id)
 * or by phone number.
 */
router.post('/', wrap(async (req, res) => {
  const body = req.body || {};
  console.log('[WhatsAppWebhook] received:', JSON.stringify(body).slice(0, 500));

  const updates = extractUpdates(body);
  let matched = 0;
  for (const u of updates) {
    const match = await findPass(u.messageId, u.phone);
    if (!match) continue;
    matched++;
    updatePassDelivery(match, u.status);
    await match.save();
    console.log(`[WhatsAppWebhook] pass ${match.token} → ${u.status}`);
  }

  // Acknowledge immediately so the provider doesn't retry the webhook.
  res.json({ ok: true, matched });
}));

/**
 * GET /api/webhooks/whatsapp
 *
 * Subscription verification for Gupshup / Flaxxa-style webhook set up.
 * Gupshup typically uses POST-only callbacks, but we support the standard
 * hub.challenge handshake used by some providers.
 */
router.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  const expected = process.env.WEBHOOK_VERIFY_TOKEN;
  if (mode === 'subscribe' && expected && token === expected) {
    return res.send(challenge);
  }
  res.status(403).json({ error: 'Forbidden' });
});

function extractUpdates(body) {
  const updates = [];

  // Gupshup "message" payload
  if (body?.payload?.type === 'message' && Array.isArray(body.payload.phones)) {
    for (const p of body.payload.phones) {
      updates.push({
        messageId: p.id || p.messageId || null,
        phone: p.phone || null,
        status: normalizeStatus(p.status),
      });
    }
    return updates;
  }

  // Flaxxa-style: { message_id, status, phone }
  if (body?.message_id || body?.messageId) {
    updates.push({
      messageId: body.message_id || body.messageId,
      phone: body.phone || null,
      status: normalizeStatus(body.status || body.event),
    });
    return updates;
  }

  // Meta-style: entry[] > changes[] > statuses[] (older, optional)
  const statuses = body?.entry?.flatMap((e) => e.changes || [])
    .flatMap((c) => (c.value && c.value.statuses) || []) || [];
  for (const s of statuses) {
    updates.push({
      messageId: s.id || s.message_id || null,
      phone: s.recipient_id || null,
      status: normalizeStatus(s.status),
    });
  }

  return updates;
}

function normalizeStatus(status) {
  const s = String(status || '').toLowerCase();
  if (['delivered', 'read', 'readmsg'].includes(s)) return 'delivered';
  if (['failed', 'error', 'rejected'].includes(s)) return 'failed';
  if (['sent', 'accepted', 'submitted', 'enqueued'].includes(s)) return 'sent';
  return 'sent';
}

async function findPass(messageId, phone) {
  if (messageId) {
    const byId = await Pass.findOne({ delivery_message_id: messageId });
    if (byId) return byId;
  }
  if (phone) {
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 10) return null;
    // Match the tail (10 digits) against pass phone.
    const tail = digits.slice(-10);
    const byPhone = await Pass.findOne({ delivery_status: { $in: ['sent', 'pending', 'failed'] }, phone: { $regex: tail + '$' } }).sort({ created_at: -1 });
    if (byPhone) return byPhone;
  }
  return null;
}

function updatePassDelivery(pass, status) {
  if (status === 'delivered' && pass.delivery_status !== 'delivered') {
    pass.delivery_status = 'delivered';
    pass.delivered_at = new Date();
    pass.delivery_error = '';
  } else if (status === 'failed') {
    pass.delivery_status = 'failed';
    pass.delivery_error = pass.delivery_error || 'Delivery failed (provider callback)';
  } else if (status === 'sent' && pass.delivery_status === 'pending') {
    pass.delivery_status = 'sent';
    pass.delivered_at = new Date();
  }
}

export default router;
