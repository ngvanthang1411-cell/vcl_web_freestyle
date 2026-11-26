import { motion } from 'framer-motion';
import BeatCover from './BeatCover';
import { BUTTON_HOVER, BUTTON_TAP, SPRING_SMOOTH, SPRING_SNAPPY } from '../lib/motion';
import { useT } from '../i18n/LanguageContext';

/**
 * Floating frosted bottom dock ("Your beat" / "Up next") with Framer Motion
 * spring physics for tactile button feedback and smooth entrance.
 */
export default function YourBeatBar({
  beat,
  subtitle,
  isRandom = false,
  isPlaying = false,
  label,
  playLabel,
  showSettings = false,
  onOpenSettings,
  onRandomize,
  onPlay,
  playDisabled = false,
}) {
  const t = useT();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_SMOOTH}
      className="ygb-dock"
    >
      <div className={`ygb-dock-in ${beat && !isRandom ? 'armed' : ''}`}>
        {/* Beat art */}
        <div className="shrink-0">
          {beat && !isRandom ? (
            <BeatCover beat={beat} playing={isPlaying} size="sm" />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-surface-overlay text-lg shadow-inner"
            >
              🎲
            </span>
          )}
        </div>

        {/* Beat name + status */}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-subtle">
            {label ?? t('yourBeat.label')}
          </p>
          <p className="truncate text-sm font-bold leading-tight text-content">
            {beat && !isRandom ? beat.title : t('yourBeat.random')}
          </p>
          <p className="truncate text-[11px] text-content-muted">{subtitle}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {showSettings && onOpenSettings ? (
            <motion.button
              type="button"
              onClick={onOpenSettings}
              aria-label={t('yourBeat.settingsAria')}
              title={t('setup.title')}
              whileHover={{ rotate: 40, scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              transition={SPRING_SNAPPY}
              className="ygb-dock-gear"
            >
              ⚙
            </motion.button>
          ) : isRandom && onRandomize ? (
            <motion.button
              type="button"
              onClick={onRandomize}
              whileHover={BUTTON_HOVER}
              whileTap={BUTTON_TAP}
              transition={SPRING_SNAPPY}
              className="btn btn-secondary hidden h-10 sm:inline-flex"
            >
              {t('yourBeat.shuffle')}
            </motion.button>
          ) : null}

          <motion.button
            type="button"
            onClick={onPlay}
            disabled={playDisabled}
            whileHover={playDisabled ? undefined : { y: -1.5, scale: 1.035 }}
            whileTap={playDisabled ? undefined : { scale: 0.95 }}
            transition={SPRING_SNAPPY}
            className="ygb-dock-go"
          >
            <span>{playLabel ?? `${t('yourBeat.play')} ›`}</span>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
