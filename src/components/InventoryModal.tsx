import { useState } from 'react';
import {
  ARCHETYPE_DEFS,
  canClassEquipItem,
  canLearnSkillBook,
  CLASS_DEFS,
  MATERIAL_DEFS,
  MAX_SKILL_LV,
  RARITY_META,
  RESTRICTION_LABEL,
  scoreGearForClass,
  sellJunkGear,
  SLOT_LABEL,
  SUBTYPE_LABEL,
} from '../game/rules';
import { Backpack, BookOpen, Coins, Package, Shield, Sparkles, Sword, Trash2, Wand2, X } from 'lucide-react';
import type { EquippedGear, GearItem, GearSlot, HudSnapshot } from '../game/types';

interface InventoryModalProps {
  hud: HudSnapshot;
  onEquip: (itemId: string) => void;
  onUnequip: (slot: GearSlot) => void;
  onSell: (itemId: string) => void;
  onSellJunk: (maxRarity: 'common' | 'rare') => void;
  onAutoEquip: () => void;
  onUseSkillBook: (bookId: string) => void;
  onSellSkillBook: (bookId: string) => void;
  onClose: () => void;
}

function formatAffixes(item: GearItem): string[] {
  const lines: string[] = [];
  if (item.affixes.atk) lines.push(`攻击力 +${item.affixes.atk}`);
  if (item.affixes.def) lines.push(`防御力 +${item.affixes.def}`);
  if (item.affixes.maxHp) lines.push(`生命上限 +${item.affixes.maxHp}`);
  if (item.affixes.maxMp) lines.push(`法力上限 +${item.affixes.maxMp}`);
  if (item.affixes.attackSpeed) lines.push(`攻击速度 +${item.affixes.attackSpeed}%`);
  if (item.affixes.critChance) lines.push(`暴击率 +${item.affixes.critChance}%`);
  if (item.affixes.critDmgBonus) lines.push(`暴击伤害 +${item.affixes.critDmgBonus}%`);
  if (item.affixes.mpRegen) lines.push(`法力回复 +${item.affixes.mpRegen}/s`);
  if (item.affixes.speed) lines.push(`移动速度 +${item.affixes.speed}`);
  if (item.affixes.lifeOnKill) lines.push(`击杀回血 +${item.affixes.lifeOnKill}`);
  return lines;
}

