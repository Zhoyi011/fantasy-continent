import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { splitPartyExp } from './src/game/rules.ts';
import { verifyEncryptedEnvelope, type EncryptedEnvelope } from './src/services/cryptoSave.ts';
import type {
  ClassId,
  FriendEntry,
  GearItem,
  MaterialBag,
  OnlineInviteNotice,
  PartyMemberInfo,
  PartyState,
  RemotePlayerSnapshot,
  SkillBookItem,
  TradeOffer,
  TradeSession,
  WorldId,
} from './src/game/types.ts';

const PORT = Number(process.env.PORT || 3000);
const VAULT_DIR = path.resolve(process.cwd(), '.data', 'online-vault');

interface StoredVaultRecord {
  uid: string;
  displayName: string;
  friendCode: string;
  envelope: EncryptedEnvelope;
  updatedAt: number;
}

interface OnlineClientSession {
  ws: WebSocket;
  uid: string;
  name: string;
  friendCode: string;
  worldId: WorldId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
  classId: ClassId;
  facingAng: number;
  partyId: string | null;
  dungeonFloor: number | null;
  updatedAt: number;
}

const vaultCache = new Map<string, StoredVaultRecord>();
const friendCodeToUid = new Map<string, string>();
const friendships = new Map<string, Set<string>>(); // uid -> Set<friendUid>
const activeClients = new Map<string, OnlineClientSession>();
const parties = new Map<string, PartyState>();
const trades = new Map<string, TradeSession>();

let partySeq = 1;
let tradeSeq = 1;
let noticeSeq = 1;

async function ensureVaultDir() {
  await fs.mkdir(VAULT_DIR, { recursive: true });
  try {
    const files = await fs.readdir(VAULT_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(VAULT_DIR, file), 'utf-8');
        const rec = JSON.parse(raw) as StoredVaultRecord;
        if (rec?.uid && rec?.envelope) {
          vaultCache.set(rec.uid, rec);
          if (rec.friendCode) friendCodeToUid.set(rec.friendCode.toUpperCase(), rec.uid);
        }
      } catch {
        // ignore corrupt vault file
      }
    }
  } catch {
    // ignore
  }
}

async function persistVaultRecord(rec: StoredVaultRecord) {
  vaultCache.set(rec.uid, rec);
  if (rec.friendCode) friendCodeToUid.set(rec.friendCode.toUpperCase(), rec.uid);
  const safeName = rec.uid.replace(/[^a-zA-Z0-9_-]/g, '_');
  await fs.mkdir(VAULT_DIR, { recursive: true });
  await fs.writeFile(
    path.join(VAULT_DIR, `${safeName}.json`),
    JSON.stringify(rec),
    'utf-8'
  );
}

function sendWs(ws: WebSocket | undefined, payload: unknown) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function sendToUid(uid: string, payload: unknown) {
  const client = activeClients.get(uid);
  if (client) sendWs(client.ws, payload);
}

function toSnapshot(c: OnlineClientSession): RemotePlayerSnapshot {
  return {
    uid: c.uid,
    name: c.name,
    friendCode: c.friendCode,
    worldId: c.worldId,
    x: c.x,
    y: c.y,
    hp: c.hp,
    maxHp: c.maxHp,
    level: c.level,
    classId: c.classId,
    facingAng: c.facingAng,
    partyId: c.partyId,
    dungeonFloor: c.dungeonFloor,
    online: true,
    updatedAt: c.updatedAt,
  };
}

