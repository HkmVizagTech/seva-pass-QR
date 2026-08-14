/**
 * Main-system integration client.
 *
 * This app is the devotee-facing layer for Hare Krishna Visakhapatnam. QR passes
 * issued here are backed by the main Prasadam Distribution system ("main system",
 * repo: HkmVizagTech/QRsystembackend). When the main system is configured, issuing a
 * pass claims a QR from it by phone, and check-ins are synced back to it.
 *
 * The main system is a separate project — the endpoints this client calls are
 * defined in the integration contract (see README "Main-system API contract").
 * Until those endpoints exist on the main system, leave MAIN_SYSTEM_API_URL unset:
 * the app then generates and validates QRs locally (standalone mode).
 */

const MAIN_API_URL = (process.env.MAIN_SYSTEM_API_URL || '').replace(/\/+$/, '');
const MAIN_API_KEY = process.env.MAIN_SYSTEM_API_KEY || '';

export function isMainSystemConfigured() {
  return Boolean(MAIN_API_URL);
}

export class MainSystemError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

async function request(path, body) {
  if (!MAIN_API_URL) {
    throw new MainSystemError('Main system is not configured. Set MAIN_SYSTEM_API_URL in server/.env', 503);
  }
  const headers = { 'Content-Type': 'application/json' };
  if (MAIN_API_KEY) headers['x-api-key'] = MAIN_API_KEY;

  let res;
  try {
    res = await fetch(`${MAIN_API_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (err) {
    throw new MainSystemError(`Main system unreachable (${err.message})`, 502);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new MainSystemError(data.error || `Main system request failed (${res.status})`, res.status);
  }
  return data;
}

/**
 * Claim a QR for a phone number from the main system.
 * The main system find-or-creates the recipient by phone and returns its QR.
 * Expected response: { recipientId, qrToken, qrContent, qrSvg, category, created }
 */
export async function claimQr({ phone, name, category = 'General' }) {
  return request('/api/recipients/claim', { phone, name, category });
}

/**
 * Mark a QR token as consumed on the main system (gate check-in).
 * Expected response: { recipientId, qrToken, alreadyConsumed }
 */
export async function consumeQr(qrToken) {
  return request('/api/recipients/consume', { qrToken });
}

/** Map this app's pass types onto the main system's categories (VIP/Donor/General). */
export function toMainCategory(passType) {
  if (['VIP', 'Donor'].includes(passType)) return passType;
  return 'General';
}
