import StageCanvas from './StageCanvas';
import { useT } from '../i18n/LanguageContext';

/**
 * The player badge.
 *
 * The canvas behind it draws the equalizer ring — a circle of ticks that
 * breathe with the beat — so the player's info sits in the middle of the
 * pulse rather than above it.
 *
 * The tempo comes from the beat that is loaded; it is never a constant.
 */
export default function MicBadge({ audio, bpm, active, name, hits, shown }) {
  const t = useT();

  return (
    <div className="relative mx-auto h-[15rem] w-full max-w-[26rem]">
      {/* The equalizer ring and the ambient light behind the stage. */}
      <StageCanvas
        audio={audio}
        bpm={bpm}
        active={active}
        className="absolute inset-0 h-full w-full"
      />

      {/* The player's info, in the middle of the ring. */}
      <div className="absolute inset-0 z-10 grid place-items-center">
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-content-subtle">
            {t('freestyle.onTheMic')}
          </p>
          <p className="mt-1.5 max-w-[13rem] truncate text-2xl font-bold tracking-tight text-content">
            {name}
          </p>
          {bpm ? (
            <p className="mt-1 font-mono text-sm font-semibold tnum text-accent">{bpm} BPM</p>
          ) : null}
        </div>
      </div>

      {/* The hit counter, below the ring. */}
      <div className="absolute inset-x-0 bottom-1 z-10 flex justify-center">
        <span className="stage-pill">
          {t('freestyle.hitsLabel')}
          <span className="stage-pill-value">
            {hits}
            <span className="text-content-subtle">/{shown}</span>
          </span>
        </span>
      </div>
    </div>
  );
}
