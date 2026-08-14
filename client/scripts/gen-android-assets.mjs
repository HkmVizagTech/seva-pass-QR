// Generates the native Android app assets with the Krishna seal theme:
//   - Splash screens for every drawable density bucket (portrait + landscape)
//   - Launcher icons (legacy + adaptive foreground) for every mipmap bucket
// Pure Node (zlib) — no dependencies. Run: node scripts/gen-android-assets.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resDir = join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Krishna palette
const KRISHNA = [23, 29, 77];      // #171D4D
const KRISHNA_DARK = [17, 22, 58]; // #11163A
const GOLD = [251, 191, 36];       // #FBBF24

// Square seal: gold ring around a gold dot on Krishna blue.
function sealShade(cx, cy) {
  const r = Math.hypot(cx, cy);
  if (r <= 0.36 && r >= 0.3) return GOLD;
  if (r <= 0.16) return GOLD;
  return KRISHNA;
}

// Adaptive foreground: same seal, transparent background, scaled into the
// Android safe zone (inner 66% of the 108dp canvas).
function foregroundShade(cx, cy) {
  const r = Math.hypot(cx, cy);
  if (r <= 0.3 && r >= 0.24) return GOLD;
  if (r <= 0.12) return GOLD;
  return null; // transparent
}

function makePng(size, shadeFn, opaqueBg) {
  const scale = 2; // supersampling
  const raw = Buffer.alloc(size * (1 + size * 4));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let hit = 0;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = (x + (sx + 0.5) / scale) / size - 0.5;
          const py = (y + (sy + 0.5) / scale) / size - 0.5;
          const col = shadeFn(px, py);
          if (col) {
            r += col[0];
            g += col[1];
            b += col[2];
            a += 255;
            hit++;
          }
        }
      }
      const n = scale * scale;
      raw[o++] = hit ? Math.round(r / hit) : 0;
      raw[o++] = hit ? Math.round(g / hit) : 0;
      raw[o++] = hit ? Math.round(b / hit) : 0;
      raw[o++] = hit ? Math.round((a / n)) : (opaqueBg ? 255 : 0);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Splash: Krishna dark-blue field with a centred gold seal.
function makeSplash(w, h) {
  const scale = 2;
  const raw = Buffer.alloc(h * (1 + w * 4));
  const cx = w / 2;
  const cy = h / 2;
  const sealR = Math.min(w, h) * 0.32; // outer ring radius in pixels
  const dR = sealR * (1 - 0.3 / 0.36); // ring thickness scaled from seal
  const dotR = sealR * (0.16 / 0.36);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = x + (sx + 0.5) / scale;
          const py = y + (sy + 0.5) / scale;
          const d = Math.hypot(px - cx, py - cy);
          if (d <= sealR && d >= sealR - dR) {
            r += GOLD[0]; g += GOLD[1]; b += GOLD[2];
          } else if (d <= dotR) {
            r += GOLD[0]; g += GOLD[1]; b += GOLD[2];
          } else {
            r += KRISHNA_DARK[0]; g += KRISHNA_DARK[1]; b += KRISHNA_DARK[2];
          }
        }
      }
      const n = scale * scale;
      raw[o++] = Math.round(r / n);
      raw[o++] = Math.round(g / n);
      raw[o++] = Math.round(b / n);
      raw[o++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Splash screens ---------------------------------------------------------
const SPLASH_SIZES = {
  'drawable': [480, 320],
  'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-hdpi': [800, 480],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
};

for (const [dir, [w, h]] of Object.entries(SPLASH_SIZES)) {
  const target = join(resDir, dir);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'splash.png'), makeSplash(w, h));
  console.log(`splash ${dir} ${w}x${h}`);
}

// --- Launcher icons ---------------------------------------------------------
const MIPMAP_ICON = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

for (const [dir, size] of Object.entries(MIPMAP_ICON)) {
  const target = join(resDir, dir);
  mkdirSync(target, { recursive: true });
  const legacy = makePng(size, sealShade, true);
  writeFileSync(join(target, 'ic_launcher.png'), legacy);
  writeFileSync(join(target, 'ic_launcher_round.png'), legacy);
  console.log(`launcher ${dir} ${size}x${size}`);
}

// Adaptive foreground (108dp canvas, content in safe zone)
const MIPMAP_FG = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

for (const [dir, size] of Object.entries(MIPMAP_FG)) {
  const target = join(resDir, dir);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'ic_launcher_foreground.png'), makePng(size, foregroundShade, false));
  console.log(`foreground ${dir} ${size}x${size}`);
}

console.log('Done.');
