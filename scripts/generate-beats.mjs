#!/usr/bin/env node
/**
 * Generates the placeholder beats shipped in /public/beats.
 *
 * These are 100% synthesized drum-machine loops written by this script — no
 * sampled or copyrighted material is involved, so they are safe to distribute.
 * They exist so the game is playable the moment you clone the repo.
 *
 * TO REPLACE THEM WITH YOUR OWN BEATS:
 *   1. Drop your audio files into /public/beats/ (any .wav or .mp3).
 *   2. Edit src/data/beats.js and point each entry's `src` at your file,
 *      updating `title`, `bpm` and `duration` to match.
 *   3. Delete this script and the `npm run generate:beats` line in package.json.
 *
 * Usage: node scripts/generate-beats.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'public', 'beats');

const SAMPLE_RATE = 22050;

/* ---------------------------------------------------------------- helpers */

function createBuffer(seconds) {
  return new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
}

/** Deterministic PRNG so every run produces byte-identical files. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

function addSample(buf, index, value) {
  if (index >= 0 && index < buf.length) buf[index] += value;
}

/** One-pole lowpass — used to round off synthetic transients. */
function lowpass(buf, cutoffHz) {
  const dt = 1 / SAMPLE_RATE;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const alpha = dt / (rc + dt);
  let prev = 0;
  for (let i = 0; i < buf.length; i += 1) {
    prev += alpha * (buf[i] - prev);
    buf[i] = prev;
  }
}

function normalize(buf, peak = 0.89) {
  let max = 0;
  for (let i = 0; i < buf.length; i += 1) max = Math.max(max, Math.abs(buf[i]));
  if (max === 0) return;
  const gain = peak / max;
  for (let i = 0; i < buf.length; i += 1) buf[i] *= gain;
}

/** Soft saturation keeps peaks musical instead of clipping harshly. */
function saturate(buf, drive = 1.6) {
  for (let i = 0; i < buf.length; i += 1) {
    buf[i] = Math.tanh(buf[i] * drive) / Math.tanh(drive);
  }
}

/* ------------------------------------------------------------------ drums */

function renderKick(buf, start, gain = 1) {
  const len = Math.floor(SAMPLE_RATE * 0.34);
  let phase = 0;
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    // Pitch sweep from 150 Hz down to 44 Hz.
    const freq = 44 + 106 * Math.exp(-t * 26);
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const env = Math.exp(-t * 11);
    const click = Math.exp(-t * 220) * 0.28;
    addSample(buf, start + i, (Math.sin(phase) * env + click) * 0.95 * gain);
  }
}

function renderSnare(buf, start, rng, gain = 1) {
  const len = Math.floor(SAMPLE_RATE * 0.26);
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 21);
    const tone = Math.sin(2 * Math.PI * 188 * t) * 0.55 + Math.sin(2 * Math.PI * 276 * t) * 0.3;
    const noise = (rng() * 2 - 1) * 0.7;
    addSample(buf, start + i, (tone * 0.5 + noise) * env * 0.62 * gain);
  }
}

function renderHat(buf, start, rng, gain = 1, decay = 42, open = false) {
  const len = Math.floor(SAMPLE_RATE * (open ? 0.22 : 0.075));
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * decay);
    // Metallic ring approximated by inharmonic partials.
    const partial =
      Math.sin(2 * Math.PI * 5230 * t) * 0.5 +
      Math.sin(2 * Math.PI * 7919 * t) * 0.35 +
      Math.sin(2 * Math.PI * 11207 * t) * 0.22;
    const noise = (rng() * 2 - 1) * 0.35;
    addSample(buf, start + i, (partial + noise) * env * 0.3 * gain);
  }
}

function renderClap(buf, start, rng, gain = 1) {
  const len = Math.floor(SAMPLE_RATE * 0.3);
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 15);
    const burst = 1 + 0.6 * Math.sin(2 * Math.PI * 62 * t);
    addSample(buf, start + i, (rng() * 2 - 1) * env * burst * 0.42 * gain);
  }
}

/* ------------------------------------------------------------------- bass */

function renderBass(buf, start, noteHz, lengthSec, gain = 1) {
  const len = Math.floor(lengthSec * SAMPLE_RATE);
  let phase = 0;
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    phase += (2 * Math.PI * noteHz) / SAMPLE_RATE;
    const env = Math.min(1, t * 90) * Math.exp(-t * 2.1);
    // Saw-ish tone: fundamental plus a couple of soft harmonics.
    const saw = Math.sin(phase) + 0.42 * Math.sin(phase * 2) + 0.2 * Math.sin(phase * 3);
    addSample(buf, start + i, saw * env * 0.3 * gain);
  }
}

/** Short plucked chord stab. */
function renderStab(buf, start, freqs, lengthSec, gain = 1) {
  const len = Math.floor(lengthSec * SAMPLE_RATE);
  for (let i = 0; i < len; i += 1) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 5.2);
    let v = 0;
    for (let f = 0; f < freqs.length; f += 1) {
      v += Math.sin(2 * Math.PI * freqs[f] * t);
    }
    addSample(buf, start + i, (v / freqs.length) * env * 0.22 * gain);
  }
}

/* ------------------------------------------------------------ WAV writing */

function encodeWav(samples) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // format = PCM
  buffer.writeUInt16LE(1, 22); // channels = mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * bytesPerSample);
  }
  return buffer;
}

/* ------------------------------------------------------------- the beats */

// Note helper: MIDI-ish note numbers → Hz.
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

