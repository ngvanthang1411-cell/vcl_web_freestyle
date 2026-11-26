/**
 * Hype Meter scoring.
 *
 * The score is deterministic and derived only from things we actually measured
 * during the session — duration freestyled, how many prompt words were shown,
 * how many of those the performer was still on when they landed, and whether
 * the session ran to completion.
 */

/**
 * Tiers, lowest to highest. `min` is the inclusive lower bound of the score.
 *
 * `key` identifies the tier for translation; the English `label`/`blurb` are
 * the fallbacks used by the scoring logic and by non-UI consumers.
 */
export const HYPE_TIERS = [
  { min: 0, key: 'warmingUp', label: 'Warming Up', blurb: 'The room is still quiet. Run it back.' },
  { min: 25, key: 'gettingWarm', label: 'Getting Warm', blurb: 'You found the pocket. Keep pushing.' },
  { min: 45, key: 'hype', label: 'Hype', blurb: 'Solid flow over the beat. That landed.' },
  { min: 65, key: 'onFire', label: 'On Fire', blurb: 'The crowd is with you. No slowing down.' },
  { min: 82, key: 'legend', label: 'Legend', blurb: 'Bar after bar. That was a performance.' },
];

export function getHypeTier(score) {
  let tier = HYPE_TIERS[0];
  for (const candidate of HYPE_TIERS) {
    if (score >= candidate.min) tier = candidate;
  }
  return tier;
}

/**
 * The point budget. These add up to exactly 100, so a flawless run scores
 * 100 and the clamp at the end never actually has to bite.
 */
export const SCORE_WEIGHTS = {
  duration: 40, // how much of the allotted time was used
  hits: 30, // how many of the shown words got a reaction
  timing: 18, // how many of those hits landed on the beat
  completion: 8, // the session ran to the end
  recording: 4, // a take was actually captured
};

/**
 * The highest score a practice run can reach.
 *
 * Practice mode has no recording to go back and listen to, so it cannot earn
 * the top tier. The `legend` tier starts at 82, so 81 keeps it just below.
 */
export const PRACTICE_SCORE_CAP = 81;

/**
 * @param {object} params
 * @param {number} params.durationSeconds  How long the performer actually freestyled.
 * @param {number} params.targetSeconds     The session length they chose.
 * @param {number} params.wordsShown        How many prompt words appeared.
 * @param {number} params.wordsHit          How many of those were reacted to on time.
 * @param {number} [params.timingRatio]     What share of those hits landed on the beat (0..1).
 * @param {boolean} params.completed        True if the session ran to the end.
 * @param {boolean} params.practiceMode     True if no recording was captured.
 */
export function computeHypeScore({
  durationSeconds,
  targetSeconds,
  wordsShown,
  wordsHit,
  timingRatio = 0,
  completed,
  practiceMode = false,
}) {
  const safeTarget = Math.max(1, targetSeconds);
  const safeDuration = Math.max(0, durationSeconds);

  // How much of the allotted time was actually used (max 100%).
  const durationRatio = Math.min(1, safeDuration / safeTarget);

  // How many of the shown words got a reaction (max 100%).
  const hitRatio = wordsShown > 0 ? Math.min(1, wordsHit / wordsShown) : 0;

  // How many of those hits landed on the beat (max 100%).
  const safeTimingRatio = Math.max(0, Math.min(1, timingRatio || 0));

  const raw =
    durationRatio * SCORE_WEIGHTS.duration +
    hitRatio * SCORE_WEIGHTS.hits +
    safeTimingRatio * SCORE_WEIGHTS.timing +
    (completed ? SCORE_WEIGHTS.completion : 0) +
    (practiceMode ? 0 : SCORE_WEIGHTS.recording);

  let score = Math.round(raw);

  // Practice runs cannot reach the top tier.
  if (practiceMode) score = Math.min(score, PRACTICE_SCORE_CAP);

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    durationRatio,
    hitRatio,
    timingRatio: safeTimingRatio,
    completed,
    practiceMode,
  };
}

/** Builds the compact share payload encoded in the share link. */
export function buildSharePayload(result) {
  return {
    s: result.score,
    d: Math.round(result.durationSeconds),
    w: result.wordsHit,
    t: result.wordsShown,
    b: result.beatId ?? '',
    c: result.completed ? 1 : 0,
    // How many of the hits landed on the beat. Older links lack this key,
    // so it is optional on the way back in.
    p: result.perfectHits ?? 0,
  };
}

/** Compact, URL-safe encoding of a share payload. */
export function encodeSharePayload(payload) {
  const json = JSON.stringify(payload);
  // btoa is latin1-only; encodeURIComponent + unescape handles the unicode case.
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeSharePayload(encoded) {
  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}
