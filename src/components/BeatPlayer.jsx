import { formatClock } from './ui';
import { useT } from '../i18n/LanguageContext';

/**
 * The transport for the selected beat: play/pause, seek, and the time.
 *
 * The beat loops for the whole session, so there is no loop control to show.
 */
export default function BeatPlayer({ beat, player, showSeek = false }) {
  const t = useT();
  const { isPlaying, currentTime, duration, play, pause, seek } = player;

  const total = duration || beat?.duration || 0;
  const progress = total > 0 ? Math.min(100, (currentTime / total) * 100) : 0;

  const toggle = async () => {
    if (isPlaying) {
      pause();
    } else if (beat) {
      await play(beat.src);
    }
  };

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-content">
          {beat?.title ?? '—'}
        </p>
        {beat ? <span className="chip tnum shrink-0">{beat.bpm} BPM</span> : null}
      </div>

      {/* Transport */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!beat}
          className="btn btn-primary shrink-0"
        >
          {isPlaying ? t('player.pause') : t('player.play')}
        </button>

        <span className="ml-auto font-mono text-xs tnum text-content-muted">
          {formatClock(currentTime)} / {formatClock(total)}
        </span>
      </div>

      {/* Progress */}
      {showSeek ? (
        <div className="mt-3">
          <input
            type="range"
            className="range"
            min={0}
            max={Math.max(1, total)}
            step={0.1}
            value={Math.min(currentTime, total)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label={t('player.seekAria')}
          />
          <div aria-hidden="true" className="track mt-2 h-[3px]">
            <div className="track-fill h-full" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
