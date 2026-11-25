import { useState } from 'react';
import { Lock, Sparkles, X } from 'lucide-react';
import {
  ARCHETYPE_LIST,
  canAwakenClass,
  canUnlockHiddenClass,
  CLASS_DEFS,
  getClassesByArchetype,
} from '../game/rules';
import type { ArchetypeId, ClassDef, ClassId } from '../game/types';

interface AwakeningModalProps {
  classId: ClassId;
  awakened: boolean;
  level: number;
  kills: number;
  soulStones: number;
  onAwaken: (classId: ClassId) => void;
  onClose: () => void;
}

export function AwakeningModal({
  classId,
  awakened,
  level,
  kills,
  soulStones,
  onAwaken,
  onClose,
}: AwakeningModalProps) {
  const currentDef = CLASS_DEFS[classId] ?? CLASS_DEFS.novice;
  const initialArch: ArchetypeId =
    currentDef.archetype === 'novice' ? 'tank' : currentDef.archetype;
  const [archTab, setArchTab] = useState<ArchetypeId>(initialArch);
  const hiddenUnlocked = canUnlockHiddenClass(level, kills, soulStones);

  const list: ClassDef[] = getClassesByArchetype(archTab);
  const activeArch = ARCHETYPE_LIST.find((a) => a.id === archTab) ?? ARCHETYPE_LIST[0];
  const lockStatus = canAwakenClass(classId, awakened);
  const isAlreadyAwakened = !lockStatus.allowed;

  return (
    <div
      className="modal-backdrop bg-slate-950/65"
      role="dialog"
      aria-modal="true"
      aria-labelledby="awakening-modal-title"
    >
      <div className="modal-shell max-w-5xl rounded-2xl bg-[#0c1420]/96 border-2 border-cyan-400/45 p-3.5 sm:p-6 shadow-[0_24px_70px_rgba(0,0,0,0.92)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 shrink-0 gap-2">
          <div className="min-w-0">
            <h2
              id="awakening-modal-title"
              className="text-base sm:text-lg font-bold tracking-wider text-cyan-300 flex items-center gap-2 truncate"
            >
              <Sparkles className="w-5 h-5 shrink-0" />
              主城觉醒圣殿 · 五大体系 40 进阶职业
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
              当前职业：<strong className="text-slate-100">{currentDef.name}</strong>
              {isAlreadyAwakened
                ? '（已永久锁定 · 留待后续转职与重生系统开启）'
                : '（见习旅者 · 选定后将永久锁定职业，请慎重抉择）'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭觉醒界面"
            className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 5 Archetype Tabs */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
          {ARCHETYPE_LIST.map((arch) => {
            const active = arch.id === archTab;
            const archClasses = getClassesByArchetype(arch.id);
            return (
              <button
                key={arch.id}
                type="button"
                data-testid={`awaken-tab-${arch.id}`}
                onClick={() => setArchTab(arch.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-colors ${
                  active
                    ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
              >
                <span>{arch.icon}</span>
                <span>{arch.name}</span>
                <span className="text-[10px] opacity-80 tabular-nums">({archClasses.length})</span>
              </button>
            );
          })}
        </div>

        <div className="mt-2 rounded-lg bg-slate-900/75 border border-slate-800 px-3 py-1.5 text-[11px] text-slate-300 shrink-0 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong style={{ color: activeArch.color }}>
              {activeArch.icon} {activeArch.name}体系：
            </strong>
            {activeArch.desc}
          </span>
          <span className="text-[10px] text-amber-300/90 tabular-nums">
            隐藏条件：角色等级达到 Lv.30（当前 Lv.{level} · 灵魂石无法提前解锁）
          </span>
        </div>

        {isAlreadyAwakened && (
          <div className="mt-2 rounded-lg bg-amber-950/55 border border-amber-500/50 px-3 py-2 text-xs text-amber-200 flex items-center gap-2 shrink-0">
            <Lock className="w-4 h-4 text-amber-300 shrink-0" />
            <span>
              你已觉醒为 <strong>【{currentDef.name}】</strong>，职业一旦选定即永久锁定，不可直接切换，将保留用于后续高阶转职与重生系统。
            </span>
          </div>
        )}

        {/* 8 Class Cards Grid (6 Standard + 2 Hidden) */}
        <div className="mt-3 flex-1 min-h-0 overflow-y-auto game-scroll pr-1 pb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {list.map((cls) => {
              const isCurrent = cls.id === classId;
              const isHiddenLocked = Boolean(cls.isHidden && !hiddenUnlocked);
              return (
                <div
                  key={cls.id}
                  className={`rounded-xl border-2 p-3.5 flex flex-col justify-between gap-2.5 ${
                    isCurrent
                      ? 'border-cyan-400 bg-cyan-950/25'
                      : cls.isHidden
                      ? 'border-amber-400/55 bg-amber-950/15'
                      : 'border-slate-700/75 bg-slate-900/75'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-xl border border-white/20 shrink-0"
                          style={{ backgroundColor: cls.bodyColor }}
                        >
                          {cls.basicAttackIcon}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm sm:text-base font-bold text-slate-100">
                              {cls.name}
                            </span>
                            {cls.isHidden && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-950/90 border border-amber-400/50 text-amber-200">
                                隐藏职业
                              </span>
                            )}
                            {cls.critDisabled && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-950/90 border border-purple-400/45 text-purple-200">
                                法师无暴击
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{cls.title}</div>
                        </div>
                      </div>
                      {isCurrent && (
                        <span className="text-[11px] font-bold text-cyan-300 shrink-0">当前职业</span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed mb-2">{cls.summary}</p>

                    <div className="grid grid-cols-4 gap-1.5 text-[11px] tabular-nums bg-slate-950/70 rounded-lg p-2 border border-slate-800 mb-2">
                      <div>
                        <span className="text-slate-400 block">生命</span>
                        <strong className="text-rose-300">{cls.baseHp}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">攻击</span>
                        <strong className="text-amber-300">{cls.baseAtk}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">攻速</span>
                        <strong className="text-sky-300">{cls.baseAttackSpeed ?? 100}%</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">暴击</span>
                        <strong className={cls.critDisabled ? 'text-slate-500' : 'text-emerald-300'}>
                          {cls.critDisabled ? '0%' : `${cls.baseCrit}%`}
                        </strong>
                      </div>
                    </div>

                    <div className="space-y-1 text-[11px] text-slate-300">
                      {cls.skills.map((sk) => (
                        <div key={sk.key} className="truncate">
                          <span className="text-sky-300 font-bold">
                            [{sk.key} {sk.icon} {sk.name}]
                          </span>{' '}
                          <span className="text-slate-400 tabular-nums">
                            ({sk.mpCost}MP · {sk.cooldown}s)
                          </span>{' '}
                          · {sk.desc}
                        </div>
                      ))}
                    </div>

                    {cls.unlockHint && (
                      <div
                        className={`mt-2 text-[11px] px-2.5 py-1.5 rounded-lg border ${
                          hiddenUnlocked
                            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                            : 'bg-amber-950/35 border-amber-500/40 text-amber-200'
                        }`}
                      >
                        {hiddenUnlocked
                          ? `✨ 已解锁隐藏觉醒条件！可随时转职为【${cls.name}】。`
                          : `🔒 ${cls.unlockHint}`}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    data-testid={`awaken-btn-${cls.id}`}
                    disabled={isAlreadyAwakened || isCurrent || isHiddenLocked}
                    onClick={() => onAwaken(cls.id)}
                    className={`w-full min-h-[42px] sm:min-h-[38px] py-2 rounded-lg text-xs font-bold transition-colors ${
                      isCurrent
                        ? 'bg-slate-800 text-cyan-300 border border-cyan-500/35 cursor-default'
                        : isAlreadyAwakened
                        ? 'bg-slate-800/70 text-slate-500 cursor-not-allowed'
                        : isHiddenLocked
                        ? 'bg-slate-800/70 text-slate-500 cursor-not-allowed'
                        : cls.isHidden
                        ? 'bg-gradient-to-r from-amber-300 to-sky-300 hover:brightness-110 text-slate-950 cursor-pointer'
                        : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 cursor-pointer'
                    }`}
                  >
                    {isCurrent
                      ? '当前已觉醒此职业（已锁定）'
                      : isAlreadyAwakened
                      ? '已永久觉醒锁职（待转职/重生）'
                      : isHiddenLocked
                      ? '尚未达成隐藏解锁条件'
                      : `立即觉醒为【${cls.name}】（永久锁定）`}
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
