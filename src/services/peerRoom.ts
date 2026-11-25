import Peer, { type DataConnection } from 'peerjs';
import type {
  BossSkillKind,
  ClassId,
  EliteAffixId,
  GearItem,
  MaterialId,
  PartyMemberInfo,
  PartyState,
  QuestType,
  SkillBookItem,
  WorldId,
} from '../game/types';
import type { BossEntity, MobBehavior } from '../engine/entities';

export const ROOM_PEER_PREFIX = 'fantasy-continent-room-';

const PEER_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};

export interface RoomPlayerPayload {
  id: string;
  name: string;
  classType: ClassId;
  worldId?: WorldId;
  dungeonFloor?: number | null;
  level?: number;
  x: number;
  y: number;
  facingAng: number;
  hp: number;
  maxHp: number;
  isAttacking: boolean;
}

export interface SyncMobPayload {
  id: string;
  typeIdx: number;
  name: string;
  color: string;
  r: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
  atk: number;
  exp: number;
  speed: number;
  aggro: number;
  ranged: boolean;
  behavior: MobBehavior;
  atkSpeed: number;
  isElite?: boolean;
  eliteAffix?: EliteAffixId;
  isSplitChild?: boolean;
  stunTimer: number;
  freezeTimer: number;
  lunge: number;
  hitFlash: number;
  chargeTime: number;
  chargeDir: number;
}

export interface SyncBossPayload {
  id: string;
  fixedBossId?: string;
  name: string;
  title?: string;
  bossArchetype?: string;
  arenaX?: number;
  arenaY?: number;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  level: number;
  atk: number;
  speed: number;
  state: BossEntity['state'];
  stateTimer: number;
  rage: number;
  shieldHp: number;
  shieldTimer: number;
  reflectRatio: number;
  stunTimer: number;
  freezeTimer: number;
  facingAng?: number;
  lunge: number;
  hitFlash: number;
  attackAnim?: number;
  attackAnimTotal?: number;
  telegraph?: BossEntity['telegraph'];
}

export interface WorldEntitiesPayload {
  mapKey: string;
  authorityId: string;
  seq: number;
  mobs: SyncMobPayload[];
  boss: SyncBossPayload | null;
  bossRespawns: Record<string, number>;
  dungeonCleared?: boolean;
}

export interface EntityHitPayload {
  mapKey: string;
  targetKind: 'mob' | 'boss';
  targetId: string;
  dmg: number;
  crit: boolean;
  fromX: number;
  fromY: number;
  knockPower: number;
  freezeSec?: number;
  stunSec?: number;
  fromId: string;
  fromName: string;
}

export type WorldActionKind =
  | {
      kind: 'mob_proj';
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      dmg: number;
      life: number;
      color: string;
      freezeSec?: number;
      shape?: 'orb' | 'trident' | 'crescent';
    }
  | {
      kind: 'boss_aoe';
      skillKind: BossSkillKind | 'slam';
      x: number;
      y: number;
      r: number;
      atk: number;
      inPhase2: boolean;
      color: string;
      subTargets?: { x: number; y: number; r?: number }[];
      destX?: number;
      destY?: number;
    };

export interface WorldActionPayload {
  mapKey: string;
  action: WorldActionKind;
}

export interface WorldKillPayload {
  eventId: string;
  mapKey: string;
  kind: 'mob' | 'boss';
  targetId: string;
  killerId: string;
  killerName: string;
  mobName: string;
  x: number;
  y: number;
  color: string;
  level: number;
  isElite?: boolean;
  eliteAffix?: EliteAffixId;
  fixedBossId?: string;
  dungeonFloor?: number | null;
  rewardGold?: number;
  rewardExp?: number;
  bossGear?: GearItem;
  bossBook?: SkillBookItem;
}

export interface PartyQuestProgressPayload {
  eventId: string;
  eventType: QuestType;
  amount: number;
  worldId: WorldId;
  fromId: string;
  fromName: string;
  targetName?: string;
}

export type PeerRoomPacket =
  | { type: 'auth'; password: string; player: RoomPlayerPayload }
  | {
      type: 'auth_ok';
      roomCode: string;
      hostId: string;
      assignedId: string;
      members: RoomPlayerPayload[];
      party?: PartyState | null;
    }
  | { type: 'auth_fail'; reason: string }
  | { type: 'state'; player: RoomPlayerPayload }
  | { type: 'room_members'; members: RoomPlayerPayload[]; party?: PartyState | null }
  | { type: 'party_create'; expShareRatio?: number }
  | { type: 'party_join' }
  | { type: 'party_leave' }
  | { type: 'party_set_share'; expShareRatio: number }
  | { type: 'party_state'; party: PartyState | null }
  | { type: 'party_dungeon_enter'; floor: number; fromId: string; fromName: string }
  | { type: 'party_exp'; exp: number; fromId: string; fromName: string }
  | { type: 'party_heal'; healHp: number; shieldHp: number; fromId: string; fromName: string }
  | ({ type: 'party_quest_progress' } & PartyQuestProgressPayload)
  | ({ type: 'world_entities' } & WorldEntitiesPayload)
  | { type: 'world_sync_req'; mapKey: string; fromId: string }
  | ({ type: 'entity_hit' } & EntityHitPayload)
  | ({ type: 'world_action' } & WorldActionPayload)
  | ({ type: 'world_kill' } & WorldKillPayload)
  | { type: 'leave'; id: string }
  | { type: 'host_closed'; reason: string };

export type PeerRoomRole = 'host' | 'guest' | null;

