/**
 * Main-system integration client.
 *
 * This app is the devotee-facing layer for Hare Krishna Visakhapatnam. When the
 * main ISKCON Seva Pass system (repo: HkmVizagTech/iskcon-seva-pass-backend) is
 * configured, issuing a pass claims a QR for the invitee's phone from it, and
 * the invitee shows that QR at the gate where the main system's own scanner
 * (HkmVizagTech/iskcon-scanner) validates it.
 *
 * Contract (already implemented on the main system):
 *   POST /api/integration/generate-volunteer-qr
 *     header:  x-api-key: <INTEGRATION_API_KEY>
 *     body:    { event_id, user_phone_number, user_email? }
 *     → 200:   { status: true, message, qr_code: <base64 PNG data URL>, qr_id }
 *     → error: { status: false, message } (4xx/5xx)
 *   event_id is matched against the main system's Event.eventCode (or _id).
 *
 * Until the main system is deployed with INTEGRATION_API_KEY set, leave
 * MAIN_SYSTEM_API_URL unset: the app then generates and validates QRs locally
 * (standalone mode).
 */

const MAIN_API_URL = (process.env.MAIN_SYSTEM_API_URL || '').replace(/\/+$/, '');
const MAIN_API_KEY = process.env.MAIN_SYSTEM_API_KEY || '';
const MAIN_EVENT_ID = process.env.MAIN_SYSTEM_EVENT_ID || '';

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
  if (!res.ok || data.status === false) {
    throw new MainSystemError(data.message || data.error || `Main system request failed (${res.status})`, res.status || 502);
  }
  return data;
}

/**
 * Claim a QR for an invitee's phone number from the main system.
 * The main system find-or-creates the holder and returns its QR image + ID.
 * Response mapping: { qr_code: base64 PNG data URL, qr_id: "ISK-…" }
 */
export async function claimQr({ phone, name, email }) {
  if (!MAIN_EVENT_ID) {
    throw new MainSystemError(
      'MAIN_SYSTEM_EVENT_ID is not set — set it to the event code (eventCode) of the event in the main system to issue against.',
      503
    );
  }
  const data = await request('/api/integration/generate-volunteer-qr', {
    event_id: MAIN_EVENT_ID,
    user_phone_number: String(phone || '').trim(),
    user_email: (email || '').trim() || undefined,
  });
  return {
    qrId: data.qr_id || '',
    qrImage: data.qr_code || '',
  };
}
