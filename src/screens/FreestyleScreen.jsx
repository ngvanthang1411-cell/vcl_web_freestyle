import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import BeatPlayer from '../components/BeatPlayer';
import Recorder from '../components/Recorder';
import WordGenerator, { INTRO_BEATS } from '../components/WordGenerator';
import ErrorNotice from '../components/ErrorNotice';
import { SegmentedControl, SliderField } from '../components/ui';
import MicBadge from '../components/MicBadge';
import StageCanvas from '../components/StageCanvas';
import { useT } from '../i18n/LanguageContext';
import { snapToBarBeats } from '../lib/beatGrid';
import { BUTTON_HOVER, BUTTON_TAP, SPRING_SMOOTH, SPRING_SNAPPY } from '../lib/motion';

function formatBeatInterval(seconds, bpm) {
  if (!bpm) return seconds;
  const beats = snapToBarBeats(seconds, bpm);
  return Number((beats * (60 / bpm)).toFixed(2));
}

/**
 * The freestyle stage screen (`#play`).
 *
 * Beat Engine & Performance Architecture:
 *  - Starting a session immediately launches the Web Audio beat at Beat 0
 *    (zero silent setTimeout countdown). Beats 0..15 run the musical 16-beat
 *    intro (`1-2-3-4` ×3 + `3-2-1-GO!`), and Beat 16 explodes the first word
 *    into the target box.
 *  - Session progress (`scaleX`) and remaining-seconds readout are driven by
 *    `requestAnimationFrame` via direct DOM refs (ZERO `setInterval`, ZERO
 *    10Hz React re-renders).
 *  - The lyrics scratchpad (`StageLyricsDrawer` & `IsolatedLyricsPad`) owns
 *    its own isolated React state, so continuous typing never re-renders the
 *    BeatEngine, countdown, or target-box explosions.
 */
