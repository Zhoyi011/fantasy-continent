import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACHIEVEMENT_DEFS,
  advanceQuestProgress,
  applyDeathLevelPenalty,
  applyEliteAffixToMobStats,
  applyExpWithBreakthrough,
  applySkillBookUse,
  ARCHETYPE_LIST,
  autoEquipBestGear,
  BESTIARY_MONSTERS,
  canAwakenClass,
  canClassEquipItem,
  canEnterDungeonFloor,
  canLearnSkillBook,
  canSpawnMobAtPosition,
  canUnlockHiddenClass,
  CLASS_DEFS,
  CLASS_LIST,
  computeAchievementBonuses,
  computeAutoAimAngle,
  computeComboImpactFeedback,
  computeJoystickVector,
  computePlayerStats,
  countExploredTiles,
  CRAFT_RECIPES,
  createCraftedItem,
  createDefaultAccountData,
  createFogBitmap,
  DAY_CYCLE_DURATION,
  DEATH_LEVEL_PENALTY,
  decodeFogBitmap,
  DUNGEON_FLOORS,
  ELITE_AFFIX_DEFS,
  ELITE_AFFIX_LIST,
  encodeFogBitmap,
  evaluateAchievements,
  expNeeded,
  exportAccountJson,
  generateGearItem,
  generateSkillBookItem,
  getBreakthroughCap,
  getBreakthroughQuestForTier,
  getCanvasTapInteractConfig,
  getClassesByArchetype,
  getDungeonFloorDef,
  getDungeonPartyDifficultyMultiplier,
  getEffectiveBasicCooldown,
  getEffectiveSkillCooldown,
  getNpcInteractRadius,
  getScaledBossStats,
  getScaledDungeonMobStats,
  getScaledMobLevel,
  getScaledMobStats,
  getSignpostInteractRadius,
  getSkillPowerMultiplier,
  getTalentCost,
  getTimeOfDay,
  getWorldDifficultyMultiplier,
  getWorldLevel,
  HIDDEN_CLASS_UNLOCK_LEVEL,
  importAccountJson,
  isFireElementalAttack,
  MATERIAL_DEFS,
  MAX_ENHANCE_LV,
  MAX_MOBS_PER_CHUNK,
  MAX_MONSTER_LEVEL,
  MAX_SKILL_LV,
  MIN_BASIC_COOLDOWN,
  MIN_MOB_SPAWN_SPACING,
  MOB_CHUNK_TILES,
  pickEliteAffix,
  QUEST_CATALOG,
  resolvePartyLootRecipient,
  resolveWeatherForWorldAndTime,
  revealFogCircle,
  rollDamage,
  sanitizeAccountData,
  sanitizePlayerDisplayName,
  scoreGearForClass,
  sellJunkGear,
  shouldApplyDeathLevelPenalty,
  splitPartyExp,
  TALENT_DEFS,
  upgradeGearBatch,
  upgradeGearItem,
  WEATHER_CYCLE_DURATION,
  WEATHER_DEFS,
} from './rules';
import { MOB_TYPES } from '../engine/entities';
import {
  blocksProjectile,
  generateFixedWorld,
  MAIN_CITY_SAFE_RADIUS,
  moveEnt,
  T_GRASS,
  T_ROCK,
  T_TREE,
  T_WATER,
  TILE,
  verifyWorldConnectivity,
  WATER_SPEED_MULT,
} from '../engine/world';
import { decryptOnlineAccount, encryptOnlineAccount } from '../services/cryptoSave';
import {
  getOnlinePendingKey,
  getStorageKeyForMode,
  loadOnlineRoomProfile,
  saveAccountSyncForUnload,
  saveLocalAccount,
  saveOnlineRoomProfile,
} from '../services/cloudSave';
import {
  checkForNativeClientUpdate,
  compareSemver,
  DEFAULT_DOWNLOAD_LINKS,
  getBundledReleaseHistory,
  GITHUB_REPO_URL,
} from '../services/appUpdate';
import {
  detectRuntimePlatform,
  isNativeClientShell,
} from '../services/platform';
import type { ActiveQuestState, EquippedGear, GearItem, PartyState } from './types';

test('40 awakened classes across 5 archetypes + novice have 4 skills and strict balance', () => {
  // 40 awakened classes in CLASS_LIST + 1 novice = 41 total ClassDefs
  assert.equal(CLASS_LIST.length, 40);
  assert.equal(Object.keys(CLASS_DEFS).length, 41);
  assert.equal(ARCHETYPE_LIST.length, 5);

  for (const arch of ARCHETYPE_LIST) {
    const classes = getClassesByArchetype(arch.id);
    assert.equal(classes.length, 8, `archetype ${arch.id} must have 8 classes (6 standard + 2 hidden)`);
    assert.equal(classes.filter((c) => !c.isHidden).length, 6);
    assert.equal(classes.filter((c) => c.isHidden).length, 2);
  }

  for (const cls of CLASS_LIST) {
    assert.equal(cls.skills.length, 4, `${cls.id} must have 4 skills (Q/E/C/V)`);
  }

  // Tank > Archer > Mage base HP / DEF balance
  assert.ok(CLASS_DEFS.knight.baseHp > CLASS_DEFS.mage.baseHp);
  assert.ok(CLASS_DEFS.mage.baseMp > CLASS_DEFS.knight.baseMp);
  assert.ok(CLASS_DEFS.ranger.baseSpeed > CLASS_DEFS.knight.baseSpeed);
  assert.ok(CLASS_DEFS.ranger.baseHp < CLASS_DEFS.knight.baseHp);
  assert.ok(CLASS_DEFS.ranger.baseDef < CLASS_DEFS.knight.baseDef);

  // All mage classes: 0 crit, critDisabled, slow attack speed, high MP cost
  for (const mageCls of getClassesByArchetype('mage')) {
    assert.equal(mageCls.critDisabled, true);
    assert.equal(mageCls.baseCrit, 0);
    assert.ok((mageCls.baseAttackSpeed ?? 100) < 100);
    assert.ok(mageCls.basicCooldown >= 0.6);
    assert.ok(mageCls.skillQ.mpCost >= 22);
    assert.ok(mageCls.skillE.mpCost >= 28);
  }
});

test('hidden class unlock condition strictly requires Lv.30 and ignores kills/soulStones', () => {
  assert.equal(HIDDEN_CLASS_UNLOCK_LEVEL, 30);
  assert.equal(canUnlockHiddenClass(1, 0, 0), false);
  assert.equal(canUnlockHiddenClass(5, 0, 0), false);
  assert.equal(canUnlockHiddenClass(29, 9999, 999), false);
  assert.equal(canUnlockHiddenClass(30, 0, 0), true);
  assert.equal(canUnlockHiddenClass(45, 0, 0), true);
});

