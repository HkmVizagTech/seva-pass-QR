import QRCode from 'qrcode';
import { generateStyledQrPng } from './styledQr.js';

const WHATSAPP_TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const BASE_URL = process.env.WHATSAPP_BASE_URL || 'https://graph.facebook.com/v21.0';

export function isWhatsAppConfigured() {
  return Boolean(WHATSAPP_TOKEN && PHONE_NUMBER_ID);
}

export async function sendPassQrWhatsApp(pass, { phone, caption } = {}) {
  if (!isWhatsAppConfigured()) {
    throw new Error(
      'WhatsApp is not configured. Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID in server/.env.'
    );
  }
  const phoneNumber = (phone || pass.phone || '').replace(/\D/g, '');
  if (!phoneNumber) {
    throw new Error('A recipient phone number is required');
  }

  let png;
  if (pass.main_qr_image) {
    // Use the main system's gate-scannable QR image directly.
    const base64 = String(pass.main_qr_image).replace(/^data:image\/\w+;base64,/, '');
    png = Buffer.from(base64, 'base64');
  } else {
    png = await generateStyledQrPng(pass.qr_content);
  }

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append(
    'file',
    new Blob([png], { type: 'image/png' }),
    `pass-${pass.token.slice(0, 8)}.png`
  );

  const uploadRes = await fetch(`${BASE_URL}/${PHONE_NUMBER_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    body: form,
  });
  if (!uploadRes.ok) throw new Error(`WhatsApp media upload failed (${uploadRes.status})`);

  const { id: mediaId } = await uploadRes.json();

  const message = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phoneNumber,
    type: 'image',
    image: {
      id: mediaId,
      caption:
        caption ||
        `Hare Krishna 🙏 ${pass.donor_name || ''}!\nYour QR pass has been issued${pass.event_name ? ` for ${pass.event_name}` : ''}.\nPlease show this QR code at the venue for entry.`,
    },
  };

  const send = await fetch(`${BASE_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!send.ok) throw new Error(`WhatsApp message send failed (${send.status})`);

  return send.json();
}
