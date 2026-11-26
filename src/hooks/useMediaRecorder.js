import { useCallback, useEffect, useRef, useState } from 'react';
import { pickMimeType, requestMedia, stopStream } from '../lib/permissions';

/**
 * Wraps MediaRecorder + getUserMedia with a predictable lifecycle.
 *
 * The hook owns the MediaStream and the recorder instance; both are torn down
 * on unmount and whenever a new recording starts, so no microphone stays hot
 * after the user leaves the screen.
 *
 * @param {object} options
 * @param {boolean} options.video  Record camera video alongside audio.
 */
export function useMediaRecorder({ video = false } = {}) {
  const [state, setState] = useState('idle'); // idle | requesting | ready | recording | error
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [mediaType, setMediaType] = useState('');
  const [stream, setStream] = useState(null);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const stopResolveRef = useRef(null);
  const timerRef = useRef(null);
  const urlRef = useRef(null);
  const startedAtRef = useRef(0);

  /** Releases the current object URL so we never leak blobs. */
  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setPreviewUrl(null);
    }
  }, []);

  /** Tears down the recorder and the microphone stream. */
  const teardown = useCallback(() => {
    // Null the recorder ref BEFORE stopping it: the onstop handler checks this
    // identity to decide whether the take should be published or dropped.
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        /* already stopped */
      }
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // A pending stop() must never hang waiting for an event that will not fire.
    if (stopResolveRef.current) {
      stopResolveRef.current(null);
      stopResolveRef.current = null;
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
  }, []);

  // Release everything when the component unmounts.
  useEffect(() => {
    return () => {
      teardown();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [teardown]);

  // When the video preference changes, the existing recorder was built with the
  // old constraint set — rebuild it so the new take matches the new mode.
  const videoRef = useRef(video);
  useEffect(() => {
    if (videoRef.current === video) return;
    videoRef.current = video;
    if (state === 'recording') return; // don't interrupt an active take
    teardown();
    revokeUrl();
    blobRef.current = null;
    setElapsed(0);
    setState('idle');
    setError(null);
  }, [video, state, teardown, revokeUrl]);

  /**
   * Asks for microphone (and camera) access and prepares a recorder.
   * @returns {Promise<boolean>} true when recording is possible.
   */
  const prepare = useCallback(async () => {
    setState('requesting');
    setError(null);

    // Release any previous session before asking again.
    teardown();
    revokeUrl();

    const result = await requestMedia({ video });
    if (!result.ok) {
      setError(result);
      setState('error');
      return false;
    }

    streamRef.current = result.stream;
    setStream(result.stream);

    const mimeType = pickMimeType();
    try {
      recorderRef.current = mimeType
        ? new MediaRecorder(result.stream, { mimeType })
        : new MediaRecorder(result.stream);
    } catch (error) {
      stopStream(result.stream);
      streamRef.current = null;
      setError({
        kind: 'unsupported',
        reasonKey: 'errors.generic',
        detail: error?.message || '',
        permission: 'error',
      });
      setState('error');
      return false;
    }

    setMediaType(recorderRef.current.mimeType || mimeType || '');
    setState('ready');
    return true;
  }, [video, teardown, revokeUrl]);

  /** Starts recording. The caller must have awaited prepare() first. */
  const start = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'recording') return false;

    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onerror = (event) => {
      setError({
        kind: 'error',
        reasonKey: 'errors.recordFailed',
        detail: event?.error?.message || '',
        permission: 'error',
      });
      setState('error');
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || 'video/webm',
      });
      chunksRef.current = [];

      // The stop event fires asynchronously, so a boolean "discard" flag would
      // already be cleared by the time we get here. Compare the recorder
      // identity instead: teardown() (unmount / reset / mode change) clears
      // recorderRef, so a stale recorder no longer matches and its take is
      // correctly dropped rather than leaking an object URL.
      if (recorderRef.current !== recorder) {
        // A stop() caller is still waiting for this blob — resolve it, but
        // do not publish it as the current take.
        const resolver = stopResolveRef.current;
        stopResolveRef.current = null;
        if (resolver) resolver(blob.size > 0 ? blob : null);
        return;
      }

      blobRef.current = blob.size > 0 ? blob : null;
      if (blobRef.current) {
        // Revoke the previous take's URL before replacing it.
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(blobRef.current);
        urlRef.current = url;
        setPreviewUrl(url);
      }
      setState((current) => (current === 'recording' ? 'ready' : current));

      const resolver = stopResolveRef.current;
      stopResolveRef.current = null;
      if (resolver) resolver(blobRef.current);
    };

    try {
      recorder.start(250);
    } catch {
      setError({
        kind: 'error',
        reasonKey: 'errors.startFailed',
        detail: '',
        permission: 'error',
      });
      setState('error');
      return false;
    }

    startedAtRef.current = Date.now();
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((Date.now() - startedAtRef.current) / 1000);
    }, 100);

    setState('recording');
    return true;
  }, []);

  /** Stops recording and returns the finished Blob. */
  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return null;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const finalElapsed = (Date.now() - startedAtRef.current) / 1000;
    setElapsed(finalElapsed);

    return new Promise((resolve) => {
      // The onstop handler builds the blob and resolves this. Registering the
      // resolver (rather than wrapping onstop) keeps a single owner for the
      // chunk buffer.
      stopResolveRef.current = resolve;
      try {
        recorder.stop();
      } catch {
        stopResolveRef.current = null;
        resolve(null);
      }
    });
  }, []);

  /** Discards the current take and re-opens the microphone. */
  const reset = useCallback(() => {
    teardown();
    revokeUrl();
    blobRef.current = null;
    setElapsed(0);
    setState('idle');
    setError(null);
  }, [teardown, revokeUrl]);

  return {
    state,
    error,
    elapsed,
    previewUrl,
    mediaType,
    stream,
    hasVideo: video,
    prepare,
    start,
    stop,
    reset,
  };
}
