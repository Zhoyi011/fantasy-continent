import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const rootPkg = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf-8')
);
const tagVersionEnv =
  process.env.GITHUB_REF_NAME && /^v?\d+\.\d+\.\d+/.test(process.env.GITHUB_REF_NAME.trim())
    ? process.env.GITHUB_REF_NAME.trim()
    : '';
const resolvedAppVersion = (
  process.env.RELEASE_VERSION ||
  tagVersionEnv ||
  rootPkg.version ||
  '1.0.0'
)
  .replace(/^refs\/tags\//i, '')
  .replace(/^v/i, '')
  .trim();

function loadFirebaseClientConfig(env: Record<string, string>): Record<string, string> {
  const readVar = (...keys: string[]): string => {
    for (const k of keys) {
      const val = (env[k] || process.env[k] || '').trim();
      if (val) return val;
    }
    return '';
  };

  const envOverrides = {
    apiKey: readVar('VITE_FIREBASE_API_KEY', 'FIREBASE_API_KEY'),
    authDomain: readVar('VITE_FIREBASE_AUTH_DOMAIN', 'FIREBASE_AUTH_DOMAIN'),
    projectId: readVar('VITE_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID'),
    storageBucket: readVar('VITE_FIREBASE_STORAGE_BUCKET', 'FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: readVar('VITE_FIREBASE_MESSAGING_SENDER_ID', 'FIREBASE_MESSAGING_SENDER_ID'),
    appId: readVar('VITE_FIREBASE_APP_ID', 'FIREBASE_APP_ID'),
    firestoreDatabaseId: readVar('VITE_FIREBASE_DATABASE_ID', 'FIREBASE_DATABASE_ID'),
  };

  const mergeWithParsed = (parsed: Record<string, unknown>): Record<string, string> => ({
    apiKey: envOverrides.apiKey || String(parsed.apiKey ?? '').trim(),
    authDomain: envOverrides.authDomain || String(parsed.authDomain ?? '').trim(),
    projectId: envOverrides.projectId || String(parsed.projectId ?? '').trim(),
    storageBucket: envOverrides.storageBucket || String(parsed.storageBucket ?? '').trim(),
    messagingSenderId: envOverrides.messagingSenderId || String(parsed.messagingSenderId ?? '').trim(),
    appId: envOverrides.appId || String(parsed.appId ?? '').trim(),
    firestoreDatabaseId:
      envOverrides.firestoreDatabaseId || String(parsed.firestoreDatabaseId ?? '(default)').trim() || '(default)',
  });

  const fromEnvJson = readVar('FIREBASE_APPLET_CONFIG_JSON');
  if (fromEnvJson) {
    try {
      return mergeWithParsed(JSON.parse(fromEnvJson) as Record<string, unknown>);
    } catch {
      console.warn('[vite.config] Invalid FIREBASE_APPLET_CONFIG_JSON ignored.');
    }
  }

  const localConfigPath = path.resolve(import.meta.dirname, 'firebase-applet-config.json');
  if (fs.existsSync(localConfigPath)) {
    try {
      return mergeWithParsed(JSON.parse(fs.readFileSync(localConfigPath, 'utf-8')) as Record<string, unknown>);
    } catch {
      console.warn('[vite.config] Invalid firebase-applet-config.json ignored.');
    }
  }

  return {
    apiKey: envOverrides.apiKey,
    authDomain: envOverrides.authDomain,
    projectId: envOverrides.projectId,
    storageBucket: envOverrides.storageBucket,
    messagingSenderId: envOverrides.messagingSenderId,
    appId: envOverrides.appId,
    firestoreDatabaseId: envOverrides.firestoreDatabaseId || '(default)',
  };
}

export default defineConfig(({ mode }) => {
  const loadedEnv = loadEnv(mode, import.meta.dirname, '');
  return {
    define: {
      __APP_VERSION__: JSON.stringify(resolvedAppVersion),
      __FIREBASE_CONFIG__: JSON.stringify(loadFirebaseClientConfig(loadedEnv)),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg', 'version.json'],
        manifest: {
          id: '/',
          name: '幻想大陆',
          short_name: '幻想大陆',
          description:
            '幻想大陆 · 觉醒编年史 — Canvas 2D 跨平台暗黑幻想动作 RPG，支持离线冒险、多职业觉醒与联机合作。',
          theme_color: '#070b10',
          background_color: '#070b10',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          lang: 'zh-CN',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/version.json', '**/assets/aistudio/**'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/ws/, /^\/version\.json$/],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /\/version\.json(?:\?.*)?$/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'fantasy-continent-version-meta',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 4,
                  maxAgeSeconds: 60 * 60 * 24,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