const BEATS = [
  {
    file: 'neon-nightrun.wav',
    bpm: 92,
    bars: 8,
    seed: 20240,
    key: [45, 45, 48, 45, 50, 48, 45, 43],
    kick: 'four',
    snare: 'backbeat',
    hat: 'eighths',
    bass: true,
    stabs: true,
  },
  {
    file: 'concrete-bounce.wav',
    bpm: 104,
    bars: 8,
    seed: 7731,
    key: [41, 41, 44, 41, 43, 41, 39, 41],
    kick: 'four',
    snare: 'backbeat',
    hat: 'sixteenths',
    bass: true,
    stabs: false,
  },
  {
    file: 'after-hours.wav',
    bpm: 78,
    bars: 8,
    seed: 31337,
    key: [38, 38, 41, 38, 43, 41, 38, 36],
    kick: 'sparse',
    snare: 'halftime',
    hat: 'quarters',
    bass: true,
    stabs: true,
  },
  {
    file: 'chrome-crest.wav',
    bpm: 126,
    bars: 8,
    seed: 9091,
    key: [47, 47, 50, 47, 52, 50, 47, 45],
    kick: 'four',
    snare: 'backbeat',
    hat: 'sixteenths',
    bass: true,
    stabs: true,
    clap: true,
  },
  {
    file: 'rooftop-radio.wav',
    bpm: 98,
    bars: 8,
    seed: 55512,
    key: [43, 43, 46, 43, 48, 46, 43, 41],
    kick: 'four',
    snare: 'backbeat',
    hat: 'eighths',
    bass: false,
    stabs: true,
  },
  {
    file: 'midnight-lane.wav',
    bpm: 86,
    bars: 8,
    seed: 60613,
    key: [40, 40, 43, 40, 45, 43, 40, 38],
    kick: 'sparse',
    snare: 'backbeat',
    hat: 'eighths',
    bass: true,
    stabs: false,
    clap: true,
  },
];

const STEPS_PER_BAR = 16;

function buildBeat(spec) {
  const rng = makeRng(spec.seed);
  const secondsPerStep = 60 / spec.bpm / 4; // 16th-note grid
  const totalSteps = spec.bars * STEPS_PER_BAR;
  const totalSeconds = totalSteps * secondsPerStep;
  const buf = createBuffer(totalSeconds + 0.5);

  const stepIndexToTime = (step) => step * secondsPerStep;

  for (let bar = 0; bar < spec.bars; bar += 1) {
    const barOffset = bar * STEPS_PER_BAR;

    for (let step = 0; step < STEPS_PER_BAR; step += 1) {
      const t = stepIndexToTime(barOffset + step);
      const i = Math.floor(t * SAMPLE_RATE);
      const inBar = step;

      // --- kick
      const kickOn =
        spec.kick === 'four'
          ? inBar % 4 === 0
          : spec.kick === 'sparse'
            ? inBar === 0 || inBar === 6 || inBar === 10
            : false;
      if (kickOn) renderKick(buf, i, 1);

      // --- snare / clap
      if (spec.snare === 'backbeat' && (inBar === 4 || inBar === 12)) renderSnare(buf, i, rng, 1);
      if (spec.snare === 'halftime' && inBar === 8) renderSnare(buf, i, rng, 1.1);
      if (spec.clap && (inBar === 4 || inBar === 12)) renderClap(buf, i, rng, 0.85);

      // --- hats
      if (spec.hat === 'quarters' && inBar % 4 === 2) renderHat(buf, i, rng, 0.9, 46, true);
      if (spec.hat === 'eighths' && inBar % 2 === 0) renderHat(buf, i, rng, 0.8, 48, inBar % 4 === 2);
      if (spec.hat === 'sixteenths') {
        renderHat(buf, i, rng, inBar % 4 === 0 ? 0.85 : 0.55, inBar % 4 === 2 ? 32 : 60, inBar % 8 === 6);
      }

      // --- bass note on every other 8th
      if (spec.bass && inBar % 4 === 0) {
        const noteIdx = Math.floor(bar / 2) % spec.key.length;
        const note = spec.key[noteIdx];
        renderBass(buf, i, hz(note), secondsPerStep * 4 * 0.95, 1);
      }

      // --- chord stab
      if (spec.stabs && (inBar === 2 || inBar === 10)) {
        const root = spec.key[(bar + 1) % spec.key.length];
        const freqs = [hz(root), hz(root + 7), hz(root + 10)];
        renderStab(buf, i, freqs, secondsPerStep * 3, 1);
      }
    }
  }

  lowpass(buf, 7200);
  saturate(buf, 1.35);
  normalize(buf, 0.85);

  // Short fade at both ends so the loop boundary does not click.
  const fade = Math.floor(SAMPLE_RATE * 0.02);
  for (let i = 0; i < fade; i += 1) {
    const g = i / fade;
    buf[i] *= g;
    buf[buf.length - 1 - i] *= g;
  }

  return { buf, seconds: totalSeconds };
}

mkdirSync(OUT_DIR, { recursive: true });

const manifest = [];
for (const spec of BEATS) {
  const { buf } = buildBeat(spec);
  const wav = encodeWav(buf);
  const outPath = resolve(OUT_DIR, spec.file);
  writeFileSync(outPath, wav);
  const seconds = buf.length / SAMPLE_RATE;
  manifest.push({ file: spec.file, bpm: spec.bpm, seconds: Number(seconds.toFixed(2)), kb: Math.round(wav.length / 1024) });
  console.log(`wrote ${spec.file}  ${spec.bpm} BPM  ${seconds.toFixed(1)}s  ${Math.round(wav.length / 1024)} KB`);
}

console.log(`\n${manifest.length} placeholder beats written to public/beats/`);
console.log('Replace them with your own audio and update src/data/beats.js — see the README.');
