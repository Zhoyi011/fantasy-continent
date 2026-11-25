import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, isFirebaseConfigured, OperationType } from '../firebase';
import { createDefaultAccountData, sanitizeAccountData } from '../game/rules';
import type {
  AccountData,
  AuthUserInfo,
  PlayMode,
  SaveSlotData,
  SaveSlotId,
  SyncStatus,
} from '../game/types';
import {
  decryptOnlineAccount,
  encryptOnlineAccount,
  verifyOnlineAccountIntegrity,
  type EncryptedEnvelope,
} from './cryptoSave';

const SINGLEPLAYER_STORAGE_PREFIX = 'fantasy_rpg_account_v1_';
const ONLINE_STORAGE_PREFIX = 'fantasy_rpg_online_v2_';
const ONLINE_PENDING_PREFIX = 'fantasy_rpg_online_v2_pending_';
const LEGACY_SAVE_KEY = 'fantasy_rpg_save_v4';

export function getStorageKeyForMode(uid: string, mode: PlayMode): string {
  return mode === 'online'
    ? `${ONLINE_STORAGE_PREFIX}${uid}`
    : `${SINGLEPLAYER_STORAGE_PREFIX}${uid}`;
}

export function getOnlinePendingKey(uid: string): string {
  return `${ONLINE_PENDING_PREFIX}${uid}`;
}

