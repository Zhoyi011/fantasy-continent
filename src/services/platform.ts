export type RuntimePlatform = 'windows' | 'linux' | 'macos' | 'android' | 'web';

interface TauriInternalsLike {
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

interface CapacitorLike {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

interface NativeWindowGlobals extends Window {
  __TAURI_INTERNALS__?: TauriInternalsLike;
  __TAURI__?: unknown;
  Capacitor?: CapacitorLike;
}

export function getAppVersion(): string {
  if (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__) {
    return String(__APP_VERSION__).replace(/^v/i, '');
  }
  return '1.0.0';
}

export function isTauriShell(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as NativeWindowGlobals;
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__);
}

export function isCapacitorNativeShell(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as NativeWindowGlobals;
  const cap = w.Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === 'function') {
    return Boolean(cap.isNativePlatform());
  }
  const p = typeof cap.getPlatform === 'function' ? cap.getPlatform() : '';
  return p === 'android' || p === 'ios';
}

export function detectRuntimePlatform(): RuntimePlatform {
  if (typeof window === 'undefined') return 'web';

  if (isCapacitorNativeShell()) {
    return 'android';
  }

  if (isTauriShell()) {
    const ua = (navigator.userAgent || '').toLowerCase();
    const plat = (navigator.platform || '').toLowerCase();
    if (ua.includes('windows') || plat.includes('win')) return 'windows';
    if (ua.includes('mac') || plat.includes('mac')) return 'macos';
    return 'linux';
  }

  return 'web';
}

/**
 * 严格边界校验：
 * 仅原生客户端外壳（Windows EXE、Linux AppImage/deb、Android APK）返回 true；
 * 普通桌面/手机浏览器与浏览器安装的 PWA 均返回 false，严禁误弹客户端更新框。
 */
export function isNativeClientShell(): boolean {
  return detectRuntimePlatform() !== 'web';
}

export function getPlatformLabel(platform: RuntimePlatform): string {
  switch (platform) {
    case 'windows':
      return 'Windows 桌面客户端';
    case 'linux':
      return 'Linux 桌面客户端';
    case 'macos':
      return 'macOS 桌面客户端';
    case 'android':
      return 'Android 客户端';
    default:
      return 'Web / PWA 网页端';
  }
}

export async function openExternalDownloadUrl(url: string): Promise<void> {
  if (!url) return;
  if (typeof window === 'undefined') return;

  const w = window as NativeWindowGlobals;
  if (isTauriShell() && typeof w.__TAURI_INTERNALS__?.invoke === 'function') {
    try {
      await w.__TAURI_INTERNALS__.invoke('plugin:opener|open_url', { url });
      return;
    } catch {
      // Fallback to anchor link below
    }
  }

  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
