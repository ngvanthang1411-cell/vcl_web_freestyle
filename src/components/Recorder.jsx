import { formatClock } from './ui';
import { useT } from '../i18n/LanguageContext';

/**
 * Recording status and controls: the REC indicator, elapsed time, and the
 * start/stop buttons. The heavy lifting lives in useMediaRecorder.
 */
export default function Recorder({
  state, // idle | requesting | ready | recording | error
  elapsed,
  error,
  video,
  stream,
  sessionActive = false,
  onToggleVideo,
  onStart,
  onStop,
  onRetry,
  onPractice,
  practiceMode,
  targetSeconds,
}) {
  const t = useT();
  const recording = state === 'recording';

  return (
    <div
      className={`panel p-4 ${
        recording ? 'border-danger/50 shadow-[0_0_24px_rgb(var(--color-danger)/0.12)]' : ''
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* REC indicator */}
          <span className="relative flex h-2.5 w-2.5 items-center justify-center" aria-hidden="true">
            {recording ? (
              <span className="animate-rec-pulse absolute inset-0 rounded-full bg-danger/50" />
            ) : null}
            <span
              className={`relative h-2.5 w-2.5 rounded-full transition-colors duration-200 ${
                recording ? 'bg-danger' : 'bg-line-strong'
              }`}
            />
          </span>
          <div>
            <p className="text-sm font-medium text-content">
              {recording
                ? t('recorder.recording')
                : state === 'requesting'
                  ? t('recorder.requesting')
                  : t('recorder.label')}
            </p>
            <p className="font-mono text-xs tnum text-content-muted" role="timer" aria-live="off">
              {formatClock(elapsed)}
            </p>
          </div>
        </div>

        {/* Video toggle */}
        <label
          htmlFor="video-toggle"
          className="flex cursor-pointer items-center gap-2 text-xs text-content-muted"
        >
          <input
            id="video-toggle"
            type="checkbox"
            checked={video}
            disabled={recording}
            onChange={(e) => onToggleVideo(e.target.checked)}
            className="checkbox-accent"
          />
          {t('recorder.recordVideo')}
        </label>
      </div>

      {/* Live webcam preview */}
      {video && stream && state === 'recording' ? (
        <div className="mt-3 overflow-hidden rounded-md border border-line">
          <CameraPreview stream={stream} />
        </div>
      ) : null}

      {/* Error state */}
      {state === 'error' && error ? (
        <div className="mt-3 rounded-md border border-danger/45 bg-danger/[0.06] p-3">
          <p className="text-xs leading-relaxed text-content-muted">
            {t(error.reasonKey)}
          </p>
          {error.detail ? (
            <p className="mt-1 text-[11px] leading-relaxed text-content-subtle">
              {error.detail}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onRetry} className="chip cursor-pointer">
              {t('recorder.tryAgain')}
            </button>
            <button type="button" onClick={onPractice} className="chip cursor-pointer">
              {t('recorder.practiceMode')}
            </button>
          </div>
        </div>
      ) : null}

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!recording ? (
          <button
            type="button"
            onClick={onStart}
            disabled={state === 'requesting' || sessionActive}
            className="btn btn-primary flex-1"
          >
            {state === 'requesting'
              ? t('recorder.waiting')
              : sessionActive
                ? t('recorder.sessionRunning')
                : t('recorder.start')}
          </button>
        ) : (
          <button type="button" onClick={onStop} className="btn btn-primary flex-1">
            {t('recorder.stop')}
          </button>
        )}

        {practiceMode ? (
          <span className="chip chip-accent self-center">{t('recorder.practiceMode')}</span>
        ) : null}
      </div>

      {state === 'ready' && !recording ? (
        <p className="mt-3 text-[11px] leading-relaxed text-content-subtle">
          {t('recorder.readyHint')}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Shows the live webcam feed while recording.
 * The MediaStream is owned by the recorder hook and passed straight down.
 */
function CameraPreview({ stream }) {
  const t = useT();
  return (
    <video
      autoPlay
      playsInline
      muted
      ref={(node) => {
        if (node && stream && node.srcObject !== stream) {
          node.srcObject = stream;
        }
      }}
      className="w-full"
      aria-label={t('recorder.cameraAria')}
    />
  );
}
