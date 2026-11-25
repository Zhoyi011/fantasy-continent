import { useState, type FormEvent } from 'react';
import { Cloud, LogIn, LogOut, Mail, RefreshCw, UserPlus, X } from 'lucide-react';
import {
  isFirebaseConfigured,
  registerWithEmail,
  resendVerificationEmail,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
} from '../firebase';
import type { AccountData, AuthUserInfo, SyncStatus } from '../game/types';

interface AuthModalProps {
  user: AuthUserInfo;
  account: AccountData;
  syncStatus: SyncStatus;
  onForceSync: () => Promise<void>;
  onClose: () => void;
}

function translateAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('auth/operation-not-allowed')) {
    return '邮箱密码登录尚未在 Firebase 控制台启用，请先在 Firebase Console -> Authentication -> Sign-in method 中开启「电子邮件/密码」，或使用 Google 一键登录。';
  }
  if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
    return '邮箱或密码不正确，请核对后重试。';
  }
  if (msg.includes('auth/user-not-found')) {
    return '该邮箱尚未注册，请切换到注册页创建账号。';
  }
  if (msg.includes('auth/email-already-in-use')) {
    return '该邮箱已被注册，请直接登录。';
  }
  if (msg.includes('auth/weak-password')) {
    return '密码长度至少需要 6 位字符。';
  }
  if (msg.includes('auth/popup-closed-by-user')) {
    return '已取消 Google 登录弹窗。';
  }
  if (msg.includes('auth/unauthorized-domain')) {
    return '当前预览域名尚未添加到 Firebase Authorized Domains，可先使用本地游客模式。';
  }
  return msg;
}

export function AuthModal({
  user,
  account,
  syncStatus,
  onForceSync,
  onClose,
}: AuthModalProps) {
  const configured = isFirebaseConfigured();
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      await signInWithGoogle();
      setInfoMsg('Google 登录成功，已自动同步云端存档！');
    } catch (err) {
      setErrorMsg(translateAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('请输入邮箱和密码。');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      if (authTab === 'login') {
        await signInWithEmail(email, password);
        setInfoMsg('登录成功，正在拉取云端存档...');
      } else {
        await registerWithEmail(email, password, displayName);
        setInfoMsg('注册成功！已发送验证邮件，验证邮箱后即可开启云端存档同步。');
      }
    } catch (err) {
      setErrorMsg(translateAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop bg-slate-950/75"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="modal-shell max-w-xl rounded-xl border-2 border-sky-400/40 bg-[#0c1422]/96 p-3.5 sm:p-6 shadow-[0_24px_80px_rgba(0,0,0,0.92)]">
        <div className="flex items-center justify-between pb-2.5 sm:pb-3 border-b border-slate-800 shrink-0">
          <div className="min-w-0 pr-2">
            <h2 id="auth-modal-title" className="text-base sm:text-lg font-bold text-sky-300 flex items-center gap-2 truncate">
              <Cloud className="w-5 h-5 shrink-0" />
              账号与云端存档中心
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
              支持 Firebase 云存档双端同步，未登录时无缝使用本地游客模式
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭账号窗口"
            className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto game-scroll pr-1 pb-5">

        {/* Current User Status Card */}
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/80 p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-100">
              {user.displayName}{' '}
              <span className="text-xs font-normal text-slate-400">
                ({user.isGuest ? '本地游客模式' : user.email ?? 'Firebase 账号'})
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-1 tabular-nums">
              灵魂石：💠 {account.soulStones} · 同步状态：
              <strong className="text-sky-300 ml-1">
                {syncStatus === 'synced'
                  ? '云端已同步'
                  : syncStatus === 'syncing'
                  ? '同步中...'
                  : syncStatus === 'unverified'
                  ? '邮箱待验证（本地已保护）'
                  : syncStatus === 'error'
                  ? '网络离线（本地已保存）'
                  : '仅本地保存'}
              </strong>
            </div>
          </div>

          {!user.isGuest && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onForceSync();
                  setBusy(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                同步
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  await signOutUser();
                  setInfoMsg('已退出登录并切换回本地游客模式。');
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                退出
              </button>
            </div>
          )}
        </div>

        {!user.isGuest && !user.emailVerified && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/35 px-3.5 py-2.5 text-xs text-amber-200 flex items-center justify-between gap-2">
            <span>您的邮箱尚未验证，验证后即可解锁 Firestore 云端写入权限。</span>
            <button
              type="button"
              onClick={async () => {
                await resendVerificationEmail();
                setInfoMsg('已重新发送验证邮件，请检查收件箱。');
              }}
              className="px-2.5 py-1 rounded bg-amber-400 text-slate-950 font-bold shrink-0 cursor-pointer"
            >
              重发验证邮件
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="mt-3 rounded-lg border border-rose-500/45 bg-rose-950/45 px-3.5 py-2.5 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}
        {infoMsg && (
          <div className="mt-3 rounded-lg border border-emerald-500/45 bg-emerald-950/45 px-3.5 py-2.5 text-xs text-emerald-200">
            {infoMsg}
          </div>
        )}

        {/* Auth Controls */}
        {user.isGuest && (
          <div className="mt-4 space-y-4">
            {!configured && (
              <div className="rounded-lg border border-amber-500/35 bg-amber-950/25 p-3 text-xs text-amber-200">
                当前未检测到有效 Firebase API Key，游戏处于「本地游客模式」。配置{' '}
                <code>VITE_FIREBASE_API_KEY</code>（或 GitHub Secret <code>FIREBASE_API_KEY</code>）后即可启用云端同步。
              </div>
            )}

            <button
              type="button"
              disabled={!configured || busy}
              onClick={handleGoogleLogin}
              className="w-full py-2.5 px-4 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-45 text-slate-900 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <LogIn className="w-4 h-4 text-sky-600" />
              使用 Google 账号一键登录
            </button>

            <div className="border-t border-slate-800 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setAuthTab('login')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer ${
                    authTab === 'login' ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  邮箱登录
                </button>
                <button
                  type="button"
                  onClick={() => setAuthTab('register')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer ${
                    authTab === 'register' ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  注册新账号
                </button>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-2.5">
                {authTab === 'register' && (
                  <div>
                    <label htmlFor="auth-display-name" className="block text-xs text-slate-400 mb-1">
                      冒险者昵称
                    </label>
                    <input
                      id="auth-display-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="例如：圣光勇者"
                      maxLength={32}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:border-sky-400 outline-none"
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="auth-email" className="block text-xs text-slate-400 mb-1">
                    邮箱地址
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:border-sky-400 outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="auth-password" className="block text-xs text-slate-400 mb-1">
                    密码
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少 6 位字符"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:border-sky-400 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!configured || busy}
                  className="w-full py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-45 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  {authTab === 'login' ? <Mail className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  {authTab === 'login' ? '邮箱登录' : '注册并发送验证邮件'}
                </button>
              </form>
            </div>
          </div>
        )}

        </div>
      </div>
    </div>
  );
}
