import { ArrowUpCircle, Sparkles, X } from 'lucide-react';
import { getTalentCost, TALENT_DEFS } from '../game/rules';
import type { AccountData, TalentId } from '../game/types';

interface TalentModalProps {
  account: AccountData;
  onUpgrade: (talentId: TalentId) => void;
  onClose: () => void;
}

export function TalentModal({ account, onUpgrade, onClose }: TalentModalProps) {
  return (
    <div
      className="modal-backdrop bg-slate-950/75"
      role="dialog"
      aria-modal="true"
      aria-labelledby="talent-modal-title"
    >
      <div className="modal-shell max-w-3xl rounded-xl border-2 border-indigo-400/45 bg-[#0c1422]/96 p-3.5 sm:p-6 shadow-[0_24px_80px_rgba(0,0,0,0.92)]">
        <div className="flex items-center justify-between pb-2.5 sm:pb-3 border-b border-slate-800 shrink-0">
          <div className="min-w-0 pr-2">
            <h2 id="talent-modal-title" className="text-base sm:text-lg font-bold text-indigo-300 flex items-center gap-2 truncate">
              <Sparkles className="w-5 h-5 text-sky-300 shrink-0" />
              远古遗迹 · 永久天赋树
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
              击杀精英怪、BOSS 或开启宝箱获得灵魂石，天赋加成永久生效于全账号
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-xs sm:text-sm font-bold text-sky-300 tabular-nums">
              💠 {account.soulStones} 灵魂石
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭天赋树"
              className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-2.5 flex-1 min-h-0 overflow-y-auto game-scroll pr-1 pb-5">
          {TALENT_DEFS.map((t) => {
            const lv = account.talents[t.id];
            const isMax = lv >= t.maxLevel;
            const cost = getTalentCost(t, lv);
            const canAfford = !isMax && account.soulStones >= cost;
            const pct = (lv / t.maxLevel) * 100;

            return (
              <div
                key={t.id}
                className="rounded-xl border border-slate-700/80 bg-slate-900/75 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="w-11 h-11 rounded-lg bg-indigo-950/80 border border-indigo-400/35 flex items-center justify-center text-2xl shrink-0">
                    {t.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base font-bold text-slate-100">{t.name}</span>
                      <span className="text-xs font-bold text-indigo-300 tabular-nums">
                        Lv.{lv} / {t.maxLevel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{t.desc}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-slate-950 border border-white/10 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-sky-400 origin-left"
                          style={{ transform: `scaleX(${pct / 100})` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-emerald-300 shrink-0 tabular-nums">
                        {t.perLevelLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!canAfford}
                  onClick={() => onUpgrade(t.id)}
                  className={`min-h-[42px] px-4 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap tabular-nums transition-colors ${
                    isMax
                      ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 cursor-default'
                      : canAfford
                      ? 'bg-sky-400 hover:bg-sky-300 text-slate-950 cursor-pointer shadow-[0_4px_14px_rgba(56,189,248,0.28)]'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  {isMax ? '已满级' : `升级 · 💠 ${cost}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
