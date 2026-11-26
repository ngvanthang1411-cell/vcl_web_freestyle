import { useEffect, useState } from 'react';
import { formatClock } from '../components/ui';
import { beatText } from '../data/beats';
import { useLanguage, useT } from '../i18n/LanguageContext';

/**
 * Beat selection — a list of beats with preview playback.
 *
 * Only one beat previews at a time; selecting a beat arms it for the
 * session.
 *
 * Each row carries a waveform thumbnail generated from the actual audio (see
 * scripts/generate-waveforms.mjs), so the art always matches the track.
 */
export default function BeatSelectScreen({
  beats,
  selectedBeat,
  onSelect,
  onRandomize,
  onBack,
  player,
}) {
  const { play, pause, isPlaying, currentTime } = player;
  const { locale } = useLanguage();
  const t = useT();
  // Which card is previewing, so a re-render reflects the transport state.
  const [activeBeatId, setActiveBeatId] = useState(null);

  // Stop any preview when the screen unmounts.
  useEffect(() => {
    return () => {
      pause();
    };
  }, [pause]);

  const handlePreview = async (beat) => {
    if (activeBeatId === beat.id && isPlaying) {
      pause();
      setActiveBeatId(null);
      return;
    }
    setActiveBeatId(beat.id);
    await play(beat.src);
  };

  const handleSelect = (beat) => {
    pause();
    setActiveBeatId(null);
    onSelect(beat);
  };

  return (
    <div>
      <h1 className="text-[clamp(1.75rem,5vw,2.5rem)] font-semibold leading-tight tracking-tight text-content">
        {t('beats.titlePrefix')}{' '}
        <span className="text-accent">{t('beats.titleAccent')}</span>
      </h1>
      <p className="mt-2 text-sm text-content-muted">
        {t('beats.subtitle', { count: beats.length })}
      </p>

      <ul className="mt-8 space-y-3">
        {/* The random pick — the default way in, and always the first row. */}
        <li>
          <button
            type="button"
            onClick={onRandomize}
            className="flex w-full items-center gap-4 rounded-lg border border-line px-4 py-3 text-left transition-colors hover:border-line-strong"
          >
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface-overlay text-xl"
            >
              🎲
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold tracking-tight text-content">
                {t('beats.randomTitle')}
              </span>
              <span className="mt-0.5 block truncate text-xs text-content-muted">
                {t('beats.randomBody')}
              </span>
            </span>
          </button>
        </li>

        {beats.map((beat) => {
          const previewing = activeBeatId === beat.id && isPlaying;
          const progress = previewing && beat.duration
            ? Math.min(100, (currentTime / beat.duration) * 100)
            : 0;

          return (
            <li key={beat.id}>
              <div
                className={`rounded-lg border px-4 py-3 ${
                  selectedBeat?.id === beat.id ? 'border-accent/60' : 'border-line'
                }`}
              >
                {/* The art and the text sit side by side. On narrow screens
                    the actions drop below, so the title and mood get the
                    full width instead of being squeezed by the buttons. */}
                <div className="flex items-center gap-3">
                  <img
                    src={`/waveforms/${beat.id}.png`}
                    alt=""
                    width={48}
                    height={48}
                    className="h-12 w-12 shrink-0 rounded-md bg-surface-overlay object-contain p-1"
                    loading="lazy"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold leading-tight tracking-tight text-content">
                      {beat.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug text-content-muted">
                      {beatText(beat, 'mood', locale)}
                    </p>
                    <p className="mt-1 font-mono text-xs tnum text-content-subtle">
                      {beat.bpm} BPM · {formatClock(beat.duration)}
                    </p>

                    {/* The preview progress, shown while the row is playing. */}
                    {previewing ? (
                      <div aria-hidden="true" className="track mt-2 h-[3px]">
                        <div className="track-fill" style={{ width: `${progress}%` }} />
                      </div>
                    ) : null}
                  </div>

                  <div className="hidden shrink-0 items-center gap-2 sm:flex">
                    <button
                      type="button"
                      onClick={() => handlePreview(beat)}
                      aria-label={
                        previewing
                          ? t('beats.pauseAria', { title: beat.title })
                          : t('beats.previewAria', { title: beat.title })
                      }
                      className="btn btn-ghost h-9 w-9 p-0"
                    >
                      {previewing ? <PauseIcon /> : <PlayIcon />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelect(beat)}
                      className="btn btn-secondary h-9"
                    >
                      {t('beats.select')}
                    </button>
                  </div>
                </div>

                {/* On mobile the same actions, stacked below the text. */}
                <div className="mt-3 flex items-center gap-2 sm:hidden">
                  <button
                    type="button"
                    onClick={() => handlePreview(beat)}
                    aria-label={
                      previewing
                        ? t('beats.pauseAria', { title: beat.title })
                        : t('beats.previewAria', { title: beat.title })
                    }
                    className="btn btn-ghost h-9 w-9 p-0"
                  >
                    {previewing ? <PauseIcon /> : <PlayIcon />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelect(beat)}
                    className="btn btn-secondary h-9 flex-1"
                  >
                    {t('beats.select')}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <button type="button" onClick={onBack} className="btn btn-ghost mt-8">
        {t('beats.back')}
      </button>
    </div>
  );
}

/** Play triangle. */
function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <path d="M4 2.5v9l7-4.5z" />
    </svg>
  );
}

/** Pause bars. */
function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <rect x="3.5" y="2.5" width="2.5" height="9" rx="0.5" />
      <rect x="8" y="2.5" width="2.5" height="9" rx="0.5" />
    </svg>
  );
}
