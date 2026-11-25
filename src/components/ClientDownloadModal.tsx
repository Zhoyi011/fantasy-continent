import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, Laptop, Smartphone, Terminal, X } from 'lucide-react';
import { DEFAULT_DOWNLOAD_LINKS, GITHUB_REPO_URL } from '../services/appUpdate';
import { detectRuntimePlatform, getAppVersion, openExternalDownloadUrl } from '../services/platform';
import { PWAInstallButton } from './PWAInstallButton';

interface ClientDownloadModalProps {
  onOpenChangelog: () => void;
  onClose: () => void;
}

const PACKAGES = [
  {
    id: 'windows-setup',
    platform: 'windows',
    title: 'Windows 安装版 (.exe)',
    desc: '推荐 · 自动创建桌面与开始菜单快捷方式（兼容 Win10 / Win11）',
    filename: 'fantasy-continent-windows-setup.exe',
    url: DEFAULT_DOWNLOAD_LINKS.windowsSetup,
    icon: Laptop,
    accent: 'text-sky-300 border-sky-400/45 bg-sky-950/25',
  },
  {
    id: 'windows-portable',
    platform: 'windows',
    title: 'Windows 绿色便携版 (.exe)',
    desc: '免安装单文件直启，可放入 U 盘随身携带游玩',
    filename: 'fantasy-continent-windows-portable.exe',
    url: DEFAULT_DOWNLOAD_LINKS.windowsPortable,
    icon: Laptop,
    accent: 'text-cyan-300 border-cyan-400/35 bg-slate-900/70',
  },
  {
    id: 'android-apk',
    platform: 'android',
    title: 'Android 正式签名安装包 (.apk)',
    desc: '包名 com.zhoyi.fantasycontinent · 原生触控全屏适配与离线畅玩',
    filename: 'fantasy-continent-android.apk',
    url: DEFAULT_DOWNLOAD_LINKS.androidApk,
    icon: Smartphone,
    accent: 'text-emerald-300 border-emerald-400/45 bg-emerald-950/20',
  },
  {
    id: 'linux-appimage',
    platform: 'linux',
    title: 'Linux AppImage 通用包',
    desc: '兼容 Ubuntu 22.04+ / Debian 12+（glibc 2.35+），赋予可执行权限即运行',
    filename: 'fantasy-continent-linux.AppImage',
    url: DEFAULT_DOWNLOAD_LINKS.linuxAppImage,
    icon: Terminal,
    accent: 'text-amber-300 border-amber-400/40 bg-slate-900/70',
  },
  {
    id: 'linux-deb',
    platform: 'linux',
    title: 'Linux Debian / Ubuntu 安装包 (.deb)',
    desc: '包名 fantasy-continent · 一键 apt/dpkg 安装并自动写入桌面菜单',
    filename: 'fantasy-continent-linux.deb',
    url: DEFAULT_DOWNLOAD_LINKS.linuxDeb,
    icon: Terminal,
    accent: 'text-amber-200 border-slate-600 bg-slate-900/70',
  },
] as const;

export function ClientDownloadModal({ onOpenChangelog, onClose }: ClientDownloadModalProps) {
  const currentPlatform = detectRuntimePlatform();
  const currentVersion = getAppVersion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="modal-backdrop bg-slate-950/80 z-[64]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-modal-title"
    >
      <div className="modal-shell modal-panel-animate max-w-2xl max-h-[92dvh] rounded-xl border-2 border-sky-400/40 bg-[#0c1422]/98 shadow-[0_24px_80px_rgba(0,0,0,0.92)]">
        {/* 固定头部 */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-800 shrink-0">
          <div className="min-w-0">
            <h2
              id="download-modal-title"
              className="text-base sm:text-lg font-black text-sky-300 flex items-center gap-2 truncate"
            >
              <Download className="w-5 h-5 shrink-0" />
              全端客户端下载 · 《幻想大陆》
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
              当前版本 v{currentVersion} · 全端安装包直连 GitHub Releases 最新稳定版
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭客户端下载"
            className="w-10 h-10 rounded-lg bg-slate-800/90 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内部可滚动列表 */}
        <div className="flex-1 min-h-0 overflow-y-auto game-scroll px-4 py-3.5 sm:px-6 space-y-2.5">
          {PACKAGES.map((pkg) => {
            const Icon = pkg.icon;
            const isCurrent = pkg.platform === currentPlatform;
            return (
              <div
                key={pkg.id}
                className={`rounded-xl border p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${pkg.accent}`}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-bold text-slate-100">{pkg.title}</span>
                    {isCurrent && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-400/20 border border-emerald-400/45 text-[10px] font-bold text-emerald-300">
                        当前平台
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300/90 leading-snug">{pkg.desc}</p>
                  <p className="text-[11px] text-slate-400 font-mono truncate">{pkg.filename}</p>
                </div>

                <button
                  type="button"
                  onClick={() => void openExternalDownloadUrl(pkg.url)}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-transform active:scale-[0.98]"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>下载安装包</span>
                </button>
              </div>
            );
          })}

          <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-amber-300">PWA 浏览器离线应用：</strong>
              无需下载安装包即可将《幻想大陆》固定到桌面或手机主屏幕，支持离线缓存单机畅玩。
            </div>
            <PWAInstallButton compact className="shrink-0" />
          </div>
        </div>

        {/* 固定底部操作栏 */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 sm:px-6 border-t border-slate-800 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenChangelog}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-amber-400/40 bg-amber-950/30 hover:bg-amber-950/50 text-xs font-bold text-amber-300 cursor-pointer"
            >
              查看版本更新历史
            </button>
            <button
              type="button"
              onClick={() => void openExternalDownloadUrl(`${GITHUB_REPO_URL}/releases/latest`)}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-600 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              GitHub Release 页面
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-5 py-2 rounded-lg bg-slate-200 hover:bg-white text-slate-950 text-sm font-black cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
