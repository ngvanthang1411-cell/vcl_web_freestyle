/**
 * Trim the silent tail off each beat file.
 *
 * The synthesized beats are built on a 16th-note grid of exactly 8 bars, but
 * the generator pads each file with 0.5s of extra silence. With `audio.loop`
 * that padding becomes an audible gap on every repeat, and the beat phase
 * drifts further out of step with each pass.
 *
 * This script cuts each WAV at its musical grid boundary so the loop is
 * seamless. It is idempotent: running it on already-trimmed files is a no-op.
 *
 * Usage: node scripts/trim-beats.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const BEATS_DIR = resolve(root, 'public', 'beats');

/* ------------------------------------------------------------ WAV codec */

/**
 * Read a 16-bit PCM WAV file into its header fields and raw sample data.
 */
function decodeWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a RIFF file');
  if (buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAVE file');

  let pos = 12;
  let fmt = null;
  let data = null;

  while (pos < buffer.length - 8) {
    const id = buffer.toString('ascii', pos, pos + 4);
    const size = buffer.readUInt32LE(pos + 4);

    if (id === 'fmt ') {
      fmt = {
        audioFormat: buffer.readUInt16LE(pos + 8),
        channels: buffer.readUInt16LE(pos + 10),
        sampleRate: buffer.readUInt32LE(pos + 12),
        byteRate: buffer.readUInt32LE(pos + 16),
        blockAlign: buffer.readUInt16LE(pos + 20),
        bitsPerSample: buffer.readUInt16LE(pos + 22),
      };
    } else if (id === 'data') {
      data = buffer.subarray(pos + 8, pos + 8 + size);
    }

    pos += 8 + size + (size % 2);
  }

  if (!fmt || !data) throw new Error('missing fmt or data chunk');
  if (fmt.audioFormat !== 1) throw new Error('only PCM is supported');
  if (fmt.bitsPerSample !== 16) throw new Error('only 16-bit samples are supported');

  return { fmt, data };
}

/** Encode raw samples back into a RIFF/WAVE buffer. */
function encodeWav(fmt, data) {
  const header = Buffer.alloc(44);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(fmt.channels, 22);
  header.writeUInt32LE(fmt.sampleRate, 24);
  header.writeUInt32LE(fmt.byteRate, 28);
  header.writeUInt16LE(fmt.blockAlign, 32);
  header.writeUInt16LE(fmt.bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

/* ----------------------------------------------------- beat definitions */

/**
 * The beat library, mirrored from src/data/beats.js.
 *
 * `bars` is how many bars of music the generator wrote. The generator lays
 * the loop out on a 16th-note grid — four steps per beat — so the musical
 * length is bars * 4 * (60 / bpm) seconds.
 */
const BARS = 8;
const BEATS = [
  { file: 'neon-nightrun.wav', bpm: 92 },
  { file: 'concrete-bounce.wav', bpm: 104 },
  { file: 'after-hours.wav', bpm: 78 },
  { file: 'chrome-crest.wav', bpm: 126 },
  { file: 'rooftop-radio.wav', bpm: 98 },
  { file: 'midnight-lane.wav', bpm: 86 },
];

/** Fade the tail so the loop point does not click. */
const FADE_SAMPLES = 110; // ~5ms at 22050Hz

/* ---------------------------------------------------------------- trim */

let changed = 0;

for (const beat of BEATS) {
  const path = resolve(BEATS_DIR, beat.file);
  const buffer = readFileSync(path);
  const { fmt, data } = decodeWav(buffer);

  const bytesPerFrame = (fmt.bitsPerSample / 8) * fmt.channels;
  const totalFrames = Math.floor(data.length / bytesPerFrame);

  const gridSeconds = BARS * 4 * (60 / beat.bpm);
  const gridFrames = Math.round(gridSeconds * fmt.sampleRate);

  // Already trimmed (or shorter than the grid) — leave it alone.
  if (totalFrames <= gridFrames + 1) {
    console.log(
      `  ${beat.file.padEnd(22)} already trimmed  ${(totalFrames / fmt.sampleRate).toFixed(3)}s`,
    );
    continue;
  }

  // Keep the grid length, fading the last few milliseconds to silence so the
  // loop seam cannot click.
  const keepFrames = Math.min(gridFrames, totalFrames);
  const fadeStart = Math.max(0, keepFrames - FADE_SAMPLES);
  const out = Buffer.from(data.subarray(0, keepFrames * bytesPerFrame));

  for (let frame = fadeStart; frame < keepFrames; frame += 1) {
    const gain = 1 - (frame - fadeStart) / FADE_SAMPLES;
    for (let channel = 0; channel < fmt.channels; channel += 1) {
      const index = (frame * fmt.channels + channel) * 2;
      out.writeInt16LE(Math.round(out.readInt16LE(index) * gain), index);
    }
  }

  writeFileSync(path, encodeWav(fmt, out));
  changed += 1;

  const before = totalFrames / fmt.sampleRate;
  const after = keepFrames / fmt.sampleRate;
  console.log(
    `  ${beat.file.padEnd(22)} ${before.toFixed(3)}s -> ${after.toFixed(3)}s  ` +
      `(grid ${gridSeconds.toFixed(3)}s, ${beat.bpm} BPM)`,
  );
}

console.log(`\n${changed} beat file(s) trimmed.`);
