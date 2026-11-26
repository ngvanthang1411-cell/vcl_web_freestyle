import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  getAllUsers,
  getRankForPoints,
  getRanksConfig,
  isUser18Plus,
  loginDemoUser,
  loginWithSocialProvider,
  logoutDemoUser,
  registerDemoUser,
} from '../lib/vclStore';
import { BUTTON_HOVER, BUTTON_TAP, SPRING_SMOOTH, SPRING_SNAPPY } from '../lib/motion';
import { useT } from '../i18n/LanguageContext';

const SOCIAL_PRESETS = {
  google: [
    {
      email: 'vcl.freestyle@gmail.com',
      displayName: 'VCL Freestyle',
      socialHandle: 'vcl_gmail',
      birthYear: 1999,
    },
    {
      email: 'saigon.bars@gmail.com',
      displayName: 'Saigon Bars',
      socialHandle: 'sg_bars',
      birthYear: 2001,
    },
  ],
  facebook: [
    {
      email: 'fb.vcl.mc@facebook.com',
      displayName: 'Minh Khôi (FB)',
      socialHandle: 'minhkhoi_fb',
      birthYear: 1998,
    },
    {
      email: 'fb.streetflow@facebook.com',
      displayName: 'Street Flow (FB)',
      socialHandle: 'streetflow_fb',
      birthYear: 2000,
    },
  ],
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.8-5.4 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.2-4.8 9.2-7.3 0-.5-.1-.9-.1-1.3H12z"
      />
      <path
        fill="#34A853"
        d="M3.5 7.3l3.2 2.3C7.6 7.5 9.6 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.3 14.6 2.4 12 2.4 8.2 2.4 4.9 4.5 3.5 7.3z"
      />
      <path
        fill="#FBBC05"
        d="M12 21.6c3.2 0 5.9-1.1 7.8-2.9l-3.6-2.8c-1 .7-2.3 1.2-4.2 1.2-3.2 0-5.9-2.2-6.8-5.1l-3.3 2.5c1.5 4.2 5.4 7.1 10.1 7.1z"
      />
      <path
        fill="#4285F4"
        d="M21.2 14.3c.1-.4.2-.9.2-1.5 0-.6-.1-1.2-.2-1.7H12v3.9h5.4c-.3 1.3-1.1 2.4-2.2 3.1l3.6 2.8c2.1-1.9 3.4-4.8 2.4-6.6z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.1 24 18.1 24 12.07z"
      />
    </svg>
  );
}

/**
 * Demo Login / Register / Social OAuth (Gmail & Facebook) / Account Profile Modal.
 */
