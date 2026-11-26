import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import BeatCover from '../components/BeatCover';
import BeatPulseBar from '../components/BeatPulseBar';
import { BEAT_VIBES, beatText } from '../data/beats';
import { useLanguage, useT } from '../i18n/LanguageContext';
import {
  BUTTON_HOVER,
  BUTTON_TAP,
  CARD_HOVER,
  CARD_TAP,
  SPRING_SMOOTH,
  SPRING_SNAPPY,
  cardContainerVariants,
  cardItemVariants,
} from '../lib/motion';

/**
 * The Home screen (`#home`) powered by Framer Motion spring physics and
 * an isolated 60fps BeatPulseBar synced to Web Audio API.
 */
export default function LandingScreen({
  onStart,
  onOpenBeats,
  beatCount,
  supported,
  beats = [],
  player = null,
  selectedBeat = null,
  onSelect = null,
  onRandomize = null,
}) {
  const { locale } = useLanguage();
  const t = useT();
  const [vibe, setVibe] = useState('All');
  const [previewId, setPreviewId] = useState(null);

  const isPlaying = Boolean(player?.isPlaying);
  const currentTime = player?.currentTime ?? 0;
  const pauseAudio = player?.pause;

  useEffect(() => {
    return () => {
      pauseAudio?.();
    };
  }, [pauseAudio]);

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

  const activePreviewBeat = useMemo(
    () => beats.find((b) => b.id === previewId) ?? selectedBeat ?? beats[0] ?? null,
    [beats, previewId, selectedBeat],
  );

  const handleBeatTap = async (beat) => {
    onSelect?.(beat);
    if (!player) return;
    if (previewId === beat.id && isPlaying) {
      player.pause();
      setPreviewId(null);
      return;
    }
    setPreviewId(beat.id);
    await player.play(beat.src);
  };

  const handleRandomTap = () => {
    player?.pause?.();
    setPreviewId(null);
    onRandomize?.();
  };

  return (
    <div className="space-y-8">
      {/* ---------------------------------------------------------- Hero */}
      <section className="pt-2 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={SPRING_SMOOTH}
          className="ygb-logo-wrap mx-auto"
        >
          <span className="ygb-logo-aura" aria-hidden="true" />
          <img
            src="/logo-mark.png"
            alt=""
            width={160}
            height={58}
            className="ygb-logo-float relative h-12 w-auto object-contain sm:h-14"
          />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_SMOOTH, delay: 0.04 }}
          className="mt-3 text-[clamp(2.2rem,8vw,3.35rem)] font-bold leading-[1.04] tracking-tight text-content"
        >
          {t('landing.titleTop')}{' '}
          <span className="bg-gradient-to-r from-accent via-accent-light to-secondary bg-clip-text text-transparent">
            {t('landing.titleBottom')}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_SMOOTH, delay: 0.08 }}
          className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-content-muted sm:text-base"
        >
          {t('landing.taglineLead')}{' '}
          <span className="font-semibold text-content">{t('landing.taglineBeat')}</span>{' '}
          {t('landing.taglineEnd')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_SMOOTH, delay: 0.12 }}
          className="mt-5 flex justify-center"
        >
          <motion.button
            type="button"
            onClick={onStart}
            whileHover={BUTTON_HOVER}
            whileTap={BUTTON_TAP}
            transition={SPRING_SNAPPY}
            className="btn btn-primary rounded-full px-6 py-2.5 text-sm shadow-lift"
          >
            {t('landing.ctaStart')} ›
          </motion.button>
        </motion.div>

        {!supported ? (
          <p className="mx-auto mt-4 max-w-md rounded-lg border border-warning/40 bg-warning/[0.06] px-3 py-2 text-xs leading-relaxed text-warning">
            {t('landing.unsupported')}
          </p>
        ) : null}
      </section>

      {/* ---------------------------------------------------- Beat Crate */}
      {beats.length > 0 ? (
        <section aria-labelledby="crate-heading" className="space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 id="crate-heading" className="text-base font-bold tracking-tight text-content">
              {t('home.pickBeat')}
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent-lighter">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              {t('home.freshBadge', { count: beatCount })}
            </span>
          </div>

          <p className="text-xs text-content-muted">
            {t('beats.subtitle', { count: beatCount })}
          </p>

          {/* Isolated 60fps Beat Pulse Bar — stays mounted cleanly so zero layout shift */}
          {player ? (
            <BeatPulseBar
              audio={player.audio}
              analyserRef={player.analyserRef}
              bpm={activePreviewBeat?.bpm ?? 0}
              isPlaying={isPlaying}
              compact
            />
          ) : null}

          {/* Vibe filter pills */}
          <div className="ygb-vibes" role="tablist" aria-label={t('home.pickBeat')}>
            {availableVibes.map((item) => (
              <motion.button
                key={item}
                type="button"
                role="tab"
                aria-selected={vibe === item}
                onClick={() => setVibe(item)}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.95 }}
                transition={SPRING_SNAPPY}
                className={`ygb-vibe ${vibe === item ? 'on' : ''}`}
              >
                <span>{item === 'All' ? t('home.vibeAll') : item}</span>
                <small>{vibeCounts[item] ?? 0}</small>
              </motion.button>
            ))}
          </div>

          {/* Crate list with Framer Motion spring stagger */}
          <motion.div
            key={vibe}
            variants={cardContainerVariants}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 gap-2.5"
          >
            {vibe === 'All' ? (
              <motion.button
                type="button"
                variants={cardItemVariants}
                whileHover={CARD_HOVER}
                whileTap={CARD_TAP}
                transition={SPRING_SNAPPY}
                onClick={handleRandomTap}
                className={`ygb-beat-card flex w-full items-center gap-3.5 p-3 text-left ${
                  !selectedBeat ? 'on' : ''
                }`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-[3.15rem] w-[3.15rem] shrink-0 items-center justify-center rounded-[11px] bg-surface-overlay text-2xl shadow-inner"
                >
                  🎲
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-content">
                    {t('beats.randomTitle')}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-content-muted">
                    {t('beats.randomBody')}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-overlay/80 text-xs text-accent"
                >
                  ✦
                </span>
              </motion.button>
            ) : null}

            {visibleBeats.map((beat) => {
              const previewing = previewId === beat.id && isPlaying;
              const armed = selectedBeat?.id === beat.id;
              const ratio =
                previewing && beat.duration
                  ? Math.min(1, Math.max(0, currentTime / beat.duration))
                  : 0;

              return (
                <motion.button
                  key={beat.id}
                  type="button"
                  variants={cardItemVariants}
                  whileHover={CARD_HOVER}
                  whileTap={CARD_TAP}
                  transition={SPRING_SNAPPY}
                  onClick={() => handleBeatTap(beat)}
                  aria-label={
                    previewing
                      ? t('beats.pauseAria', { title: beat.title })
                      : t('beats.previewAria', { title: beat.title })
                  }
                  className={`ygb-beat-card flex w-full items-center gap-3.5 p-3 text-left ${
                    armed ? 'on' : ''
                  } ${previewing ? 'playing' : ''}`}
                >
                  <BeatCover beat={beat} playing={previewing} />

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-content">{beat.title}</span>
                      {beat.vibe ? (
                        <span className="rounded-full bg-surface-overlay px-2 py-0.5 text-[10px] font-semibold text-content-subtle">
                          {beat.vibe}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-content-muted">
                      <span className="font-mono font-semibold text-accent-light tnum">
                        {beat.bpm} BPM
                      </span>{' '}
                      · {beatText(beat, 'mood', locale)}
                    </span>
                  </span>

                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs transition-colors duration-200 ${
                      previewing
                        ? 'border-accent bg-accent text-content-inverse shadow-[0_0_16px_rgb(var(--color-accent)/0.5)]'
                        : armed
                          ? 'border-accent/60 bg-accent/15 text-accent-light'
                          : 'border-line bg-surface-overlay/80 text-content-muted'
                    }`}
                  >
                    {previewing ? '❚❚' : '▶'}
                  </span>

                  {/* GPU-only scaleX preview progress hairline */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-[2.5px] bg-line/40 transition-opacity duration-200"
                    style={{ opacity: previewing ? 1 : 0 }}
                  >
                    <span
                      className="block h-full w-full origin-left bg-gradient-to-r from-accent via-accent-light to-secondary will-change-transform transition-transform duration-150 ease-linear"
                      style={{ transform: `scaleX(${ratio.toFixed(4)})` }}
                    />
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
        </section>
      ) : null}

      {/* --------------------------------------------------- How to play */}
      {beats.length > 0 ? (
        <motion.section
          aria-labelledby="how-title"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING_SMOOTH, delay: 0.14 }}
          className="panel space-y-3 p-4"
        >
          <h2 id="how-title" className="text-sm font-bold tracking-tight text-content">
            {t('home.howTitle')}
          </h2>
          <ol className="space-y-2 text-xs leading-relaxed text-content-muted">
            {[
              [t('home.step1Title'), t('home.step1Body')],
              [t('home.step2Title'), t('home.step2Body')],
              [t('home.step3Title'), t('home.step3Body')],
              [t('home.step4Title'), t('home.step4Body')],
            ].map(([lead, body], i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-[11px] font-bold text-accent-light tnum">
                  {i + 1}
                </span>
                <span>
                  <b className="font-semibold text-content">{lead}</b> {body}
                </span>
              </li>
            ))}
          </ol>
        </motion.section>
      ) : null}
    </div>
  );
}