test('attack speed bug fix caps gear haste and prevents any class from double-dipping below MIN_BASIC_COOLDOWN', () => {
  assert.ok(MIN_BASIC_COOLDOWN >= 0.30);
  for (const cls of Object.values(CLASS_DEFS)) {
    const cdAtCap = getEffectiveBasicCooldown(cls.basicCooldown, 250);
    assert.ok(
      cdAtCap >= MIN_BASIC_COOLDOWN,
      `${cls.id} basicCooldown at max attack speed (${cdAtCap}) must stay >= ${MIN_BASIC_COOLDOWN}`
    );
  }
  const fastGear: EquippedGear = {
    weapon: {
      id: 'w_as',
      name: '极速测试刃',
      slot: 'weapon',
      rarity: 'legendary',
      level: 50,
      affixes: { atk: 20, attackSpeed: 120 },
      sellValue: 100,
    },
    armor: null,
    accessory: null,
  };
  const baseStats = {
    maxHp: 100,
    maxMp: 50,
    atk: 10,
    def: 5,
    speed: 160,
    critChance: 10,
  };
  const capped = computePlayerStats(
    baseStats,
    fastGear,
    { atkLv: 0, hpLv: 0, goldLv: 0, critDmgLv: 0, potCapLv: 0 },
    [],
    'assassin'
  );
  assert.equal(capped.attackSpeed, 165);
});

test('4-skill scaling, haste cooldown reduction, and Skill Book upgrading work deterministically', () => {
  assert.equal(MAX_SKILL_LV, 10);
  assert.ok(getSkillPowerMultiplier(1.5, 5) > getSkillPowerMultiplier(1.5, 1));
  assert.ok(getEffectiveSkillCooldown(8, 5, 120) < getEffectiveSkillCooldown(8, 1, 100));

  const mageBook = generateSkillBookItem({ targetSlot: 0, archetype: 'mage', rarity: 'rare' });
  assert.equal(canLearnSkillBook('knight', [1, 1, 1, 1], mageBook).ok, false);
  assert.equal(canLearnSkillBook('mage', [1, 1, 1, 1], mageBook).ok, true);
  assert.equal(canLearnSkillBook('mage', [10, 1, 1, 1], mageBook).ok, false);

  const res = applySkillBookUse('mage', [1, 1, 1, 1], [mageBook], mageBook.id);
  assert.equal(res.learned, true);
  assert.equal(res.nextLevels[0], 1 + mageBook.levelBonus);
  assert.equal(res.nextBooks.length, 0);
});

test('generateGearItem produces valid rarities, slots, subtypes, and affixes', () => {
  const item = generateGearItem(5, {
    rng: () => 0.99,
    forceRarity: 'legendary',
    forceSlot: 'weapon',
    forClassId: 'knight',
  });
  assert.equal(item.rarity, 'legendary');
  assert.equal(item.slot, 'weapon');
  assert.ok((item.affixes.atk ?? 0) > 0);
  assert.ok(item.sellValue > 0);
  assert.ok(canClassEquipItem('knight', item));
});

test('class restriction prevents equipping incompatible weapon types and autoEquipBestGear picks compatible highest score', () => {
  const staff: GearItem = {
    id: 'w_staff',
    name: '奥术法杖',
    slot: 'weapon',
    rarity: 'legendary',
    level: 5,
    weaponSubtype: 'staff',
    requiredCategory: 'mage',
    affixes: { atk: 30, maxMp: 50, critChance: 15 },
    sellValue: 100,
  };
  const bow: GearItem = {
    id: 'w_bow',
    name: '森林猎弓',
    slot: 'weapon',
    rarity: 'epic',
    level: 5,
    weaponSubtype: 'bow',
    requiredCategory: 'archer',
    affixes: { atk: 20, attackSpeed: 12 },
    sellValue: 80,
  };
  const sword: GearItem = {
    id: 'w_sword',
    name: '骑士圣剑',
    slot: 'weapon',
    rarity: 'rare',
    level: 5,
    weaponSubtype: 'sword',
    requiredCategory: 'knight_paladin',
    affixes: { atk: 12, def: 3 },
    sellValue: 40,
  };

  assert.equal(canClassEquipItem('mage', staff), true);
  assert.equal(canClassEquipItem('knight', staff), false);
  assert.equal(canClassEquipItem('ranger', staff), false);

  assert.equal(canClassEquipItem('ranger', bow), true);
  assert.equal(canClassEquipItem('mage', bow), false);
  assert.equal(canClassEquipItem('knight', bow), false);

  const res = autoEquipBestGear(
    'knight',
    { weapon: null, armor: null, accessory: null },
    [staff, bow, sword]
  );
  assert.equal(res.equipped.weapon?.id, 'w_sword');
  assert.equal(res.inventory.length, 2);
});

test('computePlayerStats aggregates equipment, talents, achievements, attackSpeed, and forces mage 0% crit', () => {
  const base = {
    maxHp: 100,
    maxMp: 50,
    atk: 10,
    def: 2,
    speed: 160,
    critChance: 15,
  };
  const equipped: EquippedGear = {
    weapon: {
      id: 'w1',
      name: '圣剑',
      slot: 'weapon',
      rarity: 'rare',
      level: 3,
      affixes: { atk: 6, critChance: 4, attackSpeed: 10 },
      sellValue: 20,
    },
    armor: {
      id: 'a1',
      name: '铁甲',
      slot: 'armor',
      rarity: 'epic',
      level: 3,
      affixes: { def: 5, maxHp: 30, speed: 10 },
      sellValue: 35,
    },
    accessory: {
      id: 'ac1',
      name: '嗜血戒',
      slot: 'accessory',
      rarity: 'legendary',
      level: 3,
      affixes: { lifeOnKill: 6, critChance: 8, critDmgBonus: 15 },
      sellValue: 50,
    },
  };
  const talents = { atkLv: 2, hpLv: 1, goldLv: 3, critDmgLv: 2, potCapLv: 1 };
  const unlocked = ['first_blood']; // +1 atk

  const achBonus = computeAchievementBonuses(unlocked);
  assert.equal(achBonus.atk, 1);

  const total = computePlayerStats(base, equipped, talents, unlocked, 'knight');
  assert.equal(total.atk, 21);
  assert.equal(total.def, 7);
  assert.equal(total.maxHp, 148);
  assert.equal(total.speed, 170);
  assert.equal(total.critChance, 27);
  assert.equal(total.attackSpeed, 110);
  assert.equal(total.lifeOnKill, 6);
  assert.equal(total.goldMult, 1.3);
  assert.equal(total.critDisabled, false);
  assert.equal(total.critDmgMult, 2.24);
  assert.equal(total.potionCap, 7);

  const mageTotal = computePlayerStats(base, equipped, talents, unlocked, 'mage');
  assert.equal(mageTotal.critDisabled, true);
  assert.equal(mageTotal.critChance, 0);
  assert.equal(mageTotal.critDmgMult, 1);
  assert.equal(mageTotal.attackSpeed, 96);
});

