import { useState } from 'react';
import { BookOpen, CheckCircle2, Trophy, X } from 'lucide-react';
import {
  ACHIEVEMENT_DEFS,
  BESTIARY_MONSTERS,
  getAchievementMetricValue,
} from '../game/rules';
import type { AccountData } from '../game/types';

interface BestiaryModalProps {
  account: AccountData;
  onClose: () => void;
}

type BestiaryFilter = 'all' | 'world1' | 'world2' | 'city_tower' | 'boss';

export function BestiaryModal({ account, onClose }: BestiaryModalProps) {
  const [tab, setTab] = useState<'bestiary' | 'achievements'>('bestiary');
  const [filter, setFilter] = useState<BestiaryFilter>('all');
  const unlockedSet = new Set(account.unlockedAchievements);

  const totalKills = BESTIARY_MONSTERS.reduce(
    (acc, m) => acc + (account.bestiary[m.name] ?? 0),
    0
  );

  const filteredMonsters = BESTIARY_MONSTERS.filter((m) => {
    if (filter === 'all') return true;
    if (filter === 'boss') return m.tier.includes('BOSS');
    if (filter === 'world1') return m.tier.includes('第一世界') || m.tier.includes('双界');
    if (filter === 'world2') return m.tier.includes('第二世界') || m.tier.includes('双界');
    if (filter === 'city_tower') return m.tier.includes('大城市') || m.tier.includes('试炼之塔');
    return true;
  });

  return (
    <div
      className="modal-backdrop bg-slate-950/75"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bestiary-modal-title"
    >
      <div className="modal-shell max-w-4xl rounded-xl border-2 border-amber-400/40 bg-[#0c1422]/96 p-3.5 sm:p-6 shadow-[0_24px_80px_rgba(0,0,0,0.92)]">
        <div className="flex items-center justify-between pb-2.5 sm:pb-3 border-b border-slate-800 shrink-0">
          <div className="min-w-0 pr-2">
            <h2 id="bestiary-modal-title" className="text-base sm:text-lg font-bold text-amber-300 flex items-center gap-2 truncate">
              <Trophy className="w-5 h-5 shrink-0" />
              冒险图鉴与里程碑成就 ({BESTIARY_MONSTERS.length} 种魔物)
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 tabular-nums truncate">
              累计狩猎 {totalKills} 只魔物 · 已解锁 {account.unlockedAchievements.length}/{ACHIEVEMENT_DEFS.length} 项成就（永久生效）
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭图鉴与成就"
            className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Tabs & Bestiary Category Filter */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 p-1 bg-slate-900 rounded-lg w-fit border border-slate-800">
            <button
              type="button"
              onClick={() => setTab('bestiary')}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'bestiary'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              怪物图鉴 ({BESTIARY_MONSTERS.filter((m) => (account.bestiary[m.name] ?? 0) > 0).length}/{BESTIARY_MONSTERS.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('achievements')}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'achievements'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Trophy className="w-3.5 h-3.5" />
              成就进度 ({account.unlockedAchievements.length}/{ACHIEVEMENT_DEFS.length})
            </button>
          </div>

          {tab === 'bestiary' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  { id: 'all', label: `全部 (${BESTIARY_MONSTERS.length})` },
                  { id: 'world1', label: '第一世界' },
                  { id: 'world2', label: '第二世界' },
                  { id: 'city_tower', label: '王城与试炼塔' },
                  { id: 'boss', label: '首领 BOSS' },
                ] as { id: BestiaryFilter; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`min-h-[34px] px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer border transition-colors ${
                    filter === f.id
                      ? 'bg-sky-400/20 border-sky-400/60 text-sky-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex-1 min-h-0 overflow-y-auto game-scroll pr-1 pb-5">
          {tab === 'bestiary' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredMonsters.map((m) => {
                const kills = account.bestiary[m.name] ?? 0;
                const discovered = kills > 0;
                return (
                  <div
                    key={m.name}
                    className={`rounded-xl border p-3.5 flex items-start gap-3 ${
                      discovered
                        ? 'border-slate-700 bg-slate-900/80'
                        : 'border-slate-800/70 bg-slate-900/35 opacity-65'
                    }`}
                  >
                    <div
                      className="w-11 h-11 rounded-full border-2 border-white/25 shrink-0 flex items-center justify-center shadow-inner"
                      style={{
                        backgroundColor: discovered ? m.color : '#1e293b',
                      }}
                    >
                      <span className="text-xs font-black text-slate-950">
                        {discovered ? m.name.slice(0, 1) : '?'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-100">
                          {discovered ? m.name : '未知魔物'}
                        </span>
                        <span className="text-xs text-slate-400 tabular-nums">
                          {m.tier} · 击杀 <strong className="text-amber-300">{kills}</strong>
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {discovered ? m.desc : '在幻想大陆荒野中遭遇并击败该魔物以解锁档案。'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ACHIEVEMENT_DEFS.map((ach) => {
                const unlocked = unlockedSet.has(ach.id);
                const cur = Math.min(ach.target, getAchievementMetricValue(account.bestiary, ach.metric));
                const pct = Math.min(100, (cur / ach.target) * 100);
                return (
                  <div
                    key={ach.id}
                    className={`rounded-xl border p-3.5 flex flex-col justify-between gap-2.5 ${
                      unlocked
                        ? 'border-emerald-500/50 bg-emerald-950/20'
                        : 'border-slate-700/70 bg-slate-900/65'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="w-10 h-10 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center text-xl shrink-0">
                        {ach.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                            {ach.title}
                            {unlocked && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                          </span>
                          <span className="text-xs font-bold text-sky-300 tabular-nums shrink-0">
                            💠 +{ach.rewardSoulStones}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{ach.desc}</p>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1 tabular-nums">
                        <span className="text-emerald-300 font-semibold">
                          永久加成：{ach.bonusLabel}
                        </span>
                        <span className="text-slate-400">
                          {cur}/{ach.target}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-950 overflow-hidden border border-white/10">
                        <div
                          className={`h-full origin-left ${
                            unlocked ? 'bg-emerald-400' : 'bg-amber-400'
                          }`}
                          style={{ transform: `scaleX(${pct / 100})` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
