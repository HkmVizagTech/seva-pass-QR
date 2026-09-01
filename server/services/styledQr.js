import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── ISKCON brand palette ──────────────────────────────────────────────────────
const ISKCON_SAFFRON = '#FF6B00';
const ISKCON_DARK    = '#1A1A1A';
const ISKCON_BG      = '#FFFFFF';

// Load the logo once at startup (base64 data URL for qr-code-styling).
let logoDataUrl = null;
try {
  const logoBuf = readFileSync(join(__dirname, '..', 'public', 'iskcon-logo.png'));
  logoDataUrl = `data:image/png;base64,${logoBuf.toString('base64')}`;
} catch {
  // Logo not found — QR will render without a center image.
}

// Try to load qr-code-styling + native deps.  If canvas/jsdom aren't available
// (e.g. on Railway without native build tools), we gracefully degrade to plain
// qrcode with colour options.
let QRCodeStyling = null;
let nodeCanvas = null;
let JSDOM = null;
let styledAvailable = false;

try {
  const mod = await import('qr-code-styling/lib/qr-code-styling.common.js');
  QRCodeStyling = mod.QRCodeStyling;
  const canvasMod = await import('canvas');
  nodeCanvas = canvasMod.default || canvasMod;
  const jsdomMod = await import('jsdom');
  JSDOM = jsdomMod.JSDOM;
  styledAvailable = true;
} catch {
  console.warn('[styledQr] qr-code-styling/canvas/jsdom unavailable — using plain qrcode with colors');
}

/**
 * Return the common qr-code-styling options for the ISKCON brand.
 */
function getStyledQrOptions(overrides = {}) {
  const { width = 600, height = 600, includeLogo = true, margin = 10 } = overrides;

  const options = {
    width,
    height,
    margin,
    data: '',
    qrOptions: { errorCorrectionLevel: 'H' },
    dotsOptions: { color: ISKCON_SAFFRON, type: 'rounded' },
    cornersSquareOptions: { color: ISKCON_DARK, type: 'extra-rounded' },
    cornersDotOptions: { color: ISKCON_SAFFRON, type: 'rounded' },
    backgroundOptions: { color: ISKCON_BG },
  };

  if (includeLogo && logoDataUrl) {
    options.image = logoDataUrl;
    options.imageOptions = {
      crossOrigin: 'anonymous',
      margin: 12,
      hideBackgroundDots: true,
      imageSize: 0.30,
      saveAsBlob: true,
    };
  }

  return options;
}

/**
 * Generate a styled QR code as a PNG Buffer.
 * Falls back to plain qrcode with ISKCON colours if qr-code-styling is unavailable.
 */
export async function generateStyledQrPng(data, opts = {}) {
  if (styledAvailable) {
    const options = getStyledQrOptions(opts);
    options.data = data;
    options.nodeCanvas = nodeCanvas;
    options.jsdom = JSDOM;

    const qr = new QRCodeStyling(options);
    return qr.getRawData('png');
  }

  // Fallback: plain qrcode with ISKCON saffron colours
  return QRCode.toBuffer(data, {
    type: 'png',
    width: opts.width || 600,
    margin: opts.margin ?? 2,
    color: { dark: ISKCON_SAFFRON, light: ISKCON_BG },
  });
}

/**
 * Generate a styled QR code as an SVG string.
 * Falls back to plain qrcode with ISKCON colours if qr-code-styling is unavailable.
 */
export async function generateStyledQrSvg(data, opts = {}) {
  if (styledAvailable) {
    const options = getStyledQrOptions(opts);
    options.data = data;
    options.type = 'svg';
    options.jsdom = JSDOM;

    const qr = new QRCodeStyling(options);
    const buf = await qr.getRawData('svg');
    return buf.toString('utf-8');
  }

  // Fallback: plain qrcode SVG with ISKCON saffron colours
  return QRCode.toString(data, {
    type: 'svg',
    width: opts.width || 240,
    margin: opts.margin ?? 1,
    color: { dark: ISKCON_SAFFRON, light: ISKCON_BG },
  });
}
