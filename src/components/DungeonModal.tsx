import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  Lock,
  LogOut,
  ShieldCheck,
  Skull,
  Sparkles,
  Swords,
  Users,
  X,
} from 'lucide-react';
import {
  canEnterDungeonFloor,
  getDungeonFloorDef,
  getDungeonPartyDifficultyMultiplier,
  MAX_MONSTER_LEVEL,
  RARITY_META,
} from '../game/rules';
import type { PartyState, PlayMode } from '../game/types';

interface DungeonModalProps {
  playMode: PlayMode;
  party: PartyState | null;
  roomMemberCount?: number;
  currentFloor: number | null;
  highestFloor: number;
  playerLevel: number;
  inDungeon: boolean;
  dungeonCleared?: boolean;
  onEnterFloor: (floor: number) => void;
  onExitDungeon: () => void;
  onClose: () => void;
}

const PAGE_SIZE = 12;

export function DungeonModal({
  playMode,
  party,
  roomMemberCount = 1,
  currentFloor,
  highestFloor,
  playerLevel,
  inDungeon,
  dungeonCleared = false,
  onEnterFloor,
  onExitDungeon,
  onClose,
}: DungeonModalProps) {
  const isOnline = playMode === 'online';
  const participantCount = isOnline
    ? Math.max(1, party?.members.length ?? 1, roomMemberCount)
    : 1;
  const partyDiff = getDungeonPartyDifficultyMultiplier(participantCount);
  const maxUnlockedFloor = Math.max(1, Math.floor(Math.max(0, highestFloor)) + 1);
  const focusFloor = inDungeon && currentFloor ? currentFloor : maxUnlockedFloor;
  const initialPage = Math.max(0, Math.floor((focusFloor - 1) / PAGE_SIZE));

  const [page, setPage] = useState<number>(initialPage);
  const [jumpInput, setJumpInput] = useState<string>(String(focusFloor));

  useEffect(() => {
    setPage(Math.max(0, Math.floor((focusFloor - 1) / PAGE_SIZE)));
    setJumpInput(String(focusFloor));
  }, [focusFloor]);

  const startFloor = page * PAGE_SIZE + 1;
  const floorsOnPage = Array.from({ length: PAGE_SIZE }, (_, idx) =>
    getDungeonFloorDef(startFloor + idx)
  );

  const handleJump = () => {
    const parsed = Math.floor(Number(jumpInput));
    if (!Number.isFinite(parsed) || parsed < 1) return;
    setPage(Math.floor((parsed - 1) / PAGE_SIZE));
  };

  const frontierFloor =
    inDungeon && dungeonCleared && currentFloor ? currentFloor + 1 : maxUnlockedFloor;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-2 sm:p-4 safe-inset-pad">
      <div
        data-testid="dungeon-modal"
        className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#101824] border-2 border-amber-400/55 rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3 sm:px-5 sm:py-4 bg-gradient-to-r from-[#1c2334] via-[#172133] to-[#1a1829] border-b border-amber-400/25 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl">🗼</span>
              <h2 className="text-base sm:text-lg font-extrabold text-amber-200 tracking-wide">
                试炼之塔 · 无尽攀登殿堂 (1F – ∞)
              </h2>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                  isOnline
                    ? participantCount > 1
                      ? 'bg-rose-950/75 border-rose-400/55 text-rose-200'
                      : 'bg-emerald-950/70 border-emerald-400/50 text-emerald-300'
                    : 'bg-slate-900/90 border-slate-600 text-slate-300'
                }`}
              >
                {isOnline
                  ? participantCount > 1
                    ? `多人副本 (${participantCount}人) · 难度 ×${partyDiff.difficultyMult}`
                    : '联机模式 · 1人常规难度'
                  : '单机模式 · 逐层解锁攀登'}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
              必须从 1F 开始逐层击败首领解锁北侧传送门进入下一层（无上限，怪物最高 Lv.{MAX_MONSTER_LEVEL}）；多人进入难度直接翻倍递增，塔内战败不掉等级！
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {inDungeon && (
              <button
                type="button"
                data-testid="dungeon-exit-btn"
                onClick={onExitDungeon}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-900/70 hover:bg-rose-800 border border-rose-400/60 text-xs font-bold text-rose-100 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                脱离副本
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-600/60 text-slate-300 cursor-pointer"
              aria-label="关闭副本界面"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Summary & Frontier Jump Strip */}
        <div className="px-4 py-2.5 sm:px-5 bg-slate-950/75 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-3 text-slate-300">
            <span>
              当前等级：<strong className="text-cyan-300">Lv.{playerLevel}</strong>
            </span>
            <span>
              历史最高通关：
              <strong className="text-amber-300">
                {highestFloor > 0 ? `${highestFloor}F` : '暂未通关'}
              </strong>
            </span>
            <span>
              已解锁前沿：
              <strong className="text-emerald-300">{maxUnlockedFloor}F</strong>
            </span>
            {inDungeon && currentFloor && (
              <span className="text-emerald-300 font-bold">
                正在挑战：{currentFloor}F{dungeonCleared ? ' (已通关)' : ''}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300/95 bg-emerald-950/60 border border-emerald-400/35 px-2 py-0.5 rounded">
              <ShieldCheck className="w-3.5 h-3.5" />
              副本死亡不掉等级
            </span>
            {participantCount > 1 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-rose-200 bg-rose-950/60 border border-rose-400/40 px-2 py-0.5 rounded">
                <Users className="w-3.5 h-3.5" />
                多人难度 ×{partyDiff.difficultyMult} · 奖励 ×{partyDiff.rewardMult}
              </span>
            )}
            <button
              type="button"
              data-testid="enter-frontier-floor-btn"
              onClick={() => onEnterFloor(frontierFloor)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" />
              挑战前沿 {frontierFloor}F
            </button>
          </div>
        </div>

        {/* Pagination + Direct Floor Jump Controls */}
        <div className="px-4 py-2 sm:px-5 bg-slate-900/75 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page <= 0}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-600/60 text-slate-200 flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              上一页
            </button>
            <span className="px-2 font-mono font-bold text-amber-200">
              {startFloor}F – {startFloor + PAGE_SIZE - 1}F
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600/60 text-slate-200 flex items-center gap-1 cursor-pointer"
            >
              下一页
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                setPage(Math.max(0, Math.floor((maxUnlockedFloor - 1) / PAGE_SIZE)))
              }
              className="px-2.5 py-1 rounded bg-cyan-950/75 hover:bg-cyan-900 border border-cyan-400/45 text-cyan-200 font-semibold cursor-pointer"
            >
              定位前沿层
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor="dungeon-jump-input" className="text-slate-400 text-[11px]">
              跳转层数
            </label>
            <input
              id="dungeon-jump-input"
              type="number"
              min={1}
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJump();
              }}
              className="w-24 px-2 py-1 rounded bg-slate-950 border border-slate-600/80 text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-400"
            />
            <button
              type="button"
              onClick={handleJump}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600/70 text-slate-200 font-semibold cursor-pointer"
            >
              定位
            </button>
          </div>
        </div>

        {/* Floors Grid */}
        <div className="flex-1 overflow-y-auto game-scroll p-3 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {floorsOnPage.map((df) => {
            const gate = canEnterDungeonFloor(df.floor, highestFloor);
            const cleared = df.floor <= highestFloor;
            const isCurrent = inDungeon && currentFloor === df.floor;
            const isMilestone = df.floor % 5 === 0;
            const rarityMeta = RARITY_META[df.guaranteedRarity];
            const underRecommended = playerLevel < df.recommendedLv;
            const scaledExp = Math.round(df.rewardExp * partyDiff.rewardMult);
            const scaledGold = Math.round(df.rewardGold * partyDiff.rewardMult);

            return (
              <div
                key={df.floor}
                data-testid={`dungeon-floor-${df.floor}`}
                className={`rounded-xl border p-3.5 flex flex-col justify-between gap-2.5 transition-all ${
                  isCurrent
                    ? 'bg-emerald-950/45 border-emerald-400/80 shadow-lg shadow-emerald-950/40'
                    : isMilestone
                    ? 'bg-gradient-to-br from-[#231526] to-[#131824] border-rose-400/45'
                    : cleared
                    ? 'bg-slate-900/80 border-amber-400/40'
                    : 'bg-slate-900/65 border-slate-700/70'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-xs font-extrabold ${
                          isMilestone
                            ? 'bg-rose-500/25 text-rose-200 border border-rose-400/50'
                            : 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                        }`}
                      >
                        {df.floor}F
                      </span>
                      <span className="font-bold text-sm text-white truncate">
                        {df.bossName}
                      </span>
                    </div>
                    {cleared && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shrink-0">
                        已通关
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="truncate" style={{ color: df.bossColor }}>
                      {df.bossTitle}
                    </span>
                    <span
                      className={`font-semibold shrink-0 ${
                        underRecommended ? 'text-amber-300' : 'text-slate-300'
                      }`}
                    >
                      怪物 Lv.{df.recommendedLv}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px]">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-sky-950/60 border-sky-400/35 text-sky-200">
                      <Swords className="w-3 h-3" />
                      {participantCount > 1
                        ? `${participantCount}人难度 ×${partyDiff.difficultyMult}`
                        : isMilestone
                        ? '守门领主'
                        : '单人/多人'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800/90 border border-white/10 text-slate-300">
                      守卫 ×{df.mobCount}
                    </span>
                  </div>

                  {/* Rewards */}
                  <div className="rounded-lg bg-black/35 border border-white/8 p-2 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>通关奖励</span>
                      <span className="font-mono text-amber-300">
                        {scaledExp} EXP · {scaledGold} 金
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span
                        className="font-semibold"
                        style={{ color: rarityMeta.color }}
                      >
                        必掉 [{rarityMeta.label}] 装备
                      </span>
                      <span className="inline-flex items-center gap-1 text-purple-300">
                        <Sparkles className="w-3 h-3" />
                        技能书 {Math.round(df.skillBookDropChance * 100)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                {gate.allowed ? (
                  <button
                    type="button"
                    data-testid={`enter-dungeon-floor-${df.floor}`}
                    onClick={() => onEnterFloor(df.floor)}
                    className={`w-full py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      isCurrent
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : isMilestone
                        ? 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white'
                        : 'bg-amber-600 hover:bg-amber-500 text-slate-950'
                    }`}
                  >
                    <Skull className="w-3.5 h-3.5" />
                    {isCurrent ? '重新挑战本层' : `进入挑战 ${df.floor}F`}
                  </button>
                ) : (
                  <div
                    className="w-full py-2 px-2.5 rounded-lg bg-slate-950/90 border border-slate-700/80 text-slate-400 text-[11px] flex items-center gap-1.5"
                    title={gate.reason}
                  >
                    <Lock className="w-3.5 h-3.5 shrink-0 text-amber-400/80" />
                    <span className="truncate">
                      需先击败 {df.floor - 1}F 首领解锁
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
