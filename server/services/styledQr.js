import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/**
 * Return the common qr-code-styling options for the ISKCON brand.
 *
 * @param {object}  [overrides]
 * @param {number}  [overrides.width]        Canvas width (default 600)
 * @param {number}  [overrides.height]       Canvas height (default 600)
 * @param {boolean} [overrides.includeLogo]  Whether to embed the center logo (default true)
 * @param {number}  [overrides.margin]       Quiet-zone margin in px (default 10)
 * @returns {object} Options object for QRCodeStyling constructor
 */
export function getStyledQrOptions(overrides = {}) {
  const { width = 600, height = 600, includeLogo = true, margin = 10 } = overrides;

  const options = {
    width,
    height,
    margin,
    data: '',                        // Caller fills this in.
    qrOptions: {
      errorCorrectionLevel: 'H',     // High — needed for logo overlay.
    },
    dotsOptions: {
      color: ISKCON_SAFFRON,
      type: 'rounded',
    },
    cornersSquareOptions: {
      color: ISKCON_DARK,
      type: 'extra-rounded',
    },
    cornersDotOptions: {
      color: ISKCON_SAFFRON,
      type: 'rounded',
    },
    backgroundOptions: {
      color: ISKCON_BG,
    },
  };

  if (includeLogo && logoDataUrl) {
    options.image = logoDataUrl;
    options.imageOptions = {
      crossOrigin: 'anonymous',
      margin: 12,
      hideBackgroundDots: true,
      imageSize: 0.30,
    };
  }

  return options;
}

/**
 * Generate a styled QR code as a PNG Buffer (server-side only).
 *
 * @param {string} data  The string to encode.
 * @param {object} [opts] Optional overrides passed to getStyledQrOptions.
 * @returns {Promise<Buffer>} PNG buffer.
 */
export async function generateStyledQrPng(data, opts = {}) {
  // Dynamic import — the package uses CommonJS + canvas.
  const { QRCodeStyling } = await import('qr-code-styling/lib/qr-code-styling.common.js');
  const nodeCanvas = await import('canvas');
  const { JSDOM } = await import('jsdom');

  const options = getStyledQrOptions(opts);
  options.data = data;
  options.nodeCanvas = nodeCanvas.default || nodeCanvas;
  options.jsdom = JSDOM;

  const qr = new QRCodeStyling(options);
  return qr.getRawData('png');
}

/**
 * Generate a styled QR code as an SVG string (server-side only).
 *
 * @param {string} data  The string to encode.
 * @param {object} [opts] Optional overrides passed to getStyledQrOptions.
 * @returns {Promise<string>} SVG markup.
 */
export async function generateStyledQrSvg(data, opts = {}) {
  const { QRCodeStyling } = await import('qr-code-styling/lib/qr-code-styling.common.js');
  const { JSDOM } = await import('jsdom');

  const options = getStyledQrOptions({ ...opts, includeLogo: false });
  options.data = data;
  options.type = 'svg';
  options.jsdom = JSDOM;

  const qr = new QRCodeStyling(options);
  const buf = await qr.getRawData('svg');
  return buf.toString('utf-8');
}
