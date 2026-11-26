import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import BeatCover from '../components/BeatCover';
import BeatPulseBar from '../components/BeatPulseBar';
import { SegmentedControl } from '../components/ui';
import { beatText } from '../data/beats';
import { useLanguage, useT } from '../i18n/LanguageContext';
import { getRhymeBankStats, resolveRoundBars } from '../lib/rhymeEngine';
import { findUserByHandleOrAccount } from '../lib/vclStore';
import {
  BUTTON_HOVER,
  BUTTON_TAP,
  CARD_HOVER,
  CARD_TAP,
  SPRING_SNAPPY,
  cardContainerVariants,
  cardItemVariants,
} from '../lib/motion';

/**
 * Round Settings screen (`#setup`) implementing Spec Section 2 & 6:
 *  - Mode: Luyện tập (Practice) vs Thi (Compete — records camera + mic, submittable)
 *  - Format: Solo vs Đấu 2 người (Battle — 2 players alternating every 2 bars)
 *  - Length: 8 / 16 (default) / 32 bar / Cả bài
 *  - Difficulty: Dễ (default) / Vừa / Khó (from Kho vần VCL v0)
 *  - Flow: Phách 4 (1 word/bar, default) · Phách 2 & 4 (2 words/bar)
 *  - Count-in: Bật (4 bar, default) / Tắt
 */