test('crafting, +100 gear upgrade batching, and one-click junk sell work accurately', () => {
  assert.equal(MATERIAL_DEFS.length, 20);
  assert.equal(CRAFT_RECIPES.length, 11);
  assert.equal(MAX_ENHANCE_LV, 100);

  const crafted = createCraftedItem(CRAFT_RECIPES[0]);
  assert.equal(crafted.enhanceLv, 0);
  const up1 = upgradeGearItem(crafted);
  assert.equal(up1.enhanceLv, 1);
  assert.ok((up1.affixes.atk ?? 0) > (crafted.affixes.atk ?? 0));

  const batchRes = upgradeGearBatch(crafted, 10, 10000, {
    iron_ore: 99,
    copper_ore: 99,
    silver_ore: 99,
    magic_crystal: 99,
    stone: 99,
  });
  assert.equal(batchRes.levelsGained, 10);
  assert.equal(batchRes.item.enhanceLv, 10);

  // Junk sell deletes common (and rare when selected) ONLY if unenhanced
  const commonClean: GearItem = { ...crafted, id: 'g_c0', rarity: 'common', enhanceLv: 0, sellValue: 15 };
  const commonEnhanced: GearItem = { ...crafted, id: 'g_c1', rarity: 'common', enhanceLv: 1, sellValue: 25 };
  const rareClean: GearItem = { ...crafted, id: 'g_r0', rarity: 'rare', enhanceLv: 0, sellValue: 40 };
  const epicClean: GearItem = { ...crafted, id: 'g_e0', rarity: 'epic', enhanceLv: 0, sellValue: 90 };

  const sellCommon = sellJunkGear([commonClean, commonEnhanced, rareClean, epicClean], 'common');
  assert.equal(sellCommon.sold.length, 1);
  assert.equal(sellCommon.totalGold, 15);
  assert.equal(sellCommon.kept.length, 3); // keeps enhanced + rare + epic

  const sellRare = sellJunkGear([commonClean, commonEnhanced, rareClean, epicClean], 'rare');
  assert.equal(sellRare.sold.length, 2);
  assert.equal(sellRare.totalGold, 55);
  assert.equal(sellRare.kept.length, 2); // keeps enhanced common + epic
});

test('Lv.30+ monster and boss scaling grows meaningfully with Lv.1000 monster cap', () => {
  const tier0Boss = getScaledBossStats('world1', 0, 0);
  const tier2Boss = getScaledBossStats('world2', 2, 2);
  const tier3Boss = getScaledBossStats('world2', 3, 2);
  const tier8Boss = getScaledBossStats('world2', 8, 2);
  assert.ok(tier2Boss.maxHp > tier0Boss.maxHp);
  assert.ok(tier3Boss.maxHp >= tier2Boss.maxHp * 1.8);
  assert.ok(tier3Boss.atk >= tier2Boss.atk * 1.4);
  assert.ok(tier8Boss.maxHp > tier3Boss.maxHp);
  assert.ok(tier8Boss.atk > tier3Boss.atk);
  assert.ok(Number.isFinite(tier8Boss.maxHp) && Number.isFinite(tier8Boss.atk));
  assert.ok(tier8Boss.level <= MAX_MONSTER_LEVEL);

  const extremeLv = getScaledMobLevel(8, 'world2', 500, 0);
  assert.equal(extremeLv, MAX_MONSTER_LEVEL);

  const m0 = getScaledMobStats(40, 8, 12, 'world1', 0, 1);
  const m3 = getScaledMobStats(40, 8, 12, 'world2', 3, 4);
  const m6 = getScaledMobStats(40, 8, 12, 'world2', 6, 8);
  assert.ok(m3.hp > m0.hp * 4);
  assert.ok(m3.atk > m0.atk * 3);
  assert.ok(m6.hp > m3.hp);
});

test('talent costs and achievement unlocks compute deterministic rewards', () => {
  const atkTalent = TALENT_DEFS.find((t) => t.id === 'atkLv')!;
  assert.equal(getTalentCost(atkTalent, 0), 2);
  assert.equal(getTalentCost(atkTalent, 2), 4);

  const bestiary = { 史莱姆: 12, 野外首领: 1, _chests: 8 };
  const res = evaluateAchievements(bestiary, []);
  assert.ok(res.nextUnlocked.includes('first_blood'));
  assert.ok(res.nextUnlocked.includes('boss_hunter'));
  assert.ok(res.nextUnlocked.includes('treasure_seeker'));
  const expectedStones = ACHIEVEMENT_DEFS.filter((a) => res.nextUnlocked.includes(a.id)).reduce(
    (sum, a) => sum + a.rewardSoulStones,
    0
  );
  assert.equal(res.rewardSoulStones, expectedStones);
});

test('getTimeOfDay transitions smoothly from daytime to dusk, night, and dawn', () => {
  const day = getTimeOfDay(0, DAY_CYCLE_DURATION);
  assert.equal(day.phase, '白天');
  assert.equal(day.darkness, 0);

  const dusk = getTimeOfDay(DAY_CYCLE_DURATION * 0.4, DAY_CYCLE_DURATION);
  assert.equal(dusk.phase, '黄昏');
  assert.ok(dusk.darkness > 0);

  const night = getTimeOfDay(DAY_CYCLE_DURATION * 0.62, DAY_CYCLE_DURATION);
  assert.equal(night.phase, '夜晚');
  assert.ok(night.darkness >= 0.52);

  const dawn = getTimeOfDay(DAY_CYCLE_DURATION * 0.85, DAY_CYCLE_DURATION);
  assert.equal(dawn.phase, '黎明');
});

test('advanceQuestProgress tracks matching quest events and marks completion', () => {
  const mobQuest = QUEST_CATALOG.find((q) => q.type === 'kill_mobs')!;
  let state = { questId: mobQuest.id, progress: 0, completed: false };
  state = advanceQuestProgress(state, 'open_chests', 2)!;
  assert.equal(state.progress, 0);
  assert.equal(state.completed, false);

  state = advanceQuestProgress(state, 'kill_mobs', mobQuest.target)!;
  assert.equal(state.progress, mobQuest.target);
  assert.equal(state.completed, true);
});

test('account export/import preserves talents, soul stones, and validates format', () => {
  const acc = createDefaultAccountData('u1', '勇者');
  acc.soulStones = 15;
  acc.talents.atkLv = 3;
  const json = exportAccountJson(acc);
  const imported = importAccountJson(json, 'u2', '云端勇者');
  assert.equal(imported.uid, 'u2');
  assert.equal(imported.soulStones, 15);
  assert.equal(imported.talents.atkLv, 3);
  assert.throws(() => importAccountJson('{"hello":1}', 'u2', 'x'));
});

