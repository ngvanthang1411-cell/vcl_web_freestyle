import { useEffect, useRef } from 'react';
import { useBeatTimeline } from '../hooks/useBeatTimeline';

/**
 * The stage canvas.
 *
 * Two layers, both drawn imperatively so they never touch React:
 *
 *  1. The **ambient backdrop** — slow light streaks drifting behind the
 *     stage, and a soft aurora wash. It is deliberately almost still; it
 *     gives the black ground some depth without pulling focus.
 *
 *  2. The **equalizer ring** — a circle of ticks around the player's info,
 *     each tick breathing with the beat. The ring expands and brightens on
 *     the downbeat and settles before the next one, so it reads as locked to
 *     the music rather than to a timer.
 *
 * Everything is sampled from the audio clock by useBeatTimeline, so the ring
 * is at full strength exactly on the beat, and follows the tempo whenever the
 * loaded beat changes.
 *
 * The canvas is sized to the device pixel ratio, so the strokes stay crisp on
 * a retina display, and the render loop stops when the tab is hidden.
 */

/** How many ticks around the equalizer ring. */
const TICK_COUNT = 72;

/** The ambient streaks, as [angle, speed, length, width, colour]. */
const STREAKS = [
  { angle: -0.35, speed: 0.045, length: 0.34, width: 1.1, alpha: 0.2, colour: '168, 85, 247' },
  { angle: 0.42, speed: -0.031, length: 0.26, width: 0.9, alpha: 0.16, colour: '34, 211, 238' },
  { angle: 1.9, speed: 0.026, length: 0.4, width: 1.3, alpha: 0.14, colour: '247, 133, 1' },
  { angle: 2.85, speed: -0.038, length: 0.3, width: 1.0, alpha: 0.12, colour: '255, 77, 157' },
  { angle: 4.1, speed: 0.022, length: 0.36, width: 1.2, alpha: 0.13, colour: '168, 85, 247' },
  { angle: 5.35, speed: -0.019, length: 0.28, width: 0.8, alpha: 0.15, colour: '34, 211, 238' },
];

export default function StageCanvas({ audio, bpm, active, className = '' }) {
  const canvasRef = useRef(null);
  // The live values the draw function reads. Writing to a ref avoids
  // re-creating the effect on every render.
  const phaseRef = useRef(0);
  const pulseRef = useRef(0);
  const timeRef = useRef(0);
  const runningRef = useRef(active);
  runningRef.current = active;

  useBeatTimeline({
    audio,
    bpm,
    active,
    onFrame: (phase, beatIndex, time) => {
      phaseRef.current = phase;
      // The pulse is the beat seen from the other end: full on the downbeat,
      // fading to nothing by the next one.
      pulseRef.current = 1 - phase;
      timeRef.current = time;
    },
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let raf = null;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = () => {
      raf = requestAnimationFrame(draw);

      const phase = phaseRef.current;
      const pulse = pulseRef.current;
      const time = timeRef.current;

      ctx.clearRect(0, 0, width, height);

      /* ------------------------------------------------ the ambience */

      // A slow aurora wash — two wide, barely-moving radial gradients.
      const drift = time * 0.04;
      const aurora = ctx.createRadialGradient(
        width * (0.3 + Math.sin(drift) * 0.06),
        height * (0.2 + Math.cos(drift * 0.8) * 0.05),
        0,
        width * 0.5,
        height * 0.35,
        Math.max(width, height) * 0.6,
      );
      aurora.addColorStop(0, 'rgba(120, 86, 247, 0.10)');
      aurora.addColorStop(0.55, 'rgba(34, 180, 220, 0.045)');
      aurora.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = aurora;
      ctx.fillRect(0, 0, width, height);

      // The streaks: thin light lines drifting across the stage.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of STREAKS) {
        const t = (time * s.speed + s.angle) % (Math.PI * 2);
        const cx = width * 0.5;
        const cy = height * 0.34;
        const r = Math.min(width, height) * (0.32 + 0.1 * Math.sin(t * 2));
        const x1 = cx + Math.cos(t) * r;
        const y1 = cy + Math.sin(t) * r;
        const len = Math.min(width, height) * s.length;
        const x2 = x1 + Math.cos(t + 1.2) * len;
        const y2 = y1 + Math.sin(t + 1.2) * len;

        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, `rgba(${s.colour}, 0)`);
        grad.addColorStop(0.5, `rgba(${s.colour}, ${s.alpha})`);
        grad.addColorStop(1, `rgba(${s.colour}, 0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();

      /* --------------------------------------- the equalizer ring */

      const cx = width * 0.5;
      // The ring sits in the upper part of the canvas, so the info in the
      // middle of it is not pushed off the top.
      const cy = height * 0.42;
      // The ring is sized from the smaller dimension, so it stays circular
      // on a wide canvas and never overflows the top or bottom.
      const baseRadius = Math.min(width, height) * 0.34;

      // The ring swells on the beat.
      const radius = baseRadius * (1 + pulse * 0.045);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < TICK_COUNT; i += 1) {
        // Each tick is a little behind the one before it, so the ring has a
        // travelling wave rather than blinking as one block.
        const offset = (i / TICK_COUNT) * Math.PI * 2;
        const lag = 0.5 + 0.5 * Math.sin(offset * 3 - time * 2.2);
        const reach = pulse * (0.35 + lag * 0.65);

        const angle = offset - Math.PI / 2;
        const inner = radius * (0.86 + reach * 0.06);
        const outer = inner + baseRadius * (0.1 + reach * 0.16);

        const x1 = cx + Math.cos(angle) * inner;
        const y1 = cy + Math.sin(angle) * inner;
        const x2 = cx + Math.cos(angle) * outer;
        const y2 = cy + Math.sin(angle) * outer;

        // The colour runs from violet through cyan to orange around the ring.
        const hue = (i / TICK_COUNT) * 300 + 190;
        const alpha = 0.34 + reach * 0.6;

        ctx.strokeStyle = `hsla(${hue}, 88%, ${58 + reach * 14}%, ${alpha})`;
        ctx.lineWidth = 1.5 + reach * 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // A soft disc of light behind the ring's centre.
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.05);
      glow.addColorStop(0, `rgba(120, 90, 255, ${0.09 + pulse * 0.13})`);
      glow.addColorStop(0.6, `rgba(20, 160, 220, ${0.03 + pulse * 0.05})`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.05, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    // Start the loop only when the tab is visible, and stop it when hidden,
    // so a backgrounded tab does not burn a frame every millisecond.
    const start = () => {
      if (raf === null) raf = requestAnimationFrame(draw);
    };
    const stop = () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
