import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Firebase 配置说明：
 * 由 `vite.config.ts` 在构建期按优先级读取：
 * 1) `FIREBASE_APPLET_CONFIG_JSON` / `VITE_FIREBASE_*`（GitHub Secrets 或 `.env.local`）；
 * 2) 本地 `firebase-applet-config.json`（已列入 `.gitignore`，不强制存在于 CI 仓库中）。
 * 不再静态 `import ../firebase-applet-config.json`，确保无本地配置文件时 `tsc --noEmit` 也能正常通过；
 * 若未配置密钥或处于离线状态，游戏将自动降级为「本地游客模式 (Offline/Guest Mode)」。
 */
const buildConfig: {
  readonly apiKey?: string;
  readonly authDomain?: string;
  readonly projectId?: string;
  readonly storageBucket?: string;
  readonly messagingSenderId?: string;
  readonly appId?: string;
  readonly firestoreDatabaseId?: string;
} =
  typeof __FIREBASE_CONFIG__ !== 'undefined' && __FIREBASE_CONFIG__
    ? __FIREBASE_CONFIG__
    : {};

const env: Partial<ImportMetaEnv> =
  typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

const readField = (
  envValue: string | undefined,
  buildValue: string | undefined,
  fallback = ''
): string => String(envValue || buildValue || fallback).trim();

export const firebaseConfig = {
  apiKey: readField(env.VITE_FIREBASE_API_KEY, buildConfig.apiKey),
  authDomain: readField(env.VITE_FIREBASE_AUTH_DOMAIN, buildConfig.authDomain),
  projectId: readField(env.VITE_FIREBASE_PROJECT_ID, buildConfig.projectId),
  storageBucket: readField(env.VITE_FIREBASE_STORAGE_BUCKET, buildConfig.storageBucket),
  messagingSenderId: readField(env.VITE_FIREBASE_MESSAGING_SENDER_ID, buildConfig.messagingSenderId),
  appId: readField(env.VITE_FIREBASE_APP_ID, buildConfig.appId),
  firestoreDatabaseId: readField(
    env.VITE_FIREBASE_DATABASE_ID,
    buildConfig.firestoreDatabaseId,
    '(default)'
  ),
};

export function getFirebaseMissingFields(): string[] {
  const missing: string[] = [];
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes('YOUR_')) {
    missing.push('API Key (VITE_FIREBASE_API_KEY / FIREBASE_API_KEY)');
  }
  if (!firebaseConfig.projectId || firebaseConfig.projectId.includes('remixed-project-id')) {
    missing.push('Project ID (projectId)');
  }
  if (!firebaseConfig.appId) {
    missing.push('App ID (appId)');
  }
  return missing;
}

export function isFirebaseConfigured(): boolean {
  return getFirebaseMissingFields().length === 0;
}

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

if (isFirebaseConfigured()) {
  try {
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } catch (err) {
    console.warn('Firebase initialization failed, falling back to Guest Mode:', err);
    app = null;
    authInstance = null;
    dbInstance = null;
  }
}

export const auth = authInstance;
export const db = dbInstance;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentUser = authInstance?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid ?? null,
      email: currentUser?.email ?? null,
      emailVerified: currentUser?.emailVerified ?? null,
      isAnonymous: currentUser?.isAnonymous ?? null,
      tenantId: currentUser?.tenantId ?? null,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  if (!dbInstance) return;
  try {
    await getDocFromServer(doc(dbInstance, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration (client is offline).');
    }
  }
}

if (typeof window !== 'undefined' && dbInstance) {
  void testConnection();
}

export function subscribeAuth(cb: (user: User | null) => void): () => void {
  if (!authInstance) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(authInstance, cb);
}

export async function signInWithGoogle(): Promise<User> {
  if (!authInstance) {
    throw new Error('Firebase 尚未配置，当前处于本地游客模式。');
  }
  const cred = await signInWithPopup(authInstance, googleProvider);
  return cred.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  if (!authInstance) {
    throw new Error('Firebase 尚未配置，当前处于本地游客模式。');
  }
  const cred = await signInWithEmailAndPassword(authInstance, email.trim(), password);
  return cred.user;
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<User> {
  if (!authInstance) {
    throw new Error('Firebase 尚未配置，当前处于本地游客模式。');
  }
  const cred = await createUserWithEmailAndPassword(authInstance, email.trim(), password);
  if (displayName && displayName.trim()) {
    await updateProfile(cred.user, { displayName: displayName.trim().slice(0, 64) });
  }
  try {
    await sendEmailVerification(cred.user);
  } catch {
    // Non-fatal if verification email dispatch is throttled
  }
  return cred.user;
}

export async function resendVerificationEmail(): Promise<void> {
  if (!authInstance?.currentUser) return;
  await sendEmailVerification(authInstance.currentUser);
}

export async function signOutUser(): Promise<void> {
  if (!authInstance) return;
  await signOut(authInstance);
}
