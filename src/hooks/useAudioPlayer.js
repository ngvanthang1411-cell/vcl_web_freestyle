import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Web Audio API beat engine with AudioBuffer caching, gapless looping,
 * sample-accurate DSP clock, and live AnalyserNode FFT spectrum.
 *
 * Playback lifecycle when pressing Play on a track:
 *  1. Unlock AudioContext (`ctx.resume()` inside the click gesture).
 *  2. Fetch & decode the track into an `AudioBuffer` (cached in memory so
 *     re-playing or switching back is instantaneous).
 *  3. Route `AudioBufferSourceNode -> GainNode -> AnalyserNode -> destination`
 *     with `loop = true` for sample-accurate, gapless looping.
 *  4. Expose a virtual clock object (`audio.currentTime`, `audio.duration`)
 *     backed directly by `AudioContext.currentTime` so the beat grid, 60fps
 *     BeatPulseBar, and equalizer ring stay razor-locked with zero jitter.
 *  5. On pause, track switch, or unmount: immediately stop/disconnect the
 *     active source node, invalidate any in-flight load token, and cancel
 *     background timers to prevent leaks or clock drift.
 */

let sharedCtx = null;
let sharedGain = null;
let sharedAnalyser = null;
const bufferCache = new Map(); // src -> AudioBuffer

function ensureAudioGraph() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;

  if (!sharedCtx) {
    sharedCtx = new Ctx();
    sharedGain = sharedCtx.createGain();
    sharedAnalyser = sharedCtx.createAnalyser();
    sharedAnalyser.fftSize = 256;
    sharedAnalyser.smoothingTimeConstant = 0.78;
    sharedGain.connect(sharedAnalyser);
    sharedAnalyser.connect(sharedCtx.destination);
  }

  return { ctx: sharedCtx, gain: sharedGain, analyser: sharedAnalyser };
}

