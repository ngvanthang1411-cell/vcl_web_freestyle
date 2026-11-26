import fallbackBannedRules from '../data/bannedWords.json';

/**
 * Content safety filter backed by the VCL "Từ chặn" sheet.
 *
 * Uses `/data/banned-words.json` from `public/data/` when fetched at runtime
 * (falling back immediately to the bundled copy for SSR/offline use).
 */

let activeBannedRules = Array.isArray(fallbackBannedRules) ? fallbackBannedRules : [];

/**
 * Loads the live banned-words list from `/data/banned-words.json` in `public/data/`.
 */
export async function loadPublicBannedWords() {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return activeBannedRules;
  try {
    const res = await fetch('/data/banned-words.json', { cache: 'no-cache' });
    if (!res.ok) return activeBannedRules;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      activeBannedRules = data;
    }
  } catch {
    // Keep bundled fallback
  }
  return activeBannedRules;
}

function normalizeText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .toLowerCase()
    .replace(/[@_.,!?;:()[\]{}"'“”‘’/\\|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function checkContentSafety(rawText) {
  const norm = normalizeText(rawText);
  if (!norm) return { ok: true };

  const tokens = norm.split(' ');

  for (const rule of activeBannedRules) {
    const term = rule.term;
    if (!term) continue;

    let matched = false;
    if (rule.matchType === 'word') {
      matched = tokens.includes(term);
    } else {
      const padded = ` ${norm} `;
      matched = padded.includes(` ${term} `);
    }

    if (!matched) continue;

    if (Array.isArray(rule.exceptions) && rule.exceptions.length > 0) {
      let stripped = ` ${norm} `;
      for (const exc of rule.exceptions) {
        if (exc && stripped.includes(` ${exc} `)) {
          stripped = stripped.split(` ${exc} `).join(' ');
        }
      }
      const remainingNorm = stripped.replace(/\s+/g, ' ').trim();
      const remainingTokens = remainingNorm ? remainingNorm.split(' ') : [];
      const stillMatched =
        rule.matchType === 'word'
          ? remainingTokens.includes(term)
          : ` ${remainingNorm} `.includes(` ${term} `);
      if (!stillMatched) continue;
    }

    return {
      ok: false,
      matchedTerm: term,
      group: rule.group,
    };
  }

  return { ok: true };
}

export function isWordSafe(word) {
  return checkContentSafety(word).ok;
}
