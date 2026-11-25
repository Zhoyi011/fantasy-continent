import { useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  Flame,
  Globe,
  LogOut,
  MapPin,
  Swords,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { CLASS_DEFS, WORLD_META } from '../game/rules';
import { TILE } from '../engine/world';
import type { PartyState, PlayMode } from '../game/types';
import type { PeerRoomRole, RoomPlayerPayload } from '../services/peerRoom';

interface SocialModalProps {
  playMode: PlayMode;
  selfUid: string;
  connected: boolean;
  roomCode: string | null;
  roomRole: PeerRoomRole;
  roomMembers: RoomPlayerPayload[];
  party: PartyState | null;
  inDungeon: boolean;
  dungeonFloor: number | null;
  onCreateParty: () => void;
  onJoinParty: () => void;
  onLeaveParty: () => void;
  onSetExpShare: (ratio: number) => void;
  onOpenDungeon: () => void;
  onLeaveRoom: () => void;
  onClose: () => void;
}

const EXP_SHARE_OPTIONS = [0, 25, 35, 50, 75];

export function SocialModal({
  playMode,
  selfUid,
  connected,
  roomCode,
  roomRole,
  roomMembers,
  party,
  inDungeon,
  dungeonFloor,
  onCreateParty,
  onJoinParty,
  onLeaveParty,
  onSetExpShare,
  onOpenDungeon,
  onLeaveRoom,
  onClose,
}: SocialModalProps) {
  const [copied, setCopied] = useState(false);

  const inParty = Boolean(party && party.members.some((m) => m.uid === selfUid));
  const isPartyLeader = Boolean(party && party.leaderUid === selfUid);
  const partyHasSpace = Boolean(party && party.members.length > 0 && party.members.length < 4);

  const handleCopyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback ignored in headless/restricted environments
    }
  };

  return (
    <div className="modal-backdrop bg-black/75">
      <div
        data-testid="social-modal"
        className="modal-shell max-w-2xl bg-[#101824] border-2 border-cyan-400/55 rounded-xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3 sm:px-5 sm:py-4 bg-gradient-to-r from-[#132235] via-[#101c2d] to-[#1a1a2e] border-b border-cyan-400/25 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Users className="w-5 h-5 text-cyan-300 shrink-0" />
              <h2 className="text-base sm:text-lg font-extrabold text-cyan-100 tracking-wide">
                多人联机房间 · 组队与试炼协作
              </h2>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                  playMode !== 'online'
                    ? 'bg-slate-900 border-slate-600 text-slate-400'
                    : connected
                    ? 'bg-emerald-950/75 border-emerald-400/55 text-emerald-300'
                    : 'bg-amber-950/75 border-amber-400/55 text-amber-300'
                }`}
              >
                {playMode !== 'online'
                  ? '仅限房间联机模式'
                  : connected
                  ? '● P2P 实时连通'
                  : '○ 未连接到房间'}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
              房间内可自由组建最多 4 人小队，支持经验共享、辅助治疗协同与无尽试炼之塔联机挑战（多人挑战难度翻倍、奖励更丰厚）。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-600/60 text-slate-300 flex items-center justify-center cursor-pointer shrink-0"
            aria-label="关闭房间面板"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {playMode !== 'online' ? (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-cyan-950/60 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
              <Globe className="w-7 h-7" />
            </div>
            <div className="max-w-md space-y-2">
              <h3 className="text-base font-bold text-white">当前处于【单机模式】</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                单机模式与联机房间完全隔离、互不读写彼此存档。请返回主菜单选择【多人联机（房间模式）】，即可创建或加入 6 位数字房号并组队挑战试炼之塔！
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs cursor-pointer"
            >
              返回冒险
            </button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto game-scroll p-3 sm:p-5 space-y-4">
            {/* Room Info Card */}
            <div className="rounded-xl bg-slate-950/80 border border-cyan-500/35 p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span>6 位数字房间号</span>
                  {roomRole && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-400/45 text-amber-200 font-bold">
                      {roomRole === 'host' && <Crown className="w-3 h-3 text-amber-300" />}
                      {roomRole === 'host' ? '房主' : '访客成员'}
                    </span>
                  )}
                </div>
                <div
                  data-testid="active-room-code"
                  className="font-mono text-2xl font-black text-cyan-300 tracking-[0.22em] mt-0.5 tabular-nums"
                >
                  {roomCode ?? '------'}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {roomCode && (
                  <button
                    type="button"
                    data-testid="copy-room-code-btn"
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-400/50 text-xs font-bold text-cyan-200 cursor-pointer"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copied ? '已复制房号' : '复制房号'}
                  </button>
                )}

                <button
                  type="button"
                  data-testid="open-dungeon-from-social-btn"
                  onClick={onOpenDungeon}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-slate-950 text-xs font-black cursor-pointer shadow"
                >
                  <Flame className="w-3.5 h-3.5" />
                  {inDungeon && dungeonFloor ? `试炼塔 ${dungeonFloor}F` : '试炼之塔 (T)'}
                </button>

                <button
                  type="button"
                  data-testid="leave-room-btn"
                  onClick={onLeaveRoom}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-900/80 hover:bg-rose-800 border border-rose-400/55 text-xs font-bold text-rose-100 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  离开房间
                </button>
              </div>
            </div>

            {/* Party & Trial Tower Co-op Card */}
            <div
              data-testid="party-panel-card"
              className="rounded-xl bg-slate-900/80 border border-amber-400/35 p-3.5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-amber-200 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-amber-300" />
                    冒险队伍（最多 4 人）
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {inParty && party
                      ? `队伍已成立 (${party.members.length}/4) · 多人进入试炼之塔难度直接翻倍递增（队长传送全队跟随）`
                      : '组队后开启经验共享、治疗护盾光环联动与无尽试炼之塔多人协同挑战！'}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!inParty ? (
                    partyHasSpace ? (
                      <button
                        type="button"
                        data-testid="join-party-btn"
                        onClick={onJoinParty}
                        className="px-3.5 py-2 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        加入队伍 ({party?.members.length ?? 0}/4)
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid="create-party-btn"
                        onClick={onCreateParty}
                        className="px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        创建队伍
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      data-testid="leave-party-btn"
                      onClick={onLeaveParty}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/90 border border-slate-600 hover:border-rose-400/60 text-slate-200 hover:text-rose-200 text-xs font-bold cursor-pointer"
                    >
                      退出队伍
                    </button>
                  )}
                </div>
              </div>

              {party && party.members.length > 0 && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {party.members.map((pm) => {
                      const cls = CLASS_DEFS[pm.classId] ?? CLASS_DEFS.novice;
                      const isCaptain = pm.uid === party.leaderUid;
                      const isSelf = pm.uid === selfUid;
                      const hpPct =
                        pm.maxHp > 0 ? Math.max(0, Math.min(100, (pm.hp / pm.maxHp) * 100)) : 100;
                      const roomMember = roomMembers.find((rm) => rm.id === pm.uid);
                      const floorLabel =
                        roomMember?.worldId === 'dungeon' && roomMember?.dungeonFloor
                          ? `试炼塔 ${roomMember.dungeonFloor}F`
                          : (WORLD_META[pm.worldId]?.name ?? '晨曦大陆');
                      return (
                        <div
                          key={pm.uid}
                          className={`rounded-lg px-2.5 py-2 border ${
                            isSelf
                              ? 'bg-amber-950/35 border-amber-400/50'
                              : 'bg-slate-950/80 border-slate-700/70'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-white truncate flex items-center gap-1">
                              {isCaptain && <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />}
                              <span className="truncate">
                                {pm.name}
                                {isSelf ? ' (我)' : ''}
                              </span>
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-200 shrink-0">
                              Lv.{pm.level} {cls.name}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full rounded bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-emerald-400 transition-all"
                              style={{ width: `${hpPct}%` }}
                            />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 tabular-nums">
                            <span>{floorLabel}</span>
                            <span>
                              HP {Math.round(pm.hp)}/{Math.round(pm.maxHp)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Party EXP share settings */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                    <span className="text-[11px] text-slate-300">
                      队伍经验共享比例：
                      <strong className="text-amber-300 ml-1 tabular-nums">
                        {party.expShareRatio}%
                      </strong>
                    </span>
                    {isPartyLeader ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        {EXP_SHARE_OPTIONS.map((ratio) => (
                          <button
                            key={ratio}
                            type="button"
                            onClick={() => onSetExpShare(ratio)}
                            className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                              party.expShareRatio === ratio
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                            }`}
                          >
                            {ratio}%
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400">由队长调整共享比例</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Room Members List */}
            <div className="rounded-xl bg-slate-900/75 border border-emerald-400/30 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-emerald-200">
                  当前房间成员 ({roomMembers.length})
                </h3>
                <span className="text-[11px] text-slate-400">每 80ms 实时同步坐标与血量</span>
              </div>

              {roomMembers.length === 0 ? (
                <div className="text-xs text-slate-400 py-6 text-center bg-black/25 rounded-lg border border-white/5">
                  暂无房间成员数据
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {roomMembers.map((m) => {
                    const cls = CLASS_DEFS[m.classType] ?? CLASS_DEFS.novice;
                    const worldName =
                      m.worldId === 'dungeon' && m.dungeonFloor
                        ? `试炼之塔 ${m.dungeonFloor}F`
                        : (m.worldId ? WORLD_META[m.worldId]?.name : undefined) ?? '晨曦大陆';
                    const tx = Math.floor(m.x / TILE);
                    const ty = Math.floor(m.y / TILE);
                    const hpPct =
                      m.maxHp > 0 ? Math.max(0, Math.min(100, (m.hp / m.maxHp) * 100)) : 100;
                    const isSelf = m.id === selfUid;

                    return (
                      <div
                        key={m.id}
                        data-testid={`room-member-${m.id}`}
                        className={`rounded-lg p-2.5 border space-y-1.5 ${
                          isSelf
                            ? 'bg-cyan-950/40 border-cyan-400/45'
                            : 'bg-slate-950/75 border-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                            <span className="font-bold text-xs text-white truncate">
                              {m.name}
                              {isSelf ? ' (我)' : ''}
                            </span>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 shrink-0">
                            Lv.{m.level ?? 1} {cls.name}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="h-1.5 w-full rounded bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 transition-all"
                              style={{ width: `${hpPct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 tabular-nums">
                            <span className="inline-flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                              <span className="truncate">
                                {worldName} ({tx}, {ty})
                              </span>
                            </span>
                            <span className="inline-flex items-center gap-1 shrink-0">
                              {m.isAttacking && <Swords className="w-3 h-3 text-amber-300" />}
                              HP {Math.round(m.hp)}/{Math.round(m.maxHp)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
