/**
 * Crop public/logo.png to its opaque content bounds.
 *
 * The source logo is a 500x499 canvas holding a 488x168 mark, so most of the
 * image is transparent padding. Cropping to the alpha bounds lets the shell
 * size the logo by its actual mark instead of by the empty canvas.
 *
 * Writes public/logo-mark.png (the original file is left untouched).
 *
 * Usage: node scripts/crop-logo.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const SRC = resolve(root, 'public', 'logo.png');
const OUT = resolve(root, 'public', 'logo-mark.png');

/* --------------------------------------------------------- decode PNG */

const buf = readFileSync(SRC);
let pos = 8;
let width = 0;
let height = 0;
let bitDepth = 0;
let colorType = 0;
const idat = [];

while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
  }
  if (type === 'IDAT') idat.push(data);
  if (type === 'IEND') break;
  pos += 12 + len;
}

if (bitDepth !== 8 || colorType !== 6) {
  throw new Error(`Expected an 8-bit RGBA PNG, got bitDepth=${bitDepth} colorType=${colorType}`);
}

const zlib = await import('node:zlib');
const raw = zlib.inflateSync(Buffer.concat(idat));

const bpp = 4;
const stride = width * bpp;
const pixels = Buffer.alloc(height * stride);

let rp = 0;
for (let y = 0; y < height; y++) {
  const filter = raw[rp];
  rp += 1;
  const row = raw.subarray(rp, rp + stride);
  rp += stride;

  const cur = pixels.subarray(y * stride, (y + 1) * stride);
  const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);

  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? cur[x - bpp] : 0;
    const b = prev[x];
    const c = x >= bpp ? prev[x - bpp] : 0;
    const v = row[x];
    let val;
    switch (filter) {
      case 0: val = v; break;
      case 1: val = v + a; break;
      case 2: val = v + b; break;
      case 3: val = v + Math.floor((a + b) / 2); break;
      case 4: {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        val = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        break;
      }
      default: val = v;
    }
    cur[x] = val & 0xff;
  }
}

/* ------------------------------------------------------- find the bounds */

let minX = width;
let maxX = -1;
let minY = height;
let maxY = -1;

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (pixels[y * stride + x * 4 + 3] > 8) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

if (maxX < 0) throw new Error('The logo has no opaque pixels');

// A small uniform margin so the mark does not touch the edge.
const PAD = 6;
minX = Math.max(0, minX - PAD);
minY = Math.max(0, minY - PAD);
maxX = Math.min(width - 1, maxX + PAD);
maxY = Math.min(height - 1, maxY + PAD);

const outW = maxX - minX + 1;
const outH = maxY - minY + 1;

/* --------------------------------------------------------- encode PNG */

// Filter type 0 (none) on every scanline.
const outRaw = Buffer.alloc(outH * (outW * bpp + 1));
for (let y = 0; y < outH; y++) {
  const dst = y * (outW * bpp + 1);
  outRaw[dst] = 0;
  pixels.copy(
    outRaw,
    dst + 1,
    (minY + y) * stride + minX * bpp,
    (minY + y) * stride + (maxX + 1) * bpp,
  );
}

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return c ^ 0xffffffff;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(outW, 0);
ihdr.writeUInt32BE(outH, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type RGBA
ihdr[10] = 0; // deflate
ihdr[11] = 0; // adaptive filtering
ihdr[12] = 0; // no interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(outRaw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(OUT, png);

console.log(
  `logo-mark.png  ${outW}x${outH}  (from ${width}x${height}, ` +
    `content ${maxX - minX + 1}x${maxY - minY + 1} at ${minX},${minY})`,
);
