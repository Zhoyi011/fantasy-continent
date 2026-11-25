import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateSixDigitRoomCode,
  getMapSyncKey,
  getRoomPeerId,
  HostRoomRegistry,
  isValidSixDigitRoomCode,
  resolveMapAuthorityId,
  ROOM_PEER_PREFIX,
  verifyRoomPassword,
  type RoomPlayerPayload,
} from './peerRoom';

test('room code generation & PeerJS ID formatting', () => {
  for (let i = 0; i < 40; i++) {
    const code = generateSixDigitRoomCode();
    assert.equal(isValidSixDigitRoomCode(code), true);
    assert.equal(getRoomPeerId(code), `${ROOM_PEER_PREFIX}${code}`);
  }
  assert.equal(isValidSixDigitRoomCode('12345'), false);
  assert.equal(isValidSixDigitRoomCode('1234567'), false);
  assert.equal(isValidSixDigitRoomCode('abc123'), false);
});

test('password verification handles open rooms and locked rooms accurately', () => {
  assert.equal(verifyRoomPassword('', ''), true);
  assert.equal(verifyRoomPassword('', 'anything'), true);
  assert.equal(verifyRoomPassword('secret88', 'secret88'), true);
  assert.equal(verifyRoomPassword('secret88', 'wrong'), false);
  assert.equal(verifyRoomPassword('secret88', ''), false);
});

test('HostRoomRegistry enforces password check before admitting guest, syncs state, and removes on leave', () => {
  const host: RoomPlayerPayload = {
    id: 'host_1',
    name: '房主骑士',
    classType: 'knight',
    x: 2560,
    y: 1024,
    facingAng: 0,
    hp: 150,
    maxHp: 150,
    isAttacking: false,
  };
  const registry = new HostRoomRegistry('482910', 'pass123', host);
  assert.equal(registry.getMemberCount(), 1);

  // 1. Unverified state packet must be rejected
  const unauthState = registry.handlePacket('conn_bad', {
    type: 'state',
    player: { ...host, id: 'guest_bad', name: '未认证' },
  });
  assert.equal(unauthState.replyToSender?.type, 'auth_fail');
  assert.equal(unauthState.closeSender, true);
  assert.equal(registry.getMemberCount(), 1);

  // 2. Wrong password rejected with auth_fail + closeSender
  const badAuth = registry.handlePacket('conn_1', {
    type: 'auth',
    password: 'wrong',
    player: { ...host, id: 'guest_1', name: '客机游侠', classType: 'ranger' },
  });
  assert.equal(badAuth.replyToSender?.type, 'auth_fail');
  assert.equal(badAuth.closeSender, true);
  assert.equal(registry.isConnVerified('conn_1'), false);
  assert.equal(registry.getMemberCount(), 1);

  // 3. Correct password admitted with auth_ok and member broadcast
  const goodAuth = registry.handlePacket('conn_2', {
    type: 'auth',
    password: 'pass123',
    player: { ...host, id: 'guest_2', name: '客机法师', classType: 'mage', x: 2600, y: 1050 },
  });
  assert.equal(goodAuth.replyToSender?.type, 'auth_ok');
  assert.equal(goodAuth.joinedName, '客机法师');
  assert.equal(goodAuth.broadcastMembers?.length, 2);
  assert.equal(registry.isConnVerified('conn_2'), true);

  // 4. Bidirectional state sync updates guest coordinates & attack flag
  const stateUpdate = registry.handlePacket('conn_2', {
    type: 'state',
    player: {
      id: 'guest_2',
      name: '客机法师',
      classType: 'mage',
      x: 2710,
      y: 1120,
      facingAng: 1.25,
      hp: 110,
      maxHp: 120,
      isAttacking: true,
    },
  });
  const updatedGuest = stateUpdate.broadcastMembers?.find((m) => m.id === 'guest_2');
  assert.ok(updatedGuest);
  assert.equal(updatedGuest.x, 2710);
  assert.equal(updatedGuest.y, 1120);
  assert.equal(updatedGuest.isAttacking, true);

  // 5. Connection close removes guest immediately and broadcasts remaining member list
  const removed = registry.removeConnection('conn_2');
  assert.equal(removed.removedName, '客机法师');
  assert.equal(removed.broadcastMembers?.length, 1);
  assert.equal(removed.broadcastMembers?.[0].id, 'host_1');
});

