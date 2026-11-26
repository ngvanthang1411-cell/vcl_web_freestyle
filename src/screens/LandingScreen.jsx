import { useT } from '../i18n/LanguageContext';

/**
 * The landing screen.
 *
 * A title, a single line of supporting text, and one action. Everything else
 * is left to the screens that follow.
 */
export default function LandingScreen({ onStart, onOpenBeats, beatCount, supported }) {
  const t = useT();

  return (
    <div>
      <h1 className="text-[clamp(2rem,6vw,3.25rem)] font-semibold leading-tight tracking-tight text-content">
        {t('landing.titleTop')}{' '}
        <span className="text-accent">{t('landing.titleBottom')}</span>
      </h1>

      <p className="mt-3 max-w-xl text-sm leading-relaxed text-content-muted">
        {t('landing.taglineLead')}{' '}
        <span className="text-content">{t('landing.taglineBeat')}</span>{' '}
        {t('landing.taglineEnd')}
      </p>

      <button type="button" onClick={onStart} className="btn btn-primary mt-8">
        {t('landing.ctaStart')}
      </button>

      {!supported ? (
        <p className="mt-6 max-w-xl text-xs leading-relaxed text-warning">
          {t('landing.unsupported')}
        </p>
      ) : null}
    </div>
  );
}