export function loadLocalAccount(
  uid = 'guest',
  displayName = '流浪冒险者',
  mode: PlayMode = 'singleplayer'
): AccountData {
  // 联机存档与单机存档完全隔离
  if (mode === 'online') {
    return createDefaultAccountData(uid, displayName, 'online');
  }
  try {
    const raw = localStorage.getItem(getStorageKeyForMode(uid, 'singleplayer'));
    if (raw) {
      const acc = sanitizeAccountData(JSON.parse(raw), uid, displayName);
      acc.mode = 'singleplayer';
      return acc;
    }
    if (uid === 'guest') {
      const legacyRaw = localStorage.getItem(LEGACY_SAVE_KEY);
      if (legacyRaw) {
        const leg = JSON.parse(legacyRaw);
        if (leg && leg.player) {
          const acc = createDefaultAccountData(uid, displayName, 'singleplayer');
          const migrated: SaveSlotData = {
            slotId: 'slot1',
            seed: leg.seed ?? 123456,
            worldId: 'world1',
            breakthroughTier: Math.max(0, Math.floor(((leg.player.level ?? 1) - 1) / 10)),
            classId: leg.player.classId ?? 'knight',
            awakened: true,
            level: leg.player.level ?? 1,
            exp: leg.player.exp ?? 0,
            gold: leg.player.gold ?? 0,
            potions: leg.player.potions ?? 2,
            kills: leg.player.kills ?? 0,
            player: {
              x: leg.player.x,
              y: leg.player.y,
              hp: leg.player.hp ?? 100,
              mp: leg.player.mp ?? 50,
              baseMaxHp: leg.player.baseMaxHp ?? 135,
              baseMaxMp: leg.player.baseMaxMp ?? 50,
              baseAtk: leg.player.baseAtk ?? 11,
              baseDef: leg.player.baseDef ?? 4,
              baseSpeed: leg.player.baseSpeed ?? 162,
              baseCrit: leg.player.baseCrit ?? 14,
            },
            chests: typeof leg.chests === 'string' ? leg.chests : '',
            prices: leg.prices ?? {},
            equipped: leg.equipped ?? { weapon: null, armor: null, accessory: null },
            inventory: Array.isArray(leg.inventory) ? leg.inventory : [],
            materials: {},
            skillLevels: [1, 1, 1, 1],
            skillBooks: [],
            highestDungeonFloor: 0,
            activeQuest: leg.activeQuest ?? null,
            completedQuestCount: leg.completedQuestCount ?? 0,
            time: leg.time ?? 0,
            updatedAt: Date.now(),
          };
          acc.slots.slot1 = migrated;
          saveLocalAccount(acc, 'singleplayer');
          return acc;
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return createDefaultAccountData(uid, displayName, 'singleplayer');
}

export function saveLocalAccount(account: AccountData, modeOverride?: PlayMode): void {
  const mode: PlayMode = modeOverride ?? account.mode ?? 'singleplayer';
  if (mode === 'online') {
    // 联机模式禁止以明文保存，必须经过 saveOnlineEncryptedAccount
    return;
  }
  try {
    const clean: AccountData = { ...account, mode: 'singleplayer' };
    localStorage.setItem(getStorageKeyForMode(clean.uid, 'singleplayer'), JSON.stringify(clean));
  } catch {
    // Ignore storage quota errors
  }
}

export async function loadOnlineEncryptedAccount(
  uid: string,
  displayName: string
): Promise<{ account: AccountData; status: SyncStatus; tampered?: boolean }> {
  const onlineUid = uid === 'guest' ? getOrCreateOnlineDeviceUid() : uid;
  const fallback = createDefaultAccountData(onlineUid, displayName, 'online');

  // 1. 优先从服务器加密保险库拉取权威联机档案
  try {
    const resp = await fetch(`/api/online/load/${encodeURIComponent(onlineUid)}`);
    if (resp.ok) {
      const data = (await resp.json()) as { found?: boolean; envelope?: EncryptedEnvelope };
      if (data.found && data.envelope) {
        const decrypted = await decryptOnlineAccount(data.envelope, onlineUid, displayName);
        await cacheEncryptedOnlineEnvelopeLocal(onlineUid, data.envelope);
        return { account: decrypted, status: 'synced' };
      }
    }
  } catch {
    // 若远端暂不可用，回退至本地加密信封并仍强制解密与防篡改校验
  }

  // 2. 读取本地 AES-256-GCM 加密信封
  try {
    const rawEnv = localStorage.getItem(getStorageKeyForMode(onlineUid, 'online'));
    if (rawEnv) {
      const env = JSON.parse(rawEnv) as EncryptedEnvelope;
      const decrypted = await decryptOnlineAccount(env, onlineUid, displayName);
      return { account: decrypted, status: 'local' };
    }
  } catch {
    // 若本地信封被篡改或损坏，重置为全新安全联机账号（防止破解）
    return { account: fallback, status: 'error', tampered: true };
  }

  return { account: fallback, status: 'local' };
}

async function cacheEncryptedOnlineEnvelopeLocal(
  uid: string,
  envelope: EncryptedEnvelope
): Promise<void> {
  try {
    localStorage.setItem(getStorageKeyForMode(uid, 'online'), JSON.stringify(envelope));
  } catch {
    // ignore quota error
  }
}

export async function saveOnlineEncryptedAccount(
  account: AccountData
): Promise<{ status: SyncStatus; envelope: EncryptedEnvelope }> {
  const clean: AccountData = {
    ...account,
    mode: 'online',
  };
  const envelope = await encryptOnlineAccount(clean);
  await cacheEncryptedOnlineEnvelopeLocal(clean.uid, envelope);

  try {
    const resp = await fetch('/api/online/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: clean.uid,
        displayName: clean.displayName,
        friendCode: clean.friendCode,
        envelope,
      }),
    });
    if (resp.ok) {
      return { status: 'synced', envelope };
    }
  } catch {
    // network offline fallback
  }
  return { status: 'local', envelope };
}

export function getOrCreateOnlineDeviceUid(): string {
  const key = 'fantasy_rpg_online_device_uid';
  try {
    const existing = localStorage.getItem(key);
    if (existing && existing.length >= 6) return existing;
    const created = `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(key, created);
    return created;
  } catch {
    return `ol_mem_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function enforceSingleOnlineProfile(account: AccountData): AccountData {
  const singleSlot =
    account.slots.slot1 ?? account.slots.slot2 ?? account.slots.slot3 ?? null;
  return {
    ...account,
    mode: 'online',
    slots: {
      slot1: singleSlot ? { ...singleSlot, slotId: 'slot1' } : null,
      slot2: null,
      slot3: null,
    },
  };
}

interface OnlinePendingSnapshot {
  v: 'pending_v2';
  uid: string;
  updatedAt: number;
  payload: AccountData;
}

function writeOnlinePendingSync(clean: AccountData, updatedAt: number): void {
  try {
    if (!verifyOnlineAccountIntegrity(clean).ok) return;
    const snap: OnlinePendingSnapshot = {
      v: 'pending_v2',
      uid: clean.uid,
      updatedAt,
      payload: clean,
    };
    localStorage.setItem(getOnlinePendingKey(clean.uid), JSON.stringify(snap));
  } catch {
    // ignore storage quota / unavailability
  }
}

function clearOnlinePendingIfNotNewer(uid: string, savedUpdatedAt: number): void {
  try {
    const key = getOnlinePendingKey(uid);
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<OnlinePendingSnapshot>;
    const pendingTs = typeof parsed?.updatedAt === 'number' ? parsed.updatedAt : 0;
    if (pendingTs <= savedUpdatedAt) {
      localStorage.removeItem(key);
    }
  } catch {
    try {
      localStorage.removeItem(getOnlinePendingKey(uid));
    } catch {
      // ignore
    }
  }
}

/**
 * 页面意外关闭 / 隐藏 / 失焦时的全同步无阻塞急存兜底：
 * - 单机模式：立即同步落盘至 singleplayer 键
 * - 联机房间模式：先同步写入独立的 online_pending 恢复快照，防止异步 WebCrypto 加密被浏览器关闭中断导致丢档
 */
export function saveAccountSyncForUnload(account: AccountData): void {
  const mode: PlayMode = account.mode === 'online' ? 'online' : 'singleplayer';
  if (mode === 'singleplayer') {
    saveLocalAccount(account, 'singleplayer');
    return;
  }
  const onlineUid =
    account.uid && account.uid !== 'guest' ? account.uid : getOrCreateOnlineDeviceUid();
  const clean = enforceSingleOnlineProfile({ ...account, uid: onlineUid, mode: 'online' });
  const updatedAt = clean.slots.slot1?.updatedAt ?? Date.now();
  writeOnlinePendingSync(clean, updatedAt);
}

/**
 * 纯前端联机房间模式专属单角色加密存档读取（与单机存档严格隔离，仅存 1 份角色资料 slot1）
 * 若检测到上次页面异常关闭遗留的较新同步恢复快照，自动优先恢复并补全 AES-GCM 加密落盘。
 */
export async function loadOnlineRoomProfile(
  uid: string,
  displayName: string
): Promise<{ account: AccountData; status: SyncStatus; hasProfile: boolean }> {
  const onlineUid = uid && uid !== 'guest' ? uid : getOrCreateOnlineDeviceUid();
  const fallback = enforceSingleOnlineProfile(
    createDefaultAccountData(onlineUid, displayName || '联机冒险者', 'online')
  );
  const storageKey = getStorageKeyForMode(onlineUid, 'online');
  const pendingKey = getOnlinePendingKey(onlineUid);

  let mainAccount: AccountData | null = null;
  let mainStatus: SyncStatus = 'local';
  let mainUpdatedAt = -1;
  let mainTampered = false;

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as EncryptedEnvelope | { v: 'plain'; payload: AccountData };
      if (parsed && typeof parsed === 'object' && 'v' in parsed && parsed.v === 2) {
        const decrypted = await decryptOnlineAccount(parsed as EncryptedEnvelope, onlineUid, displayName);
        mainAccount = enforceSingleOnlineProfile(decrypted);
        mainStatus = 'synced';
        mainUpdatedAt = mainAccount.slots.slot1?.updatedAt ?? parsed.ts ?? 0;
      } else if (
        parsed &&
        typeof parsed === 'object' &&
        'v' in parsed &&
        parsed.v === 'plain' &&
        'payload' in parsed
      ) {
        mainAccount = enforceSingleOnlineProfile(
          sanitizeAccountData(parsed.payload, onlineUid, displayName)
        );
        mainStatus = 'local';
        mainUpdatedAt = mainAccount.slots.slot1?.updatedAt ?? 0;
      }
    }
  } catch {
    mainTampered = true;
  }

  let pendingAccount: AccountData | null = null;
  let pendingUpdatedAt = -1;
  try {
    const rawPending = localStorage.getItem(pendingKey);
    if (rawPending) {
      const parsedPending = JSON.parse(rawPending) as Partial<OnlinePendingSnapshot>;
      if (
        parsedPending &&
        parsedPending.v === 'pending_v2' &&
        parsedPending.uid === onlineUid &&
        parsedPending.payload
      ) {
        const cleanPending = enforceSingleOnlineProfile(
          sanitizeAccountData(parsedPending.payload, onlineUid, displayName)
        );
        if (verifyOnlineAccountIntegrity(cleanPending).ok) {
          pendingAccount = cleanPending;
          pendingUpdatedAt = Math.max(
            typeof parsedPending.updatedAt === 'number' ? parsedPending.updatedAt : 0,
            cleanPending.slots.slot1?.updatedAt ?? 0
          );
        }
      }
    }
  } catch {
    // ignore corrupt pending snapshot
  }

  if (pendingAccount && (!mainAccount || pendingUpdatedAt > mainUpdatedAt)) {
    const res = await saveOnlineRoomProfile(pendingAccount);
    return {
      account: res.account,
      status: res.status,
      hasProfile: Boolean(res.account.slots.slot1),
    };
  }

  if (mainAccount) {
    clearOnlinePendingIfNotNewer(onlineUid, mainUpdatedAt);
    return {
      account: mainAccount,
      status: mainStatus,
      hasProfile: Boolean(mainAccount.slots.slot1),
    };
  }

  if (mainTampered) {
    return { account: fallback, status: 'error', hasProfile: false };
  }
  return { account: fallback, status: 'local', hasProfile: false };
}

/**
 * 纯前端联机房间模式专属单角色加密存档保存（仅写入 online 存储键，绝不触碰单机存档）
 * 保存前先同步写入 pending 快照，防止 WebCrypto 异步加密过程中页面意外关闭丢档。
 */
export async function saveOnlineRoomProfile(
  account: AccountData
): Promise<{ account: AccountData; status: SyncStatus }> {
  const onlineUid = account.uid && account.uid !== 'guest' ? account.uid : getOrCreateOnlineDeviceUid();
  const clean = enforceSingleOnlineProfile({ ...account, uid: onlineUid, mode: 'online' });
  const storageKey = getStorageKeyForMode(onlineUid, 'online');
  const updatedAt = clean.slots.slot1?.updatedAt ?? Date.now();

  writeOnlinePendingSync(clean, updatedAt);

  try {
    const envelope = await encryptOnlineAccount(clean);
    localStorage.setItem(storageKey, JSON.stringify(envelope));
    clearOnlinePendingIfNotNewer(onlineUid, updatedAt);
    return { account: clean, status: 'synced' };
  } catch {
    try {
      // Fallback ONLY to the isolated online key if subtle crypto is unavailable in insecure origin
      localStorage.setItem(storageKey, JSON.stringify({ v: 'plain', payload: clean }));
      clearOnlinePendingIfNotNewer(onlineUid, updatedAt);
    } catch {
      // ignore quota error
    }
    return { account: clean, status: 'local' };
  }
}

export function mergeAccounts(cloud: AccountData, local: AccountData, user: AuthUserInfo): AccountData {
  const pickSlot = (slotId: SaveSlotId): SaveSlotData | null => {
    const a = cloud.slots[slotId];
    const b = local.slots[slotId];
    if (!a) return b;
    if (!b) return a;
    return b.updatedAt > a.updatedAt ? b : a;
  };

  const mergedBestiary: Record<string, number> = { ...cloud.bestiary };
  for (const [k, v] of Object.entries(local.bestiary)) {
    mergedBestiary[k] = Math.max(mergedBestiary[k] ?? 0, v ?? 0);
  }

  const achSet = new Set<string>([...cloud.unlockedAchievements, ...local.unlockedAchievements]);

  return {
    uid: user.uid,
    displayName: user.displayName || cloud.displayName || local.displayName,
    mode: 'singleplayer',
    friendCode: cloud.friendCode || local.friendCode,
    soulStones: Math.max(cloud.soulStones, local.soulStones),
    talents: {
      atkLv: Math.max(cloud.talents.atkLv, local.talents.atkLv),
      hpLv: Math.max(cloud.talents.hpLv, local.talents.hpLv),
      goldLv: Math.max(cloud.talents.goldLv, local.talents.goldLv),
      critDmgLv: Math.max(cloud.talents.critDmgLv, local.talents.critDmgLv),
      potCapLv: Math.max(cloud.talents.potCapLv, local.talents.potCapLv),
    },
    bestiary: mergedBestiary,
    unlockedAchievements: Array.from(achSet).slice(0, 64),
    slots: {
      slot1: pickSlot('slot1'),
      slot2: pickSlot('slot2'),
      slot3: pickSlot('slot3'),
    },
    settings: local.settings,
  };
}

function buildFirestorePayload(account: AccountData) {
  const cleanBestiary: Record<string, number> = {};
  for (const [k, v] of Object.entries(account.bestiary).slice(0, 256)) {
    cleanBestiary[k] = Math.max(0, Math.floor(Number(v) || 0));
  }

  return {
    uid: account.uid,
    displayName: (account.displayName || '冒险者').slice(0, 80),
    soulStones: Math.max(0, Math.min(10000000, Math.floor(account.soulStones))),
    talents: {
      atkLv: Math.max(0, Math.min(10, Math.floor(account.talents.atkLv))),
      hpLv: Math.max(0, Math.min(10, Math.floor(account.talents.hpLv))),
      goldLv: Math.max(0, Math.min(10, Math.floor(account.talents.goldLv))),
      critDmgLv: Math.max(0, Math.min(10, Math.floor(account.talents.critDmgLv))),
      potCapLv: Math.max(0, Math.min(5, Math.floor(account.talents.potCapLv))),
    },
    bestiary: cleanBestiary,
    unlockedAchievements: account.unlockedAchievements.slice(0, 64),
    slots: {
      slot1: account.slots.slot1 ?? null,
      slot2: account.slots.slot2 ?? null,
      slot3: account.slots.slot3 ?? null,
    },
    settings: {
      muted: Boolean(account.settings.muted),
      bgmEnabled: Boolean(account.settings.bgmEnabled),
      sfxVolume: Math.max(0, Math.min(1, Number(account.settings.sfxVolume) || 0)),
      bgmVolume: Math.max(0, Math.min(1, Number(account.settings.bgmVolume) || 0)),
    },
  };
}

export async function loadAndMergeCloudAccount(
  user: AuthUserInfo
): Promise<{ account: AccountData; status: SyncStatus }> {
  const localForUser = loadLocalAccount(user.uid, user.displayName, 'singleplayer');
  const localGuest = loadLocalAccount('guest', user.displayName, 'singleplayer');

  if (!db || !isFirebaseConfigured() || user.isGuest) {
    return { account: localForUser, status: 'local' };
  }

  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const cloudData = sanitizeAccountData(snap.data(), user.uid, user.displayName);
      const merged = mergeAccounts(cloudData, localForUser, user);
      saveLocalAccount(merged, 'singleplayer');
      if (!user.emailVerified) {
        return { account: merged, status: 'unverified' };
      }
      return { account: merged, status: 'synced' };
    } else {
      const hasUserLocal =
        localForUser.soulStones > 0 ||
        Object.values(localForUser.slots).some(Boolean);
      const baseAccount = hasUserLocal
        ? localForUser
        : { ...localGuest, uid: user.uid, displayName: user.displayName, mode: 'singleplayer' as PlayMode };
      saveLocalAccount(baseAccount, 'singleplayer');
      if (!user.emailVerified) {
        return { account: baseAccount, status: 'unverified' };
      }
      await syncAccountToCloud(baseAccount, user);
      return { account: baseAccount, status: 'synced' };
    }
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    return { account: localForUser, status: 'error' };
  }
}

export async function syncAccountToCloud(
  account: AccountData,
  user: AuthUserInfo
): Promise<SyncStatus> {
  // 单机与联机严禁互通
  if (account.mode === 'online') {
    const res = await saveOnlineEncryptedAccount(account);
    return res.status;
  }

  saveLocalAccount(account, 'singleplayer');
  if (!db || !isFirebaseConfigured() || user.isGuest) {
    return 'local';
  }
  if (!user.emailVerified) {
    return 'unverified';
  }

  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const payload = buildFirestorePayload(account);

  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        displayName: payload.displayName,
        soulStones: payload.soulStones,
        talents: payload.talents,
        bestiary: payload.bestiary,
        unlockedAchievements: payload.unlockedAchievements,
        slots: payload.slots,
        settings: payload.settings,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return 'synced';
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
    return 'error';
  }
}
