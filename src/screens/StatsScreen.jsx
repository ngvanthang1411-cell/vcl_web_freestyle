import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BUTTON_HOVER,
  BUTTON_TAP,
  SPRING_BOUNCY,
  SPRING_SNAPPY,
  cardContainerVariants,
  cardItemVariants,
} from '../lib/motion';
import { useT } from '../i18n/LanguageContext';

/**
 * Local Stats & Rankings screen (`#board`) with Framer Motion spring podium
 * and staggered history cards.
 */
export default function StatsScreen({ runs, onBack, onReset }) {
  const t = useT();
  const [tab, setTab] = useState('best'); // best | recent

  const ordered = useMemo(() => {
    const copy = [...runs];
    if (tab === 'best') {
      copy.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp);
    } else {
      copy.sort((a, b) => b.timestamp - a.timestamp);
    }
    return copy;
  }, [runs, tab]);

  const podium = tab === 'best' ? ordered.slice(0, 3) : [];
  const rest = tab === 'best' ? ordered.slice(3) : ordered;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <motion.button
          type="button"
          whileHover={BUTTON_HOVER}
          whileTap={BUTTON_TAP}
          transition={SPRING_SNAPPY}
          onClick={onBack}
          className="btn btn-ghost -ml-2 px-2.5 py-1.5 text-sm"
        >
          ‹ {t('stats.back')}
        </motion.button>
        <h1 className="text-base font-bold uppercase tracking-wider text-content">
          {t('stats.title')}
        </h1>
        <span className="chip tnum">{t('stats.runsCount', { n: runs.length })}</span>
      </div>

      <p className="text-xs text-content-subtle">{t('stats.note')}</p>

      <div className="segment grid w-full grid-cols-2">
        <button
          type="button"
          aria-pressed={tab === 'best'}
          onClick={() => setTab('best')}
          className="segment-item py-2 text-center"
        >
          🏆 {t('stats.tabBest')}
        </button>
        <button
          type="button"
          aria-pressed={tab === 'recent'}
          onClick={() => setTab('recent')}
          className="segment-item py-2 text-center"
        >
          ⏱ {t('stats.tabRecent')}
        </button>
      </div>

      {runs.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING_SNAPPY}
          className="panel p-8 text-center"
        >
          <p className="text-3xl" aria-hidden="true">
            🎤
          </p>
          <p className="mt-3 text-sm text-content-muted">{t('stats.empty')}</p>
        </motion.div>
      ) : (
        <motion.div
          key={tab}
          variants={cardContainerVariants}
          initial="initial"
          animate="animate"
          className="space-y-4"
        >
          {podium.length > 0 ? (
            <div className="grid grid-cols-3 gap-2.5">
              {podium.map((run, idx) => (
                <motion.div
                  key={run.id}
                  initial={{ opacity: 0, y: 16, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ ...SPRING_BOUNCY, delay: idx * 0.06 }}
                  className={`panel flex flex-col items-center p-3 text-center ${
                    idx === 0
                      ? 'border-accent/70 bg-accent/[0.08] shadow-[0_8px_28px_rgb(var(--color-accent)/0.16)]'
                      : ''
                  }`}
                >
                  <span className="text-lg" aria-hidden="true">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                  </span>
                  <span className="mt-1 text-2xl font-extrabold leading-none text-accent tnum">
                    {run.score}
                  </span>
                  <span className="mt-1 w-full truncate text-xs font-semibold text-content">
                    {run.handle ? `@${run.handle}` : run.beatTitle}
                  </span>
                  <span className="w-full truncate text-[10px] text-content-subtle">
                    {run.beatTitle} · {run.grade}
                  </span>
                </motion.div>
              ))}
            </div>
          ) : null}

          <ol className="space-y-2">
            {rest.map((run, idx) => (
              <motion.li
                key={run.id}
                variants={cardItemVariants}
                className="panel flex items-center gap-3 px-3.5 py-2.5"
              >
                <span className="w-6 text-center font-mono text-xs font-bold text-content-subtle tnum">
                  #{tab === 'best' ? idx + 4 : idx + 1}
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-sm font-extrabold text-accent-light">
                  {run.grade}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-content">
                    {run.handle ? `@${run.handle}` : run.beatTitle}
                  </p>
                  <p className="truncate text-[11px] text-content-muted">
                    {run.beatTitle} · {run.wordsHit}/{run.wordsShown} · {run.durationSeconds}s
                  </p>
                </div>
                <span className="font-mono text-base font-bold text-content tnum">
                  {run.score}
                </span>
              </motion.li>
            ))}
          </ol>

          <div className="pt-2 text-center">
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={onReset}
              className="text-xs font-medium text-danger/80 underline-offset-4 transition-colors hover:text-danger hover:underline"
            >
              {t('stats.reset')}
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
