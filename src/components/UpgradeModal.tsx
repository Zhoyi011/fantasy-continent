import { useMemo, useState } from 'react';
import { ArrowUpCircle, Sparkles, X, Zap } from 'lucide-react';
import {
  getGearUpgradeCost,
  hasEnoughMaterials,
  MATERIAL_MAP,
  MAX_ENHANCE_LV,
  RARITY_META,
  SLOT_LABEL,
  upgradeGearItem,
} from '../game/rules';
import type { EquippedGear, GearItem, GearSlot, MaterialBag } from '../game/types';

interface UpgradeModalProps {
  gold: number;
  equipped: EquippedGear;
  inventory: GearItem[];
  materials: MaterialBag;
  onUpgrade: (itemId: string, source: 'equipped' | 'inventory') => void;
  onUpgradeBatch: (itemId: string, source: 'equipped' | 'inventory', steps: number) => void;
  onClose: () => void;
}

interface CandidateGear {
  item: GearItem;
  source: 'equipped' | 'inventory';
  slot?: GearSlot;
}

function collectAffixEntries(item: GearItem): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (item.affixes.atk) out.push({ label: '攻击', value: `+${item.affixes.atk}` });
  if (item.affixes.def) out.push({ label: '防御', value: `+${item.affixes.def}` });
  if (item.affixes.maxHp) out.push({ label: '生命', value: `+${item.affixes.maxHp}` });
  if (item.affixes.maxMp) out.push({ label: '法力', value: `+${item.affixes.maxMp}` });
  if (item.affixes.attackSpeed) out.push({ label: '攻速', value: `+${item.affixes.attackSpeed}%` });
  if (item.affixes.critChance) out.push({ label: '暴击', value: `+${item.affixes.critChance}%` });
  if (item.affixes.critDmgBonus) out.push({ label: '暴伤', value: `+${item.affixes.critDmgBonus}%` });
  if (item.affixes.mpRegen) out.push({ label: '回蓝', value: `+${item.affixes.mpRegen}/s` });
  if (item.affixes.speed) out.push({ label: '移速', value: `+${item.affixes.speed}` });
  if (item.affixes.lifeOnKill) out.push({ label: '吸血', value: `+${item.affixes.lifeOnKill}` });
  return out;
}

