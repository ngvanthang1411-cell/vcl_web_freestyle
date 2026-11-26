import { useEffect, useMemo, useState } from 'react';
import HypeMeter from '../components/HypeMeter';
import ErrorNotice from '../components/ErrorNotice';
import { copyToClipboard } from '../lib/clipboard';
import { downloadBlob, extensionForBlob, recordingFilename } from '../lib/download';
import { buildSharePayload, encodeSharePayload } from '../lib/scoring';
import { useT } from '../i18n/LanguageContext';

/**
 * Results screen — playback, the Hype Meter, and export/share.
 */
export default function ResultsScreen({ result, onRestart, onChangeBeat }) {
  const t = useT();
  const [shareState, setShareState] = useState('idle'); // idle | copied | failed
  const [playbackUrl, setPlaybackUrl] = useState(null);

  // Build the object URL for the recorded take, and revoke it on unmount.
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

  return (
    <div>
      <h1 className="text-[clamp(1.75rem,5vw,2.5rem)] font-semibold leading-tight tracking-tight text-content">
        {t('results.titlePrefix')}{' '}
        <span className="text-accent">{t('results.titleAccent')}</span>
      </h1>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onRestart} className="btn btn-primary">
          {t('results.runItBack')}
        </button>
        <button type="button" onClick={onChangeBeat} className="btn btn-secondary">
          {t('results.newBeat')}
        </button>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Playback + stats */}
        <div className="space-y-5">
          <div className="panel p-4">
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
              <div className="rounded-md border border-warning/45 bg-warning/[0.06] p-4">
                <p className="text-xs leading-relaxed text-content-muted">
                  {result.practiceMode
                    ? t('results.practiceNoTake')
                    : t('results.noTake')}
                </p>
              </div>
            )}
          </div>

          {/* Export */}
          <div className="panel p-4">
            <p className="field-label">{t('results.export')}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!result.blob}
                className="btn btn-primary"
              >
                {result.video ? t('results.downloadVideo') : t('results.downloadAudio')}
              </button>

              <button type="button" onClick={handleCopy} className="btn btn-secondary">
                {shareState === 'copied'
                  ? t('results.linkCopied')
                  : shareState === 'failed'
                    ? t('results.copyFailed')
                    : t('results.copyLink')}
              </button>
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
          </div>
        </div>

        {/* The Hype Meter — the score is the payoff, so it stands alone. */}
        <div className="space-y-5">
          <div className="panel p-5">
            <HypeMeter score={result.score} />
          </div>

          {result.practiceMode ? (
            <ErrorNotice
              tone="warn"
              title={t('results.practiceTitle')}
              detail={t('results.practiceDetail')}
              actions={[]}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
