import { useRef, useState } from 'react';
import { computeJoystickVector } from '../game/rules';

interface VirtualJoystickProps {
  onVectorChange: (x: number, y: number) => void;
  compact?: boolean;
}

export function VirtualJoystick({ onVectorChange, compact = false }: VirtualJoystickProps) {
  const baseSize = compact ? 104 : 126;
  const knobSize = compact ? 42 : 50;
  const maxRadius = compact ? 36 : 44;

  const baseRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const activeTouchIdRef = useRef<number | null>(null);
  const mouseActiveRef = useRef(false);
  const [active, setActive] = useState(false);

  const applyOffset = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;

    const vec = computeJoystickVector(dx, dy, maxRadius, 0.14);
    const dist = Math.hypot(dx, dy);
    const clampD = Math.min(dist, maxRadius);
    const ang = Math.atan2(dy, dx);
    const visualX = dist > 0 ? Math.cos(ang) * clampD : 0;
    const visualY = dist > 0 ? Math.sin(ang) * clampD : 0;

    if (knobRef.current) {
      knobRef.current.style.transform = `translate3d(${visualX.toFixed(1)}px, ${visualY.toFixed(1)}px, 0)`;
    }
    onVectorChange(vec.x, vec.y);
  };

  const resetStick = () => {
    activeTouchIdRef.current = null;
    mouseActiveRef.current = false;
    setActive(false);
    if (knobRef.current) {
      knobRef.current.style.transform = 'translate3d(0px, 0px, 0)';
    }
    onVectorChange(0, 0);
  };

  return (
    <div
      ref={baseRef}
      data-testid="virtual-joystick"
      role="application"
      aria-label="虚拟移动摇杆"
      style={{ width: `${baseSize}px`, height: `${baseSize}px`, touchAction: 'none' }}
      onTouchStart={(e) => {
        e.stopPropagation();
        if (activeTouchIdRef.current !== null) return;
        const t = e.changedTouches[0];
        if (!t) return;
        activeTouchIdRef.current = t.identifier;
        setActive(true);
        applyOffset(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        e.stopPropagation();
        if (activeTouchIdRef.current === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === activeTouchIdRef.current) {
            applyOffset(t.clientX, t.clientY);
            break;
          }
        }
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        if (activeTouchIdRef.current === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchIdRef.current) {
            resetStick();
            break;
          }
        }
      }}
      onTouchCancel={(e) => {
        e.stopPropagation();
        resetStick();
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'touch') return;
        e.stopPropagation();
        mouseActiveRef.current = true;
        setActive(true);
        e.currentTarget.setPointerCapture?.(e.pointerId);
        applyOffset(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.pointerType === 'touch' || !mouseActiveRef.current) return;
        e.stopPropagation();
        applyOffset(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (e.pointerType === 'touch' || !mouseActiveRef.current) return;
        e.stopPropagation();
        resetStick();
      }}
      onPointerCancel={(e) => {
        if (e.pointerType === 'touch') return;
        e.stopPropagation();
        resetStick();
      }}
      className={`pointer-events-auto relative rounded-full flex items-center justify-center select-none transition-colors duration-150 ${
        active
          ? 'bg-slate-900/65 border-2 border-sky-400/70 shadow-[0_0_24px_rgba(56,189,248,0.28)]'
          : 'bg-slate-950/48 border-2 border-white/22 shadow-[0_6px_24px_rgba(0,0,0,0.5)]'
      }`}
    >
      {/* Subtle Inner Ring + Cardinal Arrows */}
      <div
        className={`pointer-events-none absolute rounded-full border border-white/12 ${
          compact ? 'inset-2.5' : 'inset-3'
        }`}
      />
      <span className="pointer-events-none absolute top-1.5 text-[8px] font-bold text-slate-300/60">
        ▲
      </span>
      <span className="pointer-events-none absolute bottom-1.5 text-[8px] font-bold text-slate-300/60">
        ▼
      </span>
      <span className="pointer-events-none absolute left-2 text-[8px] font-bold text-slate-300/60">
        ◀
      </span>
      <span className="pointer-events-none absolute right-2 text-[8px] font-bold text-slate-300/60">
        ▶
      </span>

      {/* Movable Thumb Knob */}
      <div
        ref={knobRef}
        style={{
          width: `${knobSize}px`,
          height: `${knobSize}px`,
          transform: 'translate3d(0px, 0px, 0)',
        }}
        className={`pointer-events-none rounded-full border-2 flex items-center justify-center shadow-lg ${
          active
            ? 'bg-gradient-to-b from-sky-300/90 to-sky-500/85 border-white/80'
            : 'bg-gradient-to-b from-slate-200/55 to-slate-400/45 border-white/50'
        }`}
      >
        <div className="w-3 h-3 rounded-full bg-white/55" />
      </div>
    </div>
  );
}
