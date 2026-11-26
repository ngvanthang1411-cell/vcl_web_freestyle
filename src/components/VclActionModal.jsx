import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BUTTON_HOVER, BUTTON_TAP, SPRING_SMOOTH, SPRING_SNAPPY } from '../lib/motion';
import { useT } from '../i18n/LanguageContext';

/**
 * Modal for the two VCL Studio actions on the Results screen (Spec Section 7):
 *  - 'lease':  "Thuê beat này" (Inquire about leasing the beat)
 *  - 'studio': "Thu bản thật ở VCL" (Book a real studio recording session at VCL)
 */
export default function VclActionModal({ mode, beatTitle, userHandle, onClose }) {
  const t = useT();
  const [contact, setContact] = useState(userHandle ? `@${userHandle}` : '');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  if (!mode) return null;

  const isLease = mode === 'lease';

  const handleSubmit = (e) => {
    e.preventDefault();
    setSent(true);
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
          initial={{ opacity: 0, scale: 0.94, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 10 }}
          transition={SPRING_SMOOTH}
          className="relative z-10 w-full max-w-md rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-lift"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-content">
              {isLease ? `🎹 ${t('vcl.leaseTitle')}` : `🎙 ${t('vcl.studioTitle')}`}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="ygb-icon-btn h-8 w-8 text-xs"
            >
              ✕
            </button>
          </div>

          {sent ? (
            <div className="mt-4 space-y-4 text-center">
              <p className="text-3xl" aria-hidden="true">
                ✅
              </p>
              <p className="text-sm font-semibold text-content">{t('vcl.sentTitle')}</p>
              <p className="text-xs leading-relaxed text-content-muted">{t('vcl.sentDesc')}</p>
              <motion.button
                type="button"
                whileHover={BUTTON_HOVER}
                whileTap={BUTTON_TAP}
                transition={SPRING_SNAPPY}
                onClick={onClose}
                className="btn btn-primary w-full"
              >
                {t('common.done')}
              </motion.button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <p className="text-xs leading-relaxed text-content-muted">
                {isLease
                  ? t('vcl.leaseDesc', { beat: beatTitle || 'VCL Beat' })
                  : t('vcl.studioDesc', { beat: beatTitle || 'VCL Beat' })}
              </p>

              <div>
                <label className="field-label">{t('vcl.contactLabel')}</label>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder={t('vcl.contactPlaceholder')}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="field-label">{t('vcl.noteLabel')}</label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={
                    isLease ? t('vcl.leaseNotePlaceholder') : t('vcl.studioNotePlaceholder')
                  }
                  className="input resize-none text-xs"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose} className="btn btn-ghost flex-1">
                  {t('common.cancel')}
                </button>
                <motion.button
                  type="submit"
                  whileHover={BUTTON_HOVER}
                  whileTap={BUTTON_TAP}
                  transition={SPRING_SNAPPY}
                  className="btn btn-primary flex-1"
                >
                  {t('vcl.sendBtn')}
                </motion.button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