function buildFriendsList(uid: string): FriendEntry[] {
  const set = friendships.get(uid);
  if (!set) return [];
  const list: FriendEntry[] = [];
  for (const fUid of set) {
    const online = activeClients.get(fUid);
    const vault = vaultCache.get(fUid);
    if (online) {
      list.push({
        uid: online.uid,
        name: online.name,
        friendCode: online.friendCode,
        online: true,
        worldId: online.worldId,
        x: online.x,
        y: online.y,
        level: online.level,
        classId: online.classId,
        partyId: online.partyId,
      });
    } else if (vault) {
      list.push({
        uid: vault.uid,
        name: vault.displayName,
        friendCode: vault.friendCode,
        online: false,
      });
    } else {
      list.push({
        uid: fUid,
        name: fUid,
        friendCode: `HX-${fUid.slice(-6).toUpperCase()}`,
        online: false,
      });
    }
  }
  return list;
}

function syncFriendsForUsers(uids: Iterable<string>) {
  for (const u of uids) {
    if (activeClients.has(u)) {
      sendToUid(u, { type: 'friends:update', friends: buildFriendsList(u) });
    }
  }
}

function broadcastOnlinePlayers() {
  const players = Array.from(activeClients.values()).map(toSnapshot);
  for (const c of activeClients.values()) {
    sendWs(c.ws, {
      type: 'world:players',
      players,
    });
  }
}

function refreshPartyState(partyId: string) {
  const p = parties.get(partyId);
  if (!p) return;
  const updatedMembers: PartyMemberInfo[] = [];
  for (const m of p.members) {
    const live = activeClients.get(m.uid);
    if (live) {
      updatedMembers.push({
        uid: live.uid,
        name: live.name,
        classId: live.classId,
        level: live.level,
        worldId: live.worldId,
        x: live.x,
        y: live.y,
        hp: live.hp,
        maxHp: live.maxHp,
        online: true,
      });
    } else {
      updatedMembers.push({ ...m, online: false });
    }
  }
  p.members = updatedMembers;
  if (p.members.length === 0) {
    parties.delete(partyId);
    return;
  }
  if (!p.members.some((m) => m.uid === p.leaderUid)) {
    const nextOnline = p.members.find((m) => m.online) ?? p.members[0];
    p.leaderUid = nextOnline.uid;
  }
  for (const m of p.members) {
    sendToUid(m.uid, { type: 'party:update', party: p });
  }
}

function leaveParty(uid: string) {
  const c = activeClients.get(uid);
  const partyId = c?.partyId ?? null;
  if (!partyId) {
    // also search any party containing uid
    for (const [pid, party] of parties.entries()) {
      if (party.members.some((m) => m.uid === uid)) {
        party.members = party.members.filter((m) => m.uid !== uid);
        sendToUid(uid, { type: 'party:update', party: null });
        if (party.members.length === 0) parties.delete(pid);
        else refreshPartyState(pid);
      }
    }
    return;
  }
  if (c) c.partyId = null;
  const p = parties.get(partyId);
  if (!p) {
    sendToUid(uid, { type: 'party:update', party: null });
    return;
  }
  p.members = p.members.filter((m) => m.uid !== uid);
  sendToUid(uid, { type: 'party:update', party: null });
  if (p.members.length === 0) {
    parties.delete(partyId);
  } else {
    refreshPartyState(partyId);
  }
}

function emptyOffer(uid: string): TradeOffer {
  return {
    uid,
    gold: 0,
    gear: [],
    materials: {},
    skillBooks: [],
    locked: false,
    confirmed: false,
  };
}

function resolveTargetUid(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (activeClients.has(trimmed) || vaultCache.has(trimmed)) return trimmed;
  const upper = trimmed.toUpperCase();
  const byCode = friendCodeToUid.get(upper);
  if (byCode) return byCode;
  for (const c of activeClients.values()) {
    if (c.friendCode.toUpperCase() === upper || c.name === trimmed) return c.uid;
  }
  return null;
}