export default function AuthModal({ open, user, onClose, onAuthChange }) {
  const t = useT();
  const [mode, setMode] = useState('login'); // login | register | social
  const [socialProvider, setSocialProvider] = useState(null); // 'google' | 'facebook'
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [birthYear, setBirthYear] = useState('2000');
  const [socialEmail, setSocialEmail] = useState('');
  const [socialName, setSocialName] = useState('');
  const [socialYear, setSocialYear] = useState('1999');
  const [error, setError] = useState('');

  if (!open) return null;

  const demoAccounts = getAllUsers().slice(0, 4);
  const ranks = getRanksConfig();
  const rankInfo = user ? getRankForPoints(user.totalPoints || 0, ranks) : null;

  const resetForm = () => {
    setError('');
    setAccount('');
    setPassword('');
    setDisplayName('');
    setSocialHandle('');
    setSocialEmail('');
    setSocialName('');
    setSocialProvider(null);
    setMode('login');
  };

  const openSocialFlow = (provider) => {
    setSocialProvider(provider);
    setMode('social');
    setError('');
    setSocialEmail('');
    setSocialName('');
    setSocialYear('1999');
  };

  const handleSocialPreset = (preset) => {
    const res = loginWithSocialProvider({
      provider: socialProvider,
      ...preset,
    });
    if (!res.ok) {
      setError(t('auth.errInvalid'));
      return;
    }
    resetForm();
    onAuthChange?.(res.user);
    onClose?.();
  };

  const handleSocialSubmit = (e) => {
    e.preventDefault();
    setError('');
    const res = loginWithSocialProvider({
      provider: socialProvider,
      email: socialEmail,
      displayName: socialName,
      birthYear: socialYear,
    });
    if (!res.ok) {
      if (res.error === 'invalid_gmail') setError(t('auth.errGmail'));
      else if (res.error === 'invalid_fb') setError(t('auth.errFb'));
      else if (res.error === 'banned_word')
        setError(t('auth.errBanned', { term: res.matchedTerm || '' }));
      else if (res.error === 'invalid_birth_year') setError(t('auth.errBirthYear'));
      else setError(t('auth.errInvalid'));
      return;
    }
    resetForm();
    onAuthChange?.(res.user);
    onClose?.();
  };

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');
    const res = loginDemoUser(account, password);
    if (!res.ok) {
      setError(
        res.error === 'wrong_password' ? t('auth.errWrongPass') : t('auth.errNotFound'),
      );
      return;
    }
    resetForm();
    onAuthChange?.(res.user);
    onClose?.();
  };

  const handleQuickDemoLogin = (demoUser) => {
    const res = loginDemoUser(demoUser.account, demoUser.password);
    if (res.ok) {
      resetForm();
      onAuthChange?.(res.user);
      onClose?.();
    }
  };

  const handleRegister = (e) => {
    e.preventDefault();
    setError('');
    const res = registerDemoUser({
      account,
      password: password || '123456',
      displayName,
      socialHandle: socialHandle || account,
      birthYear,
    });
    if (!res.ok) {
      if (res.error === 'banned_word') {
        setError(t('auth.errBanned', { term: res.matchedTerm || '' }));
      } else if (res.error === 'already_exists') {
        setError(t('auth.errExists'));
      } else if (res.error === 'invalid_birth_year') {
        setError(t('auth.errBirthYear'));
      } else {
        setError(t('auth.errInvalid'));
      }
      return;
    }
    resetForm();
    onAuthChange?.(res.user);
    onClose?.();
  };

  const handleLogout = () => {
    logoutDemoUser();
    onAuthChange?.(null);
    onClose?.();
  };

  const isGoogle = socialProvider === 'google';

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
          aria-label={t('auth.modalAria')}
          initial={{ opacity: 0, scale: 0.94, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 10 }}
          transition={SPRING_SMOOTH}
          className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-lift"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-lighter">
                {t('auth.demoBadge')}
              </span>
              <h2 className="mt-1.5 text-lg font-bold text-content">
                {user
                  ? t('auth.profileTitle')
                  : mode === 'social'
                    ? isGoogle
                      ? t('auth.googleTitle')
                      : t('auth.fbTitle')
                    : mode === 'login'
                      ? t('auth.loginTitle')
                      : t('auth.registerTitle')}
              </h2>
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

          {user ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-accent/35 bg-surface-overlay/70 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-2xl">
                    {rankInfo?.current?.icon || '🎤'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold text-content">{user.displayName}</p>
                    <p className="truncate text-xs text-accent-light">@{user.socialHandle}</p>
                    <p className="mt-0.5 text-[11px] text-content-muted">
                      {rankInfo?.current?.title} ·{' '}
                      <span className="font-mono font-bold text-content tnum">
                        {user.totalPoints || 0} {t('common.points')}
                      </span>
                    </p>
                  </div>
                </div>

                {rankInfo?.next ? (
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] text-content-subtle">
                      <span>{rankInfo.current.title}</span>
                      <span>
                        {rankInfo.next.title} ({rankInfo.next.minPoints} {t('common.points')})
                      </span>
                    </div>
                    <div className="track mt-1 h-1.5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-secondary"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              4,
                              ((user.totalPoints - rankInfo.current.minPoints) /
                                Math.max(1, rankInfo.next.minPoints - rankInfo.current.minPoints)) *
                                100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                  {user.provider === 'google' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 font-semibold text-content">
                      <GoogleIcon /> Gmail
                    </span>
                  ) : user.provider === 'facebook' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#1877F2]/20 px-2.5 py-0.5 font-semibold text-[#60A5FA]">
                      <FacebookIcon /> Facebook
                    </span>
                  ) : null}
                  <span className="rounded-full bg-surface-raised px-2.5 py-0.5 text-content-muted">
                    {t('auth.accountLabel')}: {user.account}
                  </span>
                  <span className="rounded-full bg-surface-raised px-2.5 py-0.5 text-content-muted">
                    {t('auth.birthYear')}: {user.birthYear}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-semibold ${
                      isUser18Plus(user)
                        ? 'bg-success/15 text-success'
                        : 'bg-warning/15 text-warning'
                    }`}
                  >
                    {isUser18Plus(user) ? '18+ ✓' : t('auth.under18Tag')}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <motion.button
                  type="button"
                  whileHover={BUTTON_HOVER}
                  whileTap={BUTTON_TAP}
                  transition={SPRING_SNAPPY}
                  onClick={handleLogout}
                  className="btn btn-secondary flex-1 text-danger"
                >
                  {t('auth.logout')}
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={BUTTON_HOVER}
                  whileTap={BUTTON_TAP}
                  transition={SPRING_SNAPPY}
                  onClick={onClose}
                  className="btn btn-primary flex-1"
                >
                  {t('common.done')}
                </motion.button>
              </div>
            </div>
          ) : mode === 'social' && socialProvider ? (
            /* ----------------------------------------- Demo Google / FB OAuth step */
            <div className="mt-4 space-y-4">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setSocialProvider(null);
                  setError('');
                }}
                className="text-xs font-semibold text-content-muted hover:text-content"
              >
                ‹ {t('auth.backToLogin')}
              </button>

              <div className="rounded-xl border border-line bg-surface-overlay/60 p-3.5">
                <div className="flex items-center gap-2">
                  {isGoogle ? <GoogleIcon /> : <FacebookIcon />}
                  <p className="text-xs font-bold text-content">
                    {isGoogle ? t('auth.pickGmailAccount') : t('auth.pickFbAccount')}
                  </p>
                </div>

                <div className="mt-2.5 space-y-2">
                  {SOCIAL_PRESETS[socialProvider].map((preset) => (
                    <button
                      key={preset.email}
                      type="button"
                      onClick={() => handleSocialPreset(preset)}
                      className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-raised/90 px-3 py-2.5 text-left transition-colors hover:border-accent/60"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                          isGoogle ? 'bg-[#EA4335]' : 'bg-[#1877F2]'
                        }`}
                      >
                        {preset.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-content">
                          {preset.displayName}
                        </span>
                        <span className="block truncate text-[11px] text-content-subtle">
                          {preset.email}
                        </span>
                      </span>
                      <span className="text-xs font-semibold text-accent-light">›</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-content-subtle">
                <span className="h-px flex-1 bg-line" />
                <span>{t('auth.orEnterCustom')}</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <form onSubmit={handleSocialSubmit} className="space-y-3">
                <div>
                  <label className="field-label">
                    {isGoogle ? t('auth.gmailInput') : t('auth.fbInput')}
                  </label>
                  <input
                    type={isGoogle ? 'email' : 'text'}
                    value={socialEmail}
                    onChange={(e) => setSocialEmail(e.target.value)}
                    placeholder={isGoogle ? 'tenban@gmail.com' : 'Facebook name / email'}
                    className="input"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="field-label">{t('auth.displayName')}</label>
                    <input
                      type="text"
                      value={socialName}
                      onChange={(e) => setSocialName(e.target.value)}
                      placeholder="MC Khanh"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="field-label">{t('auth.birthYear')}</label>
                    <input
                      type="number"
                      min={1950}
                      max={2026}
                      value={socialYear}
                      onChange={(e) => setSocialYear(e.target.value)}
                      className="input"
                      required
                    />
                  </div>
                </div>

                {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}

                <motion.button
                  type="submit"
                  whileHover={BUTTON_HOVER}
                  whileTap={BUTTON_TAP}
                  transition={SPRING_SNAPPY}
                  className="btn btn-primary w-full py-2.5"
                >
                  {isGoogle ? t('auth.continueGoogle') : t('auth.continueFacebook')}
                </motion.button>
              </form>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {/* Google (Gmail) & Facebook Social Login Buttons */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <motion.button
                  type="button"
                  whileHover={BUTTON_HOVER}
                  whileTap={BUTTON_TAP}
                  transition={SPRING_SNAPPY}
                  onClick={() => openSocialFlow('google')}
                  className="flex items-center justify-center gap-2 rounded-xl border border-line-strong bg-white px-3 py-2.5 text-xs font-bold text-[#1f1f1f] shadow-sm transition-colors hover:bg-white/95"
                >
                  <GoogleIcon />
                  <span>{t('auth.googleBtn')}</span>
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={BUTTON_HOVER}
                  whileTap={BUTTON_TAP}
                  transition={SPRING_SNAPPY}
                  onClick={() => openSocialFlow('facebook')}
                  className="flex items-center justify-center gap-2 rounded-xl border border-[#1877F2]/80 bg-[#1877F2]/15 px-3 py-2.5 text-xs font-bold text-[#60A5FA] transition-colors hover:bg-[#1877F2]/25"
                >
                  <FacebookIcon />
                  <span>{t('auth.fbBtn')}</span>
                </motion.button>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-content-subtle">
                <span className="h-px flex-1 bg-line" />
                <span>{t('auth.orWithAccount')}</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <div className="segment grid w-full grid-cols-2">
                <button
                  type="button"
                  aria-pressed={mode === 'login'}
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                  className="segment-item py-2 text-center"
                >
                  {t('auth.tabLogin')}
                </button>
                <button
                  type="button"
                  aria-pressed={mode === 'register'}
                  onClick={() => {
                    setMode('register');
                    setError('');
                  }}
                  className="segment-item py-2 text-center"
                >
                  {t('auth.tabRegister')}
                </button>
              </div>

              {mode === 'login' ? (
                <form onSubmit={handleLogin} className="space-y-3">
                  <div>
                    <label className="field-label">{t('auth.accountInput')}</label>
                    <input
                      type="text"
                      value={account}
                      onChange={(e) => setAccount(e.target.value)}
                      placeholder="0901234567 / @vcl_mc"
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">{t('auth.passwordInput')}</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="123456"
                      className="input"
                    />
                  </div>

                  {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}

                  <motion.button
                    type="submit"
                    whileHover={BUTTON_HOVER}
                    whileTap={BUTTON_TAP}
                    transition={SPRING_SNAPPY}
                    className="btn btn-primary w-full py-2.5"
                  >
                    {t('auth.loginBtn')}
                  </motion.button>

                  {/* 1-click Demo accounts */}
                  <div className="border-t border-line/70 pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-content-subtle">
                      {t('auth.quickDemo')}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {demoAccounts.map((acc) => (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => handleQuickDemoLogin(acc)}
                          className="flex items-center gap-2 rounded-xl border border-line bg-surface-overlay/70 px-2.5 py-2 text-left transition-colors hover:border-accent/60 hover:bg-surface-overlay"
                        >
                          <span className="text-base">{acc.rankIcon || '🎤'}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-bold text-content">
                              {acc.displayName}
                            </span>
                            <span className="block truncate text-[10px] text-content-subtle">
                              @{acc.socialHandle}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-3">
                  <div>
                    <label className="field-label">{t('auth.accountInput')}</label>
                    <input
                      type="text"
                      value={account}
                      onChange={(e) => setAccount(e.target.value)}
                      placeholder={t('auth.accountPlaceholder')}
                      className="input"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="field-label">{t('auth.displayName')}</label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="MC Khanh"
                        className="input"
                        required
                      />
                    </div>
                    <div>
                      <label className="field-label">{t('auth.socialHandle')}</label>
                      <input
                        type="text"
                        value={socialHandle}
                        onChange={(e) => setSocialHandle(e.target.value.replace(/^@+/, ''))}
                        placeholder="mc_khanh"
                        className="input"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="field-label">{t('auth.birthYear')}</label>
                      <input
                        type="number"
                        min={1950}
                        max={2026}
                        value={birthYear}
                        onChange={(e) => setBirthYear(e.target.value)}
                        className="input"
                        required
                      />
                    </div>
                    <div>
                      <label className="field-label">{t('auth.passwordInput')}</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="123456"
                        className="input"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] leading-snug text-content-subtle">
                    {t('auth.registerHint')}
                  </p>

                  {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}

                  <motion.button
                    type="submit"
                    whileHover={BUTTON_HOVER}
                    whileTap={BUTTON_TAP}
                    transition={SPRING_SNAPPY}
                    className="btn btn-primary w-full py-2.5"
                  >
                    {t('auth.registerBtn')}
                  </motion.button>
                </form>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