export type PeerRoomEvent =
  | { type: 'connected'; connected: boolean; role: PeerRoomRole; roomCode: string | null }
  | { type: 'members'; members: RoomPlayerPayload[] }
  | { type: 'party'; party: PartyState | null }
  | { type: 'dungeon_enter'; floor: number; fromId: string; fromName: string }
  | { type: 'party_exp'; exp: number; fromId: string; fromName: string }
  | { type: 'party_heal'; healHp: number; shieldHp: number; fromId: string; fromName: string }
  | ({ type: 'party_quest_progress' } & PartyQuestProgressPayload)
  | ({ type: 'world_entities' } & WorldEntitiesPayload)
  | { type: 'world_sync_req'; mapKey: string; fromId: string }
  | ({ type: 'entity_hit' } & EntityHitPayload)
  | ({ type: 'world_action' } & WorldActionPayload)
  | ({ type: 'world_kill' } & WorldKillPayload)
  | { type: 'room_closed'; reason: string }
  | { type: 'left' }
  | { type: 'notice'; level: 'ok' | 'warn'; text: string };

export interface CreateRoomResult {
  ok: boolean;
  roomCode?: string;
  error?: string;
}

export interface JoinRoomResult {
  ok: boolean;
  roomCode?: string;
  members?: RoomPlayerPayload[];
  party?: PartyState | null;
  error?: string;
}

export function generateSixDigitRoomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function isValidSixDigitRoomCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

export function getRoomPeerId(roomCode: string): string {
  return `${ROOM_PEER_PREFIX}${roomCode.trim()}`;
}

export function createEphemeralPlayerId(): string {
  const randPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36).slice(-4);
  return `room_${randPart}_${timePart}`;
}

export function verifyRoomPassword(expectedPassword: string, providedPassword: string): boolean {
  const expected = expectedPassword ?? '';
  if (expected.length === 0) return true;
  return (providedPassword ?? '') === expected;
}

export function sanitizeRoomPlayerPayload(
  raw: Partial<RoomPlayerPayload>,
  fallbackId: string
): RoomPlayerPayload {
  const safeHp = Number.isFinite(raw.hp) ? Math.max(0, Number(raw.hp)) : 100;
  const safeMaxHp = Number.isFinite(raw.maxHp) ? Math.max(1, Number(raw.maxHp)) : 100;
  const safeFloor =
    typeof raw.dungeonFloor === 'number' && Number.isFinite(raw.dungeonFloor) && raw.dungeonFloor >= 1
      ? Math.floor(raw.dungeonFloor)
      : null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : fallbackId,
    name:
      typeof raw.name === 'string' && raw.name.trim().length > 0
        ? raw.name.trim().slice(0, 16)
        : '冒险者',
    classType: (raw.classType ?? 'novice') as ClassId,
    worldId: raw.worldId ?? 'world1',
    dungeonFloor: safeFloor,
    level: Number.isFinite(raw.level) ? Math.max(1, Math.floor(Number(raw.level))) : 1,
    x: Number.isFinite(raw.x) ? Number(raw.x) : 0,
    y: Number.isFinite(raw.y) ? Number(raw.y) : 0,
    facingAng: Number.isFinite(raw.facingAng) ? Number(raw.facingAng) : 0,
    hp: safeHp,
    maxHp: safeMaxHp,
    isAttacking: Boolean(raw.isAttacking),
  };
}

export function getMapSyncKey(worldId: WorldId = 'world1', dungeonFloor?: number | null): string {
  if (worldId === 'dungeon') {
    const floor =
      typeof dungeonFloor === 'number' && Number.isFinite(dungeonFloor) && dungeonFloor >= 1
        ? Math.floor(dungeonFloor)
        : 1;
    return `dungeon:${floor}`;
  }
  return worldId;
}

export function resolveMapAuthorityId(
  members: readonly RoomPlayerPayload[],
  hostId: string | null,
  selfId: string,
  worldId: WorldId,
  dungeonFloor?: number | null
): string {
  const targetKey = getMapSyncKey(worldId, dungeonFloor);
  const sameMap = members.filter(
    (m) => getMapSyncKey(m.worldId ?? 'world1', m.dungeonFloor) === targetKey
  );
  if (sameMap.length === 0) return selfId;
  if (hostId && sameMap.some((m) => m.id === hostId)) {
    return hostId;
  }
  const sorted = [...sameMap].sort((a, b) => a.id.localeCompare(b.id));
  return sorted[0]?.id ?? selfId;
}

/**
 * Pure room-state, party, and packet protocol controller for the room host.
 * Kept transport-agnostic so WebRTC DataConnections and unit tests share identical logic.
 */
export class HostRoomRegistry {
  public readonly roomCode: string;
  public readonly hostId: string;
  private readonly password: string;
  private readonly members = new Map<string, RoomPlayerPayload>();
  private readonly connToMemberId = new Map<string, string>();
  private partyId: string | null = null;
  private partyLeaderId: string | null = null;
  private partyExpShareRatio = 35;
  private partyMemberIds: string[] = [];

  constructor(roomCode: string, password: string, hostPlayer: RoomPlayerPayload) {
    this.roomCode = roomCode;
    this.hostId = hostPlayer.id;
    this.password = password ?? '';
    this.members.set(hostPlayer.id, sanitizeRoomPlayerPayload(hostPlayer, hostPlayer.id));
  }

  public getMembers(): RoomPlayerPayload[] {
    return Array.from(this.members.values());
  }

  public getMemberCount(): number {
    return this.members.size;
  }

  public isConnVerified(connKey: string): boolean {
    return this.connToMemberId.has(connKey);
  }

