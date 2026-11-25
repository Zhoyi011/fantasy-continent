import { X } from 'lucide-react';
import { SHOP_ITEMS } from '../game/rules';
import type { ShopItemDef } from '../game/types';

interface ShopModalProps {
  gold: number;
  prices: Record<string, number>;
  onBuy: (item: ShopItemDef) => void;
  onClose: () => void;
}

export function ShopModal({ gold, prices, onBuy, onClose }: ShopModalProps) {
  return (
    <div
      className="modal-backdrop bg-slate-950/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shop-modal-title"
    >
      <div className="modal-shell max-w-[520px] rounded-2xl bg-[#0c1420]/96 border-2 border-amber-400/35 p-3.5 sm:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.85)]">
        <div className="shrink-0">
          <div className="flex items-center justify-between mb-1">
            <div className="w-10" />
            <h2
              id="shop-modal-title"
              className="text-base sm:text-lg font-bold tracking-widest text-amber-400 text-center"
            >
              🏪 流浪商人
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭商店"
              className="w-10 h-10 rounded-lg bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-center text-[11px] sm:text-xs text-slate-400 mb-3">
            “冒险者，看看这些强化圣物与补给吧。”
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto game-scroll pr-1 space-y-2 pb-4">
          {SHOP_ITEMS.map((item) => {
            const price = Math.round(prices[item.id] ?? item.base);
            const canAfford = gold >= price;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!canAfford}
                onClick={() => onBuy(item)}
                className={`w-full min-h-[54px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-all ${
                  canAfford
                    ? 'bg-white/[0.045] hover:bg-amber-400/10 border-white/10 hover:border-amber-400/40 cursor-pointer'
                    : 'bg-white/[0.02] border-white/5 opacity-40 cursor-not-allowed'
                }`}
              >
                <span className="text-2xl w-8 text-center shrink-0">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-100">{item.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{item.desc}</div>
                </div>
                <span className="text-sm font-black text-amber-400 tabular-nums whitespace-nowrap">
                  🪙 {price}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>我的金币 <span className="hidden sm:inline text-slate-500">(F/ESC 关闭)</span></span>
          <strong className="text-base text-amber-400 tabular-nums">🪙 {gold}</strong>
        </div>
      </div>
    </div>
  );
}
