import { memo, useCallback, useEffect, useRef, useState } from 'react';
import IntroCountdownOverlay from './IntroCountdownOverlay';
import TargetExplosion from './TargetExplosion';
import WordCarousel from './WordCarousel';
import WordPop from './WordPop';
import { DEFAULT_WORD, WORD_BANK, sequentialWords } from '../data/words';
import { useLanguage } from '../i18n/LanguageContext';
import {
  TIMING,
  judgeOffset,
  offsetFromNearestBeat,
  snapToBarBeats,
} from '../lib/beatGrid';

/**
 * Total opening beats before the first word hits the target zone & explodes:
 *  - Beats 0..11: 3 rounds of "1 - 2 - 3 - 4" (1/3, 2/3, 3/3)
 *  - Beats 12..15: "3 - 2 - 1 - GO!"
 *  - Beat 16: First word reaches the hit zone, explodes, and unmounts!
 */
export const INTRO_BEATS = 16;

const QUEUE_LENGTH = 4;

/** Paired rhythm color alternation (lime, orange, orange, lime, lime...) */
function toneForIndex(seq) {
  return Math.floor((seq + 1) / 2) % 2 === 0 ? 'lime' : 'orange';
}

const IDLE_PREVIEW_WORD = {
  id: 'idle-0',
  text: DEFAULT_WORD,
  tone: 'lime',
  hitBeat: 0,
};

/**
 * Beat-Locked Word Engine (Hit Zone -> Explode -> Complete Unmount).
 *
 * Uses a single `requestAnimationFrame` loop computing:
 *   `currentBeat = (audioTime * bpm) / 60`
 * (zero `setInterval`):
 *  - Each word approaches over 2–4 beats before its `hitBeat` (16, 20, 24...).
 *  - The instant `currentBeat >= word.hitBeat`, the word is removed from the
 *    active highway and passed to `<TargetExplosion>` (Framer Motion
 *    `AnimatePresence`) which bursts it (`scale: 1 -> 1.76`, opacity flash,
 *    shockwave rings, 16 radial particles) over ~310ms and unmounts it
 *    completely from the DOM — never holding it inside the hit zone!
 */
