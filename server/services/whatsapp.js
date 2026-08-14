import QRCode from 'qrcode';

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

  const png = await QRCode.toBuffer(pass.qr_content, { type: 'png', margin: 1, width: 600 });

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append(
    'file',
    new Blob([png], { type: 'image/png' }),
    `pass-${pass.token.slice(0, 8)}.png`
  );

  const upload = await fetch(`${BASE_URL}/${PHONE_NUMBER_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    body: form,
  });
  if (!upload.ok) throw new Error(`WhatsApp media upload failed (${upload.status})`);

  const { id: mediaId } = await upload.json();

  const message = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phoneNumber,
    type: 'image',
    image: {
      id: mediaId,
      caption:
        caption ||
        `Hare Krishna! Your entry pass (${pass.pass_type}) is attached. ${
          pass.event_name ? `Event: ${pass.event_name}. ` : ''
        }Please show this QR at the entrance.`,
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
