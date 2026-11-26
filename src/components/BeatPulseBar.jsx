import { memo, useEffect, useRef } from 'react';
import { phaseAt, secondsPerBeat } from '../lib/beatGrid';

/**
 * Isolated 60fps Beat / Pulse Bar synced to Web Audio BPM + live AnalyserNode.
 *
 * Completely decoupled from React state: reads `audio.currentTime` (backed by
 * `AudioContext.currentTime`) and `analyserRef.current` inside a single
 * `requestAnimationFrame` loop and mutates GPU-only `transform` & `opacity`
 * directly on DOM refs. Typing lyrics, handles, or changing settings never
 * re-renders this visualizer.
 */

const BAR_COUNT = 20;

const BeatPulseBar = memo(function BeatPulseBar({
  audio,
  analyserRef = null,
  bpm = 0,
  isPlaying = false,
  compact = false,
  className = '',
}) {
  const barRefs = useRef([]);
  const dotRefs = useRef([]);
  const badgeRef = useRef(null);
  const labelRef = useRef(null);

  const stateRef = useRef({ audio, analyserRef, bpm, isPlaying });
  stateRef.current = { audio, analyserRef, bpm, isPlaying };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let raf = null;
    let lastNow = performance.now();
    const heights = new Float32Array(BAR_COUNT);
    let fftData = null;

    const resetVisuals = () => {
      for (let i = 0; i < BAR_COUNT; i += 1) {
        const el = barRefs.current[i];
        if (!el) continue;
        const idle = 0.22 + (Math.sin(i * 0.7) * 0.5 + 0.5) * 0.25;
        el.style.transform = `scaleY(${idle.toFixed(3)})`;
        el.style.opacity = '0.45';
      }
      for (let i = 0; i < 4; i += 1) {
        const dot = dotRefs.current[i];
        if (!dot) continue;
        dot.style.transform = 'scale(0.85)';
        dot.style.opacity = '0.28';
      }
      if (badgeRef.current) badgeRef.current.style.transform = 'scale(1)';
      if (labelRef.current) labelRef.current.textContent = '1 · 1';
    };

    if (!isPlaying) {
      resetVisuals();
      return undefined;
    }

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;

      const { audio: clk, analyserRef: aRef, bpm: tempo, isPlaying: live } = stateRef.current;
      if (!live || !clk) return;

      const t = clk.currentTime || 0;
      const spb = tempo > 0 ? secondsPerBeat(tempo) : 0.6;
      const phase = tempo > 0 ? phaseAt(t, tempo) : (t % spb) / spb;
      const totalBeat = Math.floor(t / spb);
      const barNum = Math.floor(totalBeat / 4) + 1;
      const beatInBar = ((totalBeat % 4) + 4) % 4;

      const kick = reduced ? 0.3 : Math.pow(Math.max(0, 1 - phase), 2.4);

      const analyser = aRef?.current;
      let hasFft = false;
      if (analyser) {
        if (!fftData || fftData.length !== analyser.frequencyBinCount) {
          fftData = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(fftData);
        hasFft = true;
      }

      const attack = 1 - Math.exp(-28 * dt);
      const decay = 1 - Math.exp(-10 * dt);

      for (let i = 0; i < BAR_COUNT; i += 1) {
        const el = barRefs.current[i];
        if (!el) continue;

        const norm = i / (BAR_COUNT - 1);
        const centerShape = 1 - Math.abs(norm - 0.5) * 0.7;
        let fftVal = 0;
        if (hasFft && fftData) {
          const idx = Math.min(
            fftData.length - 1,
            Math.floor(Math.pow(norm, 1.25) * (fftData.length * 0.6)),
          );
          fftVal = fftData[idx] / 255;
        }

        const wave = 0.5 + 0.5 * Math.sin(norm * Math.PI * 3 - t * 6.5);
        const target = reduced
          ? 0.35 + centerShape * 0.35
          : Math.min(
              1,
              Math.max(
                0.16,
                (hasFft ? fftVal * 0.68 + kick * 0.52 : kick * 0.85) * (0.55 + wave * 0.45) * centerShape,
              ),
            );

        const prev = heights[i];
        heights[i] = prev + (target - prev) * (target > prev ? attack : decay);
        const h = heights[i];

        el.style.transform = `scaleY(${h.toFixed(3)})`;
        el.style.opacity = (0.45 + h * 0.55).toFixed(3);
      }

      // 4-beat bar indicator dots (1-2-3-4)
      for (let i = 0; i < 4; i += 1) {
        const dot = dotRefs.current[i];
        if (!dot) continue;
        const active = i === beatInBar;
        const s = active ? (reduced ? 1.15 : 1 + kick * 0.5) : 0.82;
        dot.style.transform = `scale(${s.toFixed(3)})`;
        dot.style.opacity = active ? '1' : '0.26';
      }

      if (badgeRef.current && !reduced) {
        const bs = 1 + kick * 0.08 * (beatInBar === 0 ? 1.3 : 1);
        badgeRef.current.style.transform = `scale(${bs.toFixed(4)})`;
      }

      if (labelRef.current) {
        labelRef.current.textContent = `${barNum} · ${beatInBar + 1}`;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      resetVisuals();
    };
  }, [isPlaying, bpm]);

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-line/80 bg-surface-overlay/65 px-3 ${
        compact ? 'py-1.5' : 'py-2'
      } ${className}`}
    >
      {/* Pulsing BPM pill */}
      <span
        ref={badgeRef}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/45 bg-accent/15 px-2 py-0.5 font-mono text-[10px] font-bold text-accent-lighter will-change-transform tnum"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${isPlaying ? 'bg-accent' : 'bg-content-subtle'}`}
          aria-hidden="true"
        />
        {bpm ? `${bpm} BPM` : 'BEAT'}
      </span>

      {/* 60fps GPU-scaled FFT + BPM waveform bars */}
      <div
        aria-hidden="true"
        className={`flex flex-1 items-end justify-between gap-[2px] ${compact ? 'h-4' : 'h-5'}`}
      >
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            className={`block h-full w-[3px] origin-bottom rounded-full will-change-transform ${
              i % 5 === 0 ? 'bg-secondary' : i % 3 === 0 ? 'bg-[#b8f147]' : 'bg-accent'
            }`}
            style={{ transform: 'scaleY(0.28)', opacity: 0.45 }}
          />
        ))}
      </div>

      {/* Bar · Beat counter + 4-beat pulse dots */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex items-center gap-1" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              ref={(el) => {
                dotRefs.current[i] = el;
              }}
              className={`h-1.5 w-1.5 rounded-full will-change-transform ${
                i === 0 ? 'bg-[#b8f147]' : 'bg-accent'
              }`}
              style={{ opacity: 0.28 }}
            />
          ))}
        </div>
        <span
          ref={labelRef}
          className="min-w-[2.1rem] text-right font-mono text-[10px] font-semibold text-content-muted tnum"
        >
          1 · 1
        </span>
      </div>
    </div>
  );
});

export default BeatPulseBar;
