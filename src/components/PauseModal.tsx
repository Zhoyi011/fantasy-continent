import { useState } from 'react';
import { Cloud, Home, LogOut, Play, Save, Sparkles, Trophy } from 'lucide-react';
import type { PlayMode, SyncStatus } from '../game/types';
import { MCButton } from './MCButton';

interface PauseModalProps {
  syncStatus: SyncStatus;
  playMode?: PlayMode;
  roomCode?: string | null;
  onResume: () => void;
  onSaveAndSync: () => Promise<void>;
  onOpenTalents: () => void;
  onOpenBestiary: () => void;
  onReturnToMenu: () => void;
}

export function PauseModal({
  syncStatus,
  playMode = 'singleplayer',
  roomCode = null,
  onResume,
  onSaveAndSync,
  onOpenTalents,
  onOpenBestiary,
  onReturnToMenu,
}: PauseModalProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const isRoomMode = playMode === 'online';

  const handleSaveSync = async () => {
    setSyncing(true);
    setFeedback(null);
    await onSaveAndSync();
    setSyncing(false);
    setFeedback(isRoomMode ? '联机唯一角色档案已加密保存！' : '已立即保存并完成存档同步！');
  };

  return (
    <div
      className="modal-backdrop bg-slate-950/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-modal-title"
    >
      <div className="modal-shell max-w-md overflow-y-auto game-scroll rounded-xl border-2 border-slate-500/50 bg-[#0d1522]/96 p-4 sm:p-6 shadow-[0_24px_80px_rgba(0,0,0,0.92)]">
        <div className="text-center mb-3">
          <h2 id="pause-modal-title" className="text-lg sm:text-xl font-black tracking-[0.22em] text-amber-300">
            游戏已暂停
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
            {isRoomMode
              ? `房间联机模式 · 房号 ${roomCode ?? '---'} · 唯一角色独立加密存档`
              : `每 30 秒自动静默存档 · 当前状态：${
                  syncStatus === 'synced' ? '云端已同步' : '本地保护中'
                }`}
          </p>
        </div>

        {feedback && (
          <div className="mb-2.5 rounded-lg border border-sky-500/40 bg-sky-950/40 px-3 py-1.5 text-xs text-sky-200 text-center">
            {feedback}
          </div>
        )}

        <div className="space-y-2 pb-3">
          <MCButton
            variant="emerald"
            onClick={onResume}
            icon={<Play className="w-4 h-4" />}
            sublabel="ESC"
            className="!py-2.5"
          >
            继续冒险
          </MCButton>

          <MCButton
            variant="indigo"
            disabled={syncing}
            onClick={handleSaveSync}
            icon={isRoomMode ? <Save className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
            className="!py-2.5"
          >
            {syncing
              ? '正在保存...'
              : isRoomMode
              ? '保存联机角色档案'
              : '立即保存并同步云端'}
          </MCButton>

          <div className="grid grid-cols-2 gap-2">
            <MCButton
              variant="stone"
              onClick={onOpenTalents}
              icon={<Sparkles className="w-4 h-4 text-sky-300" />}
              className="!px-3 !py-2"
            >
              远古遗迹
            </MCButton>
            <MCButton
              variant="stone"
              onClick={onOpenBestiary}
              icon={<Trophy className="w-4 h-4 text-amber-300" />}
              className="!px-3 !py-2"
            >
              图鉴成就
            </MCButton>
          </div>

          <div className="pt-1">
            <MCButton
              variant="danger"
              onClick={onReturnToMenu}
              icon={isRoomMode ? <LogOut className="w-4 h-4" /> : <Home className="w-4 h-4" />}
              className="!py-2.5"
            >
              {isRoomMode ? '保存并离开房间' : '保存并返回主菜单'}
            </MCButton>
          </div>
        </div>
      </div>
    </div>
  );
}
