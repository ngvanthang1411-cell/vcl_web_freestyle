/**
 * Render smoke test.
 *
 * Server-renders every screen with mock props and asserts the output contains
 * the expected landmarks. This catches import errors, bad JSX, undefined
 * references and crashes during render — without needing a browser.
 *
 * Usage: node scripts/smoke.mjs
 */
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
// React and the server renderer are imported natively: Vite's SSR transform
// chokes on the CommonJS build of react-dom/server.
import React from 'react';
import { renderToString } from 'react-dom/server';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const server = await createServer({
  root,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});

let failures = 0;

async function check(label, modulePath, exportName, props, expectations) {
  try {
    const mod = await server.ssrLoadModule(modulePath);
    const Component = mod[exportName];

    if (!Component) throw new Error(`Export "${exportName}" not found in ${modulePath}`);

    // Components read translations from context, so they must be wrapped in the
    // provider. Render in both locales to prove the wiring works.
    const { LanguageProvider } = await server.ssrLoadModule('/src/i18n/LanguageContext.jsx');

    const html = renderToString(
      React.createElement(
        LanguageProvider,
        { initialLocale: 'en' },
        React.createElement(Component, props),
      ),
    );
    // React inserts a comment separator between adjacent text nodes
    // ("92<!-- --> BPM"), so strip those before matching.
    const text = html.replace(/<!-- -->/g, '');

    const missing = expectations.filter((needle) => !text.includes(needle));
    if (missing.length) {
      failures += 1;
      console.error(`FAIL  ${label}`);
      missing.forEach((m) => console.error(`        missing: ${JSON.stringify(m)}`));
      return;
    }
    console.log(`ok    ${label}  (${html.length} bytes)`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${label}`);
    console.error(`        ${error?.stack || error}`);
  }
}

/* ------------------------------------------------------------- fixtures */

const mockPlayer = {
  isPlaying: false,
  isMuted: false,
  volume: 0.75,
  currentTime: 0,
  duration: 21.4,
  energy: 0.3,
  load: () => {},
  play: async () => true,
  pause: () => {},
  pauseOnly: () => {},
  toggleLoop: () => {},
  seek: () => {},
  setVolume: () => {},
  setIsMuted: () => {},
  stopMeter: () => {},
};

const mockRecorder = {
  state: 'idle',
  error: null,
  elapsed: 0,
  previewUrl: null,
  mediaType: '',
  stream: null,
  hasVideo: false,
  prepare: async () => true,
  start: () => true,
  stop: async () => null,
  reset: () => {},
};

const settings = {
  duration: 60,
  wordInterval: 4,
  wordMode: 'random',
  burnMode: false,
  video: false,
};

const result = {
  score: 72,
  durationSeconds: 58,
  targetSeconds: 60,
  wordsShown: 14,
  wordsHit: 11,
  wordsMissed: 3,
  completed: true,
  practiceMode: false,
  blob: null,
  video: false,
  beatId: 'neon-nightrun',
  beatTitle: 'Neon Nightrun',
  mediaType: '',
};

const beat = {
  id: 'neon-nightrun',
  title: 'Neon Nightrun',
  src: '/beats/neon-nightrun.wav',
  bpm: 92,
  duration: 21.4,
  mood: 'Driving, head-nod street anthem',
};

/* --------------------------------------------------------------- checks */

await check(
  'LandingScreen',
  '/src/screens/LandingScreen.jsx',
  'default',
  { onStart: () => {}, onOpenBeats: () => {}, beatCount: 6, supported: true },
  // The landing screen is a title, one line of copy and a single action.
  ['You Got', 'Bars?', 'Start Freestyle'],
);

await check(
  'BeatSelectScreen',
  '/src/screens/BeatSelectScreen.jsx',
  'default',
  {
    beats: [beat],
    player: mockPlayer,
    selectedBeat: null,
    onSelect: () => {},
    onRandomize: () => {},
    onBack: () => {},
  },
  // The preview control is an icon button now, so assert its accessible label
  // rather than visible text.
  ['Neon Nightrun', '92 BPM', 'Play preview of Neon Nightrun', 'Select', 'Random beat'],
);

await check(
  'FreestyleScreen',
  '/src/screens/FreestyleScreen.jsx',
  'default',
  {
    beat,
    player: mockPlayer,
    recorder: mockRecorder,
    settings,
    onSettingsChange: () => {},
    onComplete: () => {},
    onExit: () => {},
    unsupported: null,
  },
  // The screen leads with the mic badge, so the title text is gone.
  ['On the mic', 'Neon Nightrun', '92 BPM', 'Start session', 'Word interval', 'Session progress'],
);

await check(
  'ResultsScreen',
  '/src/screens/ResultsScreen.jsx',
  'default',
  { result, onRestart: () => {}, onChangeBeat: () => {} },
  ['Your', 'take', 'Download audio', 'Copy share link'],
);

await check(
  'HypeMeter',
  '/src/components/HypeMeter.jsx',
  'default',
  { score: 88 },
  ['OUT OF 100', 'Legend'],
);

await check(
  'WordGenerator',
  '/src/components/WordGenerator.jsx',
  'default',
  {
    running: false,
    intervalMs: 4000,
    mode: 'random',
    burnMode: false,
    onWordShown: () => {},
    onWordHit: () => {},
    onWordMissed: () => {},
  },
  // The generator is now the lime word card plus the orange queue. Neither
  // carries a visible label — the colour does that work — so assert on the
  // idle hint instead.
  ['The challenge starts when the beat does.'],
);

await check(
  'BeatPlayer',
  '/src/components/BeatPlayer.jsx',
  'default',
  { beat, player: mockPlayer, showSeek: true },
  ['Neon Nightrun', '92 BPM', 'Play'],
);

await check(
  'App',
  '/src/App.jsx',
  'default',
  {},
  ['You Got', 'Bars?', 'Start Freestyle'],
);

/* -------------------------------------------------- Vietnamese rendering */

{
  const { LanguageProvider } = await server.ssrLoadModule('/src/i18n/LanguageContext.jsx');
  const landing = await server.ssrLoadModule('/src/screens/LandingScreen.jsx');
  const results = await server.ssrLoadModule('/src/screens/ResultsScreen.jsx');
  const hype = await server.ssrLoadModule('/src/components/HypeMeter.jsx');

  const viLanding = renderToString(
    React.createElement(
      LanguageProvider,
      { initialLocale: 'vi' },
      React.createElement(landing.default, {
        onStart: () => {},
        onOpenBeats: () => {},
        beatCount: 6,
        supported: true,
      }),
    ),
  ).replace(/<!-- -->/g, '');

  const viExpectations = ['Bắt đầu Freestyle'];
  const viMissing = viExpectations.filter((n) => !viLanding.includes(n));
  if (viMissing.length) {
    failures += 1;
    console.error('FAIL  LandingScreen [vi]');
    viMissing.forEach((m) => console.error(`        missing: ${JSON.stringify(m)}`));
  } else {
    console.log('ok    LandingScreen [vi]');
  }

  const viResults = renderToString(
    React.createElement(
      LanguageProvider,
      { initialLocale: 'vi' },
      React.createElement(results.default, {
        result: {
          score: 72, durationSeconds: 58, targetSeconds: 60, wordsShown: 14,
          wordsHit: 11, wordsMissed: 3, completed: true, practiceMode: false,
          blob: null, video: false, beatId: 'neon-nightrun',
          beatTitle: 'Neon Nightrun', mediaType: '',
        },
        onRestart: () => {},
        onChangeBeat: () => {},
      }),
    ),
  ).replace(/<!-- -->/g, '');

  const viResultExpectations = ['Sao chép link chia sẻ', 'Tải âm thanh'];
  const viResultMissing = viResultExpectations.filter((n) => !viResults.includes(n));
  if (viResultMissing.length) {
    failures += 1;
    console.error('FAIL  ResultsScreen [vi]');
    viResultMissing.forEach((m) => console.error(`        missing: ${JSON.stringify(m)}`));
  } else {
    console.log('ok    ResultsScreen [vi]');
  }

  // The Hype tier label must be localised, not left in English.
  const viHype = renderToString(
    React.createElement(
      LanguageProvider,
      { initialLocale: 'vi' },
      React.createElement(hype.default, { score: 88 }),
    ),
  ).replace(/<!-- -->/g, '');
  if (!viHype.includes('Huyền thoại')) {
    failures += 1;
    console.error('FAIL  HypeMeter [vi] — tier label was not translated');
  } else {
    console.log('ok    HypeMeter [vi]');
  }
}

/* --------------------------------------------------------- pure modules */

// Exercise the scoring and share-encoding helpers directly.
const scoring = await server.ssrLoadModule('/src/lib/scoring.js');

const maxed = scoring.computeHypeScore({
  durationSeconds: 60,
  targetSeconds: 60,
  wordsShown: 15,
  wordsHit: 15,
  timingRatio: 1,
  completed: true,
  practiceMode: false,
});
if (maxed.score !== 100) {
  failures += 1;
  console.error(`FAIL  scoring: a perfect run should score 100, got ${maxed.score}`);
} else {
  console.log('ok    scoring: perfect run scores 100');
}

const zeroed = scoring.computeHypeScore({
  durationSeconds: 0,
  targetSeconds: 60,
  wordsShown: 0,
  wordsHit: 0,
  completed: false,
  practiceMode: true,
});
if (zeroed.score !== 0) {
  failures += 1;
  console.error(`FAIL  scoring: an empty run should score 0, got ${zeroed.score}`);
} else {
  console.log('ok    scoring: empty run scores 0');
}

const encoded = scoring.encodeSharePayload({ s: 72, d: 58, w: 11, t: 14, b: 'x', c: 1 });
const roundTripped = scoring.decodeSharePayload(encoded);
if (
  roundTripped.s !== 72 ||
  roundTripped.d !== 58 ||
  roundTripped.w !== 11 ||
  roundTripped.t !== 14 ||
  roundTripped.b !== 'x' ||
  roundTripped.c !== 1
) {
  failures += 1;
  console.error(`FAIL  scoring: share payload round-trip failed — ${JSON.stringify(roundTripped)}`);
} else {
  console.log('ok    scoring: share payload round-trips');
}

if (scoring.decodeSharePayload('not-valid-base64!!') !== null) {
  failures += 1;
  console.error('FAIL  scoring: invalid share payload should decode to null');
} else {
  console.log('ok    scoring: invalid share payload decodes to null');
}

/* --------------------------------------- beat accuracy in the score */

// A run where every hit landed off the beat must score strictly lower than
// the same run with every hit on the beat.
const offBeat = scoring.computeHypeScore({
  durationSeconds: 60,
  targetSeconds: 60,
  wordsShown: 15,
  wordsHit: 15,
  timingRatio: 0,
  completed: true,
  practiceMode: false,
});
const onBeat = scoring.computeHypeScore({
  durationSeconds: 60,
  targetSeconds: 60,
  wordsShown: 15,
  wordsHit: 15,
  timingRatio: 1,
  completed: true,
  practiceMode: false,
});
if (!(offBeat.score < onBeat.score)) {
  failures += 1;
  console.error(
    `FAIL  scoring: on-beat runs must outscore off-beat runs (${onBeat.score} vs ${offBeat.score})`,
  );
} else {
  console.log(`ok    scoring: on-beat ${onBeat.score} beats off-beat ${offBeat.score}`);
}

// The point budget must add up to exactly 100, so a flawless run is not
// silently clamped.
const weights = scoring.SCORE_WEIGHTS;
const total = Object.values(weights).reduce((a, b) => a + b, 0);
if (total !== 100) {
  failures += 1;
  console.error(`FAIL  scoring: the point budget must total 100, got ${total}`);
} else {
  console.log('ok    scoring: the point budget totals 100');
}

// Practice mode cannot reach the top tier, even with a flawless performance.
const practiceBest = scoring.computeHypeScore({
  durationSeconds: 60,
  targetSeconds: 60,
  wordsShown: 15,
  wordsHit: 15,
  timingRatio: 1,
  completed: true,
  practiceMode: true,
});
if (practiceBest.score > scoring.PRACTICE_SCORE_CAP) {
  failures += 1;
  console.error(
    `FAIL  scoring: practice mode must cap at ${scoring.PRACTICE_SCORE_CAP}, got ${practiceBest.score}`,
  );
} else {
  console.log(`ok    scoring: practice mode caps at ${practiceBest.score}`);
}

// A share link from before the on-beat feature has no 'p' key. It must still
// decode, and the reader must treat the missing field as zero.
const legacy = scoring.decodeSharePayload(
  scoring.encodeSharePayload({ s: 72, d: 58, w: 11, t: 14, b: 'x', c: 1 }),
);
if (legacy.p !== undefined) {
  failures += 1;
  console.error(`FAIL  scoring: a legacy payload should have no 'p' key, got ${legacy.p}`);
} else if ((legacy.p ?? 0) !== 0) {
  failures += 1;
  console.error('FAIL  scoring: a legacy payload should read as zero on-beat hits');
} else {
  console.log('ok    scoring: a legacy payload reads as zero on-beat hits');
}

// Building a payload from a result that has no on-beat count must still emit
// the key, so new links are never missing it.
const built = scoring.buildSharePayload({
  score: 72,
  durationSeconds: 58,
  wordsHit: 11,
  wordsShown: 14,
  beatId: 'x',
  completed: true,
});
if (built.p !== 0) {
  failures += 1;
  console.error(`FAIL  scoring: a built payload should default on-beat hits to 0, got ${built.p}`);
} else {
  console.log('ok    scoring: a built payload always carries the on-beat count');
}

// A payload that does carry 'p' must round-trip it.
const withPerfect = scoring.decodeSharePayload(
  scoring.encodeSharePayload({ s: 88, d: 60, w: 12, t: 12, b: 'x', c: 1, p: 9 }),
);
if (withPerfect.p !== 9) {
  failures += 1;
  console.error(`FAIL  scoring: the on-beat count should round-trip, got ${withPerfect.p}`);
} else {
  console.log('ok    scoring: the on-beat count round-trips');
}

const tiers = [0, 30, 50, 70, 90].map((s) => scoring.getHypeTier(s).label);
console.log(`ok    scoring: tier ladder — ${tiers.join(' → ')}`);

/* -------------------------------------------------------------- cleanup */

await server.close();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
