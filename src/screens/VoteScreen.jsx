import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import BeatPlayer from '../components/BeatPlayer';
import { getBeatById } from '../data/beats';
import { copyToClipboard } from '../lib/clipboard';
import {
  REPORT_REASONS,
  adminDeleteVote,
  adminToggleHideSubmission,
  castVote,
  getAllVotes,
  getSubmissionByCode,
  hasDeviceVoted,
  loadRecordingBlob,
  reportSubmission,
} from '../lib/vclStore';
import {
  BUTTON_HOVER,
  BUTTON_TAP,
  SPRING_BOUNCY,
  SPRING_SNAPPY,
  cardContainerVariants,
  cardItemVariants,
} from '../lib/motion';
import { useLanguage, useT } from '../i18n/LanguageContext';

/**
 * Viewer Voting Screen (`/cham/<voteCode>` or `#cham/<voteCode>?u=<viewerId>`).
 *
 * Implements Spec Section 4 & 6:
 *  - No login required for viewers to vote.
 *  - Unlimited viewer points (1 vote = +1 point); machine score capped at 10.
 *  - Solo: single "+1" button. Battle: 2 buttons (choose Player 1 or Player 2).
 *  - Enforces 1 vote/device/entry + 1 vote/viewerId/entry + blocks self-voting.
 *  - Includes Report button (4 spec reasons) and Demo Admin moderation controls.
 */
