import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import AppShell from './components/AppShell';
import AuthModal from './components/AuthModal';
import BeatUploadModal from './components/BeatUploadModal';
import YourBeatBar from './components/YourBeatBar';
import LandingScreen from './screens/LandingScreen';
import BeatSelectScreen from './screens/BeatSelectScreen';
import SetupScreen from './screens/SetupScreen';
import FreestyleScreen from './screens/FreestyleScreen';
import ResultsScreen from './screens/ResultsScreen';
import StatsScreen from './screens/StatsScreen';
import VoteScreen from './screens/VoteScreen';
import { BEATS, beatText } from './data/beats';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useMediaRecorder } from './hooks/useMediaRecorder';
import { useLanguage, useT } from './i18n/LanguageContext';
import { deleteCustomBeat, loadCustomBeats } from './lib/customBeats';
import { clearRuns, loadRuns, saveRun } from './lib/history';
import { SPRING_BOUNCY, screenVariants } from './lib/motion';
import { computeHypeScore, decodeSharePayload } from './lib/scoring';
import { describeUnsupported } from './lib/permissions';
import { loadPublicRhymeBank } from './lib/rhymeEngine';
import { ensureDemoSeeded, getCurrentUser } from './lib/vclStore';

const DEFAULT_SETTINGS = {
  duration: 60,
  bars: 16, // 8 | 16 (default) | 32 | 'full'
  difficulty: 'easy', // 'easy' (Dễ) | 'medium' (Vừa) | 'hard' (Khó)
  flow: 'beat4', // 'beat4' (Phách 4) | 'beat24' (Phách 2 & 4)
  countIn: true, // Bật (4 bar) | Tắt
  wordInterval: 4,
  wordMode: 'random',
  burnMode: false,
  video: true,
  practice: false,
  battleMode: false,
  handle: '',
  opponent: '',
};

/** Parses `/cham/<code>` or `#cham/<code>?u=<viewerId>&src=<source>` from window.location. */
function parseVoteRouteFromWindow() {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  const path = window.location.pathname || '';

  let raw = '';
  if (hash.startsWith('#cham/')) {
    raw = hash.slice('#cham/'.length);
  } else if (path.startsWith('/cham/')) {
    raw = path.slice('/cham/'.length) + (window.location.search || '');
  }
  if (!raw) return null;

  const [codePart, queryPart = ''] = raw.split('?');
  const code = decodeURIComponent(codePart || '').replace(/\/+$/, '');
  if (!code) return null;
  const params = new URLSearchParams(queryPart);
  return {
    code,
    viewerId: params.get('u') || '',
    source: params.get('src') || (params.get('u') ? 'social' : 'web'),
  };
}

/**
 * The single-page state machine.
 */
