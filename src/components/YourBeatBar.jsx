import { useT } from '../i18n/LanguageContext';

/**
 * The "Your beat" bar.
 *
 * A single strip showing the beat currently armed for the next session, with
 * the action to start it. It sits above the footer, so the play button is
 * always in the same place.
 */
export default function YourBeatBar({
  beat,
  subtitle,
  isRandom = false,
  onRandomize,
  onPlay,
  playDisabled = false,
}) {
  const t = useT();

  return (
    <div className="mt-8 flex items-center gap-3 rounded-lg border border-line px-4 py-3">
      {/* Beat art */}
      <div className="shrink-0">
        {beat && !isRandom ? (
          <img
            src={`/waveforms/${beat.id}.png`}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-md bg-surface-overlay object-contain p-1"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-overlay text-lg"
          >
            🎲
          </span>
        )}
      </div>

      {/* Beat name + status */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-content">
          {beat && !isRandom ? beat.title : t('yourBeat.random')}
        </p>
        <p className="truncate text-xs text-content-muted">{subtitle}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isRandom ? (
          <button
            type="button"
            onClick={onRandomize}
            className="btn btn-secondary hidden h-9 sm:inline-flex"
          >
            {t('yourBeat.shuffle')}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onPlay}
          disabled={playDisabled}
          className="btn btn-primary h-9 px-4"
        >
          {t('yourBeat.play')}
        </button>
      </div>
    </div>
  );
}
