import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, History, Sparkles, Wrench, X, Zap } from 'lucide-react';
import type { VersionManifest } from '../services/appUpdate';
import {
  detectRuntimePlatform,
  getAppVersion,
  getPlatformLabel,
  openExternalDownloadUrl,
} from '../services/platform';

interface ClientUpdateModalProps {
  manifest: VersionManifest;
  onOpenHistory: () => void;
  onDismiss: () => void;
}

export function ClientUpdateModal({
  manifest,
  onOpenHistory,
  onDismiss,
}: ClientUpdateModalProps) {
  const platform = detectRuntimePlatform();
  const currentVersion = getAppVersion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  if (typeof document === 'undefined' || platform === 'web') return null;

  const primaryDownloadUrl =
    platform === 'windows'
      ? manifest.downloads.windowsSetup
      : platform === 'android'
      ? manifest.downloads.androidApk
      : platform === 'linux'
      ? manifest.downloads.linuxAppImage
      : manifest.repository;

  const primaryButtonLabel =
    platform === 'windows'
      ? '立即下载新版安装程序 (.exe)'
      : platform === 'android'
      ? '立即下载新版 APK 安装包'
      : platform === 'linux'
      ? '下载新版 AppImage'
      : '前往 Release 下载新版';

  const secondaryUrl =
    platform === 'windows'
      ? manifest.downloads.windowsPortable
      : platform === 'linux'
      ? manifest.downloads.linuxDeb
      : null;

  const secondaryLabel =
    platform === 'windows'
      ? '下载绿色便携版 (.exe)'
      : platform === 'linux'
      ? '下载 Debian/Ubuntu 包 (.deb)'
      : null;

  return createPortal(
    <div
      className="modal-backdrop bg-slate-950/82 z-[72]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-update-title"
    >
      <div className="modal-shell modal-panel-animate max-w-lg max-h-[92dvh] rounded-xl border-2 border-emerald-400/50 bg-[#0c1422]/98 shadow-[0_24px_80px_rgba(0,0,0,0.92)]">
        {/* 固定头部 */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-800 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-400 text-slate-950 text-[11px] font-black">
                发现新版本 {manifest.tag}
              </span>
              <span className="text-[11px] text-slate-400 truncate">
                {getPlatformLabel(platform)}
              </span>
            </div>
            <h2
              id="client-update-title"
              className="text-base sm:text-lg font-black text-slate-100 mt-1 truncate"
            >
              {manifest.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="暂不更新"
            className="w-10 h-10 rounded-lg bg-slate-800/90 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内部可滚动更新内容区 */}
        <div className="flex-1 min-h-0 overflow-y-auto game-scroll px-4 py-3.5 sm:px-6 space-y-3 text-xs text-slate-200">
          <div className="rounded-lg border border-slate-700/80 bg-slate-900/75 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300 tabular-nums">
            <span>
              当前版本：<strong className="text-slate-100">v{currentVersion}</strong> → 最新版：
              <strong className="text-emerald-300">{manifest.tag}</strong>
            </span>
            {manifest.releaseDate && <span>发布于 {manifest.releaseDate}</span>}
          </div>

          {manifest.highlights && (
            <p className="text-xs sm:text-sm text-amber-200 font-semibold leading-relaxed">
              {manifest.highlights}
            </p>
          )}

          {manifest.categories.features.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                新增功能
              </div>
              <ul className="space-y-1 pl-4 list-disc leading-relaxed">
                {manifest.categories.features.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {manifest.categories.improvements.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 shrink-0" />
                优化体验
              </div>
              <ul className="space-y-1 pl-4 list-disc leading-relaxed">
                {manifest.categories.improvements.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {manifest.categories.fixes.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 shrink-0" />
                问题修复
              </div>
              <ul className="space-y-1 pl-4 list-disc leading-relaxed">
                {manifest.categories.fixes.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 固定底部操作栏 */}
        <div className="px-4 py-3 sm:px-6 border-t border-slate-800 space-y-2 shrink-0">
          <button
            type="button"
            onClick={() => void openExternalDownloadUrl(primaryDownloadUrl)}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-gradient-to-b from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-slate-950 text-sm font-black inline-flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-[0.98]"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>{primaryButtonLabel}</span>
          </button>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {secondaryUrl && secondaryLabel && (
                <button
                  type="button"
                  onClick={() => void openExternalDownloadUrl(secondaryUrl)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-sky-400/40 bg-slate-900 hover:bg-slate-800 text-xs font-bold text-sky-300 cursor-pointer"
                >
                  {secondaryLabel}
                </button>
              )}
              <button
                type="button"
                onClick={onOpenHistory}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-amber-400/40 bg-amber-950/25 hover:bg-amber-950/45 text-xs font-bold text-amber-300 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <History className="w-3.5 h-3.5 shrink-0" />
                版本更新历史
              </button>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer ml-auto"
            >
              稍后提醒
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
