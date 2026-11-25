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
import rawConfig from '../firebase-applet-config.json';

/**
 * Firebase 配置说明：
 * `apiKey` 优先读取构建环境变量 `VITE_FIREBASE_API_KEY`（本地 `.env.local` 或 GitHub Secret `FIREBASE_API_KEY`），
 * 其余项目标识保留在 `firebase-applet-config.json` 中，避免公开仓库触发密钥泄露告警。
 * 若未配置密钥或处于离线状态，游戏将自动降级为「本地游客模式 (Offline/Guest Mode)」，
 * 所有存档、灵魂石与天赋树进度均无缝保存在浏览器 localStorage 中，不会报错崩溃。
 */
const envFirebaseApiKey =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_API_KEY
    ? String(import.meta.env.VITE_FIREBASE_API_KEY).trim()
    : '';

export const firebaseConfig = {
  apiKey: envFirebaseApiKey || String(rawConfig.apiKey || '').trim(),
  authDomain: rawConfig.authDomain || '',
  projectId: rawConfig.projectId || '',
  storageBucket: rawConfig.storageBucket || '',
  messagingSenderId: rawConfig.messagingSenderId || '',
  appId: rawConfig.appId || '',
  firestoreDatabaseId: rawConfig.firestoreDatabaseId || '(default)',
};

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.appId &&
      !firebaseConfig.apiKey.includes('YOUR_') &&
      !firebaseConfig.projectId.includes('remixed-project-id')
  );
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