export function UpgradeModal({
  gold,
  equipped,
  inventory,
  materials,
  onUpgrade,
  onUpgradeBatch,
  onClose,
}: UpgradeModalProps) {
  const candidates = useMemo<CandidateGear[]>(() => {
    const list: CandidateGear[] = [];
    (['weapon', 'armor', 'accessory'] as GearSlot[]).forEach((slot) => {
      const eq = equipped[slot];
      if (eq) list.push({ item: eq, source: 'equipped', slot });
    });
    inventory.forEach((item) => {
      list.push({ item, source: 'inventory' });
    });
    return list;
  }, [equipped, inventory]);

  const [selectedKey, setSelectedKey] = useState<string>(() =>
    candidates[0] ? `${candidates[0].source}:${candidates[0].item.id}` : ''
  );

  const selected =
    candidates.find((c) => `${c.source}:${c.item.id}` === selectedKey) ?? candidates[0] ?? null;

  const cost = selected ? getGearUpgradeCost(selected.item) : null;
  const preview = selected && cost?.canUpgrade ? upgradeGearItem(selected.item) : null;
  const matsOk = cost ? hasEnoughMaterials(materials, cost.materials) : false;
  const goldOk = cost ? gold >= cost.gold : false;
  const canDoUpgrade = Boolean(selected && cost?.canUpgrade && matsOk && goldOk);

  return (
    <div
      className="modal-backdrop bg-slate-950/65"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
    >
      <div className="modal-shell max-w-4xl rounded-2xl bg-[#0c1420]/96 border-2 border-purple-400/40 p-3.5 sm:p-6 shadow-[0_24px_70px_rgba(0,0,0,0.92)]">
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 shrink-0 gap-2">
          <div className="min-w-0">
            <h2
              id="upgrade-modal-title"
              className="text-base sm:text-lg font-bold tracking-wider text-purple-300 flex items-center gap-2 truncate"
            >
              <Sparkles className="w-5 h-5 shrink-0" />
              主城百锻强化台 · 装备升级 (+1 ~ +{MAX_ENHANCE_LV})
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
              消耗矿石、魔晶与龙鳞全面跃升词缀，支持一键连升（最高 +{MAX_ENHANCE_LV}）
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-xs sm:text-sm font-bold text-amber-400 tabular-nums">
              🪙 {gold}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭装备强化台"
              className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {candidates.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">
            当前没有可强化的装备，请先从军械商人购买、铁匠锻造或野外打怪获取装备。
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-12 gap-3 flex-1 min-h-0 max-sm:overflow-y-auto max-sm:game-scroll max-sm:pb-5 sm:overflow-hidden">
            {/* Left Gear List */}
            <div className="sm:col-span-5 flex flex-col gap-2 sm:min-h-0 sm:overflow-y-auto sm:game-scroll sm:pr-1 pb-1">
              {candidates.map((cand) => {
                const key = `${cand.source}:${cand.item.id}`;
                const active = selected && `${selected.source}:${selected.item.id}` === key;
                const rm = RARITY_META[cand.item.rarity];
                const lv = cand.item.enhanceLv ?? 0;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={`w-full text-left rounded-xl p-2.5 border transition-all cursor-pointer ${
                      active
                        ? 'border-purple-400 bg-purple-950/35'
                        : 'border-slate-700/70 bg-slate-900/65 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold truncate" style={{ color: rm.color }}>
                        [{rm.label}] {cand.item.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950/80 text-slate-300 shrink-0 tabular-nums">
                        {cand.source === 'equipped' ? '已穿戴' : '背包'} · +{lv}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {SLOT_LABEL[cand.item.slot]} · 需要等级 Lv.{cand.item.level}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Upgrade Inspector */}
            {selected && cost && (
              <div className="sm:col-span-7 rounded-xl border border-slate-700/80 bg-slate-900/75 p-3.5 sm:p-4 flex flex-col justify-between gap-3 sm:min-h-0 sm:overflow-y-auto sm:game-scroll">
                <div>
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
                    <div>
                      <div
                        className="text-sm sm:text-base font-bold"
                        style={{ color: RARITY_META[selected.item.rarity].color }}
                      >
                        {selected.item.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        当前强化等级：+{selected.item.enhanceLv ?? 0} / +{MAX_ENHANCE_LV}
                      </div>
                    </div>
                    {cost.canUpgrade && (
                      <span className="px-2.5 py-1 rounded-lg bg-purple-500/20 border border-purple-400/40 text-purple-200 text-xs font-bold tabular-nums">
                        下一级 +{cost.nextLv}
                      </span>
                    )}
                  </div>

                  {/* Current vs Preview Affixes */}
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-2.5">
                      <div className="text-[11px] font-semibold text-slate-400 mb-1.5">当前属性</div>
                      <div className="space-y-1 text-xs tabular-nums">
                        {collectAffixEntries(selected.item).map((e) => (
                          <div key={e.label} className="flex justify-between text-slate-200">
                            <span>{e.label}</span>
                            <strong>{e.value}</strong>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg bg-purple-950/25 border border-purple-400/35 p-2.5">
                      <div className="text-[11px] font-semibold text-purple-300 mb-1.5">
                        {preview ? `强化至 +${cost.nextLv} 预览` : '已达最高强化等级'}
                      </div>
                      <div className="space-y-1 text-xs tabular-nums">
                        {preview ? (
                          collectAffixEntries(preview).map((e) => (
                            <div key={e.label} className="flex justify-between text-emerald-300">
                              <span>{e.label}</span>
                              <strong>{e.value}</strong>
                            </div>
                          ))
                        ) : (
                          <div className="text-amber-300 font-semibold">✨ 神器已达百锻巅峰 +{MAX_ENHANCE_LV}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Cost & Materials */}
                  {cost.canUpgrade && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800">
                      <div className="text-[11px] font-semibold text-slate-400 mb-1.5">强化所需材料</div>
                      <div className="flex flex-wrap gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs tabular-nums border ${
                            goldOk
                              ? 'bg-amber-950/50 border-amber-500/40 text-amber-300'
                              : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                          }`}
                        >
                          🪙 {gold}/{cost.gold}
                        </span>
                        {cost.materials.map((req) => {
                          const def = MATERIAL_MAP[req.id];
                          const owned = materials[req.id] ?? 0;
                          const ok = owned >= req.count;
                          return (
                            <span
                              key={req.id}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs tabular-nums border ${
                                ok
                                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                                  : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                              }`}
                            >
                              <span>{def?.icon}</span>
                              <span>{def?.name}</span>
                              <strong>
                                {owned}/{req.count}
                              </strong>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    data-testid="confirm-upgrade-btn"
                    disabled={!canDoUpgrade}
                    onClick={() => onUpgrade(selected.item.id, selected.source)}
                    className={`w-full min-h-[44px] py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors ${
                      canDoUpgrade
                        ? 'bg-gradient-to-r from-purple-500 to-fuchsia-400 hover:brightness-110 text-white cursor-pointer'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <ArrowUpCircle className="w-4 h-4" />
                    {!cost.canUpgrade
                      ? `已达最高等级 +${MAX_ENHANCE_LV}`
                      : canDoUpgrade
                      ? `强化 +1（升至 +${cost.nextLv}）`
                      : !goldOk
                      ? '金币不足'
                      : '原料不足'}
                  </button>

                  {cost.canUpgrade && (
                    <div className="grid grid-cols-3 gap-2">
                      {[5, 10, 100].map((steps) => (
                        <button
                          key={steps}
                          type="button"
                          data-testid={`batch-upgrade-${steps}`}
                          disabled={!canDoUpgrade}
                          onClick={() => onUpgradeBatch(selected.item.id, selected.source, steps)}
                          className={`min-h-[38px] py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border transition-colors ${
                            canDoUpgrade
                              ? 'bg-purple-950/65 hover:bg-purple-800/75 border-purple-400/50 text-purple-200 cursor-pointer'
                              : 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <Zap className="w-3.5 h-3.5" />
                          {steps >= 100 ? '一键连升(最大)' : `一键 +${steps}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