test('HostRoomRegistry party creation, 4-member cap, EXP share, Trial Tower relay & captain transfer', () => {
  const host: RoomPlayerPayload = {
    id: 'host_1',
    name: '房主圣骑',
    classType: 'paladin',
    x: 2000,
    y: 1200,
    facingAng: 0,
    hp: 200,
    maxHp: 200,
    isAttacking: false,
  };
  const registry = new HostRoomRegistry('654321', '', host);

  // Admit 4 guests (total 5 players in room)
  for (let i = 1; i <= 4; i++) {
    registry.handlePacket(`conn_${i}`, {
      type: 'auth',
      password: '',
      player: { ...host, id: `guest_${i}`, name: `队友${i}`, classType: 'mage' },
    });
  }
  assert.equal(registry.getMemberCount(), 5);

  // Host creates party
  const created = registry.createOrJoinPartyForMember('host_1', 45);
  assert.ok(created.party);
  assert.equal(created.party.leaderUid, 'host_1');
  assert.equal(created.party.expShareRatio, 45);
  assert.equal(created.party.members.length, 1);

  // Guests 1..3 join (party reaches max 4)
  for (let i = 1; i <= 3; i++) {
    const joined = registry.handlePacket(`conn_${i}`, { type: 'party_join' });
    assert.equal(joined.broadcastParty?.members.length, i + 1);
  }

  // Guest 4 exceeds max 4 cap
  const full = registry.handlePacket('conn_4', { type: 'party_join' });
  assert.equal(full.broadcastParty?.members.length, 4);
  assert.ok(full.noticeText?.includes('4 人'));

  // Non-leader cannot alter EXP share, leader can
  const nonLeaderShare = registry.handlePacket('conn_1', {
    type: 'party_set_share',
    expShareRatio: 75,
  });
  assert.equal(nonLeaderShare.broadcastParty?.expShareRatio, 45);

  const leaderParty = registry.setPartyExpShare('host_1', 60);
  assert.equal(leaderParty?.expShareRatio, 60);

  // Party dungeon enter & heal packets relay from party member; non-party member ignored
  const relayEnter = registry.handlePacket('conn_1', {
    type: 'party_dungeon_enter',
    floor: 5,
    fromId: 'guest_1',
    fromName: '队友1',
  });
  assert.equal(relayEnter.relayToParty?.type, 'party_dungeon_enter');
  assert.equal(relayEnter.relayExcludeConnKey, 'conn_1');

  const nonMemberRelay = registry.handlePacket('conn_4', {
    type: 'party_heal',
    healHp: 50,
    shieldHp: 20,
    fromId: 'guest_4',
    fromName: '队友4',
  });
  assert.equal(nonMemberRelay.relayToParty, undefined);

  // Leader leaving transfers captaincy to next member
  const hostLeft = registry.leavePartyForMember('host_1');
  assert.equal(hostLeft.party?.members.length, 3);
  assert.equal(hostLeft.party?.leaderUid, 'guest_1');
});

