// Dibuja los íconos de la app (PNG) sin librerías: node tools/make-icons.mjs
// Diseño: fondo terracota, una hoja de cuaderno crema con renglones y una nota musical.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../icons/', import.meta.url));
mkdirSync(out, { recursive: true });

// ---- PNG mínimo ----
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Formas (coordenadas de 0 a 1) ----
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const TOP = hex('#c96a40'), BOTTOM = hex('#a54c2c'), PAGE = hex('#fbf3e6'), RULE = hex('#e3cfb4'), INK = hex('#b2552f');

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function inEllipse(x, y, cx, cy, rx, ry, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const dx = x - cx, dy = y - cy;
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
}
function nearSegment(x, y, ax, ay, bx, by, w) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  return (x - ax - t * vx) ** 2 + (y - ay - t * vy) ** 2 <= w * w;
}

/** Color de un punto. scale < 1 achica el dibujo (íconos "maskable" con margen). */
function colorAt(px, py, scale) {
  const bg = TOP.map((t, i) => t + (BOTTOM[i] - t) * py);
  const x = 0.5 + (px - 0.5) / scale;
  const y = 0.5 + (py - 0.5) / scale;
  if (!inRoundRect(x, y, 0.2, 0.14, 0.8, 0.86, 0.07)) return bg;
  // nota musical
  if (inEllipse(x, y, 0.43, 0.52, 0.085, 0.062, -0.35)) return INK;
  if (x >= 0.493 && x <= 0.522 && y >= 0.25 && y <= 0.52) return INK;
  if (nearSegment(x, y, 0.508, 0.255, 0.6, 0.31, 0.022) || nearSegment(x, y, 0.6, 0.31, 0.615, 0.4, 0.022)) return INK;
  // renglones
  for (const ry of [0.66, 0.73, 0.8]) if (Math.abs(y - ry) < 0.009 && x > 0.28 && x < 0.72) return RULE;
  return PAGE;
}

function render(size, scale = 1) {
  const buf = Buffer.alloc(size * size * 4);
  const S = 4; // 4×4 muestras por pixel para bordes suaves
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const c = colorAt((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size, scale);
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
      }
      const o = (y * size + x) * 4;
      buf[o] = Math.round(acc[0] / (S * S));
      buf[o + 1] = Math.round(acc[1] / (S * S));
      buf[o + 2] = Math.round(acc[2] / (S * S));
      buf[o + 3] = 255;
    }
  }
  return png(size, buf);
}

const files = {
  'icon-32.png': render(32),
  'icon-180.png': render(180),        // pantalla de inicio del iPhone
  'icon-192.png': render(192),
  'icon-512.png': render(512),
  'icon-maskable-512.png': render(512, 0.78),
};
for (const [name, data] of Object.entries(files)) writeFileSync(out + name, data);
console.log('Íconos listos en icons/:', Object.keys(files).join(', '));
