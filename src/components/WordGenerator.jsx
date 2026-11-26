import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import IntroCountdownOverlay from './IntroCountdownOverlay';
import TargetExplosion from './TargetExplosion';
import WordCarousel from './WordCarousel';
import WordPop from './WordPop';
import { DEFAULT_WORD } from '../data/words';
import { useLanguage } from '../i18n/LanguageContext';
import {
  TIMING,
  judgeOffset,
  offsetFromNearestBeat,
} from '../lib/beatGrid';
import { generateRoundWordPlan } from '../lib/rhymeEngine';
import { createSpeechTracker, doesTranscriptMatchWord } from '../lib/speechMatcher';
import { SPRING_BOUNCY } from '../lib/motion';

/**
 * Total opening beats when Count-in is enabled (4 bars = 16 beats).
 */
export const INTRO_BEATS = 16;

const IDLE_PREVIEW_WORD = {
  id: 'idle-0',
  text: DEFAULT_WORD,
  tone: 'lime',
  hitBeat: 0,
};

/**
 * Beat-Locked VCL Rhyme Engine + Live Vietnamese Speech Recognizer + Battle Turn Cues.
 *
 * Implements Spec Sections 2, 3, and 6:
 *  - Draws words from Kho vần VCL v0 (OK only, matching difficulty, paired 2 bars
 *    per rhyme nest, no duplicate final syllables in a pair, no repeats in a round).
 *  - Drops on Beat 4 (flow = 'beat4') or Beats 2 & 4 (flow = 'beat24').
 *  - Shows upcoming words dimmed 1 bar early and lights them up / explodes at target beat.
 *  - Listens via Web Speech API (vi-VN / en-US) and scores a hit whenever the player
 *    speaks the target word within [hitBeat - 1, hitBeat + 1] (plus manual tap/Space fallback).
 *  - In Battle mode: alternates every 2 bars and shows "Đến lượt @tên" 1 bar before switch.
 */