test('online room profile enforces single slot1 and remains strictly isolated from singleplayer storage', async () => {
  const { createDefaultAccountData } = await import('../game/rules');
  const {
    getStorageKeyForMode,
    loadOnlineRoomProfile,
    saveOnlineRoomProfile,
  } = await import('./cloudSave');

  const store = new Map<string, string>();
  const origStorage = (globalThis as { localStorage?: Storage }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };

  try {
    const uid = 'room_user_99';
    const singleKey = getStorageKeyForMode(uid, 'singleplayer');
    const onlineKey = getStorageKeyForMode(uid, 'online');
    assert.notEqual(singleKey, onlineKey);

    // Seed singleplayer save; online profile must NOT see or touch it
    const singleAcc = createDefaultAccountData(uid, '单机剑圣', 'singleplayer');
    store.set(singleKey, JSON.stringify(singleAcc));

    const initialOnline = await loadOnlineRoomProfile(uid, '联机行者');
    assert.equal(initialOnline.hasProfile, false);
    assert.equal(initialOnline.account.mode, 'online');
    assert.equal(initialOnline.account.slots.slot1, null);

    const accToSave = createDefaultAccountData(uid, '联机行者', 'online');
    accToSave.slots.slot1 = {
      slotId: 'slot1',
      seed: 777777,
      worldId: 'world1',
      breakthroughTier: 2,
      classId: 'mage',
      awakened: true,
      level: 24,
      exp: 15,
      gold: 880,
      potions: 4,
      kills: 66,
      skillLevels: [2, 2, 1, 1],
      player: {
        x: 1200,
        y: 1200,
        hp: 210,
        mp: 180,
        baseMaxHp: 210,
        baseMaxMp: 180,
        baseAtk: 38,
        baseDef: 14,
        baseSpeed: 165,
        baseCrit: 16,
      },
      equipped: { weapon: null, armor: null, accessory: null },
      inventory: [],
      materials: {},
      skillBooks: [],
      activeQuest: null,
      completedQuestCount: 3,
      chests: '',
      world2Chests: '',
      grandCityChests: '',
      prices: {},
      highestDungeonFloor: 7,
      time: 120,
      updatedAt: Date.now(),
    };
    // Even if slot2 were populated somehow, saveOnlineRoomProfile strips it to single slot1
    accToSave.slots.slot2 = { ...accToSave.slots.slot1, slotId: 'slot2' };

    await saveOnlineRoomProfile(accToSave);
    assert.ok(store.has(onlineKey));
    assert.equal(store.get(singleKey), JSON.stringify(singleAcc));

    const reloaded = await loadOnlineRoomProfile(uid, '联机行者');
    assert.equal(reloaded.hasProfile, true);
    assert.equal(reloaded.account.slots.slot1?.classId, 'mage');
    assert.equal(reloaded.account.slots.slot1?.level, 24);
    assert.equal(reloaded.account.slots.slot2, null);
    assert.equal(reloaded.account.slots.slot3, null);
  } finally {
    (globalThis as { localStorage?: Storage }).localStorage = origStorage;
  }
});

test('resolveMapAuthorityId prefers host on the same map and elects lowest ID when host is elsewhere', () => {
  assert.equal(getMapSyncKey('world1', null), 'world1');
  assert.equal(getMapSyncKey('dungeon', 5), 'dungeon:5');

  const members: RoomPlayerPayload[] = [
    {
      id: 'host_z',
      name: '房主',
      classType: 'knight',
      worldId: 'world1',
      dungeonFloor: null,
      x: 1000,
      y: 1000,
      facingAng: 0,
      hp: 100,
      maxHp: 100,
      isAttacking: false,
    },
    {
      id: 'guest_b',
      name: '客机B',
      classType: 'mage',
      worldId: 'world2',
      dungeonFloor: null,
      x: 1200,
      y: 1200,
      facingAng: 0,
      hp: 100,
      maxHp: 100,
      isAttacking: false,
    },
    {
      id: 'guest_a',
      name: '客机A',
      classType: 'ranger',
      worldId: 'world2',
      dungeonFloor: null,
      x: 1220,
      y: 1210,
      facingAng: 0,
      hp: 100,
      maxHp: 100,
      isAttacking: false,
    },
  ];

  // In world1 where host_z is present, host_z is authority
  assert.equal(resolveMapAuthorityId(members, 'host_z', 'guest_a', 'world1', null), 'host_z');
  // In world2 where host is absent, lowest lexicographical ID (guest_a) becomes deterministic authority
  assert.equal(resolveMapAuthorityId(members, 'host_z', 'guest_b', 'world2', null), 'guest_a');
  assert.equal(resolveMapAuthorityId(members, 'host_z', 'guest_a', 'world2', null), 'guest_a');
  // In an empty dungeon floor where no peer is listed yet, self falls back cleanly
  assert.equal(resolveMapAuthorityId(members, 'host_z', 'guest_b', 'dungeon', 3), 'guest_b');
});