test('online save AES-256-GCM + HMAC encryption detects tampering and isolates singleplayer vs online storage keys', async () => {
  assert.notEqual(getStorageKeyForMode('u1', 'singleplayer'), getStorageKeyForMode('u1', 'online'));

  const onlineAcc = createDefaultAccountData('u_online_1', '云霄剑客', 'online');
  onlineAcc.soulStones = 25;
  // Calling saveLocalAccount in online mode is strictly a no-op (never writes plaintext)
  saveLocalAccount(onlineAcc, 'online');

  const env = await encryptOnlineAccount(onlineAcc);
  assert.equal(env.v, 2);
  assert.equal(env.uid, 'u_online_1');
  const decrypted = await decryptOnlineAccount(env, 'u_online_1');
  assert.equal(decrypted.uid, 'u_online_1');
  assert.equal(decrypted.soulStones, 25);
  assert.equal(decrypted.mode, 'online');

  // Tamper ciphertext or uid -> must reject
  const tampered = { ...env, ct: env.ct.slice(0, -4) + 'AAAA' };
  await assert.rejects(() => decryptOnlineAccount(tampered, 'u_online_1'));
  await assert.rejects(() => decryptOnlineAccount(env, 'different_uid'));
});

test('party EXP split, leader-only loot, endless 1F-100000F+ sequential gating, multiplayer doubling & dungeon death protection', () => {
  const split = splitPartyExp(100, ['leader', 'm1', 'm2'], 'leader', 60);
  assert.equal(split.m1, 30);
  assert.equal(split.m2, 30);
  assert.equal(split.leader, 40);

  const party: PartyState = {
    id: 'p1',
    leaderUid: 'leader',
    expShareRatio: 50,
    lootRule: 'leader_only',
    members: [
      { uid: 'leader', name: '队长', classId: 'knight', level: 10, worldId: 'grand_city', x: 100, y: 100, hp: 100, maxHp: 100, online: true },
      { uid: 'm1', name: '队友', classId: 'holy_priest', level: 10, worldId: 'grand_city', x: 120, y: 120, hp: 100, maxHp: 100, online: true },
    ],
  };
  assert.equal(resolvePartyLootRecipient(party, 'm1'), 'leader');
  assert.equal(resolvePartyLootRecipient(null, 'm1'), 'm1');

  assert.equal(DUNGEON_FLOORS.length, 20);
  // Sequential climbing starts at 1F -> highest + 1
  assert.equal(canEnterDungeonFloor(1, 0).allowed, true);
  assert.equal(canEnterDungeonFloor(2, 0).allowed, false);
  assert.equal(canEnterDungeonFloor(2, 1).allowed, true);
  assert.equal(canEnterDungeonFloor(5, 3).allowed, false);
  assert.equal(canEnterDungeonFloor(5, 4).allowed, true);
  assert.equal(canEnterDungeonFloor(100000, 99999).allowed, true);

  // Endless floor definitions and Lv.1000 monster cap
  const f1 = getDungeonFloorDef(1);
  const f25 = getDungeonFloorDef(25);
  const f100k = getDungeonFloorDef(100000);
  assert.equal(f1.requiresParty, false);
  assert.equal(f25.floor, 25);
  assert.equal(f100k.floor, 100000);
  assert.equal(f100k.recommendedLv, MAX_MONSTER_LEVEL);

  const boss1 = getScaledBossStats('dungeon', 0, 1, 1, 1);
  const boss20 = getScaledBossStats('dungeon', 0, 1, 20, 1);
  const boss100k = getScaledBossStats('dungeon', 0, 1, 100000, 1);
  assert.ok(boss20.maxHp > boss1.maxHp);
  assert.ok(boss100k.maxHp > boss20.maxHp);
  assert.ok(Number.isFinite(boss100k.maxHp) && Number.isFinite(boss100k.atk));
  assert.equal(boss100k.level, MAX_MONSTER_LEVEL);

  // Multiplayer dungeon difficulty doubles for 2 players and scales higher with more players
  const diff1 = getDungeonPartyDifficultyMultiplier(1);
  const diff2 = getDungeonPartyDifficultyMultiplier(2);
  const diff4 = getDungeonPartyDifficultyMultiplier(4);
  assert.equal(diff1.difficultyMult, 1);
  assert.equal(diff2.difficultyMult, 2);
  assert.ok(diff4.difficultyMult > diff2.difficultyMult);

  const solo10 = getScaledBossStats('dungeon', 0, 1, 10, 1);
  const duo10 = getScaledBossStats('dungeon', 0, 1, 10, 2);
  const quad10 = getScaledBossStats('dungeon', 0, 1, 10, 4);
  assert.ok(duo10.maxHp >= solo10.maxHp * 2);
  assert.ok(duo10.atk >= solo10.atk * 2);
  assert.ok(quad10.maxHp > duo10.maxHp);

  const mob100k = getScaledDungeonMobStats(40, 10, 15, 100000, 2);
  assert.equal(mob100k.level, MAX_MONSTER_LEVEL);
  assert.ok(Number.isFinite(mob100k.hp) && Number.isFinite(mob100k.atk));

  // Dungeon deaths do NOT drop level
  assert.equal(shouldApplyDeathLevelPenalty('dungeon'), false);
  assert.equal(shouldApplyDeathLevelPenalty('world1'), true);
  assert.equal(shouldApplyDeathLevelPenalty('world2'), true);
});

test('rollDamage respects forced crits, critDisabled for mages, and expNeeded scales positively', () => {
  const res = rollDamage(20, 10, true, () => 0.5, 2.5, false);
  assert.equal(res.crit, true);
  assert.ok(res.dmg >= 48);

  const mageNoCrit = rollDamage(20, 99, true, () => 0.5, 2.5, true);
  assert.equal(mageNoCrit.crit, false);
  assert.ok(expNeeded(2) > expNeeded(1));
});

test('computeJoystickVector applies deadzone, clamps to radius, and preserves 360 angles', () => {
  const inside = computeJoystickVector(3, 4, 50, 0.14);
  assert.equal(inside.mag, 0);
  assert.equal(inside.x, 0);
  assert.equal(inside.y, 0);

  const clamped = computeJoystickVector(120, 0, 50, 0.14);
  assert.ok(Math.abs(clamped.mag - 1) < 1e-6);
  assert.ok(Math.abs(clamped.x - 1) < 1e-6);
  assert.ok(Math.abs(clamped.y) < 1e-6);

  const diag = computeJoystickVector(-50, 50, 50, 0.14);
  assert.ok(Math.abs(diag.mag - 1) < 1e-6);
  assert.ok(diag.x < 0 && diag.y > 0);
});

test('computeAutoAimAngle selects nearest target within range on both PC & mobile or falls back', () => {
  const fallback = 1.25;
  assert.equal(
    computeAutoAimAngle(0, 0, fallback, 200, [{ x: 350, y: 0 }]),
    fallback
  );
  const ang = computeAutoAimAngle(0, 0, fallback, 300, [
    { x: 220, y: 0 },
    { x: 0, y: 90 },
  ]);
  assert.ok(Math.abs(ang - Math.PI / 2) < 1e-6);
});

