import { useState, type FormEvent } from 'react';
import {
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { CLASS_DEFS, getRealmName, sanitizePlayerDisplayName } from '../game/rules';
import type { SaveSlotData } from '../game/types';

interface RoomLobbyModalProps {
  defaultName: string;
  existingSlot: SaveSlotData | null;
  onCreateRoom: (params: {
    playerName: string;
    password: string;
  }) => Promise<{ ok: boolean; roomCode?: string; error?: string }>;
  onJoinRoom: (params: {
    playerName: string;
    roomCode: string;
    password: string;
  }) => Promise<{ ok: boolean; roomCode?: string; error?: string }>;
  onClose: () => void;
}

export function RoomLobbyModal({
  defaultName,
  existingSlot,
  onCreateRoom,
  onJoinRoom,
  onClose,
}: RoomLobbyModalProps) {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [playerName, setPlayerName] = useState(() =>
    sanitizePlayerDisplayName(defaultName, '冒险者')
  );
  const [createPassword, setCreatePassword] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const savedClassDef = existingSlot
    ? CLASS_DEFS[existingSlot.classId] ?? CLASS_DEFS.novice
    : null;

  const validateNickname = (): string | null => {
    const cleaned = sanitizePlayerDisplayName(playerName, '');
    if (cleaned.length < 2) {
      setErrorMsg('请输入 2~16 个字符的联机角色名');
      return null;
    }
    return cleaned;
  };

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const validName = validateNickname();
    if (!validName) return;

    setBusy(true);
    setErrorMsg(null);
    const res = await onCreateRoom({
      playerName: validName,
      password: createPassword.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setErrorMsg(res.error || '创建房间失败，请稍后重试');
    }
  };

  const handleJoinSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const validName = validateNickname();
    if (!validName) return;

    const cleanCode = joinCode.replace(/\D/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(cleanCode)) {
      setErrorMsg('请输入正确的 6 位数字房号（例如 482910）');
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    const res = await onJoinRoom({
      playerName: validName,
      roomCode: cleanCode,
      password: joinPassword.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setErrorMsg(res.error || '加入房间失败，请检查房号与密码');
    }
  };

  return (
    <div
      className="modal-backdrop bg-slate-950/78"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-lobby-title"
    >
      <div
        data-testid="room-lobby-modal"
        className="modal-shell max-w-xl rounded-xl border-2 border-cyan-400/55 bg-[#0c1421]/96 shadow-[0_24px_80px_rgba(0,0,0,0.92)] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 sm:px-5 sm:py-4 bg-gradient-to-r from-[#102033] via-[#0e1928] to-[#13182a] border-b border-cyan-400/25 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2
              id="room-lobby-title"
              className="text-base sm:text-lg font-extrabold text-cyan-200 tracking-wide flex items-center gap-2"
            >
              <Users className="w-5 h-5 text-cyan-300 shrink-0" />
              多人联机 · 房间模式
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              唯一角色加密档案 · 支持组队与试炼之塔，与单机本地存档严格隔离
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭房间大厅"
            className="w-9 h-9 rounded-lg bg-slate-800/90 hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center text-slate-300 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto game-scroll p-4 sm:p-5 space-y-4">
          {/* Persistent Single Online Profile */}
          <div className="rounded-xl bg-slate-900/75 border border-slate-700/70 p-3.5 space-y-3">
            <div>
              <label
                htmlFor="room-nickname-input"
                className="block text-xs font-bold text-slate-200 mb-1"
              >
                联机冒险者昵称
              </label>
              <input
                id="room-nickname-input"
                data-testid="room-nickname-input"
                type="text"
                maxLength={16}
                disabled={busy}
                value={playerName}
                onChange={(e) => {
                  setPlayerName(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="输入 2~16 字联机昵称"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 focus:border-cyan-400 text-sm text-white outline-none"
              />
            </div>

            {existingSlot && savedClassDef ? (
              <div
                data-testid="online-saved-profile-card"
                className="rounded-lg bg-slate-950/85 border border-cyan-500/40 px-3 py-2.5 flex items-center justify-between gap-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-xl border border-white/20 shrink-0"
                    style={{ backgroundColor: savedClassDef.bodyColor }}
                  >
                    {savedClassDef.basicAttackIcon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-cyan-200 flex items-center gap-1.5 flex-wrap">
                      <span>{savedClassDef.name}</span>
                      <span className="text-amber-300 tabular-nums">Lv.{existingSlot.level}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950/90 border border-cyan-500/40 text-cyan-300">
                        {getRealmName(existingSlot.breakthroughTier ?? 0)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      已读取唯一联机角色档案 · 金币 {existingSlot.gold} · 最高试炼 {existingSlot.highestDungeonFloor ?? 0}F
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/70 border border-emerald-500/40 px-2 py-1 rounded shrink-0">
                  自动续档
                </span>
              </div>
            ) : (
              <div
                data-testid="online-new-profile-card"
                className="rounded-lg bg-slate-950/85 border border-amber-500/35 px-3 py-2.5 flex items-center gap-2.5"
              >
                <Sparkles className="w-5 h-5 text-amber-300 shrink-0" />
                <div className="text-xs text-slate-300 leading-relaxed">
                  首次进入联机模式将自动创建唯一专属角色{' '}
                  <strong className="text-amber-200">【见习旅者 Lv.1】</strong>
                  ，进入主城【觉醒圣殿】后可永久选定进阶职业（仅保存 1 份联机档案）。
                </div>
              </div>
            )}
          </div>

          {/* Mode Tabs: Create vs Join */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-950 border border-slate-800">
            <button
              type="button"
              data-testid="room-tab-create"
              disabled={busy}
              onClick={() => {
                setTab('create');
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-md text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'create'
                  ? 'bg-emerald-400 text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              创建房间
            </button>
            <button
              type="button"
              data-testid="room-tab-join"
              disabled={busy}
              onClick={() => {
                setTab('join');
                setErrorMsg(null);
              }}
              className={`py-2 px-3 rounded-md text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'join'
                  ? 'bg-cyan-400 text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <LogIn className="w-4 h-4" />
              加入房间
            </button>
          </div>

          {errorMsg && (
            <div
              data-testid="room-lobby-error"
              className="rounded-lg border border-rose-500/60 bg-rose-950/70 px-3 py-2 text-xs text-rose-200 font-semibold"
            >
              {errorMsg}
            </div>
          )}

          {tab === 'create' ? (
            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <div className="rounded-xl bg-slate-900/65 border border-emerald-500/30 p-3.5 space-y-2.5">
                <div className="text-xs text-slate-300 leading-relaxed">
                  系统将自动生成 <strong className="text-emerald-300">6 位数字房间号</strong> 并作为房主开启点对点联机通道，房内支持自由组队、经验共享与同步挑战试炼之塔。
                </div>
                <div>
                  <label
                    htmlFor="create-room-password"
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-200 mb-1"
                  >
                    <Lock className="w-3.5 h-3.5 text-amber-300" />
                    房间密码（选填）
                  </label>
                  <input
                    id="create-room-password"
                    data-testid="create-room-password-input"
                    type="text"
                    maxLength={24}
                    disabled={busy}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="留空表示无需密码，输入则好友加入时需校验"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 focus:border-emerald-400 text-sm text-white outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                data-testid="create-room-submit-btn"
                disabled={busy}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-colors"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    正在创建 6 位房号...
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    {existingSlot ? '创建房间并读取联机角色' : '创建房间并开启冒险'}
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoinSubmit} className="space-y-3">
              <div className="rounded-xl bg-slate-900/65 border border-cyan-500/30 p-3.5 space-y-3">
                <div>
                  <label
                    htmlFor="join-room-code"
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-200 mb-1"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-cyan-300" />
                    6 位数字房号
                  </label>
                  <input
                    id="join-room-code"
                    data-testid="join-room-code-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    disabled={busy}
                    value={joinCode}
                    onChange={(e) => {
                      setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                      setErrorMsg(null);
                    }}
                    placeholder="例如 482910"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 focus:border-cyan-400 text-base font-mono font-bold tracking-[0.25em] text-cyan-200 outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="join-room-password"
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-200 mb-1"
                  >
                    <Lock className="w-3.5 h-3.5 text-amber-300" />
                    房间密码（若房主已设置）
                  </label>
                  <input
                    id="join-room-password"
                    data-testid="join-room-password-input"
                    type="password"
                    maxLength={24}
                    disabled={busy}
                    value={joinPassword}
                    onChange={(e) => {
                      setJoinPassword(e.target.value);
                      setErrorMsg(null);
                    }}
                    placeholder="无密码房间可留空"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 focus:border-cyan-400 text-sm text-white outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                data-testid="join-room-submit-btn"
                disabled={busy}
                className="w-full py-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-colors"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    正在连接房间并校验密码...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    {existingSlot ? '加入房间并读取联机角色' : '加入房间并开启冒险'}
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