const WordGenerator = memo(function WordGenerator({
  running,
  intervalMs,
  mode, // 'random' | 'sequential'
  burnMode,
  audio = null,
  bpm = 0,
  onWordShown,
  onWordHit,
  onWordMissed,
  onStageBurst,
  onIntroComplete,
}) {
  const { locale, t } = useLanguage();
  const [upcoming, setUpcoming] = useState([]);
  const [introBeat, setIntroBeat] = useState(null); // 0..15 during intro, null after
  const [bursts, setBursts] = useState([]); // [{ id, text, tone }] — auto-unmounted after ~320ms
  const [pop, setPop] = useState(null);
  const [flash, setFlash] = useState(null);
  const [sweepKey, setSweepKey] = useState(0);

  // Track the currently hittable word (approaching head or within brief post-impact grace).
  const lastJudgedRef = useRef(null); // { id, text, hitBeat, hit }
  const indexRef = useRef(0);
  const idRef = useRef(0);
  const nextHitBeatRef = useRef(INTRO_BEATS);
  const explodedIdsRef = useRef(new Set());
  const introDoneRef = useRef(false);
  const lastIntroBeatRef = useRef(-1);

  const frontCardRef = useRef(null);
  const logoRef = useRef(null);
  const targetBoxRef = useRef(null);
  const beatDotRefs = useRef([]);
  const queueRef = useRef([]);

  const beatClockRef = useRef({
    currentBeat: 0,
    beatIndex: 0,
    beatPhase: 0,
    beatInBar: 0,
    audioTime: 0,
  });

  const effectiveBpm = bpm > 0 ? bpm : 120;
  // Lock word intervals to whole 4/4 bars (4, 8, 12... beats) so every word
  // explodes dead-on Beat 1 (the heavy kick downbeat) of the bar!
  const intervalBeats = snapToBarBeats(intervalMs / 1000, effectiveBpm);

  const onWordShownRef = useRef(onWordShown);
  onWordShownRef.current = onWordShown;
  const onWordMissedRef = useRef(onWordMissed);
  onWordMissedRef.current = onWordMissed;
  const onStageBurstRef = useRef(onStageBurst);
  onStageBurstRef.current = onStageBurst;
  const onIntroCompleteRef = useRef(onIntroComplete);
  onIntroCompleteRef.current = onIntroComplete;

  const drawWord = useCallback(() => {
    let text;
    if (mode === 'sequential') {
      const bank = sequentialWords(locale);
      text = bank[indexRef.current % bank.length];
      indexRef.current += 1;
    } else {
      const bank = WORD_BANK[locale] ?? WORD_BANK.en;
      text = bank[Math.floor(Math.random() * bank.length)];
    }
    const seq = idRef.current++;
    const hitBeat = nextHitBeatRef.current;
    nextHitBeatRef.current += intervalBeats;
    return {
      id: `w-${seq}`,
      text,
      tone: toneForIndex(seq),
      hitBeat,
      hit: false,
    };
  }, [mode, locale, intervalBeats]);

  const fillQueue = useCallback(() => {
    while (queueRef.current.length < QUEUE_LENGTH) {
      queueRef.current.push(drawWord());
    }
    setUpcoming([...queueRef.current]);
  }, [drawWord]);

  // Reset & pre-populate queue when run starts or word settings change.
  useEffect(() => {
    indexRef.current = 0;
    idRef.current = 0;
    nextHitBeatRef.current = INTRO_BEATS;
    explodedIdsRef.current.clear();
    introDoneRef.current = false;
    lastIntroBeatRef.current = -1;
    lastJudgedRef.current = null;
    queueRef.current = [];
    setFlash(null);
    setPop(null);
    setBursts([]);
    beatClockRef.current = {
      currentBeat: 0,
      beatIndex: 0,
      beatPhase: 0,
      beatInBar: 0,
      audioTime: 0,
    };

    if (running) {
      setIntroBeat(0);
    } else {
      setIntroBeat(null);
    }
    fillQueue();
  }, [running, mode, locale, fillQueue]);

  // Remove burst entry from state once its ~310ms explosion finishes so
  // `<AnimatePresence>` unmounts it cleanly from the DOM.
  const handleBurstDone = useCallback((burstId) => {
    setBursts((prev) => prev.filter((item) => item.id !== burstId));
  }, []);

  // Explode the arriving word STRICTLY ONCE when `currentBeat >= word.hitBeat`,
  // removing it from the highway immediately so it explodes & unmounts cleanly!
  const triggerWordExplosion = useCallback(
    (wordEntry) => {
      if (!wordEntry || explodedIdsRef.current.has(wordEntry.id)) return;
      explodedIdsRef.current.add(wordEntry.id);

      // Flush previous word as missed if it was never hit during its window.
      const prevJudged = lastJudgedRef.current;
      if (prevJudged && !prevJudged.hit) {
        onWordMissedRef.current?.(prevJudged.text);
      }

      // Remove exploded word from the queue immediately (NOT held in the box!).
      if (queueRef.current[0]?.id === wordEntry.id) {
        queueRef.current.shift();
      } else {
        queueRef.current = queueRef.current.filter((w) => w.id !== wordEntry.id);
      }
      fillQueue();

      // Keep a brief grace reference so hitting right on or just after hitBeat still counts.
      lastJudgedRef.current = wordEntry;

      // Spawn the one-shot Framer Motion explode-and-unmount burst right at the Hit Zone.
      setBursts((prev) => [
        ...prev.slice(-2),
        { id: wordEntry.id, text: wordEntry.text, tone: wordEntry.tone },
      ]);
      setSweepKey((k) => k + 1);
      setFlash(null);
      setPop(null);

      onStageBurstRef.current?.();
      onWordShownRef.current?.(wordEntry.text);
    },
    [fillQueue],
  );

  // Master 60/120fps `requestAnimationFrame` Beat Engine (ZERO `setInterval`).
  useEffect(() => {
    if (!running || typeof window === 'undefined') {
      if (logoRef.current) logoRef.current.style.transform = '';
      if (targetBoxRef.current) targetBoxRef.current.style.transform = 'translateX(-50%)';
      return undefined;
    }

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const startedWallMs = performance.now();
    let raf = null;

    const tick = (now) => {
      raf = requestAnimationFrame(tick);

      const audioTime =
        audio && typeof audio.elapsedTime === 'number'
          ? audio.elapsedTime
          : audio && typeof audio.currentTime === 'number'
            ? audio.currentTime
            : Math.max(0, (now - startedWallMs) / 1000);

      const currentBeat = (audioTime * effectiveBpm) / 60;
      const beatIndex = Math.floor(currentBeat);
      const beatPhase = currentBeat - beatIndex;
      const beatInBar = ((beatIndex % 4) + 4) % 4;

      beatClockRef.current.currentBeat = currentBeat;
      beatClockRef.current.beatIndex = beatIndex;
      beatClockRef.current.beatPhase = beatPhase;
      beatClockRef.current.beatInBar = beatInBar;
      beatClockRef.current.audioTime = audioTime;

      // 1) 16-beat opening timeline:
      //    Beats 0..11: 3x "1 - 2 - 3 - 4" (1/3, 2/3, 3/3)
      //    Beats 12..15: "3 - 2 - 1 - GO!"
      if (beatIndex < INTRO_BEATS) {
        if (beatIndex !== lastIntroBeatRef.current) {
          lastIntroBeatRef.current = beatIndex;
          setIntroBeat(beatIndex);
          if (beatIndex === 15) {
            onStageBurstRef.current?.();
          }
        }
      } else if (!introDoneRef.current) {
        introDoneRef.current = true;
        setIntroBeat(null);
        onIntroCompleteRef.current?.();
      }

      // 2) Exact hitBeat impact check (Beat 16+):
      //    As soon as `currentBeat >= head.hitBeat`, explode & unmount the word!
      if (currentBeat >= INTRO_BEATS) {
        const head = queueRef.current[0];
        if (head && currentBeat >= head.hitBeat && !explodedIdsRef.current.has(head.id)) {
          triggerWordExplosion(head);
        }
      }

      // 3) Direct GPU beat-bounce on Logo, 4-Corner Hit Zone, and 4 Beat Dots.
      if (!reduced) {
        const kick = Math.pow(Math.max(0, 1 - beatPhase), 2.5);
        const downbeatBoost = beatInBar === 0 ? 1.28 : 1.0;

        if (logoRef.current) {
          const s = 1 + kick * 0.075 * downbeatBoost;
          const ly = -kick * 3 * downbeatBoost;
          logoRef.current.style.transform = `translate3d(0, ${ly.toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
        }

        if (targetBoxRef.current) {
          const bs = 1 + kick * 0.026 * downbeatBoost;
          targetBoxRef.current.style.transform = `translateX(-50%) scale(${bs.toFixed(4)})`;
          targetBoxRef.current.style.boxShadow = `0 0 ${(14 + kick * 34 * downbeatBoost).toFixed(1)}px rgba(247, 133, 1, ${(0.06 + kick * 0.24 * downbeatBoost).toFixed(3)})`;
        }

        for (let i = 0; i < 4; i += 1) {
          const dot = beatDotRefs.current[i];
          if (!dot) continue;
          const activeDot = i === beatInBar;
          const dotScale = activeDot ? 1 + kick * 0.55 : 0.82;
          dot.style.transform = `scale(${dotScale.toFixed(3)})`;
          dot.style.opacity = activeDot ? '1' : '0.26';
          dot.style.background =
            activeDot && i === 0
              ? '#b8f147'
              : activeDot
                ? '#ff8814'
                : 'rgba(255, 255, 255, 0.35)';
          dot.style.boxShadow = activeDot
            ? i === 0
              ? '0 0 12px rgba(184, 241, 71, 0.85)'
              : '0 0 12px rgba(247, 133, 1, 0.85)'
            : 'none';
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [running, audio, effectiveBpm, triggerWordExplosion]);

  /* ------------------------------------------------------------ the hit */

  const registerHit = useCallback(() => {
    const currentBeat = beatClockRef.current.currentBeat;
    // Allow hitting either the word that JUST exploded (within 0.6 beat grace)
    // or the head word currently climbing into the hit zone.
    const recent = lastJudgedRef.current;
    let target = null;
    if (recent && !recent.hit && currentBeat - recent.hitBeat <= 0.65) {
      target = recent;
    } else if (queueRef.current[0] && !queueRef.current[0].hit) {
      target = queueRef.current[0];
    }

    if (!target || target.hit) return;
    target.hit = true;

    let judgement = TIMING.MISS;
    let offsetMs = 0;

    if (effectiveBpm) {
      offsetMs = offsetFromNearestBeat(beatClockRef.current.audioTime, effectiveBpm);
      judgement = judgeOffset(offsetMs);
    }

    let origin = { x: 0, y: 0 };
    const anchorEl = targetBoxRef.current || frontCardRef.current;
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    if (judgement === TIMING.PERFECT || judgement === TIMING.GOOD) {
      setPop({
        ...origin,
        strength: judgement,
        key: `${Date.now()}-${target.text}`,
      });
      setFlash(judgement);
      onStageBurstRef.current?.();
    } else {
      setFlash('miss');
    }

    onWordHit?.(target.text, {
      onBeat: judgement === TIMING.PERFECT,
      offsetMs,
      judgement,
    });
  }, [effectiveBpm, onWordHit]);

  useEffect(() => {
    if (!running) return undefined;
    const onKeyDown = (event) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      const tag = event.target?.tagName;
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        return;
      }
      event.preventDefault();
      registerHit();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [running, registerHit]);

  return (
    <div className="relative z-10 w-full">
      {/* Centered brand logo + 4-beat visual pulse bar */}
      <div className="flex flex-col items-center pb-1 pt-2">
        <img
          ref={logoRef}
          src="/logo-mark.png"
          alt=""
          width={110}
          height={40}
          className="h-7 w-auto opacity-95 will-change-transform drop-shadow-[0_4px_14px_rgb(247_133_1/0.35)] sm:h-8"
        />

        <div aria-hidden="true" className="mt-1.5 flex items-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              ref={(node) => {
                beatDotRefs.current[i] = node;
              }}
              className="h-1.5 w-1.5 rounded-full bg-white/30 will-change-transform"
              style={{ opacity: 0.28 }}
            />
          ))}
        </div>
      </div>

      {/* Vertical rhythm highway + 4-corner orange bracket hit zone */}
      <div className="stage-highway">
        <div
          ref={targetBoxRef}
          onClick={running ? registerHit : undefined}
          className={`stage-target-box ${bursts.length > 0 && running ? 'is-landing' : ''}`}
          style={{ pointerEvents: running ? 'auto' : 'none', cursor: running ? 'pointer' : 'default' }}
        >
          <span
            key={`sweep-${sweepKey}`}
            className={`stage-target-sweep ${sweepKey > 0 && running ? 'is-sweeping' : ''}`}
            aria-hidden="true"
          />
          <span className="stage-bracket stage-bracket-tl" aria-hidden="true" />
          <span className="stage-bracket stage-bracket-tr" aria-hidden="true" />
          <span className="stage-bracket stage-bracket-bl" aria-hidden="true" />
          <span className="stage-bracket stage-bracket-br" aria-hidden="true" />

          {/* 16-beat opening timeline (Beats 0..11: 3x 1-2-3-4; Beats 12..15: 3-2-1-GO!) */}
          {running && introBeat !== null ? (
            <IntroCountdownOverlay introBeat={introBeat} />
          ) : null}

          {/* Explode-and-unmount word burst right inside the hit zone */}
          <TargetExplosion bursts={bursts} onDone={handleBurstDone} />
        </div>

        <WordCarousel
          idleWord={!running ? IDLE_PREVIEW_WORD : null}
          upcoming={upcoming}
          running={running}
          intervalBeats={intervalBeats}
          beatClockRef={beatClockRef}
          onHit={registerHit}
          hitFlash={flash}
          frontRef={frontCardRef}
        />
      </div>

      <p className="mt-2 px-4 text-center text-[11px] leading-relaxed text-content-subtle">
        {running ? t('words.pressHint') : t('words.idleHint')}
      </p>

      {pop ? <WordPop origin={pop} strength={pop.strength} popKey={pop.key} /> : null}
    </div>
  );
});

export default WordGenerator;
