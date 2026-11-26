import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SPRING_BOUNCY } from '../lib/motion';
import { useT } from '../i18n/LanguageContext';

/**
 * 16-Beat Musical Intro Overlay driven by exact real-time `audioBeat` (0..15):
 *
 *  - Beats 0..11 (3 bars of "1 - 2 - 3 - 4"):
 *      + Round 1/3: beats 0, 1, 2, 3 -> 1, 2, 3, 4
 *      + Round 2/3: beats 4, 5, 6, 7 -> 1, 2, 3, 4
 *      + Round 3/3: beats 8, 9, 10, 11 -> 1, 2, 3, 4
 *  - Beats 12..15 ("3 - 2 - 1 - GO!"):
 *      + Beat 12 -> "3"
 *      + Beat 13 -> "2"
 *      + Beat 14 -> "1"
 *      + Beat 15 -> "GO!" (explosive burst + shockwave + radial sparks)
 *
 * Positioned cleanly over the target box (`pointer-events-none`) so the
 * upcoming first word (hitBeat = 16) can already glide up the highway beneath
 * it during beats 12..15!
 */

const GO_PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const angle = (Math.PI * 2 * i) / 14;
  return {
    id: i,
    x: Math.cos(angle) * (135 + (i % 2) * 30),
    y: Math.sin(angle) * (72 + (i % 3) * 18),
    color: i % 3 === 0 ? '#b8f147' : i % 2 === 0 ? '#ff8814' : '#ff4d9d',
  };
});

const IntroCountdownOverlay = memo(function IntroCountdownOverlay({ introBeat }) {
  const t = useT();

  if (introBeat === null || introBeat < 0 || introBeat > 15) return null;

  const isWarmup = introBeat < 12;
  const roundNum = Math.floor(introBeat / 4) + 1; // 1, 2, 3
  const beatInBar = (introBeat % 4) + 1; // 1, 2, 3, 4
  const isGo = introBeat === 15;

  let displayText;
  if (isWarmup) {
    displayText = String(beatInBar);
  } else if (introBeat === 12) {
    displayText = '3';
  } else if (introBeat === 13) {
    displayText = '2';
  } else if (introBeat === 14) {
    displayText = '1';
  } else {
    displayText = t('intro.go');
  }

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center"
    >
      {/* Round indicator pills (1/3, 2/3, 3/3) or Drop-in badge */}
      <div className="mb-1.5 flex items-center gap-2">
        {isWarmup ? (
          <>
            <span className="rounded-full border border-accent/45 bg-accent/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-accent-lighter backdrop-blur-sm">
              {t('intro.catchBeat')}
            </span>
            <span className="rounded-full border border-line-strong bg-surface-raised/90 px-2.5 py-0.5 font-mono text-[11px] font-bold text-content tnum">
              {roundNum}/3
            </span>
          </>
        ) : (
          <span className="rounded-full border border-[#b8f147]/55 bg-[#b8f147]/15 px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#b8f147] backdrop-blur-sm">
            {isGo ? t('intro.go') : t('intro.dropIn')}
          </span>
        )}
      </div>

      {/* Main spring-animated beat number / GO! figure */}
      <div className="relative flex h-24 items-center justify-center">
        {/* Shockwave + radial sparks on beat 15 ("GO!") */}
        {isGo ? (
          <>
            <motion.span
              key="go-ring-1"
              initial={{ opacity: 0.95, scale: 0.35 }}
              animate={{ opacity: 0, scale: 2.3 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="absolute h-24 w-24 rounded-full border-2 border-[#b8f147] will-change-transform"
              style={{ boxShadow: '0 0 28px rgba(184, 241, 71, 0.7)' }}
            />
            <motion.span
              key="go-ring-2"
              initial={{ opacity: 0.85, scale: 0.5 }}
              animate={{ opacity: 0, scale: 2.8 }}
              transition={{ duration: 0.65, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
              className="absolute h-24 w-24 rounded-full border border-accent will-change-transform"
            />
            {GO_PARTICLES.map((p) => (
              <motion.span
                key={`go-p-${p.id}`}
                initial={{ opacity: 1, x: 0, y: 0, scale: 0.4 }}
                animate={{ opacity: [1, 1, 0], x: p.x, y: p.y, scale: [0.4, 1.25, 0.2] }}
                transition={{ duration: 0.56, ease: [0.16, 1, 0.3, 1] }}
                className="absolute h-2 w-2 rounded-full will-change-transform"
                style={{ background: p.color, boxShadow: `0 0 10px ${p.color}` }}
              />
            ))}
          </>
        ) : (
          /* Subtle beat pulse ring on every count beat */
          <motion.span
            key={`pulse-${introBeat}`}
            initial={{ opacity: 0.55, scale: 0.7 }}
            animate={{ opacity: 0, scale: 1.75 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute h-20 w-20 rounded-full border border-accent/70 will-change-transform"
          />
        )}

        <AnimatePresence mode="popLayout">
          <motion.p
            key={introBeat}
            initial={{ opacity: 0, scale: isGo ? 0.35 : 0.6, y: 10 }}
            animate={{ opacity: 1, scale: isGo ? 1.15 : 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.25 }}
            transition={SPRING_BOUNCY}
            className={`font-extrabold leading-none tracking-tight tnum will-change-transform ${
              isGo
                ? 'bg-gradient-to-b from-[#d5ff7a] via-[#b8f147] to-[#ff8814] bg-clip-text text-[clamp(3.75rem,14vw,5.5rem)] text-transparent drop-shadow-[0_0_32px_rgba(184,241,71,0.55)]'
                : !isWarmup
                  ? 'bg-gradient-to-b from-[#feb058] via-[#ff8814] to-[#ff4d9d] bg-clip-text text-[clamp(3.5rem,13vw,5.25rem)] text-transparent'
                  : 'text-[clamp(3.25rem,12vw,4.75rem)] text-content drop-shadow-[0_0_24px_rgba(247,133,1,0.45)]'
            }`}
          >
            {displayText}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Round progress bar dots (3 rounds during beats 0..11) */}
      {isWarmup ? (
        <div className="mt-1 flex items-center gap-1.5" aria-hidden="true">
          {[1, 2, 3].map((r) => (
            <span
              key={r}
              className={`h-1.5 w-6 rounded-full transition-opacity duration-200 ${
                r < roundNum
                  ? 'bg-[#b8f147] opacity-90'
                  : r === roundNum
                    ? 'bg-accent opacity-100'
                    : 'bg-white/20 opacity-45'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
});

export default IntroCountdownOverlay;
