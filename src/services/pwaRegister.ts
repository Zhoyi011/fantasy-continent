import { isNativeClientShell } from './platform';

let swInitialized = false;

export function registerWebPWA(): void {
  if (swInitialized || typeof window === 'undefined') return;
  if (isNativeClientShell()) return;
  if (!('serviceWorker' in navigator)) return;

  swInitialized = true;
  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onRegisterError() {
          // Offline or restricted preview environment: fail silently without blocking gameplay
        },
      });
    })
    .catch(() => {
      // Ignore if virtual module is unavailable in non-PWA contexts
    });
}
