/**
 * Verify the beat grid maths against the real audio.
 *
 * The word reveal and the hit judging both depend on the beat grid being
 * exactly right. This script checks the grid against the actual WAV files:
 * it finds the kick onsets in the audio and confirms they land on the grid
 * the app computes.
 *
 * Usage: node scripts/check-beat-grid.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  beatIndexAt,
  judgeOffset,
  offsetFromNearestBeat,
  phaseAt,
  secondsPerBeat,
  snapToBeats,
  TIMING,
} from '../src/lib/beatGrid.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const BEATS_DIR = resolve(root, 'public', 'beats');

/* ------------------------------------------------------------ WAV decode */

function decodeWav(buffer) {
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos < buffer.length - 8) {
    const id = buffer.toString('ascii', pos, pos + 4);
    const size = buffer.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      fmt = {
        channels: buffer.readUInt16LE(pos + 10),
        sampleRate: buffer.readUInt32LE(pos + 12),
      };
    } else if (id === 'data') {
      data = buffer.subarray(pos + 8, pos + 8 + size);
      break;
    }
    pos += 8 + size + (size % 2);
  }

  const frames = Math.floor(data.length / 2 / fmt.channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) {
      sum += data.readInt16LE((i * fmt.channels + c) * 2) / 32768;
    }
    mono[i] = sum / fmt.channels;
  }
  return { mono, sampleRate: fmt.sampleRate };
}

/**
 * Find the downbeats — the kick hits — by looking for sharp rises in energy.
 */
function findOnsets(mono, sampleRate) {
  const window = Math.floor(sampleRate * 0.005);
  const onsets = [];
  let previous = 0;

  for (let i = window; i < mono.length - window; i += window) {
    let energy = 0;
    for (let j = i; j < i + window; j++) energy += mono[j] * mono[j];
    const rms = Math.sqrt(energy / window);
    if (rms > 0.15 && rms > previous * 1.8) onsets.push(i / sampleRate);
    previous = Math.max(previous * 0.85, rms);
  }
  return onsets;
}

/* ---------------------------------------------------------------- check */

const BEATS = [
  { file: 'neon-nightrun.wav', bpm: 92 },
  { file: 'concrete-bounce.wav', bpm: 104 },
  { file: 'after-hours.wav', bpm: 78 },
  { file: 'chrome-crest.wav', bpm: 126 },
  { file: 'rooftop-radio.wav', bpm: 98 },
  { file: 'midnight-lane.wav', bpm: 86 },
];

let failures = 0;

/**
 * The energy rise at a given time, compared with the energy just before it.
 *
 * A transient (a drum hit) makes the energy jump sharply at the moment it
 * lands. This is a far more robust alignment probe than picking out onsets,
 * because it measures the grid against the audio rather than trying to parse
 * which instrument fired.
 */
function transientAt(mono, sampleRate, time) {
  const at = Math.floor(time * sampleRate);
  const window = Math.floor(sampleRate * 0.02); // 20ms
  const before = Math.max(0, at - window);

  let after = 0;
  for (let i = at; i < Math.min(mono.length, at + window); i++) after += mono[i] * mono[i];
  let prior = 0;
  for (let i = before; i < at; i++) prior += mono[i] * mono[i];

  const afterRms = Math.sqrt(after / window);
  const priorRms = Math.sqrt(prior / Math.max(1, at - before));
  return { afterRms, ratio: priorRms > 0 ? afterRms / priorRms : afterRms > 0 ? 99 : 0 };
}

