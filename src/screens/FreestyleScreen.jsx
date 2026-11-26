import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { resolveRoundBars } from '../lib/rhymeEngine';
import { calculateMachineScore, isSpeechRecognitionSupported } from '../lib/speechMatcher';
import { BUTTON_HOVER, BUTTON_TAP, SPRING_SMOOTH, SPRING_SNAPPY } from '../lib/motion';

function formatBeatInterval(seconds, bpm) {
  if (!bpm) return seconds;
  const beats = snapToBarBeats(seconds, bpm);
  return Number((beats * (60 / bpm)).toFixed(2));
}

/**
 * The freestyle stage screen (`#play`).
 *
 * Implements VCL Freestyle game loop:
 *  - Count-in 4 bars (optional), then beat runs for 8 / 16 / 32 bars or full track.
 *  - Words drop from Kho vần VCL v0 on Beat 4 or Beats 2 & 4.
 *  - Live Vietnamese Web Speech API checks words within ±1 beat -> machine score (0..10).
 *  - Battle mode alternates players every 2 bars and tracks P1 / P2 hits separately.
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
  user = null,
}) {
  const t = useT();
  const [phase, setPhase] = useState('setup'); // setup | running | finished
  const [wordsShown, setWordsShown] = useState(0);
  const [wordsHit, setWordsHit] = useState(0);
  const [wordsMissed, setWordsMissed] = useState(0);
  const [hitsOnBeat, setHitsOnBeat] = useState(0);
  const [streak, setStreak] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const [activePlayer, setActivePlayer] = useState(1);
  const [practiceMode, setPracticeMode] = useState(Boolean(unsupported || settings.practice));

  // Direct DOM refs for zero-re-render 60fps session progress bar & timer text.
  const railFillRef = useRef(null);
  const secondsLeftRef = useRef(null);
  const progressBarRef = useRef(null);

  const rapStartAudioSecRef = useRef(null);
  const recordedBlobRef = useRef(null);
  const finishedRef = useRef(false);
  const wordLogRef = useRef([]);
  const tuRoiMapRef = useRef(new Map());
  const speechOkRef = useRef(isSpeechRecognitionSupported());
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
  const effectiveBpm = bpm > 0 ? bpm : 120;
  const countInEnabled = settings.countIn !== false;
  const introBeats = countInEnabled ? INTRO_BEATS : 0;
  const bar1Offset = beat?.bar1Offset ?? 0;

  const roundBars = useMemo(
    () => resolveRoundBars(settings.bars ?? 16, beat),
    [settings.bars, beat],
  );

  // Target rap duration locked to exact musical bars (+0.85s tail for final beat 4 speech window)
  const targetRapSeconds = useMemo(() => {
    if (settings.bars !== undefined) {
      return Number((((roundBars * 4 + 1.5) * 60) / effectiveBpm).toFixed(2));
    }
    return settings.duration || 60;
  }, [settings.bars, settings.duration, roundBars, effectiveBpm]);

  const player1Handle = settings.handle || user?.socialHandle || 'Player1';
  const player2Handle = settings.opponent || 'Player2';

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
      const introOffset =
        rapStartAudioSecRef.current ?? (introBeats * 60) / effectiveBpm + bar1Offset;
      const rapSeconds = Math.max(0, audioElapsed - introOffset);

      const tuRoi = Array.from(tuRoiMapRef.current.values()).sort(
        (a, b) => (a.order || 0) - (b.order || 0),
      );

      const totalWords = tuRoi.length || wordsShown;
      const hitCount = tuRoi.length
        ? tuRoi.filter((w) => w.status === 'hit').length
        : wordsHit;

      const p1Items = tuRoi.filter((w) => w.playerIndex === 1);
      const p2Items = tuRoi.filter((w) => w.playerIndex === 2);
      const p1Hits = p1Items.filter((w) => w.status === 'hit').length;
      const p2Hits = p2Items.filter((w) => w.status === 'hit').length;

      const machineScore = speechOkRef.current ? calculateMachineScore(hitCount, totalWords) : 0;
      const p1MachineScore = speechOkRef.current
        ? calculateMachineScore(p1Hits, p1Items.length || totalWords)
        : 0;
      const p2MachineScore = speechOkRef.current
        ? calculateMachineScore(p2Hits, p2Items.length)
        : 0;

      onComplete({
        beatId: beat?.id ?? null,
        beatTitle: beat?.title ?? null,
        beatBpm: bpm || effectiveBpm,
        handle: player1Handle,
        opponent: settings.battleMode ? player2Handle : '',
        battleMode: Boolean(settings.battleMode),
        bars: roundBars,
        flow: settings.flow ?? 'beat4',
        difficulty: settings.difficulty ?? 'easy',
        durationSeconds: completed ? targetRapSeconds : rapSeconds,
        targetSeconds: targetRapSeconds,
        wordsShown: totalWords,
        wordsHit: hitCount,
        wordsMissed: Math.max(0, totalWords - hitCount),
        perfectHits: hitsOnBeat,
        machineScore,
        p1WordsTotal: p1Items.length,
        p1WordsHit: p1Hits,
        p1MachineScore,
        p2WordsTotal: p2Items.length,
        p2WordsHit: p2Hits,
        p2MachineScore,
        speechSupported: speechOkRef.current,
        wordLog: [...wordLogRef.current],
        tuRoi,
        completed,
        practiceMode,
        blob,
        video: hasVideo && Boolean(blob),
        mediaType: blob?.type || '',
      });
    },
    [
      bar1Offset,
      beat,
      bpm,
      effectiveBpm,
      hasVideo,
      hitsOnBeat,
      introBeats,
      onComplete,
      player.audio,
      player1Handle,
      player2Handle,
      practiceMode,
      recorderState,
      roundBars,
      settings.battleMode,
      settings.difficulty,
      settings.flow,
      stop,
      targetRapSeconds,
      wordsHit,
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

    const introDurationSec = (introBeats * 60) / effectiveBpm + bar1Offset;
    const totalRapSec = Math.max(1, targetRapSeconds);
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
  }, [phase, effectiveBpm, introBeats, bar1Offset, targetRapSeconds, player.audio, t]);

  /* ----------------------------------------------------------- handlers */

  const handleStart = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = false;
    wordLogRef.current = [];
    tuRoiMapRef.current.clear();
    rapStartAudioSecRef.current = null;
    speechOkRef.current = isSpeechRecognitionSupported();
    setWordsShown(0);
    setWordsHit(0);
    setWordsMissed(0);
    setHitsOnBeat(0);
    setStreak(0);
    setActivePlayer(1);

    let effectivePractice = Boolean(unsupported || practiceMode);
    if (!effectivePractice && recorderState !== 'recording') {
      const ok = recorderState === 'ready' ? true : await prepare();
      if (!ok) {
        effectivePractice = true;
        setPracticeMode(true);
      }
    }

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
    const introSec = (introBeats * 60) / effectiveBpm + bar1Offset;
    if (audioElapsed < introSec && wordsShown === 0) {
      pause();
      resetRecorder();
      onExit?.();
      return;
    }
    finishSessionRef.current(false);
  }, [bar1Offset, effectiveBpm, introBeats, onExit, pause, player.audio, resetRecorder, wordsShown]);

  const handleIntroComplete = useCallback(() => {
    rapStartAudioSecRef.current = player.audio?.elapsedTime ?? 0;
  }, [player.audio]);

  const handleWordShown = useCallback((wordText, entry) => {
    setWordsShown((n) => n + 1);
    if (entry && !tuRoiMapRef.current.has(entry.id)) {
      tuRoiMapRef.current.set(entry.id, {
        id: entry.id,
        order: entry.order,
        text: entry.text,
        nest: entry.nest || '',
        status: entry.hit ? 'hit' : 'miss',
        heardText: entry.heardText || '',
        playerIndex: entry.playerIndex ?? 1,
      });
    }
  }, []);

  const handleWordHit = useCallback((wordText, timing) => {
    setWordsHit((n) => n + 1);
    setStreak((s) => s + 1);
    if (timing?.onBeat) setHitsOnBeat((n) => n + 1);
    wordLogRef.current.push({
      text: wordText,
      status: timing?.onBeat ? 'perfect' : 'good',
      playerIndex: timing?.wordEntry?.playerIndex ?? 1,
    });
    const entry = timing?.wordEntry;
    if (entry) {
      tuRoiMapRef.current.set(entry.id, {
        id: entry.id,
        order: entry.order,
        text: entry.text,
        nest: entry.nest || '',
        status: 'hit',
        heardText: timing.heardText || wordText,
        playerIndex: entry.playerIndex ?? 1,
      });
    }
  }, []);

  const handleWordMissed = useCallback((wordText, entry) => {
    setWordsMissed((n) => n + 1);
    setStreak(0);
    if (wordText) {
      wordLogRef.current.push({
        text: wordText,
        status: 'miss',
        playerIndex: entry?.playerIndex ?? 1,
      });
    }
    if (entry && !tuRoiMapRef.current.has(entry.id)) {
      tuRoiMapRef.current.set(entry.id, {
        id: entry.id,
        order: entry.order,
        text: entry.text,
        nest: entry.nest || '',
        status: 'miss',
        heardText: '',
        playerIndex: entry.playerIndex ?? 1,
      });
    }
  }, []);

  const handleStageBurst = useCallback(() => {
    setBurstKey((k) => k + 1);
  }, []);

  const handleSpeechStatusChange = useCallback((status) => {
    if (status === 'unsupported' || status === 'denied') {
      speechOkRef.current = false;
    } else if (status === 'listening') {
      speechOkRef.current = true;
    }
  }, []);

  /* -------------------------------------------------------------- render */

  const liveStage = phase === 'running';
  const activeHandle = settings.battleMode
    ? activePlayer === 1
      ? player1Handle
      : player2Handle
    : player1Handle;

  const stageName = liveStage
    ? `@${activeHandle}`
    : settings.handle
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
          <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
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

            {settings.battleMode ? (
              <span className="rounded-full border border-secondary/50 bg-secondary/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-content backdrop-blur-md">
                ⚔️ P{activePlayer}
              </span>
            ) : null}
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
          handle={activeHandle}
          hits={wordsHit}
          shown={wordsShown}
          streak={streak}
        />

        <WordGenerator
          running={liveStage}
          intervalMs={(settings.wordInterval ?? 4) * 1000}
          mode={settings.wordMode ?? 'random'}
          burnMode={settings.burnMode}
          bars={roundBars}
          difficulty={settings.difficulty ?? 'easy'}
          flow={settings.flow ?? 'beat4'}
          countIn={countInEnabled}
          battleMode={Boolean(settings.battleMode)}
          player1Name={`@${player1Handle}`}
          player2Name={`@${player2Handle}`}
          bar1Offset={bar1Offset}
          audio={player.audio}
          bpm={beat?.bpm ?? 0}
          onWordShown={handleWordShown}
          onWordHit={handleWordHit}
          onWordMissed={handleWordMissed}
          onStageBurst={handleStageBurst}
          onIntroComplete={handleIntroComplete}
          onActivePlayerChange={setActivePlayer}
          onSpeechStatusChange={handleSpeechStatusChange}
        />

        {/* Bottom sunset progress bar */}
        <div className="w-full px-4 pb-2 pt-2">
          <div
            ref={progressBarRef}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={Math.round(targetRapSeconds)}
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
              {t('freestyle.secondsLeft', { n: Math.round(targetRapSeconds) })}
            </p>
            <p className="truncate text-[10px] font-semibold tracking-[0.06em] text-content-subtle">
              ♪ {beat?.title}
              {bpm ? ` · ${bpm} BPM` : ''} · {roundBars} bar
            </p>
          </div>
          {liveStage ? (
            <p className="mt-4 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-content-subtle/70">
              VCL FREESTYLE · YOU GOT BARS?
            </p>
          ) : null}
        </div>
      </div>

      {liveStage ? <StageLyricsDrawer /> : null}
    </>
  );

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
          targetSeconds={Math.round(targetRapSeconds)}
        />
      ) : null}

      <div className="panel space-y-5 p-4">
        <SegmentedControl
          name="session-bars"
          label={t('setup.barsLabel')}
          value={settings.bars ?? 16}
          onChange={(value) => onSettingsChange({ ...settings, bars: value })}
          options={[
            { value: 8, label: '8 bar' },
            { value: 16, label: '16 bar' },
            { value: 32, label: '32 bar' },
            { value: 'full', label: t('setup.fullTrack') },
          ]}
        />

        <SliderField
          id="word-interval"
          label={t('freestyle.wordInterval')}
          value={settings.wordInterval ?? 4}
          min={2}
          max={10}
          step={1}
          onChange={(value) => onSettingsChange({ ...settings, wordInterval: value })}
          format={(v) => `${formatBeatInterval(v, bpm)}s`}
          note={
            bpm
              ? t('freestyle.beatsCount', {
                  n: snapToBarBeats(settings.wordInterval ?? 4, bpm),
                })
              : null
          }
          hint={t('freestyle.wordIntervalHint')}
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