const WordGenerator = memo(function WordGenerator({
  running,
  intervalMs = 4000,
  mode = 'random',
  burnMode = false,
  bars = 16,
  difficulty = 'easy',
  flow = 'beat4',
  countIn = true,
  battleMode = false,
  player1Name = 'Player 1',
  player2Name = 'Player 2',
  bar1Offset = 0,
  audio = null,
  bpm = 0,
  onWordShown,
  onWordHit,
  onWordMissed,
  onStageBurst,
  onIntroComplete,
  onActivePlayerChange,
  onSpeechStatusChange,
}) {
  const { locale, t } = useLanguage();
  const [upcoming, setUpcoming] = useState([]);
  const [introBeat, setIntroBeat] = useState(null);
  const [bursts, setBursts] = useState([]);
  const [pop, setPop] = useState(null);
  const [flash, setFlash] = useState(null);
  const [sweepKey, setSweepKey] = useState(0);
  const [currentNest, setCurrentNest] = useState('');
  const [speechStatus, setSpeechStatus] = useState('idle'); // idle | listening | unsupported | denied | error
  const [liveTranscript, setLiveTranscript] = useState('');
  const [turnBanner, setTurnBanner] = useState(null); // string | null

  const introBeats = countIn ? INTRO_BEATS : 0;
  const effectiveBpm = bpm > 0 ? bpm : 120;
  const intervalBeats = flow === 'beat24' ? 2 : 4;

  const planRef = useRef([]); // full pre-generated round plan
  const cursorRef = useRef(0); // next unexploded index in planRef
  const explodedIdsRef = useRef(new Set());
  const pendingMissChecksRef = useRef([]); // exploded words waiting for +1 beat window to close
  const introDoneRef = useRef(false);
  const lastIntroBeatRef = useRef(-1);
  const lastActivePlayerRef = useRef(1);
  const lastTurnBannerRef = useRef(null);

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

  const onWordShownRef = useRef(onWordShown);
  onWordShownRef.current = onWordShown;
  const onWordHitRef = useRef(onWordHit);
  onWordHitRef.current = onWordHit;
  const onWordMissedRef = useRef(onWordMissed);
  onWordMissedRef.current = onWordMissed;
  const onStageBurstRef = useRef(onStageBurst);
  onStageBurstRef.current = onStageBurst;
  const onIntroCompleteRef = useRef(onIntroComplete);
  onIntroCompleteRef.current = onIntroComplete;
  const onActivePlayerChangeRef = useRef(onActivePlayerChange);
  onActivePlayerChangeRef.current = onActivePlayerChange;
  const onSpeechStatusChangeRef = useRef(onSpeechStatusChange);
  onSpeechStatusChangeRef.current = onSpeechStatusChange;

  const syncVisibleQueue = useCallback(() => {
    const slice = planRef.current.slice(cursorRef.current, cursorRef.current + 4);
    queueRef.current = slice;
    setUpcoming(slice);
    if (slice[0]?.nest) {
      setCurrentNest(slice[0].nest);
    }
  }, []);

  // Generate fresh VCL rhyme plan whenever run starts or round settings change.
  useEffect(() => {
    const freshPlan = generateRoundWordPlan({
      barCount: bars,
      difficulty,
      flow,
      locale,
      introBeats,
      battleMode,
    });

    planRef.current = freshPlan;
    cursorRef.current = 0;
    explodedIdsRef.current.clear();
    pendingMissChecksRef.current = [];
    introDoneRef.current = introBeats === 0;
    lastIntroBeatRef.current = -1;
    lastActivePlayerRef.current = 1;
    lastTurnBannerRef.current = null;
    setFlash(null);
    setPop(null);
    setBursts([]);
    setLiveTranscript('');
    setTurnBanner(null);
    beatClockRef.current = {
      currentBeat: 0,
      beatIndex: 0,
      beatPhase: 0,
      beatInBar: 0,
      audioTime: 0,
    };

    if (running) {
      setIntroBeat(introBeats > 0 ? 0 : null);
      if (introBeats === 0) {
        onIntroCompleteRef.current?.();
      }
    } else {
      setIntroBeat(null);
    }

    syncVisibleQueue();
  }, [running, bars, difficulty, flow, locale, introBeats, battleMode, mode, syncVisibleQueue]);

  const handleBurstDone = useCallback((burstId) => {
    setBursts((prev) => prev.filter((item) => item.id !== burstId));
  }, []);

  // Mark a target word as hit (either by Web Speech API or manual Space/click)
  const markWordAsHit = useCallback(
    (target, { heardText = '', viaSpeech = false } = {}) => {
      if (!target || target.hit) return;
      target.hit = true;
      target.heardText = heardText || target.text;

      let judgement = TIMING.PERFECT;
      let offsetMs = 0;
      if (!viaSpeech && effectiveBpm) {
        offsetMs = offsetFromNearestBeat(beatClockRef.current.audioTime, effectiveBpm);
        judgement = judgeOffset(offsetMs);
      }

      let origin = { x: 0, y: 0 };
      const anchorEl = targetBoxRef.current || frontCardRef.current;
      if (anchorEl) {
        const rect = anchorEl.getBoundingClientRect();
        origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }

      if (viaSpeech || judgement === TIMING.PERFECT || judgement === TIMING.GOOD) {
        setPop({
          ...origin,
          strength: viaSpeech ? TIMING.PERFECT : judgement,
          key: `${Date.now()}-${target.id}`,
        });
        setFlash(viaSpeech ? TIMING.PERFECT : judgement);
        onStageBurstRef.current?.();
      } else {
        setFlash('miss');
      }

      onWordHitRef.current?.(target.text, {
        onBeat: viaSpeech || judgement === TIMING.PERFECT,
        offsetMs,
        judgement: viaSpeech ? TIMING.PERFECT : judgement,
        heardText: target.heardText,
        wordEntry: target,
      });
    },
    [effectiveBpm],
  );

  // Web Speech API tracker (runs only while live stage is active)
  useEffect(() => {
    if (!running || typeof window === 'undefined') {
      setSpeechStatus('idle');
      return undefined;
    }

    const lang = locale === 'vi' ? 'vi-VN' : 'en-US';
    const tracker = createSpeechTracker({
      lang,
      onStatusChange: (status) => {
        setSpeechStatus(status);
        onSpeechStatusChangeRef.current?.(status);
      },
      onTranscript: (text) => {
        setLiveTranscript(text.slice(-48));
        const currentBeat = beatClockRef.current.currentBeat;

        // Spec Section 3: Match any unhit word within [hitBeat - 1, hitBeat + 1]
        for (const candidate of planRef.current) {
          if (candidate.hit) continue;
          if (currentBeat >= candidate.hitBeat - 1.1 && currentBeat <= candidate.hitBeat + 1.15) {
            if (doesTranscriptMatchWord(text, candidate.text)) {
              markWordAsHit(candidate, { heardText: text, viaSpeech: true });
              break;
            }
          }
        }
      },
    });

    tracker.start();
    return () => {
      tracker.stop();
    };
  }, [running, locale, markWordAsHit]);

  // Explode arriving word strictly once at `currentBeat >= word.hitBeat`
  const triggerWordExplosion = useCallback(
    (wordEntry) => {
      if (!wordEntry || explodedIdsRef.current.has(wordEntry.id)) return;
      explodedIdsRef.current.add(wordEntry.id);

      cursorRef.current += 1;
      syncVisibleQueue();

      // Track for +1 beat post-target speech window before finalizing miss
      pendingMissChecksRef.current.push(wordEntry);

      setBursts((prev) => [
        ...prev.slice(-2),
        { id: wordEntry.id, text: wordEntry.text, tone: wordEntry.tone },
      ]);
      setSweepKey((k) => k + 1);
      setFlash(null);
      setPop(null);

      onStageBurstRef.current?.();
      onWordShownRef.current?.(wordEntry.text, wordEntry);
    },
    [syncVisibleQueue],
  );

  // Master 60/120fps rAF Beat Engine
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

      const rawAudioTime =
        audio && typeof audio.elapsedTime === 'number'
          ? audio.elapsedTime
          : audio && typeof audio.currentTime === 'number'
            ? audio.currentTime
            : Math.max(0, (now - startedWallMs) / 1000);

      const audioTime = Math.max(0, rawAudioTime - (bar1Offset || 0));
      const currentBeat = (audioTime * effectiveBpm) / 60;
      const beatIndex = Math.floor(currentBeat);
      const beatPhase = currentBeat - beatIndex;
      const beatInBar = ((beatIndex % 4) + 4) % 4;

      beatClockRef.current.currentBeat = currentBeat;
      beatClockRef.current.beatIndex = beatIndex;
      beatClockRef.current.beatPhase = beatPhase;
      beatClockRef.current.beatInBar = beatInBar;
      beatClockRef.current.audioTime = audioTime;

      // 1) Count-in (4 bars = 16 beats when enabled)
      if (introBeats > 0 && beatIndex < introBeats) {
        if (beatIndex !== lastIntroBeatRef.current) {
          lastIntroBeatRef.current = beatIndex;
          setIntroBeat(beatIndex);
          if (beatIndex === introBeats - 1) {
            onStageBurstRef.current?.();
          }
        }
      } else if (!introDoneRef.current) {
        introDoneRef.current = true;
        setIntroBeat(null);
        onIntroCompleteRef.current?.();
      }

      // 2) Battle mode turn tracking (alternating every 2 bars, warning 1 bar before switch)
      if (battleMode && currentBeat >= Math.max(0, introBeats - 4)) {
        const rapBeat = currentBeat - introBeats;
        const currentBar = Math.floor(rapBeat / 4);
        if (currentBar >= 0) {
          const activePlayer = (Math.floor(currentBar / 2) % 2) + 1;
          if (activePlayer !== lastActivePlayerRef.current) {
            lastActivePlayerRef.current = activePlayer;
            onActivePlayerChangeRef.current?.(activePlayer);
          }
          // Spec Section 6: "1 bar trước khi đổi lượt, màn hình báo 'Đến lượt @tên'"
          const isWarningBar = currentBar % 2 === 1 && currentBar + 1 < bars;
          const nextPlayerName = activePlayer === 1 ? player2Name : player1Name;
          const bannerText = isWarningBar ? nextPlayerName : null;
          if (bannerText !== lastTurnBannerRef.current) {
            lastTurnBannerRef.current = bannerText;
            setTurnBanner(bannerText);
          }
        }
      }

      // 3) Trigger explosion on exact hitBeat
      const head = queueRef.current[0];
      if (head && currentBeat >= head.hitBeat && !explodedIdsRef.current.has(head.id)) {
        triggerWordExplosion(head);
      }

      // 4) Finalize missed words once their +1 beat grace window passes
      if (pendingMissChecksRef.current.length > 0) {
        const remaining = [];
        for (const item of pendingMissChecksRef.current) {
          if (item.hit) continue;
          if (currentBeat > item.hitBeat + 1.15) {
            onWordMissedRef.current?.(item.text, item);
          } else {
            remaining.push(item);
          }
        }
        pendingMissChecksRef.current = remaining;
      }

      // 5) GPU beat-bounce on Logo, 4-Corner Hit Zone, and 4 Beat Dots
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
      // Flush any still-pending unhit words when stopping
      for (const item of pendingMissChecksRef.current) {
        if (!item.hit) onWordMissedRef.current?.(item.text, item);
      }
      pendingMissChecksRef.current = [];
    };
  }, [
    running,
    audio,
    effectiveBpm,
    bar1Offset,
    introBeats,
    battleMode,
    bars,
    player1Name,
    player2Name,
    triggerWordExplosion,
  ]);

  /* --------------------------------------------------- manual Space/tap hit */

  const registerHit = useCallback(() => {
    const currentBeat = beatClockRef.current.currentBeat;
    let target = null;

    // Prefer an unhit word in the [hitBeat - 1, hitBeat + 1] window
    for (const item of pendingMissChecksRef.current) {
      if (!item.hit && currentBeat - item.hitBeat <= 1.15) {
        target = item;
        break;
      }
    }
    if (!target && queueRef.current[0] && !queueRef.current[0].hit) {
      target = queueRef.current[0];
    }
    if (!target) return;

    markWordAsHit(target, { heardText: target.text, viaSpeech: false });
  }, [markWordAsHit]);

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
      {/* Centered brand logo + 4-beat visual pulse bar + Rhyme Nest / Speech pill */}
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

        {/* Rhyme nest & Live Vietnamese speech recognition status */}
        {running ? (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            {currentNest ? (
              <span className="rounded-full border border-accent/45 bg-accent/12 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-lighter">
                {t('stage.rhymeNest', { nest: currentNest })}
              </span>
            ) : null}

            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                speechStatus === 'listening'
                  ? 'border-success/50 bg-success/15 text-success'
                  : 'border-line-strong bg-surface-raised/80 text-content-subtle'
              }`}
            >
              {speechStatus === 'listening'
                ? liveTranscript
                  ? `🎙 “${liveTranscript}”`
                  : `🎙 ${t('stage.speechListening')}`
                : speechStatus === 'unsupported' || speechStatus === 'denied'
                  ? `🔇 ${t('stage.speechUnavailable')}`
                  : `🎙 ${t('stage.speechReady')}`}
            </span>
          </div>
        ) : null}
      </div>

      {/* Battle Turn Switch Warning Banner (1 bar before switching players) */}
      <AnimatePresence>
        {running && battleMode && turnBanner ? (
          <motion.div
            key={turnBanner}
            initial={{ opacity: 0, y: -8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.92 }}
            transition={SPRING_BOUNCY}
            className="mx-auto mb-1 flex w-fit items-center gap-1.5 rounded-full border border-secondary/70 bg-secondary/20 px-4 py-1 text-xs font-extrabold uppercase tracking-wider text-content shadow-lift backdrop-blur-md"
          >
            <span>⚡</span>
            <span>{t('stage.nextTurn', { name: turnBanner })}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Vertical rhythm highway + 4-corner orange bracket hit zone */}
      <div className="stage-highway">
        <div
          ref={targetBoxRef}
          onClick={running ? registerHit : undefined}
          className={`stage-target-box ${bursts.length > 0 && running ? 'is-landing' : ''}`}
          style={{
            pointerEvents: running ? 'auto' : 'none',
            cursor: running ? 'pointer' : 'default',
          }}
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

          {running && introBeat !== null ? (
            <IntroCountdownOverlay introBeat={introBeat} />
          ) : null}

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
