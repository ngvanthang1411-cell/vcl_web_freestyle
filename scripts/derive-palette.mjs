/**
 * Derive and verify the VCL palette.
 *
 * Prints the derived ramps and surfaces, then checks every colour/text
 * pairing against WCAG AA. Finally it parses src/theme.css and compares the
 * committed token values against the derivation, so the token file can never
 * drift away without the script noticing.
 *
 * The values it prints are the ones committed to src/theme.css — if the logo
 * changes, re-run this and update the theme file to match.
 *
 * Usage: node scripts/derive-palette.mjs   (npm run palette)
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANCHORS,
  CONTENT,
  LOGO_ORANGE,
  LOGO_KEYLINE,
  RAMPS,
  STATES,
  SURFACES,
  hex,
  hsl,
  hueGap,
  ratio,
} from './lib/palette-core.mjs';

const __dirname = dirname(dirname(fileURLToPath(import.meta.url)));
const THEME = resolve(__dirname, 'src', 'theme.css');

const surfaceKeys = Object.keys(SURFACES);
const contentInverse = CONTENT['content-inverse'];

let failures = 0;

console.log('VCL palette derivation');
console.log('='.repeat(76));
console.log('');
console.log('ANCHORS — the sunset sweep');
console.log('  logo orange :', hex(LOGO_ORANGE), ' rgb(' + LOGO_ORANGE.join(',') + ')');
console.log('  logo keyline:', hex(LOGO_KEYLINE));
for (const [name, c] of Object.entries(ANCHORS)) {
  const x = hsl(c);
  console.log(
    `  ${name.padEnd(11)}${hex(c)}  h${String(x.h).padStart(3)} s${String(x.s).padStart(3)}% l${String(x.l).padStart(3)}%`,
  );
}
const hues = Object.values(ANCHORS).map((c) => hsl(c).h);
console.log(
  `  hue gaps    : ${hueGap(hues[0], hues[1])}° orange→pink, ${hueGap(hues[1], hues[2])}° pink→purple — one family`,
);

console.log('');
console.log('RAMP');
for (const [family, ramp] of Object.entries(RAMPS)) {
  for (const [step, c] of Object.entries(ramp)) {
    const x = hsl(c);
    console.log(
      `  ${`${family}-${step}`.padEnd(22)}${hex(c)}  ${c.map((v) => Math.round(v)).join(',').padEnd(13)}h${x.h} s${x.s}% l${x.l}%`,
    );
  }
}

console.log('');
console.log('SURFACES');
for (const [name, c] of Object.entries(SURFACES)) {
  console.log(`  ${name.padEnd(22)}${hex(c)}  rgb(${c.join(',')})`);
}
console.log('');
console.log('CONTENT');
for (const [name, c] of Object.entries(CONTENT)) {
  console.log(`  ${name.padEnd(22)}${hex(c)}  rgb(${c.join(',')})`);
}
console.log('');
console.log('STATES');
for (const [name, c] of Object.entries(STATES)) {
  console.log(`  ${name.padEnd(22)}${hex(c)}  rgb(${c.join(',')})`);
}

/* ------------------------------------------------------------ AA checks */

console.log('');
console.log('CONTRAST — accent steps as text on every surface (need >= 4.5)');
console.log('  (deepest / deep / muted are fill-only; base / light / lighter carry text)');
for (const [family, ramp] of Object.entries(RAMPS)) {
  for (const [step, c] of Object.entries(ramp)) {
    const fillOnly = step === 'deepest' || step === 'deep' || step === 'muted';
    const ratios = surfaceKeys.map((k) => ratio(c, SURFACES[k]));
    const min = Math.min(...ratios);
    const ok = min >= 4.5;
    const verdict = fillOnly ? (min >= 3 ? 'fill' : 'LOW') : ok ? 'AA' : 'FAIL';
    if (!fillOnly && !ok) failures += 1;
    console.log(
      `  ${`${family}-${step}`.padEnd(22)}${ratios.map((r) => r.toFixed(2)).join(' / ')}   ${verdict}`,
    );
  }
}

console.log('');
console.log('CONTRAST — content steps on every surface (need >= 4.5)');
for (const [name, c] of Object.entries(CONTENT)) {
  if (name === 'content-inverse') continue;
  const ratios = surfaceKeys.map((k) => ratio(c, SURFACES[k]));
  const min = Math.min(...ratios);
  const ok = min >= 4.5;
  if (!ok) failures += 1;
  console.log(
    `  ${name.padEnd(22)}${ratios.map((r) => r.toFixed(2)).join(' / ')}   ${ok ? 'AA' : 'FAIL'}`,
  );
}

console.log('');
console.log('CONTRAST — states as text on every surface (need >= 4.5)');
for (const [name, c] of Object.entries(STATES)) {
  const ratios = surfaceKeys.map((k) => ratio(c, SURFACES[k]));
  const min = Math.min(...ratios);
  const ok = min >= 4.5;
  if (!ok) failures += 1;
  console.log(
    `  ${name.padEnd(22)}${ratios.map((r) => r.toFixed(2)).join(' / ')}   ${ok ? 'AA' : 'FAIL'}`,
  );
}

console.log('');
console.log('CONTRAST — inverse text on each accent base (need >= 4.5)');
for (const [family, ramp] of Object.entries(RAMPS)) {
  const r = ratio(contentInverse, ramp.base);
  const ok = r >= 4.5;
  if (!ok) failures += 1;
  console.log(`  ${`${family}-base`.padEnd(22)}${r.toFixed(2)}   ${ok ? 'PASS' : 'FAIL'}`);
}

/* ------------------------------------------------- drift against the file */

function readCommitted() {
  let css;
  try {
    css = readFileSync(THEME, 'utf8');
  } catch {
    return null;
  }
  const found = new Map();
  for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*;/g)) {
    found.set(m[1], [Number(m[2]), Number(m[3]), Number(m[4])]);
  }
  return found.size ? found : null;
}

console.log('');
console.log('DRIFT — committed theme.css vs this derivation');
const committed = readCommitted();
if (!committed) {
  console.log('  (theme.css not found or no colour tokens parsed)');
} else {
  const expected = new Map();
  for (const [family, ramp] of Object.entries(RAMPS)) {
    for (const [step, c] of Object.entries(ramp)) {
      expected.set(`${family}${step === 'base' ? '' : `-${step}`}`, c);
    }
  }
  for (const [name, c] of Object.entries(SURFACES)) expected.set(name, c);
  for (const [name, c] of Object.entries(CONTENT)) expected.set(name, c);
  for (const [name, c] of Object.entries(STATES)) expected.set(name, c);

  let drift = 0;
  for (const [name, c] of expected) {
    const got = committed.get(name);
    if (!got) {
      console.log(`  ${name.padEnd(22)}MISSING in theme.css`);
      drift += 1;
      continue;
    }
    if (!got.every((v, i) => Math.abs(v - c[i]) <= 1)) {
      console.log(
        `  ${name.padEnd(22)}${hex(got)} != ${hex(c)}  <-- DRIFT`,
      );
      drift += 1;
    }
  }
  if (drift === 0) {
    console.log(`  all ${expected.size} tokens match the derivation`);
  } else {
    failures += drift;
  }
}

console.log('');
console.log(failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
