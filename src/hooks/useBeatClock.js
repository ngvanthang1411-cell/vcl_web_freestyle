import { useEffect, useRef } from 'react';
import { beatIndexAt, phaseAt, secondsPerBeat } from '../lib/beatGrid';

/**
 * A beat clock locked to the audio element.
 *
 * The audio element's own clock is the only time source that is genuinely in
 * step with the music. `useAudioPlayer`'s `currentTime` state updates on the
 * `timeupdate` event, which fires only about four times a second — far too
 * coarse to judge whether a hit landed on the beat.
 *
 * So this hook samples `audio.currentTime` on every animation frame (~60Hz)
 * and derives the beat position from that.
 *
 * It deliberately does not re-render on every frame. The sampled values live
 * in a ref that consumers read imperatively (safe inside a keydown handler),
 * and beat boundaries are delivered through the `onBeat` callback. A component
 * that re-rendered 60 times a second would make the word animation stutter —
 * the opposite of what it is trying to achieve.
 */
export function useBeatClock({ audio, bpm, isPlaying, onBeat }) {
  // The live values, readable synchronously by hit handlers.
  const liveRef = useRef({
    beatIndex: 0,
    phase: 0,
    time: 0,
    secondsPerBeat: 0,
  });

  const rafRef = useRef(null);
  const lastBeatRef = useRef(-1);

  // The beat count carried across a loop. `audio.currentTime` restarts at
  // zero every time the beat loops, so the raw index would reset with it.
  // These refs accumulate the true, monotonic beat count.
  const lastRawIndexRef = useRef(0);
  const totalBeatsRef = useRef(0);
  const beatsAtLoopStartRef = useRef(0);

  // Keep the callback and tempo current without restarting the sampler.
  const onBeatRef = useRef(onBeat);
  useEffect(() => {
    onBeatRef.current = onBeat;
  }, [onBeat]);

  useEffect(() => {
    if (!isPlaying || !audio || !bpm) {
      lastBeatRef.current = -1;
      beatsAtLoopStartRef.current = 0;
      liveRef.current.beatIndex = 0;
      liveRef.current.phase = 0;
      liveRef.current.time = 0;
      liveRef.current.secondsPerBeat = secondsPerBeat(bpm);
      return undefined;
    }

    const spb = secondsPerBeat(bpm);
    liveRef.current.secondsPerBeat = spb;

    // The beat the track was on when playback started, so the first beat of
    // the session is beat zero.
    const startBeat = beatIndexAt(audio.currentTime || 0, bpm);

    const tick = () => {
      const time = audio.currentTime || 0;
      const rawIndex = beatIndexAt(time, bpm);
      const p = phaseAt(time, bpm);

      // A loop sends currentTime back to zero, so the raw index drops. Detect
      // that and carry the count over instead of letting it rewind.
      if (rawIndex < lastRawIndexRef.current) {
        beatsAtLoopStartRef.current = totalBeatsRef.current;
      }
      lastRawIndexRef.current = rawIndex;

      // The monotonic beat count: how many beats have elapsed since the
      // session started, across every loop.
      const totalBeats = beatsAtLoopStartRef.current + (rawIndex - startBeat);
      totalBeatsRef.current = totalBeats;

      liveRef.current.time = time;
      liveRef.current.beatIndex = totalBeats;
      liveRef.current.phase = p;

      // A new beat: this is the only moment worth waking React for.
      if (totalBeats !== lastBeatRef.current) {
        lastBeatRef.current = totalBeats;
        onBeatRef.current?.(totalBeats, p);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    lastRawIndexRef.current = startBeat;
    totalBeatsRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [audio, bpm, isPlaying]);

  return {
    /** Live values, read synchronously — safe inside a keydown handler. */
    live: liveRef,
  };
}
