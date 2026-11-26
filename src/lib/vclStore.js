import { checkContentSafety } from './contentFilter';
import { calculateMachineScore } from './speechMatcher';

/**
 * VCL Demo Store — Auth, Submissions, Viewer Voting, Reports, Ranks, and 5-Tab Leaderboard.
 *
 * Implements the full data model from Spec Section 4, 5, 6, 7, 8 locally in
 * browser storage (+ IndexedDB for submitted video/audio recordings) so the
 * complete demo works end-to-end with zero external backend required.
 */

const USERS_KEY = 'vcl_users_v1';
const SESSION_KEY = 'vcl_session_v1';
const SUBMISSIONS_KEY = 'vcl_submissions_v1';
const VOTES_KEY = 'vcl_votes_v1';
const REPORTS_KEY = 'vcl_reports_v1';
const RANKS_KEY = 'vcl_ranks_v1';
const DEVICE_KEY = 'vcl_device_id_v1';
const SEEDED_KEY = 'vcl_seeded_v1';

const REC_DB_NAME = 'vcl_recordings_db';
const REC_STORE = 'recordings';

export const DEFAULT_RANKS_CONFIG = [
  { id: 'rank-1', title: 'Tân binh Mic', minPoints: 0, icon: '🎤' },
  { id: 'rank-2', title: 'Tay chơi Vần', minPoints: 20, icon: '⚡' },
  { id: 'rank-3', title: 'Chiến binh Freestyle', minPoints: 50, icon: '🔥' },
  { id: 'rank-4', title: 'Quái vật On-Beat', minPoints: 100, icon: '👑' },
  { id: 'rank-5', title: 'Huyền thoại VCL', minPoints: 200, icon: '🏆' },
];

export const REPORT_REASONS = [
  { id: 'harassment', vi: 'Quấy rối / công kích cá nhân', en: 'Harassment' },
  { id: 'spam', vi: 'Spam / gian lận', en: 'Spam' },
  { id: 'under18', vi: 'Trông dưới 18 tuổi', en: 'Appears under 18' },
  { id: 'banned', vi: 'Nội dung cấm', en: 'Prohibited content' },
];

/* ----------------------------------------------------- Vietnam Week Utils */

/**
 * Computes the Vietnam (UTC+7) week key (Monday 00:00 -> Sunday 23:59) as YYYY-Www.
 */
