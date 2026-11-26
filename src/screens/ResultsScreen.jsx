import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import ConfettiCanvas from '../components/ConfettiCanvas';
import HypeMeter from '../components/HypeMeter';
import ErrorNotice from '../components/ErrorNotice';
import { formatClock } from '../components/ui';
import { copyToClipboard } from '../lib/clipboard';
import { downloadBlob, extensionForBlob, recordingFilename } from '../lib/download';
import { getGrade } from '../lib/history';
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
 * Results screen (`#results`) — Framer Motion spring scoreboard, celebratory
 * confetti, GPU scaleX score bar, 4-tile Stats Grid, word chips, and export.
 */
export default function ResultsScreen({ result, onRestart, onChangeBeat, onHome }) {
  const t = useT();
  const [shareState, setShareState] = useState('idle'); // idle | copied | failed
  const [playbackUrl, setPlaybackUrl] = useState(null);

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

  const handleCopy = async () => {
    const ok = await copyToClipboard(shareUrl);
    setShareState(ok ? 'copied' : 'failed');
    setTimeout(() => setShareState('idle'), 2600);
  };

  const handleDownload = () => {
    if (!result?.blob) return;
    const extension = extensionForBlob(result.blob);
    downloadBlob(result.blob, recordingFilename(result.beatId, extension, result.video));
  };

  const grade = getGrade(result.score);
  const tier = getHypeTier(result.score);
  const accuracy =
    result.wordsShown > 0
      ? Math.round((result.wordsHit / result.wordsShown) * 100)
      : 0;
  const wordLog = Array.isArray(result.wordLog) ? result.wordLog : [];
  const scoreRatio = Math.max(0, Math.min(1, result.score / 100));

  return (
    <motion.div
      variants={cardContainerVariants}
      initial="initial"
      animate="animate"
      className="space-y-5"
    >
      <ConfettiCanvas active={result.score >= 45} />

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

      {/* Grade + Hype Meter Scoreboard Hero Card */}
      <motion.div variants={cardItemVariants} className="panel p-5">
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
              {t(`hype.tier.${tier.key}`)}
            </p>
            <p className="mt-0.5 text-2xl font-extrabold leading-none text-content tnum">
              {result.score}
              <span className="ml-1 text-xs font-medium text-content-subtle">/ 100</span>
            </p>
            <div className="track mt-2.5 h-2">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: scoreRatio }}
                transition={{ ...SPRING_SMOOTH, delay: 0.12 }}
                className="h-full w-full origin-left rounded-full bg-gradient-to-r from-tertiary via-accent to-secondary will-change-transform"
              />
            </div>
          </div>
        </div>

        <div className="pt-4">
          <HypeMeter score={result.score} />
        </div>
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
        <StatTile label={t('results.statOnBeat')} value={`${result.perfectHits ?? 0}`} accent />
        <StatTile label={t('results.statAccuracy')} value={`${accuracy}%`} />
      </motion.div>

      {/* Word Chips */}
      {wordLog.length > 0 ? (
        <motion.div variants={cardItemVariants} className="panel p-4">
          <p className="field-label">{t('results.wordsLog')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {wordLog.map((item, idx) => (
              <motion.span
                key={`${item.text}-${idx}`}
                initial={{ opacity: 0, scale: 0.86, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ ...SPRING_SNAPPY, delay: Math.min(idx, 14) * 0.025 }}
                className={`ygb-word-chip ${
                  item.status === 'perfect' ? 'perfect' : item.status === 'good' ? 'hit' : ''
                }`}
              >
                {item.status === 'perfect' ? '★ ' : item.status === 'good' ? '✓ ' : ''}
                {item.text}
              </motion.span>
            ))}
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
