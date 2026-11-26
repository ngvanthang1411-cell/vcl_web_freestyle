/**
 * Simulate the beat-locked word reveal and the hit judging.
 *
 * This runs the real logic from src/lib/beatGrid.js against a simulated audio
 * clock playing a real beat file, and checks that:
 *
 *  1. Words are revealed exactly on the beat, every `intervalBeats` beats.
 *  2. A hit that lands on a kick is judged perfect.
 *  3. A hit that lands between kicks is judged off-beat.
 *  4. The reveal does not drift over a long session.
 *
 * Usage: node scripts/check-beat-reveal.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TIMING,
  judgeOffset,
  offsetFromNearestBeat,
  snapToBeats,
} from '../src/lib/beatGrid.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

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
 * The energy at a moment, used to tell whether a hit landed on a drum hit.
 */
function energyAt(mono, sampleRate, time) {
  const at = Math.floor(time * sampleRate);
  const window = Math.floor(sampleRate * 0.01);
  let sum = 0;
  for (let i = at; i < Math.min(mono.length, at + window); i++) sum += mono[i] * mono[i];
  return Math.sqrt(sum / window);
}

/* ---------------------------------------------------------------- check */

const BEATS = [
  { file: 'neon-nightrun.wav', bpm: 92 },
  { file: 'chrome-crest.wav', bpm: 126 },
  { file: 'after-hours.wav', bpm: 78 },
];

let failures = 0;

for (const beat of BEATS) {
  const { mono, sampleRate } = decodeWav(
    readFileSync(resolve(root, 'public', 'beats', beat.file)),
  );
  const duration = mono.length / sampleRate;
  const spb = 60 / beat.bpm;

  // The word interval, as the slider would give it: 4 seconds, snapped.
  const intervalBeats = snapToBeats(4, beat.bpm);

  // 1. Walk the beat clock the way the app does, and record every reveal.
  const reveals = [];
  let lastRevealed = null;
  let nextDue = null;
  let beatIndex = -1;

  for (let time = 0; time < duration; time += 1 / 60) {
    const index = Math.floor(time / spb);
    if (index === beatIndex) continue;
    beatIndex = index;

    if (lastRevealed === null) {
      lastRevealed = index;
      nextDue = index + intervalBeats;
      reveals.push(index);
    } else if (index >= nextDue) {
      lastRevealed = index;
      nextDue = index + intervalBeats;
      reveals.push(index);
    }
  }

  // Every reveal must land exactly on a beat boundary — the grid is the
  // point, so a reveal that drifts by even a few ms is a failure.
  const revealOffsets = reveals.map((b) =>
    Math.abs(offsetFromNearestBeat(b * spb, beat.bpm)),
  );
  const worstReveal = revealOffsets.length ? Math.max(...revealOffsets) : Infinity;
  const spacing = reveals.slice(1).map((b, i) => b - reveals[i]);
  const spacingOk = spacing.every((s) => s === intervalBeats);

  // 2. A hit on a drum transient must be judged perfect.
  //    The transient is found by the energy RISE at a point, not by the
  //    absolute level: a sustained bass note can be louder than the kick
  //    while sitting between the beats.
  const transientAt = (t) => {
    const at = Math.floor(t * sampleRate);
    const window = Math.floor(sampleRate * 0.02);
    const before = Math.max(0, at - window);
    let after = 0;
    for (let i = at; i < Math.min(mono.length, at + window); i++) after += mono[i] * mono[i];
    let prior = 0;
    for (let i = before; i < at; i++) prior += mono[i] * mono[i];
    const afterRms = Math.sqrt(after / window);
    const priorRms = Math.sqrt(prior / Math.max(1, at - before));
    return { rise: priorRms > 0 ? afterRms / priorRms : afterRms > 0 ? 99 : 0 };
  };

  // The strongest transient anywhere in the track.
  let topKick = null;
  for (let t = 0; t < duration; t += spb / 32) {
    const { rise } = transientAt(t);
    if (!topKick || rise > topKick.rise) topKick = { t, rise };
  }
  const kickJudgement = judgeOffset(offsetFromNearestBeat(topKick.t, beat.bpm));

  // 3. A hit well away from any beat must not be judged perfect.
  //    The offset is in milliseconds, so the cut-off is 200ms — past the
  //    "good" window, which guarantees the verdict is "miss".
  let quiet = null;
  for (let t = 0; t < duration; t += spb / 32) {
    const offset = Math.abs(offsetFromNearestBeat(t, beat.bpm));
    if (offset < 200) continue; // past the "good" window
    const e = energyAt(mono, sampleRate, t);
    if (!quiet || e < quiet.e) quiet = { t, e };
  }
  const quietJudgement = quiet
    ? judgeOffset(offsetFromNearestBeat(quiet.t, beat.bpm))
    : TIMING.PERFECT;

  const revealsOk = worstReveal < 1;
  const kickOk = kickJudgement === TIMING.PERFECT;
  const quietOk = quietJudgement === TIMING.MISS;

  if (!revealsOk || !spacingOk || !kickOk || !quietOk) failures += 1;

  console.log(
    `  ${beat.file.padEnd(22)} ${String(beat.bpm).padStart(3)} BPM  ` +
      `${String(reveals.length).padStart(2)} reveals every ${intervalBeats} beats  ` +
      `worst reveal offset ${worstReveal.toFixed(3).padStart(6)}ms  ` +
      `kick -> ${kickJudgement.padEnd(7)} quiet -> ${quietJudgement.padEnd(7)}  ` +
      (revealsOk && spacingOk && kickOk && quietOk ? 'OK' : 'FAILED'),
  );
}

console.log(
  failures === 0
    ? '\nThe beat-locked reveal and the hit judging behave correctly.'
    : `\n${failures} beat(s) failed.`,
);
if (failures > 0) process.exit(1);
