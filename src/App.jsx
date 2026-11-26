import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import AppShell from './components/AppShell';
import YourBeatBar from './components/YourBeatBar';
import LandingScreen from './screens/LandingScreen';
import BeatSelectScreen from './screens/BeatSelectScreen';
import SetupScreen from './screens/SetupScreen';
import FreestyleScreen from './screens/FreestyleScreen';
import ResultsScreen from './screens/ResultsScreen';
import StatsScreen from './screens/StatsScreen';
import { BEATS, beatText } from './data/beats';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useMediaRecorder } from './hooks/useMediaRecorder';
import { useLanguage, useT } from './i18n/LanguageContext';
import { clearRuns, loadRuns, saveRun } from './lib/history';
import { SPRING_BOUNCY, screenVariants } from './lib/motion';
import { computeHypeScore, decodeSharePayload } from './lib/scoring';
import { describeUnsupported } from './lib/permissions';

const DEFAULT_SETTINGS = {
  duration: 60,
  wordInterval: 4,
  wordMode: 'random', // random | sequential
  burnMode: false,
  video: false,
  practice: false,
  battleMode: false,
  handle: '',
  opponent: '',
};

/**
 * The single-page state machine.
 *
 * Wrapped in `<MotionConfig reducedMotion="user">` so every Framer Motion
 * spring automatically respects `prefers-reduced-motion`.
 */
