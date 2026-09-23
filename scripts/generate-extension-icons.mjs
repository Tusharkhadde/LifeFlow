import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "chrome-extension", "icons");

const BOLT = [
  [278, 66],
  [126, 284],
  [238, 284],
  [224, 446],
  [386, 208],
  [270, 208],
];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function insideRoundRect(x, y, size) {
  const radius = size * 0.22;
  const left = 0.5;
  const top = 0.5;
  const right = size - 1.5;
  const bottom = size - 1.5;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function insideBolt(x, y, size) {
  const scale = size / 512;
  const points = BOLT.map(([px, py]) => [px * scale, py * scale]);
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.00001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = size <= 32 ? 3 : 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let bolt = 0;
      let gradient = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          if (!insideRoundRect(px, py, size)) continue;
          bg++;
          gradient += (px + py) / (size * 2);
          if (insideBolt(px, py, size)) bolt++;
        }
      }
      const total = samples * samples;
      if (!bg) continue;
      const t = gradient / bg;
      const br = mix(79, 124, t);
      const bgg = mix(70, 58, t);
      const bb = mix(229, 237, t);
      const boltT = bolt / bg;
      const i = (y * size + x) * 4;
      rgba[i] = mix(br, 255, boltT);
      rgba[i + 1] = mix(bgg, 255, boltT);
      rgba[i + 2] = mix(bb, 255, boltT);
      rgba[i + 3] = Math.round((bg / total) * 255);
    }
  }
  return png(size, rgba);
}

mkdirSync(root, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = join(root, `icon${size}.png`);
  writeFileSync(file, render(size));
  console.log(file);
}
