import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import ConfettiCanvas from '../components/ConfettiCanvas';
import HypeMeter from '../components/HypeMeter';
import ErrorNotice from '../components/ErrorNotice';
import VclActionModal from '../components/VclActionModal';
import { formatClock } from '../components/ui';
import { copyToClipboard } from '../lib/clipboard';
import { downloadBlob, extensionForBlob, recordingFilename } from '../lib/download';
import { getGrade } from '../lib/history';
import { calculateMachineScore } from '../lib/speechMatcher';
import {
  canUserSubmitThisWeek,
  findUserByHandleOrAccount,
  isUser18Plus,
  submitEntry,
} from '../lib/vclStore';
import {
  BUTTON_HOVER,
  BUTTON_TAP,
  SPRING_BOUNCY,
  SPRING_SMOOTH,
  SPRING_SNAPPY,
  cardContainerVariants,
  cardItemVariants,
} from '../lib/motion';
import { buildSharePayload, encodeSharePayload, getHypeTier } from '../lib/scoring';
import { useT } from '../i18n/LanguageContext';

/**
 * Results screen (`#results`) — Machine score (0..10), Speech status, Battle
 * breakdown, Official VCL Submission with 4 required consents, Share/Vote link,
 * Download take, and VCL Studio CTAs ("Thuê beat này" / "Thu bản thật ở VCL").
 */
