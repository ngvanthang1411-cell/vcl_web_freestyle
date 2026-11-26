import fallbackRhymeBank from '../data/rhymeBank.json';
import { WORD_BANK } from '../data/words';
import { isWordSafe, loadPublicBannedWords } from './contentFilter';

/**
 * VCL Freestyle Rhyme Engine (Kho vần VCL v0 — 3.850 từ OK · 157 ổ vần).
 *
 * Loads live data from `/data/rhyme-bank.json` (in `public/data/`) at startup,
 * with the bundled copy as instant fallback for SSR and offline sessions.
 *
 * Rules enforced from spec:
 *  - Only draws words with Duyệt = OK & passing Từ chặn.
 *  - Filters nests by difficulty level: 'easy' (Dễ), 'medium' (Vừa), 'hard' (Khó).
 *  - Groups every 2 bars into the same rhyme nest (Ổ vần).
 *  - Two words in a rhyme pair never share the same final syllable (Tiếng cuối).
 *  - No word is ever repeated within a single round.
 *  - Supports Flow modes:
 *      + 'beat4'  (Phách 4):     1 word/bar, drops on beat 4 (beatInBar = 3)
 *      + 'beat24' (Phách 2 & 4): 2 words/bar, drops on beat 2 & 4 (beatInBar = 1, 3)
 *  - Supports Solo and Battle (2 players alternating every 2 bars).
 */

export const DIFFICULTY_MAP = {
  easy: { code: 0, vi: 'Dễ', en: 'Easy' },
  medium: { code: 1, vi: 'Vừa', en: 'Medium' },
  hard: { code: 2, vi: 'Khó', en: 'Hard' },
};

export const FLOW_MODES = {
  beat4: { id: 'beat4', beatsInBar: [3] },
  beat24: { id: 'beat24', beatsInBar: [1, 3] },
};

let activeVersion = fallbackRhymeBank.version || 'VCL v0';
let NESTS_BY_LEVEL = { 0: [], 1: [], 2: [] };
let TOTAL_SAFE_WORDS = 0;

function indexRhymeBank(bank) {
  const nextByLevel = { 0: [], 1: [], 2: [] };
  let total = 0;

  for (const [nestName, data] of Object.entries(bank?.nests || {})) {
    const safeItems = (data.items || [])
      .filter(([word]) => isWordSafe(word))
      .map(([word, lastSyllable, code]) => ({ word, lastSyllable, code, nest: nestName }));

    if (safeItems.length < 2) continue;

    const uniqueEndings = new Set(safeItems.map((i) => i.lastSyllable));
    if (uniqueEndings.size < 2) continue;

    total += safeItems.length;
    const lv = data.lv ?? 0;
    if (!nextByLevel[lv]) nextByLevel[lv] = [];
    nextByLevel[lv].push({
      name: nestName,
      level: lv,
      items: safeItems,
      uniqueEndings: uniqueEndings.size,
    });
  }

  if (total > 0) {
    NESTS_BY_LEVEL = nextByLevel;
    TOTAL_SAFE_WORDS = total;
    activeVersion = bank?.version || 'VCL v0';
  }
}

// Initial synchronous index from fallback so SSR and instant first paint work
indexRhymeBank(fallbackRhymeBank);

/**
 * Fetches `/data/banned-words.json` and `/data/rhyme-bank.json` from `public/data/`
 * so edits to `public/data/` take effect immediately at runtime.
 */
export async function loadPublicRhymeBank() {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return getRhymeBankStats();
  await loadPublicBannedWords();
  try {
    const res = await fetch('/data/rhyme-bank.json', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.nests) {
        indexRhymeBank(data);
      }
    }
  } catch {
    // Keep bundled fallback
  }
  return getRhymeBankStats();
}

