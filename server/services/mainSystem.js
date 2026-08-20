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

/** The main system's origin (no trailing slash), for building image URLs. */
export function getMainApiUrl() {
  return MAIN_API_URL;
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
 * Fetch events from the main system.
 * @param {{ status?: string }} opts - optional ?status=upcoming|active|completed filter.
 * Returns an array of event objects, or empty array.
 */
export async function fetchEvents(opts = {}) {
  if (!MAIN_API_URL) return [];
  try {
    const q = opts.status ? `?status=${encodeURIComponent(opts.status)}` : '';
    const data = await getRequest('/api/integration/events' + q);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Fetch categories (pass types) for an event from the main system.
 * Returns an array of { _id, name, catCode, entryPoints }, or empty array.
 */
export async function fetchCategories(eventCode, { all = false } = {}) {
  if (!eventCode || !MAIN_API_URL) return [];
  try {
    const q = all ? '?all=true' : '';
    const data = await getRequest(`/api/integration/events/${encodeURIComponent(eventCode)}/categories${q}`);
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
 * @param {string} category - Optional category name or code (pass type) to issue under.
 *                            The main system resolves it against the event's categories.
 */
export async function claimQr({ phone, name, email, eventCode, venue, category, preacher, preacherId }) {
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
  if (category) {
    body.category = category;
  }
  // Preacher attribution — so passes issued by a devotee show up under
  // that preacher's "My Passes" in the app and on the main system.
  if (preacher) {
    body.preacher = preacher;
  }
  if (preacherId) {
    body.preacherId = preacherId;
  }
  const data = await request('/api/integration/generate-volunteer-qr', body);
  return {
    qrId: data.qr_id || '',
    qrImage: data.qr_code || '',
  };
}

/**
 * Log a preacher in against the main system.
 * The returned main-system JWT is embedded in the app's own session token.
 */
export async function preacherLogin({ email, phone, password }) {
  if (!MAIN_API_URL) {
    throw new MainSystemError('Main system is not configured. Set MAIN_SYSTEM_API_URL in server/.env', 503);
  }
  const body = { password };
  if (email) body.email = String(email).trim().toLowerCase();
  else if (phone) body.phone = String(phone).trim();
  const data = await request('/api/preachers/login', body);
  return data; // { success, token, preacher: { id, name, shortCode, role } }
}

async function preacherAuthedRequest(path, token, { params = {}, method = 'GET' } = {}) {
  if (!MAIN_API_URL) {
    throw new MainSystemError('Main system is not configured. Set MAIN_SYSTEM_API_URL in server/.env', 503);
  }
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== null && v !== undefined) qs.set(k, v);
  });
  const q = qs.toString();
  let res;
  try {
    res = await fetch(`${MAIN_API_URL}${path}${q ? '?' + q : ''}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new MainSystemError(`Main system unreachable (${err.message})`, 502);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      throw new MainSystemError('Preacher session expired. Please log in again.', 401);
    }
    throw new MainSystemError(data.error || `Main system request failed (${res.status})`, res.status || 502);
  }
  return data;
}

/**
 * Fetch the logged-in preacher's holders from the main system.
 * Supports search, category (code/name), bahumana (yes|no), eventId, page, limit.
 */
export async function preacherGetHolders(token, params = {}) {
  return preacherAuthedRequest('/api/preachers/me/holders', token, { params });
}

/** Fetch the logged-in preacher's stats from the main system. */
export async function preacherGetStats(token) {
  return preacherAuthedRequest('/api/preachers/me/stats', token);
}

/**
 * Fetch scan history for a specific holder from the main system.
 * Returns the ScanLog records for that holder.
 */
export async function getHolderScanHistory(token, holderId) {
  return preacherAuthedRequest(`/api/scan/holder/${holderId}/history`, token);
}

/**
 * Create a preacher on the main system via the integration API.
 * The app admin calls this to sync preacher accounts.
 */
export async function createMainPreacher({ name, email, phone, password, shortCode }) {
  const data = await request('/api/integration/preachers', {
    name,
    email,
    phone,
    password,
    shortCode,
  });
  return data;
}

/**
 * List all preachers from the main system via the integration API.
 */
export async function listMainPreachers() {
  return getRequest('/api/integration/preachers');
}

/**
 * Delete (soft-delete) a preacher on the main system via the integration API.
 */
export async function deleteMainPreacher(id) {
  if (!MAIN_API_URL) {
    throw new MainSystemError('Main system is not configured. Set MAIN_SYSTEM_API_URL in server/.env', 503);
  }
  const headers = { 'Content-Type': 'application/json' };
  if (MAIN_API_KEY) headers['x-api-key'] = MAIN_API_KEY;
  let res;
  try {
    res = await fetch(`${MAIN_API_URL}/api/integration/preachers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    });
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
 * Fetch QR pass details (including redemptionHistory) from the main system.
 * Uses the integration API endpoint (requireApiKey) so no JWT is needed.
 * Returns a flat { status, redemptionHistory, qrId, ... } response.
 */
export async function getQrPassDetails(qrId) {
  if (!MAIN_API_URL || !qrId) return null;
  const headers = {};
  if (MAIN_API_KEY) headers['x-api-key'] = MAIN_API_KEY;
  try {
    const res = await fetch(`${MAIN_API_URL}/api/integration/qr/${encodeURIComponent(qrId)}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data || null;
  } catch {
    return null;
  }
}

/**
 * Batch-fetch live QR pass status for multiple passes.
 * Returns a Map of qrId → { status, redemptionHistory }.
 * Silently ignores errors — enrichment is best-effort.
 */
export async function batchGetQrPassDetails(qrIds) {
  if (!MAIN_API_URL || !qrIds.length) return new Map();
  const results = new Map();
  const CONCURRENCY = 10;
  for (let i = 0; i < qrIds.length; i += CONCURRENCY) {
    const batch = qrIds.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((id) => getQrPassDetails(id)));
    settled.forEach((r, j) => {
      if (r.status === 'fulfilled' && r.value) {
        results.set(batch[j], r.value);
      }
    });
  }
  return results;
}

/**
 * Update which categories the devotee app may use for an event.
 * @param {string} eventCode - The event code (e.g. "TEST")
 * @param {Array|null} categories - [{ catCode, name, limit }] or null to clear
 */
export async function updateDevoteeCategories(eventCode, categories) {
  if (!MAIN_API_URL) {
    throw new MainSystemError('Main system is not configured', 503);
  }
  const headers = { 'Content-Type': 'application/json' };
  if (MAIN_API_KEY) headers['x-api-key'] = MAIN_API_KEY;
  let res;
  try {
    res = await fetch(`${MAIN_API_URL}/api/integration/events/${encodeURIComponent(eventCode)}/devotee-categories`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ categories }),
    });
  } catch (err) {
    throw new MainSystemError(`Main system unreachable (${err.message})`, 502);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === false) {
    throw new MainSystemError(data.message || `Main system request failed (${res.status})`, res.status || 502);
  }
  return data;
}
