import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Target-box Word Explosion & Complete Unmount (`AnimatePresence`).
 *
 * Triggered strictly once at `currentBeat >= word.hitBeat`:
 *  1. The word card shoots into the target box and explodes (`scale: 1 -> 1.65 -> 1.82`),
 *     flashes white-hot, and dissolves cleanly to `opacity: 0` over **400ms**.
 *  2. Dual shockwave rings expand outward beyond the 4-corner hit zone.
 *  3. 16 radial explosion particles scatter outward using GPU `transform` + `opacity`.
 *  4. On completion (~400ms), `onDone(id)` removes the burst so Framer Motion
 *     unmounts the word completely from the DOM — never keeping it inside the box.
 */

const PARTICLE_COUNT = 16;

const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const angle = (Math.PI * 2 * i) / PARTICLE_COUNT + (i % 2 === 0 ? 0.06 : -0.06);
  const distX = Math.cos(angle) * (145 + (i % 3) * 44);
  const distY = Math.sin(angle) * (72 + (i % 2) * 32);
  return {
    id: i,
    x: distX,
    y: distY,
    w: i % 3 === 0 ? 10 : 7,
    h: i % 3 === 0 ? 5 : 7,
    rotate: (angle * 180) / Math.PI,
  };
});

const TargetExplosion = memo(function TargetExplosion({ bursts = [], onDone }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-30 overflow-visible"
    >
      <AnimatePresence>
        {bursts.map((burst) => {
          const isLime = burst.tone === 'lime';
          const mainColor = isLime ? '#b8f147' : '#ff8814';
          const echoColor = isLime ? '#ff8814' : '#ff4d9d';

          return (
            <motion.div
              key={burst.id}
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.06 }}
              className="absolute inset-0 flex items-center justify-center overflow-visible"
            >
              {/* 1) Exploding word pill: sudden scale burst -> bright flash -> fade out in 400ms */}
              <motion.div
                initial={{ scale: 1.02, opacity: 1 }}
                animate={{
                  scale: [1.02, 1.62, 1.82],
                  opacity: [1, 0.92, 0],
                }}
                transition={{
                  duration: 0.4,
                  times: [0, 0.36, 1],
                  ease: [0.16, 1, 0.3, 1],
                }}
                onAnimationComplete={() => onDone?.(burst.id)}
                className={`flex h-[4.8rem] w-[min(92%,24.5rem)] items-center justify-center rounded-[12px] px-5 will-change-transform ${
                  isLime ? 'stage-pill-lime' : 'stage-pill-orange'
                }`}
                style={{
                  boxShadow: `0 0 50px ${mainColor}, inset 0 0 28px rgba(255,255,255,0.7)`,
                }}
              >
                <span className="stage-pill-text">{burst.text}</span>
              </motion.div>

              {/* 2) White-hot impact flash */}
              <motion.div
                initial={{ opacity: 0.95, scale: 0.88 }}
                animate={{ opacity: 0, scale: 1.38 }}
                transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 rounded-[14px] will-change-transform"
                style={{
                  background: isLime
                    ? 'radial-gradient(ellipse at center, rgba(255,255,255,0.8) 0%, rgba(184,241,71,0.58) 45%, transparent 75%)'
                    : 'radial-gradient(ellipse at center, rgba(255,255,255,0.8) 0%, rgba(255,136,20,0.62) 45%, transparent 75%)',
                }}
              />

              {/* 3) Primary shockwave ring */}
              <motion.div
                initial={{ opacity: 0.95, scale: 0.58 }}
                animate={{ opacity: 0, scale: 1.62 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 rounded-[16px] border-2 will-change-transform"
                style={{
                  borderColor: mainColor,
                  boxShadow: `0 0 30px ${mainColor}`,
                }}
              />

              {/* 4) Secondary echo shockwave ring */}
              <motion.div
                initial={{ opacity: 0.72, scale: 0.76 }}
                animate={{ opacity: 0, scale: 1.9 }}
                transition={{ duration: 0.42, delay: 0.03, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-1 rounded-[16px] border will-change-transform"
                style={{ borderColor: echoColor }}
              />

              {/* 5) 16 radial explosion particles (GPU transform + opacity only) */}
              {PARTICLES.map((p, idx) => (
                <motion.span
                  key={p.id}
                  initial={{ opacity: 1, x: 0, y: 0, scale: 0.45, rotate: p.rotate }}
                  animate={{
                    opacity: [1, 0.95, 0],
                    x: p.x,
                    y: p.y,
                    scale: [0.45, 1.3, 0.15],
                    rotate: p.rotate + 75,
                  }}
                  transition={{
                    duration: 0.4,
                    ease: [0.16, 1, 0.3, 1],
                    delay: (idx % 3) * 0.012,
                  }}
                  className="absolute left-1/2 top-1/2 block rounded-full will-change-transform"
                  style={{
                    width: p.w,
                    height: p.h,
                    marginLeft: -p.w / 2,
                    marginTop: -p.h / 2,
                    background: idx % 4 === 0 ? '#ffffff' : idx % 2 === 0 ? mainColor : echoColor,
                    boxShadow: `0 0 12px ${idx % 2 === 0 ? mainColor : echoColor}`,
                  }}
                />
              ))}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
});

export default TargetExplosion;