export default function App() {
  const [screen, setScreen] = useState('landing');
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [result, setResult] = useState(null);
  const [runs, setRuns] = useState([]);
  const [autoStartStage, setAutoStartStage] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const player = useAudioPlayer();
  const recorder = useMediaRecorder({ video: settings.video });

  const { locale } = useLanguage();
  const t = useT();

  const unsupported = useMemo(() => describeUnsupported(), []);

  const showToast = useCallback((message) => {
    if (!message) return;
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    setRuns(loadRuns());
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  /* -------------------------------------------- shared results from a link */

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith('#result=')) return;

    const payload = decodeSharePayload(hash.slice('#result='.length));
    if (!payload || typeof payload.s !== 'number') return;

    setResult({
      score: Math.max(0, Math.min(100, payload.s)),
      durationSeconds: payload.d ?? 0,
      targetSeconds: payload.d ?? 0,
      wordsShown: payload.t ?? 0,
      wordsHit: payload.w ?? 0,
      perfectHits: payload.p ?? 0,
      wordsMissed: 0,
      wordLog: [],
      completed: Boolean(payload.c),
      practiceMode: false,
      blob: null,
      video: false,
      beatId: payload.b || null,
      beatTitle: null,
      mediaType: '',
    });
    setScreen('results');
  }, []);

  /* ----------------------------------------------------------- navigation */

  const goToLanding = useCallback(() => {
    player.pause();
    setAutoStartStage(false);
    setScreen('landing');
  }, [player]);

  const goToSetup = useCallback(() => {
    player.pause();
    setScreen('setup');
  }, [player]);

  const goToStats = useCallback(() => {
    player.pause();
    setScreen('stats');
  }, [player]);

  const handleSelectBeat = useCallback((beat) => {
    setSelectedBeat(beat);
  }, []);

  const handleRandomBeat = useCallback(() => {
    setSelectedBeat(null);
  }, []);

  const launchFreestyle = useCallback(
    (auto = true) => {
      player.pause();
      let armed = selectedBeat;
      if (!armed) {
        armed = BEATS[Math.floor(Math.random() * BEATS.length)];
        setSelectedBeat(armed);
        showToast(t('toast.randomPicked', { title: armed.title }));
      }
      setAutoStartStage(auto);
      setScreen('freestyle');
    },
    [player, selectedBeat, showToast, t],
  );

  const handleComplete = useCallback(
    (raw) => {
      const { score: _ignored, ...rest } = raw;
      const { score } = computeHypeScore({
        durationSeconds: rest.durationSeconds,
        targetSeconds: rest.targetSeconds,
        wordsShown: rest.wordsShown,
        wordsHit: rest.wordsHit,
        timingRatio:
          rest.wordsHit > 0 ? (rest.perfectHits ?? 0) / rest.wordsHit : 0,
        completed: rest.completed,
        practiceMode: rest.practiceMode,
      });
      const finalResult = { ...rest, score };
      setResult(finalResult);
      const updated = saveRun(finalResult);
      setRuns(updated);
      setAutoStartStage(false);
      setScreen('results');
      showToast(t('toast.savedRun'));
    },
    [showToast, t],
  );

  const handleRestart = useCallback(() => {
    player.pause();
    recorder.reset();
    setResult(null);
    setAutoStartStage(true);
    setScreen('freestyle');
  }, [player, recorder]);

  const handleChangeBeat = useCallback(() => {
    player.pause();
    recorder.reset();
    setResult(null);
    setAutoStartStage(false);
    setScreen('landing');
  }, [player, recorder]);

  const handleResetStats = useCallback(() => {
    clearRuns();
    setRuns([]);
    showToast(t('stats.resetDone'));
  }, [showToast, t]);

  const handleNavigate = useCallback(
    (target) => {
      if (target === 'landing') return goToLanding();
      if (target === 'setup') return goToSetup();
      if (target === 'stats') return goToStats();
      if (target === 'beatSelect') return goToLanding();
      if (target === 'freestyle' && selectedBeat) return setScreen('freestyle');
      if (target === 'results' && result) return setScreen('results');
      return undefined;
    },
    [goToLanding, goToSetup, goToStats, result, selectedBeat],
  );

  /* -------------------------------------------------------------- render */

  const armedBeat = selectedBeat ?? null;
  const isRandom = !selectedBeat;
  const modeSummary =
    unsupported || settings.practice
      ? `🎧 ${t('setup.modePractice')}`
      : `🎤 ${t('setup.modeRecord')}`;
  const dockSubtitle = isRandom
    ? `${modeSummary} · ${settings.duration}s`
    : `${armedBeat.bpm} BPM · ${beatText(armedBeat, 'mood', locale)}`;

  const showDock = screen === 'landing' || screen === 'setup' || screen === 'beatSelect';

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen overflow-x-clip">
        {/* Subtle ambient sunset wash behind the shell. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background:
              'radial-gradient(65% 42% at 50% -10%, rgb(var(--color-accent) / 0.13), transparent 70%), radial-gradient(48% 36% at 88% 12%, rgb(var(--color-tertiary) / 0.09), transparent 72%)',
          }}
        />

        {/* Spring-animated floating Toast (GPU transform + opacity only) */}
        <AnimatePresence>
          {toast ? (
            <motion.div
              key={toast}
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: -14, x: '-50%', scale: 0.92 }}
              animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
              exit={{ opacity: 0, y: -10, x: '-50%', scale: 0.94 }}
              transition={SPRING_BOUNCY}
              className="fixed left-1/2 top-4 z-60 pointer-events-none rounded-full border border-accent/55 bg-surface-raised/95 px-4 py-2 text-xs font-medium text-content shadow-lift backdrop-blur-md"
            >
              {toast}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="relative z-10">
          <AppShell
            screen={screen}
            runCount={runs.length}
            onNavigate={handleNavigate}
            beatCount={BEATS.length}
            footer={
              showDock ? (
                <YourBeatBar
                  beat={armedBeat}
                  isRandom={isRandom}
                  isPlaying={player.isPlaying}
                  label={screen === 'setup' ? t('yourBeat.upNext') : t('yourBeat.label')}
                  subtitle={dockSubtitle}
                  showSettings={screen !== 'setup'}
                  onOpenSettings={goToSetup}
                  playLabel={
                    screen === 'setup' ? t('yourBeat.go') : `${t('yourBeat.play')} ›`
                  }
                  onPlay={() => launchFreestyle(true)}
                />
              ) : null
            }
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={screen}
                variants={screenVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {screen === 'landing' ? (
                  <LandingScreen
                    onStart={() => launchFreestyle(true)}
                    onOpenBeats={goToLanding}
                    beatCount={BEATS.length}
                    supported={!unsupported}
                    beats={BEATS}
                    player={player}
                    selectedBeat={selectedBeat}
                    onSelect={handleSelectBeat}
                    onRandomize={handleRandomBeat}
                  />
                ) : null}

                {screen === 'beatSelect' ? (
                  <BeatSelectScreen
                    beats={BEATS}
                    player={player}
                    selectedBeat={selectedBeat}
                    onSelect={handleSelectBeat}
                    onRandomize={handleRandomBeat}
                    onBack={goToLanding}
                  />
                ) : null}

                {screen === 'setup' ? (
                  <SetupScreen
                    beat={selectedBeat}
                    player={player}
                    settings={settings}
                    onSettingsChange={setSettings}
                    onBack={goToLanding}
                    unsupported={unsupported}
                  />
                ) : null}

                {screen === 'freestyle' ? (
                  <FreestyleScreen
                    beat={selectedBeat}
                    player={player}
                    recorder={recorder}
                    settings={settings}
                    onSettingsChange={setSettings}
                    onComplete={handleComplete}
                    onExit={goToLanding}
                    unsupported={unsupported}
                    autoStart={autoStartStage}
                  />
                ) : null}

                {screen === 'results' && result ? (
                  <ResultsScreen
                    result={result}
                    onRestart={handleRestart}
                    onChangeBeat={handleChangeBeat}
                    onHome={goToLanding}
                  />
                ) : null}

                {screen === 'stats' ? (
                  <StatsScreen
                    runs={runs}
                    onBack={goToLanding}
                    onReset={handleResetStats}
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>
          </AppShell>
        </div>
      </div>
    </MotionConfig>
  );
}
