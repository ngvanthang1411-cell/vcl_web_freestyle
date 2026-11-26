/**
 * Browser capability detection and permission handling.
 *
 * Everything here is best-effort: the app must remain usable when a browser
 * blocks recording, so every failure path resolves to a described state rather
 * than throwing.
 */

/** True if this browser can record at all. */
export function supportsRecording() {
  return typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';
}

/** True if getUserMedia exists (needs a secure context: https or localhost). */
export function supportsGetUserMedia() {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

/** True if the AudioContext API is present (needed for the beat-reactive meter). */
export function supportsAudioContext() {
  return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
}

/** True if the page is served from a secure context (https or localhost). */
export function isSecureContext() {
  return typeof window !== 'undefined' && window.isSecureContext === true;
}

/**
 * Picks the best available MediaRecorder mime type.
 * Safari only supports MP4/AAC in recent versions; Chrome and Firefox prefer WebM.
 * @returns {string|undefined} A mimeType string, or undefined to let the browser choose.
 */
export function pickMimeType() {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
    return undefined;
  }
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'audio/webm;codecs=opus',
    'audio/webm',
    'video/mp4',
    'audio/mp4',
  ];
  const supported = candidates.filter((type) => {
    try {
      return window.MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });
  return supported[0];
}

/**
 * Reason the recording pipeline is unavailable, or null if it is.
 *
 * Returns translation KEYS rather than English strings so the caller can
 * localise them.
 *
 * @returns {{titleKey: string, detailKey: string, kind: 'unsupported'|'insecure'|'permission'} | null}
 */
export function describeUnsupported() {
  if (typeof window === 'undefined') return null;
  if (!supportsRecording()) {
    return {
      kind: 'unsupported',
      titleKey: 'errors.unsupportedTitle',
      detailKey: 'errors.unsupportedDetail',
    };
  }
  if (!supportsGetUserMedia()) {
    return {
      kind: 'insecure',
      titleKey: 'errors.insecureTitle',
      detailKey: 'errors.insecureDetail',
    };
  }
  return null;
}

/**
 * Requests microphone (and optionally camera) access.
 *
 * Failure results carry a `reasonKey` translation key plus the raw error
 * message in `detail`, so the UI can show a localised explanation.
 *
 * @param {object} options
 * @param {boolean} options.video  Request camera video as well.
 * @returns {Promise<{ok: true, stream: MediaStream} | {ok: false, reasonKey: string, detail: string, permission: string}>}
 */
export async function requestMedia({ video = false } = {}) {
  if (!supportsGetUserMedia()) {
    return {
      ok: false,
      reasonKey: 'errors.unsupportedApi',
      detail: '',
      permission: 'unsupported',
    };
  }

  const constraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: video
      ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        }
      : false,
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return { ok: true, stream };
  } catch (error) {
    const name = error?.name || 'Error';
    const raw = error?.message || '';

    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return {
        ok: false,
        reasonKey: 'errors.denied',
        detail: raw,
        permission: 'denied',
      };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        ok: false,
        reasonKey: 'errors.notFound',
        detail: raw,
        permission: 'missing',
      };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        ok: false,
        reasonKey: 'errors.busy',
        detail: raw,
        permission: 'busy',
      };
    }
    if (name === 'OverconstrainedError') {
      return {
        ok: false,
        reasonKey: 'errors.overconstrained',
        detail: raw,
        permission: 'unsupported',
      };
    }
    return {
      ok: false,
      reasonKey: 'errors.generic',
      detail: raw,
      permission: 'error',
    };
  }
}

/** Stops and releases every track in a MediaStream. */
export function stopStream(stream) {
  if (!stream || typeof stream.getTracks !== 'function') return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* track already ended */
    }
  });
}