test('world1, world2, expanded online worlds, grand_city, and dungeon floors have zero unreachable tiles and 5 fixed bosses', () => {
  const w1a = generateFixedWorld('world1', null);
  const w1b = generateFixedWorld('world1', null);
  assert.equal(w1a.width, 210);
  assert.equal(w1a.tiles[105][105], w1b.tiles[105][105]);
  assert.equal(w1a.bossArenas.length, 5);
  assert.equal(w1a.portal.targetWorld, 'grand_city');
  assert.equal(w1a.safeRadius, MAIN_CITY_SAFE_RADIUS);
  assert.ok(w1a.awakening && w1a.elder && w1a.merchant && w1a.armorer && w1a.blacksmith && w1a.upgrader);
  assert.ok(w1a.signposts.length >= 6);

  const conn1 = verifyWorldConnectivity(w1a);
  assert.equal(conn1.unreachableCount, 0);
  assert.deepEqual(conn1.unreachableLandmarks, []);

  const w2 = generateFixedWorld('world2', null);
  assert.equal(w2.width, 210);
  assert.equal(w2.bossArenas.length, 5);
  assert.equal(w2.portal.targetWorld, 'world1');
  const conn2 = verifyWorldConnectivity(w2);
  assert.equal(conn2.unreachableCount, 0);
  assert.deepEqual(conn2.unreachableLandmarks, []);

  // Expanded online maps (250x250)
  const w1Online = generateFixedWorld('world1', null, { expandedOnline: true });
  assert.equal(w1Online.width, 250);
  assert.equal(w1Online.bossArenas.length, 5);
  assert.equal(verifyWorldConnectivity(w1Online).unreachableCount, 0);

  // Grand City (210x210) with 5 outer-ring bosses & Dungeon (54x54)
  const grandCity = generateFixedWorld('grand_city', null);
  assert.equal(grandCity.width, 210);
  assert.equal(grandCity.bossArenas.length, 5);
  assert.equal(grandCity.portal.targetWorld, 'world2');
  assert.ok(grandCity.dungeonGate);
  assert.ok(grandCity.socialBoard);
  assert.equal(verifyWorldConnectivity(grandCity).unreachableCount, 0);

  const dungeon1F = generateFixedWorld('dungeon', null, { dungeonFloor: 1 });
  assert.equal(dungeon1F.width, 54);
  assert.equal(dungeon1F.portal.targetWorld, 'dungeon');
  assert.ok(dungeon1F.dungeonGate);
  assert.notEqual(dungeon1F.portal.y, dungeon1F.dungeonGate.y);
  assert.equal(verifyWorldConnectivity(dungeon1F).unreachableCount, 0);
});

test('water tiles slow walking movement unless ignored, and arrows fly freely over water', () => {
  const tiles: Uint8Array[] = Array.from({ length: 150 }, () => new Uint8Array(150).fill(T_GRASS));
  for (let y = 10; y <= 14; y++) {
    for (let x = 10; x <= 14; x++) {
      tiles[y][x] = T_WATER;
    }
  }
  tiles[12][16] = T_ROCK;
  tiles[12][17] = T_TREE;

  const entWater = { x: 12 * TILE + TILE / 2, y: 12 * TILE + TILE / 2, r: 8 };
  const startX = entWater.x;
  moveEnt(tiles, entWater, 20, 0, false);
  const waterDelta = entWater.x - startX;
  assert.ok(Math.abs(waterDelta - 20 * WATER_SPEED_MULT) < 1e-6);

  const entDash = { x: 12 * TILE + TILE / 2, y: 12 * TILE + TILE / 2, r: 8 };
  moveEnt(tiles, entDash, 20, 0, true);
  assert.ok(Math.abs(entDash.x - (12 * TILE + TILE / 2 + 20)) < 1e-6);

  assert.equal(blocksProjectile(tiles, 12 * TILE + 16, 12 * TILE + 16), false);
  assert.equal(blocksProjectile(tiles, 16 * TILE + 16, 12 * TILE + 16), true);
  assert.equal(blocksProjectile(tiles, 17 * TILE + 16, 12 * TILE + 16), true);
});

test('breakthrough quests grow progressively harder and worldLevel scales with tier', () => {
  assert.equal(getBreakthroughCap(0), 10);
  assert.equal(getBreakthroughCap(1), 20);
  assert.equal(getBreakthroughCap(2), 30);
  assert.ok(getWorldLevel('world1', 1) > getWorldLevel('world1', 0));
  assert.ok(getWorldLevel('world2', 0) > getWorldLevel('world1', 0));

  const capped = applyExpWithBreakthrough(9, 0, 50000, 0);
  assert.equal(capped.level, 10);
  assert.equal(capped.hitCap, true);
  assert.equal(capped.cap, 10);
  assert.ok(capped.exp > 0);

  const postBreakthrough = applyExpWithBreakthrough(capped.level, capped.exp, 0, 1);
  assert.ok(postBreakthrough.level > 10);
  assert.ok(postBreakthrough.level <= 20);

  const btQuest0 = getBreakthroughQuestForTier(0, 'world1');
  const btQuest1 = getBreakthroughQuestForTier(1, 'world1');
  const btQuest2 = getBreakthroughQuestForTier(2, 'world2');
  assert.ok(btQuest1.target > btQuest0.target);
  assert.ok(btQuest2.target > btQuest1.target);

  let qState: ActiveQuestState = {
    questId: btQuest0.id,
    progress: 0,
    completed: false,
    isBreakthrough: true,
    targetTier: 1,
  };
  qState = advanceQuestProgress(qState, 'kill_boss', btQuest0.target, 0, 'world1')!;
  assert.equal(qState.completed, true);

  assert.ok(
    getWorldDifficultyMultiplier('world1', 1) > getWorldDifficultyMultiplier('world1', 0)
  );
  assert.ok(
    getWorldDifficultyMultiplier('world2', 0) > getWorldDifficultyMultiplier('world1', 0)
  );
  assert.ok(getScaledMobLevel(1, 'world2', 1) > getScaledMobLevel(1, 'world1', 0));
});

test('bestiary has 67 entries (65 regular mobs + 2 boss classes) within Firestore 256-key budget', () => {
  assert.equal(MOB_TYPES.length, 65);
  assert.equal(BESTIARY_MONSTERS.length, 67);
  assert.ok(BESTIARY_MONSTERS.length + 4 <= 256);
});

test('enhanced autoEquipBestGear honors class stat weights, weapon affinity, and returns upgradedSlots', () => {
  const mageRing: GearItem = {
    id: 'acc_mage',
    name: '奥术回蓝戒',
    slot: 'accessory',
    rarity: 'rare',
    level: 5,
    affixes: { maxMp: 45, mpRegen: 3.5, atk: 6 },
    sellValue: 40,
  };
  const critRing: GearItem = {
    id: 'acc_crit',
    name: '狂暴暴击戒',
    slot: 'accessory',
    rarity: 'rare',
    level: 5,
    affixes: { critChance: 14, critDmgBonus: 28, atk: 6 },
    sellValue: 40,
  };
  assert.ok(scoreGearForClass('mage', mageRing) > scoreGearForClass('mage', critRing));
  assert.ok(scoreGearForClass('assassin', critRing) > scoreGearForClass('assassin', mageRing));

  const paladinSword: GearItem = {
    id: 'w_psword',
    name: '晨曦圣剑',
    slot: 'weapon',
    rarity: 'epic',
    level: 6,
    weaponSubtype: 'sword',
    requiredCategory: 'knight_paladin',
    affixes: { atk: 18, def: 4 },
    sellValue: 70,
  };
  const archerBow: GearItem = {
    id: 'w_abow',
    name: '游侠长弓',
    slot: 'weapon',
    rarity: 'epic',
    level: 6,
    weaponSubtype: 'bow',
    requiredCategory: 'archer',
    affixes: { atk: 24 },
    sellValue: 75,
  };
  const paladinRes = autoEquipBestGear(
    'paladin',
    { weapon: null, armor: null, accessory: critRing },
    [paladinSword, archerBow, mageRing]
  );
  assert.equal(paladinRes.equipped.weapon?.id, 'w_psword');
  assert.ok(paladinRes.upgradedSlots.includes('weapon'));
  assert.equal(paladinRes.skippedIncompatibleCount, 1);

  const mageRes = autoEquipBestGear(
    'mage',
    { weapon: null, armor: null, accessory: critRing },
    [mageRing, paladinSword]
  );
  assert.equal(mageRes.equipped.accessory?.id, 'acc_mage');
  assert.ok(mageRes.upgradedSlots.includes('accessory'));
});

