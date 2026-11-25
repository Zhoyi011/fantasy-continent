import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import { defineConfig } from 'vite';
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

function loadFirebaseClientConfig(): Record<string, string> {
  const fromEnvJson = (process.env.FIREBASE_APPLET_CONFIG_JSON || '').trim();
  if (fromEnvJson) {
    try {
      const parsed = JSON.parse(fromEnvJson) as Record<string, unknown>;
      return {
        apiKey: String(parsed.apiKey ?? ''),
        authDomain: String(parsed.authDomain ?? ''),
        projectId: String(parsed.projectId ?? ''),
        storageBucket: String(parsed.storageBucket ?? ''),
        messagingSenderId: String(parsed.messagingSenderId ?? ''),
        appId: String(parsed.appId ?? ''),
        firestoreDatabaseId: String(parsed.firestoreDatabaseId ?? '(default)'),
      };
    } catch {
      console.warn('[vite.config] Invalid FIREBASE_APPLET_CONFIG_JSON ignored.');
    }
  }

  const localConfigPath = path.resolve(import.meta.dirname, 'firebase-applet-config.json');
  if (fs.existsSync(localConfigPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(localConfigPath, 'utf-8')) as Record<string, unknown>;
      return {
        apiKey: String(parsed.apiKey ?? ''),
        authDomain: String(parsed.authDomain ?? ''),
        projectId: String(parsed.projectId ?? ''),
        storageBucket: String(parsed.storageBucket ?? ''),
        messagingSenderId: String(parsed.messagingSenderId ?? ''),
        appId: String(parsed.appId ?? ''),
        firestoreDatabaseId: String(parsed.firestoreDatabaseId ?? '(default)'),
      };
    } catch {
      console.warn('[vite.config] Invalid firebase-applet-config.json ignored.');
    }
  }

  return {
    apiKey: process.env.VITE_FIREBASE_API_KEY || '',
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.VITE_FIREBASE_APP_ID || '',
    firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || '(default)',
  };
}

export default defineConfig(() => {
  return {
    define: {
      __APP_VERSION__: JSON.stringify(resolvedAppVersion),
      __FIREBASE_CONFIG__: JSON.stringify(loadFirebaseClientConfig()),
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
