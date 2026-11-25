import { Hammer, X } from 'lucide-react';
import {
  canClassEquipItem,
  CLASS_DEFS,
  CRAFT_RECIPES,
  hasEnoughMaterials,
  MATERIAL_MAP,
  RARITY_META,
  RESTRICTION_LABEL,
  SUBTYPE_LABEL,
} from '../game/rules';
import type { ClassId, CraftRecipeDef, MaterialBag } from '../game/types';

interface BlacksmithModalProps {
  gold: number;
  classId: ClassId;
  materials: MaterialBag;
  onCraft: (recipeId: string) => void;
  onClose: () => void;
}

function formatRecipeAffixes(r: CraftRecipeDef): string[] {
  const a = r.affixes;
  const out: string[] = [];
  if (a.atk) out.push(`攻+${a.atk}`);
  if (a.def) out.push(`防+${a.def}`);
  if (a.maxHp) out.push(`血+${a.maxHp}`);
  if (a.maxMp) out.push(`蓝+${a.maxMp}`);
  if (a.attackSpeed) out.push(`攻速+${a.attackSpeed}%`);
  if (a.critChance) out.push(`暴+${a.critChance}%`);
  if (a.critDmgBonus) out.push(`暴伤+${a.critDmgBonus}%`);
  if (a.mpRegen) out.push(`回蓝+${a.mpRegen}/s`);
  if (a.speed) out.push(`移速+${a.speed}`);
  if (a.lifeOnKill) out.push(`吸血+${a.lifeOnKill}`);
  return out;
}

export function BlacksmithModal({
  gold,
  classId,
  materials,
  onCraft,
  onClose,
}: BlacksmithModalProps) {
  const cls = CLASS_DEFS[classId];

  return (
    <div
      className="modal-backdrop bg-slate-950/65"
      role="dialog"
      aria-modal="true"
      aria-labelledby="blacksmith-modal-title"
    >
      <div className="modal-shell max-w-4xl rounded-2xl bg-[#0c1420]/96 border-2 border-orange-400/40 p-3.5 sm:p-6 shadow-[0_24px_70px_rgba(0,0,0,0.92)]">
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 shrink-0 gap-2">
          <div className="min-w-0">
            <h2
              id="blacksmith-modal-title"
              className="text-base sm:text-lg font-bold tracking-wider text-orange-300 flex items-center gap-2 truncate"
            >
              <Hammer className="w-5 h-5 shrink-0" />
              主城锻造铁匠铺 · 原料打造神兵
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
              消耗野外讨伐怪物收集的 20 种原料打造职业专属神装 · 当前职业：<strong className="text-slate-100">{cls.name}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭铁匠铺"
            className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-3 flex-1 min-h-0 overflow-y-auto game-scroll pr-1 pb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CRAFT_RECIPES.map((recipe) => {
              const rm = RARITY_META[recipe.rarity];
              const compatible = canClassEquipItem(classId, {
                id: recipe.id,
                name: recipe.name,
                slot: recipe.slot,
                rarity: recipe.rarity,
                level: recipe.level,
                weaponSubtype: recipe.weaponSubtype,
                requiredCategory: recipe.requiredCategory,
                affixes: recipe.affixes,
                sellValue: recipe.goldCost,
              });
              const matsOk = hasEnoughMaterials(materials, recipe.materials);
              const goldOk = gold >= recipe.goldCost;
              const canCraft = matsOk && goldOk;

              return (
                <div
                  key={recipe.id}
                  className="rounded-xl border p-3.5 flex flex-col justify-between gap-2.5"
                  style={{ borderColor: rm.border, backgroundColor: rm.bg }}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold truncate" style={{ color: rm.color }}>
                        [{rm.label}] {recipe.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900/80 text-slate-300 shrink-0">
                        {SUBTYPE_LABEL[recipe.weaponSubtype]} · Lv.{recipe.level}
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
                        {compatible
                          ? `✓ 适合 ${RESTRICTION_LABEL[recipe.requiredCategory]}`
                          : `限制：${RESTRICTION_LABEL[recipe.requiredCategory]}`}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 mt-1">{recipe.flavor}</p>

                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-slate-200 tabular-nums">
                      {formatRecipeAffixes(recipe).map((line) => (
                        <span key={line} className="px-1.5 py-0.5 rounded bg-slate-950/60">
                          {line}
                        </span>
                      ))}
                    </div>

                    {/* Required Materials */}
                    <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap gap-1.5">
                      {recipe.materials.map((req) => {
                        const matDef = MATERIAL_MAP[req.id];
                        const owned = materials[req.id] ?? 0;
                        const ok = owned >= req.count;
                        return (
                          <span
                            key={req.id}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] tabular-nums border ${
                              ok
                                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                                : 'bg-slate-950/70 border-rose-500/35 text-rose-300'
                            }`}
                          >
                            <span>{matDef?.icon}</span>
                            <span>{matDef?.name}</span>
                            <strong>
                              {owned}/{req.count}
                            </strong>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid={`craft-btn-${recipe.id}`}
                    disabled={!canCraft}
                    onClick={() => onCraft(recipe.id)}
                    className={`w-full min-h-[42px] sm:min-h-[38px] py-2 rounded-lg text-xs font-bold tabular-nums transition-colors ${
                      canCraft
                        ? 'bg-orange-400 hover:bg-orange-300 text-slate-950 cursor-pointer'
                        : 'bg-slate-800/80 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {canCraft
                      ? `⚒️ 消耗 🪙 ${recipe.goldCost} 打造`
                      : !goldOk
                      ? `金币不足 (需 🪙 ${recipe.goldCost})`
                      : `原料不足 (需 🪙 ${recipe.goldCost})`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-2.5 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>打造装备自动进入背包，可在背包内一键配装</span>
          <strong className="text-base text-amber-400 tabular-nums">🪙 {gold}</strong>
        </div>
      </div>
    </div>
  );
}