export default function SetupScreen({
  beat,
  player,
  settings,
  onSettingsChange,
  onBack,
  unsupported,
  user = null,
}) {
  const { locale } = useLanguage();
  const t = useT();
  const { play, pause, isPlaying, audio, analyserRef } = player;

  useEffect(() => {
    return () => pause();
  }, [pause]);

  const bpm = beat?.bpm ?? 96;
  const bankStats = useMemo(() => getRhymeBankStats(), []);
  const resolvedBars = resolveRoundBars(settings.bars ?? 16, beat);
  const estSeconds = Math.round((resolvedBars * 4 * 60) / Math.max(60, bpm));
  const wordsTotal = resolvedBars * (settings.flow === 'beat24' ? 2 : 1);

  const matchedOpponent = useMemo(
    () => (settings.battleMode && settings.opponent ? findUserByHandleOrAccount(settings.opponent) : null),
    [settings.battleMode, settings.opponent],
  );

  const togglePreview = async () => {
    if (!beat) return;
    if (isPlaying) {
      pause();
    } else {
      await play(beat.src);
    }
  };

  return (
    <motion.div
      variants={cardContainerVariants}
      initial="initial"
      animate="animate"
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <motion.button
          type="button"
          whileHover={BUTTON_HOVER}
          whileTap={BUTTON_TAP}
          transition={SPRING_SNAPPY}
          onClick={onBack}
          className="btn btn-ghost -ml-2 px-2.5 py-1.5 text-sm"
        >
          ‹ {t('setup.backBeats')}
        </motion.button>
        <h1 className="text-base font-bold tracking-tight text-content">{t('setup.title')}</h1>
        <span className="w-16" aria-hidden="true" />
      </div>

      {/* Picked beat banner + isolated 60fps BeatPulseBar */}
      <motion.div variants={cardItemVariants} className="panel space-y-3 p-3.5">
        <div className="flex items-center gap-3.5">
          {beat ? (
            <BeatCover beat={beat} playing={isPlaying} />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-overlay text-xl"
            >
              🎲
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold leading-tight text-content">
              {beat ? beat.title : t('beats.randomTitle')}
            </p>
            <p className="mt-0.5 truncate text-xs text-content-muted">
              {beat
                ? `${beat.bpm} BPM · ${beat.totalBars || 32} bar · ${beatText(beat, 'mood', locale)}`
                : t('beats.randomBody')}
            </p>
          </div>
          {beat ? (
            <motion.button
              type="button"
              whileHover={{ scale: 1.07 }}
              whileTap={{ scale: 0.92 }}
              transition={SPRING_SNAPPY}
              onClick={togglePreview}
              aria-label={
                isPlaying
                  ? t('beats.pauseAria', { title: beat.title })
                  : t('beats.previewAria', { title: beat.title })
              }
              className="ygb-icon-btn shrink-0"
            >
              {isPlaying ? '❚❚' : '▶'}
            </motion.button>
          ) : null}
        </div>

        <BeatPulseBar
          audio={audio}
          analyserRef={analyserRef}
          bpm={beat?.bpm ?? 0}
          isPlaying={isPlaying}
          compact
        />
      </motion.div>

      {/* Practice vs Compete (Thi) 2-card selector */}
      <motion.div
        variants={cardItemVariants}
        role="radiogroup"
        aria-label={t('setup.modePractice')}
        className="grid grid-cols-2 gap-3"
      >
        <motion.button
          type="button"
          role="radio"
          aria-checked={settings.practice}
          whileHover={CARD_HOVER}
          whileTap={CARD_TAP}
          transition={SPRING_SNAPPY}
          onClick={() => onSettingsChange({ ...settings, practice: true })}
          className={`ygb-mode-card ${settings.practice ? 'on' : ''}`}
        >
          <span className="text-xl" aria-hidden="true">
            🎧
          </span>
          <b className="mt-1 text-sm font-bold text-content">{t('setup.modePractice')}</b>
          <small className="text-xs leading-snug text-content-muted">
            {t('setup.modePracticeDesc')}
          </small>
        </motion.button>

        <motion.button
          type="button"
          role="radio"
          aria-checked={!settings.practice}
          disabled={Boolean(unsupported)}
          whileHover={unsupported ? undefined : CARD_HOVER}
          whileTap={unsupported ? undefined : CARD_TAP}
          transition={SPRING_SNAPPY}
          onClick={() => onSettingsChange({ ...settings, practice: false, video: true })}
          className={`ygb-mode-card ${!settings.practice && !unsupported ? 'on' : ''} disabled:cursor-not-allowed disabled:opacity-45`}
        >
          <span className="text-xl" aria-hidden="true">
            🏆
          </span>
          <b className="mt-1 text-sm font-bold text-content">{t('setup.modeCompete')}</b>
          <small className="text-xs leading-snug text-content-muted">
            {t('setup.modeCompeteDesc')}
          </small>
        </motion.button>
      </motion.div>

      {/* Solo vs Battle + Handle inputs */}
      <motion.div variants={cardItemVariants} className="panel space-y-4 p-4">
        <div className="segment grid w-full grid-cols-2">
          <button
            type="button"
            aria-pressed={settings.battleMode !== true}
            onClick={() => onSettingsChange({ ...settings, battleMode: false })}
            className="segment-item py-2 text-center"
          >
            🎤 {t('setup.solo')}
          </button>
          <button
            type="button"
            aria-pressed={settings.battleMode === true}
            onClick={() => onSettingsChange({ ...settings, battleMode: true })}
            className="segment-item py-2 text-center"
          >
            ⚔️ {t('setup.battle')}
          </button>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <label className="relative flex flex-1 items-center">
            <span className="pointer-events-none absolute left-3 text-sm font-semibold text-accent">
              @
            </span>
            <input
              type="text"
              maxLength={28}
              value={settings.handle || user?.socialHandle || ''}
              onChange={(e) =>
                onSettingsChange({ ...settings, handle: e.target.value.replace(/^@+/, '') })
              }
              placeholder={t('setup.handlePlaceholder')}
              className="input pl-7"
            />
          </label>

          {settings.battleMode ? (
            <>
              <span className="text-center text-xs font-bold uppercase tracking-widest text-accent">
                VS
              </span>
              <label className="relative flex flex-1 items-center">
                <span className="pointer-events-none absolute left-3 text-sm font-semibold text-secondary">
                  @
                </span>
                <input
                  type="text"
                  maxLength={28}
                  value={settings.opponent ?? ''}
                  onChange={(e) =>
                    onSettingsChange({ ...settings, opponent: e.target.value.replace(/^@+/, '') })
                  }
                  placeholder={t('setup.opponentPlaceholder')}
                  className="input pl-7"
                />
              </label>
            </>
          ) : null}
        </div>

        {settings.battleMode && settings.opponent ? (
          <p className="text-[11px] font-medium">
            {matchedOpponent ? (
              <span className="text-success">
                ✓ {t('setup.opponentLinked', { name: matchedOpponent.displayName })}
              </span>
            ) : (
              <span className="text-content-subtle">{t('setup.opponentGuest')}</span>
            )}
          </p>
        ) : (
          <p className="text-[11px] leading-snug text-content-subtle">
            {settings.battleMode ? t('setup.battleNote') : t('setup.handleNote')}
          </p>
        )}
      </motion.div>

      {/* Official VCL Round Settings (Spec Section 2) */}
      <motion.div variants={cardItemVariants} className="panel space-y-5 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="kicker">{t('setup.roundHeading')}</p>
          <span className="font-mono text-[11px] text-accent-light tnum">
            {resolvedBars} bar · {wordsTotal} {t('setup.wordsUnit')} · ~{estSeconds}s
          </span>
        </div>

        {/* Độ dài: 8 / 16 / 32 bar / Cả bài */}
        <SegmentedControl
          name="setup-bars"
          label={t('setup.barsLabel')}
          value={settings.bars ?? 16}
          onChange={(value) => onSettingsChange({ ...settings, bars: value })}
          options={[
            { value: 8, label: '8 bar' },
            { value: 16, label: '16 bar' },
            { value: 32, label: '32 bar' },
            { value: 'full', label: t('setup.fullTrack') },
          ]}
        />

        {/* Độ khó: Dễ / Vừa / Khó */}
        <div className="space-y-1.5">
          <SegmentedControl
            name="setup-difficulty"
            label={t('setup.difficultyLabel')}
            value={settings.difficulty ?? 'easy'}
            onChange={(value) => onSettingsChange({ ...settings, difficulty: value })}
            options={[
              { value: 'easy', label: t('setup.diffEasy') },
              { value: 'medium', label: t('setup.diffMedium') },
              { value: 'hard', label: t('setup.diffHard') },
            ]}
          />
          <p className="text-[11px] text-content-subtle">
            {t('setup.rhymeBankHint', {
              total: bankStats.totalOk,
              nests: bankStats.totalNests,
              count: bankStats.byLevel[settings.difficulty ?? 'easy'] ?? 0,
            })}
          </p>
        </div>

        {/* Flow: Phách 4 · Phách 2 & 4 */}
        <div className="space-y-1.5">
          <SegmentedControl
            name="setup-flow"
            label={t('setup.flowLabel')}
            value={settings.flow ?? 'beat4'}
            onChange={(value) => onSettingsChange({ ...settings, flow: value })}
            options={[
              { value: 'beat4', label: t('setup.flowBeat4') },
              { value: 'beat24', label: t('setup.flowBeat24') },
            ]}
          />
          <p className="text-[11px] text-content-subtle">
            {(settings.flow ?? 'beat4') === 'beat4'
              ? t('setup.flowBeat4Hint')
              : t('setup.flowBeat24Hint')}
          </p>
        </div>

        {/* Đếm vào: Bật (4 bar) / Tắt */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-content">{t('setup.countInLabel')}</p>
            <p className="text-[11px] leading-snug text-content-subtle">
              {t('setup.countInHint')}
            </p>
          </div>
          <motion.button
            type="button"
            role="switch"
            aria-checked={settings.countIn !== false}
            whileTap={{ scale: 0.94 }}
            transition={SPRING_SNAPPY}
            onClick={() =>
              onSettingsChange({ ...settings, countIn: !(settings.countIn !== false) })
            }
            className="ygb-switch shrink-0"
          >
            <span className="ygb-switch-thumb" />
          </motion.button>
        </div>
      </motion.div>

      {/* Collapsible Advanced Settings */}
      <motion.details variants={cardItemVariants} className="ygb-adv panel overflow-hidden">
        <summary className="flex items-center justify-between gap-3 p-4">
          <span>
            <span className="block text-sm font-semibold text-content">
              {t('setup.advancedTitle')}
            </span>
            <span className="block text-xs text-content-subtle">{t('setup.advancedSub')}</span>
          </span>
          <span className="ygb-adv-chevron text-sm text-content-muted" aria-hidden="true">
            ▾
          </span>
        </summary>

        <div className="space-y-5 border-t border-line/80 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-content">{t('freestyle.burnMode')}</p>
              <p className="text-[11px] leading-snug text-content-subtle">
                {t('freestyle.burnHint')}
              </p>
            </div>
            <motion.button
              type="button"
              role="switch"
              aria-checked={settings.burnMode}
              whileTap={{ scale: 0.94 }}
              transition={SPRING_SNAPPY}
              onClick={() => onSettingsChange({ ...settings, burnMode: !settings.burnMode })}
              className="ygb-switch shrink-0"
            >
              <span className="ygb-switch-thumb" />
            </motion.button>
          </div>

          {!unsupported && !settings.practice ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-content">{t('recorder.recordVideo')}</p>
                <p className="text-[11px] leading-snug text-content-subtle">
                  {t('setup.modeCompeteDesc')}
                </p>
              </div>
              <motion.button
                type="button"
                role="switch"
                aria-checked={settings.video}
                whileTap={{ scale: 0.94 }}
                transition={SPRING_SNAPPY}
                onClick={() => onSettingsChange({ ...settings, video: !settings.video })}
                className="ygb-switch shrink-0"
              >
                <span className="ygb-switch-thumb" />
              </motion.button>
            </div>
          ) : null}
        </div>
      </motion.details>
    </motion.div>
  );
}
