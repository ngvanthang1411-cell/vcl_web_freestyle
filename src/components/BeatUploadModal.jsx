import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import BeatCover from './BeatCover';
import { analyzeAudioFile, saveCustomBeat } from '../lib/customBeats';
import { checkContentSafety } from '../lib/contentFilter';
import { BUTTON_HOVER, BUTTON_TAP, SPRING_SMOOTH, SPRING_SNAPPY } from '../lib/motion';
import { useT } from '../i18n/LanguageContext';

const UPLOAD_VIBES = ['Custom', 'Street', 'Bounce', 'Chill', 'Uptempo', 'Dark'];

/**
 * Custom Audio Beat Upload Modal.
 *
 * Accepts MP3/WAV/OGG/M4A/FLAC files, decodes them in-browser via Web Audio API
 * to calculate exact duration, 12-bar waveform peaks, and estimated BPM, and lets
 * the user refine Beat Title, BPM, Bar 1 start offset (seconds), Total Bars, and
 * Vibe tag before persisting into IndexedDB.
 */
export default function BeatUploadModal({ open, onClose, onUploaded }) {
  const t = useT();
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [bpm, setBpm] = useState(96);
  const [bar1Offset, setBar1Offset] = useState(0);
  const [totalBars, setTotalBars] = useState(32);
  const [duration, setDuration] = useState(0);
  const [vibe, setVibe] = useState('Custom');
  const [producer, setProducer] = useState('');
  const [barsPreview, setBarsPreview] = useState(null);

  if (!open) return null;

  const reset = () => {
    setFile(null);
    setTitle('');
    setBpm(96);
    setBar1Offset(0);
    setTotalBars(32);
    setDuration(0);
    setVibe('Custom');
    setProducer('');
    setBarsPreview(null);
    setError('');
  };

  const handleFileSelected = async (chosen) => {
    if (!chosen) return;
    if (!chosen.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|flac|aac|webm)$/i.test(chosen.name)) {
      setError(t('upload.errFormat'));
      return;
    }
    if (chosen.size > 40 * 1024 * 1024) {
      setError(t('upload.errTooBig'));
      return;
    }

    setError('');
    setAnalyzing(true);
    try {
      const info = await analyzeAudioFile(chosen);
      setFile(chosen);
      setTitle(info.title);
      setBpm(info.bpm);
      setBar1Offset(info.bar1Offset);
      setTotalBars(info.totalBars);
      setDuration(info.duration);
      setBarsPreview(info.bars);
    } catch {
      setError(t('upload.errDecode'));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleBpmChange = (val) => {
    const nextBpm = Number(val) || 96;
    setBpm(nextBpm);
    if (duration > 0 && nextBpm >= 60) {
      const usable = Math.max(4, duration - (Number(bar1Offset) || 0));
      setTotalBars(Math.max(8, Math.floor((usable * nextBpm) / 240)));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!file) {
      setError(t('upload.errNoFile'));
      return;
    }
    const check = checkContentSafety(title);
    if (!check.ok) {
      setError(t('auth.errBanned', { term: check.matchedTerm || '' }));
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saved = await saveCustomBeat(
        {
          title,
          bpm,
          bar1Offset,
          totalBars,
          duration,
          vibe,
          producer: producer || 'Custom Upload',
          bars: barsPreview,
        },
        file,
      );
      reset();
      onUploaded?.(saved);
      onClose?.();
    } catch {
      setError(t('upload.errSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        />

        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={t('upload.title')}
          initial={{ opacity: 0, scale: 0.94, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 10 }}
          transition={SPRING_SMOOTH}
          className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-lift"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-content">🎵 {t('upload.title')}</h2>
              <p className="text-xs text-content-muted">{t('upload.subtitle')}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="ygb-icon-btn h-8 w-8 text-xs"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSave} className="mt-4 space-y-4">
            {/* Dropzone / File picker */}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac"
              className="hidden"
              onChange={(e) => handleFileSelected(e.target.files?.[0])}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileSelected(e.dataTransfer.files?.[0]);
              }}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-accent/55 bg-accent/[0.06] px-4 py-5 text-center transition-colors hover:border-accent hover:bg-accent/[0.11]"
            >
              {analyzing ? (
                <p className="text-xs font-semibold text-accent-lighter">{t('upload.analyzing')}</p>
              ) : file ? (
                <div className="flex w-full items-center gap-3 text-left">
                  <BeatCover
                    beat={{ bpm, bars: barsPreview, colors: ['#F78501', '#753F01'] }}
                    playing={false}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-content">{file.name}</p>
                    <p className="text-[11px] text-content-muted">
                      {duration}s · ~{bpm} BPM · {totalBars} bar
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-accent-light">
                    {t('upload.changeFile')}
                  </span>
                </div>
              ) : (
                <>
                  <span className="text-2xl" aria-hidden="true">
                    ⬆️
                  </span>
                  <span className="text-sm font-bold text-content">{t('upload.dropLabel')}</span>
                  <span className="text-[11px] text-content-subtle">
                    MP3, WAV, M4A, OGG · {t('upload.maxSize')}
                  </span>
                </>
              )}
            </button>

            {file ? (
              <div className="space-y-3">
                <div>
                  <label className="field-label">{t('upload.beatTitle')}</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={48}
                    className="input"
                    required
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="field-label">BPM</label>
                    <input
                      type="number"
                      min={60}
                      max={200}
                      value={bpm}
                      onChange={(e) => handleBpmChange(e.target.value)}
                      className="input font-mono tnum"
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">{t('upload.bar1Offset')}</label>
                    <input
                      type="number"
                      min={0}
                      max={Math.max(0, Math.floor(duration))}
                      step="0.1"
                      value={bar1Offset}
                      onChange={(e) => setBar1Offset(e.target.value)}
                      className="input font-mono tnum"
                    />
                  </div>
                  <div>
                    <label className="field-label">{t('upload.totalBars')}</label>
                    <input
                      type="number"
                      min={8}
                      max={256}
                      value={totalBars}
                      onChange={(e) => setTotalBars(e.target.value)}
                      className="input font-mono tnum"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="field-label">{t('upload.vibe')}</label>
                    <select
                      value={vibe}
                      onChange={(e) => setVibe(e.target.value)}
                      className="input"
                    >
                      {UPLOAD_VIBES.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">{t('upload.producer')}</label>
                    <input
                      type="text"
                      value={producer}
                      onChange={(e) => setProducer(e.target.value)}
                      placeholder="VCL / Beatmaker"
                      maxLength={32}
                      className="input"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="btn btn-ghost flex-1">
                {t('common.cancel')}
              </button>
              <motion.button
                type="submit"
                disabled={!file || analyzing || saving}
                whileHover={!file ? undefined : BUTTON_HOVER}
                whileTap={!file ? undefined : BUTTON_TAP}
                transition={SPRING_SNAPPY}
                className="btn btn-primary flex-1 disabled:opacity-45"
              >
                {saving ? t('upload.saving') : t('upload.addBtn')}
              </motion.button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