export default function FreestyleScreen({
  beat,
  player,
  recorder,
  settings,
  onSettingsChange,
  onComplete,
  onExit,
  unsupported,
  autoStart = false,
}) {
  const t = useT();
  const [phase, setPhase] = useState('setup'); // setup | running | finished
  const [wordsShown, setWordsShown] = useState(0);
  const [wordsHit, setWordsHit] = useState(0);
  const [wordsMissed, setWordsMissed] = useState(0);
  const [hitsOnBeat, setHitsOnBeat] = useState(0);
  const [streak, setStreak] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const [practiceMode, setPracticeMode] = useState(Boolean(unsupported || settings.practice));

  // Direct DOM refs for zero-re-render 60fps session progress bar & timer text.
  const railFillRef = useRef(null);
  const secondsLeftRef = useRef(null);
  const progressBarRef = useRef(null);

  const rapStartAudioSecRef = useRef(null);
  const recordedBlobRef = useRef(null);
  const finishedRef = useRef(false);
  const wordLogRef = useRef([]);
  const autoStartedRef = useRef(false);

  const {
    prepare,
    start,
    stop,
    reset: resetRecorder,
    state: recorderState,
    error: recorderError,
    hasVideo,
  } = recorder;

  const { play, pause, toggleLoop } = player;
  const bpm = beat?.bpm ?? 0;

  /* ------------------------------------------------------------- cleanup */

  useEffect(() => {
    return () => {
      pause();
      resetRecorder();
    };
  }, [pause, resetRecorder]);

  /* ------------------------------------------------------- session end */

  const finishSession = useCallback(
    async (completed) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setPhase('finished');

      let blob = recordedBlobRef.current;
      if (recorderState === 'recording') {
        blob = await stop();
        recordedBlobRef.current = blob;
      }

      const audioElapsed = player.audio?.elapsedTime ?? 0;
      const introOffset = rapStartAudioSecRef.current ?? (bpm > 0 ? (INTRO_BEATS * 60) / bpm : 8);
      const rapSeconds = Math.max(0, audioElapsed - introOffset);

      onComplete({
        beatId: beat?.id ?? null,
        beatTitle: beat?.title ?? null,
        handle: settings.handle ?? '',
        durationSeconds: completed ? settings.duration : rapSeconds,
        targetSeconds: settings.duration,
        wordsShown,
        wordsHit,
        wordsMissed,
        perfectHits: hitsOnBeat,
        wordLog: [...wordLogRef.current],
        completed,
        practiceMode,
        blob,
        video: hasVideo && Boolean(blob),
        mediaType: blob?.type || '',
      });
    },
    [
      beat,
      bpm,
      hasVideo,
      hitsOnBeat,
      onComplete,
      player.audio,
      practiceMode,
      recorderState,
      settings.duration,
      settings.handle,
      stop,
      wordsHit,
      wordsMissed,
      wordsShown,
    ],
  );

  const finishSessionRef = useRef(finishSession);
  useEffect(() => {
    finishSessionRef.current = finishSession;
  }, [finishSession]);

  /* -------------------------------------------- rAF session progress loop */

  useEffect(() => {
    if (phase !== 'running' || typeof window === 'undefined') return undefined;

    const effectiveBpm = bpm > 0 ? bpm : 120;
    const introDurationSec = (INTRO_BEATS * 60) / effectiveBpm;
    const totalRapSec = Math.max(1, settings.duration);
    const startedWallMs = performance.now();

    let raf = null;
    let lastShownSec = -1;

    const tick = (now) => {
      raf = requestAnimationFrame(tick);

      const audioSec =
        player.audio && typeof player.audio.elapsedTime === 'number'
          ? player.audio.elapsedTime
          : (now - startedWallMs) / 1000;

      const rapStart = rapStartAudioSecRef.current ?? introDurationSec;
      const rapElapsed = Math.max(0, audioSec - rapStart);
      const remaining = Math.max(0, totalRapSec - rapElapsed);
      const ratio = Math.min(1, rapElapsed / totalRapSec);

      if (railFillRef.current) {
        railFillRef.current.style.transform = `scaleX(${ratio.toFixed(4)})`;
      }

      const ceilRem = Math.ceil(remaining);
      if (ceilRem !== lastShownSec) {
        lastShownSec = ceilRem;
        if (secondsLeftRef.current) {
          secondsLeftRef.current.textContent = t('freestyle.secondsLeft', { n: ceilRem });
        }
        if (progressBarRef.current) {
          progressBarRef.current.setAttribute('aria-valuenow', String(Math.round(rapElapsed)));
        }
      }

      if (rapElapsed >= totalRapSec) {
        cancelAnimationFrame(raf);
        finishSessionRef.current(true);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [phase, bpm, settings.duration, player.audio, t]);

  /* ----------------------------------------------------------- handlers */

  const handleStart = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = false;
    wordLogRef.current = [];
    rapStartAudioSecRef.current = null;
    setWordsShown(0);
    setWordsHit(0);
    setWordsMissed(0);
    setHitsOnBeat(0);
    setStreak(0);

    let effectivePractice = Boolean(unsupported || practiceMode);
    if (!effectivePractice && recorderState !== 'recording') {
      const ok = recorderState === 'ready' ? true : await prepare();
      if (!ok) {
        effectivePractice = true;
        setPracticeMode(true);
      }
    }

    // Start the Web Audio beat immediately at Beat 0 so the 16-beat musical
    // intro plays locked to the real groove!
    if (beat?.src) {
      await play(beat.src, { fromStart: true });
      toggleLoop(true);
    }

    if (!effectivePractice && recorderState !== 'recording') {
      start();
    }

    setPhase('running');
  }, [beat, play, practiceMode, prepare, recorderState, start, toggleLoop, unsupported]);

  useEffect(() => {
    if (!autoStart || autoStartedRef.current || !beat) return;
    autoStartedRef.current = true;
    handleStart();
  }, [autoStart, beat, handleStart]);

  const handleStopEarly = useCallback(() => {
    const audioElapsed = player.audio?.elapsedTime ?? 0;
    const effectiveBpm = bpm > 0 ? bpm : 120;
    const introSec = (INTRO_BEATS * 60) / effectiveBpm;
    // Quitting during the 16-beat intro returns cleanly to beat select.
    if (audioElapsed < introSec && wordsShown === 0) {
      pause();
      resetRecorder();
      onExit?.();
      return;
    }
    finishSessionRef.current(false);
  }, [bpm, onExit, pause, player.audio, resetRecorder, wordsShown]);

  const handleIntroComplete = useCallback(() => {
    rapStartAudioSecRef.current = player.audio?.elapsedTime ?? 0;
  }, [player.audio]);

  const handleWordShown = useCallback(() => {
    setWordsShown((n) => n + 1);
  }, []);

  const handleWordHit = useCallback((wordText, timing) => {
    setWordsHit((n) => n + 1);
    setStreak((s) => s + 1);
    if (timing?.onBeat) setHitsOnBeat((n) => n + 1);
    wordLogRef.current.push({
      text: wordText,
      status: timing?.onBeat ? 'perfect' : 'good',
    });
  }, []);

  const handleWordMissed = useCallback((wordText) => {
    setWordsMissed((n) => n + 1);
    setStreak(0);
    if (wordText) {
      wordLogRef.current.push({ text: wordText, status: 'miss' });
    }
  }, []);

  const handleStageBurst = useCallback(() => {
    setBurstKey((k) => k + 1);
  }, []);

  /* -------------------------------------------------------------- render */

  const liveStage = phase === 'running';
  const stageName = settings.handle
    ? settings.battleMode && settings.opponent
      ? `@${settings.handle} vs @${settings.opponent}`
      : `@${settings.handle}`
    : (beat?.title ?? t('freestyle.titleAccent'));

  const stageContent = (
    <>
      <StageCanvas
        audio={player.audio}
        analyserRef={player.analyserRef}
        bpm={bpm}
        active={liveStage && player.isPlaying}
        variant="stage"
        burstKey={burstKey}
        className="stage-canvas"
      />

      {/* Floating REC / PRACTICE left & ✕ stop right when live */}
      {liveStage ? (
        <>
          <div className="absolute left-4 top-4 z-20">
            {!unsupported && !practiceMode ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-danger/55 bg-danger/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-danger backdrop-blur-md">
                <span className="animate-rec-pulse h-2 w-2 rounded-full bg-danger" />
                {t('stage.recBadge')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-raised/80 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-content-muted backdrop-blur-md">
                🎧 {t('stage.practiceBadge')}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleStopEarly}
            aria-label={t('stage.quitAria')}
            className="ygb-icon-btn absolute right-4 top-4 z-20 h-10 w-10 border-line-strong/80 bg-surface-raised/85 text-sm backdrop-blur-md"
          >
            ✕
          </button>
        </>
      ) : null}

      {/* Mirrored webcam PiP when video recording is live */}
      {settings.video && recorder.stream && recorderState === 'recording' ? (
        <div className="pointer-events-none absolute right-4 top-16 z-20 h-28 w-20 overflow-hidden rounded-xl border border-accent/50 bg-black shadow-lift">
          <video
            autoPlay
            playsInline
            muted
            ref={(node) => {
              if (node && recorder.stream && node.srcObject !== recorder.stream) {
                node.srcObject = recorder.stream;
              }
            }}
            className="h-full w-full -scale-x-100 object-cover"
            aria-label={t('recorder.cameraAria')}
          />
        </div>
      ) : null}

      {/* Centered vertical stage column */}
      <div
        className={`relative z-10 flex w-full max-w-[36rem] flex-col items-center justify-between ${
          liveStage ? 'min-h-[min(100vh,46rem)] py-5 sm:py-7' : 'py-3'
        }`}
      >
        <MicBadge
          audio={player.audio}
          analyserRef={player.analyserRef}
          bpm={bpm}
          active={liveStage && player.isPlaying}
          name={stageName}
          handle={settings.handle ?? ''}
          hits={wordsHit}
          shown={wordsShown}
          streak={streak}
        />

        <WordGenerator
          running={liveStage}
          intervalMs={settings.wordInterval * 1000}
          mode={settings.wordMode}
          burnMode={settings.burnMode}
          audio={player.audio}
          bpm={beat?.bpm ?? 0}
          onWordShown={handleWordShown}
          onWordHit={handleWordHit}
          onWordMissed={handleWordMissed}
          onStageBurst={handleStageBurst}
          onIntroComplete={handleIntroComplete}
        />

        {/* Bottom sunset progress bar (100% rAF GPU scaleX — zero setInterval) */}
        <div className="w-full px-4 pb-2 pt-2">
          <div
            ref={progressBarRef}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={settings.duration}
            aria-valuenow={0}
            aria-label={t('freestyle.sessionProgress')}
            className="stage-rail"
          >
            <div
              ref={railFillRef}
              className="stage-rail-fill"
              style={{ transform: 'scaleX(0)' }}
            />
          </div>
          <div className="mx-auto mt-2 flex w-[min(90%,27.5rem)] items-baseline justify-between gap-3">
            <p
              ref={secondsLeftRef}
              className="font-mono text-[11px] tnum text-content-muted"
            >
              {t('freestyle.secondsLeft', { n: settings.duration })}
            </p>
            <p className="truncate text-[10px] font-semibold tracking-[0.06em] text-content-subtle">
              ♪ {beat?.title}
              {bpm ? ` · ${bpm} BPM` : ''}
            </p>
          </div>
          {liveStage ? (
            <p className="mt-4 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-content-subtle/70">
              YOU GOT BARS?
            </p>
          ) : null}
        </div>
      </div>

      {/* State-isolated floating Lyrics Pad on live stage — typing NEVER re-renders BeatEngine */}
      {liveStage ? <StageLyricsDrawer /> : null}
    </>
  );

  // Full-viewport cinema stage rendered via portal so Framer Motion parent
  // transforms can never trap `position: fixed`.
  if (liveStage) {
    const overlay = <div className="stage-fullscreen">{stageContent}</div>;
    return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
  }

  return (
    <div className="space-y-5">
      <div className="stage-panel relative">{stageContent}</div>

      {unsupported ? (
        <ErrorNotice
          title={t(unsupported.titleKey)}
          detail={t(unsupported.detailKey)}
          hint={[
            t('errors.hintChrome'),
            t('errors.hintSafari'),
            t('errors.hintPractice'),
          ]}
          actions={[]}
          tone="warn"
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <motion.button
          type="button"
          whileHover={BUTTON_HOVER}
          whileTap={BUTTON_TAP}
          transition={SPRING_SNAPPY}
          onClick={handleStart}
          className="btn btn-primary flex-1"
        >
          {unsupported || practiceMode
            ? t('freestyle.startPractice')
            : t('freestyle.startSession')}
        </motion.button>
        <motion.button
          type="button"
          whileHover={BUTTON_HOVER}
          whileTap={BUTTON_TAP}
          transition={SPRING_SNAPPY}
          onClick={onExit}
          className="btn btn-ghost"
        >
          {t('freestyle.changeBeat')}
        </motion.button>
      </div>

      <BeatPlayer beat={beat} player={player} showSeek />

      {/* Isolated lyrics scratchpad — own state so typing never re-renders the beat visualizer */}
      <IsolatedLyricsPad />

      {!unsupported ? (
        <Recorder
          state={recorderState}
          elapsed={recorder.elapsed}
          error={recorderError}
          video={settings.video}
          stream={recorder.stream}
          sessionActive={false}
          onToggleVideo={(value) => onSettingsChange({ ...settings, video: value })}
          onStart={handleStart}
          onStop={handleStopEarly}
          onRetry={prepare}
          onPractice={() => setPracticeMode(true)}
          practiceMode={practiceMode}
          targetSeconds={settings.duration}
        />
      ) : null}

      <div className="panel space-y-5 p-4">
        <SegmentedControl
          name="session-length"
          label={t('freestyle.sessionLength')}
          value={settings.duration}
          onChange={(value) => onSettingsChange({ ...settings, duration: value })}
          options={[30, 60, 90].map((seconds) => ({
            value: seconds,
            label: `${seconds}s`,
          }))}
        />

        <SliderField
          id="word-interval"
          label={t('freestyle.wordInterval')}
          value={settings.wordInterval}
          min={2}
          max={10}
          step={1}
          onChange={(value) => onSettingsChange({ ...settings, wordInterval: value })}
          format={(v) => `${formatBeatInterval(v, bpm)}s`}
          note={
            bpm
              ? t('freestyle.beatsCount', {
                  n: snapToBarBeats(settings.wordInterval, bpm),
                })
              : null
          }
          hint={t('freestyle.wordIntervalHint')}
        />

        <SegmentedControl
          name="word-mode"
          label={t('freestyle.wordOrder')}
          value={settings.wordMode}
          onChange={(value) => onSettingsChange({ ...settings, wordMode: value })}
          options={[
            { value: 'random', label: t('freestyle.random') },
            { value: 'sequential', label: t('freestyle.sequential') },
          ]}
        />

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="field-label mb-1">{t('freestyle.burnMode')}</p>
            <p className="text-[11px] leading-snug text-content-subtle">
              {t('freestyle.burnHint')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.burnMode}
            onClick={() =>
              onSettingsChange({ ...settings, burnMode: !settings.burnMode })
            }
            className="ygb-switch shrink-0"
          >
            <span className="ygb-switch-thumb" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Isolated floating Lyrics Drawer on the live stage.
 * Owns both its open/closed state and typed text state so typing bars
 * continuously never triggers any re-render of the BeatEngine or stage.
 */
const StageLyricsDrawer = memo(function StageLyricsDrawer() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const lineCount = notes ? notes.split('\n').filter((l) => l.trim()).length : 0;

  return (
    <div className="fixed bottom-4 left-4 z-40 flex flex-col items-start gap-2">
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={SPRING_SMOOTH}
            className="w-[min(86vw,21rem)] rounded-2xl border border-line-strong bg-surface-raised/92 p-3 shadow-lift backdrop-blur-xl will-change-transform"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="stage-bars-pad" className="field-label mb-0">
                {t('pad.title')}
              </label>
              <span className="font-mono text-[10px] tnum text-content-subtle">
                {t('pad.count', { n: lineCount })}
              </span>
            </div>
            <textarea
              id="stage-bars-pad"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('pad.placeholder')}
              className="input resize-none text-xs leading-relaxed"
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.button
        type="button"
        whileHover={{ y: -1, scale: 1.04 }}
        whileTap={{ scale: 0.94 }}
        transition={SPRING_SNAPPY}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur-md ${
          open
            ? 'border-accent/70 bg-accent/20 text-accent-lighter'
            : 'border-line-strong/80 bg-surface-raised/80 text-content-muted hover:text-content'
        }`}
      >
        <span aria-hidden="true">✍️</span>
        <span>{t('pad.toggle')}</span>
      </motion.button>
    </div>
  );
});

/**
 * Isolated bars/lyrics scratchpad for setup mode.
 */
const IsolatedLyricsPad = memo(function IsolatedLyricsPad() {
  const t = useT();
  const [notes, setNotes] = useState('');
  const lineCount = notes ? notes.split('\n').filter((l) => l.trim()).length : 0;

  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label htmlFor="bars-pad" className="field-label mb-0">
          {t('pad.title')}
        </label>
        <span className="font-mono text-[11px] tnum text-content-subtle">
          {t('pad.count', { n: lineCount })}
        </span>
      </div>
      <textarea
        id="bars-pad"
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t('pad.placeholder')}
        className="input resize-none leading-relaxed"
      />
    </div>
  );
});