test('mobile touch mode expands NPC proximity radius and direct tap tolerance cleanly', () => {
  assert.ok(getNpcInteractRadius(true) > getNpcInteractRadius(false));
  assert.ok(getSignpostInteractRadius(true) > getSignpostInteractRadius(false));
  const touchTap = getCanvasTapInteractConfig(true);
  const deskTap = getCanvasTapInteractConfig(false);
  assert.ok(touchTap.tapHitRadius > deskTap.tapHitRadius);
  assert.ok(touchTap.maxPlayerReach > deskTap.maxPlayerReach);
});

test('organic world layout includes named geographical regions, dry shrines/chests, and stone bridges over water', () => {
  const w1 = generateFixedWorld('world1', null);
  const w2 = generateFixedWorld('world2', null);
  assert.ok(w1.regions.length >= 5);
  assert.ok(w2.regions.length >= 5);
  assert.ok(w1.regions.some((r) => r.kind === 'city'));
  assert.ok(w1.regions.some((r) => r.kind === 'water'));
  assert.ok(w2.regions.some((r) => r.kind === 'mountain'));

  for (const w of [w1, w2]) {
    for (const arena of w.bossArenas) {
      assert.notEqual(w.tiles[arena.ty][arena.tx], T_WATER);
    }
    for (const chest of w.chests) {
      assert.notEqual(w.tiles[chest.ty][chest.tx], T_WATER);
    }
  }

  let bridgeTiles = 0;
  for (let y = 5; y < w1.height - 5; y++) {
    for (let x = 5; x < w1.width - 5; x++) {
      if (
        w1.tiles[y][x] !== T_WATER &&
        w1.tiles[y][x] !== T_ROCK &&
        w1.tiles[y][x] !== T_TREE &&
        (w1.tiles[y - 1][x] === T_WATER || w1.tiles[y + 1][x] === T_WATER) &&
        w1.tiles[y][x - 1] !== T_WATER &&
        w1.tiles[y][x + 1] !== T_WATER
      ) {
        bridgeTiles++;
      }
    }
  }
  assert.ok(bridgeTiles >= 2);
});

test('online mode enforces single non-deletable slot1 and sanitizes custom player display names', () => {
  assert.equal(sanitizePlayerDisplayName('  <b>剑皇</b>  ', ''), 'b剑皇/b');
  assert.equal(sanitizePlayerDisplayName('   A   ', ''), '');
  assert.equal(sanitizePlayerDisplayName('  主宰战神  '), '主宰战神');

  const rawAcc = createDefaultAccountData('u1', '主宰战神', 'online');
  rawAcc.slots.slot1 = {
    slotId: 'slot1',
    seed: 123456,
    worldId: 'world1',
    breakthroughTier: 1,
    classId: 'knight',
    awakened: true,
    level: 12,
    exp: 0,
    gold: 100,
    potions: 5,
    kills: 20,
    skillLevels: [1, 1, 1, 1],
    player: {
      x: 100,
      y: 100,
      hp: 100,
      mp: 50,
      baseMaxHp: 148,
      baseMaxMp: 64,
      baseAtk: 10.6,
      baseDef: 5.2,
      baseSpeed: 160,
      baseCrit: 12,
    },
    equipped: { weapon: null, armor: null, accessory: null },
    inventory: [],
    materials: {},
    skillBooks: [],
    activeQuest: null,
    completedQuestCount: 0,
    chests: '',
    world2Chests: '',
    grandCityChests: '',
    prices: {},
    highestDungeonFloor: 0,
    time: 0,
    updatedAt: Date.now(),
  };
  rawAcc.slots.slot2 = { ...rawAcc.slots.slot1, slotId: 'slot2' };
  rawAcc.slots.slot3 = { ...rawAcc.slots.slot1, slotId: 'slot3' };

  const sanitizedOnline = sanitizeAccountData(rawAcc, 'u1', '主宰战神');
  assert.equal(sanitizedOnline.mode, 'online');
  assert.ok(sanitizedOnline.slots.slot1);
  assert.equal(sanitizedOnline.slots.slot2, null);
  assert.equal(sanitizedOnline.slots.slot3, null);
  assert.equal(sanitizedOnline.displayName, '主宰战神');
});

test('canAwakenClass enforces permanent class lock after awakening', () => {
  assert.equal(canAwakenClass('novice', false).allowed, true);
  assert.equal(canAwakenClass('novice', true).allowed, true);
  assert.equal(canAwakenClass('knight', false).allowed, true);

  const locked = canAwakenClass('knight', true);
  assert.equal(locked.allowed, false);
  assert.ok(locked.reason && locked.reason.includes('锁定'));

  const hiddenLocked = canAwakenClass('abyss_bastion', true);
  assert.equal(hiddenLocked.allowed, false);
});

test('applyDeathLevelPenalty deducts 5 levels cleanly while preserving breakthroughTier and flooring at Lv.1', () => {
  assert.equal(DEATH_LEVEL_PENALTY, 5);
  const def = CLASS_DEFS.knight;
  const lv54Base = {
    baseMaxHp: def.baseHp + 53 * def.hpPerLv + 40,
    baseMaxMp: def.baseMp + 53 * def.mpPerLv,
    baseAtk: def.baseAtk + 53 * def.atkPerLv + 12,
    baseDef: def.baseDef + 53 * def.defPerLv,
    baseSpeed: def.baseSpeed + 53 * def.speedPerLv,
  };
  const penalty54 = applyDeathLevelPenalty(54, lv54Base, 'knight', 5);
  assert.equal(penalty54.newLevel, 49);
  assert.equal(penalty54.droppedLevels, 5);
  assert.equal(penalty54.breakthroughTier, 5);
  assert.equal(penalty54.baseMaxHp, lv54Base.baseMaxHp - 5 * def.hpPerLv);
  assert.equal(penalty54.baseAtk, lv54Base.baseAtk - 5 * def.atkPerLv);

  const lv3Base = {
    baseMaxHp: def.baseHp + 2 * def.hpPerLv,
    baseMaxMp: def.baseMp + 2 * def.mpPerLv,
    baseAtk: def.baseAtk + 2 * def.atkPerLv,
    baseDef: def.baseDef + 2 * def.defPerLv,
    baseSpeed: def.baseSpeed + 2 * def.speedPerLv,
  };
  const penalty3 = applyDeathLevelPenalty(3, lv3Base, 'knight', 0);
  assert.equal(penalty3.newLevel, 1);
  assert.equal(penalty3.droppedLevels, 2);
  assert.equal(penalty3.breakthroughTier, 0);
  assert.ok(penalty3.baseMaxHp >= def.baseHp);
  assert.ok(penalty3.baseAtk >= def.baseAtk);
});

