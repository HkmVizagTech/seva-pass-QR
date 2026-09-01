import QRCode from 'qrcode';

// ── ISKCON brand palette ──────────────────────────────────────────────────────
const ISKCON_SAFFRON = '#FF6B00';
const ISKCON_DARK    = '#1A1A1A';
const ISKCON_BG      = '#FFFFFF';

/**
 * Generate a QR code as a PNG Buffer with ISKCON saffron colours.
 */
export async function generateStyledQrPng(data, opts = {}) {
  return QRCode.toBuffer(data, {
    type: 'png',
    width: opts.width || 600,
    margin: opts.margin ?? 2,
    color: { dark: ISKCON_SAFFRON, light: ISKCON_BG },
  });
}

/**
 * Generate a QR code as an SVG string with ISKCON saffron colours.
 */
export async function generateStyledQrSvg(data, opts = {}) {
  return QRCode.toString(data, {
    type: 'svg',
    width: opts.width || 240,
    margin: opts.margin ?? 1,
    color: { dark: ISKCON_SAFFRON, light: ISKCON_BG },
  });
}
