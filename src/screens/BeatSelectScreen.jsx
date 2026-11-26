import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import BeatCover from '../components/BeatCover';
import { formatClock } from '../components/ui';
import { BEAT_VIBES, beatText } from '../data/beats';
import { useLanguage, useT } from '../i18n/LanguageContext';
import {
  BUTTON_HOVER,
  BUTTON_TAP,
  CARD_HOVER,
  SPRING_SNAPPY,
  cardContainerVariants,
  cardItemVariants,
} from '../lib/motion';

/**
 * Beat selection — a list of beats with Framer Motion spring cards, animated
 * covers, GPU scaleX progress rail, and preview playback.
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
  const [activeBeatId, setActiveBeatId] = useState(null);
  const [vibe, setVibe] = useState('All');

  useEffect(() => {
    return () => {
      pause();
    };
  }, [pause]);

  const vibeCounts = useMemo(() => {
    const counts = { All: beats.length };
    for (const b of beats) {
      if (b.vibe) counts[b.vibe] = (counts[b.vibe] || 0) + 1;
    }
    return counts;
  }, [beats]);

  const availableVibes = useMemo(
    () => BEAT_VIBES.filter((v) => v === 'All' || (vibeCounts[v] ?? 0) > 0),
    [vibeCounts],
  );

  const visibleBeats = useMemo(() => {
    if (vibe === 'All') return beats;
    return beats.filter((b) => b.vibe === vibe);
  }, [beats, vibe]);

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
      <h1 className="text-[clamp(1.75rem,5vw,2.5rem)] font-bold leading-tight tracking-tight text-content">
        {t('beats.titlePrefix')}{' '}
        <span className="bg-gradient-to-r from-accent to-secondary bg-clip-text text-transparent">
          {t('beats.titleAccent')}
        </span>
      </h1>
      <p className="mt-1.5 text-sm text-content-muted">
        {t('beats.subtitle', { count: beats.length })}
      </p>

      {availableVibes.length > 1 ? (
        <div className="ygb-vibes mt-5">
          {availableVibes.map((item) => (
            <motion.button
              key={item}
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.95 }}
              transition={SPRING_SNAPPY}
              onClick={() => setVibe(item)}
              className={`ygb-vibe ${vibe === item ? 'on' : ''}`}
            >
              <span>{item === 'All' ? t('home.vibeAll') : item}</span>
              <small>{vibeCounts[item] ?? 0}</small>
            </motion.button>
          ))}
        </div>
      ) : null}

      <motion.ul
        key={vibe}
        variants={cardContainerVariants}
        initial="initial"
        animate="animate"
        className="mt-5 space-y-2.5"
      >
        {vibe === 'All' ? (
          <motion.li variants={cardItemVariants}>
            <motion.button
              type="button"
              whileHover={CARD_HOVER}
              whileTap={{ scale: 0.985 }}
              transition={SPRING_SNAPPY}
              onClick={onRandomize}
              className={`ygb-beat-card flex w-full items-center gap-3.5 p-3 text-left ${
                !selectedBeat ? 'on' : ''
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-[3.15rem] w-[3.15rem] shrink-0 items-center justify-center rounded-[11px] bg-surface-overlay text-xl"
              >
                🎲
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold tracking-tight text-content">
                  {t('beats.randomTitle')}
                </span>
                <span className="mt-0.5 block truncate text-xs text-content-muted">
                  {t('beats.randomBody')}
                </span>
              </span>
            </motion.button>
          </motion.li>
        ) : null}

        {visibleBeats.map((beat) => {
          const previewing = activeBeatId === beat.id && isPlaying;
          const selected = selectedBeat?.id === beat.id;
          const ratio =
            previewing && beat.duration
              ? Math.min(1, Math.max(0, currentTime / beat.duration))
              : 0;

          return (
            <motion.li key={beat.id} variants={cardItemVariants}>
              <motion.div
                whileHover={CARD_HOVER}
                transition={SPRING_SNAPPY}
                className={`ygb-beat-card p-3 ${selected ? 'on' : ''} ${
                  previewing ? 'playing' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <BeatCover beat={beat} playing={previewing} />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold leading-tight tracking-tight text-content">
                      {beat.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs leading-snug text-content-muted">
                      {beatText(beat, 'mood', locale)}
                    </p>
                    <p className="mt-1 font-mono text-[11px] tnum text-content-subtle">
                      <span className="text-accent-light">{beat.bpm} BPM</span> ·{' '}
                      {formatClock(beat.duration)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.07 }}
                      whileTap={{ scale: 0.92 }}
                      transition={SPRING_SNAPPY}
                      onClick={() => handlePreview(beat)}
                      aria-label={
                        previewing
                          ? t('beats.pauseAria', { title: beat.title })
                          : t('beats.previewAria', { title: beat.title })
                      }
                      className="ygb-icon-btn h-9 w-9 text-xs"
                    >
                      {previewing ? '❚❚' : '▶'}
                    </motion.button>

                    <motion.button
                      type="button"
                      whileHover={BUTTON_HOVER}
                      whileTap={BUTTON_TAP}
                      transition={SPRING_SNAPPY}
                      onClick={() => handleSelect(beat)}
                      className="btn btn-secondary h-9 px-3 text-xs"
                    >
                      {t('beats.select')}
                    </motion.button>
                  </div>
                </div>

                {/* GPU-only scaleX preview progress */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-[2.5px] bg-line/40 transition-opacity duration-200"
                  style={{ opacity: previewing ? 1 : 0 }}
                >
                  <div
                    className="h-full w-full origin-left bg-gradient-to-r from-accent via-accent-light to-secondary will-change-transform transition-transform duration-150 ease-linear"
                    style={{ transform: `scaleX(${ratio.toFixed(4)})` }}
                  />
                </div>
              </motion.div>
            </motion.li>
          );
        })}
      </motion.ul>

      <motion.button
        type="button"
        whileHover={BUTTON_HOVER}
        whileTap={BUTTON_TAP}
        transition={SPRING_SNAPPY}
        onClick={onBack}
        className="btn btn-ghost mt-6"
      >
        ‹ {t('beats.back')}
      </motion.button>
    </div>
  );
}
