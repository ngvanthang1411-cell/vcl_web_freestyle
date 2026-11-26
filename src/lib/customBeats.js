/**
 * Custom Beat Upload & IndexedDB persistence.
 *
 * Lets players upload their own MP3/WAV/OGG/M4A beat files, decodes audio with
 * Web Audio API to extract exact duration, 12-bar waveform peaks, and estimated
 * BPM, and stores the audio Blob in IndexedDB so custom beats stay playable
 * across browser refreshes.
 */

const DB_NAME = 'vcl_custom_beats_db';
const STORE_NAME = 'audio_blobs';
const META_KEY = 'vcl_custom_beats_meta_v1';

const COLOR_PALETTES = [
  ['#F78501', '#753F01'],
  ['#FF4D9D', '#7A0C3E'],
  ['#34D399', '#0E5840'],
  ['#22D3EE', '#0D4E63'],
  ['#BE70FA', '#481475'],
  ['#FBBF24', '#7C4B05'],
];

const objectUrlCache = new Map();

function openBeatDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putAudioBlob(id, blob) {
  const db = await openBeatDB();
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAudioBlob(id) {
  const db = await openBeatDB();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function removeAudioBlob(id) {
  const db = await openBeatDB();
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Lightweight energy-onset BPM estimator for uploaded instrumentals (70–156 BPM).
 */
function estimateBpmFromBuffer(audioBuffer) {
  try {
    const channel = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const maxSamples = Math.min(channel.length, sampleRate * 30); // analyze first 30s
    const hop = Math.floor(sampleRate / 100); // 10ms frames -> 100 fps
    const frameCount = Math.floor(maxSamples / hop);
    if (frameCount < 200) return 96;

    const energies = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i += 1) {
      let sum = 0;
      const start = i * hop;
      for (let j = 0; j < hop; j += 4) {
        const s = channel[start + j];
        sum += s * s;
      }
      energies[i] = sum;
    }

    // Half-wave rectified flux (onset strength)
    const flux = new Float32Array(frameCount);
    for (let i = 1; i < frameCount; i += 1) {
      flux[i] = Math.max(0, energies[i] - energies[i - 1]);
    }

    // Autocorrelation over 72..152 BPM lags (in 10ms frames)
    let bestBpm = 96;
    let bestScore = -1;
    for (let bpm = 72; bpm <= 152; bpm += 1) {
      const lag = Math.round((60 / bpm) * 100);
      let score = 0;
      const limit = frameCount - lag;
      for (let i = 0; i < limit; i += 1) {
        score += flux[i] * flux[i + lag];
      }
      if (score > bestScore) {
        bestScore = score;
        bestBpm = bpm;
      }
    }

    // Prefer hip-hop pocket (80–130 BPM) if octave ambiguous
    if (bestBpm > 136 && bestBpm / 2 >= 72) {
      bestBpm = Math.round(bestBpm / 2);
    }
    return bestBpm;
  } catch {
    return 96;
  }
}

/** Computes 12 normalized peak bars for BeatCover visualization. */
function computeCoverBars(audioBuffer) {
  try {
    const data = audioBuffer.getChannelData(0);
    const count = 12;
    const blockSize = Math.max(1, Math.floor(data.length / count));
    const raw = [];
    let maxVal = 0.001;

    for (let i = 0; i < count; i += 1) {
      let peak = 0;
      const start = i * blockSize;
      const step = Math.max(1, Math.floor(blockSize / 400));
      for (let j = 0; j < blockSize; j += step) {
        const v = Math.abs(data[start + j] || 0);
        if (v > peak) peak = v;
      }
      raw.push(peak);
      if (peak > maxVal) maxVal = peak;
    }

    return raw.map((v) => Number(Math.max(0.18, Math.min(1, v / maxVal)).toFixed(2)));
  } catch {
    return [0.72, 0.34, 0.56, 0.92, 0.28, 0.64, 0.42, 0.24, 0.58, 0.96, 0.36, 0.48];
  }
}

/**
 * Decodes an uploaded audio file and extracts duration, estimated BPM, cover bars,
 * and suggested total bar count.
 */
export async function analyzeAudioFile(file) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    throw new Error('Web Audio API unavailable');
  }
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const duration = Number(decoded.duration.toFixed(2));
    const bpm = estimateBpmFromBuffer(decoded);
    const bars = computeCoverBars(decoded);
    const totalBars = Math.max(8, Math.floor((duration * bpm) / 240));
    const cleanName = file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim()
      .slice(0, 40);

    return {
      title: cleanName || 'Custom Beat',
      duration,
      bpm,
      bar1Offset: 0,
      totalBars,
      bars,
    };
  } finally {
    try {
      await ctx.close();
    } catch {
      // Ignore close errors
    }
  }
}

function readMetaList() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMetaList(list) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(list));
  } catch {
    // Ignore quota errors
  }
}

export async function saveCustomBeat(meta, fileBlob) {
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const palette = COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)];
  const safeBpm = Math.max(60, Math.min(200, Math.round(Number(meta.bpm) || 96)));
  const safeOffset = Math.max(0, Number(meta.bar1Offset) || 0);
  const safeDuration = Math.max(4, Number(meta.duration) || 30);
  const safeBars =
    Number(meta.totalBars) >= 8
      ? Math.round(Number(meta.totalBars))
      : Math.max(8, Math.floor(((safeDuration - safeOffset) * safeBpm) / 240));

  const record = {
    id,
    title: (meta.title || 'Custom Beat').trim().slice(0, 48),
    bpm: safeBpm,
    duration: safeDuration,
    bar1Offset: safeOffset,
    totalBars: safeBars,
    vibe: meta.vibe || 'Custom',
    producer: (meta.producer || 'Upload').trim().slice(0, 32),
    colors: palette,
    bars: meta.bars || [0.75, 0.35, 0.62, 0.9, 0.28, 0.68, 0.44, 0.25, 0.72, 0.95, 0.4, 0.55],
    mood: {
      en: `Uploaded beat · ${safeBars} bars`,
      vi: `Beat tự tải lên · ${safeBars} bar`,
    },
    isCustom: true,
    createdAt: Date.now(),
  };

  await putAudioBlob(id, fileBlob);
  const url = URL.createObjectURL(fileBlob);
  objectUrlCache.set(id, url);

  const list = [record, ...readMetaList()];
  writeMetaList(list);

  return { ...record, src: url };
}

export async function loadCustomBeats() {
  if (typeof window === 'undefined') return [];
  const list = readMetaList();
  const hydrated = [];

  for (const item of list) {
    let url = objectUrlCache.get(item.id);
    if (!url) {
      try {
        const blob = await getAudioBlob(item.id);
        if (!blob) continue;
        url = URL.createObjectURL(blob);
        objectUrlCache.set(item.id, url);
      } catch {
        continue;
      }
    }
    hydrated.push({ ...item, src: url });
  }
  return hydrated;
}

export async function deleteCustomBeat(id) {
  const url = objectUrlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrlCache.delete(id);
  }
  try {
    await removeAudioBlob(id);
  } catch {
    // Ignore IDB errors
  }
  const next = readMetaList().filter((b) => b.id !== id);
  writeMetaList(next);
  return next;
}