  public getPartyState(): PartyState | null {
    if (!this.partyId || this.partyMemberIds.length === 0) return null;
    const activeMembers: PartyMemberInfo[] = [];
    for (const uid of this.partyMemberIds) {
      const m = this.members.get(uid);
      if (!m) continue;
      activeMembers.push({
        uid: m.id,
        name: m.name,
        classId: m.classType,
        level: m.level ?? 1,
        worldId: m.worldId ?? 'world1',
        x: m.x,
        y: m.y,
        hp: m.hp,
        maxHp: m.maxHp,
        online: true,
      });
    }
    if (activeMembers.length === 0) {
      this.partyId = null;
      this.partyLeaderId = null;
      this.partyMemberIds = [];
      return null;
    }
    if (!this.partyLeaderId || !activeMembers.some((m) => m.uid === this.partyLeaderId)) {
      this.partyLeaderId = activeMembers[0].uid;
    }
    return {
      id: this.partyId,
      leaderUid: this.partyLeaderId,
      expShareRatio: this.partyExpShareRatio,
      lootRule: 'leader_only',
      members: activeMembers,
    };
  }

  public createOrJoinPartyForMember(memberId: string, expShareRatio?: number): {
    party: PartyState | null;
    noticeText?: string;
  } {
    const member = this.members.get(memberId);
    if (!member) return { party: this.getPartyState() };
    if (typeof expShareRatio === 'number' && Number.isFinite(expShareRatio)) {
      this.partyExpShareRatio = Math.max(0, Math.min(80, Math.round(expShareRatio)));
    }
    if (!this.partyId || this.partyMemberIds.length === 0) {
      this.partyId = `party_${this.roomCode}`;
      this.partyLeaderId = memberId;
      this.partyMemberIds = [memberId];
      return {
        party: this.getPartyState(),
        noticeText: `${member.name} 创建了房间联机队伍`,
      };
    }
    if (!this.partyMemberIds.includes(memberId)) {
      if (this.partyMemberIds.length >= 4) {
        return {
          party: this.getPartyState(),
          noticeText: `队伍已满（最多 4 人）`,
        };
      }
      this.partyMemberIds.push(memberId);
      return {
        party: this.getPartyState(),
        noticeText: `${member.name} 加入了房间队伍`,
      };
    }
    return { party: this.getPartyState() };
  }

  public leavePartyForMember(memberId: string): {
    party: PartyState | null;
    noticeText?: string;
  } {
    const member = this.members.get(memberId);
    if (!this.partyId || !this.partyMemberIds.includes(memberId)) {
      return { party: this.getPartyState() };
    }
    this.partyMemberIds = this.partyMemberIds.filter((id) => id !== memberId);
    if (this.partyMemberIds.length === 0) {
      this.partyId = null;
      this.partyLeaderId = null;
      return {
        party: null,
        noticeText: member ? `${member.name} 离开后队伍已解散` : '队伍已解散',
      };
    }
    if (this.partyLeaderId === memberId) {
      this.partyLeaderId = this.partyMemberIds[0];
    }
    return {
      party: this.getPartyState(),
      noticeText: member ? `${member.name} 退出了队伍` : undefined,
    };
  }

  public setPartyExpShare(memberId: string, ratio: number): PartyState | null {
    if (this.partyLeaderId === memberId && Number.isFinite(ratio)) {
      this.partyExpShareRatio = Math.max(0, Math.min(80, Math.round(ratio)));
    }
    return this.getPartyState();
  }

  public isMemberInParty(memberId: string): boolean {
    return this.partyMemberIds.includes(memberId);
  }

  public updateHostState(player: RoomPlayerPayload): void {
    const clean = sanitizeRoomPlayerPayload(player, this.hostId);
    clean.id = this.hostId;
    this.members.set(this.hostId, clean);
  }