export default function App() {
  const [screen, setScreen] = useState('landing');
  const [customBeats, setCustomBeats] = useState([]);
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [result, setResult] = useState(null);
  const [runs, setRuns] = useState([]);
  const [autoStartStage, setAutoStartStage] = useState(false);
  const [toast, setToast] = useState(null);
  const [user, setUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [voteRoute, setVoteRoute] = useState(null); // { code, viewerId, source }
  const [dataVersion, setDataVersion] = useState(0);
  const toastTimerRef = useRef(null);

  const player = useAudioPlayer();
  const recorder = useMediaRecorder({ video: settings.video });

  const { locale } = useLanguage();
  const t = useT();

  const unsupported = useMemo(() => describeUnsupported(), []);
  const allBeats = useMemo(() => [...customBeats, ...BEATS], [customBeats]);

  const showToast = useCallback((message) => {
    if (!message) return;
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // Hydrate demo auth, public rhyme bank, custom beats (IndexedDB), local runs, and hash/path routes.
  useEffect(() => {
    ensureDemoSeeded();
    loadPublicRhymeBank();
    const current = getCurrentUser();
    setUser(current);
    if (current?.socialHandle) {
      setSettings((prev) => (prev.handle ? prev : { ...prev, handle: current.socialHandle }));
    }
    setRuns(loadRuns());
    loadCustomBeats().then((loaded) => {
      if (loaded.length > 0) setCustomBeats(loaded);
    });

    const syncRoute = () => {
      const vote = parseVoteRouteFromWindow();
      if (vote) {
        setVoteRoute(vote);
        setScreen('vote');
        return;
      }

      const hash = window.location.hash;
      if (hash.startsWith('#result=')) {
        const payload = decodeSharePayload(hash.slice('#result='.length));
        if (payload && typeof payload.s === 'number') {
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
        }
      }
    };

    syncRoute();
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('hashchange', syncRoute);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  /* ----------------------------------------------------------- navigation */

  const clearHashIfVote = () => {
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#cham/')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  const goToLanding = useCallback(() => {
    player.pause();
    clearHashIfVote();
    setAutoStartStage(false);
    setScreen('landing');
  }, [player]);

  const goToSetup = useCallback(() => {
    player.pause();
    clearHashIfVote();
    setScreen('setup');
  }, [player]);

  const goToStats = useCallback(() => {
    player.pause();
    clearHashIfVote();
    setDataVersion((v) => v + 1);
    setScreen('stats');
  }, [player]);

  const openVotePage = useCallback(
    (code, viewerId = '') => {
      player.pause();
      setVoteRoute({ code, viewerId, source: 'web' });
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `${window.location.pathname}#cham/${code}`);
      }
      setScreen('vote');
    },
    [player],
  );

  const handleSelectBeat = useCallback((beat) => {
    setSelectedBeat(beat);
  }, []);

  const handleRandomBeat = useCallback(() => {
    setSelectedBeat(null);
  }, []);

  const handleBeatUploaded = useCallback(
    (newBeat) => {
      setCustomBeats((prev) => [newBeat, ...prev]);
      setSelectedBeat(newBeat);
      showToast(t('upload.toastAdded', { title: newBeat.title }));
    },
    [showToast, t],
  );

  const handleDeleteCustomBeat = useCallback(
    async (beatId) => {
      await deleteCustomBeat(beatId);
      setCustomBeats((prev) => prev.filter((b) => b.id !== beatId));
      setSelectedBeat((prev) => (prev?.id === beatId ? null : prev));
      showToast(t('upload.toastDeleted'));
    },
    [showToast, t],
  );

  const handleAuthChange = useCallback(
    (nextUser) => {
      setUser(nextUser);
      setDataVersion((v) => v + 1);
      if (nextUser) {
        setSettings((prev) => ({ ...prev, handle: nextUser.socialHandle }));
        showToast(t('auth.welcomeToast', { name: nextUser.displayName }));
      } else {
        showToast(t('auth.logoutToast'));
      }
    },
    [showToast, t],
  );

  const launchFreestyle = useCallback(
    (auto = true) => {
      player.pause();
      let armed = selectedBeat;
      if (!armed) {
        armed = allBeats[Math.floor(Math.random() * allBeats.length)];
        setSelectedBeat(armed);
        showToast(t('toast.randomPicked', { title: armed.title }));
      }
      setAutoStartStage(auto);
      setScreen('freestyle');
    },
    [allBeats, player, selectedBeat, showToast, t],
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
      : `🏆 ${t('setup.modeCompete')}`;
  const barsSummary = settings.bars === 'full' ? t('setup.fullTrack') : `${settings.bars ?? 16} bar`;
  const dockSubtitle = isRandom
    ? `${modeSummary} · ${barsSummary}`
    : `${armedBeat.bpm} BPM · ${barsSummary} · ${beatText(armedBeat, 'mood', locale)}`;

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

        {/* Spring-animated floating Toast */}
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
            beatCount={allBeats.length}
            user={user}
            onOpenAuth={() => setAuthModalOpen(true)}
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
                    onOpenUpload={() => setUploadModalOpen(true)}
                    onDeleteCustomBeat={handleDeleteCustomBeat}
                    beatCount={allBeats.length}
                    supported={!unsupported}
                    beats={allBeats}
                    player={player}
                    selectedBeat={selectedBeat}
                    onSelect={handleSelectBeat}
                    onRandomize={handleRandomBeat}
                  />
                ) : null}

                {screen === 'beatSelect' ? (
                  <BeatSelectScreen
                    beats={allBeats}
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
                    user={user}
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
                    user={user}
                  />
                ) : null}

                {screen === 'results' && result ? (
                  <ResultsScreen
                    result={result}
                    user={user}
                    onOpenAuth={() => setAuthModalOpen(true)}
                    onOpenVote={(code) => openVotePage(code)}
                    onSubmitted={() => {
                      setUser(getCurrentUser());
                      setDataVersion((v) => v + 1);
                      showToast(t('submit.toastSubmitted'));
                    }}
                    onRestart={handleRestart}
                    onChangeBeat={handleChangeBeat}
                    onHome={goToLanding}
                  />
                ) : null}

                {screen === 'stats' ? (
                  <StatsScreen
                    runs={runs}
                    dataVersion={dataVersion}
                    onOpenVote={(code) => openVotePage(code)}
                    onBack={goToLanding}
                    onReset={handleResetStats}
                  />
                ) : null}

                {screen === 'vote' && voteRoute ? (
                  <VoteScreen
                    voteCode={voteRoute.code}
                    viewerIdParam={voteRoute.viewerId}
                    sourceParam={voteRoute.source}
                    user={user}
                    player={player}
                    extraBeats={customBeats}
                    onBack={goToStats}
                    onDataChanged={() => {
                      setUser(getCurrentUser());
                      setDataVersion((v) => v + 1);
                    }}
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>
          </AppShell>
        </div>

        {/* Demo Auth Modal */}
        <AuthModal
          open={authModalOpen}
          user={user}
          onClose={() => setAuthModalOpen(false)}
          onAuthChange={handleAuthChange}
        />

        {/* Custom Audio Beat Upload Modal */}
        <BeatUploadModal
          open={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onUploaded={handleBeatUploaded}
        />
      </div>
    </MotionConfig>
  );
}
