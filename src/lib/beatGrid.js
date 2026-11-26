/**
 * Beat grid maths.
 *
 * Everything here is a pure function over (time, bpm) so it can be unit
 * tested and reasoned about without a browser or a running audio element.
 *
 * A beat grid is the standard one: at BPM b, one beat lasts 60/bpm seconds
 * and beat n starts at n * (60/bpm).
 */

/** Length of one beat, in seconds. */
export function secondsPerBeat(bpm) {
  if (!bpm || bpm <= 0) return 0;
  return 60 / bpm;
}

/** Length of one bar (four beats), in seconds. */
export function secondsPerBar(bpm) {
  return secondsPerBeat(bpm) * 4;
}

/**
 * Which beat is playing at `time` seconds.
 *
 * Returns 0 before the first beat, and keeps counting up so the caller can
 * detect when it crosses into a new beat.
 */
export function beatIndexAt(time, bpm) {
  const spb = secondsPerBeat(bpm);
  if (!spb || time < 0) return 0;
  return Math.floor(time / spb);
}

/**
 * Position within the current beat, 0..1.
 *
 * 0 means the beat just started; 0.5 is halfway through it.
 */
export function phaseAt(time, bpm) {
  const spb = secondsPerBeat(bpm);
  if (!spb) return 0;
  const within = time - Math.floor(time / spb) * spb;
  return within / spb;
}

/**
 * How far `time` sits from the nearest beat, in milliseconds.
 *
 * Negative means the hit landed *before* the beat, positive means after.
 * The magnitude is what matters for judging timing.
 */
export function offsetFromNearestBeat(time, bpm) {
  const spb = secondsPerBeat(bpm);
  if (!spb) return 0;

  const beatLength = time / spb;
  const nearest = Math.round(beatLength);
  return (beatLength - nearest) * spb * 1000;
}

/**
 * The nearest whole number of beats to `seconds`.
 *
 * Always at least 1, so a beat count is never zero.
 */
export function snapToBeats(seconds, bpm) {
  const spb = secondsPerBeat(bpm);
  if (!spb) return 1;
  return Math.max(1, Math.round(seconds / spb));
}

/**
 * How many beats fit in `seconds`, as a whole number.
 *
 * This is the interval the word generator should actually use: revealing on
 * a beat multiple is what keeps the words locked to the music.
 */
export function beatsIn(seconds, bpm) {
  return snapToBeats(seconds, bpm);
}

/**
 * The time of a given beat index, in seconds.
 */
export function timeOfBeat(index, bpm) {
  return index * secondsPerBeat(bpm);
}

/**
 * Judgement of a hit against the grid.
 *
 * `PERFECT` is within 90ms of a beat — tight enough to feel like the
 * performer is rapping *on* the kick. `GOOD` allows a little more slack,
 * and anything past that is simply off-beat.
 */
export const TIMING = {
  PERFECT: 'perfect',
  GOOD: 'good',
  MISS: 'miss',
};

const PERFECT_WINDOW_MS = 90;
const GOOD_WINDOW_MS = 160;

/** Classify a beat offset (in milliseconds) into a timing judgement. */
export function judgeOffset(offsetMs) {
  const magnitude = Math.abs(offsetMs);
  if (magnitude <= PERFECT_WINDOW_MS) return TIMING.PERFECT;
  if (magnitude <= GOOD_WINDOW_MS) return TIMING.GOOD;
  return TIMING.MISS;
}

/** The judgement windows, in milliseconds — used for the UI hint. */
export const TIMING_WINDOWS = {
  perfectMs: PERFECT_WINDOW_MS,
  goodMs: GOOD_WINDOW_MS,
};