test('HostRoomRegistry relays world entity snapshots/hits/kills across room and restricts party_quest_progress to party members', async () => {
  const { advanceQuestProgress, getBreakthroughQuestForTier } = await import('../game/rules');

  const host: RoomPlayerPayload = {
    id: 'host_1',
    name: '玩家1',
    classType: 'knight',
    worldId: 'world1',
    dungeonFloor: null,
    x: 2000,
    y: 1200,
    facingAng: 0,
    hp: 200,
    maxHp: 200,
    isAttacking: false,
  };
  const registry = new HostRoomRegistry('112233', '', host);

  registry.handlePacket('conn_p2', {
    type: 'auth',
    password: '',
    player: { ...host, id: 'guest_p2', name: '玩家2', classType: 'mage' },
  });
  registry.handlePacket('conn_outsider', {
    type: 'auth',
    password: '',
    player: { ...host, id: 'guest_p3', name: '路人3', classType: 'ranger' },
  });

  // 1. World entities / hit / kill relay across verified room connections
  const hitRelay = registry.handlePacket('conn_p2', {
    type: 'entity_hit',
    mapKey: 'world1',
    targetKind: 'boss',
    targetId: 'b_host_1',
    dmg: 240,
    crit: true,
    fromX: 1980,
    fromY: 1180,
    knockPower: 80,
    fromId: 'guest_p2',
    fromName: '玩家2',
  });
  assert.equal(hitRelay.relayToRoom?.type, 'entity_hit');
  assert.equal(hitRelay.relayExcludeConnKey, 'conn_p2');

  const killRelay = registry.handlePacket('conn_p2', {
    type: 'world_kill',
    eventId: 'kb_1',
    mapKey: 'world1',
    kind: 'boss',
    targetId: 'b_host_1',
    killerId: 'host_1',
    killerName: '玩家1',
    mobName: '深渊炎魔',
    x: 2100,
    y: 1300,
    color: '#f43f5e',
    level: 20,
  });
  assert.equal(killRelay.relayToRoom?.type, 'world_kill');

  // 2. Host + P2 form party; outsider P3 is NOT in party
  registry.createOrJoinPartyForMember('host_1', 50);
  registry.handlePacket('conn_p2', { type: 'party_join' });

  const outsiderQuestPacket = registry.handlePacket('conn_outsider', {
    type: 'party_quest_progress',
    eventId: 'pq_out_1',
    eventType: 'kill_boss',
    amount: 1,
    worldId: 'world1',
    fromId: 'guest_p3',
    fromName: '路人3',
    targetName: '深渊炎魔',
  });
  assert.equal(outsiderQuestPacket.relayToParty, undefined);

  const memberQuestPacket = registry.handlePacket('conn_p2', {
    type: 'party_quest_progress',
    eventId: 'pq_p2_1',
    eventType: 'kill_boss',
    amount: 1,
    worldId: 'world1',
    fromId: 'guest_p2',
    fromName: '玩家2',
    targetName: '深渊炎魔',
  });
  assert.equal(memberQuestPacket.relayToParty?.type, 'party_quest_progress');

  // 3. Breakthrough quest advances for Player 2 when Player 1 kills a boss
  const btDef = getBreakthroughQuestForTier(0, 'world1');
  assert.equal(btDef.type, 'kill_boss');
  const p2QuestBefore = {
    questId: btDef.id,
    progress: 0,
    completed: false,
    isBreakthrough: true,
    targetTier: 1,
  };
  const p2QuestAfter = advanceQuestProgress(
    p2QuestBefore,
    'kill_boss',
    1,
    0,
    'world1'
  );
  assert.equal(p2QuestAfter?.progress, btDef.target);
  assert.equal(p2QuestAfter?.completed, btDef.target <= 1);
});

