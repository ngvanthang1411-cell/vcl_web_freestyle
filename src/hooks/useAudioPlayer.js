import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A single shared <audio> element for the whole app.
 *
 * Keeping one element alive across screens is what makes beat previews switch
 * cleanly — swapping `src` on a fresh element each time would tear down the
 * decoder mid-playback and throw "The play() request was interrupted" errors.
 */
let sharedAudio = null;

function getSharedAudio() {
  if (typeof window === 'undefined') return null;
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'metadata';
    sharedAudio.crossOrigin = 'anonymous';
  }
  return sharedAudio;
}

/**
 * Controls the shared audio element: preview playback, looping for the actual
 * freestyle session, volume, and master mute.
 *
 * Also exposes a coarse "energy" value (0..1) derived from an AnalyserNode so
 * the UI can pulse in time with the beat.
 */
export function useAudioPlayer() {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.75);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [energy, setEnergy] = useState(0);

  // Create the element during the first render, not in an effect, so that
  // `player.audio` is a live reference from the very first render. The beat
  // clock samples `audio.currentTime` and needs the element to already exist.
  if (!audioRef.current && typeof window !== 'undefined') {
    audioRef.current = getSharedAudio();
  }

  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const wiredRef = useRef(false);

  useEffect(() => {
    const audio = getSharedAudio();
    if (!audio) return undefined;
    audioRef.current = audio;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onLoaded = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const onError = () => setIsPlaying(false);

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onLoaded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onLoaded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  // Push volume/mute changes onto the element.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = isMuted;
  }, [volume, isMuted]);

  /* ------------------------------------------------------- beat-reactive */

  const stopMeter = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // The MediaElementSource is deliberately left connected: createMediaElementSource
    // may only be called ONCE per element, so tearing it down would make the
    // element permanently unusable for analysis on the next play.
    setEnergy(0);
  }, []);

  const startMeter = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (rafRef.current) return;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    try {
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      if (!wiredRef.current) {
        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.72;
        source.connect(analyser);
        // Route to the destination too — once an element is attached to a
        // MediaElementSource it no longer outputs on its own.
        source.connect(ctx.destination);
        sourceRef.current = source;
        analyserRef.current = analyser;
        wiredRef.current = true;
      }

      const analyser = analyserRef.current;
      if (!analyser) return;

      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i];
        const avg = sum / data.length / 255;
        setEnergy(Math.min(1, avg * 1.9));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // Analyser wiring can fail (e.g. cross-origin media). The app still works,
      // the visuals just fall back to a static pulse.
      analyserRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopMeter();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [stopMeter]);

  /* ------------------------------------------------------------ controls */

  /** Loads a source without playing it. */
  const load = useCallback((src) => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    audio.pause();
    if (audio.getAttribute('src') !== src) {
      audio.src = src;
      audio.load();
    }
    setCurrentTime(0);
  }, []);

  /**
   * Plays a source. If the same source is already playing it acts as a toggle
   * (pause), which is how the beat cards behave.
   */
  const play = useCallback(
    async (src) => {
      const audio = audioRef.current;
      if (!audio || !src) return false;

      if (audio.getAttribute('src') !== src) {
        audio.src = src;
        audio.load();
      }

      try {
        await audio.play();
        startMeter();
        return true;
      } catch {
        // Autoplay was blocked — the user still needs to press play.
        setIsPlaying(false);
        return false;
      }
    },
    [startMeter],
  );

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    stopMeter();
  }, [stopMeter]);

  /** Pauses without tearing down the meter (used when navigating screens). */
  const pauseOnly = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
  }, []);

  const toggleLoop = useCallback((shouldLoop) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = shouldLoop;
  }, []);

  const seek = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = seconds;
      setCurrentTime(seconds);
    } catch {
      /* seeking before metadata loaded */
    }
  }, []);

  const stopMeterRef = stopMeter;

  return {
    audio: audioRef.current,
    isPlaying,
    isMuted,
    volume,
    currentTime,
    duration,
    energy,
    load,
    play,
    pause,
    pauseOnly,
    toggleLoop,
    seek,
    setVolume,
    setIsMuted,
    stopMeter: stopMeterRef,
  };
}
