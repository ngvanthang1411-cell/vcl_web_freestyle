/**
 * Verify the beat clock stays monotonic across the beat's loop point.
 *
 * The beat loops, so `audio.currentTime` restarts at zero every time. The
 * clock has to carry the beat count across that boundary — otherwise the
 * word reveal stops after the first loop and the challenge freezes.
 *
 * This replays a real beat file's timing through the same accumulation the
 * clock does, and checks that the reveals keep coming.
 *
 * Usage: node scripts/check-beat-loop.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beatIndexAt, secondsPerBeat, snapToBeats } from '../src/lib/beatGrid.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/* ------------------------------------------------------------ WAV decode */

function decodeDuration(buffer) {
  let pos = 12;
  while (pos < buffer.length - 8) {
    const id = buffer.toString('ascii', pos, pos + 4);
    const size = buffer.readUInt32LE(pos + 4);
    if (id === 'data') {
      const fmt = { channels: 1, sampleRate: 22050 };
      return size / 2 / fmt.channels / fmt.sampleRate;
    }
    pos += 8 + size + (size % 2);
  }
  return 0;
}

/**
 * Replays the clock's accumulation over a looping beat.
 *
 * `currentTime` wraps back to zero at the loop point, exactly as the audio
 * element does.
 */
function simulate(duration, bpm, sessionSeconds, intervalBeats) {
  const spb = secondsPerBeat(bpm);
  const startBeat = beatIndexAt(0, bpm);

  let lastRawIndex = startBeat;
  let totalBeats = 0;
  let beatsAtLoopStart = 0;

  const revealed = [];
  let baseBeat = null;
  let nextDue = 0;

  const FRAME = 1 / 60;
  for (let elapsed = 0; elapsed < sessionSeconds; elapsed += FRAME) {
    // The audio element's clock, wrapping at the end of the file.
    const currentTime = elapsed % duration;
    const rawIndex = beatIndexAt(currentTime, bpm);

    if (rawIndex < lastRawIndex) {
      // A loop happened.
      beatsAtLoopStart = totalBeats;
    }
    lastRawIndex = rawIndex;

    const newTotal = beatsAtLoopStart + (rawIndex - startBeat);
    if (newTotal === totalBeats) continue;
    totalBeats = newTotal;

    // The word generator's logic.
    if (baseBeat === null) {
      baseBeat = totalBeats;
      nextDue = intervalBeats;
      revealed.push({ beat: totalBeats, elapsed });
    } else if (totalBeats - baseBeat >= nextDue) {
      const elapsedBeats = totalBeats - baseBeat;
      nextDue = elapsedBeats + intervalBeats;
      revealed.push({ beat: totalBeats, elapsed });
    }
  }

  return revealed;
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

const SESSION_SECONDS = 60; // the default session length

let failures = 0;

for (const beat of BEATS) {
  const duration = decodeDuration(
    readFileSync(resolve(root, 'public', 'beats', beat.file)),
  );
  const intervalBeats = snapToBeats(4, beat.bpm);
  const revealed = simulate(duration, beat.bpm, SESSION_SECONDS, intervalBeats);

  // The word must keep coming for the whole session.
  const expected = Math.floor(SESSION_SECONDS / (intervalBeats * (60 / beat.bpm))) + 1;
  const enough = revealed.length >= expected - 1;

  // The reveals must be evenly spaced and monotonically increasing.
  let spacingOk = true;
  for (let i = 1; i < revealed.length; i++) {
    const gap = revealed[i].beat - revealed[i - 1].beat;
    if (gap !== intervalBeats) spacingOk = false;
  }

  // The last reveal must be near the end of the session, not at the loop point.
  const lastElapsed = revealed.length ? revealed[revealed.length - 1].elapsed : 0;
  const coversSession = lastElapsed > duration; // i.e. it survived the first loop

  if (!enough || !spacingOk || !coversSession) failures += 1;

  console.log(
    `  ${beat.file.padEnd(22)} ${String(beat.bpm).padStart(3)} BPM  ` +
      `loop ${duration.toFixed(1)}s  ` +
      `${String(revealed.length).padStart(2)} reveals over ${SESSION_SECONDS}s  ` +
      `last at ${lastElapsed.toFixed(1)}s  ` +
      (enough && spacingOk && coversSession ? 'OK' : 'FAILED'),
  );
}

console.log(
  failures === 0
    ? '\nThe beat clock carries across the loop point, so the words never stop.'
    : `\n${failures} beat(s) failed.`,
);
if (failures > 0) process.exit(1);
