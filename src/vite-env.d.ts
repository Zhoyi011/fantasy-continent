/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface BuildFirebaseConfig {
  readonly apiKey?: string;
  readonly authDomain?: string;
  readonly projectId?: string;
  readonly storageBucket?: string;
  readonly messagingSenderId?: string;
  readonly appId?: string;
  readonly firestoreDatabaseId?: string;
}

declare const __APP_VERSION__: string;
declare const __FIREBASE_CONFIG__: BuildFirebaseConfig | undefined;

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_DATABASE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
