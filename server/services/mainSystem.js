/**
 * Main-system integration client.
 *
 * This app is the devotee-facing layer for Hare Krishna Visakhapatnam. When the
 * main ISKCON Seva Pass system (repo: HkmVizagTech/iskcon-seva-pass-backend) is
 * configured, issuing a pass claims a QR for the invitee's phone from it, and
 * the invitee shows that QR at the gate where the main system's own scanner
 * (HkmVizagTech/iskcon-scanner) validates it.
 *
 * Contract (main system):
 *   POST /api/integration/generate-volunteer-qr
 *     header:  x-api-key: <INTEGRATION_API_KEY>
 *     body:    { event_id, user_phone_number, user_email?, venue? }
 *     → 200:   { status: true, message, qr_code: <base64 PNG data URL>, qr_id }
 *     → error: { status: false, message } (4xx/xx)
 *   event_id is matched against the main system's Event.eventCode (or _id).
 *   If venue is provided, entry points for the pass are filtered by location.building.
 *
 *   GET /api/integration/events
 *     → 200:   [{ _id, name, eventCode, dateStart, dateEnd, venue[], ... }]
 *     Returns all events from the main system for syncing.
 *
 *   GET /api/integration/events/:eventCode/venues
 *     → 200:   [{ index, name, address, coordinates }]
 *     Returns the event's venue array for the IssuePass form.
 *
 *   GET /api/integration/events/:eventCode/entry-points?venue=<name>
 *     → 200:   [{ _id, name, stationLabel, type, ... }]
 *     Entry points optionally filtered by venue (location.building match).
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

async function getRequest(path) {
  if (!MAIN_API_URL) return [];
  const headers = {};
  if (MAIN_API_KEY) headers['x-api-key'] = MAIN_API_KEY;

  let res;
  try {
    res = await fetch(`${MAIN_API_URL}${path}`, { method: 'GET', headers });
  } catch {
    return [];
  }

  if (!res.ok) return [];
  return res.json().catch(() => []);
}

/**
 * Fetch all events from the main system.
 * Returns an array of event objects, or empty array.
 */
export async function fetchEvents() {
  if (!MAIN_API_URL) return [];
  try {
    const data = await getRequest('/api/integration/events');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Fetch venues for an event from the main system.
 * Returns an array of { index, name, address, coordinates }, or empty array.
 */
export async function fetchVenues(eventCode) {
  if (!eventCode || !MAIN_API_URL) return [];
  try {
    const data = await getRequest(`/api/integration/events/${encodeURIComponent(eventCode)}/venues`);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Claim a QR for an invitee's phone number from the main system.
 * The main system find-or-creates the holder and returns its QR image + ID.
 *
 * @param {string} eventCode - The event code to issue against.
 *                             Falls back to MAIN_SYSTEM_EVENT_ID env var if not provided.
 * @param {string} venue - Optional venue name. The main system filters entry points
 *                         by location.building matching this value.
 */
export async function claimQr({ phone, name, email, eventCode, venue }) {
  const resolvedEventId = eventCode || MAIN_EVENT_ID;
  if (!resolvedEventId) {
    throw new MainSystemError(
      'No event code available — set MAIN_SYSTEM_EVENT_ID in server/.env or select an event with an event code.',
      503
    );
  }
  const body = {
    event_id: resolvedEventId,
    user_phone_number: String(phone || '').trim(),
    user_email: (email || '').trim() || undefined,
  };
  if (venue) {
    body.venue = venue;
  }
  const data = await request('/api/integration/generate-volunteer-qr', body);
  return {
    qrId: data.qr_id || '',
    qrImage: data.qr_code || '',
  };
}
