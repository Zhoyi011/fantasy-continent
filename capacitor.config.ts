import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zhoyi.fantasycontinent',
  appName: '幻想大陆',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: [
      'github.com',
      'objects.githubusercontent.com',
      'release-assets.githubusercontent.com',
      'api.github.com',
    ],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
