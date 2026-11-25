import { useRef, useState } from 'react';
import { Backpack } from 'lucide-react';
import { CLASS_DEFS } from '../game/rules';
import type { HudSnapshot } from '../game/types';

interface MobileControlsProps {
  hud: HudSnapshot;
  compact?: boolean;
  onAttackHold: (held: boolean) => void;
  onTriggerSkill: (slot: 'q' | 'e' | 'c' | 'v' | 'dash' | 'potion') => void;
  onToggleInventory: () => void;
}

export function MobileControls({
  hud,
  compact = false,
  onAttackHold,
  onTriggerSkill,
  onToggleInventory,
}: MobileControlsProps) {
  const cls = CLASS_DEFS[hud.classId];
  const [attackPressed, setAttackPressed] = useState(false);
  const attackTouchIdRef = useRef<number | null>(null);

  const s0 = cls.skills[0];
  const s1 = cls.skills[1];
  const s2 = cls.skills[2];
  const s3 = cls.skills[3];

  const potEmpty = hud.potions <= 0;

  return (
    <div
      data-testid="mobile-action-cluster"
      className={`pointer-events-auto relative select-none ${
        compact ? 'w-[214px] h-[196px]' : 'w-[244px] h-[218px]'
      }`}
      style={{ touchAction: 'none' }}
    >
      {/* Bag Button (Top-Right) */}
      <TouchCircleButton
        size={compact ? 40 : 44}
        className={`absolute border-amber-400/60 bg-slate-950/75 text-amber-200 ${
          compact ? 'right-0.5 top-0' : 'right-1 top-0'
        }`}
        onTrigger={onToggleInventory}
        ariaLabel={`打开背包 (${hud.inventory.length})`}
        badge={hud.inventory.length > 0 ? String(hud.inventory.length) : undefined}
        badgeTone="amber"
      >
        <Backpack className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-amber-300`} />
        <span className="text-[8px] font-bold leading-none mt-0.5">背包</span>
      </TouchCircleButton>

      {/* Dash Button (Top Middle-Right) */}
      <TouchCircleButton
        size={compact ? 42 : 46}
        cdRatio={hud.cdDash}
        className={`absolute border-cyan-300/60 bg-slate-950/75 text-cyan-100 ${
          compact ? 'right-[52px] top-0' : 'right-[58px] top-0'
        }`}
        onTrigger={() => onTriggerSkill('dash')}
        ariaLabel="冲刺闪避"
      >
        <span className={`${compact ? 'text-sm' : 'text-base'} leading-none`}>💨</span>
        <span className="text-[8px] font-bold leading-none mt-0.5">冲刺</span>
      </TouchCircleButton>

      {/* Skill 1 (Q) */}
      <TouchCircleButton
        size={compact ? 46 : 52}
        cdRatio={hud.cdSkills[0] ?? hud.cdQ}
        dimmed={hud.mp < s0.mpCost}
        className={`absolute border-sky-400/75 bg-slate-900/80 text-slate-100 ${
          compact ? 'right-[104px] top-[8px]' : 'right-[116px] top-[6px]'
        }`}
        onTrigger={() => onTriggerSkill('q')}
        ariaLabel={`${s0.name} (技能Q)`}
        badge={`Lv${hud.skillLevels[0] ?? 1}`}
        badgeTone="slate"
      >
        <span className={`${compact ? 'text-base' : 'text-lg'} leading-none`}>{s0.icon}</span>
        <span className="text-[8px] font-bold leading-none mt-0.5 max-w-[40px] truncate">
          {s0.name}
        </span>
      </TouchCircleButton>

      {/* Skill 2 (E) */}
      <TouchCircleButton
        size={compact ? 46 : 52}
        cdRatio={hud.cdSkills[1] ?? hud.cdE}
        dimmed={hud.mp < s1.mpCost}
        className={`absolute border-violet-400/75 bg-slate-900/80 text-slate-100 ${
          compact ? 'right-[156px] top-[34px]' : 'right-[174px] top-[36px]'
        }`}
        onTrigger={() => onTriggerSkill('e')}
        ariaLabel={`${s1.name} (技能E)`}
        badge={`Lv${hud.skillLevels[1] ?? 1}`}
        badgeTone="slate"
      >
        <span className={`${compact ? 'text-base' : 'text-lg'} leading-none`}>{s1.icon}</span>
        <span className="text-[8px] font-bold leading-none mt-0.5 max-w-[40px] truncate">
          {s1.name}
        </span>
      </TouchCircleButton>

      {/* Skill 3 (C) */}
      <TouchCircleButton
        size={compact ? 46 : 52}
        cdRatio={hud.cdSkills[2] ?? hud.cdC}
        dimmed={hud.mp < s2.mpCost}
        className={`absolute border-emerald-400/75 bg-slate-900/80 text-slate-100 ${
          compact ? 'right-[160px] top-[88px]' : 'right-[180px] top-[98px]'
        }`}
        onTrigger={() => onTriggerSkill('c')}
        ariaLabel={`${s2.name} (技能C)`}
        badge={`Lv${hud.skillLevels[2] ?? 1}`}
        badgeTone="slate"
      >
        <span className={`${compact ? 'text-base' : 'text-lg'} leading-none`}>{s2.icon}</span>
        <span className="text-[8px] font-bold leading-none mt-0.5 max-w-[40px] truncate">
          {s2.name}
        </span>
      </TouchCircleButton>

      {/* Skill 4 Ultimate (V) */}
      <TouchCircleButton
        size={compact ? 48 : 54}
        cdRatio={hud.cdSkills[3] ?? hud.cdV}
        dimmed={hud.mp < s3.mpCost}
        className={`absolute border-amber-400/80 bg-slate-900/85 text-amber-100 ${
          compact ? 'right-[120px] bottom-[8px]' : 'right-[136px] bottom-[10px]'
        }`}
        onTrigger={() => onTriggerSkill('v')}
        ariaLabel={`${s3.name} (终极技V)`}
        badge={`Lv${hud.skillLevels[3] ?? 1}`}
        badgeTone="amber"
      >
        <span className={`${compact ? 'text-base' : 'text-lg'} leading-none`}>{s3.icon}</span>
        <span className="text-[8px] font-bold leading-none mt-0.5 max-w-[42px] truncate">
          {s3.name}
        </span>
      </TouchCircleButton>

      {/* Potion Button (R) */}
      <TouchCircleButton
        size={compact ? 42 : 48}
        cdRatio={hud.cdPot}
        dimmed={potEmpty}
        className={`absolute border-emerald-400/70 bg-slate-900/80 text-emerald-100 ${
          compact ? 'right-[70px] bottom-0' : 'right-[82px] bottom-0'
        }`}
        onTrigger={() => onTriggerSkill('potion')}
        ariaLabel={`喝药水 (${hud.potions})`}
        badge={String(hud.potions)}
        badgeTone={potEmpty ? 'slate' : 'emerald'}
      >
        <span className={`${compact ? 'text-sm' : 'text-base'} leading-none`}>🧪</span>
        <span className="text-[8px] font-bold leading-none mt-0.5">药水</span>
      </TouchCircleButton>

      {/* Primary Large Auto-Aim Attack Button */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`自动索敌普攻 (${cls.basicAttackName})`}
        style={{ touchAction: 'none' }}
        onTouchStart={(e) => {
          e.stopPropagation();
          if (attackTouchIdRef.current !== null) return;
          const t = e.changedTouches[0];
          if (t) attackTouchIdRef.current = t.identifier;
          setAttackPressed(true);
          onAttackHold(true);
        }}
        onTouchEnd={(e) => {
          e.stopPropagation();
          if (attackTouchIdRef.current === null) {
            setAttackPressed(false);
            onAttackHold(false);
            return;
          }
          for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === attackTouchIdRef.current) {
              attackTouchIdRef.current = null;
              setAttackPressed(false);
              onAttackHold(false);
              break;
            }
          }
        }}
        onTouchCancel={(e) => {
          e.stopPropagation();
          attackTouchIdRef.current = null;
          setAttackPressed(false);
          onAttackHold(false);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'touch') return;
          e.stopPropagation();
          setAttackPressed(true);
          onAttackHold(true);
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'touch') return;
          e.stopPropagation();
          setAttackPressed(false);
          onAttackHold(false);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'touch') return;
          if (attackPressed) {
            setAttackPressed(false);
            onAttackHold(false);
          }
        }}
        className={`absolute right-0 rounded-full border-[3px] flex flex-col items-center justify-center overflow-hidden shadow-[0_8px_28px_rgba(0,0,0,0.65)] transition-transform duration-75 cursor-pointer ${
          compact ? 'bottom-1.5 w-[64px] h-[64px]' : 'bottom-2 w-[74px] h-[74px]'
        } ${
          attackPressed
            ? 'scale-92 bg-amber-500/85 border-amber-200 text-slate-950'
            : 'bg-slate-900/80 hover:bg-slate-800/85 border-amber-400/85 text-amber-100'
        }`}
      >
        <span className={`${compact ? 'text-xl' : 'text-2xl'} leading-none`}>
          {cls.basicAttackIcon}
        </span>
        <span className="text-[10px] sm:text-[11px] font-black tracking-wide leading-none mt-1">
          普攻
        </span>
        <div
          className="absolute inset-0 bg-slate-950/65 origin-bottom pointer-events-none"
          style={{ transform: `scaleY(${hud.cdBasic})` }}
        />
      </button>
    </div>
  );
}

interface TouchCircleButtonProps {
  size: number;
  cdRatio?: number;
  dimmed?: boolean;
  className?: string;
  ariaLabel: string;
  badge?: string;
  badgeTone?: 'amber' | 'emerald' | 'slate';
  onTrigger: () => void;
  children: React.ReactNode;
}

function TouchCircleButton({
  size,
  cdRatio = 0,
  dimmed = false,
  className = '',
  ariaLabel,
  badge,
  badgeTone = 'amber',
  onTrigger,
  children,
}: TouchCircleButtonProps) {
  const [pressed, setPressed] = useState(false);
  const lastTouchTsRef = useRef(0);

  const badgeClass =
    badgeTone === 'emerald'
      ? 'bg-emerald-400 text-slate-950'
      : badgeTone === 'slate'
      ? 'bg-slate-600 text-slate-200'
      : 'bg-amber-400 text-slate-950';

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={ariaLabel}
      style={{ width: `${size}px`, height: `${size}px`, touchAction: 'none' }}
      onTouchStart={(e) => {
        e.stopPropagation();
        lastTouchTsRef.current = Date.now();
        setPressed(true);
        onTrigger();
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        lastTouchTsRef.current = Date.now();
        setPressed(false);
      }}
      onTouchCancel={(e) => {
        e.stopPropagation();
        setPressed(false);
      }}
      onClick={(e) => {
        if (Date.now() - lastTouchTsRef.current < 450) return;
        e.stopPropagation();
        e.currentTarget.blur();
        onTrigger();
      }}
      className={`rounded-full border-2 flex flex-col items-center justify-center shadow-[0_6px_18px_rgba(0,0,0,0.55)] transition-transform duration-75 cursor-pointer ${
        pressed ? 'scale-90 brightness-125' : ''
      } ${dimmed ? 'opacity-55' : 'opacity-100'} ${className}`}
    >
      <div className="relative w-full h-full rounded-full overflow-hidden flex flex-col items-center justify-center">
        {children}
        {cdRatio > 0 && (
          <div
            className="absolute inset-0 bg-slate-950/75 origin-bottom pointer-events-none"
            style={{ transform: `scaleY(${cdRatio})` }}
          />
        )}
      </div>
      {badge !== undefined && (
        <span
          className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center tabular-nums shadow ${badgeClass}`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
