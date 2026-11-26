import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  getLeaderboardData,
  getRankForPoints,
  getRanksConfig,
  saveRanksConfig,
} from '../lib/vclStore';
import {
  BUTTON_HOVER,
  BUTTON_TAP,
  SPRING_BOUNCY,
  SPRING_SNAPPY,
  cardContainerVariants,
  cardItemVariants,
} from '../lib/motion';
import { useT } from '../i18n/LanguageContext';

/**
 * Official VCL 5-Tab Leaderboard + Local Practice Stats (`#board`).
 *
 * Implements Spec Section 5:
 *  1. Top tuần   — solo entries submitted this Vietnam week, sorted by weekly score
 *  2. Top mọi lúc — all solo entries, sorted by cumulative total score
 *  3. Danh hiệu  — players ranked by cumulative points (never resets) + editable rank table
 *  4. Đấu        — 2-player battles sorted by total viewer votes (week / all-time)
 *  5. Mới        — newest solo & battle submissions first
 *  + Local Practice tab (device-only history, per Spec Section 8)
 */
export default function StatsScreen({
  runs = [],
  dataVersion = 0,
  onOpenVote = null,
  onBack,
  onReset,
}) {
  const t = useT();
  const [tab, setTab] = useState('topWeek'); // topWeek | topAll | ranks | battles | newest | local
  const [battleFilter, setBattleFilter] = useState('week'); // week | all
  const [editingRanks, setEditingRanks] = useState(false);
  const [ranksDraft, setRanksDraft] = useState(() => getRanksConfig());
  const [ranksRev, setRanksRev] = useState(0);

  const board = useMemo(
    () => getLeaderboardData({ battleFilter }),
    [battleFilter, dataVersion, ranksRev],
  );
  const ranksConfig = useMemo(() => getRanksConfig(), [ranksRev]);

  const tabs = [
    { id: 'topWeek', label: `🔥 ${t('board.tabWeek')}` },
    { id: 'topAll', label: `🏆 ${t('board.tabAllTime')}` },
    { id: 'ranks', label: `👑 ${t('board.tabRanks')}` },
    { id: 'battles', label: `⚔️ ${t('board.tabBattles')}` },
    { id: 'newest', label: `✨ ${t('board.tabNewest')}` },
    { id: 'local', label: `🎧 ${t('board.tabLocal')}` },
  ];

  const handleSaveRanks = () => {
    const saved = saveRanksConfig(ranksDraft);
    setRanksDraft(saved);
    setEditingRanks(false);
    setRanksRev((n) => n + 1);
  };

  return (
    <div className="space-y-5">
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
          ‹ {t('stats.back')}
        </motion.button>
        <h1 className="text-base font-bold uppercase tracking-wider text-content">
          {t('board.title')}
        </h1>
        <span className="chip font-mono text-[11px] tnum">{board.weekKey}</span>
      </div>

      {/* Scrollable 5+1 Tab Pill Bar */}
      <div className="ygb-vibes" role="tablist" aria-label={t('board.title')}>
        {tabs.map((item) => (
          <motion.button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.95 }}
            transition={SPRING_SNAPPY}
            onClick={() => setTab(item.id)}
            className={`ygb-vibe ${tab === item.id ? 'on' : ''}`}
          >
            <span>{item.label}</span>
          </motion.button>
        ))}
      </div>

      {/* -------------------------------------------------- Tab 1: Top tuần */}
      {tab === 'topWeek' ? (
        <SubmissionList
          items={board.topWeek}
          scoreField="weeklyScore"
          subtitle={t('board.weekDesc')}
          emptyText={t('board.empty')}
          onOpenVote={onOpenVote}
          showPodium
        />
      ) : null}

      {/* ------------------------------------------------ Tab 2: Top mọi lúc */}
      {tab === 'topAll' ? (
        <SubmissionList
          items={board.topAllTime}
          scoreField="totalScore"
          subtitle={t('board.allTimeDesc')}
          emptyText={t('board.empty')}
          onOpenVote={onOpenVote}
          showPodium
        />
      ) : null}

      {/* ------------------------------------------------- Tab 3: Danh hiệu */}
      {tab === 'ranks' ? (
        <motion.div
          key="ranks"
          variants={cardContainerVariants}
          initial="initial"
          animate="animate"
          className="space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-content-subtle">{t('board.ranksDesc')}</p>
            <button
              type="button"
              onClick={() => {
                setRanksDraft(getRanksConfig());
                setEditingRanks((v) => !v);
              }}
              className="shrink-0 text-xs font-semibold text-accent-light hover:underline"
            >
              ⚙ {t('board.configRanks')}
            </button>
          </div>

          {editingRanks ? (
            <div className="panel space-y-2.5 border-accent/45 p-3.5 text-xs">
              <p className="font-bold text-content">{t('board.configRanksTitle')}</p>
              {ranksDraft.map((r, idx) => (
                <div key={r.id || idx} className="grid grid-cols-[2.5rem_1fr_5.5rem] gap-2">
                  <input
                    type="text"
                    value={r.icon}
                    onChange={(e) => {
                      const next = [...ranksDraft];
                      next[idx] = { ...r, icon: e.target.value };
                      setRanksDraft(next);
                    }}
                    className="input px-1.5 text-center"
                  />
                  <input
                    type="text"
                    value={r.title}
                    onChange={(e) => {
                      const next = [...ranksDraft];
                      next[idx] = { ...r, title: e.target.value };
                      setRanksDraft(next);
                    }}
                    className="input text-xs"
                  />
                  <input
                    type="number"
                    min={0}
                    value={r.minPoints}
                    onChange={(e) => {
                      const next = [...ranksDraft];
                      next[idx] = { ...r, minPoints: Number(e.target.value) || 0 };
                      setRanksDraft(next);
                    }}
                    className="input font-mono text-xs tnum"
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingRanks(false)}
                  className="btn btn-ghost flex-1 text-xs"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSaveRanks}
                  className="btn btn-primary flex-1 text-xs"
                >
                  {t('board.saveRanks')}
                </button>
              </div>
            </div>
          ) : null}

          <ol className="space-y-2">
            {board.ranksBoard.map((playerItem, idx) => {
              const rankInfo = getRankForPoints(playerItem.totalPoints || 0, ranksConfig);
              return (
                <motion.li
                  key={playerItem.id}
                  variants={cardItemVariants}
                  className="panel flex items-center gap-3 px-3.5 py-3"
                >
                  <span className="w-6 text-center font-mono text-xs font-bold text-content-subtle tnum">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/40 bg-accent/15 text-lg">
                    {rankInfo.current.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-content">
                      {playerItem.displayName}{' '}
                      <span className="text-xs font-normal text-content-muted">
                        @{playerItem.socialHandle}
                      </span>
                    </p>
                    <p className="truncate text-[11px] font-semibold text-accent-lighter">
                      {rankInfo.current.title}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-base font-extrabold text-content tnum">
                      {playerItem.totalPoints || 0}
                    </span>
                    <span className="block text-[10px] text-content-subtle">
                      {t('common.points')}
                    </span>
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </motion.div>
      ) : null}

      {/* ------------------------------------------------------ Tab 4: Đấu */}
      {tab === 'battles' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-content-subtle">{t('board.battlesDesc')}</p>
            <div className="segment flex shrink-0">
              <button
                type="button"
                aria-pressed={battleFilter === 'week'}
                onClick={() => setBattleFilter('week')}
                className="segment-item px-2.5 py-1 text-[11px]"
              >
                {t('board.thisWeek')}
              </button>
              <button
                type="button"
                aria-pressed={battleFilter === 'all'}
                onClick={() => setBattleFilter('all')}
                className="segment-item px-2.5 py-1 text-[11px]"
              >
                {t('board.allTime')}
              </button>
            </div>
          </div>

          <SubmissionList
            items={board.battles}
            scoreField={battleFilter === 'week' ? 'weeklyVotes' : 'viewerVotes'}
            isBattleList
            emptyText={t('board.empty')}
            onOpenVote={onOpenVote}
          />
        </div>
      ) : null}

      {/* ------------------------------------------------------- Tab 5: Mới */}
      {tab === 'newest' ? (
        <SubmissionList
          items={board.newest}
          scoreField="totalScore"
          subtitle={t('board.newestDesc')}
          emptyText={t('board.empty')}
          onOpenVote={onOpenVote}
        />
      ) : null}

      {/* ----------------------------------------- Tab 6: Luyện tập cá nhân */}
      {tab === 'local' ? (
        <div className="space-y-4">
          <p className="text-xs text-content-subtle">{t('stats.note')}</p>
          {runs.length === 0 ? (
            <div className="panel p-8 text-center">
              <p className="text-3xl" aria-hidden="true">
                🎤
              </p>
              <p className="mt-3 text-sm text-content-muted">{t('stats.empty')}</p>
            </div>
          ) : (
            <>
              <ol className="space-y-2">
                {runs.map((run, idx) => (
                  <li
                    key={run.id}
                    className="panel flex items-center gap-3 px-3.5 py-2.5"
                  >
                    <span className="w-6 text-center font-mono text-xs font-bold text-content-subtle tnum">
                      #{idx + 1}
                    </span>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-sm font-extrabold text-accent-light">
                      {run.grade}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-content">
                        {run.handle ? `@${run.handle}` : run.beatTitle}
                      </p>
                      <p className="truncate text-[11px] text-content-muted">
                        {run.beatTitle} · {run.wordsHit}/{run.wordsShown} · {run.durationSeconds}s
                      </p>
                    </div>
                    <span className="font-mono text-base font-bold text-content tnum">
                      {run.score}
                    </span>
                  </li>
                ))}
              </ol>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={onReset}
                  className="text-xs font-medium text-danger/80 underline-offset-4 transition-colors hover:text-danger hover:underline"
                >
                  {t('stats.reset')}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SubmissionList({
  items,
  scoreField,
  subtitle = '',
  isBattleList = false,
  showPodium = false,
  emptyText,
  onOpenVote,
}) {
  const t = useT();
  const podium = showPodium ? items.slice(0, 3) : [];
  const rest = showPodium ? items.slice(3) : items;

  return (
    <motion.div
      variants={cardContainerVariants}
      initial="initial"
      animate="animate"
      className="space-y-4"
    >
      {subtitle ? <p className="text-xs text-content-subtle">{subtitle}</p> : null}

      {items.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-3xl">🎤</p>
          <p className="mt-3 text-sm text-content-muted">{emptyText}</p>
        </div>
      ) : (
        <>
          {podium.length > 0 ? (
            <div className="grid grid-cols-3 gap-2.5">
              {podium.map((sub, idx) => (
                <motion.button
                  key={sub.id}
                  type="button"
                  initial={{ opacity: 0, y: 16, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ ...SPRING_BOUNCY, delay: idx * 0.05 }}
                  onClick={() => onOpenVote?.(sub.voteCode)}
                  className={`panel flex flex-col items-center p-3 text-center transition-colors hover:border-accent/80 ${
                    idx === 0
                      ? 'border-accent/70 bg-accent/[0.08] shadow-[0_8px_28px_rgb(var(--color-accent)/0.16)]'
                      : ''
                  }`}
                >
                  <span className="text-lg" aria-hidden="true">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                  </span>
                  <span className="mt-1 font-mono text-2xl font-extrabold leading-none text-accent tnum">
                    {sub[scoreField] ?? 0}
                  </span>
                  <span className="mt-1 w-full truncate text-xs font-bold text-content">
                    @{sub.player1Handle}
                  </span>
                  <span className="w-full truncate text-[10px] text-content-subtle">
                    👥 {sub.viewerVotes} · 🤖 {sub.machineScore}
                  </span>
                </motion.button>
              ))}
            </div>
          ) : null}

          <ol className="space-y-2">
            {rest.map((sub, idx) => {
              const rankNum = showPodium ? idx + 4 : idx + 1;
              const isBattle = sub.mode === 'battle';
              return (
                <motion.li key={sub.id} variants={cardItemVariants}>
                  <button
                    type="button"
                    onClick={() => onOpenVote?.(sub.voteCode)}
                    className="panel flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:border-accent/65"
                  >
                    <span className="w-6 text-center font-mono text-xs font-bold text-content-subtle tnum">
                      #{rankNum}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-content">
                          {isBattle
                            ? `⚔️ @${sub.player1Handle} vs @${sub.player2Handle}`
                            : `@${sub.player1Handle}`}
                        </span>
                        <span className="shrink-0 rounded-full bg-surface-overlay px-2 py-0.5 font-mono text-[10px] text-content-subtle">
                          {sub.voteCode}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-content-muted">
                        {sub.beatTitle} · {sub.bars} bar ·{' '}
                        {isBattle
                          ? `${sub.p1TotalScore} vs ${sub.p2TotalScore} (👥 ${sub.viewerVotes})`
                          : `👥 ${sub.viewerVotes} + 🤖 ${sub.machineScore}`}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="font-mono text-base font-extrabold text-accent-light tnum">
                        {sub[scoreField] ?? 0}
                      </span>
                      <span className="block text-[10px] text-content-subtle">
                        {isBattleList ? t('board.votesUnit') : t('common.points')}
                      </span>
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </ol>
        </>
      )}
    </motion.div>
  );
}
