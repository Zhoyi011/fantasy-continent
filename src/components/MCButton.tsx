import type { ButtonHTMLAttributes, ReactNode } from 'react';

type MCVariant = 'emerald' | 'stone' | 'gold' | 'indigo' | 'danger';

interface MCButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: MCVariant;
  icon?: ReactNode;
  sublabel?: string;
}

const VARIANT_CLASSES: Record<MCVariant, string> = {
  emerald:
    'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 border-t-emerald-300/60 border-l-emerald-400/40 border-r-emerald-900 border-b-emerald-950 text-white shadow-[0_6px_0_#064e3b,0_12px_28px_rgba(16,185,129,0.28)]',
  gold:
    'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 border-t-amber-200/80 border-l-amber-300/60 border-r-amber-800 border-b-amber-950 text-slate-950 shadow-[0_6px_0_#78350f,0_12px_28px_rgba(245,158,11,0.28)]',
  indigo:
    'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 border-t-indigo-300/60 border-l-indigo-400/40 border-r-indigo-900 border-b-indigo-950 text-white shadow-[0_6px_0_#1e1b4b,0_10px_24px_rgba(99,102,241,0.24)]',
  stone:
    'bg-slate-700 hover:bg-slate-600 active:bg-slate-800 border-t-slate-400/50 border-l-slate-500/40 border-r-slate-900 border-b-slate-950 text-slate-100 shadow-[0_6px_0_#0f172a,0_10px_22px_rgba(0,0,0,0.45)]',
  danger:
    'bg-rose-700 hover:bg-rose-600 active:bg-rose-800 border-t-rose-400/50 border-l-rose-500/40 border-r-rose-950 border-b-rose-950 text-white shadow-[0_6px_0_#4c0519,0_10px_22px_rgba(225,29,72,0.28)]',
};

export function MCButton({
  variant = 'stone',
  icon,
  sublabel,
  children,
  className = '',
  ...rest
}: MCButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`group relative w-full px-5 py-3 border-2 border-b-[5px] rounded-md font-bold tracking-wider transition-transform duration-100 active:translate-y-[3px] active:shadow-none disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer flex items-center justify-between gap-3 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      <span className="flex items-center gap-3 min-w-0">
        {icon && <span className="shrink-0 opacity-95">{icon}</span>}
        <span className="truncate text-sm sm:text-base">{children}</span>
      </span>
      {sublabel && (
        <span className="text-xs font-medium opacity-80 shrink-0 whitespace-nowrap">
          {sublabel}
        </span>
      )}
    </button>
  );
}