export function getVietnamWeekKey(timestampMs = Date.now()) {
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const vnDate = new Date(timestampMs + vnOffsetMs);
  const d = new Date(Date.UTC(vnDate.getUTCFullYear(), vnDate.getUTCMonth(), vnDate.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1 .. Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getDeviceId() {
  if (typeof window === 'undefined') return 'ssr-device';
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'anon-device';
  }
}

/* --------------------------------------------------------- IndexedDB blobs */

function openRecDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(REC_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(REC_STORE)) {
        db.createObjectStore(REC_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecordingBlob(id, blob) {
  if (!blob) return false;
  try {
    const db = await openRecDB();
    if (!db) return false;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(REC_STORE, 'readwrite');
      tx.objectStore(REC_STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

export async function loadRecordingBlob(id) {
  if (!id) return null;
  try {
    const db = await openRecDB();
    if (!db) return null;
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(REC_STORE, 'readonly');
      const req = tx.objectStore(REC_STORE).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------- Storage I/O */

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

/* ----------------------------------------------------------- Ranks Config */

export function getRanksConfig() {
  const saved = readJson(RANKS_KEY, null);
  if (Array.isArray(saved) && saved.length > 0) {
    return [...saved].sort((a, b) => a.minPoints - b.minPoints);
  }
  return DEFAULT_RANKS_CONFIG;
}

export function saveRanksConfig(ranks) {
  const cleaned = [...ranks]
    .filter((r) => r && r.title)
    .map((r, i) => ({
      id: r.id || `rank-${i + 1}`,
      title: String(r.title).trim().slice(0, 40),
      minPoints: Math.max(0, Number(r.minPoints) || 0),
      icon: r.icon || '🎤',
    }))
    .sort((a, b) => a.minPoints - b.minPoints);
  writeJson(RANKS_KEY, cleaned);
  recomputeAllUsersPoints();
  return cleaned;
}

export function getRankForPoints(points, ranks = getRanksConfig()) {
  let current = ranks[0] ?? DEFAULT_RANKS_CONFIG[0];
  let next = null;
  for (let i = 0; i < ranks.length; i += 1) {
    if (points >= ranks[i].minPoints) {
      current = ranks[i];
      next = ranks[i + 1] ?? null;
    }
  }
  return { current, next };
}

/* -------------------------------------------------------- Demo Seed Data */

export function ensureDemoSeeded() {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(SEEDED_KEY)) return;

  const now = Date.now();
  const thisWeek = getVietnamWeekKey(now);
  const lastWeekMs = now - 8 * 86400000;
  const lastWeek = getVietnamWeekKey(lastWeekMs);

  const seedUsers = [
    {
      id: 'u-demo-1',
      account: '0901234567',
      password: '123456',
      displayName: 'MC VCL Demo',
      socialHandle: 'vcl_mc',
      birthYear: 1998,
      createdAt: now - 30 * 86400000,
      totalPoints: 0,
      rankTitle: 'Tân binh Mic',
      isAdmin: true,
    },
    {
      id: 'u-demo-2',
      account: 'saigon_flow',
      password: '123456',
      displayName: 'Saigon Flow',
      socialHandle: 'saigon_flow',
      birthYear: 2000,
      createdAt: now - 25 * 86400000,
      totalPoints: 0,
      rankTitle: 'Tân binh Mic',
    },
    {
      id: 'u-demo-3',
      account: 'hanoi_bars',
      password: '123456',
      displayName: 'Hà Nội Bars',
      socialHandle: 'hanoi_bars',
      birthYear: 1997,
      createdAt: now - 20 * 86400000,
      totalPoints: 0,
      rankTitle: 'Tân binh Mic',
    },
    {
      id: 'u-demo-4',
      account: 'danang_rhyme',
      password: '123456',
      displayName: 'Đà Nẵng Rhyme',
      socialHandle: 'danang_rhyme',
      birthYear: 2002,
      createdAt: now - 14 * 86400000,
      totalPoints: 0,
      rankTitle: 'Tân binh Mic',
    },
  ];

  const seedSubmissions = [
    {
      id: 'sub-demo-1',
      voteCode: 'VCL88A',
      mode: 'solo',
      player1Id: 'u-demo-2',
      player1Name: 'Saigon Flow',
      player1Handle: 'saigon_flow',
      player2Id: null,
      player2Name: '',
      player2Handle: '',
      beatId: 'neon-nightrun',
      beatTitle: 'Neon Nightrun',
      beatBpm: 92,
      bars: 16,
      flow: 'beat4',
      difficulty: 'easy',
      wordsTotal: 16,
      wordsHit: 14,
      machineScore: 8.8,
      p1WordsTotal: 16,
      p1WordsHit: 14,
      p1MachineScore: 8.8,
      p2WordsTotal: 0,
      p2WordsHit: 0,
      p2MachineScore: 0,
      viewerVotes: 64,
      p1ViewerVotes: 64,
      p2ViewerVotes: 0,
      totalScore: 72.8,
      p1TotalScore: 72.8,
      p2TotalScore: 0,
      tuRoi: [
        { order: 1, text: 'quê nhà', nest: 'a · bằng', status: 'hit', heardText: 'quê nhà', playerIndex: 1 },
        { order: 2, text: 'bao la', nest: 'a · bằng', status: 'hit', heardText: 'bao la', playerIndex: 1 },
        { order: 3, text: 'tương lai', nest: 'ai · bằng', status: 'hit', heardText: 'tương lai', playerIndex: 1 },
        { order: 4, text: 'đường dài', nest: 'ai · bằng', status: 'hit', heardText: 'đường dài', playerIndex: 1 },
        { order: 5, text: 'thời gian', nest: 'an · bằng', status: 'miss', heardText: '', playerIndex: 1 },
        { order: 6, text: 'bình an', nest: 'an · bằng', status: 'hit', heardText: 'bình an', playerIndex: 1 },
      ],
      hasRecording: false,
      recordingId: null,
      isVideo: false,
      speechSupported: true,
      weekKey: thisWeek,
      submittedAt: now - 5 * 3600000,
      hidden: false,
      seedVotes: 64,
      seedVotesThisWeek: 64,
    },
    {
      id: 'sub-demo-2',
      voteCode: 'VCL92B',
      mode: 'solo',
      player1Id: 'u-demo-3',
      player1Name: 'Hà Nội Bars',
      player1Handle: 'hanoi_bars',
      player2Id: null,
      player2Name: '',
      player2Handle: '',
      beatId: 'concrete-bounce',
      beatTitle: 'Concrete Bounce',
      beatBpm: 104,
      bars: 16,
      flow: 'beat24',
      difficulty: 'medium',
      wordsTotal: 32,
      wordsHit: 27,
      machineScore: 8.4,
      p1WordsTotal: 32,
      p1WordsHit: 27,
      p1MachineScore: 8.4,
      p2WordsTotal: 0,
      p2WordsHit: 0,
      p2MachineScore: 0,
      viewerVotes: 51,
      p1ViewerVotes: 51,
      p2ViewerVotes: 0,
      totalScore: 59.4,
      p1TotalScore: 59.4,
      p2TotalScore: 0,
      tuRoi: [
        { order: 1, text: 'phong cách', nest: 'ach · trắc', status: 'hit', heardText: 'phong cách', playerIndex: 1 },
        { order: 2, text: 'thử thách', nest: 'ach · trắc', status: 'hit', heardText: 'thử thách', playerIndex: 1 },
        { order: 3, text: 'tầm nhìn', nest: 'in · bằng', status: 'hit', heardText: 'tầm nhìn', playerIndex: 1 },
        { order: 4, text: 'niềm tin', nest: 'in · bằng', status: 'hit', heardText: 'niềm tin', playerIndex: 1 },
      ],
      hasRecording: false,
      recordingId: null,
      isVideo: false,
      speechSupported: true,
      weekKey: thisWeek,
      submittedAt: now - 12 * 3600000,
      hidden: false,
      seedVotes: 51,
      seedVotesThisWeek: 51,
    },
    {
      id: 'sub-demo-3',
      voteCode: 'VCL77C',
      mode: 'solo',
      player1Id: 'u-demo-4',
      player1Name: 'Đà Nẵng Rhyme',
      player1Handle: 'danang_rhyme',
      player2Id: null,
      player2Name: '',
      player2Handle: '',
      beatId: 'midnight-lane',
      beatTitle: 'Midnight Lane',
      beatBpm: 86,
      bars: 16,
      flow: 'beat4',
      difficulty: 'hard',
      wordsTotal: 16,
      wordsHit: 13,
      machineScore: 8.1,
      p1WordsTotal: 16,
      p1WordsHit: 13,
      p1MachineScore: 8.1,
      p2WordsTotal: 0,
      p2WordsHit: 0,
      p2MachineScore: 0,
      viewerVotes: 112,
      p1ViewerVotes: 112,
      p2ViewerVotes: 0,
      totalScore: 120.1,
      p1TotalScore: 120.1,
      p2TotalScore: 0,
      tuRoi: [
        { order: 1, text: 'đêm khuya', nest: 'ia · bằng', status: 'hit', heardText: 'đêm khuya', playerIndex: 1 },
        { order: 2, text: 'sẻ chia', nest: 'ia · bằng', status: 'hit', heardText: 'sẻ chia', playerIndex: 1 },
        { order: 3, text: 'cất bước', nest: 'ươc · trắc', status: 'hit', heardText: 'cất bước', playerIndex: 1 },
      ],
      hasRecording: false,
      recordingId: null,
      isVideo: false,
      speechSupported: true,
      weekKey: lastWeek,
      submittedAt: lastWeekMs,
      hidden: false,
      seedVotes: 112,
      seedVotesThisWeek: 14, // bài cũ vẫn nhận thêm vote tuần này!
    },
    {
      id: 'sub-demo-battle-1',
      voteCode: 'VCL2V2',
      mode: 'battle',
      player1Id: 'u-demo-2',
      player1Name: 'Saigon Flow',
      player1Handle: 'saigon_flow',
      player2Id: 'u-demo-3',
      player2Name: 'Hà Nội Bars',
      player2Handle: 'hanoi_bars',
      beatId: 'rooftop-radio',
      beatTitle: 'Rooftop Radio',
      beatBpm: 98,
      bars: 16,
      flow: 'beat4',
      difficulty: 'easy',
      wordsTotal: 16,
      wordsHit: 13,
      machineScore: 8.1,
      p1WordsTotal: 8,
      p1WordsHit: 7,
      p1MachineScore: 8.8,
      p2WordsTotal: 8,
      p2WordsHit: 6,
      p2MachineScore: 7.5,
      viewerVotes: 43,
      p1ViewerVotes: 24,
      p2ViewerVotes: 19,
      totalScore: 59.3,
      p1TotalScore: 32.8,
      p2TotalScore: 26.5,
      tuRoi: [
        { order: 1, text: 'sân khấu', nest: 'âu · trắc', status: 'hit', heardText: 'sân khấu', playerIndex: 1 },
        { order: 2, text: 'thi đấu', nest: 'âu · trắc', status: 'hit', heardText: 'thi đấu', playerIndex: 1 },
        { order: 3, text: 'chiến thắng', nest: 'ăng · trắc', status: 'hit', heardText: 'chiến thắng', playerIndex: 2 },
        { order: 4, text: 'ánh nắng', nest: 'ăng · trắc', status: 'hit', heardText: 'ánh nắng', playerIndex: 2 },
      ],
      hasRecording: false,
      recordingId: null,
      isVideo: false,
      speechSupported: true,
      weekKey: thisWeek,
      submittedAt: now - 3 * 3600000,
      hidden: false,
      seedP1Votes: 24,
      seedP2Votes: 19,
      seedVotes: 43,
      seedVotesThisWeek: 43,
    },
  ];

  writeJson(USERS_KEY, seedUsers);
  writeJson(SUBMISSIONS_KEY, seedSubmissions);
  writeJson(VOTES_KEY, []);
  writeJson(REPORTS_KEY, []);
  writeJson(RANKS_KEY, DEFAULT_RANKS_CONFIG);
  window.localStorage.setItem(SEEDED_KEY, '1');
  recomputeAllUsersPoints();
}

/* ------------------------------------------------------------------- Auth */

export function getAllUsers() {
  ensureDemoSeeded();
  return readJson(USERS_KEY, []);
}

export function getCurrentUser() {
  ensureDemoSeeded();
  const sessionId = readJson(SESSION_KEY, null);
  if (!sessionId) return null;
  const users = getAllUsers();
  return users.find((u) => u.id === sessionId) ?? null;
}

export function logoutDemoUser() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore
  }
}

export function loginDemoUser(account, password) {
  ensureDemoSeeded();
  const normAcc = String(account || '').trim().toLowerCase().replace(/^@+/, '');
  const users = getAllUsers();
  const found = users.find(
    (u) =>
      u.account.toLowerCase() === normAcc ||
      u.socialHandle.toLowerCase() === normAcc,
  );
  if (!found) {
    return { ok: false, error: 'not_found' };
  }
  if (password !== undefined && password !== '' && found.password !== password) {
    return { ok: false, error: 'wrong_password' };
  }
  writeJson(SESSION_KEY, found.id);
  return { ok: true, user: found };
}

export function registerDemoUser({ account, password, displayName, socialHandle, birthYear }) {
  ensureDemoSeeded();
  const cleanAcc = String(account || '').trim();
  const cleanName = String(displayName || '').trim();
  const cleanHandle = String(socialHandle || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '_');
  const year = Number(birthYear);

  if (!cleanAcc || cleanAcc.length < 3) {
    return { ok: false, error: 'invalid_account' };
  }
  if (!cleanName || cleanName.length < 2) {
    return { ok: false, error: 'invalid_name' };
  }
  if (!Number.isFinite(year) || year < 1940 || year > new Date().getFullYear()) {
    return { ok: false, error: 'invalid_birth_year' };
  }

  // Filter displayName & handle using VCL Từ chặn
  const nameCheck = checkContentSafety(cleanName);
  if (!nameCheck.ok) {
    return { ok: false, error: 'banned_word', matchedTerm: nameCheck.matchedTerm };
  }
  const handleCheck = checkContentSafety(cleanHandle);
  if (!handleCheck.ok) {
    return { ok: false, error: 'banned_word', matchedTerm: handleCheck.matchedTerm };
  }

  const users = getAllUsers();
  const exists = users.some(
    (u) =>
      u.account.toLowerCase() === cleanAcc.toLowerCase() ||
      (cleanHandle && u.socialHandle.toLowerCase() === cleanHandle.toLowerCase()),
  );
  if (exists) {
    return { ok: false, error: 'already_exists' };
  }

  const ranks = getRanksConfig();
  const newUser = {
    id: `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    account: cleanAcc,
    password: String(password || '123456'),
    displayName: cleanName.slice(0, 32),
    socialHandle: (cleanHandle || cleanAcc).slice(0, 28),
    birthYear: year,
    createdAt: Date.now(),
    totalPoints: 0,
    rankTitle: ranks[0]?.title || 'Tân binh Mic',
    isAdmin: false,
  };

  writeJson(USERS_KEY, [newUser, ...users]);
  writeJson(SESSION_KEY, newUser.id);
  return { ok: true, user: newUser };
}

/**
 * Demo OAuth sign-in / sign-up via Google (Gmail) or Facebook.
 * Reuses an existing account if the email/account matches, or creates a new one.
 */
export function loginWithSocialProvider({
  provider, // 'google' | 'facebook'
  email,
  displayName,
  socialHandle,
  birthYear = 1999,
}) {
  ensureDemoSeeded();
  const safeProvider = provider === 'facebook' ? 'facebook' : 'google';
  const cleanEmail = String(email || '').trim().toLowerCase();

  if (safeProvider === 'google' && (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))) {
    return { ok: false, error: 'invalid_gmail' };
  }
  if (safeProvider === 'facebook' && (!cleanEmail || cleanEmail.length < 3)) {
    return { ok: false, error: 'invalid_fb' };
  }

  const users = getAllUsers();
  const existing = users.find(
    (u) =>
      (u.email && u.email.toLowerCase() === cleanEmail) ||
      u.account.toLowerCase() === cleanEmail,
  );
  if (existing) {
    writeJson(SESSION_KEY, existing.id);
    return { ok: true, user: existing, isNew: false };
  }

  const fallbackName = cleanEmail.includes('@') ? cleanEmail.split('@')[0] : cleanEmail;
  const cleanName = String(displayName || fallbackName).trim().slice(0, 32);
  const rawHandle = String(socialHandle || fallbackName)
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 28);

  const nameCheck = checkContentSafety(cleanName);
  if (!nameCheck.ok) {
    return { ok: false, error: 'banned_word', matchedTerm: nameCheck.matchedTerm };
  }
  const handleCheck = checkContentSafety(rawHandle);
  if (!handleCheck.ok) {
    return { ok: false, error: 'banned_word', matchedTerm: handleCheck.matchedTerm };
  }

  const year = Number(birthYear);
  if (!Number.isFinite(year) || year < 1940 || year > new Date().getFullYear()) {
    return { ok: false, error: 'invalid_birth_year' };
  }

  // Ensure unique handle
  let finalHandle = rawHandle || `${safeProvider}_mc`;
  if (users.some((u) => u.socialHandle.toLowerCase() === finalHandle.toLowerCase())) {
    finalHandle = `${finalHandle.slice(0, 22)}_${Math.floor(10 + Math.random() * 89)}`;
  }

  const ranks = getRanksConfig();
  const newUser = {
    id: `u-${safeProvider}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    account: cleanEmail,
    email: cleanEmail,
    provider: safeProvider,
    password: '',
    displayName: cleanName || finalHandle,
    socialHandle: finalHandle,
    birthYear: year,
    createdAt: Date.now(),
    totalPoints: 0,
    rankTitle: ranks[0]?.title || 'Tân binh Mic',
    rankIcon: ranks[0]?.icon || '🎤',
    isAdmin: false,
  };

  writeJson(USERS_KEY, [newUser, ...users]);
  writeJson(SESSION_KEY, newUser.id);
  return { ok: true, user: newUser, isNew: true };
}

export function isUser18Plus(user) {
  if (!user || !user.birthYear) return false;
  const currentYear = new Date().getFullYear();
  return currentYear - Number(user.birthYear) >= 18;
}

export function findUserByHandleOrAccount(query) {
  const clean = String(query || '').trim().toLowerCase().replace(/^@+/, '');
  if (!clean) return null;
  return (
    getAllUsers().find(
      (u) => u.socialHandle.toLowerCase() === clean || u.account.toLowerCase() === clean,
    ) ?? null
  );
}

/* ----------------------------------------------------- Submissions & Votes */

export function getAllVotes() {
  ensureDemoSeeded();
  return readJson(VOTES_KEY, []);
}

export function getAllReports() {
  ensureDemoSeeded();
  return readJson(REPORTS_KEY, []);
}

/**
 * Hydrates live scores for a submission from its `tuRoi` list + live `luot_cham`.
 * Always recomputes machine score from `tuRoi` (Spec Section 3).
 */
export function computeSubmissionMetrics(sub, allVotes = getAllVotes(), targetWeekKey = getVietnamWeekKey()) {
  const subVotes = allVotes.filter((v) => v.submissionId === sub.id);
  const seedVotes = sub.seedVotes ?? 0;
  const seedVotesThisWeek = sub.seedVotesThisWeek ?? 0;

  // Recompute machine score from tuRoi if available
  const tuRoi = Array.isArray(sub.tuRoi) ? sub.tuRoi : [];
  let machineScore = sub.machineScore ?? 0;
  let p1MachineScore = sub.p1MachineScore ?? machineScore;
  let p2MachineScore = sub.p2MachineScore ?? 0;

  if (tuRoi.length > 0 && sub.wordsTotal > 0 && tuRoi.length === sub.wordsTotal) {
    if (sub.mode === 'battle') {
      const p1List = tuRoi.filter((w) => w.playerIndex === 1);
      const p2List = tuRoi.filter((w) => w.playerIndex === 2);
      const p1Hits = p1List.filter((w) => w.status === 'hit').length;
      const p2Hits = p2List.filter((w) => w.status === 'hit').length;
      p1MachineScore = calculateMachineScore(p1Hits, p1List.length);
      p2MachineScore = calculateMachineScore(p2Hits, p2List.length);
      machineScore = calculateMachineScore(p1Hits + p2Hits, tuRoi.length);
    } else {
      const hits = tuRoi.filter((w) => w.status === 'hit').length;
      machineScore = calculateMachineScore(hits, tuRoi.length);
      p1MachineScore = machineScore;
    }
  }

  if (sub.mode === 'battle') {
    const liveP1Votes = subVotes.filter((v) => v.choice === 'p1').length;
    const liveP2Votes = subVotes.filter((v) => v.choice === 'p2').length;
    const p1ViewerVotes = (sub.seedP1Votes ?? 0) + liveP1Votes;
    const p2ViewerVotes = (sub.seedP2Votes ?? 0) + liveP2Votes;
    const viewerVotes = p1ViewerVotes + p2ViewerVotes;

    const p1TotalScore = Number((p1ViewerVotes + p1MachineScore).toFixed(1));
    const p2TotalScore = Number((p2ViewerVotes + p2MachineScore).toFixed(1));

    const weeklyVotes =
      seedVotesThisWeek +
      subVotes.filter((v) => getVietnamWeekKey(v.createdAt) === targetWeekKey).length;

    return {
      ...sub,
      machineScore,
      p1MachineScore,
      p2MachineScore,
      viewerVotes,
      p1ViewerVotes,
      p2ViewerVotes,
      totalScore: Number((p1TotalScore + p2TotalScore).toFixed(1)),
      p1TotalScore,
      p2TotalScore,
      weeklyVotes,
      weeklyScore: weeklyVotes,
    };
  }

  // Solo
  const viewerVotes = seedVotes + subVotes.length;
  const totalScore = Number((viewerVotes + machineScore).toFixed(1));
  const liveWeeklyVotes = subVotes.filter((v) => getVietnamWeekKey(v.createdAt) === targetWeekKey).length;
  const weeklyVotes = seedVotesThisWeek + liveWeeklyVotes;
  const weeklyScore = Number(
    (weeklyVotes + (sub.weekKey === targetWeekKey ? machineScore : 0)).toFixed(1),
  );

  return {
    ...sub,
    machineScore,
    p1MachineScore: machineScore,
    viewerVotes,
    p1ViewerVotes: viewerVotes,
    totalScore,
    p1TotalScore: totalScore,
    weeklyVotes,
    weeklyScore,
  };
}

export function getAllSubmissions({ includeHidden = false } = {}) {
  ensureDemoSeeded();
  const raw = readJson(SUBMISSIONS_KEY, []);
  const votes = getAllVotes();
  const weekKey = getVietnamWeekKey();
  return raw
    .filter((s) => includeHidden || !s.hidden)
    .map((s) => computeSubmissionMetrics(s, votes, weekKey));
}

export function getSubmissionByCode(code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return null;
  return getAllSubmissions({ includeHidden: true }).find((s) => s.voteCode.toUpperCase() === clean) ?? null;
}

/**
 * Enforces Spec Section 5: 1 solo + 1 battle submission per user per Vietnam week.
 */
export function canUserSubmitThisWeek(userId, mode = 'solo') {
  if (!userId) return { allowed: false, reason: 'login_required' };
  const weekKey = getVietnamWeekKey();
  const subs = readJson(SUBMISSIONS_KEY, []);
  const already = subs.find(
    (s) => s.player1Id === userId && s.mode === mode && s.weekKey === weekKey && !s.hidden,
  );
  if (already) {
    return { allowed: false, reason: 'weekly_limit', existingCode: already.voteCode };
  }
  return { allowed: true };
}

function generateVoteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'VCL';
  for (let i = 0; i < 4; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * Creates and persists a new Thi submission, recomputing machine scores from `tuRoi`
 * and saving the recording Blob in IndexedDB if available.
 */
export async function submitEntry({ user, result, opponentAccount, consents }) {
  ensureDemoSeeded();
  if (!user) return { ok: false, error: 'login_required' };
  if (!isUser18Plus(user)) return { ok: false, error: 'under_18' };

  const mode = result.battleMode ? 'battle' : 'solo';
  const limitCheck = canUserSubmitThisWeek(user.id, mode);
  if (!limitCheck.allowed) {
    return { ok: false, error: 'weekly_limit', existingCode: limitCheck.existingCode };
  }

  if (!consents?.ownWork || !consents?.everyoneAgreed || !consents?.is18Plus || !consents?.allowRepost) {
    return { ok: false, error: 'consents_required' };
  }

  const tuRoi = Array.isArray(result.tuRoi)
    ? result.tuRoi.map((w, idx) => ({
        order: w.order ?? idx + 1,
        text: w.text,
        nest: w.nest || '',
        status: w.status === 'hit' || w.status === 'perfect' || w.status === 'good' ? 'hit' : 'miss',
        heardText: w.heardText || '',
        playerIndex: w.playerIndex ?? 1,
      }))
    : [];

  // Server-side (store-side) recalculation from tuRoi
  let wordsTotal = tuRoi.length || result.wordsShown || 0;
  let wordsHit = tuRoi.filter((w) => w.status === 'hit').length;
  let p1WordsTotal = wordsTotal;
  let p1WordsHit = wordsHit;
  let p2WordsTotal = 0;
  let p2WordsHit = 0;

  if (mode === 'battle' && tuRoi.length > 0) {
    const p1Items = tuRoi.filter((w) => w.playerIndex === 1);
    const p2Items = tuRoi.filter((w) => w.playerIndex === 2);
    p1WordsTotal = p1Items.length;
    p1WordsHit = p1Items.filter((w) => w.status === 'hit').length;
    p2WordsTotal = p2Items.length;
    p2WordsHit = p2Items.filter((w) => w.status === 'hit').length;
  }

  const machineScore = calculateMachineScore(wordsHit, wordsTotal);
  const p1MachineScore = calculateMachineScore(p1WordsHit, p1WordsTotal);
  const p2MachineScore = calculateMachineScore(p2WordsHit, p2WordsTotal);

  // Resolve Player 2 account if battle mode
  const p2User = mode === 'battle' ? findUserByHandleOrAccount(opponentAccount || result.opponent) : null;
  const p2HandleRaw = mode === 'battle' ? (p2User?.socialHandle || result.opponent || 'Khách 2') : '';
  if (p2HandleRaw && !checkContentSafety(p2HandleRaw).ok) {
    return { ok: false, error: 'banned_word' };
  }

  const id = `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const voteCode = generateVoteCode();

  let hasRecording = false;
  if (result.blob) {
    hasRecording = await saveRecordingBlob(id, result.blob);
  }

  const submission = {
    id,
    voteCode,
    mode,
    player1Id: user.id,
    player1Name: user.displayName,
    player1Handle: user.socialHandle,
    player2Id: p2User?.id ?? null,
    player2Name: p2User?.displayName || (mode === 'battle' ? p2HandleRaw : ''),
    player2Handle: p2HandleRaw,
    beatId: result.beatId || null,
    beatTitle: result.beatTitle || 'Freestyle Beat',
    beatBpm: result.beatBpm || 96,
    bars: result.bars || 16,
    flow: result.flow || 'beat4',
    difficulty: result.difficulty || 'easy',
    wordsTotal,
    wordsHit,
    machineScore,
    p1WordsTotal,
    p1WordsHit,
    p1MachineScore,
    p2WordsTotal,
    p2WordsHit,
    p2MachineScore,
    viewerVotes: 0,
    p1ViewerVotes: 0,
    p2ViewerVotes: 0,
    totalScore: mode === 'battle' ? Number((p1MachineScore + p2MachineScore).toFixed(1)) : machineScore,
    p1TotalScore: p1MachineScore,
    p2TotalScore: p2MachineScore,
    tuRoi,
    hasRecording,
    recordingId: hasRecording ? id : null,
    isVideo: Boolean(result.video && hasRecording),
    speechSupported: result.speechSupported !== false,
    weekKey: getVietnamWeekKey(),
    submittedAt: Date.now(),
    hidden: false,
    consents,
  };

  const subs = [submission, ...readJson(SUBMISSIONS_KEY, [])];
  writeJson(SUBMISSIONS_KEY, subs);
  recomputeAllUsersPoints();

  return { ok: true, submission: computeSubmissionMetrics(submission) };
}

/**
 * Casts a viewer vote (Spec Section 4).
 *  - No login required for viewers.
 *  - 1 vote / device / submission.
 *  - If viewerId (?u=<id>) is provided: also 1 vote / viewerId / submission.
 *  - Author cannot vote on their own entry.
 */
export function castVote({ submissionId, choice = 'solo', viewerId = '', source = 'web', currentUser = null }) {
  ensureDemoSeeded();
  const rawSubs = readJson(SUBMISSIONS_KEY, []);
  const sub = rawSubs.find((s) => s.id === submissionId);
  if (!sub || sub.hidden) return { ok: false, error: 'not_found' };

  if (currentUser && (currentUser.id === sub.player1Id || currentUser.id === sub.player2Id)) {
    return { ok: false, error: 'self_vote_blocked' };
  }

  const deviceId = getDeviceId();
  const cleanViewerId = String(viewerId || '').trim();
  const votes = getAllVotes();

  const dupDevice = votes.some((v) => v.submissionId === submissionId && v.deviceId === deviceId);
  if (dupDevice) {
    return { ok: false, error: 'already_voted_device' };
  }

  if (cleanViewerId) {
    const dupViewer = votes.some(
      (v) => v.submissionId === submissionId && v.viewerId && v.viewerId === cleanViewerId,
    );
    if (dupViewer) {
      return { ok: false, error: 'already_voted_id' };
    }
  }

  const validChoice = sub.mode === 'battle' ? (choice === 'p2' ? 'p2' : 'p1') : 'solo';

  const newVote = {
    id: `vote-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    submissionId,
    deviceId,
    viewerId: cleanViewerId,
    source: source || 'web',
    choice: validChoice,
    createdAt: Date.now(),
  };

  const nextVotes = [newVote, ...votes];
  writeJson(VOTES_KEY, nextVotes);
  recomputeAllUsersPoints();

  return {
    ok: true,
    vote: newVote,
    submission: computeSubmissionMetrics(sub, nextVotes),
  };
}

export function hasDeviceVoted(submissionId, viewerId = '') {
  const deviceId = getDeviceId();
  const cleanViewerId = String(viewerId || '').trim();
  const votes = getAllVotes();
  return votes.find(
    (v) =>
      v.submissionId === submissionId &&
      (v.deviceId === deviceId || (cleanViewerId && v.viewerId === cleanViewerId)),
  ) ?? null;
}

/* ----------------------------------------------------- Reports & Admin */

export function reportSubmission({ submissionId, reason }) {
  ensureDemoSeeded();
  const reports = getAllReports();
  const entry = {
    id: `rep-${Date.now().toString(36)}`,
    submissionId,
    deviceId: getDeviceId(),
    reason,
    createdAt: Date.now(),
  };
  writeJson(REPORTS_KEY, [entry, ...reports]);
  return { ok: true, report: entry };
}

export function adminToggleHideSubmission(submissionId) {
  const rawSubs = readJson(SUBMISSIONS_KEY, []);
  const next = rawSubs.map((s) => (s.id === submissionId ? { ...s, hidden: !s.hidden } : s));
  writeJson(SUBMISSIONS_KEY, next);
  recomputeAllUsersPoints();
  return next.find((s) => s.id === submissionId) ?? null;
}

export function adminDeleteVote(voteId) {
  const votes = getAllVotes().filter((v) => v.id !== voteId);
  writeJson(VOTES_KEY, votes);
  recomputeAllUsersPoints();
  return votes;
}

/* ------------------------------------------------- Cumulative Points & Ranks */

/**
 * Recomputes every player's cumulative points (all solo entries + their share
 * of all battle entries, never resets) and updates their Danh hiệu.
 */
export function recomputeAllUsersPoints() {
  if (typeof window === 'undefined') return [];
  const users = readJson(USERS_KEY, []);
  const subs = getAllSubmissions({ includeHidden: false });
  const ranks = getRanksConfig();

  const totals = new Map();
  for (const u of users) totals.set(u.id, 0);

  for (const s of subs) {
    if (s.mode === 'solo') {
      if (s.player1Id && totals.has(s.player1Id)) {
        totals.set(s.player1Id, totals.get(s.player1Id) + (s.totalScore || 0));
      }
    } else if (s.mode === 'battle') {
      if (s.player1Id && totals.has(s.player1Id)) {
        totals.set(s.player1Id, totals.get(s.player1Id) + (s.p1TotalScore || 0));
      }
      if (s.player2Id && totals.has(s.player2Id)) {
        totals.set(s.player2Id, totals.get(s.player2Id) + (s.p2TotalScore || 0));
      }
    }
  }

  const updated = users.map((u) => {
    const pts = Number((totals.get(u.id) || 0).toFixed(1));
    const { current } = getRankForPoints(pts, ranks);
    return {
      ...u,
      totalPoints: pts,
      rankTitle: current.title,
      rankIcon: current.icon,
    };
  });

  writeJson(USERS_KEY, updated);
  return updated;
}

/* -------------------------------------------------- 5-Tab Leaderboard Sort */

function tieBreakCompare(a, b, primaryDiff) {
  if (primaryDiff !== 0) return primaryDiff;
  // Tie-breaker 1: higher machineScore first
  const machineDiff = (b.machineScore || 0) - (a.machineScore || 0);
  if (machineDiff !== 0) return machineDiff;
  // Tie-breaker 2: earlier submission first
  return (a.submittedAt || 0) - (b.submittedAt || 0);
}

export function getLeaderboardData({ battleFilter = 'week' } = {}) {
  const weekKey = getVietnamWeekKey();
  const subs = getAllSubmissions({ includeHidden: false });
  const users = recomputeAllUsersPoints();

  const soloSubs = subs.filter((s) => s.mode === 'solo');
  const battleSubs = subs.filter((s) => s.mode === 'battle');

  // Tab 1: Top tuần — solo submitted this week, ordered by weeklyScore
  const topWeek = soloSubs
    .filter((s) => s.weekKey === weekKey)
    .sort((a, b) => tieBreakCompare(a, b, (b.weeklyScore || 0) - (a.weeklyScore || 0)));

  // Tab 2: Top mọi lúc — all solo, ordered by totalScore
  const topAllTime = [...soloSubs].sort((a, b) =>
    tieBreakCompare(a, b, (b.totalScore || 0) - (a.totalScore || 0)),
  );

  // Tab 3: Danh hiệu — players ordered by cumulative totalPoints
  const ranksBoard = [...users].sort(
    (a, b) => (b.totalPoints || 0) - (a.totalPoints || 0) || (a.createdAt || 0) - (b.createdAt || 0),
  );

  // Tab 4: Đấu — 2-player battles ordered by viewer votes (week or all-time)
  const battles = battleSubs
    .filter((s) => battleFilter === 'all' || s.weekKey === weekKey)
    .sort((a, b) => {
      const votesA = battleFilter === 'week' ? a.weeklyVotes || 0 : a.viewerVotes || 0;
      const votesB = battleFilter === 'week' ? b.weeklyVotes || 0 : b.viewerVotes || 0;
      return tieBreakCompare(a, b, votesB - votesA);
    });

  // Tab 5: Mới — all solo & battles newest first
  const newest = [...subs].sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));

  return {
    weekKey,
    topWeek,
    topAllTime,
    ranksBoard,
    battles,
    newest,
  };
}