export default function ResultsScreen({
  result,
  user = null,
  onOpenAuth = null,
  onOpenVote = null,
  onSubmitted = null,
  onRestart,
  onChangeBeat,
  onHome,
}) {
  const t = useT();
  const [shareState, setShareState] = useState('idle'); // idle | copied | failed
  const [voteLinkCopied, setVoteLinkCopied] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState(null);
  const [vclModal, setVclModal] = useState(null); // null | 'lease' | 'studio'

  // Submission state (Spec Section 7)
  const [consents, setConsents] = useState({
    ownWork: false,
    everyoneAgreed: false,
    is18Plus: false,
    allowRepost: false,
  });
  const [opponentAccount, setOpponentAccount] = useState(result?.opponent || '');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedEntry, setSubmittedEntry] = useState(null);

  useEffect(() => {
    if (!result?.blob) {
      setPlaybackUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(result.blob);
    setPlaybackUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result?.blob]);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const payload = buildSharePayload(result);
    const encoded = encodeSharePayload(payload);
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}#result=${encoded}`;
  }, [result]);

  const voteUrl = useMemo(() => {
    if (typeof window === 'undefined' || !submittedEntry?.voteCode) return '';
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}#cham/${submittedEntry.voteCode}`;
  }, [submittedEntry]);

  const handleCopy = async () => {
    const ok = await copyToClipboard(shareUrl);
    setShareState(ok ? 'copied' : 'failed');
    setTimeout(() => setShareState('idle'), 2600);
  };

  const handleCopyVoteLink = async () => {
    if (!voteUrl) return;
    const ok = await copyToClipboard(voteUrl);
    if (ok) {
      setVoteLinkCopied(true);
      setTimeout(() => setVoteLinkCopied(false), 2600);
    }
  };

  const handleDownload = () => {
    if (!result?.blob) return;
    const extension = extensionForBlob(result.blob);
    downloadBlob(result.blob, recordingFilename(result.beatId, extension, result.video));
  };

  const handleSubmitEntry = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (!user) {
      onOpenAuth?.();
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitEntry({
        user,
        result,
        opponentAccount,
        consents,
      });
      if (!res.ok) {
        if (res.error === 'under_18') setSubmitError(t('submit.errUnder18'));
        else if (res.error === 'weekly_limit')
          setSubmitError(t('submit.errWeeklyLimit', { code: res.existingCode || '' }));
        else if (res.error === 'consents_required') setSubmitError(t('submit.errConsents'));
        else if (res.error === 'banned_word') setSubmitError(t('submit.errBanned'));
        else setSubmitError(t('submit.errGeneric'));
        return;
      }
      setSubmittedEntry(res.submission);
      onSubmitted?.(res.submission);
    } finally {
      setSubmitting(false);
    }
  };

  const grade = getGrade(result.score);
  const tier = getHypeTier(result.score);
  const accuracy =
    result.wordsShown > 0
      ? Math.round((result.wordsHit / result.wordsShown) * 100)
      : 0;
  const machineScore =
    typeof result.machineScore === 'number'
      ? result.machineScore
      : calculateMachineScore(result.wordsHit, result.wordsShown);

  const wordList =
    Array.isArray(result.tuRoi) && result.tuRoi.length > 0
      ? result.tuRoi
      : Array.isArray(result.wordLog)
        ? result.wordLog
        : [];
  const scoreRatio = Math.max(0, Math.min(1, result.score / 100));

  const modeKey = result.battleMode ? 'battle' : 'solo';
  const weeklyCheck = user ? canUserSubmitThisWeek(user.id, modeKey) : null;
  const matchedOpponent = result.battleMode && opponentAccount
    ? findUserByHandleOrAccount(opponentAccount)
    : null;
  const allConsentsChecked =
    consents.ownWork && consents.everyoneAgreed && consents.is18Plus && consents.allowRepost;

  return (
    <motion.div
      variants={cardContainerVariants}
      initial="initial"
      animate="animate"
      className="space-y-5"
    >
      <ConfettiCanvas active={result.score >= 45 || machineScore >= 5} />

      {/* Title */}
      <motion.div
        variants={cardItemVariants}
        className="flex items-center justify-between gap-3"
      >
        <h1 className="text-[clamp(1.75rem,5vw,2.25rem)] font-bold leading-tight tracking-tight text-content">
          {t('results.titlePrefix')}{' '}
          <span className="bg-gradient-to-r from-accent to-secondary bg-clip-text text-transparent">
            {t('results.titleAccent')}
          </span>
        </h1>
        {result.beatTitle ? (
          <span className="chip chip-accent max-w-[10rem] truncate">{result.beatTitle}</span>
        ) : null}
      </motion.div>

      {/* Official VCL Machine Score Card (Spec Section 3) */}
      <motion.div variants={cardItemVariants} className="panel space-y-4 p-5">
        <div className="flex items-center gap-4 border-b border-line/80 pb-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.55, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={SPRING_BOUNCY}
            className="ygb-grade shrink-0"
            aria-label={t('results.gradeAria', { grade })}
          >
            {grade}
          </motion.div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
              {t('results.machineScoreLabel')} · {t(`hype.tier.${tier.key}`)}
            </p>
            <div className="mt-1 flex items-baseline gap-3">
              <p className="text-3xl font-extrabold leading-none text-content tnum">
                {machineScore}
                <span className="ml-1 text-xs font-medium text-content-subtle">/ 10</span>
              </p>
              <span className="font-mono text-xs text-content-muted tnum">
                ({result.wordsHit}/{result.wordsShown} {t('setup.wordsUnit')})
              </span>
            </div>
            <div className="track mt-2.5 h-2">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: Math.max(scoreRatio, machineScore / 10) }}
                transition={{ ...SPRING_SMOOTH, delay: 0.12 }}
                className="h-full w-full origin-left rounded-full bg-gradient-to-r from-tertiary via-accent to-secondary will-change-transform"
              />
            </div>
          </div>
        </div>

        {/* Speech unavailable notice (exact Spec Section 3 copy) */}
        {result.speechSupported === false ? (
          <div className="rounded-lg border border-warning/45 bg-warning/[0.07] px-3 py-2 text-xs text-warning">
            🔇 {t('results.speechUnavailableMsg')}
          </div>
        ) : null}

        {/* Battle 2-player machine breakdown */}
        {result.battleMode ? (
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-accent/40 bg-accent/[0.06] p-3 text-center">
              <p className="truncate text-xs font-bold text-accent-lighter">
                @{result.handle || 'Player1'}
              </p>
              <p className="mt-1 font-mono text-xl font-extrabold text-content tnum">
                {result.p1MachineScore ?? 0}
                <span className="text-xs font-normal text-content-subtle">/10</span>
              </p>
              <p className="text-[11px] text-content-muted tnum">
                {result.p1WordsHit ?? 0}/{result.p1WordsTotal ?? 0} {t('setup.wordsUnit')}
              </p>
            </div>
            <div className="rounded-xl border border-secondary/40 bg-secondary/[0.06] p-3 text-center">
              <p className="truncate text-xs font-bold text-secondary">
                @{result.opponent || 'Player2'}
              </p>
              <p className="mt-1 font-mono text-xl font-extrabold text-content tnum">
                {result.p2MachineScore ?? 0}
                <span className="text-xs font-normal text-content-subtle">/10</span>
              </p>
              <p className="text-[11px] text-content-muted tnum">
                {result.p2WordsHit ?? 0}/{result.p2WordsTotal ?? 0} {t('setup.wordsUnit')}
              </p>
            </div>
          </div>
        ) : (
          <HypeMeter score={result.score} />
        )}
      </motion.div>

      {/* 4-tile Stats Grid */}
      <motion.div
        variants={cardContainerVariants}
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
      >
        <StatTile label={t('results.statTime')} value={formatClock(result.durationSeconds)} />
        <StatTile
          label={t('results.statWords')}
          value={`${result.wordsHit}/${result.wordsShown}`}
        />
        <StatTile label={t('results.statMachine')} value={`${machineScore}/10`} accent />
        <StatTile label={t('results.statAccuracy')} value={`${accuracy}%`} />
      </motion.div>

      {/* Official Thi Submission Panel (Spec Section 5 & 7) */}
      {!result.practiceMode ? (
        <motion.div
          variants={cardItemVariants}
          className="panel space-y-3.5 border-accent/45 bg-gradient-to-b from-accent/[0.07] to-transparent p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-content">🚀 {t('submit.title')}</p>
              <p className="text-xs text-content-muted">{t('submit.subtitle')}</p>
            </div>
            <span className="rounded-full border border-accent/40 bg-accent/15 px-2.5 py-0.5 text-[10px] font-bold uppercase text-accent-lighter">
              {result.battleMode ? t('setup.battle') : t('setup.solo')}
            </span>
          </div>

          {submittedEntry ? (
            <div className="space-y-3 rounded-xl border border-success/45 bg-success/[0.08] p-3.5">
              <p className="text-sm font-bold text-success">✅ {t('submit.successTitle')}</p>
              <p className="text-xs text-content-muted">
                {t('submit.codeLabel')}:{' '}
                <span className="font-mono font-bold text-content">{submittedEntry.voteCode}</span>
              </p>
              <div className="rounded-lg border border-line bg-surface-raised/90 px-3 py-2 font-mono text-[11px] break-all text-accent-lighter">
                {voteUrl}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyVoteLink}
                  className="btn btn-secondary flex-1 text-xs"
                >
                  {voteLinkCopied ? t('results.linkCopied') : `📋 ${t('submit.copyVoteLink')}`}
                </button>
                {onOpenVote ? (
                  <button
                    type="button"
                    onClick={() => onOpenVote(submittedEntry.voteCode)}
                    className="btn btn-primary flex-1 text-xs"
                  >
                    ⭐ {t('submit.openVotePage')}
                  </button>
                ) : null}
              </div>
            </div>
          ) : !user ? (
            <div className="space-y-2.5">
              <p className="text-xs text-content-muted">{t('submit.needLogin')}</p>
              <button
                type="button"
                onClick={onOpenAuth}
                className="btn btn-primary w-full"
              >
                👤 {t('submit.loginToSubmit')}
              </button>
            </div>
          ) : !isUser18Plus(user) ? (
            <p className="rounded-lg border border-warning/45 bg-warning/[0.08] p-3 text-xs text-warning">
              {t('submit.errUnder18')}
            </p>
          ) : weeklyCheck && !weeklyCheck.allowed ? (
            <div className="space-y-2 rounded-lg border border-warning/45 bg-warning/[0.07] p-3 text-xs text-warning">
              <p>{t('submit.errWeeklyLimit', { code: weeklyCheck.existingCode || '' })}</p>
              {weeklyCheck.existingCode && onOpenVote ? (
                <button
                  type="button"
                  onClick={() => onOpenVote(weeklyCheck.existingCode)}
                  className="btn btn-secondary mt-1 text-xs"
                >
                  ⭐ {t('submit.openExisting')} ({weeklyCheck.existingCode})
                </button>
              ) : null}
            </div>
          ) : (
            <form onSubmit={handleSubmitEntry} className="space-y-3">
              {result.battleMode ? (
                <div>
                  <label className="field-label">{t('submit.opponentAccountLabel')}</label>
                  <input
                    type="text"
                    value={opponentAccount}
                    onChange={(e) => setOpponentAccount(e.target.value.replace(/^@+/, ''))}
                    placeholder="saigon_flow"
                    className="input text-xs"
                  />
                  <p className="mt-1 text-[11px] text-content-subtle">
                    {matchedOpponent
                      ? `✓ ${t('setup.opponentLinked', { name: matchedOpponent.displayName })}`
                      : t('setup.opponentGuest')}
                  </p>
                </div>
              ) : null}

              {/* 4 Required Consent Checkboxes (Spec Section 7) */}
              <div className="space-y-2 rounded-xl border border-line bg-surface-overlay/50 p-3 text-xs text-content-muted">
                {[
                  ['ownWork', t('submit.consent1')],
                  ['everyoneAgreed', t('submit.consent2')],
                  ['is18Plus', t('submit.consent3')],
                  ['allowRepost', t('submit.consent4')],
                ].map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={consents[key]}
                      onChange={(e) => setConsents({ ...consents, [key]: e.target.checked })}
                      className="mt-0.5 h-4 w-4 accent-[#F78501]"
                    />
                    <span className="leading-snug">{label}</span>
                  </label>
                ))}
              </div>

              {submitError ? <p className="text-xs font-medium text-danger">{submitError}</p> : null}

              <motion.button
                type="submit"
                disabled={submitting || !allConsentsChecked}
                whileHover={allConsentsChecked ? BUTTON_HOVER : undefined}
                whileTap={allConsentsChecked ? BUTTON_TAP : undefined}
                transition={SPRING_SNAPPY}
                className="btn btn-primary w-full py-2.5 disabled:opacity-45"
              >
                {submitting ? t('submit.submitting') : `🚀 ${t('submit.submitBtn')}`}
              </motion.button>
            </form>
          )}
        </motion.div>
      ) : null}

      {/* Word Chips */}
      {wordList.length > 0 ? (
        <motion.div variants={cardItemVariants} className="panel p-4">
          <p className="field-label">{t('results.wordsLog')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {wordList.map((item, idx) => {
              const isHit =
                item.status === 'hit' || item.status === 'perfect' || item.status === 'good';
              return (
                <motion.span
                  key={`${item.text}-${idx}`}
                  initial={{ opacity: 0, scale: 0.86, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ ...SPRING_SNAPPY, delay: Math.min(idx, 14) * 0.025 }}
                  className={`ygb-word-chip ${
                    item.status === 'perfect' ? 'perfect' : isHit ? 'hit' : ''
                  }`}
                >
                  {result.battleMode ? `P${item.playerIndex || 1} ` : ''}
                  {isHit ? '✓ ' : '✕ '}
                  {item.text}
                </motion.span>
              );
            })}
          </div>
        </motion.div>
      ) : null}

      {/* Playback */}
      <motion.div variants={cardItemVariants} className="panel p-4">
        <p className="field-label">{t('results.playback')}</p>

        {playbackUrl ? (
          <>
            {result.video ? (
              <video
                key={playbackUrl}
                src={playbackUrl}
                controls
                playsInline
                className="w-full rounded-md border border-line bg-black"
                aria-label={t('results.playbackAria')}
              />
            ) : (
              <audio
                key={playbackUrl}
                src={playbackUrl}
                controls
                className="w-full"
                aria-label={t('results.playbackAria')}
              />
            )}
            <p className="mt-3 text-xs leading-relaxed text-content-subtle">
              {result.beatTitle
                ? t('results.recordedOver', { beat: result.beatTitle })
                : t('results.recordedTake')}{' '}
              {t('results.beatNotMixed')}
            </p>
          </>
        ) : (
          <div className="rounded-md border border-warning/45 bg-warning/[0.06] p-3.5">
            <p className="text-xs leading-relaxed text-content-muted">
              {result.practiceMode ? t('results.practiceNoTake') : t('results.noTake')}
            </p>
          </div>
        )}
      </motion.div>

      {/* Export */}
      <motion.div variants={cardItemVariants} className="panel p-4">
        <p className="field-label">{t('results.export')}</p>
        <div className="flex flex-wrap gap-2.5">
          <motion.button
            type="button"
            whileHover={!result.blob ? undefined : BUTTON_HOVER}
            whileTap={!result.blob ? undefined : BUTTON_TAP}
            transition={SPRING_SNAPPY}
            onClick={handleDownload}
            disabled={!result.blob}
            className="btn btn-primary flex-1"
          >
            {result.video ? t('results.downloadVideo') : t('results.downloadAudio')}
          </motion.button>

          <motion.button
            type="button"
            whileHover={BUTTON_HOVER}
            whileTap={BUTTON_TAP}
            transition={SPRING_SNAPPY}
            onClick={handleCopy}
            className="btn btn-secondary flex-1"
          >
            {shareState === 'copied'
              ? t('results.linkCopied')
              : shareState === 'failed'
                ? t('results.copyFailed')
                : t('results.copyLink')}
          </motion.button>
        </div>

        {shareState === 'failed' ? (
          <p className="mt-3 text-xs leading-relaxed text-warning">
            {t('results.copyFailedHint')}
            <br />
            <span className="break-all text-content-muted">{shareUrl}</span>
          </p>
        ) : (
          <p className="mt-3 text-[11px] leading-relaxed text-content-subtle">
            {t('results.exportHint', {
              kind: result.video ? t('results.downloadVideo') : t('results.downloadAudio'),
              ext: '.webm',
            })}
          </p>
        )}
      </motion.div>

      {/* VCL Studio CTAs (Spec Section 7: "Thuê beat này" / "Thu bản thật ở VCL") */}
      <motion.div variants={cardItemVariants} className="grid grid-cols-2 gap-2.5">
        <motion.button
          type="button"
          whileHover={BUTTON_HOVER}
          whileTap={BUTTON_TAP}
          transition={SPRING_SNAPPY}
          onClick={() => setVclModal('lease')}
          className="panel flex items-center justify-center gap-2 border-accent/35 px-3 py-3 text-xs font-bold text-accent-lighter transition-colors hover:border-accent"
        >
          <span>🎹</span>
          <span>{t('vcl.leaseBtn')}</span>
        </motion.button>

        <motion.button
          type="button"
          whileHover={BUTTON_HOVER}
          whileTap={BUTTON_TAP}
          transition={SPRING_SNAPPY}
          onClick={() => setVclModal('studio')}
          className="panel flex items-center justify-center gap-2 border-secondary/35 px-3 py-3 text-xs font-bold text-secondary transition-colors hover:border-secondary"
        >
          <span>🎙</span>
          <span>{t('vcl.studioBtn')}</span>
        </motion.button>
      </motion.div>

      {result.practiceMode ? (
        <ErrorNotice
          tone="warn"
          title={t('results.practiceTitle')}
          detail={t('results.practiceDetail')}
          actions={[]}
        />
      ) : null}

      {/* Bottom primary actions */}
      <motion.div variants={cardItemVariants} className="flex flex-wrap gap-2.5 pt-1">
        <motion.button
          type="button"
          whileHover={BUTTON_HOVER}
          whileTap={BUTTON_TAP}
          transition={SPRING_SNAPPY}
          onClick={onRestart}
          className="btn btn-primary flex-1 py-3"
        >
          🔁 {t('results.runItBack')}
        </motion.button>
        <motion.button
          type="button"
          whileHover={BUTTON_HOVER}
          whileTap={BUTTON_TAP}
          transition={SPRING_SNAPPY}
          onClick={onHome ?? onChangeBeat}
          className="btn btn-secondary flex-1 py-3"
        >
          {t('results.newBeat')}
        </motion.button>
      </motion.div>

      <VclActionModal
        mode={vclModal}
        beatTitle={result.beatTitle}
        userHandle={user?.socialHandle || result.handle}
        onClose={() => setVclModal(null)}
      />
    </motion.div>
  );
}

function StatTile({ label, value, accent = false }) {
  return (
    <motion.div
      variants={cardItemVariants}
      className="panel flex flex-col items-center justify-center px-3 py-3 text-center"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-subtle">
        {label}
      </span>
      <span
        className={`mt-1 font-mono text-lg font-bold leading-none tnum ${
          accent ? 'text-accent-light' : 'text-content'
        }`}
      >
        {value}
      </span>
    </motion.div>
  );
}