export default function VoteScreen({
  voteCode,
  viewerIdParam = '',
  sourceParam = 'web',
  user = null,
  player = null,
  extraBeats = [],
  onBack,
  onDataChanged,
}) {
  const { locale } = useLanguage();
  const t = useT();

  const [submission, setSubmission] = useState(() => getSubmissionByCode(voteCode));
  const [recordingUrl, setRecordingUrl] = useState(null);
  const [viewerId, setViewerId] = useState(viewerIdParam);
  const [voteFeedback, setVoteFeedback] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  // Report modal state
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0].id);
  const [reportDone, setReportDone] = useState(false);

  // Admin panel toggle (for demo moderation)
  const [showAdmin, setShowAdmin] = useState(false);
  const [votesTick, setVotesTick] = useState(0);

  useEffect(() => {
    setSubmission(getSubmissionByCode(voteCode));
    setVoteFeedback('');
    setReportDone(false);
    setShowReport(false);
  }, [voteCode, votesTick]);

  // Hydrate submitted video/audio blob from IndexedDB if available
  useEffect(() => {
    let url = null;
    let cancelled = false;
    if (!submission?.recordingId) {
      setRecordingUrl(null);
      return undefined;
    }
    loadRecordingBlob(submission.recordingId).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setRecordingUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [submission?.recordingId]);

  const beat = useMemo(
    () => (submission?.beatId ? getBeatById(submission.beatId, extraBeats) : null),
    [submission?.beatId, extraBeats],
  );

  const existingVote = useMemo(
    () => (submission ? hasDeviceVoted(submission.id, viewerId) : null),
    [submission, viewerId, votesTick],
  );

  const liveVotesList = useMemo(() => {
    if (!submission) return [];
    return getAllVotes().filter((v) => v.submissionId === submission.id);
  }, [submission, votesTick]);

  const isAuthor = Boolean(
    user && submission && (user.id === submission.player1Id || user.id === submission.player2Id),
  );

  const handleVote = (choice = 'solo') => {
    if (!submission) return;
    const res = castVote({
      submissionId: submission.id,
      choice,
      viewerId,
      source: sourceParam || 'web',
      currentUser: user,
    });
    if (!res.ok) {
      if (res.error === 'self_vote_blocked') setVoteFeedback(t('vote.errSelf'));
      else if (res.error === 'already_voted_id') setVoteFeedback(t('vote.errAlreadyId'));
      else if (res.error === 'already_voted_device') setVoteFeedback(t('vote.errAlreadyDevice'));
      else setVoteFeedback(t('vote.errGeneric'));
      return;
    }
    setSubmission(res.submission);
    setVoteFeedback(t('vote.votedSuccess'));
    setVotesTick((n) => n + 1);
    onDataChanged?.();
  };

  const handleCopyShare = async () => {
    if (typeof window === 'undefined' || !submission) return;
    const base = `${window.location.origin}${window.location.pathname}`;
    const url = `${base}#cham/${submission.voteCode}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2400);
    }
  };

  const handleReportSubmit = (e) => {
    e.preventDefault();
    if (!submission) return;
    reportSubmission({ submissionId: submission.id, reason: reportReason });
    setReportDone(true);
    setShowReport(false);
  };

  const handleAdminToggleHide = () => {
    if (!submission) return;
    adminToggleHideSubmission(submission.id);
    setVotesTick((n) => n + 1);
    onDataChanged?.();
  };

  const handleAdminDeleteVote = (voteId) => {
    adminDeleteVote(voteId);
    setVotesTick((n) => n + 1);
    onDataChanged?.();
  };

  if (!submission) {
    return (
      <div className="panel space-y-4 p-6 text-center">
        <p className="text-3xl">🔍</p>
        <p className="text-sm font-semibold text-content">{t('vote.notFound')}</p>
        <button type="button" onClick={onBack} className="btn btn-primary">
          ‹ {t('stats.back')}
        </button>
      </div>
    );
  }

  const isBattle = submission.mode === 'battle';
  const battleWinner =
    isBattle && submission.p1TotalScore !== submission.p2TotalScore
      ? submission.p1TotalScore > submission.p2TotalScore
        ? 1
        : 2
      : 0;

  return (
    <motion.div
      variants={cardContainerVariants}
      initial="initial"
      animate="animate"
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="btn btn-ghost -ml-2 px-2.5 py-1.5 text-sm">
          ‹ {t('stats.back')}
        </button>
        <span className="chip chip-accent font-mono">
          /cham/{submission.voteCode}
        </span>
        <button
          type="button"
          onClick={handleCopyShare}
          className="btn btn-ghost px-2.5 py-1.5 text-xs"
        >
          {linkCopied ? '✓' : `🔗 ${t('vote.share')}`}
        </button>
      </div>

      {submission.hidden ? (
        <div className="rounded-xl border border-danger/50 bg-danger/10 p-3 text-xs font-semibold text-danger">
          ⚠️ {t('vote.hiddenNotice')}
        </div>
      ) : null}

      {/* Main Submission Score Card */}
      <motion.div variants={cardItemVariants} className="panel space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-lighter">
              {isBattle ? `⚔️ ${t('setup.battle')}` : `🎤 ${t('setup.solo')}`} · {submission.bars} bar ·{' '}
              {submission.flow === 'beat24' ? t('setup.flowBeat24') : t('setup.flowBeat4')}
            </span>
            <h1 className="mt-2 text-lg font-extrabold text-content">
              {isBattle
                ? `@${submission.player1Handle} vs @${submission.player2Handle}`
                : `${submission.player1Name} (@${submission.player1Handle})`}
            </h1>
            <p className="mt-0.5 text-xs text-content-muted">
              ♪ {submission.beatTitle} · {submission.beatBpm} BPM · {submission.weekKey}
            </p>
          </div>
        </div>

        {/* Scoreboard */}
        {isBattle ? (
          <div className="grid grid-cols-2 gap-3">
            <div
              className={`rounded-xl border p-3.5 text-center ${
                battleWinner === 1
                  ? 'border-accent/80 bg-accent/[0.12]'
                  : 'border-line bg-surface-overlay/60'
              }`}
            >
              <p className="truncate text-xs font-bold text-accent-lighter">
                {battleWinner === 1 ? '👑 ' : ''}@{submission.player1Handle}
              </p>
              <motion.p
                key={submission.p1TotalScore}
                initial={{ scale: 1.15 }}
                animate={{ scale: 1 }}
                transition={SPRING_BOUNCY}
                className="mt-1 font-mono text-2xl font-extrabold text-content tnum"
              >
                {submission.p1TotalScore}
              </motion.p>
              <p className="mt-1 text-[11px] text-content-muted tnum">
                👥 {submission.p1ViewerVotes} + 🤖 {submission.p1MachineScore}
              </p>
            </div>

            <div
              className={`rounded-xl border p-3.5 text-center ${
                battleWinner === 2
                  ? 'border-secondary/80 bg-secondary/[0.12]'
                  : 'border-line bg-surface-overlay/60'
              }`}
            >
              <p className="truncate text-xs font-bold text-secondary">
                {battleWinner === 2 ? '👑 ' : ''}@{submission.player2Handle}
              </p>
              <motion.p
                key={submission.p2TotalScore}
                initial={{ scale: 1.15 }}
                animate={{ scale: 1 }}
                transition={SPRING_BOUNCY}
                className="mt-1 font-mono text-2xl font-extrabold text-content tnum"
              >
                {submission.p2TotalScore}
              </motion.p>
              <p className="mt-1 text-[11px] text-content-muted tnum">
                👥 {submission.p2ViewerVotes} + 🤖 {submission.p2MachineScore}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-accent/40 bg-accent/[0.08] p-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-accent-lighter">
                {t('vote.totalScore')}
              </p>
              <motion.p
                key={submission.totalScore}
                initial={{ scale: 1.18 }}
                animate={{ scale: 1 }}
                transition={SPRING_BOUNCY}
                className="mt-0.5 font-mono text-4xl font-extrabold leading-none text-content tnum"
              >
                {submission.totalScore}
              </motion.p>
              <p className="mt-1 text-[11px] text-content-muted">
                {t('vote.noCapHint')}
              </p>
            </div>
            <div className="space-y-1 text-right text-xs">
              <p className="text-content">
                👥 {t('vote.viewerPoints')}:{' '}
                <strong className="font-mono text-accent-lighter tnum">
                  {submission.viewerVotes}
                </strong>
              </p>
              <p className="text-content-muted">
                🤖 {t('vote.machinePoints')}:{' '}
                <strong className="font-mono text-content tnum">
                  {submission.machineScore}/10
                </strong>
              </p>
              <p className="text-[11px] text-content-subtle tnum">
                {submission.wordsHit}/{submission.wordsTotal} {t('setup.wordsUnit')}
              </p>
            </div>
          </div>
        )}

        {/* Voting Buttons (No login required!) */}
        <div className="space-y-2.5 pt-1">
          {isAuthor ? (
            <p className="rounded-lg border border-line bg-surface-overlay/70 px-3 py-2 text-center text-xs text-content-muted">
              {t('vote.errSelf')}
            </p>
          ) : existingVote ? (
            <div className="rounded-xl border border-success/45 bg-success/10 px-4 py-3 text-center text-xs font-semibold text-success">
              ✓ {t('vote.alreadyVotedDone')}
              {isBattle
                ? ` (@${existingVote.choice === 'p2' ? submission.player2Handle : submission.player1Handle})`
                : ''}
            </div>
          ) : isBattle ? (
            <div className="grid grid-cols-2 gap-2.5">
              <motion.button
                type="button"
                whileHover={BUTTON_HOVER}
                whileTap={BUTTON_TAP}
                transition={SPRING_SNAPPY}
                onClick={() => handleVote('p1')}
                disabled={submission.hidden}
                className="btn btn-primary py-3 text-xs"
              >
                🔥 {t('vote.voteFor', { name: `@${submission.player1Handle}` })}
              </motion.button>
              <motion.button
                type="button"
                whileHover={BUTTON_HOVER}
                whileTap={BUTTON_TAP}
                transition={SPRING_SNAPPY}
                onClick={() => handleVote('p2')}
                disabled={submission.hidden}
                className="btn btn-secondary border-secondary/60 py-3 text-xs text-secondary"
              >
                🔥 {t('vote.voteFor', { name: `@${submission.player2Handle}` })}
              </motion.button>
            </div>
          ) : (
            <motion.button
              type="button"
              whileHover={BUTTON_HOVER}
              whileTap={BUTTON_TAP}
              transition={SPRING_SNAPPY}
              onClick={() => handleVote('solo')}
              disabled={submission.hidden}
              className="btn btn-primary w-full py-3.5 text-sm shadow-lift"
            >
              ⭐ {t('vote.voteOnePoint')}
            </motion.button>
          )}

          {voteFeedback ? (
            <p className="text-center text-xs font-medium text-accent-lighter">{voteFeedback}</p>
          ) : (
            <p className="text-center text-[11px] text-content-subtle">{t('vote.ruleNote')}</p>
          )}
        </div>
      </motion.div>

      {/* Media Playback (Recorded Video/Audio OR Beat Preview for demo seed entries) */}
      <motion.div variants={cardItemVariants} className="panel space-y-3 p-4">
        <p className="field-label">{t('vote.mediaHeading')}</p>
        {recordingUrl ? (
          submission.isVideo ? (
            <video
              src={recordingUrl}
              controls
              playsInline
              className="w-full rounded-lg border border-line bg-black"
            />
          ) : (
            <audio src={recordingUrl} controls className="w-full" />
          )
        ) : beat && player ? (
          <div className="space-y-2">
            <BeatPlayer beat={beat} player={player} showSeek />
            <p className="text-[11px] text-content-subtle">{t('vote.demoMediaNote')}</p>
          </div>
        ) : (
          <p className="text-xs text-content-subtle">{t('vote.demoMediaNote')}</p>
        )}
      </motion.div>

      {/* Dropped Words Log (`tu_roi`) */}
      {Array.isArray(submission.tuRoi) && submission.tuRoi.length > 0 ? (
        <motion.div variants={cardItemVariants} className="panel p-4">
          <p className="field-label">{t('results.wordsLog')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {submission.tuRoi.map((item, idx) => (
              <span
                key={`${item.text}-${idx}`}
                className={`ygb-word-chip ${item.status === 'hit' ? 'hit' : ''}`}
              >
                {isBattle ? `P${item.playerIndex || 1} ` : ''}
                {item.status === 'hit' ? '✓ ' : '✕ '}
                {item.text}
              </span>
            ))}
          </div>
        </motion.div>
      ) : null}

      {/* Report & Viewer ID / Admin Demo Controls */}
      <motion.div variants={cardItemVariants} className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowReport((v) => !v)}
            className="text-xs font-semibold text-content-muted hover:text-danger"
          >
            🚩 {t('vote.reportBtn')}
          </button>

          <button
            type="button"
            onClick={() => setShowAdmin((v) => !v)}
            className="text-xs font-semibold text-content-subtle hover:text-accent-light"
          >
            🛠 {t('vote.adminTools')}
          </button>
        </div>

        {reportDone ? (
          <p className="text-xs font-medium text-success">✓ {t('vote.reportSent')}</p>
        ) : null}

        {showReport ? (
          <form onSubmit={handleReportSubmit} className="space-y-2.5 border-t border-line/70 pt-3">
            <p className="text-xs font-semibold text-content">{t('vote.reportTitle')}</p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface-overlay/60 px-2.5 py-2 text-xs text-content-muted"
                >
                  <input
                    type="radio"
                    name="report-reason"
                    checked={reportReason === r.id}
                    onChange={() => setReportReason(r.id)}
                    className="accent-[#F78501]"
                  />
                  <span>{locale === 'vi' ? r.vi : r.en}</span>
                </label>
              ))}
            </div>
            <button type="submit" className="btn btn-secondary w-full text-xs text-danger">
              {t('vote.reportSubmit')}
            </button>
          </form>
        ) : null}

        {showAdmin ? (
          <div className="space-y-3 border-t border-line/70 pt-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-content">{t('vote.adminModTitle')}</span>
              <button
                type="button"
                onClick={handleAdminToggleHide}
                className="rounded-lg border border-danger/50 bg-danger/10 px-2.5 py-1 text-[11px] font-bold text-danger"
              >
                {submission.hidden ? t('vote.adminUnhide') : t('vote.adminHide')}
              </button>
            </div>

            <div>
              <label className="field-label">{t('vote.viewerIdTest')}</label>
              <input
                type="text"
                value={viewerId}
                onChange={(e) => setViewerId(e.target.value)}
                placeholder="?u=ig_viewer_01"
                className="input text-xs"
              />
            </div>

            {liveVotesList.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-content-subtle">
                  {t('vote.recentVotes')} ({liveVotesList.length})
                </p>
                {liveVotesList.slice(0, 6).map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-overlay/50 px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="truncate text-content-muted">
                      {v.source} · {v.viewerId || v.deviceId.slice(0, 10)} ({v.choice})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAdminDeleteVote(v.id)}
                      className="text-danger hover:underline"
                    >
                      {t('vote.deleteVote')}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
