import { motion } from 'framer-motion';
import LanguageSwitcher from './LanguageSwitcher';
import { SPRING_SNAPPY } from '../lib/motion';
import { useT } from '../i18n/LanguageContext';

/**
 * The application shell.
 *
 * Mobile-first vertical app column with a crisp topbar (live status pill /
 * brand mark, Demo Auth account button, language switcher, and leaderboard trophy
 * button), main content, optional sticky bottom dock, and minimal footer.
 */
export default function AppShell({
  onNavigate,
  beatCount,
  screen = 'landing',
  runCount = 0,
  user = null,
  onOpenAuth = null,
  footer = null,
  children,
}) {
  const t = useT();
  const isHome = screen === 'landing';

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col px-4 pb-8 pt-4 sm:px-5 sm:pt-6">
      {/* ------------------------------------------------------ top bar */}
      <header className="flex items-center justify-between gap-2">
        {isHome ? (
          <button
            type="button"
            onClick={() => onNavigate?.('landing')}
            className="ygb-live-chip transition-transform duration-200 hover:scale-[1.02]"
          >
            <span className="ygb-live-dot" aria-hidden="true" />
            <span>{t('home.liveChip')}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate?.('landing')}
            className="group flex min-w-0 items-center gap-2 text-left"
          >
            <img
              src="/logo-mark.png"
              alt=""
              width={110}
              height={40}
              className="h-5 w-auto shrink-0 object-contain transition-transform duration-200 group-hover:scale-105"
            />
            <span className="truncate text-sm font-semibold tracking-tight text-content transition-colors group-hover:text-accent-light">
              {t('app.title')}
            </span>
          </button>
        )}

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {onOpenAuth ? (
            <motion.button
              type="button"
              whileHover={{ y: -1, scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              transition={SPRING_SNAPPY}
              onClick={onOpenAuth}
              className={`inline-flex h-9 max-w-[8.5rem] items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors ${
                user
                  ? 'border-accent/60 bg-accent/15 text-accent-lighter'
                  : 'border-line bg-surface-raised/85 text-content-muted hover:border-accent/50 hover:text-content'
              }`}
              title={user ? `${user.displayName} (@${user.socialHandle})` : t('auth.loginBtn')}
            >
              <span aria-hidden="true">{user ? user.rankIcon || '🎤' : '👤'}</span>
              <span className="truncate">
                {user ? `@${user.socialHandle}` : t('auth.shortLogin')}
              </span>
            </motion.button>
          ) : null}

          <LanguageSwitcher />

          <motion.button
            type="button"
            whileHover={{ y: -1, scale: 1.07 }}
            whileTap={{ scale: 0.92 }}
            transition={SPRING_SNAPPY}
            onClick={() => onNavigate?.('stats')}
            aria-label={t('home.statsAria')}
            title={t('stats.title')}
            className={`ygb-icon-btn relative ${
              screen === 'stats' ? 'border-accent/80 bg-accent/15' : ''
            }`}
          >
            <span aria-hidden="true">🏆</span>
            {runCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-content-inverse tnum">
                {runCount > 9 ? '9+' : runCount}
              </span>
            ) : null}
          </motion.button>
        </div>
      </header>

      {/* ------------------------------------------------------ content */}
      <main className="mt-6 flex-1 sm:mt-8">{children}</main>

      {/* Floating bottom dock ("Your beat" / "Up next") */}
      {footer}

      <footer className="mt-8 border-t border-line/70 pt-4 text-center">
        <p className="text-xs text-content-subtle">
          {t('landing.meta', { count: beatCount })}
        </p>
      </footer>
    </div>
  );
}
