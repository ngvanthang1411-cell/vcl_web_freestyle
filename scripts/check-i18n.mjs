/**
 * Translation parity check.
 *
 * Verifies that every key present in English also exists in Vietnamese, and
 * that no key is orphaned. A missing key silently falls back to English, which
 * is easy to miss by eye — this makes it a hard failure.
 *
 * Usage: node scripts/check-i18n.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, '..', 'src', 'i18n', 'translations.js'), 'utf8');

// Extract the two locale blocks by name.
function extractBlock(locale) {
  const marker = `  ${locale}: {`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Locale block "${locale}" not found`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let i = bodyStart;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = source.slice(bodyStart, i + 1);

  const keys = new Set();
  // Top-level entries are quoted keys at a consistent indent.
  const re = /^\s{4}'([^']+)':/gm;
  let m;
  while ((m = re.exec(body)) !== null) keys.add(m[1]);
  return { keys, body };
}

const en = extractBlock('en');
const vi = extractBlock('vi');

const missingInVi = [...en.keys].filter((k) => !vi.keys.has(k));
const extraInVi = [...vi.keys].filter((k) => !en.keys.has(k));

let failures = 0;

if (missingInVi.length) {
  failures += 1;
  console.error(`\nMissing ${missingInVi.length} key(s) in 'vi':`);
  missingInVi.forEach((k) => console.error(`  - ${k}`));
}

if (extraInVi.length) {
  failures += 1;
  console.error(`\nOrphaned ${extraInVi.length} key(s) in 'vi' (not in 'en'):`);
  extraInVi.forEach((k) => console.error(`  - ${k}`));
}

// Every locale must define the same interpolation placeholders for a key.
function placeholders(body, key) {
  const re = new RegExp(`'${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':\\s*'([^']*)'`, 'm');
  const match = body.match(re);
  if (!match) return null;
  return new Set((match[1].match(/\{(\w+)\}/g) || []).map((p) => p.slice(1, -1)));
}

const placeholderMismatches = [];
for (const key of en.keys) {
  if (!vi.keys.has(key)) continue;
  const enPh = placeholders(en.body, key);
  const viPh = placeholders(vi.body, key);
  if (!enPh || !viPh) continue;
  if (enPh.size !== viPh.size || [...enPh].some((p) => !viPh.has(p))) {
    placeholderMismatches.push(
      `${key}: en{${[...enPh].join(',')}} vs vi{${[...viPh].join(',')}}`,
    );
  }
}

if (placeholderMismatches.length) {
  failures += 1;
  console.error(`\nInterpolation placeholder mismatch in ${placeholderMismatches.length} key(s):`);
  placeholderMismatches.forEach((m) => console.error(`  - ${m}`));
}

// The Vietnamese word bank must exist and be non-trivial.
const wordsSource = readFileSync(resolve(__dirname, '..', 'src', 'data', 'words.js'), 'utf8');
for (const locale of ['en', 'vi']) {
  const re = new RegExp(`\\b${locale}:\\s*\\[([\\s\\S]*?)\\]`);
  const match = wordsSource.match(re);
  if (!match) {
    failures += 1;
    console.error(`\nWord bank missing for locale "${locale}"`);
    continue;
  }
  const count = (match[1].match(/'/g) || []).length / 2;
  if (count < 30) {
    failures += 1;
    console.error(`\nWord bank for "${locale}" has only ${count} words`);
  } else {
    console.log(`ok    word bank "${locale}": ${count} words`);
  }
}

// Every beat must have a mood in both languages.
const beatsSource = readFileSync(resolve(__dirname, '..', 'src', 'data', 'beats.js'), 'utf8');
const beatBlocks = beatsSource.split(/\n  \{\n/).slice(1);
for (const block of beatBlocks) {
  const id = block.match(/id:\s*'([^']+)'/)?.[1];
  if (!id) continue;
  for (const locale of ['en', 'vi']) {
    if (!new RegExp(`${locale}:\\s*'`).test(block)) {
      failures += 1;
      console.error(`Beat "${id}" is missing a "${locale}" mood`);
    }
  }
}
console.log(`ok    ${beatBlocks.length} beats have moods in both languages`);

console.log(`\nen: ${en.keys.size} keys | vi: ${vi.keys.size} keys`);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All i18n checks passed.');
