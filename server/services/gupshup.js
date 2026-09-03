import { generateStyledQrPng } from './styledQr.js';

const GUPSHUP_ENABLED = process.env.GUPSHUP_ENABLED === 'true';
const GUPSHUP_API_KEY = process.env.GUPSHUP_API_KEY || '';
const GUPSHUP_SOURCE_NUMBER = process.env.GUPSHUP_SOURCE_NUMBER || '';
const GUPSHUP_APP_NAME = process.env.GUPSHUP_APP_NAME || '';
const BACKEND_PUBLIC_URL = (process.env.BACKEND_PUBLIC_URL || '').replace(/\/+$/, '');
const GUPSHUP_TEMPLATE_ID = process.env.GUPSHUP_TEMPLATE_ID || '';
const HELP_CONTACT = process.env.HELP_CONTACT || '8977761187';

const API_URL = 'https://api.gupshup.io/wa/api/v1/template/msg';

export function isGupshupConfigured() {
  return GUPSHUP_ENABLED && Boolean(GUPSHUP_API_KEY) && Boolean(GUPSHUP_SOURCE_NUMBER) && Boolean(GUPSHUP_APP_NAME) && Boolean(BACKEND_PUBLIC_URL);
}

export function formatPhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[\+\s\-\(\)]/g, '');
  if (cleaned.length === 10) cleaned = '91' + cleaned;
  return cleaned.startsWith('91') ? cleaned : `91${cleaned}`;
}

/**
 * Send a QR pass to a recipient via Gupshup WhatsApp.
 *
 * Uses the public QR image URL ({BACKEND_PUBLIC_URL}/api/public/passes/:token/qr.png)
 * as the image header so the recipient receives the actual scannable QR code.
 *
 * @param {object} pass - the Pass document (or lean) with token, donor_name, etc.
 * @param {object} event - Event doc (or lean) with name, location, dates.
 * @returns {{success: boolean, messageId?: string, provider: string}}
 */
export async function sendPassQrWhatsApp(pass, event = {}) {
  if (!isGupshupConfigured()) {
    throw new Error(
      'Gupshup is not configured. Set GUPSHUP_ENABLED, GUPSHUP_API_KEY, GUPSHUP_SOURCE_NUMBER, GUPSHUP_APP_NAME and BACKEND_PUBLIC_URL in server/.env.'
    );
  }
  if (!GUPSHUP_TEMPLATE_ID) {
    throw new Error('GUPSHUP_TEMPLATE_ID is not set in server/.env');
  }

  const phone = formatPhone(pass.phone);
  if (!phone) {
    throw new Error('A recipient phone number is required');
  }

  const qrImageUrl = `${BACKEND_PUBLIC_URL}/api/public/passes/${pass.token}/qr.png`;
  const eventName = event?.name || '';
  const eventLocation = event?.location || '';
  const eventDate = event?.date ? formatDate(event.date) : '';
  const venue = eventLocation || 'ISKCON Temple, Visakhapatnam';
  const help = HELP_CONTACT;

  const templateParams = [
    pass.donor_name,      // {{1}} Name
    eventName,            // {{2}} Event
    eventDate,            // {{3}} Date
    venue,                // {{4}} Venue
    help,                 // {{5}} Help contact
  ];

  const body = new URLSearchParams();
  body.append('channel', 'whatsapp');
  body.append('source', GUPSHUP_SOURCE_NUMBER);
  body.append('src.name', GUPSHUP_APP_NAME);
  body.append('destination', phone);
  body.append('template', JSON.stringify({ id: GUPSHUP_TEMPLATE_ID, params: templateParams }));
  body.append('message', JSON.stringify({ type: 'image', image: { link: qrImageUrl } }));

  console.log('[Gupshup] Sending QR:', JSON.stringify({
    phone, templateId: GUPSHUP_TEMPLATE_ID, params: templateParams, imageUrl: qrImageUrl,
  }));

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      apikey: GUPSHUP_API_KEY,
    },
    body: body.toString(),
  });

  const raw = await response.text();
  let data = {};
  try { data = JSON.parse(raw); } catch { data = { raw }; }

  const msgId = data.messageId || data.id || null;
  const status = data.status || null;

  if (!response.ok) {
    console.error('[Gupshup] Non-2xx response:', response.status, raw.slice(0, 300));
    throw new Error(`Gupshup send failed (HTTP ${response.status}): ${(data.message || raw).slice(0, 200)}`);
  }

  console.log('[Gupshup] Response:', JSON.stringify({ status, messageId: msgId, phone, raw: raw.slice(0, 200) }));

  if (status !== 'submitted' && status !== 'success' && status !== 'ACCEPTED') {
    console.warn('[Gupshup] Non-success status:', status, raw.slice(0, 300));
  }

  return { success: true, messageId: msgId, provider: 'gupshup', status };
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}
