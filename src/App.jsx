import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from './components/AppShell';
import YourBeatBar from './components/YourBeatBar';
import LandingScreen from './screens/LandingScreen';
import BeatSelectScreen from './screens/BeatSelectScreen';
import FreestyleScreen from './screens/FreestyleScreen';
import ResultsScreen from './screens/ResultsScreen';
import { BEATS, beatText } from './data/beats';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useMediaRecorder } from './hooks/useMediaRecorder';
import { useLanguage, useT } from './i18n/LanguageContext';
import { computeHypeScore, decodeSharePayload } from './lib/scoring';
import { describeUnsupported } from './lib/permissions';

const DEFAULT_SETTINGS = {
  duration: 60,
  wordInterval: 4,
  wordMode: 'random', // random | sequential
  burnMode: false,
  video: false,
};

/**
 * The single-page state machine.
 *
 * Screens: landing → beatSelect → freestyle → results
 */
export default function App() {
  const [screen, setScreen] = useState('landing');
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [result, setResult] = useState(null);

  const player = useAudioPlayer();
  const recorder = useMediaRecorder({ video: settings.video });

  const { locale } = useLanguage();
  const t = useT();

  const unsupported = useMemo(() => describeUnsupported(), []);

  /* -------------------------------------------- shared results from a link */

  // A share link puts a #result=... payload in the URL. Decode it and jump
  // straight to the results screen so the link shows something meaningful.
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

  const goToBeats = useCallback(() => {
    player.pause();
    setScreen('beatSelect');
  }, [player]);

  const goToLanding = useCallback(() => {
    player.pause();
    setScreen('landing');
  }, [player]);

  // Clicking a beat arms it in the bottom bar. The session starts from the
  // bar's Play button, so the choice can still be changed before committing.
  const handleSelectBeat = useCallback((beat) => {
    setSelectedBeat(beat);
  }, []);

  // "Random beat" picks one from the crate without the user choosing.
  const handleRandomBeat = useCallback(() => {
    const pick = BEATS[Math.floor(Math.random() * BEATS.length)];
    setSelectedBeat(pick);
  }, []);

  // Reshuffle while the random option is still armed.
  const handleShuffleBeat = useCallback(() => {
    setSelectedBeat((current) => {
      const options = BEATS.filter((b) => b.id !== current?.id);
      const pool = options.length ? options : BEATS;
      return pool[Math.floor(Math.random() * pool.length)];
    });
  }, []);

  const handleComplete = useCallback((raw) => {
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
    setResult({ ...rest, score });
    setScreen('results');
  }, []);

  const handleRestart = useCallback(() => {
    player.pause();
    recorder.reset();
    setResult(null);
    setScreen('freestyle');
  }, [player, recorder]);

  const handleChangeBeat = useCallback(() => {
    player.pause();
    recorder.reset();
    setResult(null);
    setScreen('beatSelect');
  }, [player, recorder]);

  // The side rail can jump between the stages of a run. The shell disables
  // the entries that are not reachable yet, so this only has to move state.
  const handleNavigate = useCallback(
    (target) => {
      if (target === 'landing') return goToLanding();
      if (target === 'beatSelect') return goToBeats();
      if (target === 'freestyle' && selectedBeat) return setScreen('freestyle');
      if (target === 'results' && result) return setScreen('results');
      return undefined;
    },
    [goToBeats, goToLanding, result, selectedBeat],
  );

  /* -------------------------------------------------------------- render */

  const playing = player.isPlaying;

  // The beat armed for the next run. "Random" is the default state — it picks
  // one from the crate on shuffle, and the user can still override it.
  const armedBeat = selectedBeat ?? null;
  const isRandom = !selectedBeat;

  return (
    <div className="relative min-h-screen">
      <div className="relative z-10 px-2 py-3 sm:px-4 sm:py-6">
        <AppShell
          onNavigate={handleNavigate}
          beatCount={BEATS.length}
          footer={
            screen === 'beatSelect' ? (
              <YourBeatBar
                beat={armedBeat}
                isRandom={isRandom}
                subtitle={
                  isRandom
                    ? t('yourBeat.practice', { bars: 16, mood: t('freestyle.practiceMode') })
                    : t('yourBeat.selected', {
                        bpm: armedBeat?.bpm ?? 0,
                        mood: armedBeat ? beatText(armedBeat, 'mood', locale) : '',
                      })
                }
                onRandomize={handleShuffleBeat}
                onPlay={() => {
                  // With nothing armed, a random pick stands in. React batches
                  // these two updates, so the session sees the armed beat.
                  if (!selectedBeat) {
                    setSelectedBeat(BEATS[Math.floor(Math.random() * BEATS.length)]);
                  }
                  setScreen('freestyle');
                }}
              />
            ) : null
          }
        >
          {screen === 'landing' ? (
            <LandingScreen
              onStart={goToBeats}
              onOpenBeats={goToBeats}
              beatCount={BEATS.length}
              supported={!unsupported}
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

          {screen === 'freestyle' ? (
            <FreestyleScreen
              beat={selectedBeat}
              player={player}
              recorder={recorder}
              settings={settings}
              onSettingsChange={setSettings}
              onComplete={handleComplete}
              onExit={goToBeats}
              unsupported={unsupported}
            />
          ) : null}

          {screen === 'results' && result ? (
            <ResultsScreen
              result={result}
              onRestart={handleRestart}
              onChangeBeat={handleChangeBeat}
            />
          ) : null}
        </AppShell>
      </div>
    </div>
  );
}
