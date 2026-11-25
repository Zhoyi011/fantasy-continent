import { useState } from 'react';
import { Compass, Globe, Laptop, Lock, Play, Plus, Trash2, UserCheck, X } from 'lucide-react';
import {
  ARCHETYPE_LIST,
  CLASS_DEFS,
  getClassesByArchetype,
  getRealmName,
  sanitizePlayerDisplayName,
  WORLD_META,
} from '../game/rules';
import type { AccountData, ClassId, PlayMode, SaveSlotId } from '../game/types';
import { MCButton } from './MCButton';

interface SaveSlotModalProps {
  account: AccountData;
  playMode: PlayMode;
  onLoadSlot: (slotId: SaveSlotId, customName?: string) => void;
  onStartNewSlot: (slotId: SaveSlotId, classId: ClassId, customName?: string) => void;
  onDeleteSlot: (slotId: SaveSlotId) => void;
  onClose: () => void;
}

const SINGLEPLAYER_SLOT_IDS: SaveSlotId[] = ['slot1', 'slot2', 'slot3'];
const ONLINE_SLOT_IDS: SaveSlotId[] = ['slot1'];

export function SaveSlotModal({
  account,
  playMode,
  onLoadSlot,
  onStartNewSlot,
  onDeleteSlot,
  onClose,
}: SaveSlotModalProps) {
  const isOnline = playMode === 'online';
  const visibleSlots = isOnline ? ONLINE_SLOT_IDS : SINGLEPLAYER_SLOT_IDS;
  const hasAnyVisibleSave = isOnline
    ? Boolean(account.slots.slot1)
    : Boolean(account.slots.slot1 || account.slots.slot2 || account.slots.slot3);
  const firstEmpty = visibleSlots.find((id) => !account.slots[id]) ?? 'slot1';

  const [creatingSlot, setCreatingSlot] = useState<SaveSlotId | null>(
    hasAnyVisibleSave ? null : firstEmpty
  );
  const [onlineName, setOnlineName] = useState<string>(() => account.displayName || '冒险者');
  const [nameError, setNameError] = useState<string | null>(null);

  const novice = CLASS_DEFS.novice;

  const validateOnlineName = (): string | null => {
    if (!isOnline) return undefined as unknown as string;
    const cleaned = sanitizePlayerDisplayName(onlineName, '');
    if (cleaned.length < 2) {
      setNameError('请输入 2~16 个字符的游戏名（不可含特殊控制符）');
      return null;
    }
    setNameError(null);
    return cleaned;
  };

  const handleConfirmLoad = (slotId: SaveSlotId) => {
    if (isOnline) {
      const valid = validateOnlineName();
      if (!valid) return;
      onLoadSlot('slot1', valid);
      return;
    }
    onLoadSlot(slotId);
  };

  const handleConfirmCreate = () => {
    if (!creatingSlot) return;
    if (isOnline) {
      const valid = validateOnlineName();
      if (!valid) return;
      onStartNewSlot('slot1', 'novice', valid);
      return;
    }
    onStartNewSlot(creatingSlot, 'novice');
  };

  return (
    <div
      className="modal-backdrop bg-slate-950/75"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-slot-modal-title"
    >
      <div className="modal-shell max-w-4xl rounded-xl border-2 border-slate-500/50 bg-[#0d1522]/96 p-3.5 sm:p-6 shadow-[0_24px_80px_rgba(0,0,0,0.92)]">
        <div className="flex items-center justify-between pb-2.5 sm:pb-3 border-b border-slate-800 shrink-0 gap-2">
          <div className="min-w-0 pr-2">
            <h2
              id="save-slot-modal-title"
              className="text-base sm:text-lg font-bold text-amber-300 tracking-wider truncate flex items-center gap-2"
            >
              {isOnline ? (
                <Globe className="w-4 h-4 text-cyan-300 shrink-0" />
              ) : (
                <Laptop className="w-4 h-4 text-emerald-300 shrink-0" />
              )}
              {creatingSlot
                ? isOnline
                  ? '启程仪式 · 创建联机唯一角色（不可删除）'
                  : `启程仪式 · 初入主城（单机存档位 ${creatingSlot.slice(-1)}）`
                : isOnline
                ? '联机唯一角色槽位（仅限 1 位 · 不可删除 · 密文防篡改）'
                : '单机模式存档槽位'}
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
              {isOnline
                ? `好友码 ${account.friendCode ?? 'HX-000000'} · 联机仅保留 1 个永久角色，可自由设置游戏名`
                : '支持 3 个独立角色槽位 · 进入主城后可向觉醒导师选择【五大体系 · 40 种进阶职业】'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭存档选择"
            className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto game-scroll pr-1 pb-5">
          {!creatingSlot ? (
            <div
              className={
                isOnline
                  ? 'mt-3 sm:mt-5 max-w-lg mx-auto'
                  : 'mt-3 sm:mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4'
              }
            >
              {visibleSlots.map((slotId, index) => {
                const slot = account.slots[slotId];
                const cls = slot ? CLASS_DEFS[slot.classId] : null;
                return (
                  <div
                    key={slotId}
                    data-testid={`save-slot-card-${slotId}`}
                    className={`rounded-xl border-2 p-4 flex flex-col justify-between gap-4 ${
                      slot
                        ? isOnline
                          ? 'border-cyan-500/45 bg-slate-900/80'
                          : 'border-emerald-500/45 bg-slate-900/80'
                        : 'border-dashed border-slate-700 bg-slate-900/40'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-2 gap-2">
                        <span className="font-bold text-slate-200 flex items-center gap-1.5">
                          {isOnline ? '联机唯一角色槽位' : `单机槽位 ${index + 1}`}
                          {isOnline && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-950/90 border border-cyan-500/40 text-[10px] text-cyan-200">
                              <Lock className="w-2.5 h-2.5" />
                              不可删除
                            </span>
                          )}
                        </span>
                        {slot && (
                          <span className="tabular-nums shrink-0">
                            {new Date(slot.updatedAt).toLocaleDateString('zh-CN')}
                          </span>
                        )}
                      </div>

                      {slot && cls ? (
                        <>
                          <div className="flex items-center gap-2.5 mb-3">
                            <span
                              className="w-10 h-10 rounded-lg flex items-center justify-center text-xl border border-white/20 shrink-0"
                              style={{ backgroundColor: cls.bodyColor }}
                            >
                              {cls.basicAttackIcon}
                            </span>
                            <div className="min-w-0">
                              <div className="text-base font-bold text-slate-100 truncate">
                                {isOnline ? `${account.displayName} · ${cls.name}` : cls.name}
                              </div>
                              <div className="text-xs text-amber-300 font-semibold tabular-nums">
                                Lv.{slot.level} · 🪙 {slot.gold} 金币
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5 text-xs text-slate-300 tabular-nums border-t border-slate-800 pt-2.5">
                            <div>世界：{WORLD_META[slot.worldId ?? 'world1'].name}</div>
                            <div>境界：{getRealmName(slot.breakthroughTier ?? 0)}</div>
                            <div>击杀：{slot.kills}</div>
                            <div>试炼塔：{(slot.highestDungeonFloor ?? 0)}F</div>
                            <div>背包：{slot.inventory.length} 件</div>
                            <div>技能书：{(slot.skillBooks?.length ?? 0)} 本</div>
                          </div>

                          {isOnline && (
                            <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5">
                              <label
                                htmlFor="online-name-input-load"
                                className="flex items-center gap-1.5 text-xs font-bold text-cyan-200"
                              >
                                <UserCheck className="w-3.5 h-3.5 text-cyan-300" />
                                联机游戏名（2~16字，将在大世界与组队中显示）
                              </label>
                              <input
                                id="online-name-input-load"
                                data-testid="online-name-input"
                                type="text"
                                maxLength={16}
                                value={onlineName}
                                onChange={(e) => {
                                  setOnlineName(e.target.value);
                                  if (nameError) setNameError(null);
                                }}
                                placeholder="输入你的游戏名（如：苍穹剑圣）"
                                className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-slate-950 border border-cyan-500/40 focus:border-cyan-300 focus:outline-none text-sm text-slate-100 placeholder:text-slate-500"
                              />
                              {nameError && (
                                <p className="text-[11px] text-rose-400">{nameError}</p>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="py-8 text-center text-xs text-slate-400">
                          <div className="text-2xl mb-2 opacity-60">🗺️</div>
                          <p className="font-medium text-slate-300">
                            {isOnline ? '尚未创建联机唯一角色' : '空白冒险槽位'}
                          </p>
                          <p className="mt-1 text-slate-500">
                            以见习旅者踏入晨曦圣城，觉醒 40 大职业（隐藏职业 Lv.30 解锁）
                          </p>
                        </div>
                      )}
                    </div>

                    {slot ? (
                      <div className="flex items-center gap-2">
                        <MCButton
                          variant={isOnline ? 'indigo' : 'emerald'}
                          onClick={() => handleConfirmLoad(slotId)}
                          icon={<Play className="w-4 h-4" />}
                          className="!py-2 !px-3 flex-1"
                        >
                          继续冒险
                        </MCButton>
                        {!isOnline && (
                          <button
                            type="button"
                            onClick={() => onDeleteSlot(slotId)}
                            aria-label={`删除存档槽位 ${index + 1}`}
                            title="删除此存档"
                            className="w-10 h-10 rounded-md bg-rose-950/70 hover:bg-rose-800 border border-rose-500/40 flex items-center justify-center text-rose-300 cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <MCButton
                        variant="gold"
                        onClick={() => setCreatingSlot(slotId)}
                        icon={<Plus className="w-4 h-4" />}
                        className="!py-2.5"
                      >
                        {isOnline ? '创建联机唯一角色' : '新建角色'}
                      </MCButton>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 sm:mt-4 space-y-3">
              {/* Online Mode Custom Display Name Entry */}
              {isOnline && (
                <div className="rounded-xl border-2 border-cyan-400/50 bg-cyan-950/20 p-3.5 sm:p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label
                      htmlFor="online-name-input-create"
                      className="text-xs sm:text-sm font-extrabold text-cyan-200 flex items-center gap-1.5"
                    >
                      <UserCheck className="w-4 h-4 text-cyan-300" />
                      设置联机游戏名（唯一角色 · 创建后不可删除）
                    </label>
                    <span className="text-[11px] text-cyan-300/80 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      单角色永久档案
                    </span>
                  </div>
                  <input
                    id="online-name-input-create"
                    data-testid="online-name-input"
                    type="text"
                    maxLength={16}
                    value={onlineName}
                    onChange={(e) => {
                      setOnlineName(e.target.value);
                      if (nameError) setNameError(null);
                    }}
                    placeholder="请输入 2~16 字角色游戏名..."
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-cyan-500/45 focus:border-cyan-300 focus:outline-none text-sm text-slate-100 placeholder:text-slate-500"
                  />
                  {nameError ? (
                    <p className="text-xs text-rose-400 font-medium">{nameError}</p>
                  ) : (
                    <p className="text-[11px] text-slate-400">
                      该游戏名将显示在共享大世界、组队列表、好友雷达与交易大厅中。
                    </p>
                  )}
                </div>
              )}

              {/* Novice Main City Entry Briefing */}
              <div className="rounded-xl border-2 border-cyan-400/45 bg-slate-900/85 p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <span
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl border border-white/20 shrink-0"
                  style={{ backgroundColor: novice.bodyColor }}
                >
                  {novice.basicAttackIcon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-bold text-slate-100">{novice.name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-200 border border-cyan-400/35">
                      主城安全区出生 · 普攻自动锁敌
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">{novice.summary}</p>
                </div>
              </div>

              {/* 5 Archetypes × 8 Classes = 40 Awakening Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {ARCHETYPE_LIST.map((arch) => {
                  const list = getClassesByArchetype(arch.id);
                  const stdCount = list.filter((c) => !c.isHidden).length;
                  const hiddenCount = list.filter((c) => c.isHidden).length;
                  return (
                    <div
                      key={arch.id}
                      className="rounded-xl border border-slate-700/80 bg-slate-900/75 p-3"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span
                          className="text-xs font-extrabold flex items-center gap-1"
                          style={{ color: arch.color }}
                        >
                          <span>{arch.icon}</span>
                          {arch.name}体系
                        </span>
                        <span className="text-[10px] text-slate-400 tabular-nums">
                          {stdCount}常规+{hiddenCount}隐藏(Lv.30)
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {list.slice(0, 6).map((c) => (
                          <span
                            key={c.id}
                            className="text-[10.5px] px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-700/80 text-slate-200"
                          >
                            {c.name}
                          </span>
                        ))}
                        {list
                          .filter((c) => c.isHidden)
                          .map((c) => (
                            <span
                              key={c.id}
                              className="text-[10.5px] px-1.5 py-0.5 rounded bg-amber-950/75 border border-amber-500/45 text-amber-200 font-bold"
                            >
                              ✦ {c.name}
                            </span>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Main City & Grand City Guide */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/15 px-3 py-2 text-[11px] text-emerald-200 flex items-center gap-2">
                <Compass className="w-4 h-4 shrink-0 text-emerald-300" />
                <span>
                  全职业均具备 4 个可升级主动技能 (Q/E/C/V) 与自动锁敌普攻；隐藏职业需达到 Lv.30 方可觉醒；装备强化上限开放至 +100！
                </span>
              </div>
            </div>
          )}
        </div>

        {creatingSlot && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setCreatingSlot(null)}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
            >
              返回存档槽位列表
            </button>
            <div className="flex-1 sm:flex-none sm:min-w-[260px]">
              <MCButton
                variant={isOnline ? 'indigo' : 'emerald'}
                data-start="true"
                onClick={handleConfirmCreate}
                icon={<Play className="w-4 h-4" />}
                className="!py-2.5"
              >
                {isOnline ? '进入联机主城 · 开启冒险' : '进入主城 · 开启冒险'}
              </MCButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
