import { RefreshCw, Shield, X } from 'lucide-react';
import {
  canClassEquipItem,
  CLASS_DEFS,
  RARITY_META,
  RESTRICTION_LABEL,
  SLOT_LABEL,
  SUBTYPE_LABEL,
} from '../game/rules';
import type { ClassId, GearItem } from '../game/types';

interface ArmorShopModalProps {
  gold: number;
  classId: ClassId;
  stock: GearItem[];
  onBuy: (itemId: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}

function summarizeAffixes(item: GearItem): string[] {
  const res: string[] = [];
  if (item.affixes.atk) res.push(`攻+${item.affixes.atk}`);
  if (item.affixes.def) res.push(`防+${item.affixes.def}`);
  if (item.affixes.maxHp) res.push(`血+${item.affixes.maxHp}`);
  if (item.affixes.maxMp) res.push(`蓝+${item.affixes.maxMp}`);
  if (item.affixes.attackSpeed) res.push(`攻速+${item.affixes.attackSpeed}%`);
  if (item.affixes.critChance) res.push(`暴+${item.affixes.critChance}%`);
  if (item.affixes.critDmgBonus) res.push(`暴伤+${item.affixes.critDmgBonus}%`);
  if (item.affixes.mpRegen) res.push(`回蓝+${item.affixes.mpRegen}/s`);
  if (item.affixes.speed) res.push(`移速+${item.affixes.speed}`);
  return res;
}

export function ArmorShopModal({
  gold,
  classId,
  stock,
  onBuy,
  onRefresh,
  onClose,
}: ArmorShopModalProps) {
  const cls = CLASS_DEFS[classId];

  return (
    <div
      className="modal-backdrop bg-slate-950/65"
      role="dialog"
      aria-modal="true"
      aria-labelledby="armor-shop-modal-title"
    >
      <div className="modal-shell max-w-3xl rounded-2xl bg-[#0c1420]/96 border-2 border-sky-400/40 p-3.5 sm:p-6 shadow-[0_24px_70px_rgba(0,0,0,0.92)]">
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 shrink-0 gap-2">
          <div className="min-w-0">
            <h2
              id="armor-shop-modal-title"
              className="text-base sm:text-lg font-bold tracking-wider text-sky-300 flex items-center gap-2 truncate"
            >
              <Shield className="w-5 h-5 shrink-0" />
              主城军械商人 · 职业兵器与护甲
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
              当前职业：<strong className="text-slate-100">{cls.name}</strong> · 装备需满足对应职业限制方可穿戴
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="refresh-armor-shop-btn"
              onClick={onRefresh}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-sky-400/35 text-xs font-semibold text-sky-300 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              换一批
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭军械商人"
              className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex-1 min-h-0 overflow-y-auto game-scroll pr-1 pb-5">
          {stock.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              货架已售罄，请点击右上角【换一批】补充军械库存。
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {stock.map((item) => {
                const rm = RARITY_META[item.rarity];
                const price = Math.max(45, Math.round(item.sellValue * 2.4));
                const canAfford = gold >= price;
                const compatible = canClassEquipItem(classId, item);
                const subtypeLabel = item.weaponSubtype ? SUBTYPE_LABEL[item.weaponSubtype] : SLOT_LABEL[item.slot];
                const reqLabel = item.requiredCategory ? RESTRICTION_LABEL[item.requiredCategory] : '全职业';

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border p-3 flex flex-col justify-between gap-2"
                    style={{ borderColor: rm.border, backgroundColor: rm.bg }}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs sm:text-sm font-bold truncate" style={{ color: rm.color }}>
                          [{rm.label}] {item.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900/80 text-slate-300 shrink-0">
                          {subtypeLabel} · Lv.{item.level}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                        <span
                          className={`px-1.5 py-0.5 rounded font-semibold ${
                            compatible
                              ? 'bg-emerald-950/75 text-emerald-300 border border-emerald-500/35'
                              : 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                          }`}
                        >
                          {compatible ? `✓ ${reqLabel} · 可装配` : `✕ 限制：${reqLabel}`}
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-slate-200 tabular-nums">
                        {summarizeAffixes(item).map((line) => (
                          <span key={line} className="px-1.5 py-0.5 rounded bg-slate-950/55">
                            {line}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!canAfford}
                      onClick={() => onBuy(item.id)}
                      className={`w-full min-h-[42px] sm:min-h-[38px] py-1.5 rounded-lg text-xs font-bold tabular-nums transition-colors ${
                        canAfford
                          ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer'
                          : 'bg-slate-800/80 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {canAfford ? `🪙 ${price} 购买` : `🪙 ${price} (金币不足)`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-2.5 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>购买后将直接放入装备背包（ESC / F 关闭）</span>
          <strong className="text-base text-amber-400 tabular-nums">🪙 {gold}</strong>
        </div>
      </div>
    </div>
  );
}