export function useAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.75);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Mutable live transport state (read imperatively at 60fps with 0 re-renders).
  const stateRef = useRef({
    src: null,
    buffer: null,
    source: null,
    playing: false,
    loop: true,
    startedAtCtxTime: 0,
    pausedOffset: 0,
    duration: 0,
    loadToken: 0,
  });

  const analyserRef = useRef(null);
  const energyRef = useRef(0);
  const timeSyncRef = useRef(null);

  // Sample-accurate virtual audio clock facade compatible with useBeatClock,
  // useBeatTimeline, StageCanvas, and WordGenerator (`audio.currentTime`).
  // Compensates for Web Audio `baseLatency + outputLatency` so visual beats
  // and word explosions align with what the player actually hears!
  const clockFacadeRef = useRef(null);
  if (!clockFacadeRef.current) {
    const getAudibleElapsed = () => {
      const s = stateRef.current;
      if (!s.playing || !sharedCtx) return s.pausedOffset;
      const baseLat =
        typeof sharedCtx.baseLatency === 'number' && Number.isFinite(sharedCtx.baseLatency)
          ? sharedCtx.baseLatency
          : 0;
      const outLat =
        typeof sharedCtx.outputLatency === 'number' && Number.isFinite(sharedCtx.outputLatency)
          ? sharedCtx.outputLatency
          : 0;
      const latencyComp = Math.min(0.25, Math.max(0, baseLat + outLat));
      return Math.max(0, sharedCtx.currentTime - s.startedAtCtxTime - latencyComp);
    };

    clockFacadeRef.current = {
      get currentTime() {
        const s = stateRef.current;
        const elapsed = getAudibleElapsed();
        if (!s.playing) return s.pausedOffset;
        if (s.loop && s.duration > 0) return elapsed % s.duration;
        return s.duration > 0 ? Math.min(s.duration, elapsed) : elapsed;
      },
      get elapsedTime() {
        return getAudibleElapsed();
      },
      get duration() {
        return stateRef.current.duration;
      },
      get paused() {
        return !stateRef.current.playing;
      },
      get loop() {
        return stateRef.current.loop;
      },
      set loop(val) {
        stateRef.current.loop = Boolean(val);
        if (stateRef.current.source) {
          stateRef.current.source.loop = Boolean(val);
        }
      },
    };
  }

  // Keep GainNode synced with volume / mute.
  useEffect(() => {
    if (sharedGain && sharedCtx) {
      const target = isMuted ? 0 : volume;
      sharedGain.gain.setTargetAtTime(target, sharedCtx.currentTime, 0.015);
    }
  }, [volume, isMuted]);

  const stopTimeSync = useCallback(() => {
    if (timeSyncRef.current) {
      clearInterval(timeSyncRef.current);
      timeSyncRef.current = null;
    }
  }, []);

  const startTimeSync = useCallback(() => {
    stopTimeSync();
    // Coarse 4Hz UI readout sync (only for seek slider & preview progress).
    // Real-time 60fps animations read `audio.currentTime` directly without React!
    timeSyncRef.current = setInterval(() => {
      const s = stateRef.current;
      if (!s.playing) return;
      setCurrentTime(clockFacadeRef.current.currentTime);
    }, 250);
  }, [stopTimeSync]);

  const teardownSource = useCallback(() => {
    const s = stateRef.current;
    if (s.source) {
      s.source.onended = null;
      try {
        s.source.stop();
      } catch {
        // Source may already be stopped.
      }
      try {
        s.source.disconnect();
      } catch {
        // Ignore already disconnected node.
      }
      s.source = null;
    }
  }, []);

  const startBufferAt = useCallback(
    (buffer, offsetSec) => {
      const graph = ensureAudioGraph();
      if (!graph || !buffer) return false;
      const { ctx, gain, analyser } = graph;
      analyserRef.current = analyser;

      teardownSource();

      const s = stateRef.current;
      const safeDur = buffer.duration || 0;
      const safeOffset = safeDur > 0 ? Math.max(0, offsetSec % safeDur) : 0;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = s.loop;
      if (s.loop && safeDur > 0) {
        source.loopStart = 0;
        source.loopEnd = safeDur;
      }
      source.connect(gain);

      source.onended = () => {
        if (s.source !== source) return;
        if (!s.loop) {
          s.playing = false;
          s.pausedOffset = 0;
          s.source = null;
          stopTimeSync();
          setIsPlaying(false);
          setCurrentTime(0);
        }
      };

      // Schedule slightly ahead (+35ms) for sample-accurate start right after
      // AudioContext resume, preventing initial quantum jitter.
      const scheduledStart = ctx.currentTime + 0.035;
      gain.gain.setValueAtTime(isMuted ? 0 : volume, scheduledStart);
      source.start(scheduledStart, safeOffset);

      s.source = source;
      s.buffer = buffer;
      s.duration = safeDur;
      s.playing = true;
      s.startedAtCtxTime = scheduledStart - safeOffset;
      s.pausedOffset = safeOffset;

      setDuration(safeDur);
      setCurrentTime(safeOffset);
      setIsPlaying(true);
      startTimeSync();
      return true;
    },
    [isMuted, startTimeSync, stopTimeSync, teardownSource, volume],
  );

  const fetchAndDecode = useCallback(async (src) => {
    if (bufferCache.has(src)) return bufferCache.get(src);
    const graph = ensureAudioGraph();
    if (!graph) return null;

    const response = await fetch(src);
    if (!response.ok) throw new Error(`Failed to fetch beat: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const decoded = await graph.ctx.decodeAudioData(arrayBuffer);
    bufferCache.set(src, decoded);
    return decoded;
  }, []);

  const pause = useCallback(() => {
    const s = stateRef.current;
    // Invalidate any pending async play/decode request.
    s.loadToken += 1;
    if (s.playing) {
      s.pausedOffset = clockFacadeRef.current.currentTime;
    }
    teardownSource();
    s.playing = false;
    stopTimeSync();
    energyRef.current = 0;
    setIsPlaying(false);
    setIsLoading(false);
  }, [stopTimeSync, teardownSource]);

  const load = useCallback(
    (src) => {
      if (!src) return;
      pause();
      const s = stateRef.current;
      if (s.src !== src) {
        s.src = src;
        s.pausedOffset = 0;
        setCurrentTime(0);
        if (bufferCache.has(src)) {
          const buf = bufferCache.get(src);
          s.buffer = buf;
          s.duration = buf.duration;
          setDuration(buf.duration);
        }
      }
    },
    [pause],
  );

  /**
   * Unlocks AudioContext, loads & decodes the track (cached), and starts
   * sample-accurate playback from offset 0 (on new track) or resume offset.
   */
  const play = useCallback(
    async (src, { fromStart = false } = {}) => {
      if (!src) return false;
      const graph = ensureAudioGraph();
      if (!graph) return false;

      const s = stateRef.current;
      const token = ++s.loadToken;
      const isNewTrack = s.src !== src;

      // Step 1: Unlock / resume AudioContext inside user gesture.
      try {
        if (graph.ctx.state === 'suspended') {
          await graph.ctx.resume();
        }
      } catch {
        setIsPlaying(false);
        return false;
      }

      if (token !== s.loadToken) return false;

      // Switching track or requesting fromStart resets cleanly to 0.
      if (isNewTrack || fromStart) {
        teardownSource();
        s.playing = false;
        s.src = src;
        s.pausedOffset = 0;
        setCurrentTime(0);
      }

      // Step 2: Load & decode AudioBuffer (or hit cache instantly).
      let buffer = bufferCache.get(src) ?? null;
      if (!buffer) {
        setIsLoading(true);
        try {
          buffer = await fetchAndDecode(src);
        } catch {
          if (token === s.loadToken) {
            setIsLoading(false);
            setIsPlaying(false);
          }
          return false;
        }
        if (token !== s.loadToken) return false;
        setIsLoading(false);
      }

      if (!buffer) return false;
      return startBufferAt(buffer, isNewTrack || fromStart ? 0 : s.pausedOffset);
    },
    [fetchAndDecode, startBufferAt, teardownSource],
  );

  const toggleLoop = useCallback((shouldLoop) => {
    const val = Boolean(shouldLoop);
    stateRef.current.loop = val;
    if (stateRef.current.source) {
      stateRef.current.source.loop = val;
      if (val && stateRef.current.duration > 0) {
        stateRef.current.source.loopStart = 0;
        stateRef.current.source.loopEnd = stateRef.current.duration;
      }
    }
  }, []);

  const seek = useCallback(
    (seconds) => {
      const s = stateRef.current;
      const safe = Math.max(0, Math.min(seconds || 0, s.duration || seconds || 0));
      s.pausedOffset = safe;
      setCurrentTime(safe);
      if (s.playing && s.buffer) {
        startBufferAt(s.buffer, safe);
      }
    },
    [startBufferAt],
  );

  // Clean up source and timers on unmount (keep sharedCtx alive across HMR).
  useEffect(() => {
    return () => {
      stopTimeSync();
      teardownSource();
      stateRef.current.playing = false;
    };
  }, [stopTimeSync, teardownSource]);

  const stopMeter = useCallback(() => {
    energyRef.current = 0;
  }, []);

  return useMemo(
    () => ({
      audio: clockFacadeRef.current,
      analyserRef,
      energyRef,
      isPlaying,
      isLoading,
      isMuted,
      volume,
      currentTime,
      duration,
      energy: 0,
      load,
      play,
      pause,
      pauseOnly: pause,
      toggleLoop,
      seek,
      setVolume,
      setIsMuted,
      stopMeter,
    }),
    [
      isPlaying,
      isLoading,
      isMuted,
      volume,
      currentTime,
      duration,
      load,
      play,
      pause,
      toggleLoop,
      seek,
      stopMeter,
    ],
  );
}
