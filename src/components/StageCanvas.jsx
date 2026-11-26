import { memo, useEffect, useRef } from 'react';
import { useBeatTimeline } from '../hooks/useBeatTimeline';

/**
 * The stage canvas — 60fps imperative Canvas renderer with ZERO React re-renders.
 *
 *  - `variant="ring"`: The iconic golden-orange sunburst equalizer ring from
 *    the video. Reads real live Web Audio FFT frequency bins (`analyserRef`)
 *    blended with the beat pulse so every bar dances organically with the kick,
 *    snare, and hi-hats!
 *
 *  - `variant="stage"`: Deep matte obsidian backdrop (`#0A0A0C`) with subtle
 *    warm diagonal perspective beams, soft ambient spotlight behind the target
 *    frame, and crisp golden-orange spark particles that burst outward whenever
 *    a word lands (`burstKey`).
 */

const TICK_COUNT = 68;

const StageCanvas = memo(function StageCanvas({
  audio,
  analyserRef = null,
  bpm,
  active,
  variant = 'stage',
  burstKey = 0,
  className = '',
}) {
  const canvasRef = useRef(null);
  const pulseRef = useRef(0);
  const timeRef = useRef(0);
  const runningRef = useRef(active);
  runningRef.current = active;
  const analyserHolderRef = useRef(analyserRef);
  analyserHolderRef.current = analyserRef;

  // Imperative spark burst trigger when a word lands in the target box.
  const pendingBurstRef = useRef(false);
  const lastBurstKeyRef = useRef(burstKey);
  if (burstKey !== lastBurstKeyRef.current) {
    lastBurstKeyRef.current = burstKey;
    if (burstKey > 0) pendingBurstRef.current = true;
  }

  useBeatTimeline({
    audio,
    bpm,
    active,
    onFrame: (phase, _beatIndex, time) => {
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
    let smoothPulse = 0;
    let idleClock = 0;
    let lastFrameMs = performance.now();

    // Per-bar smoothed heights for buttery 60fps sunburst equalizer motion.
    const barHeights = new Float32Array(TICK_COUNT);
    let fftBins = null;

    // Live spark particles for word-landing bursts (frames 00:04 & 00:07).
    const sparks = [];

    const spawnLandingSparks = () => {
      if (!width || !height) return;
      const cx = width * 0.5;
      const cy = height * 0.44;
      const boxHalfW = Math.min(width * 0.42, 220);
      const boxHalfH = 54;
      for (let i = 0; i < 22; i += 1) {
        // Concentrate sparks around the 4 corners & edges of the target box.
        const edge = i % 4;
        const sx =
          edge === 0 || edge === 2
            ? cx + (Math.random() - 0.5) * boxHalfW * 2
            : cx + (edge === 1 ? boxHalfW : -boxHalfW) + (Math.random() - 0.5) * 18;
        const sy =
          edge === 0 || edge === 2
            ? cy + (edge === 0 ? -boxHalfH : boxHalfH) + (Math.random() - 0.5) * 14
            : cy + (Math.random() - 0.5) * boxHalfH * 2;
        const angle = Math.atan2(sy - cy, sx - cx) + (Math.random() - 0.5) * 0.6;
        const speed = 35 + Math.random() * 95;
        sparks.push({
          x: sx,
          y: sy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 18,
          size: 1.6 + Math.random() * 2.4,
          life: 1,
          decay: 1.25 + Math.random() * 0.9,
          lime: Math.random() < 0.18,
        });
      }
      if (sparks.length > 72) sparks.splice(0, sparks.length - 72);
    };

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

    const drawRing = (pulse, time, dt) => {
      const cx = width * 0.5;
      const cy = height * 0.5;
      const maxR = Math.min(width, height) * 0.49;
      const innerR = maxR * 0.62;

      // Read live FFT frequency spectrum if available.
      const analyser = analyserHolderRef.current?.current;
      let hasFft = false;
      if (analyser && runningRef.current) {
        if (!fftBins || fftBins.length !== analyser.frequencyBinCount) {
          fftBins = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(fftBins);
        hasFft = true;
      }

      // Crisp inner orange hairline circle framing ON THE MIC / @HANDLE / BPM.
      ctx.strokeStyle = `rgba(247, 133, 1, ${0.42 + pulse * 0.45})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, innerR - 3, 0, Math.PI * 2);
      ctx.stroke();

      // Subtle warm glow right behind the ring.
      const glow = ctx.createRadialGradient(cx, cy, innerR * 0.5, cx, cy, maxR * 1.05);
      glow.addColorStop(0, `rgba(247, 133, 1, ${0.06 + pulse * 0.1})`);
      glow.addColorStop(0.7, `rgba(247, 133, 1, ${0.02 + pulse * 0.05})`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * 1.05, 0, Math.PI * 2);
      ctx.fill();

      const attack = 1 - Math.exp(-26 * dt);
      const decay = 1 - Math.exp(-9 * dt);

      ctx.save();
      ctx.lineCap = 'round';

      for (let i = 0; i < TICK_COUNT; i += 1) {
        const norm = i / TICK_COUNT;
        // Mirror left/right around top so the sunburst looks balanced & symmetrical
        // with natural organic variation.
        const sym = norm <= 0.5 ? norm * 2 : (1 - norm) * 2;
        let fftVal = 0;
        if (hasFft && fftBins) {
          const binIdx = Math.min(
            fftBins.length - 1,
            Math.floor(Math.pow(sym, 1.35) * (fftBins.length * 0.65)),
          );
          fftVal = fftBins[binIdx] / 255;
        }

        const wave =
          0.5 +
          0.32 * Math.sin(norm * Math.PI * 6 - time * 3.6) +
          0.18 * Math.cos(norm * Math.PI * 14 + time * 2.2);

        const target = runningRef.current
          ? Math.min(
              1,
              (hasFft ? fftVal * 0.52 + pulse * 0.62 : pulse * 0.92) * (0.52 + wave * 0.68),
            )
          : 0.16 + wave * 0.18;

        const curr = barHeights[i];
        barHeights[i] = curr + (target - curr) * (target > curr ? attack : decay);
        const h = barHeights[i];

        const angle = norm * Math.PI * 2 - Math.PI / 2;
        // Ring itself expands outward slightly on each kick!
        const kickRadius = innerR + pulse * 4.5;
        const barLen = maxR * (0.08 + h * 0.3);
        const x1 = cx + Math.cos(angle) * kickRadius;
        const y1 = cy + Math.sin(angle) * kickRadius;
        const x2 = cx + Math.cos(angle) * Math.min(maxR, kickRadius + barLen);
        const y2 = cy + Math.sin(angle) * Math.min(maxR, kickRadius + barLen);

        // Warm golden-amber sunburst bars (exact hue family from screencast).
        const lightness = 46 + h * 26;
        const alpha = 0.56 + h * 0.44;
        ctx.strokeStyle = `hsla(${27 + h * 11}, 96%, ${lightness}%, ${alpha})`;
        ctx.lineWidth = 2.1 + h * 0.9;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      ctx.restore();
    };

    const drawStage = (pulse, time, dt) => {
      if (pendingBurstRef.current) {
        pendingBurstRef.current = false;
        spawnLandingSparks();
      }

      const cx = width * 0.5;
      const targetCy = height * 0.45;

      // Subtle warm radial spotlight centered behind the target frame.
      const halo = ctx.createRadialGradient(
        cx,
        targetCy,
        0,
        cx,
        targetCy,
        Math.max(width, height) * 0.5,
      );
      halo.addColorStop(0, `rgba(247, 133, 1, ${0.045 + pulse * 0.06})`);
      halo.addColorStop(0.5, `rgba(180, 90, 10, ${0.015 + pulse * 0.02})`);
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);

      // Subtle perspective highway rails converging up behind the conveyor.
      ctx.save();
      const topY = height * 0.36;
      const botY = height * 0.92;
      const rails = [-0.36, -0.18, 0.18, 0.36];
      for (const r of rails) {
        const xTop = cx + width * r * 0.52;
        const xBot = cx + width * r * 1.1;
        const grad = ctx.createLinearGradient(xTop, topY, xBot, botY);
        grad.addColorStop(0, 'rgba(247, 133, 1, 0)');
        grad.addColorStop(0.5, `rgba(247, 133, 1, ${0.045 + pulse * 0.045})`);
        grad.addColorStop(1, 'rgba(247, 133, 1, 0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xTop, topY);
        ctx.lineTo(xBot, botY);
        ctx.stroke();
      }

      // Update & draw crisp landing spark particles.
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const s = sparks[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= Math.pow(0.25, dt);
        s.vy *= Math.pow(0.25, dt);
        s.life -= s.decay * dt;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.fillStyle = s.lime
          ? `rgba(176, 234, 66, ${(s.life * 0.9).toFixed(3)})`
          : `rgba(254, 155, 42, ${(s.life * 0.95).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (0.5 + s.life * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const draw = (now) => {
      raf = requestAnimationFrame(draw);

      const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameMs) / 1000));
      lastFrameMs = now;
      idleClock += dt;

      const isLive = runningRef.current;
      const targetPulse = isLive
        ? Math.pow(Math.max(0, pulseRef.current), 2.2)
        : 0.14 + 0.08 * Math.sin(idleClock * 2.0);
      const rate = targetPulse > smoothPulse ? 34 : 11;
      smoothPulse += (targetPulse - smoothPulse) * (1 - Math.exp(-rate * dt));

      const time = isLive ? timeRef.current : idleClock * 0.55;

      ctx.clearRect(0, 0, width, height);
      if (variant === 'ring') {
        drawRing(smoothPulse, time, dt);
      } else {
        drawStage(smoothPulse, time, dt);
      }
    };

    const start = () => {
      if (raf === null) {
        lastFrameMs = performance.now();
        raf = requestAnimationFrame(draw);
      }
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
  }, [variant]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
});

export default StageCanvas;