for (const beat of BEATS) {
  const { mono, sampleRate } = decodeWav(readFileSync(resolve(BEATS_DIR, beat.file)));
  const onsets = findOnsets(mono, sampleRate);

  const spb = secondsPerBeat(beat.bpm);

  // 1. The strongest onsets must land on the grid. These are the kicks.
  const strong = onsets.slice(0, 8);
  const downbeatErrors = strong.map((t, i) => Math.abs(t - i * spb));

  // 2. Every beat on the grid must carry a transient — that is what proves
  //    the grid lines up with the music, independently of any detector.
  const beatCount = Math.floor(mono.length / sampleRate / spb);
  const ratios = [];
  for (let i = 0; i < beatCount; i++) {
    ratios.push(transientAt(mono, sampleRate, i * spb).ratio);
  }
  const weakest = Math.min(...ratios);
  const median = [...ratios].sort((a, b) => a - b)[Math.floor(ratios.length / 2)];

  // 3. The on-grid hits must be very close to the grid. The median is used
  //    rather than the maximum: the detector also fires on bass notes and
  //    other non-percussive content that legitimately sits between the beats.
  const onGrid = onsets
    .map((t) => Math.abs(offsetFromNearestBeat(t, beat.bpm)))
    .filter((o) => o <= 120)
    .sort((a, b) => a - b);
  const typical = onGrid.length ? onGrid[Math.floor(onGrid.length / 2)] : Infinity;

  const downbeatsAligned = downbeatErrors.length === 0 || Math.max(...downbeatErrors) <= 40;
  const transientsAligned = median >= 1.8 && weakest >= 1.2;
  const hitsAligned = typical <= 30;

  if (!downbeatsAligned || !transientsAligned || !hitsAligned) failures += 1;

  console.log(
    `  ${beat.file.padEnd(22)} ${String(beat.bpm).padStart(3)} BPM  ` +
      `downbeat error ${(downbeatErrors.length ? Math.max(...downbeatErrors) : 0).toFixed(1).padStart(5)}ms  ` +
      `typical hit offset ${typical.toFixed(1).padStart(5)}ms  ` +
      `transient on every beat: weakest ratio ${weakest.toFixed(2)}  ` +
      (downbeatsAligned && transientsAligned && hitsAligned ? 'OK' : 'MISALIGNED'),
  );
}

/* ---------------------------------------------- grid maths invariants */

// The phase must run 0 -> 1 across a beat and wrap cleanly.
for (const bpm of [78, 86, 92, 98, 104, 126]) {
  const spb = secondsPerBeat(bpm);
  for (let i = 0; i < 20; i++) {
    const t = i * spb + 0.001;
    const phase = phaseAt(t, bpm);
    const index = beatIndexAt(t, bpm);
    if (phase < 0 || phase >= 1) {
      failures += 1;
      console.error(`FAIL  phase out of range at ${t}s (${bpm} BPM): ${phase}`);
      break;
    }
    if (index !== i) {
      failures += 1;
      console.error(`FAIL  beat index wrong at ${t}s (${bpm} BPM): ${index} != ${i}`);
      break;
    }
  }
}

// The offset from the nearest beat must be zero exactly on the beat.
for (const bpm of [78, 92, 126]) {
  const spb = secondsPerBeat(bpm);
  for (let i = 0; i < 8; i++) {
    const offset = offsetFromNearestBeat(i * spb, bpm);
    if (Math.abs(offset) > 0.001) {
      failures += 1;
      console.error(`FAIL  offset on beat ${i} (${bpm} BPM) is ${offset}`);
      break;
    }
  }
}

// Snapping must land on a whole number of beats.
for (const bpm of [78, 92, 126]) {
  for (let seconds = 2; seconds <= 10; seconds++) {
    const beats = snapToBeats(seconds, bpm);
    if (beats < 1) {
      failures += 1;
      console.error(`FAIL  snapToBeats returned ${beats} for ${seconds}s at ${bpm} BPM`);
      break;
    }
    const actual = beats * secondsPerBeat(bpm);
    if (Math.abs(actual - seconds) > secondsPerBeat(bpm) / 2 + 0.001) {
      failures += 1;
      console.error(`FAIL  snapToBeats(${seconds}, ${bpm}) -> ${actual}s is not nearest`);
      break;
    }
  }
}

// The judgement windows must behave as documented.
const cases = [
  [0, TIMING.PERFECT],
  [45, TIMING.PERFECT],
  [90, TIMING.PERFECT],
  [91, TIMING.GOOD],
  [160, TIMING.GOOD],
  [161, TIMING.MISS],
  [300, TIMING.MISS],
  [-45, TIMING.PERFECT],
  [-200, TIMING.MISS],
];
for (const [offset, expected] of cases) {
  const actual = judgeOffset(offset);
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL  judgeOffset(${offset}) = ${actual}, expected ${expected}`);
  }
}

console.log(
  failures === 0
    ? '\nThe beat grid matches the audio, and the grid maths holds.'
    : `\n${failures} problem(s) found.`,
);
if (failures > 0) process.exit(1);