async function startServer() {
  await ensureVaultDir();

  const app = express();
  app.use(express.json({ limit: '3mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      mode: 'online-server',
      playersOnline: activeClients.size,
    });
  });

  app.post('/api/online/save', async (req, res) => {
    try {
      const { uid, displayName, friendCode, envelope } = req.body as {
        uid?: string;
        displayName?: string;
        friendCode?: string;
        envelope?: EncryptedEnvelope;
      };
      if (!uid || !envelope) {
        res.status(400).json({ ok: false, error: 'Missing uid or encrypted envelope' });
        return;
      }
      const valid = await verifyEncryptedEnvelope(envelope, uid);
      if (!valid) {
        res.status(403).json({ ok: false, error: 'HMAC signature verification failed' });
        return;
      }
      await persistVaultRecord({
        uid,
        displayName: (displayName || '联机冒险者').slice(0, 64),
        friendCode: (friendCode || `HX-${uid.slice(-6)}`).toUpperCase(),
        envelope,
        updatedAt: Date.now(),
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Save error' });
    }
  });

  app.get('/api/online/load/:uid', (req, res) => {
    const rec = vaultCache.get(req.params.uid);
    if (!rec) {
      res.json({ found: false });
      return;
    }
    res.json({ found: true, envelope: rec.envelope });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let sessionUid: string | null = null;

    ws.on('message', (rawBuf) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(rawBuf.toString());
      } catch {
        return;
      }
      const type = String(msg.type || '');

      if (type === 'auth:hello') {
        const uid = String(msg.uid || '').slice(0, 128);
        if (!uid) return;
        const name = String(msg.name || '联机勇者').slice(0, 48);
        const friendCode = String(msg.friendCode || `HX-${uid.slice(-6)}`).toUpperCase();
        const worldId = (['world1', 'world2', 'grand_city', 'dungeon'].includes(String(msg.worldId))
          ? msg.worldId
          : 'world1') as WorldId;

        sessionUid = uid;
        friendCodeToUid.set(friendCode, uid);

        let existingPartyId: string | null = null;
        for (const [pid, party] of parties.entries()) {
          if (party.members.some((m) => m.uid === uid)) {
            existingPartyId = pid;
            break;
          }
        }

        const session: OnlineClientSession = {
          ws,
          uid,
          name,
          friendCode,
          worldId,
          x: Number(msg.x) || 2400,
          y: Number(msg.y) || 2400,
          hp: Number(msg.hp) || 100,
          maxHp: Number(msg.maxHp) || 100,
          level: Math.max(1, Number(msg.level) || 1),
          classId: (String(msg.classId || 'novice') as ClassId),
          facingAng: Number(msg.facingAng) || 0,
          partyId: existingPartyId,
          dungeonFloor: typeof msg.dungeonFloor === 'number' ? msg.dungeonFloor : null,
          updatedAt: Date.now(),
        };
        activeClients.set(uid, session);

        if (!vaultCache.has(uid)) {
          void persistVaultRecord({
            uid,
            displayName: name,
            friendCode,
            envelope: { v: 2, uid, iv: '', ct: '', mac: '', ts: 0 },
            updatedAt: Date.now(),
          });
        }

        sendWs(ws, {
          type: 'ws:welcome',
          uid,
          friendCode,
          players: Array.from(activeClients.values()).map(toSnapshot),
          friends: buildFriendsList(uid),
          party: existingPartyId ? parties.get(existingPartyId) ?? null : null,
        });

        if (existingPartyId) refreshPartyState(existingPartyId);
        broadcastOnlinePlayers();
        const notifiedUids = new Set<string>();
        for (const [owner, set] of friendships.entries()) {
          if (set.has(uid)) notifiedUids.add(owner);
        }
        syncFriendsForUsers(notifiedUids);
        return;
      }

      if (!sessionUid) return;
      const me = activeClients.get(sessionUid);
      if (!me) return;

      if (type === 'player:move') {
        if (typeof msg.worldId === 'string') me.worldId = msg.worldId as WorldId;
        if (typeof msg.x === 'number' && Number.isFinite(msg.x)) me.x = msg.x;
        if (typeof msg.y === 'number' && Number.isFinite(msg.y)) me.y = msg.y;
        if (typeof msg.hp === 'number' && Number.isFinite(msg.hp)) me.hp = msg.hp;
        if (typeof msg.maxHp === 'number' && Number.isFinite(msg.maxHp)) me.maxHp = msg.maxHp;
        if (typeof msg.level === 'number' && Number.isFinite(msg.level)) me.level = msg.level;
        if (typeof msg.classId === 'string') me.classId = msg.classId as ClassId;
        if (typeof msg.facingAng === 'number' && Number.isFinite(msg.facingAng)) me.facingAng = msg.facingAng;
        if (typeof msg.name === 'string' && msg.name.trim()) me.name = msg.name.trim().slice(0, 48);
        me.dungeonFloor = typeof msg.dungeonFloor === 'number' ? msg.dungeonFloor : null;
        me.updatedAt = Date.now();

        const snap = toSnapshot(me);
        for (const peer of activeClients.values()) {
          if (peer.uid !== me.uid) {
            sendWs(peer.ws, { type: 'world:player_delta', player: snap });
          }
        }
        if (me.partyId) {
          refreshPartyState(me.partyId);
        }
        return;
      }

      // ---- 好友系统 ----
      if (type === 'friend:add_by_code') {
        const rawCode = String(msg.code || '').trim();
        const targetUid = resolveTargetUid(rawCode);
        if (!targetUid || targetUid === me.uid) {
          sendWs(ws, {
            type: 'ws:notice',
            level: 'warn',
            text: !targetUid ? `未找到好友码/玩家：${rawCode}` : '不能添加自己为好友',
          });
          return;
        }
        if (!friendships.has(me.uid)) friendships.set(me.uid, new Set());
        if (!friendships.has(targetUid)) friendships.set(targetUid, new Set());
        friendships.get(me.uid)!.add(targetUid);
        friendships.get(targetUid)!.add(me.uid);

        syncFriendsForUsers([me.uid, targetUid]);
        const targetLive = activeClients.get(targetUid);
        if (targetLive) {
          const notice: OnlineInviteNotice = {
            id: `nt_${noticeSeq++}`,
            kind: 'friend',
            fromUid: me.uid,
            fromName: me.name,
            fromFriendCode: me.friendCode,
            createdAt: Date.now(),
          };
          sendToUid(targetUid, { type: 'invite:notice', notice });
        }
        sendWs(ws, { type: 'ws:notice', level: 'ok', text: '成功添加好友！已同步实时坐标与快速组队入口' });
        return;
      }

      if (type === 'friend:remove') {
        const targetUid = String(msg.targetUid || '');
        friendships.get(me.uid)?.delete(targetUid);
        friendships.get(targetUid)?.delete(me.uid);
        syncFriendsForUsers([me.uid, targetUid]);
        return;
      }

      // ---- 队伍系统 ----
      if (type === 'party:create') {
        if (me.partyId) leaveParty(me.uid);
        const partyId = `pt_${Date.now().toString(36)}_${partySeq++}`;
        const party: PartyState = {
          id: partyId,
          leaderUid: me.uid,
          expShareRatio: 50,
          lootRule: 'leader_only',
          members: [
            {
              uid: me.uid,
              name: me.name,
              classId: me.classId,
              level: me.level,
              worldId: me.worldId,
              x: me.x,
              y: me.y,
              hp: me.hp,
              maxHp: me.maxHp,
              online: true,
            },
          ],
        };
        parties.set(partyId, party);
        me.partyId = partyId;
        refreshPartyState(partyId);
        return;
      }

      if (type === 'party:invite') {
        const targetUid = resolveTargetUid(String(msg.targetUid || ''));
        if (!targetUid || targetUid === me.uid) return;
        const target = activeClients.get(targetUid);
        if (!target) {
          sendWs(ws, { type: 'ws:notice', level: 'warn', text: '目标玩家当前离线，无法组队' });
          return;
        }
        let partyId = me.partyId;
        if (!partyId || !parties.has(partyId)) {
          partyId = `pt_${Date.now().toString(36)}_${partySeq++}`;
          parties.set(partyId, {
            id: partyId,
            leaderUid: me.uid,
            expShareRatio: 50,
            lootRule: 'leader_only',
            members: [
              {
                uid: me.uid,
                name: me.name,
                classId: me.classId,
                level: me.level,
                worldId: me.worldId,
                x: me.x,
                y: me.y,
                hp: me.hp,
                maxHp: me.maxHp,
                online: true,
              },
            ],
          });
          me.partyId = partyId;
          refreshPartyState(partyId);
        }
        const notice: OnlineInviteNotice = {
          id: `nt_${noticeSeq++}`,
          kind: 'party',
          fromUid: me.uid,
          fromName: me.name,
          partyId,
          createdAt: Date.now(),
        };
        sendToUid(targetUid, { type: 'invite:notice', notice });
        sendWs(ws, { type: 'ws:notice', level: 'ok', text: `已向 ${target.name} 发送组队邀请` });
        return;
      }

      if (type === 'party:accept') {
        const partyId = String(msg.partyId || '');
        const p = parties.get(partyId);
        if (!p) {
          sendWs(ws, { type: 'ws:notice', level: 'warn', text: '队伍已解散或不存在' });
          return;
        }
        if (me.partyId && me.partyId !== partyId) leaveParty(me.uid);
        if (!p.members.some((m) => m.uid === me.uid)) {
          if (p.members.length >= 4) {
            sendWs(ws, { type: 'ws:notice', level: 'warn', text: '队伍人数已满（最多 4 人）' });
            return;
          }
          p.members.push({
            uid: me.uid,
            name: me.name,
            classId: me.classId,
            level: me.level,
            worldId: me.worldId,
            x: me.x,
            y: me.y,
            hp: me.hp,
            maxHp: me.maxHp,
            online: true,
          });
        }
        me.partyId = partyId;
        refreshPartyState(partyId);
        broadcastOnlinePlayers();
        return;
      }

      if (type === 'party:leave') {
        leaveParty(me.uid);
        broadcastOnlinePlayers();
        return;
      }

      if (type === 'party:kick') {
        if (!me.partyId) return;
        const p = parties.get(me.partyId);
        if (!p || p.leaderUid !== me.uid) return;
        const targetUid = String(msg.targetUid || '');
        if (!targetUid || targetUid === me.uid) return;
        leaveParty(targetUid);
        sendToUid(targetUid, { type: 'ws:notice', level: 'warn', text: '你已被队长移出队伍' });
        return;
      }

      if (type === 'party:set_exp_ratio') {
        if (!me.partyId) return;
        const p = parties.get(me.partyId);
        if (!p || p.leaderUid !== me.uid) return;
        const ratio = Math.max(0, Math.min(100, Math.round(Number(msg.ratio) || 50)));
        p.expShareRatio = ratio;
        refreshPartyState(p.id);
        return;
      }

      if (type === 'party:kill_share') {
        if (!me.partyId) return;
        const p = parties.get(me.partyId);
        if (!p) return;
        const totalExp = Math.max(0, Math.round(Number(msg.exp) || 0));
        const sameWorldMembers = p.members
          .filter((m) => {
            const live = activeClients.get(m.uid);
            return live && live.worldId === me.worldId;
          })
          .map((m) => m.uid);
        if (sameWorldMembers.length > 1 && totalExp > 0) {
          const shares = splitPartyExp(totalExp, sameWorldMembers, p.leaderUid, p.expShareRatio);
          for (const [u, expVal] of Object.entries(shares)) {
            if (u !== me.uid && expVal > 0) {
              sendToUid(u, {
                type: 'party:exp_grant',
                exp: expVal,
                fromName: me.name,
              });
            }
          }
        }
        // 队长拾取装备规则：非队长击杀掉落装备自动交由队长获得
        const gear = msg.gear as GearItem | undefined;
        const skillBook = msg.skillBook as SkillBookItem | undefined;
        if ((gear || skillBook) && p.leaderUid !== me.uid) {
          sendToUid(p.leaderUid, {
            type: 'party:loot_to_leader',
            gear,
            skillBook,
            fromName: me.name,
          });
        }
        return;
      }

      if (type === 'party:heal_aura') {
        if (!me.partyId) return;
        const p = parties.get(me.partyId);
        if (!p) return;
        const healHp = Math.max(0, Math.round(Number(msg.healHp) || 0));
        const shieldHp = Math.max(0, Math.round(Number(msg.shieldHp) || 0));
        for (const m of p.members) {
          if (m.uid === me.uid) continue;
          const live = activeClients.get(m.uid);
          if (live && live.worldId === me.worldId) {
            sendToUid(m.uid, {
              type: 'party:heal_received',
              fromName: me.name,
              healHp,
              shieldHp,
            });
          }
        }
        return;
      }

      // ---- 实时原子交易系统 ----
      if (type === 'trade:request') {
        const targetUid = resolveTargetUid(String(msg.targetUid || ''));
        if (!targetUid || targetUid === me.uid) return;
        const target = activeClients.get(targetUid);
        if (!target) {
          sendWs(ws, { type: 'ws:notice', level: 'warn', text: '目标玩家当前离线，无法交易' });
          return;
        }
        const id = `tr_${Date.now().toString(36)}_${tradeSeq++}`;
        const session: TradeSession = {
          id,
          initiatorUid: me.uid,
          targetUid,
          initiatorName: me.name,
          targetName: target.name,
          status: 'pending',
          offers: {
            [me.uid]: emptyOffer(me.uid),
            [targetUid]: emptyOffer(targetUid),
          },
        };
        trades.set(id, session);
        const notice: OnlineInviteNotice = {
          id: `nt_${noticeSeq++}`,
          kind: 'trade',
          fromUid: me.uid,
          fromName: me.name,
          tradeId: id,
          createdAt: Date.now(),
        };
        sendToUid(targetUid, { type: 'invite:notice', notice });
        sendWs(ws, { type: 'ws:notice', level: 'ok', text: `已向 ${target.name} 发起交易请求` });
        return;
      }

      if (type === 'trade:accept') {
        const tradeId = String(msg.tradeId || '');
        const t = trades.get(tradeId);
        if (!t || t.targetUid !== me.uid || t.status !== 'pending') return;
        t.status = 'active';
        sendToUid(t.initiatorUid, { type: 'trade:state', trade: t });
        sendToUid(t.targetUid, { type: 'trade:state', trade: t });
        return;
      }

      if (type === 'trade:update_offer') {
        const tradeId = String(msg.tradeId || '');
        const t = trades.get(tradeId);
        if (!t || t.status !== 'active') return;
        if (me.uid !== t.initiatorUid && me.uid !== t.targetUid) return;

        const offer = msg.offer as Partial<TradeOffer> | undefined;
        const cleanMaterials: MaterialBag = {};
        if (offer?.materials && typeof offer.materials === 'object') {
          for (const [k, v] of Object.entries(offer.materials)) {
            const n = Math.max(0, Math.floor(Number(v) || 0));
            if (n > 0) cleanMaterials[k as keyof MaterialBag] = n;
          }
        }
        t.offers[me.uid] = {
          uid: me.uid,
          gold: Math.max(0, Math.floor(Number(offer?.gold) || 0)),
          gear: Array.isArray(offer?.gear) ? offer!.gear.slice(0, 12) : [],
          materials: cleanMaterials,
          skillBooks: Array.isArray(offer?.skillBooks) ? offer!.skillBooks.slice(0, 8) : [],
          locked: false,
          confirmed: false,
        };
        // 防欺诈机制：一方变更报价自动解除双方锁定与确认状态
        const otherUid = me.uid === t.initiatorUid ? t.targetUid : t.initiatorUid;
        t.offers[otherUid].locked = false;
        t.offers[otherUid].confirmed = false;

        sendToUid(t.initiatorUid, { type: 'trade:state', trade: t });
        sendToUid(t.targetUid, { type: 'trade:state', trade: t });
        return;
      }

      if (type === 'trade:toggle_lock') {
        const tradeId = String(msg.tradeId || '');
        const t = trades.get(tradeId);
        if (!t || t.status !== 'active') return;
        const myOffer = t.offers[me.uid];
        if (!myOffer) return;
        myOffer.locked = !myOffer.locked;
        if (!myOffer.locked) {
          myOffer.confirmed = false;
        }
        sendToUid(t.initiatorUid, { type: 'trade:state', trade: t });
        sendToUid(t.targetUid, { type: 'trade:state', trade: t });
        return;
      }

      if (type === 'trade:confirm') {
        const tradeId = String(msg.tradeId || '');
        const t = trades.get(tradeId);
        if (!t || t.status !== 'active') return;
        const myOffer = t.offers[me.uid];
        const peerUid = me.uid === t.initiatorUid ? t.targetUid : t.initiatorUid;
        const peerOffer = t.offers[peerUid];
        if (!myOffer || !peerOffer) return;
        if (!myOffer.locked || !peerOffer.locked) {
          sendWs(ws, { type: 'ws:notice', level: 'warn', text: '需双方先点击【锁定报价】后方可确认成交' });
          return;
        }
        myOffer.confirmed = true;
        if (myOffer.confirmed && peerOffer.confirmed) {
          t.status = 'completed';
          sendToUid(t.initiatorUid, {
            type: 'trade:executed',
            tradeId: t.id,
            peerName: t.targetName,
            give: t.offers[t.initiatorUid],
            receive: t.offers[t.targetUid],
          });
          sendToUid(t.targetUid, {
            type: 'trade:executed',
            tradeId: t.id,
            peerName: t.initiatorName,
            give: t.offers[t.targetUid],
            receive: t.offers[t.initiatorUid],
          });
          trades.delete(t.id);
        } else {
          sendToUid(t.initiatorUid, { type: 'trade:state', trade: t });
          sendToUid(t.targetUid, { type: 'trade:state', trade: t });
        }
        return;
      }

      if (type === 'trade:cancel') {
        const tradeId = String(msg.tradeId || '');
        const t = trades.get(tradeId);
        if (!t) return;
        if (me.uid !== t.initiatorUid && me.uid !== t.targetUid) return;
        t.status = 'cancelled';
        sendToUid(t.initiatorUid, { type: 'trade:state', trade: t });
        sendToUid(t.targetUid, { type: 'trade:state', trade: t });
        trades.delete(t.id);
        return;
      }
    });

    ws.on('close', () => {
      if (!sessionUid) return;
      const current = activeClients.get(sessionUid);
      if (current && current.ws === ws) {
        activeClients.delete(sessionUid);
        if (current.partyId) {
          refreshPartyState(current.partyId);
        }
        for (const [tid, t] of trades.entries()) {
          if (t.initiatorUid === sessionUid || t.targetUid === sessionUid) {
            t.status = 'cancelled';
            const peerUid = t.initiatorUid === sessionUid ? t.targetUid : t.initiatorUid;
            sendToUid(peerUid, { type: 'trade:state', trade: t });
            trades.delete(tid);
          }
        }
        broadcastOnlinePlayers();
        const notifiedUids = new Set<string>();
        for (const [owner, set] of friendships.entries()) {
          if (set.has(sessionUid)) notifiedUids.add(owner);
        }
        syncFriendsForUsers(notifiedUids);
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[FantasyRPG] Server & WebSocket ready at http://0.0.0.0:${PORT}`);
  });
}

void startServer();
