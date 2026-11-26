import { useEffect } from 'react';
import { motion } from 'framer-motion';
import BeatCover from '../components/BeatCover';
import BeatPulseBar from '../components/BeatPulseBar';
import { SegmentedControl, SliderField } from '../components/ui';
import { beatText } from '../data/beats';
import { useLanguage, useT } from '../i18n/LanguageContext';
import { snapToBarBeats } from '../lib/beatGrid';
import {
  BUTTON_HOVER,
  BUTTON_TAP,
  CARD_HOVER,
  CARD_TAP,
  SPRING_SNAPPY,
  cardContainerVariants,
  cardItemVariants,
} from '../lib/motion';

function formatBeatInterval(seconds, bpm) {
  if (!bpm) return seconds;
  const beats = snapToBarBeats(seconds, bpm);
  return Number((beats * (60 / bpm)).toFixed(2));
}

/**
 * Round Settings screen (`#setup`).
 *
 * Uses Framer Motion spring cards & switches, and embeds the memoized 60fps
 * `BeatPulseBar` decoupled from text inputs so typing handles never interrupts
 * the beat visualizer.
 */
export default function SetupScreen({
  beat,
  player,
  settings,
  onSettingsChange,
  onBack,
  unsupported,
}) {
  const { locale } = useLanguage();
  const t = useT();
  const { play, pause, isPlaying, audio, analyserRef } = player;

  useEffect(() => {
    return () => pause();
  }, [pause]);

  const bpm = beat?.bpm ?? 0;

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
                ? `${beat.bpm} BPM · ${beatText(beat, 'mood', locale)}`
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
          bpm={bpm}
          isPlaying={isPlaying}
          compact
        />
      </motion.div>

      {/* Practice vs Record 2-card selector */}
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
          onClick={() => onSettingsChange({ ...settings, practice: false })}
          className={`ygb-mode-card ${!settings.practice && !unsupported ? 'on' : ''} disabled:cursor-not-allowed disabled:opacity-45`}
        >
          <span className="text-xl" aria-hidden="true">
            🎤
          </span>
          <b className="mt-1 text-sm font-bold text-content">{t('setup.modeRecord')}</b>
          <small className="text-xs leading-snug text-content-muted">
            {t('setup.modeRecordDesc')}
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
              value={settings.handle ?? ''}
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

        <p className="text-[11px] leading-snug text-content-subtle">
          {settings.battleMode ? t('setup.battleNote') : t('setup.handleNote')}
        </p>
      </motion.div>

      {/* Round core options */}
      <motion.div variants={cardItemVariants} className="panel space-y-5 p-4">
        <p className="kicker">{t('setup.roundHeading')}</p>

        <SegmentedControl
          name="setup-duration"
          label={t('freestyle.sessionLength')}
          value={settings.duration}
          onChange={(value) => onSettingsChange({ ...settings, duration: value })}
          options={[30, 60, 90].map((seconds) => ({
            value: seconds,
            label: `${seconds}s`,
          }))}
        />

        <SliderField
          id="setup-word-interval"
          label={t('freestyle.wordInterval')}
          value={settings.wordInterval}
          min={2}
          max={10}
          step={1}
          onChange={(value) => onSettingsChange({ ...settings, wordInterval: value })}
          format={(v) => `${formatBeatInterval(v, bpm)}s`}
          note={
            bpm
              ? t('freestyle.beatsCount', {
                  n: snapToBarBeats(settings.wordInterval, bpm),
                })
              : null
          }
          hint={t('freestyle.wordIntervalHint')}
        />
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
          <SegmentedControl
            name="setup-word-mode"
            label={t('freestyle.wordOrder')}
            value={settings.wordMode}
            onChange={(value) => onSettingsChange({ ...settings, wordMode: value })}
            options={[
              { value: 'random', label: t('freestyle.random') },
              { value: 'sequential', label: t('freestyle.sequential') },
            ]}
          />

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
                  {t('setup.modeRecordDesc')}
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
