// ─── Vaikuntham (Community App) integration ─────────────────────────────────
// Pushes every QR issued to harekrishnavizag.co.in so it shows up in the
// Vaikuntham community app too. Category determines which push flow is used:
//   - register-volunteer  (generic holders)
//   - seva-sponsor        (Sponsor / Donor / Invitee — SP/DN/INV)
//   - store-qr-code       (Volunteer — VL)
//
// IMPORTANT: their server runs a ModSecurity WAF that returns 406 for any
// request without a realistic browser-like User-Agent header. Every request
// MUST include COMMON_HEADERS or it is silently blocked at the WAF.
//
// Access is otherwise restricted purely by IP whitelist — no API key needed.

const THIRD_PARTY_API_URL = (process.env.THIRD_PARTY_API_URL || 'https://harekrishnavizag.co.in').replace(/\/+$/, '');
const THIRD_PARTY_SYNC_ENABLED = process.env.THIRD_PARTY_SYNC_ENABLED === 'true';

const COMMON_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; ISKCON-SevaPass/1.0; +https://harekrishnavizag.org)',
};

export function isCommunityAppConfigured() {
  return THIRD_PARTY_SYNC_ENABLED && Boolean(THIRD_PARTY_API_URL);
}

const SPONSOR_CODES = new Set(['SP', 'DN', 'INV']);
const VOLUNTEER_CODES = new Set(['VL']);

// The app stores category NAMES (e.g. "Sponsor", "Volunteer", "Invitee") as
// pass.pass_type, while the main system also exposes a catCode (SP/DN/INV/VL).
// Routing must accept BOTH forms — old passes have only the name, new passes
// also carry category_code.
function isVolunteerPass(passType, catCode) {
  if (VOLUNTEER_CODES.has((catCode || '').trim().toUpperCase())) return true;
  return /volunteer/i.test(passType || '');
}

function isSponsorPass(passType, catCode) {
  if (SPONSOR_CODES.has((catCode || '').trim().toUpperCase())) return true;
  return /sponsor|donor|invitee/i.test(passType || '');
}

function skipResult(reason) {
  return { attempted: false, skipped: true, success: false, reason };
}

function checkPrereqs(event) {
  if (!isCommunityAppConfigured()) return skipResult('Community app sync disabled (THIRD_PARTY_SYNC_ENABLED not set)');
  if (!event?.third_party_event_id) return skipResult('Event has no third_party_event_id mapped');
  return null;
}

function bare10(phone) {
  return String(phone || '').replace(/^91/, '').slice(-10);
}

function toDateTimeStr(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d
    .toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' })
    .replace('T', ' ')
    .slice(0, 19);
}

/**
 * Push a pass to the Vaikuntham community app.
 *
 * @param {object} params
 * @param {object} params.pass - Pass doc
 * @param {object} params.event - Event doc (with thirdPartyEventId)
 * @param {object} params.issuedBy - the issuing user (preacher), may have phone
 * @returns {{attempted:boolean, skipped:boolean, success:boolean, reason?:string, endpoint?:string}}
 */
export async function pushPassToCommunityApp({ pass, event, issuedBy }) {
  const skip = checkPrereqs(event);
  if (skip) return { ...skip, endpoint: 'skipped' };
  const eventId = event.third_party_event_id;
  const passType = (pass.pass_type || '').trim();
  const catCode = (pass.category_code || '').trim();

  try {
    if (isVolunteerPass(passType, catCode)) {
      return await pushStoreQr({ pass, event, eventId });
    }
    if (isSponsorPass(passType, catCode)) {
      return await pushSponsor({ pass, event, eventId, issuedBy });
    }
    return await pushGeneral({ pass, event, eventId });
  } catch (error) {
    return logError('community-app-push', pass.phone, error);
  }
}

async function pushGeneral({ pass, event, eventId }) {
  const form = new FormData();
  form.append('event_id', eventId);
  form.append('event_start_date', toDateTimeStr(event.date_start));
  form.append('event_end_date', toDateTimeStr(event.date_end));
  form.append('user_phone_number', bare10(pass.phone));
  if (pass.email) form.append('user_email', pass.email);
  form.append('qr_code', String(pass.main_qr_image || '').replace(/^data:image\/\w+;base64,/, ''));

  const res = await fetch(`${THIRD_PARTY_API_URL}/api/v1/user/festivals/register-volunteer`, {
    method: 'POST',
    headers: { ...COMMON_HEADERS },
    body: form,
  });
  return parseResponse('register-volunteer', res);
}

async function pushSponsor({ pass, event, eventId, issuedBy }) {
  const passTypeMap = { SP: 'sponsor', DN: 'donor', INV: 'invitee' };
  const code = (pass.category_code || '').trim().toUpperCase();
  const name = (pass.pass_type || '').toLowerCase();
  // Resolve the seva type from the code first, then from the name.
  let passType = passTypeMap[code];
  if (!passType) {
    if (name.includes('sponsor')) passType = 'sponsor';
    else if (name.includes('invitee')) passType = 'invitee';
    else if (name.includes('donor')) passType = 'donor';
    else passType = 'donor';
  }
  const sevaTypeMap = { sponsor: 'abhisekam', donor: 'darshan', invitee: 'darshan' };

  const preacherPhone = issuedBy?.phone ? bare10(issuedBy.phone) : bare10(pass.phone);

  const body = {
    event_id: eventId,
    devotee_mobile_number: preacherPhone,
    donor_name: pass.donor_name || '',
    donor_mobile_number: bare10(pass.phone),
    date_time: toDateTimeStr(new Date()),
    qrcode: pass.qr_token || pass.qr_content || '',
    seva_type: sevaTypeMap[passType] || 'darshan',
    holder: pass.pass_type || '',
    instruction: event?.name || '',
  };

  const res = await fetch(`${THIRD_PARTY_API_URL}/api/v1/user/festivals/seva-sponsor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...COMMON_HEADERS },
    body: JSON.stringify(body),
  });
  return parseResponse('seva-sponsor', res);
}

async function pushStoreQr({ pass, event, eventId }) {
  const body = [{
    volunteer_mobile_number: bare10(pass.phone),
    event_id: eventId,
    qrcode: pass.qr_token || pass.qr_content || '',
  }];

  const res = await fetch(`${THIRD_PARTY_API_URL}/api/v1/user/festivals/store-qr-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...COMMON_HEADERS },
    body: JSON.stringify(body),
  });
  return parseResponse('store-qr-code', res);
}

async function parseResponse(endpoint, res) {
  const raw = await res.text();
  let data = {};
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  const ok = data.success === true && res.ok;
  console.log(`[CommunityApp] ${endpoint} ${ok ? 'OK' : 'non-success'} (HTTP ${res.status}):`, raw.slice(0, 200));
  if (!res.ok || !ok) {
    return {
      attempted: true, success: false, skipped: false, endpoint,
      reason: `HTTP ${res.status}: ${raw.slice(0, 300)}`,
    };
  }
  return { attempted: true, success: true, skipped: false, endpoint, responseBody: raw.slice(0, 500) };
}

function logError(endpoint, phone, error) {
  const detail = error.response?.data ? JSON.stringify(error.response.data).slice(0, 300) : (error.message || 'unknown');
  console.error(`[CommunityApp] ${endpoint} FAILED for ${phone}:`, detail);
  return { attempted: true, success: false, skipped: false, endpoint, reason: detail };
}
