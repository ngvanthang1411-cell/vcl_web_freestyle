import { memo } from 'react';
import { motion } from 'framer-motion';
import BeatPulseBar from './BeatPulseBar';
import { formatClock } from './ui';
import { BUTTON_HOVER, BUTTON_TAP, SPRING_SNAPPY } from '../lib/motion';
import { useT } from '../i18n/LanguageContext';

/**
 * The transport for the selected beat: play/pause, live 60fps BeatPulseBar,
 * GPU-composited progress rail (`scaleX`), seek slider, and clock.
 */
const BeatPlayer = memo(function BeatPlayer({ beat, player, showSeek = false }) {
  const t = useT();
  const { isPlaying, currentTime, duration, play, pause, seek, audio, analyserRef } = player;

  const total = duration || beat?.duration || 0;
  const ratio = total > 0 ? Math.min(1, Math.max(0, currentTime / total)) : 0;

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

      {/* Live 60fps BPM + FFT Beat Pulse Bar */}
      <BeatPulseBar
        audio={audio}
        analyserRef={analyserRef}
        bpm={beat?.bpm ?? 0}
        isPlaying={isPlaying}
        compact
        className="mt-3"
      />

      {/* Transport */}
      <div className="mt-3 flex items-center gap-3">
        <motion.button
          type="button"
          onClick={toggle}
          disabled={!beat}
          whileHover={!beat ? undefined : BUTTON_HOVER}
          whileTap={!beat ? undefined : BUTTON_TAP}
          transition={SPRING_SNAPPY}
          className="btn btn-primary shrink-0"
        >
          {isPlaying ? t('player.pause') : t('player.play')}
        </motion.button>

        <span className="ml-auto font-mono text-xs tnum text-content-muted">
          {formatClock(currentTime)} / {formatClock(total)}
        </span>
      </div>

      {/* Seek + GPU scaleX progress bar (zero layout thrashing) */}
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
            <div
              className="track-fill h-full w-full origin-left will-change-transform"
              style={{ transform: `scaleX(${ratio.toFixed(4)})` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default BeatPlayer;
