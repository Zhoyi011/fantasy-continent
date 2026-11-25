import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  className?: string;
}

export function PWAInstallButton({ compact = false, className = '' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isNativeShell, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled || isNativeShell) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => {
          void install();
        }}
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-400/55 bg-emerald-950/85 hover:bg-emerald-900/90 text-emerald-200 font-bold transition-transform active:scale-[0.98] cursor-pointer ${
          compact ? 'min-h-[38px] px-3 py-1.5 text-xs' : 'min-h-[42px] px-4 py-2 text-xs sm:text-sm'
        } ${className}`}
      >
        <Download className="w-4 h-4 shrink-0 text-emerald-300" />
        <span>安装到桌面 / 主屏幕</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-400/45 bg-slate-900/90 hover:bg-slate-800/95 text-sky-200 font-bold transition-transform active:scale-[0.98] cursor-pointer ${
            compact ? 'min-h-[38px] px-3 py-1.5 text-xs' : 'min-h-[42px] px-4 py-2 text-xs sm:text-sm'
          } ${className}`}
        >
          <Smartphone className="w-4 h-4 shrink-0 text-sky-300" />
          <span>添加到主屏幕</span>
        </button>

        {showIOSGuide &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              className="modal-backdrop bg-slate-950/78 z-[70]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ios-pwa-guide-title"
            >
              <div className="modal-shell modal-panel-animate max-w-sm max-h-[92dvh] rounded-xl border-2 border-sky-400/45 bg-[#0c1422]/98 shadow-[0_24px_80px_rgba(0,0,0,0.92)]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
                  <h3 id="ios-pwa-guide-title" className="text-base font-bold text-sky-200">
                    在 iPhone / iPad 安装《幻想大陆》
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowIOSGuide(false)}
                    aria-label="关闭指引"
                    className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto game-scroll p-4 space-y-2.5 text-xs sm:text-sm text-slate-200 leading-relaxed">
                  <p>Safari 不支持网页一键安装弹窗，请按以下 2 步完成离线应用添加：</p>
                  <div className="rounded-lg bg-slate-900/90 border border-slate-700/80 p-3 space-y-1.5">
                    <p>
                      <strong className="text-amber-300">1.</strong> 点击 Safari 工具栏底部的
                      <strong className="text-sky-300">「共享」</strong>按钮（向上箭头图标）。
                    </p>
                    <p>
                      <strong className="text-amber-300">2.</strong> 向下滑动菜单，点击
                      <strong className="text-emerald-300">「添加到主屏幕」</strong>并确认。
                    </p>
                  </div>
                  <p className="text-xs text-slate-400">
                    添加后即可从主屏幕全屏启动，并支持核心单机玩法断网离线游玩。
                  </p>
                </div>

                <div className="px-4 py-3 border-t border-slate-800 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowIOSGuide(false)}
                    className="w-full min-h-[42px] rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-extrabold cursor-pointer"
                  >
                    我知道了
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-3 left-3 z-40 pointer-events-none inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-950/90 px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-amber-200 shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-300 shrink-0" />
      <span>当前处于离线模式 · 单机冒险与本地存档可正常游玩</span>
    </div>
  );
}