  public handlePacket(
    connKey: string,
    packet: PeerRoomPacket
  ): {
    replyToSender?: PeerRoomPacket;
    closeSender?: boolean;
    broadcastMembers?: RoomPlayerPayload[];
    broadcastParty?: PartyState | null;
    relayToParty?: PeerRoomPacket;
    relayToRoom?: PeerRoomPacket;
    relayExcludeConnKey?: string;
    joinedName?: string;
    leftName?: string;
    noticeText?: string;
  } {
    if (!packet || typeof packet !== 'object') return {};

    if (packet.type === 'auth') {
      if (!verifyRoomPassword(this.password, packet.password)) {
        return {
          replyToSender: {
            type: 'auth_fail',
            reason: '房间密码错误，无法加入房间',
          },
          closeSender: true,
        };
      }

      let assignedId =
        typeof packet.player?.id === 'string' && packet.player.id.trim()
          ? packet.player.id.trim()
          : `guest_${connKey.slice(0, 6)}`;
      if (assignedId === this.hostId || this.members.has(assignedId)) {
        assignedId = `${assignedId}_${Math.random().toString(36).slice(2, 5)}`;
      }

      const cleanPlayer = sanitizeRoomPlayerPayload(packet.player ?? {}, assignedId);
      cleanPlayer.id = assignedId;

      this.connToMemberId.set(connKey, assignedId);
      this.members.set(assignedId, cleanPlayer);
      const membersList = this.getMembers();
      const party = this.getPartyState();

      return {
        replyToSender: {
          type: 'auth_ok',
          roomCode: this.roomCode,
          hostId: this.hostId,
          assignedId,
          members: membersList,
          party,
        },
        broadcastMembers: membersList,
        broadcastParty: party,
        joinedName: cleanPlayer.name,
      };
    }

    const verifiedId = this.connToMemberId.get(connKey);
    if (!verifiedId) {
      return {
        replyToSender: {
          type: 'auth_fail',
          reason: '未通过房间密码校验',
        },
        closeSender: true,
      };
    }

    if (packet.type === 'state') {
      const clean = sanitizeRoomPlayerPayload(packet.player ?? {}, verifiedId);
      clean.id = verifiedId;
      this.members.set(verifiedId, clean);
      return {
        broadcastMembers: this.getMembers(),
        broadcastParty: this.getPartyState(),
      };
    }

    if (packet.type === 'party_create' || packet.type === 'party_join') {
      const ratio = packet.type === 'party_create' ? packet.expShareRatio : undefined;
      const res = this.createOrJoinPartyForMember(verifiedId, ratio);
      return {
        broadcastParty: res.party,
        noticeText: res.noticeText,
      };
    }

    if (packet.type === 'party_leave') {
      const res = this.leavePartyForMember(verifiedId);
      return {
        broadcastParty: res.party,
        noticeText: res.noticeText,
      };
    }

    if (packet.type === 'party_set_share') {
      const nextParty = this.setPartyExpShare(verifiedId, packet.expShareRatio);
      return {
        broadcastParty: nextParty,
      };
    }

    if (
      packet.type === 'party_dungeon_enter' ||
      packet.type === 'party_exp' ||
      packet.type === 'party_heal' ||
      packet.type === 'party_quest_progress'
    ) {
      if (!this.isMemberInParty(verifiedId)) return {};
      return {
        relayToParty: packet,
        relayExcludeConnKey: connKey,
      };
    }

    if (
      packet.type === 'world_entities' ||
      packet.type === 'world_sync_req' ||
      packet.type === 'entity_hit' ||
      packet.type === 'world_action' ||
      packet.type === 'world_kill'
    ) {
      return {
        relayToRoom: packet,
        relayExcludeConnKey: connKey,
      };
    }

    if (packet.type === 'leave') {
      const prev = this.members.get(verifiedId);
      const partyRes = this.leavePartyForMember(verifiedId);
      this.connToMemberId.delete(connKey);
      this.members.delete(verifiedId);
      return {
        closeSender: true,
        broadcastMembers: this.getMembers(),
        broadcastParty: partyRes.party,
        leftName: prev?.name,
      };
    }

    return {};
  }

  public removeConnection(connKey: string): {
    removedName?: string;
    broadcastMembers?: RoomPlayerPayload[];
    broadcastParty?: PartyState | null;
  } {
    const memberId = this.connToMemberId.get(connKey);
    if (!memberId) return {};
    this.connToMemberId.delete(connKey);
    const partyRes = this.leavePartyForMember(memberId);
    const prev = this.members.get(memberId);
    this.members.delete(memberId);
    return {
      removedName: prev?.name,
      broadcastMembers: this.getMembers(),
      broadcastParty: partyRes.party,
    };
  }
}

type EventListener = (ev: PeerRoomEvent) => void;

class PeerRoomClient {
  private peer: Peer | null = null;
  private role: PeerRoomRole = null;
  private roomCode: string | null = null;
  private hostId: string | null = null;
  private selfId = '';
  private connected = false;

  // Host fields
  private hostRegistry: HostRoomRegistry | null = null;
  private hostConns = new Map<string, DataConnection>();
  private pendingAuthTimers = new Map<string, number>();
  private broadcastTimer: number | null = null;
  private lastBroadcastAt = 0;

  // Guest fields
  private hostConn: DataConnection | null = null;
  private lastGuestMembers: RoomPlayerPayload[] = [];
  private lastGuestParty: PartyState | null = null;

  private listeners = new Set<EventListener>();
  private unloadBound = false;

  constructor() {
    this.bindWindowUnload();
  }

  private bindWindowUnload(): void {
    if (this.unloadBound || typeof window === 'undefined') return;
    this.unloadBound = true;
    const onUnload = () => {
      this.leaveRoom(true);
    };
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
  }

  public onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(ev: PeerRoomEvent): void {
    this.listeners.forEach((fn) => {
      try {
        fn(ev);
      } catch {
        // Ignore subscriber failures
      }
    });
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public getRole(): PeerRoomRole {
    return this.role;
  }

  public getRoomCode(): string | null {
    return this.roomCode;
  }

  public getSelfId(): string {
    return this.selfId;
  }

  public getHostId(): string | null {
    return this.hostId;
  }

  public getMembers(): RoomPlayerPayload[] {
    if (this.role === 'host' && this.hostRegistry) {
      return this.hostRegistry.getMembers();
    }
    return this.lastGuestMembers;
  }

  public getParty(): PartyState | null {
    if (this.role === 'host' && this.hostRegistry) {
      return this.hostRegistry.getPartyState();
    }
    return this.lastGuestParty;
  }

  public async createRoom(options: {
    password?: string;
    player: RoomPlayerPayload;
  }): Promise<CreateRoomResult> {
    this.leaveRoom(true);

    const password = (options.password ?? '').trim();
    const selfId = options.player.id || createEphemeralPlayerId();
    const hostPlayer = sanitizeRoomPlayerPayload({ ...options.player, id: selfId }, selfId);

    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const code = generateSixDigitRoomCode();
      const attemptRes = await this.tryOpenHostPeer(code, password, hostPlayer);
      if (attemptRes.ok) {
        return attemptRes;
      }
      if (!attemptRes.retryable) {
        return { ok: false, error: attemptRes.error };
      }
    }

    return { ok: false, error: '创建房间失败，随机房号冲突，请重试' };
  }

