import { useCallback, useEffect, useRef, useState } from 'react';
import BeatPlayer from '../components/BeatPlayer';
import Recorder from '../components/Recorder';
import WordGenerator from '../components/WordGenerator';
import ErrorNotice from '../components/ErrorNotice';
import { SegmentedControl, SliderField } from '../components/ui';
import MicBadge from '../components/MicBadge';
import StageCanvas from '../components/StageCanvas';
import { useT } from '../i18n/LanguageContext';
import { snapToBeats } from '../lib/beatGrid';

const COUNTDOWN_SECONDS = 3;

/**
 * The word interval, rounded to a whole number of beats.
 *
 * Words are revealed on the beat, so an interval that is not a multiple of
 * the beat length would drift out of phase. Rounding it here keeps the
 * slider honest: the number shown is the number actually used.
 */
function formatBeatInterval(seconds, bpm) {
  if (!bpm) return seconds;
  const beats = snapToBeats(seconds, bpm);
  return Number((beats * (60 / bpm)).toFixed(2));
}

/**
 * The freestyle session screen.
 *
 * Owns the session clock (countdown → running → finished) and the settings
 * that shape it. The parent receives the final result via onComplete.
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
}) {
  const t = useT();
  const [phase, setPhase] = useState('setup'); // setup | countdown | running | finished
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [remaining, setRemaining] = useState(settings.duration);
  const [elapsed, setElapsed] = useState(0);
  const [wordsShown, setWordsShown] = useState(0);
  const [wordsHit, setWordsHit] = useState(0);
  const [wordsMissed, setWordsMissed] = useState(0);
  const [hitsOnBeat, setHitsOnBeat] = useState(0);
  const [practiceMode, setPracticeMode] = useState(Boolean(unsupported));

  const sessionTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const startedAtRef = useRef(0);
  const recordedBlobRef = useRef(null);
  const finishedRef = useRef(false);

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

  // The tempo of the chosen beat, used to snap the word interval to the grid.
  const bpm = beat?.bpm ?? 0;

  /* ------------------------------------------------------------- cleanup */

  // Stop the beat, clear timers, and release the microphone when the screen
  // goes away. Leaving mid-recording must not leave the mic hot.
  useEffect(() => {
    return () => {
      pause();
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      resetRecorder();
    };
  }, [pause, resetRecorder]);

  /* ------------------------------------------------------- session clock */

  const finishSession = useCallback(
    async (completed) => {
      if (finishedRef.current) return;
      finishedRef.current = true;

      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
      setPhase('finished');

      // Capture the take if we were recording.
      let blob = recordedBlobRef.current;
      if (recorderState === 'recording') {
        blob = await stop();
        recordedBlobRef.current = blob;
      }

      // Always read the wall clock: the `elapsed` state can lag by one tick
      // when the session runs to the end.
      const seconds = (Date.now() - startedAtRef.current) / 1000;

      onComplete({
        beatId: beat?.id ?? null,
        beatTitle: beat?.title ?? null,
        durationSeconds: seconds,
        targetSeconds: settings.duration,
        wordsShown,
        wordsHit,
        wordsMissed,
        perfectHits: hitsOnBeat,
        completed,
        practiceMode,
        blob,
        video: hasVideo && Boolean(blob),
        mediaType: blob?.type || '',
      });
    },
    [
      beat,
      elapsed,
      hasVideo,
      onComplete,
      practiceMode,
      recorderState,
      settings.duration,
      stop,
      wordsHit,
      wordsMissed,
      wordsShown,
      hitsOnBeat,
    ],
  );

  // Keep the latest finishSession in a ref so the clock interval stays stable
  // instead of being torn down and rebuilt on every tick.
  const finishSessionRef = useRef(finishSession);
  useEffect(() => {
    finishSessionRef.current = finishSession;
  }, [finishSession]);

  /* ------------------------------------------------------------- countdown */

  const beginRun = useCallback(async () => {
    // Start the beat first so the recording captures it from the top.
    await play(beat.src);
    toggleLoop(true);

    if (!practiceMode && recorderState !== 'recording') {
      const ok = recorderState === 'ready' ? true : await prepare();
      if (!ok) {
        // Permission failed mid-flow — drop to practice mode rather than dead-end.
        setPracticeMode(true);
      } else {
        start();
      }
    }

    setElapsed(0);
    setRemaining(settings.duration);
    startedAtRef.current = Date.now();
    setPhase('running');
  }, [beat, play, practiceMode, prepare, recorderState, settings.duration, start, toggleLoop]);

  // Drive the 3-2-1 pre-roll.
  useEffect(() => {
    if (phase !== 'countdown') return undefined;

    let remainingCount = COUNTDOWN_SECONDS;
    setCountdown(remainingCount);

    const tick = () => {
      remainingCount -= 1;
      if (remainingCount <= 0) {
        setCountdown(0);
        beginRun();
        return;
      }
      setCountdown(remainingCount);
      countdownTimerRef.current = setTimeout(tick, 1000);
    };

    countdownTimerRef.current = setTimeout(tick, 1000);
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
    };
  }, [phase, beginRun]);

  /* --------------------------------------------------------- running clock */

  useEffect(() => {
    if (phase !== 'running') return undefined;

    sessionTimerRef.current = setInterval(() => {
      const passed = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(passed);
      setRemaining(Math.max(0, settings.duration - passed));
      if (passed >= settings.duration) {
        finishSessionRef.current(true);
      }
    }, 100);

    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
    };
  }, [phase, settings.duration]);

  /* ----------------------------------------------------------- handlers */

  const handleStart = async () => {
    if (finishedRef.current) return;
    finishedRef.current = false;

    // Ask for permission up front so the countdown is not interrupted.
    if (!unsupported && !practiceMode && recorderState !== 'ready') {
      const ok = await prepare();
      if (!ok) {
        setPracticeMode(true);
      }
    }
    setPhase('countdown');
  };

  const handleStopEarly = () => {
    finishSessionRef.current(false);
  };

  const handleWordShown = useCallback(() => {
    setWordsShown((n) => n + 1);
  }, []);

  const handleWordHit = useCallback((_word, timing) => {
    setWordsHit((n) => n + 1);
    // `onBeat` is true only for a hit that landed within the tight window.
    if (timing?.onBeat) setHitsOnBeat((n) => n + 1);
  }, []);

  const handleWordMissed = useCallback(() => {
    setWordsMissed((n) => n + 1);
  }, []);

  /* -------------------------------------------------------------- render */

  return (
    <div>
      {/* The player badge: the equalizer ring, the tempo, and the hits.
          The ring is drawn on a canvas and pulses with the actual beat. */}
      <MicBadge
        audio={player.audio}
        bpm={bpm}
        active={phase === 'running' && player.isPlaying}
        name={beat?.title ?? t('freestyle.titleAccent')}
        hits={wordsHit}
        shown={wordsShown}
      />

      {/* Unsupported browser notice */}
      {unsupported ? (
        <div className="mt-6">
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
        </div>
      ) : null}

      <div className="mt-6 space-y-5">
        {/* The stage: the target frame, the word, and the queue. */}
        <div className="stage-panel relative">
          <StageCanvas
            audio={player.audio}
            bpm={bpm}
            active={phase === 'running' && player.isPlaying}
            className="stage-canvas"
          />

          <WordGenerator
            running={phase === 'running'}
            intervalMs={settings.wordInterval * 1000}
            mode={settings.wordMode}
            burnMode={settings.burnMode}
            audio={player.audio}
            bpm={beat?.bpm ?? 0}
            onWordShown={handleWordShown}
            onWordHit={handleWordHit}
            onWordMissed={handleWordMissed}
          />

          {/* The pre-roll countdown, over the target frame. */}
          {phase === 'countdown' ? (
            <div className="stage-countdown" aria-live="assertive">
              <div className="text-center">
                <p key={countdown} className="stage-countdown-figure">
                  {countdown > 0 ? countdown : 'GO'}
                </p>
                <p className="stage-countdown-label">{t('freestyle.getReady')}</p>
              </div>
            </div>
          ) : null}

          {/* The session rail, at the foot of the stage. */}
          <div className="pb-5">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={settings.duration}
              aria-valuenow={Math.round(elapsed)}
              aria-label={t('freestyle.sessionProgress')}
              className="stage-rail"
            >
              <div
                className="stage-rail-fill"
                style={{
                  width: `${
                    settings.duration > 0
                      ? Math.min(100, (elapsed / settings.duration) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3 px-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-content-subtle">
                {beat?.title}
              </p>
              <p className="font-mono text-xs tnum text-content-muted">
                {t('freestyle.secondsLeft', { n: Math.ceil(remaining) })}
              </p>
            </div>
          </div>
        </div>

        {/* The session controls. */}
        <div className="flex flex-wrap items-center gap-2">
          {phase === 'running' ? (
            <button type="button" onClick={handleStopEarly} className="btn btn-primary">
              {t('freestyle.stopEarly')}
            </button>
          ) : null}
          {phase === 'setup' ? (
            <button type="button" onClick={handleStart} className="btn btn-primary">
              {unsupported ? t('freestyle.startPractice') : t('freestyle.startSession')}
            </button>
          ) : null}
          {phase === 'running' && !unsupported && !practiceMode ? (
            <span className="text-xs text-danger">{t('freestyle.recordingInProgress')}</span>
          ) : null}
          {phase === 'running' && (unsupported || practiceMode) ? (
            <span className="text-xs text-content-subtle">{t('freestyle.practiceMode')}</span>
          ) : null}
          {phase === 'setup' ? (
            <button type="button" onClick={onExit} className="btn btn-ghost">
              {t('freestyle.changeBeat')}
            </button>
          ) : null}
        </div>

        {/* The transport, so the beat can be heard and the take checked. */}
        <BeatPlayer beat={beat} player={player} showSeek />

        {!unsupported ? (
          <Recorder
            state={recorderState}
            elapsed={recorder.elapsed}
            error={recorderError}
            video={settings.video}
            stream={recorder.stream}
            sessionActive={phase === 'running' || phase === 'countdown'}
            onToggleVideo={(value) =>
              onSettingsChange({ ...settings, video: value })
            }
            onStart={handleStart}
            onStop={handleStopEarly}
            onRetry={prepare}
            onPractice={() => setPracticeMode(true)}
            practiceMode={practiceMode}
            targetSeconds={settings.duration}
          />
        ) : null}

        {/* Settings */}
        <div className="panel space-y-5 p-4">
          <div>
            {/* SegmentedControl renders its own legend, so no extra label
                goes above it — the two would read as a duplicate. */}
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
          </div>

          {/* The interval snaps to a whole number of beats so the words land
              on the grid — the readout shows the snapped value, not the raw
              slider position. */}
          <SliderField
            id="word-interval"
            label={t('freestyle.wordInterval')}
            value={settings.wordInterval}
            min={2}
            max={10}
            step={1}
            onChange={(value) =>
              onSettingsChange({ ...settings, wordInterval: value })
            }
            format={(v) => `${formatBeatInterval(v, bpm)}s`}
            note={
              bpm
                ? t('freestyle.beatsCount', {
                    n: snapToBeats(settings.wordInterval, bpm),
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

          <div>
            <p className="field-label">{t('freestyle.burnMode')}</p>
            <button
              type="button"
              role="switch"
              aria-checked={settings.burnMode}
              onClick={() =>
                onSettingsChange({ ...settings, burnMode: !settings.burnMode })
              }
              disabled={phase !== 'setup'}
              className={`segment-item border ${
                settings.burnMode
                  ? 'border-accent/45 bg-accent/16 text-accent'
                  : 'border-line text-content-muted hover:border-line-strong hover:text-content'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {settings.burnMode ? t('freestyle.burnOn') : t('freestyle.burnOff')}
            </button>
            <p className="mt-1.5 text-[11px] leading-snug text-content-subtle">
              {t('freestyle.burnHint')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

