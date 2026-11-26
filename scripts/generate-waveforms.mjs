/**
 * Generate waveform thumbnails for the beat cards.
 *
 * Reads each WAV in public/beats/, computes peak amplitudes per column, and
 * writes a small PNG per beat to public/waveforms/<id>.png. The thumbnail is
 * drawn from the actual audio rather than a decorative placeholder, so the
 * card always shows what the track really sounds like.
 *
 * Usage: node scripts/generate-waveforms.mjs
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const BEATS_DIR = resolve(root, 'public', 'beats');
const OUT_DIR = resolve(root, 'public', 'waveforms');

/* ----------------------------------------------------------- WAV decode */

function decodeWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a RIFF file');
  if (buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAVE file');

  let pos = 12;
  let fmt = null;
  let data = null;

  while (pos < buffer.length - 8) {
    const id = buffer.toString('ascii', pos, pos + 4);
    const size = buffer.readUInt32LE(pos + 4);
    const body = buffer.subarray(pos + 8, pos + 8 + size);

    if (id === 'fmt ') {
      fmt = {
        audioFormat: body.readUInt16LE(0),
        channels: body.readUInt16LE(2),
        sampleRate: body.readUInt32LE(4),
        bitsPerSample: body.readUInt16LE(14),
      };
    } else if (id === 'data') {
      data = body;
    }
    pos += 8 + size + (size % 2);
  }

  if (!fmt || !data) throw new Error('missing fmt or data chunk');

  if (fmt.audioFormat !== 1 || fmt.bitsPerSample !== 16) {
    throw new Error('only 16-bit PCM is supported');
  }

  const samples = fmt.channels;
  const frames = Math.floor(data.length / 2 / samples);
  const mono = new Float32Array(frames);

  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < samples; c++) {
      sum += data.readInt16LE((i * samples + c) * 2) / 32768;
    }
    mono[i] = sum / samples;
  }

  return { mono, sampleRate: fmt.sampleRate, duration: frames / fmt.sampleRate };
}

/* ---------------------------------------------------------- PNG encode */

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

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** Encode 8-bit RGBA pixels as a PNG. */
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const dst = y * (width * 4 + 1);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------- drawing */

const SIZE = 120; // square thumbnail, matching the card art in the reference
const BARS = 17; // columns per row
const GAP = 3;
const BAR_W = 4;

function drawWaveform(mono, sampleRate) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);

  const barH = SIZE - 16;
  const colW = SIZE / BARS;

  // One bar of audio, repeated across the thumbnail. Sampling the whole track
  // flattens a drum loop into a row of identical bars — a single bar keeps the
  // hi-hat and snare pattern legible.
  const windowSamples = Math.floor(sampleRate * 1.0);
  const step = Math.floor(mono.length / BARS);

  const heights = [];
  for (let b = 0; b < BARS; b++) {
    const start = b * step;
    const end = Math.min(start + windowSamples, mono.length);
    let sum = 0;
    let peak = 0;
    for (let i = start; i < end; i++) {
      const v = mono[i];
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    // Blend RMS (loudness) with peak (transients) so neither dominates.
    heights.push(rms * 0.65 + peak * 0.35);
  }

  const max = Math.max(...heights);
  const min = Math.min(...heights);
  const span = Math.max(1e-6, max - min);

  for (let b = 0; b < BARS; b++) {
    // Normalise to the window's own range, then apply a floor so quiet
    // columns still register as a bar rather than vanishing.
    const norm = (heights[b] - min) / span;
    const h = Math.max(5, Math.round((0.22 + norm * 0.78) * barH));
    const x = Math.round(b * colW + (colW - BAR_W) / 2);
    const y = Math.round((SIZE - h) / 2);

    for (let px = x; px < x + BAR_W && px < SIZE; px++) {
      for (let py = y; py < y + h && py < SIZE; py++) {
        const i = (py * SIZE + px) * 4;
        rgba[i] = 247; // #F78501 — the logo orange
        rgba[i + 1] = 133;
        rgba[i + 2] = 1;
        rgba[i + 3] = 255;
      }
    }
  }

  return encodePng(SIZE, SIZE, rgba);
}

/* -------------------------------------------------------------- render */

mkdirSync(OUT_DIR, { recursive: true });

const files = readdirSync(BEATS_DIR).filter((f) => f.endsWith('.wav'));
let written = 0;

for (const file of files) {
  const id = basename(file, '.wav');
  try {
    const { mono, sampleRate, duration } = decodeWav(
      readFileSync(resolve(BEATS_DIR, file)),
    );
    const png = drawWaveform(mono, sampleRate);
    writeFileSync(resolve(OUT_DIR, `${id}.png`), png);
    written += 1;
    console.log(
      `  ${id}.png  ${SIZE}x${SIZE}  ${duration.toFixed(1)}s  ` +
        `${(png.length / 1024).toFixed(1)} kB`,
    );
  } catch (error) {
    console.error(`  FAIL ${file}: ${error.message}`);
  }
}

console.log(`\n${written} waveform thumbnail(s) written to public/waveforms/`);
