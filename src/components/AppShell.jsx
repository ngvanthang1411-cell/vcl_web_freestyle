import LanguageSwitcher from './LanguageSwitcher';
import { useT } from '../i18n/LanguageContext';

/**
 * The application shell.
 *
 * The frame every screen renders inside: a minimal header with the brand and
 * the language switcher, and a one-line footer. There is no side navigation —
 * each screen moves the flow forward with its own primary action, so the
 * chrome does not need to repeat it.
 *
 * The shell is presentational. It renders the brand and reports a click on
 * it, which returns to the landing screen.
 */
export default function AppShell({ onNavigate, beatCount, footer = null, children }) {
  const t = useT();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      {/* ------------------------------------------------------ top bar */}
      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onNavigate('landing')}
          className="flex min-w-0 items-center gap-2.5 text-left"
        >
          <img
            src="/logo-mark.png"
            alt=""
            width={110}
            height={40}
            className="h-6 w-auto shrink-0 object-contain"
          />
          <span className="truncate text-base font-semibold tracking-tight text-content">
            {t('app.title')}
          </span>
        </button>

        <LanguageSwitcher />
      </header>

      {/* ------------------------------------------------------ content */}
      <main className="mt-8 sm:mt-12">{children}</main>

      {/* The "Your beat" bar sits above the footer. */}
      {footer}

      <footer className="mt-8 border-t border-line pt-4">
        <p className="text-xs text-content-subtle">
          {t('landing.meta', { count: beatCount })}
        </p>
      </footer>
    </div>
  );
}
