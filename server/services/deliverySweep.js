import Pass from '../models/Pass.js';
import Event from '../models/Event.js';
import User from '../models/User.js';
import { isGupshupConfigured, sendPassQrWhatsApp } from './gupshup.js';
import { pushPassToCommunityApp } from './communityApp.js';
// Delay between autosend attempts for the same pass (ms) — avoid hammering
// the WhatsApp API with retries within a short window.
const MIN_RETRY_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Auto-deliver a pass: send via Gupshup WhatsApp and push to the Vaikuntham
 * community app. Updates the pass's delivery_status / delivery_error /
 * community_app_sync fields accordingly.
 *
 * @returns {{whatsapp: object, community: object}}
 */
export async function deliverPass(pass) {
  const event = pass.event_id ? await Event.findById(pass.event_id).lean() : null;
  const issuedBy = pass.issued_by ? await User.findById(pass.issued_by).lean() : null;

  const result = { whatsapp: null, community: null };

  // 1. WhatsApp — if a phone exists but Gupshup is not configured, record the
  // reason explicitly instead of leaving the pass silently 'pending' forever.
  if (pass.phone) {
    if (!isGupshupConfigured()) {
      pass.delivery_status = 'failed';
      pass.delivery_provider = 'gupshup';
      pass.delivery_error =
        'Gupshup is not configured. Set GUPSHUP_ENABLED, GUPSHUP_API_KEY, GUPSHUP_SOURCE_NUMBER, GUPSHUP_APP_NAME and BACKEND_PUBLIC_URL in server/.env.';
      result.whatsapp = { success: false, error: pass.delivery_error };
    } else {
      try {
        const wa = await sendPassQrWhatsApp(pass, event);
        pass.delivery_status = 'sent';
        pass.delivery_provider = 'gupshup';
        if (wa.messageId) pass.delivery_message_id = wa.messageId;
        pass.delivery_error = '';
        pass.delivered_at = new Date();
        result.whatsapp = { success: true, messageId: wa.messageId };
      } catch (err) {
        pass.delivery_status = 'failed';
        pass.delivery_provider = 'gupshup';
        pass.delivery_error = err.message || 'WhatsApp send failed';
        result.whatsapp = { success: false, error: pass.delivery_error };
      }
    }
  }

  // 2. Vaikuntham community app — always attempted when configured + mapped.
  if (isCommunityAppPushPossible(pass, event)) {
    const community = await pushPassToCommunityApp({ pass: pass.toObject ? pass.toObject() : pass, event, issuedBy });
    pass.community_app_sync = community.success
      ? `sent (${community.endpoint})`
      : community.skipped
        ? `skipped: ${community.reason}`
        : `failed: ${community.reason || community.endpoint}`;
    result.community = community;
  }

  await pass.save();
  return result;
}

function isCommunityAppPushPossible(pass, event) {
  return Boolean(event?.third_party_event_id);
}

/**
 * Background sweep: re-attempt deliveries for passes that are 'pending'
 * (never auto-sent) or 'failed' (previous attempt failed) but not revoked,
 * and only if enough time has passed since the last attempt.
 *
 * Exports the interval so it can be cleared in tests.
 */
let sweepTimer = null;

export function startDeliverySweep(intervalMs = 5 * 60 * 1000) {
  if (sweepTimer) return;
  const run = async () => {
    try {
      await sweep();
    } catch (err) {
      console.error('[DeliverySweep] sweep error:', err.message);
    }
  };
  // Run once shortly after startup, then on the interval.
  setTimeout(run, 10000);
  sweepTimer = setInterval(run, intervalMs);
  sweepTimer.unref?.();
  console.log(`[DeliverySweep] started (every ${Math.round(intervalMs / 60000)} min)`);
}

export function stopDeliverySweep() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

export async function sweep() {
  const cutoff = new Date(Date.now() - MIN_RETRY_INTERVAL_MS);
  const candidates = await Pass.find({
    delivery_status: { $in: ['pending', 'failed'] },
    status: { $ne: 'revoked' },
    $or: [
      { delivered_at: null },
      { delivered_at: { $lt: cutoff } },
    ],
  }).limit(50).lean();

  if (candidates.length === 0) return 0;

  let attempted = 0;
  for (const c of candidates) {
    // Skip if nothing to send (no phone and no community app would accept it
    // is handled in deliverPass itself).
    try {
      const pass = await Pass.findById(c._id);
      if (!pass) continue;
      // Re-check status after re-fetch to avoid double-sending.
      if (pass.delivery_status === 'sent' || pass.delivery_status === 'delivered') continue;
      const res = await deliverPass(pass);
      attempted++;
      console.log(`[DeliverySweep] pass ${pass.token} →`, JSON.stringify(res));
    } catch (err) {
      console.error(`[DeliverySweep] failed processing pass ${c.token}:`, err.message);
    }
  }
  console.log(`[DeliverySweep] processed ${attempted} pass(es)`);
  return attempted;
}
