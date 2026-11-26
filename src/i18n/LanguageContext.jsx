import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, LANGUAGES, translations } from './translations';

const STORAGE_KEY = 'ygb:locale';

const LanguageContext = createContext(null);

/** Picks the best starting locale: saved choice, then browser language. */
function detectLocale() {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && translations[saved]) return saved;
  } catch {
    /* storage unavailable (private mode) */
  }

  const nav = window.navigator?.language || '';
  if (nav.toLowerCase().startsWith('vi')) return 'vi';

  return DEFAULT_LOCALE;
}

export function LanguageProvider({ children, initialLocale }) {
  const [locale, setLocaleState] = useState(
    () => (initialLocale && translations[initialLocale] ? initialLocale : detectLocale()),
  );

  // Persist the choice.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* storage unavailable — the choice just will not persist */
    }
    // Keep the document language in sync for screen readers.
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next) => {
    if (translations[next]) setLocaleState(next);
  }, []);

  /**
   * Translates a key.
   * @param {string} key        Dotted translation key.
   * @param {object} [vars]    Values for {placeholder} interpolation.
   */
  const t = useCallback(
    (key, vars) => {
      const dict = translations[locale] || translations[DEFAULT_LOCALE];
      let value = dict[key];
      if (value === undefined) {
        // Fall back to English rather than showing a raw key.
        value = translations[DEFAULT_LOCALE][key];
      }
      if (value === undefined) return key;

      if (!vars) return value;
      return value.replace(/\{(\w+)\}/g, (match, name) =>
        vars[name] !== undefined ? String(vars[name]) : match,
      );
    },
    [locale],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      languages: LANGUAGES,
    }),
    [locale, setLocale, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Access the active locale and the translate function. */
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used inside a <LanguageProvider>.');
  }
  return context;
}

/** Convenience hook for components that only need the translate function. */
export function useT() {
  return useLanguage().t;
}