export function InventoryModal({
  hud,
  onEquip,
  onUnequip,
  onSell,
  onSellJunk,
  onAutoEquip,
  onUseSkillBook,
  onSellSkillBook,
  onClose,
}: InventoryModalProps) {
  const [rightTab, setRightTab] = useState<'gear' | 'materials' | 'books'>('gear');
  const cls = CLASS_DEFS[hud.classId];
  const slots: { key: GearSlot; icon: typeof Sword }[] = [
    { key: 'weapon', icon: Sword },
    { key: 'armor', icon: Shield },
    { key: 'accessory', icon: Sparkles },
  ];

  const totalMaterialsCount = Object.values(hud.materials).reduce(
    (sum, n) => sum + (n ?? 0),
    0
  );
  const commonJunkPreview = sellJunkGear(hud.inventory, 'common');
  const rareJunkPreview = sellJunkGear(hud.inventory, 'rare');

  return (
    <div
      className="modal-backdrop bg-slate-950/65"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inventory-modal-title"
    >
      <div className="modal-shell max-w-4xl rounded-2xl bg-[#0c1420]/96 border-2 border-slate-500/40 p-3 sm:p-6 shadow-[0_24px_70px_rgba(0,0,0,0.9)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 sm:pb-3 border-b border-slate-800 shrink-0 gap-2">
          <div className="min-w-0 pr-2">
            <h2 id="inventory-modal-title" className="text-base sm:text-lg font-bold text-slate-100 truncate">
              装备栏 · 一键配装与原料仓库
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 truncate">
              {cls.name} Lv.{hud.level}
              {hud.critDisabled ? ' · 法师无暴击体质' : ''} · 装备仅限对应职业装配
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="auto-equip-btn"
              onClick={onAutoEquip}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-gradient-to-r from-sky-400 to-cyan-300 hover:brightness-110 text-slate-950 text-xs font-extrabold flex items-center gap-1 cursor-pointer shadow"
            >
              <Wand2 className="w-3.5 h-3.5" />
              一键配装
            </button>
            <span className="text-xs sm:text-sm font-bold text-amber-400 tabular-nums hidden sm:inline">
              🪙 {hud.gold}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭背包"
              className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Split */}
        <div className="mt-2.5 sm:mt-4 grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-5 flex-1 min-h-0 max-sm:overflow-y-auto max-sm:game-scroll sm:overflow-hidden">
          {/* Left: Equipped Slots & Character Attributes */}
          <div className="sm:col-span-5 flex flex-col gap-2.5 sm:min-h-0 sm:overflow-y-auto sm:game-scroll sm:pr-1 pb-1">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 tracking-wide shrink-0">
              <span>当前穿戴装备</span>
              <span className="sm:hidden text-amber-400 font-bold tabular-nums">🪙 {hud.gold}</span>
            </div>
            <div className="space-y-2">
              {slots.map(({ key, icon: Icon }) => {
                const item: GearItem | null = hud.equipped[key as keyof EquippedGear];
                const meta = item ? RARITY_META[item.rarity] : null;
                return (
                  <div
                    key={key}
                    className="rounded-xl p-2.5 sm:p-3 border transition-colors"
                    style={{
                      borderColor: meta ? meta.border : 'rgba(148,163,184,0.2)',
                      backgroundColor: meta ? meta.bg : 'rgba(15,23,42,0.55)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="w-4 h-4 text-slate-300 shrink-0" />
                        <span className="text-xs text-slate-400 shrink-0">
                          {SLOT_LABEL[key]}
                        </span>
                        {item && meta ? (
                          <span
                            className="text-xs sm:text-sm font-bold truncate"
                            style={{ color: meta.color }}
                          >
                            [{meta.label}] {item.name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">未装备</span>
                        )}
                      </div>
                      {item && (
                        <button
                          type="button"
                          onClick={() => onUnequip(key)}
                          className="min-h-[36px] px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer shrink-0"
                        >
                          卸下
                        </button>
                      )}
                    </div>
                    {item && (
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] sm:text-xs text-slate-200 tabular-nums">
                        {formatAffixes(item).map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Live Total Stats */}
            <div className="sm:mt-auto rounded-xl bg-slate-900/75 border border-slate-800 p-3 text-xs tabular-nums">
              <div className="font-semibold text-slate-300 mb-1.5">角色综合属性</div>
              <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-slate-300">
                <div className="flex justify-between">
                  <span>生命上限</span>
                  <strong className="text-rose-300">{hud.maxHp}</strong>
                </div>
                <div className="flex justify-between">
                  <span>法力上限</span>
                  <strong className="text-sky-300">{hud.maxMp}</strong>
                </div>
                <div className="flex justify-between">
                  <span>攻击力</span>
                  <strong className="text-amber-300">{Math.round(hud.atk)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>防御力</span>
                  <strong className="text-blue-300">{Math.round(hud.def)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>攻击速度</span>
                  <strong className="text-cyan-300">{hud.attackSpeed}%</strong>
                </div>
                <div className="flex justify-between">
                  <span>移动速度</span>
                  <strong className="text-slate-100">{hud.speed}</strong>
                </div>
                <div className="flex justify-between">
                  <span>暴击率</span>
                  <strong className={hud.critDisabled ? 'text-slate-500' : 'text-emerald-300'}>
                    {hud.critDisabled ? '0% (无暴击)' : `${hud.critChance}%`}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>暴击伤害</span>
                  <strong className={hud.critDisabled ? 'text-slate-500' : 'text-orange-300'}>
                    {hud.critDisabled ? '100%' : `${Math.round(hud.critDmgMult * 100)}%`}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>法力回复</span>
                  <strong className="text-sky-300">+{hud.mpRegen}/s</strong>
                </div>
                <div className="flex justify-between">
                  <span>击杀回血</span>
                  <strong className={hud.lifeOnKill > 0 ? 'text-emerald-400' : 'text-slate-400'}>
                    +{hud.lifeOnKill} HP
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Segmented Gear Backpack, Skill Books & 20 Crafting Materials */}
          <div className="sm:col-span-7 flex flex-col min-h-0 sm:overflow-hidden">
            <div className="flex items-center justify-between gap-2 mb-2 shrink-0 flex-wrap">
              <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 flex-wrap">
                <button
                  type="button"
                  data-testid="inv-tab-gear"
                  onClick={() => setRightTab('gear')}
                  className={`min-h-[36px] px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                    rightTab === 'gear'
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Backpack className="w-3.5 h-3.5" />
                  装备 ({hud.inventory.length})
                </button>
                <button
                  type="button"
                  data-testid="inv-tab-books"
                  onClick={() => setRightTab('books')}
                  className={`min-h-[36px] px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                    rightTab === 'books'
                      ? 'bg-purple-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  技能书 ({hud.skillBooks.length})
                </button>
                <button
                  type="button"
                  data-testid="inv-tab-materials"
                  onClick={() => setRightTab('materials')}
                  className={`min-h-[36px] px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                    rightTab === 'materials'
                      ? 'bg-emerald-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  原料 ({totalMaterialsCount})
                </button>
              </div>
            </div>

            {rightTab === 'gear' && hud.inventory.length > 0 && (
              <div className="mb-2 rounded-lg bg-slate-900/80 border border-slate-800 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <span className="text-[11px] text-slate-400">
                  自动保留已强化(+1以上)装备：
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="sell-junk-common-btn"
                    disabled={commonJunkPreview.sold.length === 0}
                    onClick={() => onSellJunk('common')}
                    className={`min-h-[34px] px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 tabular-nums ${
                      commonJunkPreview.sold.length > 0
                        ? 'bg-slate-800 hover:bg-amber-500/20 border border-amber-400/40 text-amber-200 cursor-pointer'
                        : 'bg-slate-900 text-slate-500 border border-slate-800 cursor-not-allowed'
                    }`}
                  >
                    <Trash2 className="w-3 h-3" />
                    一键售白装 ({commonJunkPreview.sold.length} · +{commonJunkPreview.totalGold}金)
                  </button>
                  <button
                    type="button"
                    data-testid="sell-junk-rare-btn"
                    disabled={rareJunkPreview.sold.length === 0}
                    onClick={() => onSellJunk('rare')}
                    className={`min-h-[34px] px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 tabular-nums ${
                      rareJunkPreview.sold.length > 0
                        ? 'bg-slate-800 hover:bg-sky-500/20 border border-sky-400/40 text-sky-200 cursor-pointer'
                        : 'bg-slate-900 text-slate-500 border border-slate-800 cursor-not-allowed'
                    }`}
                  >
                    <Trash2 className="w-3 h-3" />
                    清蓝以下 ({rareJunkPreview.sold.length})
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 sm:overflow-y-auto sm:game-scroll pr-1 pb-5">
              {rightTab === 'gear' ? (
                hud.inventory.length === 0 ? (
                  <div className="h-40 sm:h-48 rounded-xl border border-dashed border-slate-700/80 flex flex-col items-center justify-center text-center px-4 text-xs text-slate-400">
                    <p className="text-sm font-medium text-slate-300 mb-1">背包暂无未穿戴装备</p>
                    <p>击杀野外怪物、开启宝箱或挑战试炼之塔均可获得专属装备。</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pb-3">
                    {hud.inventory.map((item) => {
                      const meta = RARITY_META[item.rarity];
                      const compatible = canClassEquipItem(hud.classId, item);
                      const curEq = hud.equipped[item.slot];
                      const curScore =
                        curEq && canClassEquipItem(hud.classId, curEq)
                          ? scoreGearForClass(hud.classId, curEq)
                          : -1;
                      const isRecommendedUpgrade =
                        compatible && scoreGearForClass(hud.classId, item) > curScore;
                      const subtypeLabel = item.weaponSubtype
                        ? SUBTYPE_LABEL[item.weaponSubtype]
                        : SLOT_LABEL[item.slot];
                      const reqLabel = item.requiredCategory
                        ? RESTRICTION_LABEL[item.requiredCategory]
                        : '全职业';

                      return (
                        <div
                          key={item.id}
                          className="rounded-xl p-2.5 sm:p-3 border flex flex-col justify-between gap-2"
                          style={{
                            borderColor: meta.border,
                            backgroundColor: meta.bg,
                          }}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className="text-xs sm:text-sm font-bold truncate"
                                style={{ color: meta.color }}
                              >
                                [{meta.label}] {item.name}
                              </span>
                              <span className="text-[10px] sm:text-[11px] text-slate-400 shrink-0 tabular-nums">
                                {subtypeLabel} · Lv.{item.level}
                              </span>
                            </div>

                            <div className="mt-1 flex items-center flex-wrap gap-1.5 text-[10px]">
                              <span
                                className={`px-1.5 py-0.5 rounded font-semibold ${
                                  compatible
                                    ? 'bg-emerald-950/75 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                                }`}
                              >
                                {compatible ? `✓ ${reqLabel}` : `✕ 限${reqLabel}`}
                              </span>
                              {isRecommendedUpgrade && (
                                <span
                                  data-testid="recommended-upgrade-badge"
                                  className="px-1.5 py-0.5 rounded font-bold bg-amber-400/20 text-amber-200 border border-amber-400/50"
                                >
                                  ⭐ 推荐升级
                                </span>
                              )}
                            </div>

                            <div className="mt-1 space-y-0.5 text-[11px] sm:text-xs text-slate-200 tabular-nums">
                              {formatAffixes(item).map((line) => (
                                <div key={line}>{line}</div>
                              ))}
                            </div>

                            {item.flavor && (
                              <p className="mt-1 text-[10px] text-slate-400 line-clamp-2">
                                {item.flavor}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                            <button
                              type="button"
                              disabled={!compatible}
                              onClick={() => onEquip(item.id)}
                              className={`flex-1 min-h-[42px] sm:min-h-[38px] py-1.5 rounded-lg font-bold text-xs transition-colors ${
                                compatible
                                  ? 'bg-sky-500/90 hover:bg-sky-400 text-slate-950 cursor-pointer'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              {compatible ? '穿戴' : '职业不符'}
                            </button>
                            <button
                              type="button"
                              onClick={() => onSell(item.id)}
                              className="min-h-[42px] sm:min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-semibold flex items-center gap-1 cursor-pointer tabular-nums transition-colors"
                            >
                              <Coins className="w-3.5 h-3.5" />
                              +{item.sellValue}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : rightTab === 'books' ? (
                <div className="space-y-3 pb-3">
                  {/* Current 4 Skill Levels Overview */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {cls.skills.map((sk, idx) => (
                      <div
                        key={sk.key}
                        className="rounded-lg bg-slate-900/80 border border-slate-700/70 p-2 text-[11px]"
                      >
                        <div className="flex items-center justify-between text-slate-300">
                          <span className="font-bold truncate">
                            [{sk.key}] {sk.icon} {sk.name}
                          </span>
                        </div>
                        <div className="text-amber-300 font-black tabular-nums mt-0.5">
                          Lv.{hud.skillLevels[idx] ?? 1} / {MAX_SKILL_LV}
                        </div>
                      </div>
                    ))}
                  </div>

                  {hud.skillBooks.length === 0 ? (
                    <div className="h-40 rounded-xl border border-dashed border-slate-700/80 flex flex-col items-center justify-center text-center px-4 text-xs text-slate-400">
                      <p className="text-sm font-medium text-slate-300 mb-1">暂无技能书秘籍</p>
                      <p>击败野外精英首领或挑战【试炼之塔】副本均可掉落各系技能书。</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {hud.skillBooks.map((book) => {
                        const rm = RARITY_META[book.rarity];
                        const check = canLearnSkillBook(hud.classId, hud.skillLevels, book);
                        const archName =
                          book.archetype === 'all'
                            ? '全职业通用'
                            : `${ARCHETYPE_DEFS[book.archetype].name}系`;
                        const targetSk = cls.skills[book.targetSlot];
                        return (
                          <div
                            key={book.id}
                            className="rounded-xl p-3 border flex flex-col justify-between gap-2"
                            style={{ borderColor: rm.border, backgroundColor: rm.bg }}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs sm:text-sm font-bold truncate" style={{ color: rm.color }}>
                                  📘 {book.name}
                                </span>
                                <span className="text-[10px] text-slate-300 shrink-0 px-1.5 py-0.5 rounded bg-slate-950/70">
                                  {archName}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-300 mt-1">{book.desc}</p>
                              <div className="text-[10px] text-sky-300 mt-1">
                                对应当前技能：[{targetSk.key}] {targetSk.name} (当前 Lv.{hud.skillLevels[book.targetSlot] ?? 1})
                              </div>
                              {!check.ok && check.reason && (
                                <div className="text-[10px] text-rose-300 mt-1">{check.reason}</div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                              <button
                                type="button"
                                data-testid={`use-book-${book.id}`}
                                disabled={!check.ok}
                                onClick={() => onUseSkillBook(book.id)}
                                className={`flex-1 min-h-[38px] py-1.5 rounded-lg font-bold text-xs transition-colors ${
                                  check.ok
                                    ? 'bg-purple-400 hover:bg-purple-300 text-slate-950 cursor-pointer'
                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                              >
                                {check.ok ? '研习升级' : '无法研习'}
                              </button>
                              <button
                                type="button"
                                onClick={() => onSellSkillBook(book.id)}
                                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-semibold flex items-center gap-1 cursor-pointer tabular-nums"
                              >
                                <Coins className="w-3.5 h-3.5" />
                                +{book.sellValue}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-1">
                  {MATERIAL_DEFS.map((m) => {
                    const count = hud.materials[m.id] ?? 0;
                    const rm = RARITY_META[m.rarity];
                    return (
                      <div
                        key={m.id}
                        className={`rounded-xl p-2.5 border flex items-center gap-2.5 ${
                          count > 0 ? 'opacity-100' : 'opacity-55'
                        }`}
                        style={{
                          borderColor: count > 0 ? rm.border : 'rgba(148,163,184,0.18)',
                          backgroundColor: count > 0 ? rm.bg : 'rgba(15,23,42,0.5)',
                        }}
                      >
                        <span className="w-9 h-9 rounded-lg bg-slate-950/80 border border-white/10 flex items-center justify-center text-lg shrink-0">
                          {m.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold truncate" style={{ color: rm.color }}>
                              {m.name}
                            </span>
                            <span className="text-xs font-black text-slate-100 tabular-nums shrink-0">
                              ×{count}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            来源：{m.sourceHint}
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
      </div>
    </div>
  );
}
