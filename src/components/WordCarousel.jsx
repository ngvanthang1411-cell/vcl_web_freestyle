import { memo, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { popBadgeVariants } from '../lib/motion';
import { useT } from '../i18n/LanguageContext';

/**
 * 4-Card Non-Linear Magnetic Conveyor (60/120fps GPU-only `transform` + `opacity`).
 *
 * Always displays up to 4 cards stacked vertically from top (Position 1 closest
 * to the Hit Zone) to bottom (Position 4 entering smoothly at the bottom):
 *
 *  - **Position 1 (head word approaching `hitBeat`)**:
 *    Waits briefly in the ready/launch position, then **accelerates rapidly
 *    (strong ease-in `t^2.4` magnetic pull)** straight up into the Target Box
 *    at `TARGET_Y`, growing from `scale 0.76 → 1.04` and arriving at the exact
 *    moment `currentBeat === hitBeat`!
 *
 *  - **Positions 2, 3, 4 (the 3 cards below)**:
 *    Drift upward **slowly and steadily** with a slight phase lag, lower
 *    opacity, and smaller scale — creating a clear visual gap behind the card
 *    launching into the Hit Zone.
 *
 *  - **Promote & Spawn loop**:
 *    The moment Position 1 hits `hitBeat`, it explodes & unmounts via
 *    `<TargetExplosion>`, Position 2 glides smoothly into Position 1, Positions
 *    3 & 4 promote up, and a brand new word spawns smoothly from the bottom
 *    into Position 4!
 */

const TARGET_Y = 28;

// Base resting slots for the 4 visible cards (Pos 1 -> Pos 4).
const SLOTS = [
  { y: 176, scale: 0.76, opacity: 0.96, zIndex: 80 }, // Pos 1: launch / ready spot
  { y: 234, scale: 0.65, opacity: 0.78, zIndex: 60 }, // Pos 2
  { y: 282, scale: 0.58, opacity: 0.58, zIndex: 45 }, // Pos 3
  { y: 326, scale: 0.51, opacity: 0.4, zIndex: 30 }, // Pos 4: bottom of frame
];

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

const WordCarousel = memo(function WordCarousel({
  idleWord = null, // shown only in idle preview before starting
  upcoming, // exactly 4 upcoming words [{ id, text, tone, hitBeat }]
  running,
  intervalBeats = 4,
  beatClockRef, // { currentBeat, beatPhase, beatInBar }
  onHit,
  hitFlash,
  frontRef,
}) {
  const t = useT();
  const cardRefs = useRef(new Map());
  // Live per-card interpolated pose so promoting 2->1, 3->2, 4->3 and spawning
  // new cards at Pos 4 is 100% continuous with zero snaps.
  const poseMapRef = useRef(new Map());

  const upcomingRef = useRef(upcoming);
  upcomingRef.current = upcoming;
  const runningRef = useRef(running);
  runningRef.current = running;
  const intervalBeatsRef = useRef(intervalBeats);
  intervalBeatsRef.current = intervalBeats;

  const hitBounceRef = useRef({ amp: 0, phase: 0 });
  const lastHitFlashRef = useRef(null);
  if (hitFlash !== lastHitFlashRef.current) {
    lastHitFlashRef.current = hitFlash;
    if (hitFlash === 'perfect' || hitFlash === 'good') {
      hitBounceRef.current = { amp: hitFlash === 'perfect' ? 0.09 : 0.05, phase: 0 };
    }
  }

  const registerCard = useCallback((id) => (el) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  // Unified 60/120fps non-linear conveyor loop.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let raf = null;
    let lastNow = performance.now();

    const tick = (now) => {
      raf = requestAnimationFrame(tick);

      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;

      const isLive = runningRef.current;
      const queue = upcomingRef.current;
      const spanBeats = Math.max(1, intervalBeatsRef.current || 4);

      const clk = beatClockRef?.current ?? { currentBeat: 0, beatPhase: 0, beatInBar: 0 };
      const currentBeat = isLive ? clk.currentBeat : 0;
      const beatPhase = isLive ? clk.beatPhase : 0;
      const kick = isLive && !reduced ? Math.pow(Math.max(0, 1 - beatPhase), 2.5) : 0;

      const hitB = hitBounceRef.current;
      let hitScale = 1;
      if (hitB.amp > 0.0005) {
        hitB.phase += dt * 28;
        hitB.amp *= Math.exp(-9.5 * dt);
        hitScale = 1 + Math.sin(hitB.phase) * hitB.amp;
      }

      // Frame-rate independent smooth damping factors.
      const launchLerp = reduced ? 1 : 1 - Math.exp(-26 * dt);
      const queueLerp = reduced ? 1 : 1 - Math.exp(-10 * dt);

      const liveIds = new Set();

      // Cycle progress (0 -> 1) of the head word within its final `launchSpan` beats.
      // For the first word (hitBeat = 16), it starts accelerating cleanly at Beat 12 (3-2-1-GO!).
      const head = queue[0];
      const launchSpan = Math.min(4, Math.max(2, spanBeats));
      const headP =
        isLive && head ? clamp01(1 - (head.hitBeat - currentBeat) / launchSpan) : 0;

      for (let i = 0; i < Math.min(queue.length, 4); i += 1) {
        const entry = queue[i];
        liveIds.add(entry.id);
        const el = cardRefs.current.get(entry.id);
        if (!el) continue;

        let pose = poseMapRef.current.get(entry.id);
        const base = SLOTS[i];

        let targetY = base.y;
        let targetScale = base.scale;
        let targetOpacity = base.opacity;
        let zIndex = base.zIndex;

        if (i === 0) {
          // POSITION 1: Non-linear magnetic acceleration into the Hit Zone!
          //  - Early phase (headP 0..0.24): smoothly settles into launch spot
          //  - Launch phase (headP 0.24..1.0): ZERO-LAG direct ease-in (t^2.35)
          //    tracking so the card reaches TARGET_Y on the EXACT frame `currentBeat === hitBeat`!
          const isLaunching = isLive && headP > 0.24;

          if (isLive && headP > 0) {
            if (!isLaunching) {
              const creep = headP / 0.24;
              targetY = base.y - creep * 12;
              targetScale = base.scale + creep * 0.04;
              targetOpacity = base.opacity + creep * 0.04;
            } else {
              const tLaunch = clamp01((headP - 0.24) / 0.76);
              const accel = reduced ? tLaunch : Math.pow(tLaunch, 2.35);
              const startY = base.y - 12;
              targetY = startY + (TARGET_Y - startY) * accel;
              targetScale = 0.8 + (1.03 - 0.8) * Math.pow(tLaunch, 1.8);
              targetOpacity = 1;
              zIndex = Math.round(82 + accel * 18);
            }
          }

          // Subtle beat pulse while waiting; tapers cleanly to 0 right at impact
          // so the card hits exact TARGET_Y dead-on the beat.
          if (isLive && !reduced) {
            const pulseFade = isLaunching ? 1 - clamp01((headP - 0.7) / 0.3) : 1;
            targetY -= kick * 3.5 * pulseFade;
            targetScale *= 1 + kick * 0.036 * pulseFade;
          }

          if (!pose || isLaunching) {
            // Direct zero-lag lock during the ease-in launch phase!
            pose = { y: targetY, scale: targetScale, opacity: targetOpacity };
            poseMapRef.current.set(entry.id, pose);
          } else {
            pose.y += (targetY - pose.y) * launchLerp;
            pose.scale += (targetScale - pose.scale) * launchLerp;
            pose.opacity += (targetOpacity - pose.opacity) * launchLerp;
          }

          const finalScale = pose.scale * hitScale;
          el.style.transform = `translate3d(0, ${pose.y.toFixed(2)}px, 0) scale(${finalScale.toFixed(4)})`;
          el.style.opacity = pose.opacity.toFixed(3);
          el.style.zIndex = String(zIndex);
          el.style.pointerEvents = isLive ? 'auto' : 'none';
          continue;
        }

        // POSITIONS 2, 3, 4: Slower, steady upward drift with subtle phase lag,
        // lower opacity, and smaller scale so Pos 1 cleanly separates ahead!
        const prevSlot = SLOTS[i - 1];
        // Slight lag per row so the 3 cards trail calmly behind Pos 1.
        const laggedP = clamp01((headP - i * 0.09) / (1 - i * 0.09));
        // Only drift ~42% of the way toward the upper slot during the cycle;
        // when Pos 1 explodes, smooth exponential damping completes the promotion!
        const slowDrift = isLive ? laggedP * 0.42 : 0;

        targetY = base.y + (prevSlot.y - base.y) * slowDrift;
        targetScale = base.scale + (prevSlot.scale - base.scale) * slowDrift;
        targetOpacity = base.opacity + (prevSlot.opacity - base.opacity) * slowDrift;

        if (isLive && !reduced) {
          const rowPhase = (beatPhase - i * 0.07 + 1) % 1;
          const rowKick = Math.pow(Math.max(0, 1 - rowPhase), 2.8);
          targetY -= rowKick * 2.4;
          targetScale *= 1 + rowKick * 0.022;
        }

        if (!pose) {
          // Brand new card entering at Position 4 spawns smoothly from below the frame!
          pose = {
            y: base.y + 52,
            scale: Math.max(0.42, base.scale - 0.06),
            opacity: isLive ? 0 : base.opacity,
          };
          poseMapRef.current.set(entry.id, pose);
        } else {
          pose.y += (targetY - pose.y) * queueLerp;
          pose.scale += (targetScale - pose.scale) * queueLerp;
          pose.opacity += (targetOpacity - pose.opacity) * queueLerp;
        }

        el.style.transform = `translate3d(0, ${pose.y.toFixed(2)}px, 0) scale(${pose.scale.toFixed(4)})`;
        el.style.opacity = pose.opacity.toFixed(3);
        el.style.zIndex = String(zIndex);
        el.style.pointerEvents = 'none';
      }

      for (const id of poseMapRef.current.keys()) {
        if (!liveIds.has(id)) poseMapRef.current.delete(id);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [beatClockRef]);

  const hitClass =
    hitFlash === 'perfect'
      ? 'stage-pill-perfect'
      : hitFlash === 'good'
        ? 'stage-pill-good'
        : '';

  return (
    <div className="stage-deck">
      {/* Idle preview card inside the target box before the run starts */}
      {!running && idleWord ? (
        <div
          className={`stage-pill-card stage-pill-front ${
            idleWord.tone === 'lime' ? 'stage-pill-lime' : 'stage-pill-orange'
          }`}
          style={{
            transform: `translate3d(0, ${TARGET_Y}px, 0) scale(1)`,
            opacity: 1,
            zIndex: 100,
          }}
        >
          <span className="stage-pill-text">{idleWord.text}</span>
        </div>
      ) : null}

      {/* Always up to 4 cards in the queue (Pos 1 accelerating -> Pos 4 at bottom) */}
      {upcoming.slice(0, 4).map((entry, idx) => {
        const isHead = running && idx === 0;
        const toneClass = entry.tone === 'lime' ? 'stage-pill-lime' : 'stage-pill-orange';
        const initSlot = SLOTS[idx] ?? SLOTS[3];

        return (
          <div
            key={entry.id}
            ref={(element) => {
              registerCard(entry.id)(element);
              if (isHead && frontRef) frontRef.current = element;
            }}
            className={`stage-pill-card ${toneClass} ${
              isHead ? `stage-pill-front ${hitClass}` : ''
            }`}
            style={{
              transform: `translate3d(0, ${initSlot.y}px, 0) scale(${initSlot.scale})`,
              opacity: initSlot.opacity,
            }}
            onClick={isHead ? () => onHit?.() : undefined}
            onKeyDown={
              isHead
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onHit?.();
                    }
                  }
                : undefined
            }
            role={isHead ? 'button' : undefined}
            tabIndex={isHead ? 0 : -1}
            aria-live={isHead ? 'polite' : undefined}
            aria-label={isHead ? t('words.aria', { word: entry.text }) : undefined}
          >
            <span className="stage-pill-text">{entry.text}</span>

            <AnimatePresence>
              {isHead && hitFlash && hitFlash !== 'miss' ? (
                <motion.span
                  key={hitFlash}
                  variants={popBadgeVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="stage-hit-badge"
                  aria-hidden="true"
                >
                  <span>✓</span>
                  {t(`words.hit.${hitFlash}`)}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
});

export default WordCarousel;
