// Generates the PWA icons (client/public/icons/icon-{192,512}.png).
// Pure Node (zlib) — no dependencies. Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

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

const BG = [17, 22, 58];       // krishna midnight blue
const GOLD = [251, 191, 36];   // saffron gold
const CREAM = [255, 251, 240]; // cream highlight

// Thick stroked arc: returns the distance from point (px, py) to the nearest
// point on an arc of given center, radius, angle range, and stroke thickness.
function arcDist(px, py, cx, cy, r, t0, t1, thick) {
  const dx = px - cx;
  const dy = py - cy;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const radDist = Math.abs(dist - r);
  // Check if angle is within the arc range (handles wrap-around).
  let inArc = false;
  if (t1 >= t0) {
    inArc = angle >= t0 && angle <= t1;
  } else {
    inArc = angle >= t0 || angle <= t1;
  }
  if (inArc) return radDist;
  // Not on the arc — return distance to nearest endpoint.
  const d0 = Math.hypot(px - (cx + r * Math.cos(t0)), py - (cy + r * Math.sin(t0)));
  const d1 = Math.hypot(px - (cx + r * Math.cos(t1)), py - (cy + r * Math.sin(t1)));
  return Math.min(d0, d1);
}

// Thick stroked line segment: distance from (px,py) to line from (x0,y0)-(x1,y1).
function lineDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

// Distance from (px,py) to a filled circle.
function circleDist(px, py, cx, cy, r) {
  return Math.max(0, Math.hypot(px - cx, py - cy) - r);
}

// ─── Om symbol shape definition ──────────────────────────────────────────────
// Draws a simplified Om (ॐ) using thick arcs and circles on a dark blue
// background with golden strokes. All coordinates are in [-0.5, 0.5] space.
//
// The Om consists of:
//   1. Main belly — large C-curve opening right (the characteristic rounded body)
//   2. Inner curve — smaller arc nested inside the belly
//   3. Tail — sweeping arc from the upper-left outward
//   4. Horizontal bar — short line crossing the vertical stroke
//   5. Vertical stroke — short line above the bar
//   6. Chandra — crescent (arc) above the stroke
//   7. Bindu — dot above the crescent
//
// Kept inside the centre 72% so it works as a maskable icon.
function shade(px, py) {
  const thick = 0.055;   // stroke thickness
  const r1 = 0.25;       // main belly radius
  const r2 = 0.12;       // inner curve radius

  let d = Infinity;

  // 1. Main belly — large C-curve opening to the right (from ~200° to ~350°).
  d = Math.min(d, arcDist(px, py, -0.02, 0.06, r1, 3.50, 5.90, thick));

  // 2. Inner curve — smaller arc nested inside the belly, opening right.
  d = Math.min(d, arcDist(px, py, -0.04, 0.06, r2, 3.60, 5.60, thick * 0.85));

  // 3. Tail — sweeping arc from upper-left, curving up and over to the right.
  //    Starts from the top of the belly, sweeps over the top.
  d = Math.min(d, arcDist(px, py, 0.10, -0.06, 0.18, 2.60, 4.40, thick));

  // 4. Horizontal bar — short line crossing above the belly.
  d = Math.min(d, lineDist(px, py, -0.06, -0.16, 0.14, -0.16));

  // 5. Vertical stroke — short line above the bar.
  d = Math.min(d, lineDist(px, py, 0.04, -0.16, 0.04, -0.28));

  // 6. Chandra — crescent (arc) above the vertical stroke.
  d = Math.min(d, arcDist(px, py, 0.04, -0.32, 0.08, 0.2, 2.94, thick * 0.8));

  // 7. Bindu — dot above the crescent.
  d = Math.min(d, circleDist(px, py, 0.04, -0.42, 0.032));

  // Antialiased edge: map distance to alpha within one pixel of the stroke edge.
  const alpha = Math.max(0, Math.min(1, 0.5 - d * 12));
  if (alpha <= 0) return BG;

  // Blend gold over background.
  return [
    Math.round(BG[0] + (GOLD[0] - BG[0]) * alpha),
    Math.round(BG[1] + (GOLD[1] - BG[1]) * alpha),
    Math.round(BG[2] + (GOLD[2] - BG[2]) * alpha),
  ];
}

function makePng(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const scale = 2; // supersampling for smoother edges
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const px = (x + (sx + 0.5) / scale) / size - 0.5;
          const py = (y + (sy + 0.5) / scale) / size - 0.5;
          const [cr, cg, cb] = shade(px, py);
          r += cr;
          g += cg;
          b += cb;
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

for (const size of [192, 512]) {
  writeFileSync(join(outDir, `icon-${size}.png`), makePng(size));
  console.log(`Generated icon-${size}.png`);
}
