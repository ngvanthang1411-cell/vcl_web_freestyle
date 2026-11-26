/**
 * Local stats storage and grade helpers.
 *
 * Persists past freestyle runs in localStorage on this device only so the
 * trophy leaderboard and high-score podium work offline with zero backend.
 */

const STORAGE_KEY = 'ygb_runs_v1';
const MAX_RUNS = 40;

export function getGrade(score) {
  if (score >= 88) return 'S';
  if (score >= 74) return 'A';
  if (score >= 56) return 'B';
  if (score >= 35) return 'C';
  return 'D';
}

export function loadRuns() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRun(entry) {
  if (typeof window === 'undefined') return [];
  const next = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      score: entry.score ?? 0,
      grade: getGrade(entry.score ?? 0),
      beatId: entry.beatId ?? null,
      beatTitle: entry.beatTitle ?? 'Freestyle',
      handle: entry.handle || '',
      wordsHit: entry.wordsHit ?? 0,
      wordsShown: entry.wordsShown ?? 0,
      perfectHits: entry.perfectHits ?? 0,
      durationSeconds: Math.round(entry.durationSeconds ?? 0),
      practiceMode: Boolean(entry.practiceMode),
    },
    ...loadRuns(),
  ].slice(0, MAX_RUNS);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / privacy mode errors.
  }
  return next;
}

export function clearRuns() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}