test('resolveWeatherForWorldAndTime switches weather by time-of-day/worldId and applies speed/crit/fire modifiers', () => {
  const seenKinds = new Set<string>();
  for (const wid of ['world1', 'world2', 'grand_city', 'dungeon'] as const) {
    for (let step = 0; step < 12; step++) {
      const w = resolveWeatherForWorldAndTime(wid, step * (DAY_CYCLE_DURATION / 3), step);
      seenKinds.add(w.kind);
      assert.ok(w.speedMult > 0 && w.speedMult <= 1.2);
      assert.ok(w.fireDmgMult > 0 && w.fireDmgMult <= 1.2);
    }
  }
  assert.ok(seenKinds.has('clear'));
  assert.ok(seenKinds.has('drizzle'));
  assert.ok(seenKinds.has('thunderstorm'));
  assert.ok(seenKinds.has('fog'));
  assert.ok(seenKinds.has('snow'));

  // Rainy weather dampens fire damage; fog drops speed & lowers crit; thunderstorm/snow/drizzle boost crit
  assert.ok(WEATHER_DEFS.drizzle.fireDmgMult < 1);
  assert.ok(WEATHER_DEFS.thunderstorm.fireDmgMult < 1);
  assert.ok(WEATHER_DEFS.drizzle.critBonusPct > 0);
  assert.ok(WEATHER_DEFS.snow.critBonusPct > 0);
  assert.ok(WEATHER_DEFS.fog.speedMult < 1);
  assert.ok(WEATHER_DEFS.fog.critBonusPct < 0);
  assert.ok(WEATHER_DEFS.thunderstorm.critBonusPct > 0);

  assert.equal(isFireElementalAttack('mage'), true);
  assert.equal(isFireElementalAttack('flame_marksman'), true);
  assert.equal(isFireElementalAttack('knight', '烈焰重击'), true);
  assert.equal(isFireElementalAttack('frostmage', '冰霜新星'), false);
});

test('elite affix system exposes all 4 affixes and promotes stats cleanly', () => {
  assert.deepEqual(ELITE_AFFIX_LIST, ['frozen', 'swift', 'splitter', 'vampiric']);
  assert.equal(pickEliteAffix(() => 0), 'frozen');
  assert.equal(pickEliteAffix(() => 0.3), 'swift');
  assert.equal(pickEliteAffix(() => 0.6), 'splitter');
  assert.equal(pickEliteAffix(() => 0.9), 'vampiric');

  const base = {
    name: '哥布林',
    r: 12,
    hp: 100,
    atk: 20,
    exp: 30,
    speed: 100,
    atkSpeed: 1.2,
  };
  const swift = applyEliteAffixToMobStats(base, 'swift');
  assert.equal(swift.name, `${ELITE_AFFIX_DEFS.swift.prefix}哥布林`);
  assert.ok(swift.maxHp > base.hp);
  assert.ok(swift.atk > base.atk);
  assert.ok(swift.exp > base.exp);
  assert.ok(swift.speed >= 138);
  assert.ok(swift.atkSpeed < base.atkSpeed);

  const frozen = applyEliteAffixToMobStats(base, 'frozen');
  assert.equal(frozen.name, '【冰冻】哥布林');
  assert.ok(frozen.speed < swift.speed);
});

test('computeComboImpactFeedback scales shake and vignette pulse across combo tiers', () => {
  const low = computeComboImpactFeedback(5, false);
  assert.equal(low.tier, 'none');
  assert.equal(low.shake, 0);
  assert.equal(low.vignetteStrength, 0);

  const mid = computeComboImpactFeedback(25, false);
  assert.equal(mid.tier, 'hot');
  assert.ok(mid.shake > 0);
  assert.ok(mid.vignetteStrength > 0.5);

  const gold = computeComboImpactFeedback(50, true);
  assert.equal(gold.tier, 'gold');
  assert.ok(gold.shake > mid.shake);
  assert.equal(gold.vignetteStrength, 1.0);
});

test('fog-of-war bitmap reveals circles, round-trips encode/decode, and survives save sanitization', () => {
  const w = 110;
  const h = 110;
  const bmp = createFogBitmap(w, h);
  assert.equal(countExploredTiles(bmp), 0);

  const changed = revealFogCircle(bmp, w, h, 55, 55, 10);
  assert.equal(changed, true);
  const count1 = countExploredTiles(bmp);
  assert.ok(count1 > 280 && count1 < 360);

  // Revealing the exact same spot again reports false (no new tiles)
  assert.equal(revealFogCircle(bmp, w, h, 55, 55, 10), false);

  const encoded = encodeFogBitmap(bmp);
  assert.ok(encoded.length > 0);
  const decoded = decodeFogBitmap(encoded, w, h);
  assert.equal(countExploredTiles(decoded), count1);
  assert.equal(decoded[55 * w + 55], 1);
  assert.equal(decoded[0], 0);

  const acc = createDefaultAccountData('u1', 'Tester');
  acc.slots.slot1 = {
    slotId: 'slot1',
    seed: 123,
    worldId: 'world1',
    breakthroughTier: 0,
    classId: 'knight',
    level: 5,
    exp: 0,
    gold: 100,
    potions: 2,
    kills: 10,
    player: {
      x: 500,
      y: 500,
      hp: 100,
      mp: 50,
      baseMaxHp: 100,
      baseMaxMp: 50,
      baseAtk: 15,
      baseDef: 5,
      baseSpeed: 180,
      baseCrit: 10,
    },
    chests: '',
    prices: {},
    equipped: { weapon: null, armor: null, accessory: null },
    inventory: [],
    fogExplored: { world1: encoded },
    activeQuest: null,
    completedQuestCount: 0,
    time: 10,
    updatedAt: Date.now(),
  };
  const sanitized = sanitizeAccountData(acc, 'u1', 'Tester');
  assert.equal(sanitized.slots.slot1?.fogExplored?.world1, encoded);
});

