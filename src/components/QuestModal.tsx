import { CheckCircle2, ScrollText, Sparkles, X } from 'lucide-react';
import {
  findQuestDefById,
  getBreakthroughQuestForTier,
  getRealmName,
  getWorldDifficultyMultiplier,
  QUEST_CATALOG,
  WORLD_META,
} from '../game/rules';
import type { ActiveQuestState, WorldId } from '../game/types';

interface QuestModalProps {
  worldId: WorldId;
  breakthroughTier: number;
  level: number;
  levelCap: number;
  atLevelCap: boolean;
  activeQuest: ActiveQuestState | null;
  completedQuestCount: number;
  onAcceptQuest: (questId: string) => void;
  onClaimReward: () => void;
  onClose: () => void;
}

export function QuestModal({
  worldId,
  breakthroughTier,
  level,
  levelCap,
  atLevelCap,
  activeQuest,
  completedQuestCount,
  onAcceptQuest,
  onClaimReward,
  onClose,
}: QuestModalProps) {
  const worldMeta = WORLD_META[worldId];
  const activeDef = activeQuest
    ? findQuestDefById(activeQuest.questId, breakthroughTier, worldId)
    : null;
  const breakthroughDef = getBreakthroughQuestForTier(breakthroughTier, worldId);
  const currentRealm = getRealmName(breakthroughTier);
  const nextRealm = getRealmName(breakthroughTier + 1);
  const nextDiff = getWorldDifficultyMultiplier(worldId, breakthroughTier + 1);
  const isBreakthroughActive = activeQuest?.questId === breakthroughDef.id;
  const isBreakthroughReadyToClaim = Boolean(isBreakthroughActive && activeQuest?.completed);

  return (
    <div
      className="modal-backdrop bg-slate-950/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quest-modal-title"
    >
      <div className="modal-shell max-w-[560px] rounded-2xl bg-[#0c1420]/96 border-2 border-teal-400/35 p-3.5 sm:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.85)]">
        <div className="shrink-0">
          <div className="flex items-center justify-between mb-1">
            <div className="w-10" />
            <h2
              id="quest-modal-title"
              className="text-base sm:text-lg font-bold tracking-widest text-teal-300 text-center"
            >
              📜 {worldMeta.elderName} · 悬赏与破境
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭悬赏窗口"
              className="w-10 h-10 rounded-lg bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-center text-[11px] sm:text-xs text-slate-400 mb-3">
            当前境界【{currentRealm}】· 等级 {level}/{levelCap} · 已完成 {completedQuestCount} 次委托
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto game-scroll pr-1 pb-5 space-y-3">
          {/* Active Quest Banner */}
          {activeQuest && activeDef ? (
            <div
              className={`rounded-xl border p-3.5 sm:p-4 ${
                activeDef.isBreakthrough
                  ? 'border-pink-400/55 bg-pink-950/25'
                  : 'border-teal-500/40 bg-teal-950/25'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-sm text-slate-100">
                  {activeDef.isBreakthrough ? (
                    <Sparkles className="w-4 h-4 text-pink-300 shrink-0" />
                  ) : (
                    <ScrollText className="w-4 h-4 text-teal-300 shrink-0" />
                  )}
                  <span>
                    {activeDef.isBreakthrough ? '当前破境试炼' : '当前悬赏'}：{activeDef.title}
                  </span>
                </div>
                <span
                  className={`text-sm font-bold tabular-nums shrink-0 ${
                    activeQuest.completed ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  {activeQuest.progress} / {activeDef.target}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">{activeDef.desc}</p>
              <div className="mt-2.5 h-2 rounded-full bg-slate-900 overflow-hidden border border-white/10">
                <div
                  className={`h-full transition-all ${
                    activeQuest.completed
                      ? 'bg-emerald-400'
                      : activeDef.isBreakthrough
                      ? 'bg-pink-400'
                      : 'bg-teal-400'
                  }`}
                  style={{
                    width: `${Math.min(100, (activeQuest.progress / activeDef.target) * 100)}%`,
                  }}
                />
              </div>

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-300 tabular-nums">
                  奖励：🪙 {activeDef.rewardGold} 金币 · ✨ {activeDef.rewardExp} EXP
                </span>
                {activeQuest.completed ? (
                  <button
                    type="button"
                    data-testid="claim-quest-btn"
                    onClick={onClaimReward}
                    className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shrink-0 ${
                      activeDef.isBreakthrough
                        ? 'bg-gradient-to-r from-pink-400 to-amber-300 hover:brightness-110 text-slate-950'
                        : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {activeDef.isBreakthrough ? `完成突破 · 晋升${nextRealm}` : '领取悬赏奖励'}
                  </button>
                ) : (
                  <span
                    className={`font-medium shrink-0 ${
                      activeDef.isBreakthrough ? 'text-pink-300' : 'text-teal-300'
                    }`}
                  >
                    进行中
                  </span>
                )}
              </div>
            </div>
          ) : null}

          {/* Realm Breakthrough Section */}
          <div
            data-testid="breakthrough-section"
            className={`rounded-xl border-2 p-3.5 sm:p-4 ${
              atLevelCap
                ? 'border-pink-400/70 bg-gradient-to-br from-pink-950/45 via-fuchsia-950/30 to-slate-900/80 shadow-[0_0_24px_rgba(244,114,182,0.16)]'
                : 'border-fuchsia-500/25 bg-slate-900/60'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 text-sm font-bold text-pink-200">
                <Sparkles className="w-4 h-4 text-pink-400 shrink-0" />
                <span>境界突破 · {currentRealm} → {nextRealm}</span>
              </div>
              <span className="text-[11px] font-bold tabular-nums px-2 py-0.5 rounded bg-pink-500/20 text-pink-200 border border-pink-400/35">
                上限 Lv.{levelCap} → Lv.{levelCap + 10}
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{breakthroughDef.desc}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-amber-300/95 tabular-nums">
              <span>突破收益：基础生命+35 · 攻+4 · 防+2</span>
              <span>世界难度：{worldMeta.name} 升至 ×{nextDiff}</span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400 tabular-nums">
                试炼报酬：🪙 {breakthroughDef.rewardGold} · ✨ {breakthroughDef.rewardExp} EXP
              </span>
              {isBreakthroughReadyToClaim ? (
                <button
                  type="button"
                  onClick={onClaimReward}
                  className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-pink-400 to-amber-300 hover:brightness-110 text-slate-950 text-xs font-black cursor-pointer shrink-0"
                >
                  完成突破！
                </button>
              ) : isBreakthroughActive ? (
                <span className="px-3 py-1.5 rounded-lg bg-pink-950/70 border border-pink-400/40 text-pink-200 text-xs font-bold shrink-0">
                  试炼中 ({activeQuest?.progress ?? 0}/{breakthroughDef.target})
                </span>
              ) : atLevelCap ? (
                <button
                  type="button"
                  data-testid="accept-breakthrough-btn"
                  onClick={() => onAcceptQuest(breakthroughDef.id)}
                  className="px-3.5 py-2 rounded-lg bg-pink-500 hover:bg-pink-400 text-white text-xs font-bold cursor-pointer shrink-0 shadow-md"
                >
                  {activeQuest ? '切换接取突破试炼' : '接取突破试炼'}
                </button>
              ) : (
                <span className="px-3 py-1.5 rounded-lg bg-slate-800/90 text-slate-400 text-xs font-semibold shrink-0">
                  需达到 Lv.{levelCap} 解锁
                </span>
              )}
            </div>
          </div>

          {/* Standard Bounties */}
          <div className="space-y-2.5">
            {QUEST_CATALOG.map((q) => {
              const isCurrent = activeQuest?.questId === q.id;
              const disabled = Boolean(activeQuest);
              return (
                <div
                  key={q.id}
                  className={`rounded-xl border p-3 sm:p-3.5 flex items-center justify-between gap-3 ${
                    isCurrent
                      ? 'border-teal-400/50 bg-teal-900/20'
                      : 'border-white/10 bg-white/[0.035]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-100">{q.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{q.desc}</div>
                    <div className="text-xs text-amber-300/90 mt-1 tabular-nums">
                      报酬：🪙 {q.rewardGold} 金币 · ✨ {q.rewardExp} 经验
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onAcceptQuest(q.id)}
                    className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors shrink-0 ${
                      disabled
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-teal-400 hover:bg-teal-300 text-slate-950 cursor-pointer'
                    }`}
                  >
                    {isCurrent ? '已接取' : '接取任务'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
