import { useEffect } from 'react';
import {
  BookOpen,
  Cloud,
  CloudOff,
  Download,
  Globe,
  History,
  Laptop,
  Play,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  User,
} from 'lucide-react';
import { getAccountLevel } from '../game/rules';
import type { AccountData, AuthUserInfo, PlayMode, SyncStatus } from '../game/types';
import { getAppVersion } from '../services/platform';
import { MCButton } from './MCButton';
import { PWAInstallButton } from './PWAInstallButton';

interface MainMenuProps {
  account: AccountData;
  user: AuthUserInfo;
  syncStatus: SyncStatus;
  playMode: PlayMode;
  onlineConnected: boolean;
  subModalOpen: boolean;
  onPlayModeChange: (mode: PlayMode) => void;
  onOpenSaveSlots: () => void;
  onOpenTalents: () => void;
  onOpenBestiary: () => void;
  onOpenAuth: () => void;
  onOpenSettings: () => void;
  onOpenDownload: () => void;
  onOpenChangelog: () => void;
}

const SYNC_LABEL: Record<SyncStatus, string> = {
  local: '本地保存',
  syncing: '云端同步中...',
  synced: '云端已同步',
  unverified: '邮箱待验证 (本地已存)',
  error: '离线保护中',
};

export function MainMenu({
  account,
  user,
  syncStatus,
  playMode,
  onlineConnected,
  subModalOpen,
  onPlayModeChange,
  onOpenSaveSlots,
  onOpenTalents,
  onOpenBestiary,
  onOpenAuth,
  onOpenSettings,
  onOpenDownload,
  onOpenChangelog,
}: MainMenuProps) {
  const hasAnySave =
    playMode === 'online'
      ? Boolean(account.slots.slot1)
      : Boolean(account.slots.slot1 || account.slots.slot2 || account.slots.slot3);
  const accountLv = getAccountLevel(account);
  const appVersion = getAppVersion();

  useEffect(() => {
    if (subModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpenSaveSlots();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [subModalOpen, onOpenSaveSlots]);

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-7 safe-inset-pad landscape-menu-shell bg-[radial-gradient(circle_at_center,rgba(7,11,18,0.42)_0%,rgba(6,9,15,0.82)_100%)] overflow-y-auto game-scroll">
      {/* Top Row: Platform Actions + Player Account Info Card */}
      <div className="flex flex-wrap items-start justify-between gap-2.5 sm:gap-4 shrink-0">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onOpenDownload}
            className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#0d1522]/90 hover:bg-[#131f33]/95 border border-sky-400/45 text-sky-200 text-xs font-bold inline-flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-sky-300 shrink-0" />
            <span>全端下载</span>
          </button>

          <button
            type="button"
            onClick={onOpenChangelog}
            className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#0d1522]/90 hover:bg-[#131f33]/95 border border-amber-400/40 text-amber-200 text-xs font-bold inline-flex items-center gap-1.5 shadow-md cursor-pointer transition-colors tabular-nums"
          >
            <History className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>v{appVersion}</span>
          </button>

          <PWAInstallButton compact />

          {playMode === 'online' && (
            <span className="hidden md:inline-block px-2 py-0.5 rounded bg-cyan-950/90 border border-cyan-400/45 text-cyan-200 text-xs font-bold">
              房间联机 · 单角色加密存档
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenAuth}
          aria-label="管理账号与云存档"
          className="ml-auto flex items-center gap-2.5 px-3 py-1.5 sm:px-4 sm:py-2.5 rounded-lg bg-[#0d1522]/90 hover:bg-[#131f33]/95 border-2 border-slate-500/45 shadow-lg cursor-pointer transition-colors text-left"
        >
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName}
              referrerPolicy="no-referrer"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-md border border-amber-300/60 object-cover shrink-0"
            />
          ) : (
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-slate-800 border border-slate-600 flex items-center justify-center text-sky-300 shrink-0">
              <User className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-100 truncate">
              <span className="truncate max-w-[130px] sm:max-w-[160px]">{account.displayName}</span>
              <span className="text-xs font-semibold text-amber-300 tabular-nums">
                Lv.{accountLv}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] sm:text-xs text-slate-300 tabular-nums mt-0.5">
              <span className="text-sky-300 font-semibold">💠 {account.soulStones} 灵魂石</span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1 text-slate-400">
                {syncStatus === 'synced' || onlineConnected ? (
                  <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <CloudOff className="w-3.5 h-3.5 text-slate-400" />
                )}
                {playMode === 'online'
                  ? onlineConnected
                    ? '房间已连通'
                    : hasAnySave
                    ? '联机专属存档'
                    : '新建联机角色'
                  : SYNC_LABEL[syncStatus]}
              </span>
            </div>
          </div>
        </button>
      </div>

      {/* Center: Title Crest & MC-Style Menu Buttons */}
      <main className="mx-auto w-full max-w-[540px] flex flex-col items-center my-auto py-0.5">
        {/* Bespoke SVG Crest + Metallic Title */}
        <div className="flex flex-col items-center text-center mb-3 sm:mb-6 landscape-title-block">
          <svg
            viewBox="0 0 88 44"
            className="w-14 h-7 sm:w-20 sm:h-10 mb-1 sm:mb-2 landscape-title-crest text-amber-300 drop-shadow-[0_4px_14px_rgba(251,191,36,0.45)]"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M44 3L54 19L82 22L58 31L44 41L30 31L6 22L34 19L44 3Z"
              stroke="currentColor"
              strokeWidth="2.2"
              fill="rgba(251,191,36,0.18)"
            />
            <path d="M44 9L48 22L44 35L40 22L44 9Z" fill="currentColor" />
            <circle cx="44" cy="22" r="4" fill="#38bdf8" />
          </svg>

          <h1 className="text-3xl sm:text-5xl font-black tracking-[0.28em] landscape-title-h1 text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-300 to-amber-600 drop-shadow-[0_4px_18px_rgba(0,0,0,0.95)] pl-[0.28em]">
            幻想大陆
          </h1>
          <div className="mt-0.5 text-[10px] sm:text-sm font-bold tracking-[0.34em] text-sky-200/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] pl-[0.34em]">
            FANTASY CONTINENT · REBORN
          </div>
        </div>

        {/* MC-Style Action Stack (adapts to 2-column grid on short landscape phones) */}
        <div className="w-full max-w-[460px] space-y-2.5 sm:space-y-3 landscape-compact-menu bg-[#0a101b]/82 border-2 border-slate-600/50 rounded-xl p-3 sm:p-5 shadow-[0_24px_70px_rgba(0,0,0,0.85)]">
          {/* PlayMode Segmented Switcher (Singleplayer vs Isolated PeerJS Room Mode) */}
          <div className="landscape-compact-menu-primary space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-950/95 border border-slate-700/80 shadow-inner">
              <button
                type="button"
                data-testid="mode-btn-singleplayer"
                onClick={() => onPlayModeChange('singleplayer')}
                className={`min-h-[38px] px-2 sm:px-3 py-1.5 rounded-md text-xs font-extrabold whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  playMode === 'singleplayer'
                    ? 'bg-gradient-to-b from-emerald-300 to-emerald-500 text-slate-950 shadow-[0_2px_10px_rgba(16,185,129,0.35)]'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <Laptop className="w-3.5 h-3.5 shrink-0" />
                单机模式
              </button>
              <button
                type="button"
                data-testid="mode-btn-online"
                onClick={() => onPlayModeChange('online')}
                className={`min-h-[38px] px-2 sm:px-3 py-1.5 rounded-md text-xs font-extrabold whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  playMode === 'online'
                    ? 'bg-gradient-to-b from-cyan-300 to-sky-400 text-slate-950 shadow-[0_2px_10px_rgba(56,189,248,0.35)]'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <Globe className="w-3.5 h-3.5 shrink-0" />
                多人联机（房间模式）
              </button>
            </div>
            <p className="text-[10.5px] sm:text-[11px] text-center text-slate-300/95 flex items-center justify-center gap-1 leading-tight">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
              <span>
                {playMode === 'online'
                  ? '6位数字房号 · 唯一角色加密存档，支持组队与试炼之塔，与单机完全隔离'
                  : '单机冒险存档完全独立（3 个本地/云端槽位，与联机档案互不覆盖）'}
              </span>
            </p>
          </div>

          <div className="landscape-compact-menu-primary">
            <MCButton
              variant={playMode === 'online' ? 'indigo' : 'emerald'}
              data-start="true"
              onClick={onOpenSaveSlots}
              icon={<Play className="w-5 h-5" />}
              sublabel={
                playMode === 'online'
                  ? '6位房号 · 创建 / 加入房间'
                  : hasAnySave
                  ? '3 个单机槽位'
                  : '创建新冒险'
              }
              className="!py-2.5 sm:!py-3"
            >
              {playMode === 'online'
                ? '多人联机（房间模式）'
                : hasAnySave
                ? '开始冒险 / 继续游戏'
                : '开始全新冒险'}
            </MCButton>
          </div>

          <MCButton
            variant="indigo"
            onClick={onOpenTalents}
            icon={<Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />}
            sublabel={`💠 ${account.soulStones}`}
            className="!py-2 sm:!py-3 !px-3.5 sm:!px-5"
          >
            远古遗迹
          </MCButton>

          <MCButton
            variant="stone"
            onClick={onOpenBestiary}
            icon={<Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300" />}
            sublabel={`${account.unlockedAchievements.length} 成就`}
            className="!py-2 sm:!py-3 !px-3.5 sm:!px-5"
          >
            图鉴与成就
          </MCButton>

          <MCButton
            variant="stone"
            onClick={onOpenAuth}
            icon={<Cloud className="w-4 h-4 sm:w-5 sm:h-5 text-sky-300" />}
            sublabel={user.isGuest ? '游客模式' : '已登录'}
            className="!py-2 sm:!py-3 !px-3.5 sm:!px-5"
          >
            账号与云存档
          </MCButton>

          <MCButton
            variant="stone"
            onClick={onOpenSettings}
            icon={<Settings className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300" />}
            sublabel={account.settings.muted ? '已静音' : '音效开启'}
            className="!py-2 sm:!py-3 !px-3.5 sm:!px-5"
          >
            游戏设置
          </MCButton>
        </div>
      </main>

      {/* Bottom Row: Single-Line Controls Hint */}
      <footer className="text-center text-[11px] sm:text-xs text-slate-300/85 tracking-wide flex flex-wrap items-center justify-center gap-x-3 gap-y-1 shrink-0 pt-1">
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          PC: WASD + J/左键普攻 + 技能 Q/E/C/V(1-4) + Space冲刺 + R药水 + B/T/P/N · 移动端: 左摇杆 + 右手技能盘
        </span>
      </footer>
    </div>
  );
}
