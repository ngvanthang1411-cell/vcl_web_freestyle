import { memo } from 'react';
import StageCanvas from './StageCanvas';
import { useT } from '../i18n/LanguageContext';

/**
 * The 3-column rhythm stage header matching the reference video:
 *  - Left:   dark pill with mic icon + @handle
 *  - Center: golden-orange sunburst equalizer ring (live FFT spectrum)
 *            with ON THE MIC / @NAME / BPM centered inside
 *  - Right:  orange HITS + bold white 0/16 readout (+ streak pill when active)
 */
const MicBadge = memo(function MicBadge({
  audio,
  analyserRef = null,
  bpm,
  active,
  name,
  handle = '',
  hits,
  shown,
  streak = 0,
}) {
  const t = useT();
  const leftLabel = handle ? `@${handle}` : name;

  return (
    <div className="relative mx-auto flex w-full max-w-[34rem] items-center justify-between gap-2 px-4 pt-2 sm:px-6">
      {/* Left handle pill */}
      <div className="flex min-w-0 flex-1 justify-start">
        <span className="stage-handle-pill max-w-[8.5rem] truncate sm:max-w-[10rem]">
          <span aria-hidden="true" className="text-xs opacity-80">
            🎤
          </span>
          <span className="truncate font-semibold text-content">{leftLabel}</span>
        </span>
      </div>

      {/* Center sunburst equalizer ring */}
      <div className="relative h-[9.5rem] w-[9.5rem] shrink-0 sm:h-[11.25rem] sm:w-[11.25rem]">
        <StageCanvas
          audio={audio}
          analyserRef={analyserRef}
          bpm={bpm}
          active={active}
          variant="ring"
          className="absolute inset-0 h-full w-full"
        />

        <div className="absolute inset-0 z-10 grid place-items-center px-5">
          <div className="text-center">
            <p className="text-[8.5px] font-semibold uppercase tracking-[0.22em] text-content-subtle sm:text-[9.5px]">
              {t('freestyle.onTheMic')}
            </p>
            <p className="mt-0.5 max-w-[6.8rem] truncate text-base font-extrabold uppercase tracking-tight text-content sm:text-xl">
              {name}
            </p>
            {bpm ? (
              <p className="mt-0.5 font-mono text-[10px] font-bold tnum text-accent-light sm:text-[11px]">
                {bpm} BPM
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Right HITS counter */}
      <div className="flex min-w-0 flex-1 flex-col items-end gap-1">
        <span className="inline-flex items-baseline gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] sm:text-xs">
          <span className="text-accent-light">{t('freestyle.hitsLabel')}</span>
          <span className="font-mono text-sm font-extrabold tnum text-content">
            {hits}
            <span className="text-content-subtle">/{shown}</span>
          </span>
        </span>

        {streak >= 2 ? (
          <span
            key={streak}
            className="animate-fade-up rounded-full border border-accent/55 bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent-lighter"
          >
            🔥 {t('stage.streak', { n: streak })}
          </span>
        ) : null}
      </div>
    </div>
  );
});

export default MicBadge;
