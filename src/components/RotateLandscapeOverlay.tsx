import { Maximize2, RotateCcw } from 'lucide-react';

interface RotateLandscapeOverlayProps {
  onDismiss: () => void;
}

export function RotateLandscapeOverlay({ onDismiss }: RotateLandscapeOverlayProps) {
  const handleTryLandscapeLock = async () => {
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (mode: string) => Promise<void>;
      };
      if (orientation?.lock) {
        await orientation.lock('landscape');
      }
    } catch {
      // iOS Safari / desktop browsers may reject programmatic orientation lock; user rotates device manually
    }
  };

  return (
    <div
      data-testid="rotate-landscape-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotate-landscape-title"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-[#070b10]/96 text-center safe-inset-pad"
    >
      {/* Animated Rotate Phone SVG */}
      <div className="mb-5 text-amber-300">
        <svg
          viewBox="0 0 96 96"
          className="w-24 h-24 mx-auto"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="28"
            y="16"
            width="40"
            height="64"
            rx="6"
            stroke="currentColor"
            strokeWidth="3"
            fill="rgba(251,191,36,0.12)"
          />
          <circle cx="48" cy="72" r="2.5" fill="currentColor" />
          <path
            d="M78 44C78 28.5 66.5 16 52 14"
            stroke="#38bdf8"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M72 39L78 46L84 39"
            stroke="#38bdf8"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2 id="rotate-landscape-title" className="text-xl font-black text-amber-300 tracking-wider">
        请切换至横屏游玩《幻想大陆》
      </h2>
      <p className="mt-2 max-w-sm text-sm text-slate-300 leading-relaxed">
        本游戏为双摇杆横屏动作 RPG 体验而设计。请将手机横向旋转，以完整显示左右虚拟摇杆、技能轮盘与小地图视野。
      </p>

      <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={handleTryLandscapeLock}
          className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center gap-2 cursor-pointer shadow-lg"
        >
          <Maximize2 className="w-4 h-4" />
          全屏并尝试锁定横屏
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          暂以当前方向继续
        </button>
      </div>
    </div>
  );
}