test('chunk mob spawn density cap prevents clustering and enforces minimum spacing', () => {
  assert.equal(MAX_MOBS_PER_CHUNK, 3);
  assert.equal(MIN_MOB_SPAWN_SPACING, 115);

  const chunkSizePx = TILE * MOB_CHUNK_TILES;
  const mobs = [
    { x: 200, y: 200 },
    { x: 400, y: 200 },
    { x: 600, y: 400 },
  ];
  // 4th mob inside same chunk (0,0) must be blocked even if well spaced
  const blocked = canSpawnMobAtPosition(300, 600, mobs);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.chunkCount, 3);
  // Spawning inside adjacent chunk (1,0) succeeds
  assert.equal(canSpawnMobAtPosition(chunkSizePx + 200, 200, mobs).ok, true);
  // Spawning too close (<115px) across chunk boundary or inside empty chunk fails
  assert.equal(canSpawnMobAtPosition(250, 220, mobs).ok, false);
});

test('weather epochs remain stable across 180s windows and never flicker mid-epoch', () => {
  assert.equal(WEATHER_CYCLE_DURATION, 180);
  const base = resolveWeatherForWorldAndTime('world1', 5, 42);
  for (let t = 1; t < WEATHER_CYCLE_DURATION; t += 17) {
    const sample = resolveWeatherForWorldAndTime('world1', t, 42);
    assert.equal(sample.kind, base.kind);
  }
});

test('steeper early-game EXP curve and tougher Lv.1-10 combat balance', () => {
  assert.ok(expNeeded(1) >= 55);
  assert.ok(expNeeded(5) > expNeeded(1) * 5);
  const earlyMob = getScaledMobStats(40, 8, 12, 'world1', 0, 0);
  assert.ok(earlyMob.hp > 40);
  assert.ok(earlyMob.atk > 8);
  assert.ok(earlyMob.exp <= 12);
});

test('250x250 expanded online fog-of-war bitmap survives save sanitization cleanly', () => {
  const w = 250;
  const h = 250;
  const bmp = createFogBitmap(w, h);
  assert.equal(revealFogCircle(bmp, w, h, 125, 125, 12), true);
  const encoded = encodeFogBitmap(bmp);
  assert.ok(encoded.length > 8192 && encoded.length <= 16384);

  const acc = createDefaultAccountData('u_fog250', 'FogTester');
  acc.slots.slot1 = {
    slotId: 'slot1',
    seed: 123,
    worldId: 'world1',
    breakthroughTier: 0,
    classId: 'knight',
    level: 5,
    exp: 0,
    gold: 100,
    potions: 2,
    kills: 10,
    player: {
      x: 500,
      y: 500,
      hp: 100,
      mp: 50,
      baseMaxHp: 100,
      baseMaxMp: 50,
      baseAtk: 15,
      baseDef: 5,
      baseSpeed: 180,
      baseCrit: 10,
    },
    chests: '',
    prices: {},
    equipped: { weapon: null, armor: null, accessory: null },
    inventory: [],
    fogExplored: { world1: encoded },
    activeQuest: null,
    completedQuestCount: 0,
    time: 10,
    updatedAt: Date.now(),
  };
  const sanitized = sanitizeAccountData(acc, 'u_fog250', 'FogTester');
  assert.equal(sanitized.slots.slot1?.fogExplored?.world1, encoded);
  const decoded = decodeFogBitmap(encoded, w, h);
  assert.equal(decoded[125 * w + 125], 1);
});

test('saveAccountSyncForUnload recovers newer unsaved online progress without leaking to singleplayer storage', async () => {
  const store = new Map<string, string>();
  const origLS = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };

  try {
    const uid = 'crash_test_online_u1';
    const olderAcc = createDefaultAccountData(uid, '急存勇者', 'online');
    olderAcc.slots.slot1 = {
      slotId: 'slot1',
      seed: 1,
      worldId: 'world1',
      breakthroughTier: 0,
      classId: 'knight',
      awakened: true,
      level: 4,
      exp: 10,
      gold: 50,
      potions: 2,
      kills: 5,
      skillLevels: [1, 1, 1, 1],
      player: {
        x: 3300,
        y: 3300,
        hp: 120,
        mp: 50,
        baseMaxHp: 120,
        baseMaxMp: 50,
        baseAtk: 14,
        baseDef: 6,
        baseSpeed: 165,
        baseCrit: 10,
      },
      chests: '',
      prices: {},
      equipped: { weapon: null, armor: null, accessory: null },
      inventory: [],
      activeQuest: null,
      completedQuestCount: 0,
      time: 100,
      updatedAt: 1_000_000,
    };
    await saveOnlineRoomProfile(olderAcc);

    // Simulate newer progress written synchronously just before sudden tab close
    const newerAcc = structuredClone(olderAcc);
    newerAcc.slots.slot1!.level = 7;
    newerAcc.slots.slot1!.gold = 999;
    newerAcc.slots.slot1!.updatedAt = 2_000_000;
    saveAccountSyncForUnload(newerAcc);

    assert.ok(store.has(getOnlinePendingKey(uid)));
    assert.equal(store.has(getStorageKeyForMode(uid, 'singleplayer')), false);

    const recovered = await loadOnlineRoomProfile(uid, '急存勇者');
    assert.equal(recovered.hasProfile, true);
    assert.equal(recovered.account.slots.slot1?.level, 7);
    assert.equal(recovered.account.slots.slot1?.gold, 999);
    // Once re-encrypted, stale pending key is cleaned up
    assert.equal(store.has(getOnlinePendingKey(uid)), false);
  } finally {
    (globalThis as Record<string, unknown>).localStorage = origLS;
  }
});

test('semver comparator, Simplified Chinese release history, and native-only update check boundary work strictly', async () => {
  assert.equal(compareSemver('1.2.0', '1.0.9'), 1);
  assert.equal(compareSemver('v1.0.0', '1.0.0'), 0);
  assert.equal(compareSemver('0.9.5', '1.0.0'), -1);

  assert.equal(GITHUB_REPO_URL, 'https://github.com/Zhoyi011/fantasy-continent');
  assert.ok(DEFAULT_DOWNLOAD_LINKS.windowsSetup.endsWith('/fantasy-continent-windows-setup.exe'));
  assert.ok(DEFAULT_DOWNLOAD_LINKS.windowsPortable.endsWith('/fantasy-continent-windows-portable.exe'));
  assert.ok(DEFAULT_DOWNLOAD_LINKS.androidApk.endsWith('/fantasy-continent-android.apk'));
  assert.ok(DEFAULT_DOWNLOAD_LINKS.linuxAppImage.endsWith('/fantasy-continent-linux.AppImage'));
  assert.ok(DEFAULT_DOWNLOAD_LINKS.linuxDeb.endsWith('/fantasy-continent-linux.deb'));

  const history = getBundledReleaseHistory();
  assert.ok(history.length >= 3);
  assert.ok(history[0].categories.features.length > 0);
  assert.ok(history[0].categories.improvements.length > 0);
  assert.ok(history[0].categories.fixes.length > 0);

  // In non-native/browser context, must strictly identify as web and NEVER trigger native update dialog
  assert.equal(detectRuntimePlatform(), 'web');
  assert.equal(isNativeClientShell(), false);
  const webCheckResult = await checkForNativeClientUpdate();
  assert.equal(webCheckResult, null);
});