  private tryOpenHostPeer(
    code: string,
    password: string,
    hostPlayer: RoomPlayerPayload
  ): Promise<CreateRoomResult & { retryable?: boolean }> {
    return new Promise((resolve) => {
      const peerId = getRoomPeerId(code);
      let settled = false;
      let peer: Peer;
      try {
        peer = new Peer(peerId, { debug: 0, config: PEER_RTC_CONFIG });
      } catch (err) {
        resolve({
          ok: false,
          error: err instanceof Error ? err.message : '无法初始化 PeerJS',
        });
        return;
      }

      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          peer.destroy();
        } catch {
          // ignore
        }
        resolve({ ok: false, error: '连接 PeerJS 信令服务器超时，请检查网络' });
      }, 12000);

      peer.on('open', () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);

        this.peer = peer;
        this.role = 'host';
        this.roomCode = code;
        this.hostId = hostPlayer.id;
        this.selfId = hostPlayer.id;
        this.connected = true;
        this.hostRegistry = new HostRoomRegistry(code, password, hostPlayer);

        this.attachHostRuntimeListeners(peer);
        this.emit({ type: 'connected', connected: true, role: 'host', roomCode: code });
        this.emit({ type: 'members', members: this.hostRegistry.getMembers() });
        this.emit({ type: 'party', party: null });
        resolve({ ok: true, roomCode: code });
      });

      peer.on('error', (err) => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeoutId);
          try {
            peer.destroy();
          } catch {
            // ignore
          }
          if (err.type === 'unavailable-id') {
            resolve({ ok: false, retryable: true, error: '房号已被占用' });
          } else {
            resolve({
              ok: false,
              error: `PeerJS 服务连接异常（${err.type || err.message}）`,
            });
          }
          return;
        }

        if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
          this.emit({ type: 'notice', level: 'warn', text: '与信令服务器通信波动，已保留现有 P2P 连接' });
        }
      });
    });
  }

  private attachHostRuntimeListeners(peer: Peer): void {
    peer.on('connection', (conn) => {
      if (this.role !== 'host' || !this.hostRegistry || this.peer !== peer) {
        try {
          conn.close();
        } catch {
          // ignore
        }
        return;
      }

      const connKey = conn.connectionId || `${conn.peer}_${Math.random().toString(36).slice(2, 7)}`;
      this.hostConns.set(connKey, conn);

      const authTimer = window.setTimeout(() => {
        if (this.hostRegistry && !this.hostRegistry.isConnVerified(connKey)) {
          try {
            if (conn.open) {
              conn.send({ type: 'auth_fail', reason: '密码验证超时' } satisfies PeerRoomPacket);
            }
          } catch {
            // ignore
          }
          window.setTimeout(() => {
            try {
              conn.close();
            } catch {
              // ignore
            }
          }, 80);
        }
      }, 10000);
      this.pendingAuthTimers.set(connKey, authTimer);

      const handleDisconnect = () => {
        const t = this.pendingAuthTimers.get(connKey);
        if (t !== undefined) {
          window.clearTimeout(t);
          this.pendingAuthTimers.delete(connKey);
        }
        this.hostConns.delete(connKey);
        if (!this.hostRegistry) return;
        const removed = this.hostRegistry.removeConnection(connKey);
        if (removed.broadcastMembers) {
          this.broadcastMembersNow(removed.broadcastMembers, removed.broadcastParty ?? null);
          this.emit({ type: 'members', members: removed.broadcastMembers });
          this.emit({ type: 'party', party: removed.broadcastParty ?? null });
        }
        if (removed.removedName) {
          this.emit({
            type: 'notice',
            level: 'warn',
            text: `${removed.removedName} 离开了房间`,
          });
        }
      };

      conn.on('data', (raw) => {
        if (!this.hostRegistry || this.role !== 'host') return;
        const packet = raw as PeerRoomPacket;
        const res = this.hostRegistry.handlePacket(connKey, packet);

        if (packet?.type === 'auth') {
          const t = this.pendingAuthTimers.get(connKey);
          if (t !== undefined) {
            window.clearTimeout(t);
            this.pendingAuthTimers.delete(connKey);
          }
        }

        if (res.replyToSender) {
          try {
            if (conn.open) conn.send(res.replyToSender);
          } catch {
            // ignore
          }
        }

        if (res.closeSender) {
          window.setTimeout(() => {
            try {
              conn.close();
            } catch {
              // ignore
            }
          }, 120);
        }

        if (res.joinedName) {
          this.emit({
            type: 'notice',
            level: 'ok',
            text: `${res.joinedName} 加入了房间`,
          });
        }
        if (res.leftName) {
          this.emit({
            type: 'notice',
            level: 'warn',
            text: `${res.leftName} 离开了房间`,
          });
        }
        if (res.noticeText) {
          this.emit({
            type: 'notice',
            level: 'ok',
            text: res.noticeText,
          });
        }

        if (res.relayToParty) {
          this.broadcastPacketToGuests(res.relayToParty, res.relayExcludeConnKey);
          this.dispatchIncomingPartyActionToLocal(res.relayToParty);
        }

        if (res.relayToRoom) {
          this.broadcastPacketToGuests(res.relayToRoom, res.relayExcludeConnKey);
          this.dispatchIncomingRoomActionToLocal(res.relayToRoom);
        }

        if (res.broadcastParty !== undefined && !res.broadcastMembers) {
          this.emit({ type: 'party', party: res.broadcastParty });
          this.broadcastPacketToGuests({ type: 'party_state', party: res.broadcastParty });
        }

        if (res.broadcastMembers) {
          const party = res.broadcastParty ?? this.hostRegistry.getPartyState();
          this.emit({ type: 'members', members: res.broadcastMembers });
          this.emit({ type: 'party', party });
          if (res.joinedName || res.leftName) {
            this.broadcastMembersNow(res.broadcastMembers, party);
          } else {
            this.scheduleMembersBroadcast();
          }
        }
      });

      conn.on('close', handleDisconnect);
      conn.on('error', handleDisconnect);
    });

    peer.on('close', () => {
      if (this.peer === peer && this.role === 'host') {
        this.leaveRoom(true);
      }
    });
  }

  private dispatchIncomingRoomActionToLocal(packet: PeerRoomPacket): void {
    if (packet.type === 'world_entities') {
      if (packet.authorityId === this.selfId) return;
      this.emit(packet);
    } else if (packet.type === 'world_sync_req') {
      if (packet.fromId === this.selfId) return;
      this.emit(packet);
    } else if (packet.type === 'entity_hit') {
      if (packet.fromId === this.selfId) return;
      this.emit(packet);
    } else if (packet.type === 'world_action') {
      this.emit(packet);
    } else if (packet.type === 'world_kill') {
      this.emit(packet);
    }
  }

  private dispatchIncomingPartyActionToLocal(packet: PeerRoomPacket): void {
    const party = this.getParty();
    const isInParty = Boolean(party && party.members.some((m) => m.uid === this.selfId));
    if (!isInParty) return;

    if (packet.type === 'party_dungeon_enter' && packet.fromId !== this.selfId) {
      this.emit({
        type: 'dungeon_enter',
        floor: packet.floor,
        fromId: packet.fromId,
        fromName: packet.fromName,
      });
    } else if (packet.type === 'party_exp' && packet.fromId !== this.selfId) {
      this.emit({
        type: 'party_exp',
        exp: packet.exp,
        fromId: packet.fromId,
        fromName: packet.fromName,
      });
    } else if (packet.type === 'party_heal' && packet.fromId !== this.selfId) {
      this.emit({
        type: 'party_heal',
        healHp: packet.healHp,
        shieldHp: packet.shieldHp,
        fromId: packet.fromId,
        fromName: packet.fromName,
      });
    } else if (packet.type === 'party_quest_progress' && packet.fromId !== this.selfId) {
      this.emit(packet);
    }
  }

  public async joinRoom(options: {
    roomCode: string;
    password?: string;
    player: RoomPlayerPayload;
  }): Promise<JoinRoomResult> {
    const cleanCode = options.roomCode.trim();
    if (!isValidSixDigitRoomCode(cleanCode)) {
      return { ok: false, error: '请输入正确的 6 位数字房号' };
    }

    this.leaveRoom(true);

    const password = (options.password ?? '').trim();
    const selfId = options.player.id || createEphemeralPlayerId();
    const guestPlayer = sanitizeRoomPlayerPayload({ ...options.player, id: selfId }, selfId);
    const hostPeerId = getRoomPeerId(cleanCode);

    return new Promise((resolve) => {
      let settled = false;
      let peer: Peer;
      try {
        peer = new Peer({ debug: 0, config: PEER_RTC_CONFIG });
      } catch (err) {
        resolve({
          ok: false,
          error: err instanceof Error ? err.message : '无法初始化 PeerJS',
        });
        return;
      }

      const failAndCleanup = (error: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        try {
          peer.destroy();
        } catch {
          // ignore
        }
        resolve({ ok: false, error });
      };

      const timeoutId = window.setTimeout(() => {
        failAndCleanup('连接房间超时，请确认 6 位房号正确且房主在线');
      }, 12000);

      peer.on('error', (err) => {
        if (!settled) {
          if (err.type === 'peer-unavailable') {
            failAndCleanup(`未找到房间 ${cleanCode}，请核对 6 位房号或确认房主尚未退出`);
          } else {
            failAndCleanup(`加入房间失败（${err.type || err.message}）`);
          }
        }
      });

      peer.on('open', () => {
        if (settled) return;
        const conn = peer.connect(hostPeerId, {
          reliable: true,
          serialization: 'json',
        });

        conn.on('open', () => {
          if (settled) return;
          try {
            conn.send({
              type: 'auth',
              password,
              player: guestPlayer,
            } satisfies PeerRoomPacket);
          } catch {
            failAndCleanup('发送房间校验信息失败');
          }
        });

        conn.on('data', (raw) => {
          const packet = raw as PeerRoomPacket;
          if (!packet || typeof packet !== 'object') return;

          if (!settled) {
            if (packet.type === 'auth_ok') {
              settled = true;
              window.clearTimeout(timeoutId);

              this.peer = peer;
              this.role = 'guest';
              this.roomCode = cleanCode;
              this.hostId = packet.hostId || null;
              this.selfId = packet.assignedId || selfId;
              this.hostConn = conn;
              this.connected = true;
              this.lastGuestMembers = Array.isArray(packet.members) ? packet.members : [];
              this.lastGuestParty = packet.party ?? null;

              this.emit({
                type: 'connected',
                connected: true,
                role: 'guest',
                roomCode: cleanCode,
              });
              this.emit({ type: 'members', members: this.lastGuestMembers });
              this.emit({ type: 'party', party: this.lastGuestParty });

              resolve({
                ok: true,
                roomCode: cleanCode,
                members: this.lastGuestMembers,
                party: this.lastGuestParty,
              });
              return;
            }

            if (packet.type === 'auth_fail') {
              failAndCleanup(packet.reason || '房间密码错误');
              return;
            }
          }

          if (this.role !== 'guest') return;

          if (packet.type === 'room_members') {
            this.lastGuestMembers = Array.isArray(packet.members) ? packet.members : [];
            this.emit({ type: 'members', members: this.lastGuestMembers });
            if (packet.party !== undefined) {
              this.lastGuestParty = packet.party;
              this.emit({ type: 'party', party: this.lastGuestParty });
            }
          } else if (packet.type === 'party_state') {
            this.lastGuestParty = packet.party ?? null;
            this.emit({ type: 'party', party: this.lastGuestParty });
          } else if (
            packet.type === 'party_dungeon_enter' ||
            packet.type === 'party_exp' ||
            packet.type === 'party_heal' ||
            packet.type === 'party_quest_progress'
          ) {
            this.dispatchIncomingPartyActionToLocal(packet);
          } else if (
            packet.type === 'world_entities' ||
            packet.type === 'world_sync_req' ||
            packet.type === 'entity_hit' ||
            packet.type === 'world_action' ||
            packet.type === 'world_kill'
          ) {
            this.dispatchIncomingRoomActionToLocal(packet);
          } else if (packet.type === 'host_closed') {
            const reason = packet.reason || '房主已离开并关闭房间';
            this.leaveRoom(true);
            this.emit({ type: 'room_closed', reason });
          }
        });

        conn.on('close', () => {
          if (!settled) {
            failAndCleanup('连接已被房主拒绝或中断（请检查密码是否正确）');
            return;
          }
          if (this.hostConn === conn && this.role === 'guest') {
            this.leaveRoom(true);
            this.emit({ type: 'room_closed', reason: '房主已断开连接，房间已关闭' });
          }
        });

        conn.on('error', () => {
          if (!settled) {
            failAndCleanup('WebRTC 数据通道建立失败');
          }
        });
      });
    });
  }

  public createParty(expShareRatio = 35): void {
    if (!this.connected || !this.role) return;
    if (this.role === 'host' && this.hostRegistry) {
      const res = this.hostRegistry.createOrJoinPartyForMember(this.selfId, expShareRatio);
      this.emit({ type: 'party', party: res.party });
      this.broadcastPacketToGuests({ type: 'party_state', party: res.party });
      if (res.noticeText) {
        this.emit({ type: 'notice', level: 'ok', text: res.noticeText });
      }
      return;
    }
    this.sendToHost({ type: 'party_create', expShareRatio });
  }

  public joinParty(): void {
    if (!this.connected || !this.role) return;
    if (this.role === 'host' && this.hostRegistry) {
      const res = this.hostRegistry.createOrJoinPartyForMember(this.selfId);
      this.emit({ type: 'party', party: res.party });
      this.broadcastPacketToGuests({ type: 'party_state', party: res.party });
      if (res.noticeText) {
        this.emit({ type: 'notice', level: 'ok', text: res.noticeText });
      }
      return;
    }
    this.sendToHost({ type: 'party_join' });
  }

  public leaveParty(): void {
    if (!this.connected || !this.role) return;
    if (this.role === 'host' && this.hostRegistry) {
      const res = this.hostRegistry.leavePartyForMember(this.selfId);
      this.emit({ type: 'party', party: res.party });
      this.broadcastPacketToGuests({ type: 'party_state', party: res.party });
      if (res.noticeText) {
        this.emit({ type: 'notice', level: 'warn', text: res.noticeText });
      }
      return;
    }
    this.sendToHost({ type: 'party_leave' });
  }

  public setPartyExpShare(expShareRatio: number): void {
    if (!this.connected || !this.role) return;
    if (this.role === 'host' && this.hostRegistry) {
      const party = this.hostRegistry.setPartyExpShare(this.selfId, expShareRatio);
      this.emit({ type: 'party', party });
      this.broadcastPacketToGuests({ type: 'party_state', party });
      return;
    }
    this.sendToHost({ type: 'party_set_share', expShareRatio });
  }

  public broadcastDungeonEnter(floor: number, fromName: string): void {
    if (!this.connected || !this.role) return;
    const packet: PeerRoomPacket = {
      type: 'party_dungeon_enter',
      floor,
      fromId: this.selfId,
      fromName,
    };
    if (this.role === 'host') {
      this.broadcastPacketToGuests(packet);
    } else {
      this.sendToHost(packet);
    }
  }

  public broadcastPartyExp(exp: number, fromName: string): void {
    if (!this.connected || !this.role || exp <= 0) return;
    const packet: PeerRoomPacket = {
      type: 'party_exp',
      exp: Math.round(exp),
      fromId: this.selfId,
      fromName,
    };
    if (this.role === 'host') {
      this.broadcastPacketToGuests(packet);
    } else {
      this.sendToHost(packet);
    }
  }

  public broadcastPartyHeal(healHp: number, shieldHp: number, fromName: string): void {
    if (!this.connected || !this.role) return;
    if (healHp <= 0 && shieldHp <= 0) return;
    const packet: PeerRoomPacket = {
      type: 'party_heal',
      healHp: Math.round(healHp),
      shieldHp: Math.round(shieldHp),
      fromId: this.selfId,
      fromName,
    };
    if (this.role === 'host') {
      this.broadcastPacketToGuests(packet);
    } else {
      this.sendToHost(packet);
    }
  }

  public broadcastPartyQuestProgress(payload: PartyQuestProgressPayload): void {
    if (!this.connected || !this.role || payload.amount <= 0) return;
    const packet: PeerRoomPacket = {
      type: 'party_quest_progress',
      ...payload,
      fromId: this.selfId,
    };
    if (this.role === 'host') {
      this.broadcastPacketToGuests(packet);
    } else {
      this.sendToHost(packet);
    }
  }

  public sendWorldEntities(payload: WorldEntitiesPayload): void {
    if (!this.connected || !this.role) return;
    const packet: PeerRoomPacket = {
      type: 'world_entities',
      ...payload,
      authorityId: this.selfId,
    };
    if (this.role === 'host') {
      this.broadcastPacketToGuests(packet);
    } else {
      this.sendToHost(packet);
    }
  }

  public requestWorldSync(mapKey: string): void {
    if (!this.connected || !this.role) return;
    const packet: PeerRoomPacket = {
      type: 'world_sync_req',
      mapKey,
      fromId: this.selfId,
    };
    if (this.role === 'host') {
      this.broadcastPacketToGuests(packet);
    } else {
      this.sendToHost(packet);
    }
  }

  public sendEntityHit(payload: Omit<EntityHitPayload, 'fromId'>): void {
    if (!this.connected || !this.role) return;
    const packet: PeerRoomPacket = {
      type: 'entity_hit',
      ...payload,
      fromId: this.selfId,
    };
    if (this.role === 'host') {
      this.broadcastPacketToGuests(packet);
    } else {
      this.sendToHost(packet);
    }
  }

  public sendWorldAction(payload: WorldActionPayload): void {
    if (!this.connected || !this.role) return;
    const packet: PeerRoomPacket = {
      type: 'world_action',
      ...payload,
    };
    if (this.role === 'host') {
      this.broadcastPacketToGuests(packet);
    } else {
      this.sendToHost(packet);
    }
  }

  public sendWorldKill(payload: WorldKillPayload): void {
    if (!this.connected || !this.role) return;
    const packet: PeerRoomPacket = {
      type: 'world_kill',
      ...payload,
    };
    if (this.role === 'host') {
      this.broadcastPacketToGuests(packet);
    } else {
      this.sendToHost(packet);
    }
  }

  private sendToHost(packet: PeerRoomPacket): void {
    if (this.role === 'guest' && this.hostConn && this.hostConn.open) {
      try {
        this.hostConn.send(packet);
      } catch {
        // ignore transient send errors
      }
    }
  }

  private broadcastPacketToGuests(packet: PeerRoomPacket, excludeConnKey?: string): void {
    if (this.role !== 'host' || !this.hostRegistry) return;
    for (const [connKey, conn] of this.hostConns.entries()) {
      if (excludeConnKey && connKey === excludeConnKey) continue;
      if (!this.hostRegistry.isConnVerified(connKey)) continue;
      if (conn.open) {
        try {
          conn.send(packet);
        } catch {
          // ignore closed channel
        }
      }
    }
  }

  public sendLocalState(player: RoomPlayerPayload): void {
    if (!this.connected || !this.role) return;
    const clean = sanitizeRoomPlayerPayload(player, this.selfId);
    clean.id = this.selfId;

    if (this.role === 'host' && this.hostRegistry) {
      this.hostRegistry.updateHostState(clean);
      const members = this.hostRegistry.getMembers();
      const party = this.hostRegistry.getPartyState();
      this.emit({ type: 'members', members });
      if (party) {
        this.emit({ type: 'party', party });
      }
      this.scheduleMembersBroadcast();
      return;
    }

    this.sendToHost({ type: 'state', player: clean });
  }

  private scheduleMembersBroadcast(): void {
    if (this.role !== 'host' || !this.hostRegistry) return;
    const now = performance.now();
    const elapsed = now - this.lastBroadcastAt;
    if (elapsed >= 70) {
      this.broadcastMembersNow(
        this.hostRegistry.getMembers(),
        this.hostRegistry.getPartyState()
      );
      return;
    }
    if (this.broadcastTimer === null) {
      this.broadcastTimer = window.setTimeout(() => {
        this.broadcastTimer = null;
        if (this.role === 'host' && this.hostRegistry) {
          this.broadcastMembersNow(
            this.hostRegistry.getMembers(),
            this.hostRegistry.getPartyState()
          );
        }
      }, Math.max(10, 75 - elapsed));
    }
  }

  private broadcastMembersNow(members: RoomPlayerPayload[], party: PartyState | null): void {
    if (this.role !== 'host' || !this.hostRegistry) return;
    this.lastBroadcastAt = performance.now();
    const packet: PeerRoomPacket = { type: 'room_members', members, party };
    this.broadcastPacketToGuests(packet);
  }

  public leaveRoom(silent = false): void {
    if (this.broadcastTimer !== null) {
      window.clearTimeout(this.broadcastTimer);
      this.broadcastTimer = null;
    }

    for (const t of this.pendingAuthTimers.values()) {
      window.clearTimeout(t);
    }
    this.pendingAuthTimers.clear();

    if (this.role === 'host') {
      for (const conn of this.hostConns.values()) {
        try {
          if (conn.open) {
            conn.send({
              type: 'host_closed',
              reason: '房主已离开房间',
            } satisfies PeerRoomPacket);
          }
          conn.close();
        } catch {
          // ignore
        }
      }
    } else if (this.role === 'guest' && this.hostConn) {
      try {
        if (this.hostConn.open) {
          this.hostConn.send({ type: 'leave', id: this.selfId } satisfies PeerRoomPacket);
        }
        this.hostConn.close();
      } catch {
        // ignore
      }
    }

    this.hostConns.clear();
    this.hostConn = null;
    this.hostRegistry = null;
    this.lastGuestMembers = [];
    this.lastGuestParty = null;

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // ignore
      }
      this.peer = null;
    }

    const wasActive = this.connected || this.role !== null;
    this.role = null;
    this.roomCode = null;
    this.hostId = null;
    this.connected = false;

    if (wasActive) {
      this.emit({ type: 'connected', connected: false, role: null, roomCode: null });
      this.emit({ type: 'members', members: [] });
      this.emit({ type: 'party', party: null });
      if (!silent) {
        this.emit({ type: 'left' });
      }
    }
  }
}

export const peerRoomClient = new PeerRoomClient();
