import { useEffect, useRef } from 'react';
import { phaseAt, secondsPerBeat } from '../lib/beatGrid';

/**
 * A beat-driven animation loop for GSAP and Canvas.
 *
 * Everything on the stage that pulses — the equalizer ring, the ambient
 * light streaks, the card carousel — has to move *with the music*, not with a
 * timer. This hook is the single place that knows where the beat is.
 *
 * It does two things:
 *
 *  1. Calls `onFrame(phase, beatIndex)` on every animation frame, with the
 *     phase within the current beat (0 → 1). Anything drawn on a canvas uses
 *     this directly.
 *  2. Calls `onBeat(beatIndex)` when the beat boundary is crossed, so a
 *     GSAP timeline can be fired exactly on the beat.
 *
 * React never re-renders from this. The values go to refs and to the canvas,
 * so a 60fps pulse costs no reconciliation.
 *
 * The tempo comes from `bpm`, which the caller reads off the beat that is
 * actually loaded. When the beat or its tempo changes, the effect re-runs
 * and the loop picks up the new grid — nothing is hardcoded.
 *
 * @param {object} params
 * @param {AudioElement|null} params.audio  The element to sample.
 * @param {number} params.bpm               Tempo of the loaded beat.
 * @param {boolean} params.active           Whether the clock is running.
 * @param {(phase: number, beatIndex: number, time: number) => void} [params.onFrame]
 * @param {(beatIndex: number) => void} [params.onBeat]
 */
export function useBeatTimeline({ audio, bpm, active, onFrame, onBeat }) {
  const rafRef = useRef(null);
  const lastBeatRef = useRef(-1);
  const lastRawIndexRef = useRef(0);

  // Keep the callbacks current without restarting the loop.
  const onFrameRef = useRef(onFrame);
  const onBeatRef = useRef(onBeat);
  useEffect(() => {
    onFrameRef.current = onFrame;
    onBeatRef.current = onBeat;
  }, [onFrame, onBeat]);

  useEffect(() => {
    if (!active || !audio || !bpm) {
      lastBeatRef.current = -1;
      return undefined;
    }

    const spb = secondsPerBeat(bpm);

    const tick = () => {
      const time = audio.currentTime || 0;
      const phase = phaseAt(time, bpm);

      // The raw index resets when the track loops. The monotonic count below
      // is what the animations care about, so the loop point is invisible.
      const rawIndex = Math.floor(time / spb);
      if (rawIndex < lastRawIndexRef.current) {
        lastBeatRef.current = -1; // force a beat event on the other side
      }
      lastRawIndexRef.current = rawIndex;

      const beatIndex = rawIndex;
      onFrameRef.current?.(phase, beatIndex, time);

      if (beatIndex !== lastBeatRef.current) {
        lastBeatRef.current = beatIndex;
        onBeatRef.current?.(beatIndex);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastBeatRef.current = -1;
    };
  }, [audio, bpm, active]);

  return { spb: bpm ? secondsPerBeat(bpm) : 0 };
}
