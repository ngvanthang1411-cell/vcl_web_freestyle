/**
 * Vietnamese Speech Recognition scorer (Spec Section 3).
 *
 * Uses the browser's Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)
 * configured to `vi-VN` (or `en-US` when playing in English).
 *
 * Machine score formula (max 10.0, rounded to 1 decimal):
 *   machineScore = round1((wordsHit / totalWords) * 10)
 *
 * Matching rule:
 *   A dropped word counts as a hit if the recognizer hears the target word
 *   within [hitBeat - 1, hitBeat + 1] (1 beat before to 1 beat after target beat).
 */

export function isSpeechRecognitionSupported() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/** Normalizes Vietnamese/English text while keeping diacritics intact. */
export function normalizeSpeechText(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .replace(/[.,!?;:'"“”‘’()[\]{}\-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strips Vietnamese diacritics for light fallback matching on multi-word phrases. */
function stripDiacritics(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Checks whether a spoken transcript contains the dropped target word.
 * Uses exact Vietnamese word/phrase matching first, and allows diacritic-insensitive
 * matching for 2+ syllable phrases where speech-to-text occasionally drops a tone mark.
 */
export function doesTranscriptMatchWord(transcript, targetWord) {
  const normSpeech = normalizeSpeechText(transcript);
  const normTarget = normalizeSpeechText(targetWord);
  if (!normSpeech || !normTarget) return false;

  const paddedSpeech = ` ${normSpeech} `;
  if (paddedSpeech.includes(` ${normTarget} `)) {
    return true;
  }

  // For multi-word phrases (2+ syllables), allow diacritic-tolerant exact phrase match
  const targetParts = normTarget.split(' ');
  if (targetParts.length >= 2) {
    const looseSpeech = ` ${stripDiacritics(normSpeech)} `;
    const looseTarget = ` ${stripDiacritics(normTarget)} `;
    if (looseSpeech.includes(looseTarget)) {
      return true;
    }
  }

  return false;
}

/**
 * Official VCL machine score:
 *   hits / total * 10, rounded to 1 decimal place, max 10.0.
 */
export function calculateMachineScore(hits, total) {
  if (!total || total <= 0) return 0;
  const clampedHits = Math.max(0, Math.min(total, hits || 0));
  return Math.min(10, Math.round((clampedHits / total) * 100) / 10);
}

/**
 * Creates a resilient continuous speech recognition session that auto-restarts
 * on silent pauses while the freestyle round is running.
 */
export function createSpeechTracker({ lang = 'vi-VN', onTranscript, onStatusChange }) {
  if (!isSpeechRecognitionSupported()) {
    onStatusChange?.('unsupported');
    return {
      supported: false,
      start: () => false,
      stop: () => {},
    };
  }

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let active = false;
  let restartTimer = null;

  const launch = () => {
    if (!active) return;
    try {
      recognition = new SpeechRec();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;

      recognition.onstart = () => {
        onStatusChange?.('listening');
      };

      recognition.onresult = (event) => {
        let combined = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const res = event.results[i];
          for (let alt = 0; alt < Math.min(res.length, 2); alt += 1) {
            combined += ` ${res[alt].transcript || ''}`;
          }
        }
        const cleaned = combined.trim();
        if (cleaned) {
          onTranscript?.(cleaned);
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          active = false;
          onStatusChange?.('denied');
        } else if (event.error === 'no-speech' || event.error === 'aborted') {
          // Benign pause — will restart cleanly on end
        } else {
          onStatusChange?.('error');
        }
      };

      recognition.onend = () => {
        if (active) {
          restartTimer = setTimeout(() => {
            if (active) launch();
          }, 180);
        } else {
          onStatusChange?.('idle');
        }
      };

      recognition.start();
    } catch {
      onStatusChange?.('error');
    }
  };

  return {
    supported: true,
    start: () => {
      if (active) return true;
      active = true;
      launch();
      return true;
    },
    stop: () => {
      active = false;
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
      if (recognition) {
        try {
          recognition.onend = null;
          recognition.stop();
        } catch {
          // Ignore stop race
        }
        recognition = null;
      }
      onStatusChange?.('idle');
    },
  };
}