export function getRhymeBankStats() {
  return {
    version: activeVersion,
    totalOk: TOTAL_SAFE_WORDS || fallbackRhymeBank.totalOk || 0,
    totalNests:
      NESTS_BY_LEVEL[0].length + NESTS_BY_LEVEL[1].length + NESTS_BY_LEVEL[2].length,
    byLevel: {
      easy: NESTS_BY_LEVEL[0].reduce((s, n) => s + n.items.length, 0),
      medium: NESTS_BY_LEVEL[1].reduce((s, n) => s + n.items.length, 0),
      hard: NESTS_BY_LEVEL[2].reduce((s, n) => s + n.items.length, 0),
    },
  };
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function drawFromNest(nest, count, usedWords) {
  const available = shuffle(nest.items.filter((item) => !usedWords.has(item.word)));
  if (available.length < count) return null;

  const picked = [];
  const usedEndings = new Set();

  for (const item of available) {
    if (picked.length >= count) break;
    if (usedEndings.has(item.lastSyllable)) continue;
    picked.push(item);
    usedEndings.add(item.lastSyllable);
  }

  if (picked.length < count) {
    for (const item of available) {
      if (picked.length >= count) break;
      if (picked.some((p) => p.word === item.word)) continue;
      const prev = picked[picked.length - 1];
      if (prev && prev.lastSyllable === item.lastSyllable) continue;
      picked.push(item);
    }
  }

  if (picked.length < count) return null;
  for (const item of picked) usedWords.add(item.word);
  return picked;
}

export function generateRoundWordPlan({
  barCount = 16,
  difficulty = 'easy',
  flow = 'beat4',
  locale = 'vi',
  introBeats = 16,
  battleMode = false,
}) {
  const safeBars = Math.max(4, Math.min(128, Math.round(barCount) || 16));
  const flowDef = FLOW_MODES[flow] ?? FLOW_MODES.beat4;
  const beatsPerBarDrop = flowDef.beatsInBar;
  const pairCount = Math.ceil(safeBars / 2);

  const plan = [];
  const usedWords = new Set();

  if (locale === 'vi') {
    const levelCode = DIFFICULTY_MAP[difficulty]?.code ?? 0;
    const primaryPool = shuffle(NESTS_BY_LEVEL[levelCode] || []);
    const fallbackPool = shuffle([
      ...(NESTS_BY_LEVEL[0] || []),
      ...(NESTS_BY_LEVEL[1] || []),
      ...(NESTS_BY_LEVEL[2] || []),
    ]);

    let poolIdx = 0;
    let lastNestName = null;

    for (let pairIdx = 0; pairIdx < pairCount; pairIdx += 1) {
      const barsInPair = Math.min(2, safeBars - pairIdx * 2);
      const needed = barsInPair * beatsPerBarDrop.length;

      let picked = null;
      for (let tries = 0; tries < primaryPool.length; tries += 1) {
        const candidate = primaryPool[(poolIdx + tries) % primaryPool.length];
        if (candidate.name === lastNestName && primaryPool.length > 1) continue;
        const result = drawFromNest(candidate, needed, usedWords);
        if (result) {
          picked = result;
          lastNestName = candidate.name;
          poolIdx = (poolIdx + tries + 1) % primaryPool.length;
          break;
        }
      }

      if (!picked) {
        for (const candidate of fallbackPool) {
          if (candidate.name === lastNestName) continue;
          const result = drawFromNest(candidate, needed, usedWords);
          if (result) {
            picked = result;
            lastNestName = candidate.name;
            break;
          }
        }
      }

      if (!picked) break;

      let pickCursor = 0;
      const pairTone = pairIdx % 2 === 0 ? 'lime' : 'orange';
      const playerIndex = battleMode ? (pairIdx % 2) + 1 : 1;

      for (let b = 0; b < barsInPair; b += 1) {
        const barIndex = pairIdx * 2 + b;
        for (const beatInBar of beatsPerBarDrop) {
          const item = picked[pickCursor++];
          if (!item) continue;
          const hitBeat = introBeats + barIndex * 4 + beatInBar;
          const order = plan.length + 1;
          plan.push({
            id: `w-${order}-${item.code}`,
            order,
            code: item.code,
            text: item.word,
            nest: item.nest,
            lastSyllable: item.lastSyllable,
            barIndex,
            beatInBar,
            hitBeat,
            appearBeat: Math.max(0, hitBeat - 4),
            playerIndex,
            tone: pairTone,
            hit: false,
            heardText: '',
          });
        }
      }
    }

    return plan;
  }

  const enPool = shuffle(Array.from(new Set(WORD_BANK.en)));
  let enCursor = 0;

  for (let barIndex = 0; barIndex < safeBars; barIndex += 1) {
    const pairIdx = Math.floor(barIndex / 2);
    const pairTone = pairIdx % 2 === 0 ? 'lime' : 'orange';
    const playerIndex = battleMode ? (pairIdx % 2) + 1 : 1;

    for (const beatInBar of beatsPerBarDrop) {
      const word = enPool[enCursor % enPool.length];
      enCursor += 1;
      const hitBeat = introBeats + barIndex * 4 + beatInBar;
      const order = plan.length + 1;
      plan.push({
        id: `w-${order}-en`,
        order,
        code: `EN${String(order).padStart(3, '0')}`,
        text: word,
        nest: '',
        lastSyllable: word.toLowerCase(),
        barIndex,
        beatInBar,
        hitBeat,
        appearBeat: Math.max(0, hitBeat - 4),
        playerIndex,
        tone: pairTone,
        hit: false,
        heardText: '',
      });
    }
  }

  return plan;
}

export function resolveRoundBars(barSetting, beat) {
  if (barSetting === 'full') {
    if (beat?.totalBars && beat.totalBars >= 8) return beat.totalBars;
    if (beat?.duration && beat?.bpm) {
      const offset = Math.max(0, beat.bar1Offset || 0);
      const usable = Math.max(8, beat.duration - offset);
      return Math.max(8, Math.floor((usable * beat.bpm) / 240));
    }
    return 32;
  }
  const n = Number(barSetting);
  return Number.isFinite(n) && n >= 4 ? n : 16;
}
