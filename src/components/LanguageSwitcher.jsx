import { useLanguage } from '../i18n/LanguageContext';

/**
 * Language switcher.
 *
 * A radio group rather than a <select>, so the active option is visible at
 * a glance and every option is a single keyboard stop.
 *
 * On narrow screens the options shorten to their language codes and the
 * label is dropped — the full names are what push the header title into
 * truncation on a phone.
 */
export default function LanguageSwitcher({ className = '' }) {
  const { locale, setLocale, t, languages } = useLanguage();

  return (
    <div className={`flex shrink-0 items-center gap-2 ${className}`}>
      <span
        id="language-switcher-label"
        className="hidden text-[11px] font-medium uppercase tracking-[0.14em] text-content-subtle sm:inline"
      >
        {t('lang.label')}
      </span>

      <div
        role="radiogroup"
        aria-labelledby="language-switcher-label"
        className="segment"
      >
        {languages.map((language) => {
          const active = language.code === locale;
          return (
            <button
              key={language.code}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={t('lang.switchAria', { language: language.nativeLabel })}
              onClick={() => setLocale(language.code)}
              className="segment-item whitespace-nowrap"
            >
              {/* The code on narrow screens, the full name above them. */}
              <span className="sm:hidden">{language.code.toUpperCase()}</span>
              <span className="hidden sm:inline">{language.nativeLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
