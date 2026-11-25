import {
  ARCHETYPE_DEFS,
  ARCHETYPE_LIST,
  AWAKENED_CLASSES,
  BESTIARY_MONSTERS,
  CLASS_DEFS,
  CLASS_LIST,
  CRAFT_RECIPES,
  DUNGEON_FLOORS,
  FLOOR_BOSS_TEMPLATES,
  getClassesByArchetype,
  HIDDEN_CLASSES,
  MATERIAL_DEFS,
  MATERIAL_MAP,
  MELEE_CLASSES,
  RANGED_CLASSES,
} from './catalog.ts';
import type {
  AccountData,
  AchievementDef,
  ActiveQuestState,
  ArchetypeId,
  ClassCategoryRestriction,
  ClassId,
  ComputedStats,
  CraftRecipeDef,
  DayPhase,
  DungeonFloorDef,
  EliteAffixDef,
  EliteAffixId,
  EquippedGear,
  GameSettings,
  GearAffixes,
  GearItem,
  GearRarity,
  GearSlot,
  GearWeaponSubtype,
  MaterialBag,
  MaterialId,
  PartyState,
  PlayMode,
  QuestDef,
  QuestType,
  SaveSlotData,
  SaveSlotId,
  ShopItemDef,
  SkillBookItem,
  SkillSlotIndex,
  TalentDef,
  TalentLevels,
  TimeOfDayInfo,
  WeaponKind,
  WeatherInfo,
  WeatherKind,
  WorldId,
} from './types.ts';

export {
  ARCHETYPE_DEFS,
  ARCHETYPE_LIST,
  AWAKENED_CLASSES,
  BESTIARY_MONSTERS,
  CLASS_DEFS,
  CLASS_LIST,
  CRAFT_RECIPES,
  DUNGEON_FLOORS,
  FLOOR_BOSS_TEMPLATES,
  getClassesByArchetype,
  HIDDEN_CLASSES,
  MATERIAL_DEFS,
  MATERIAL_MAP,
  MELEE_CLASSES,
  RANGED_CLASSES,
};

export const MAX_ENHANCE_LV = 100;
export const MAX_SKILL_LV = 10;
export const MAX_MONSTER_LEVEL = 1000;

export const WORLD_META: Record<
  WorldId,
  {
    id: WorldId;
    name: string;
    subtitle: string;
    cityName: string;
    elderName: string;
    merchantName: string;
    altarName: string;
    awakeningName: string;
    armorerName: string;
    blacksmithName: string;
    upgraderName: string;
    portalLabel: string;
    recommendedLv: number;
    baseDifficulty: number;
  }
> = {
  world1: {
    id: 'world1',
    name: '晨曦大陆',
    subtitle: '第一世界 · 原始森林与大道',
    cityName: '晨曦圣城',
    elderName: '晨曦长老',
    merchantName: '补给商人',
    altarName: '远古祭坛',
    awakeningName: '觉醒导师',
    armorerName: '军械商人',
    blacksmithName: '锻造铁匠',
    upgraderName: '星纹强化师',
    portalLabel: '前往王都大城市 · 幻光王城',
    recommendedLv: 1,
    baseDifficulty: 1.0,
  },
  world2: {
    id: 'world2',
    name: '烈焰深渊',
    subtitle: '第二世界 · 焦土裂隙与魔城',
    cityName: '深渊庇护所',
    elderName: '深渊长老',
    merchantName: '黑市商人',
    altarName: '深渊祭坛',
    awakeningName: '觉醒导师',
    armorerName: '黑市军械商',
    blacksmithName: '魔炉铁匠',
    upgraderName: '深渊附魔师',
    portalLabel: '返回第一世界 · 晨曦大陆',
    recommendedLv: 10,
    baseDifficulty: 1.65,
  },
  grand_city: {
    id: 'grand_city',
    name: '幻光王城',
    subtitle: '大城市 · 商贸广场与试炼之塔',
    cityName: '幻光王都',
    elderName: '王都大长老',
    merchantName: '王都百货商',
    altarName: '圣辉大祭坛',
    awakeningName: '圣殿觉醒导师',
    armorerName: '皇家军械库',
    blacksmithName: '神匠工坊',
    upgraderName: '百锻大师',
    portalLabel: '返回第一世界 / 烈焰深渊',
    recommendedLv: 5,
    baseDifficulty: 0.95,
  },
  dungeon: {
    id: 'dungeon',
    name: '试炼之塔',
    subtitle: '多层副本空间 · 首领镇守',
    cityName: '试炼密室',
    elderName: '试炼记录官',
    merchantName: '行脚商人',
    altarName: '复苏圣碑',
    awakeningName: '觉醒导师',
    armorerName: '军械商',
    blacksmithName: '铁匠',
    upgraderName: '强化师',
    portalLabel: '离开副本返回幻光王城',
    recommendedLv: 5,
    baseDifficulty: 1.25,
  },
};

export const REALM_NAMES = [
  '凡胎初境',
  '炼气筑基',
  '金丹破晓',
  '元婴化神',
  '圣域宗师',
  '不朽神话',
  '太虚星尊',
  '永恒圣帝',
] as const;

export function getBreakthroughCap(breakthroughTier: number): number {
  const safeTier = Math.max(0, Math.floor(breakthroughTier));
  return (safeTier + 1) * 10;
}

export function getRealmName(breakthroughTier: number): string {
  const safeTier = Math.max(0, Math.floor(breakthroughTier));
  return REALM_NAMES[Math.min(REALM_NAMES.length - 1, safeTier)];
}

export function getWorldLevel(worldId: WorldId, breakthroughTier: number): number {
  const safeTier = Math.max(0, Math.floor(breakthroughTier));
  const worldBonus = worldId === 'world2' ? 9 : worldId === 'grand_city' ? 3 : 0;
  // 2 阶（Lv.30+）之后保持稳定进阶，避免怪物等级脱节
  const tierLv = safeTier <= 2 ? safeTier * 4 : 8 + Math.round((safeTier - 2) * 7.5);
  return Math.min(MAX_MONSTER_LEVEL, 1 + tierLv + worldBonus);
}

export function getWorldDifficultyMultiplier(worldId: WorldId, breakthroughTier: number): number {
  const safeTier = Math.max(0, Math.floor(breakthroughTier));
  const worldBase = WORLD_META[worldId].baseDifficulty;
  // 0~2 阶线性起步，3 阶（Lv.30+）起增强成长斜率以匹配觉醒与高强化装备输出
  const effTier =
    safeTier <= 2
      ? safeTier
      : 2 + (safeTier - 2) * 1.45 + Math.pow(safeTier - 2, 1.35) * 0.65;
  const step = worldId === 'world2' ? 0.85 : 0.72;
  return Math.round((worldBase + effTier * step) * 100) / 100;
}

export function getScaledMobLevel(
  baseTier: number,
  worldId: WorldId,
  breakthroughTier: number,
  jitter = 0
): number {
  const safeTier = Math.max(0, Math.floor(breakthroughTier));
  const worldOffset = worldId === 'world2' ? 9 : worldId === 'grand_city' ? 3 : 0;
  const realmOffset =
    safeTier <= 2 ? safeTier * 4.5 : 9 + (safeTier - 2) * 7.8;
  const tierFactor = Math.min(baseTier, 5) * 2.0 + Math.max(0, baseTier - 5) * 1.25;
  return Math.min(
    MAX_MONSTER_LEVEL,
    Math.max(1, Math.round(1 + tierFactor + worldOffset + realmOffset + jitter))
  );
}

export function getScaledMobStats(
  baseHp: number,
  baseAtk: number,
  baseExp: number,
  worldId: WorldId,
  breakthroughTier: number,
  mobTier: number
): { hp: number; atk: number; exp: number; speedMult: number } {
  const diff = getWorldDifficultyMultiplier(worldId, breakthroughTier);
  // 提升前期普通魔物血量与攻击压迫感，并适度收敛前期经验获取速度
  const hpMult = diff <= 1.5 ? diff * 1.48 : 2.22 + Math.pow(diff - 1.5, 1.32) * 1.38;
  const atkMult = diff <= 1.5 ? 1.42 * Math.pow(diff, 0.9) : 2.04 + Math.pow(diff - 1.5, 1.24) * 1.32;
  const tierCompress = mobTier <= 5 ? 1 : 1 + (mobTier - 5) * 0.1;
  return {
    hp: Math.max(16, Math.round(baseHp * hpMult * tierCompress)),
    atk: Math.max(3, Math.round(baseAtk * atkMult)),
    exp: Math.max(3, Math.round(baseExp * (0.52 + diff * 0.42))),
    speedMult: 1 + Math.min(0.32, Math.max(0, breakthroughTier) * 0.035),
  };
}

export function getDungeonPartyDifficultyMultiplier(playerCount: number): {
  playerCount: number;
  difficultyMult: number;
  hpMult: number;
  atkMult: number;
  rewardMult: number;
} {
  const n = Math.max(1, Math.floor(Number.isFinite(playerCount) ? playerCount : 1));
  if (n <= 1) {
    return { playerCount: 1, difficultyMult: 1, hpMult: 1, atkMult: 1, rewardMult: 1 };
  }
  // 多人副本直接把当前楼层难度翻倍起步（2人×2，3人×4，4人×8），人越多越险恶、掉落越丰厚
  const difficultyMult = Math.min(16, Math.pow(2, n - 1));
  const hpMult = difficultyMult;
  const atkMult =
    n === 2 ? 2 : Math.round((2 + (n - 2) * 0.75) * 100) / 100;
  const rewardMult = Math.round((1 + (n - 1) * 0.45) * 100) / 100;
  return { playerCount: n, difficultyMult, hpMult, atkMult, rewardMult };
}

const ENDLESS_REALM_PREFIXES = ['轮回', '炼狱', '太虚', '混沌', '永恒', '鸿蒙', '灭世', '神罚'] as const;

export function getDungeonFloorDef(floor: number): DungeonFloorDef {
  const safeFloor = Math.max(
    1,
    Math.floor(Number.isFinite(floor) ? floor : 1)
  );
  if (safeFloor <= DUNGEON_FLOORS.length) {
    return DUNGEON_FLOORS[safeFloor - 1];
  }
  const tpl = FLOOR_BOSS_TEMPLATES[(safeFloor - 1) % FLOOR_BOSS_TEMPLATES.length];
  const cycleIdx = Math.floor((safeFloor - 1) / FLOOR_BOSS_TEMPLATES.length);
  const prefix = ENDLESS_REALM_PREFIXES[(cycleIdx - 1) % ENDLESS_REALM_PREFIXES.length];
  const isMilestone = safeFloor % 5 === 0;
  const expScale = safeFloor * 92 + Math.pow(safeFloor, 1.24) * 32;
  const goldScale = safeFloor * 68 + Math.pow(safeFloor, 1.18) * 24;
  return {
    floor: safeFloor,
    name: `试炼之塔 ${safeFloor}F`,
    subtitle: isMilestone ? '守门领主楼层 · 通关解锁下一层' : '无尽试炼楼层 · 通关解锁下一层',
    recommendedLv: Math.min(MAX_MONSTER_LEVEL, Math.max(3, Math.round(2 + safeFloor * 2.2))),
    requiresParty: false,
    minPartySize: 1,
    mobCount: Math.min(20, 6 + Math.floor(Math.log2(safeFloor + 1) * 2.4)),
    bossId: `tower_boss_${safeFloor}_${tpl.archetype}`,
    bossName: `${prefix}·${tpl.name}`,
    bossTitle: `${safeFloor}层${isMilestone ? '守门霸主' : '无尽领主'}`,
    bossColor: tpl.color,
    rewardExp: Math.round((180 + expScale) * (isMilestone ? 1.35 : 1)),
    rewardGold: Math.round((140 + goldScale) * (isMilestone ? 1.35 : 1)),
    guaranteedRarity: 'legendary',
    skillBookDropChance: isMilestone ? 0.95 : 0.85,
  };
}

export function getScaledDungeonMobStats(
  baseHp: number,
  baseAtk: number,
  baseExp: number,
  floor: number,
  playerCount = 1
): { level: number; hp: number; atk: number; exp: number; speedMult: number } {
  const safeFloor = Math.max(1, Math.floor(Number.isFinite(floor) ? floor : 1));
  const partyDiff = getDungeonPartyDifficultyMultiplier(playerCount);
  const lv = Math.min(MAX_MONSTER_LEVEL, Math.max(3, Math.round(1 + safeFloor * 2)));
  const hpMult = (1 + (safeFloor - 1) * 0.46 + Math.pow(safeFloor - 1, 1.48) * 0.3) * 1.24;
  const atkMult = (1 + (safeFloor - 1) * 0.26 + Math.pow(safeFloor - 1, 1.18) * 0.15) * 1.22;
  const expMult = 0.72 + (safeFloor - 1) * 0.2;
  return {
    level: lv,
    hp: Math.max(24, Math.round(baseHp * hpMult * partyDiff.hpMult)),
    atk: Math.max(5, Math.round(baseAtk * atkMult * partyDiff.atkMult)),
    exp: Math.max(6, Math.round(baseExp * expMult * partyDiff.rewardMult)),
    speedMult: 1 + Math.min(0.4, Math.log2(safeFloor + 1) * 0.04),
  };
}

export function getScaledBossStats(
  worldId: WorldId,
  breakthroughTier: number,
  arenaTier: number,
  dungeonFloor?: number,
  dungeonPlayerCount = 1
): { level: number; maxHp: number; atk: number; speed: number; exp: number; gold: number } {
  if (dungeonFloor && dungeonFloor >= 1) {
    const f = Math.max(1, Math.floor(Number.isFinite(dungeonFloor) ? dungeonFloor : 1));
    const isMilestone = f % 5 === 0;
    const partyDiff = getDungeonPartyDifficultyMultiplier(dungeonPlayerCount);
    const lv = Math.min(MAX_MONSTER_LEVEL, Math.max(3, Math.round(2 + f * 2.2)));
    const hpBase = (480 + f * 260 + Math.pow(f, 1.64) * 145) * (isMilestone ? 1.25 : 1);
    const atkBase = 18 + f * 4.4 + Math.pow(f, 1.28) * 3.4 + (isMilestone ? 7 : 0);
    const expBase = (120 + f * 66 + Math.pow(f, 1.22) * 24) * (isMilestone ? 1.35 : 1);
    const goldBase = (140 + f * 68 + Math.pow(f, 1.18) * 24) * (isMilestone ? 1.35 : 1);
    return {
      level: lv,
      maxHp: Math.round(hpBase * partyDiff.hpMult),
      atk: Math.max(14, Math.round(atkBase * partyDiff.atkMult)),
      speed: Math.min(148, Math.round(94 + Math.log2(f + 1) * 7.5)),
      exp: Math.round(expBase * partyDiff.rewardMult),
      gold: Math.round(goldBase * partyDiff.rewardMult),
    };
  }

  const diff = getWorldDifficultyMultiplier(worldId, breakthroughTier);
  const safeTier = Math.max(0, Math.floor(breakthroughTier));
  const worldLv = getWorldLevel(worldId, safeTier);
  const lv = Math.min(MAX_MONSTER_LEVEL, Math.max(4, Math.round(worldLv + arenaTier * 3 + 2)));
  // 强化前期及中后期野外 Boss 血量与破防威胁，避免轻松碾压
  const hpCurve = (820 + arenaTier * 520) * (0.58 + 0.58 * Math.pow(diff, 1.85));
  const atkCurve = (21 + arenaTier * 6.5) * (0.54 + 0.6 * Math.pow(diff, 1.55));
  return {
    level: lv,
    maxHp: Math.round(hpCurve),
    atk: Math.max(15, Math.round(atkCurve)),
    speed: Math.min(138, Math.round(92 + arenaTier * 6 + safeTier * 3.5)),
    exp: Math.round((95 + arenaTier * 62) * (0.6 + diff * 0.45)),
    gold: Math.round((130 + arenaTier * 80) * (0.9 + diff * 0.55)),
  };
}

export function getBreakthroughQuestForTier(
  breakthroughTier: number,
  worldId: WorldId
): QuestDef {
  const safeTier = Math.max(0, Math.floor(breakthroughTier));
  const cap = getBreakthroughCap(safeTier);
  const nextRealm = getRealmName(safeTier + 1);
  const targetBossCount = Math.min(6, 1 + safeTier);
  const worldHint =
    safeTier === 0
      ? worldId === 'world1'
        ? '晨曦大陆'
        : '当前世界'
      : '烈焰深渊或试炼之塔高阶首领';
  return {
    id: `breakthrough_tier_${safeTier + 1}`,
    type: 'kill_boss',
    title: `破境试炼 ${safeTier + 1} 阶 · 晋升${nextRealm} (Lv.${cap}→Lv.${cap + 10})`,
    desc: `前往【${worldHint}】连续讨伐 ${targetBossCount} 位领主 BOSS，完成后找当前世界长老突破！`,
    target: targetBossCount,
    rewardGold: 420 + safeTier * 320,
    rewardExp: 180 + safeTier * 170,
    isBreakthrough: true,
    requiredWorld: safeTier === 0 ? 'world1' : 'world2',
  };
}

export const HIDDEN_CLASS_UNLOCK_LEVEL = 30;

export function canUnlockHiddenClass(
  level: number,
  _kills = 0,
  _soulStones = 0
): boolean {
  return level >= HIDDEN_CLASS_UNLOCK_LEVEL;
}

export const DEATH_LEVEL_PENALTY = 5;

export function shouldApplyDeathLevelPenalty(worldId: WorldId): boolean {
  return worldId !== 'dungeon';
}

export function canAwakenClass(
  currentClassId: ClassId,
  currentAwakened: boolean
): { allowed: boolean; reason?: string } {
  if (currentAwakened && currentClassId !== 'novice') {
    return {
      allowed: false,
      reason: '职业选定后已永久锁定，不可更换（敬请期待后续转职与重生系统）',
    };
  }
  return { allowed: true };
}

export function applyDeathLevelPenalty(
  currentLevel: number,
  baseStats: {
    baseMaxHp: number;
    baseMaxMp: number;
    baseAtk: number;
    baseDef: number;
    baseSpeed: number;
  },
  classId: ClassId,
  breakthroughTier: number,
  penaltyLevels = DEATH_LEVEL_PENALTY
): {
  newLevel: number;
  droppedLevels: number;
  breakthroughTier: number;
  baseMaxHp: number;
  baseMaxMp: number;
  baseAtk: number;
  baseDef: number;
  baseSpeed: number;
} {
  const safeLv = Math.max(1, Math.floor(currentLevel));
  const safePenalty = Math.max(0, Math.floor(penaltyLevels));
  const newLevel = Math.max(1, safeLv - safePenalty);
  const droppedLevels = Math.max(0, safeLv - newLevel);
  const def = CLASS_DEFS[classId] ?? CLASS_DEFS.novice;

  // 死亡仅倒扣等级与对应升级基础属性，完全保留商店宝石加成与已解锁的破境境界（breakthroughTier 不变）
  return {
    newLevel,
    droppedLevels,
    breakthroughTier: Math.max(0, Math.floor(breakthroughTier)),
    baseMaxHp: Math.max(def.baseHp, baseStats.baseMaxHp - droppedLevels * def.hpPerLv),
    baseMaxMp: Math.max(def.baseMp, baseStats.baseMaxMp - droppedLevels * def.mpPerLv),
    baseAtk: Math.max(def.baseAtk, baseStats.baseAtk - droppedLevels * def.atkPerLv),
    baseDef: Math.max(def.baseDef, baseStats.baseDef - droppedLevels * def.defPerLv),
    baseSpeed: Math.max(def.baseSpeed, baseStats.baseSpeed - droppedLevels * def.speedPerLv),
  };
}

export function sanitizePlayerDisplayName(raw: string, fallback = '冒险者'): string {
  const cleaned = (raw ?? '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return cleaned.length >= 2 ? cleaned : fallback;
}

export const SHOP_ITEMS: ShopItemDef[] = [
  { id: 'potion', icon: '🧪', name: '治疗药水', desc: '立即获得 1 瓶药水', base: 28, rep: 1.0 },
  { id: 'atk', icon: '⚔️', name: '力量宝石', desc: '永久 +3 攻击力', base: 85, rep: 1.42 },
  { id: 'def', icon: '🛡️', name: '守护宝石', desc: '永久 +2 防御力', base: 85, rep: 1.42 },
  { id: 'hp', icon: '❤️', name: '生命精华', desc: '永久 +22 最大生命', base: 110, rep: 1.5 },
];

export const QUEST_CATALOG: QuestDef[] = [
  {
    id: 'bounty_mobs',
    type: 'kill_mobs',
    title: '清理密林魔物',
    desc: '主城外原始森林与大道两侧魔物日渐躁动，请沿路击杀 15 只怪物。',
    target: 15,
    rewardGold: 130,
    rewardExp: 115,
  },
  {
    id: 'bounty_chests',
    type: 'open_chests',
    title: '搜寻失落秘宝',
    desc: '探险队在原始森林遗落了补给箱，请沿路标探索并开启 3 个野外宝箱。',
    target: 3,
    rewardGold: 165,
    rewardExp: 100,
  },
  {
    id: 'bounty_boss',
    type: 'kill_boss',
    title: '讨伐荒野领主',
    desc: '顺着主城大门外路牌指引前往领主祭坛或挑战试炼之塔，击败任意 1 位 BOSS！',
    target: 1,
    rewardGold: 340,
    rewardExp: 270,
  },
];

export function findQuestDefById(
  questId: string,
  breakthroughTier = 0,
  worldId: WorldId = 'world1'
): QuestDef | null {
  const standard = QUEST_CATALOG.find((q) => q.id === questId);
  if (standard) return standard;
  if (questId.startsWith('breakthrough_tier_')) {
    const num = Number(questId.replace('breakthrough_tier_', ''));
    const tierForQuest = Number.isFinite(num) && num >= 1 ? num - 1 : breakthroughTier;
    return getBreakthroughQuestForTier(tierForQuest, worldId);
  }
  return null;
}

export const TALENT_DEFS: TalentDef[] = [
  {
    id: 'atkLv',
    name: '战神之力',
    icon: '⚔️',
    desc: '磨砺武器本源，全账号所有角色永久提升攻击力。',
    maxLevel: 10,
    baseCost: 2,
    costStep: 1,
    perLevelLabel: '+2 攻击力 / 级',
  },
  {
    id: 'hpLv',
    name: '生命源泉',
    icon: '❤️',
    desc: '强化冒险者体魄，全账号所有角色永久提升最大生命值。',
    maxLevel: 10,
    baseCost: 2,
    costStep: 1,
    perLevelLabel: '+18 最大生命 / 级',
  },
  {
    id: 'goldLv',
    name: '点金圣手',
    icon: '🪙',
    desc: '提高击杀魔物与开启宝箱的金币掉落收益。',
    maxLevel: 10,
    baseCost: 2,
    costStep: 1,
    perLevelLabel: '+10% 金币收益 / 级',
  },
  {
    id: 'critDmgLv',
    name: '致命一击',
    icon: '💥',
    desc: '大幅提升触发暴击时的爆发伤害倍率（法师不享受暴击）。',
    maxLevel: 10,
    baseCost: 3,
    costStep: 2,
    perLevelLabel: '+12% 暴击伤害 / 级',
  },
  {
    id: 'potCapLv',
    name: '炼金腰带',
    icon: '🧪',
    desc: '提高药水携带上限与单瓶药水回复效率，新冒险初始附带更多药水。',
    maxLevel: 5,
    baseCost: 3,
    costStep: 2,
    perLevelLabel: '+2 药水上限 & +8% 回复 / 级',
  },
];

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    id: 'first_blood',
    title: '初出茅庐',
    desc: '在幻想大陆累计击杀 10 只魔物',
    icon: '🗡️',
    target: 10,
    metric: 'totalKills',
    rewardSoulStones: 2,
    bonusLabel: '+1 攻击力',
    bonus: { atk: 1 },
  },
  {
    id: 'slayer_50',
    title: '荒野清道夫',
    desc: '累计击杀 50 只魔物',
    icon: '🔥',
    target: 50,
    metric: 'totalKills',
    rewardSoulStones: 4,
    bonusLabel: '+10 最大生命',
    bonus: { maxHp: 10 },
  },
  {
    id: 'slayer_200',
    title: '魔物克星',
    desc: '累计击杀 200 只魔物',
    icon: '💀',
    target: 200,
    metric: 'totalKills',
    rewardSoulStones: 8,
    bonusLabel: '+3% 暴击率',
    bonus: { critChance: 3 },
  },
  {
    id: 'boss_hunter',
    title: '弑神者',
    desc: '击败至少 1 次野外或副本 BOSS',
    icon: '👑',
    target: 1,
    metric: 'bossKills',
    rewardSoulStones: 6,
    bonusLabel: '+2 攻击力 · +1 防御力',
    bonus: { atk: 2, def: 1 },
  },
  {
    id: 'treasure_seeker',
    title: '寻宝猎人',
    desc: '累计开启 8 个野外宝箱',
    icon: '📦',
    target: 8,
    metric: 'chestsOpened',
    rewardSoulStones: 4,
    bonusLabel: '+6 移动速度',
    bonus: { speed: 6 },
  },
  {
    id: 'quest_helper',
    title: '主城守护者',
    desc: '累计完成 3 次长老悬赏任务',
    icon: '📜',
    target: 3,
    metric: 'questsCompleted',
    rewardSoulStones: 5,
    bonusLabel: '+15 最大生命',
    bonus: { maxHp: 15 },
  },
  {
    id: 'epic_collector',
    title: '神装鉴赏家',
    desc: '获得任意史诗(紫)或传说(橙)品质装备',
    icon: '💎',
    target: 3,
    metric: 'bestRarityRank',
    rewardSoulStones: 5,
    bonusLabel: '+2% 暴击率',
    bonus: { critChance: 2 },
  },
  {
    id: 'veteran_lv10',
    title: '传奇觉醒',
    desc: '任意角色达到 Lv.10',
    icon: '⭐',
    target: 10,
    metric: 'maxLevel',
    rewardSoulStones: 7,
    bonusLabel: '+3 攻击力 · +2 防御力',
    bonus: { atk: 3, def: 2 },
  },
];

export const RARITY_META: Record<
  GearRarity,
  { label: string; color: string; border: string; bg: string; mult: number; affixCount: number; rank: number }
> = {
  common: {
    label: '普通',
    color: '#e2e8f0',
    border: 'rgba(226, 232, 240, 0.35)',
    bg: 'rgba(148, 163, 184, 0.10)',
    mult: 1,
    affixCount: 1,
    rank: 1,
  },
  rare: {
    label: '精良',
    color: '#60a5fa',
    border: 'rgba(96, 165, 250, 0.55)',
    bg: 'rgba(37, 99, 235, 0.14)',
    mult: 1.55,
    affixCount: 2,
    rank: 2,
  },
  epic: {
    label: '史诗',
    color: '#c084fc',
    border: 'rgba(192, 132, 252, 0.65)',
    bg: 'rgba(147, 51, 234, 0.16)',
    mult: 2.25,
    affixCount: 3,
    rank: 3,
  },
  legendary: {
    label: '传说',
    color: '#fb923c',
    border: 'rgba(251, 146, 60, 0.78)',
    bg: 'rgba(234, 88, 12, 0.18)',
    mult: 3.2,
    affixCount: 4,
    rank: 4,
  },
};

export const SLOT_LABEL: Record<GearSlot, string> = {
  weapon: '武器',
  armor: '护甲',
  accessory: '饰品',
};

export const SUBTYPE_LABEL: Record<GearWeaponSubtype, string> = {
  sword: '长剑',
  axe: '战斧',
  dagger: '双刃',
  spear: '长枪',
  bow: '长弓',
  crossbow: '重弩',
  staff: '法杖',
  scepter: '圣杖',
  heavy_armor: '重铠',
  light_armor: '轻甲',
  robe: '法袍',
  universal: '通用',
};

export const RESTRICTION_LABEL: Record<ClassCategoryRestriction, string> = {
  all: '全职业',
  melee: '近战系',
  ranged: '远程系',
  tank: '仅坦克系',
  assassin: '仅刺客系',
  archer: '仅射手系',
  healer: '仅奶妈系',
  mage: '仅法师系',
  knight_paladin: '坦克重剑系',
  berserker: '狂战/巨灵',
  spearmaster: '枪豪/重卫',
  celestial: '星穹剑仙',
};

export const DEFAULT_TALENTS: TalentLevels = {
  atkLv: 0,
  hpLv: 0,
  goldLv: 0,
  critDmgLv: 0,
  potCapLv: 0,
};

export const DEFAULT_SETTINGS: GameSettings = {
  muted: false,
  bgmEnabled: true,
  sfxVolume: 0.75,
  bgmVolume: 0.35,
};

export function generateFriendCode(uid = 'guest'): string {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const code = (Math.abs(h) % 900000) + 100000;
  return `HX-${code}`;
}

export function createDefaultAccountData(
  uid = 'guest',
  displayName = '流浪冒险者',
  mode: PlayMode = 'singleplayer'
): AccountData {
  return {
    uid,
    displayName,
    mode,
    friendCode: generateFriendCode(`${uid}_${mode}`),
    soulStones: 0,
    talents: { ...DEFAULT_TALENTS },
    bestiary: {},
    unlockedAchievements: [],
    slots: {
      slot1: null,
      slot2: null,
      slot3: null,
    },
    settings: { ...DEFAULT_SETTINGS },
  };
}

// ---- 五大体系 40 职业装备装配校验与一键配装 ----

export function canClassEquipItem(classId: ClassId, item: GearItem): boolean {
  const cls = CLASS_DEFS[classId] ?? CLASS_DEFS.novice;
  const arch = cls.archetype;
  const cat = item.requiredCategory;
  const sub = item.weaponSubtype;

  // 严格武器/防具子类型检查（法杖限法师，弓弩限射手，圣杖限奶妈，重铠限坦克/见习）
  if (sub === 'staff') {
    return arch === 'mage';
  }
  if (sub === 'scepter') {
    return arch === 'healer' || classId === 'celestial';
  }
  if (sub === 'bow' || sub === 'crossbow') {
    return arch === 'archer';
  }
  if (sub === 'axe') {
    return arch === 'tank';
  }
  if (sub === 'dagger') {
    return arch === 'assassin' || classId === 'ranger';
  }
  if (sub === 'spear') {
    return arch === 'tank';
  }
  if (sub === 'sword') {
    return arch === 'tank' || arch === 'novice';
  }
  if (sub === 'robe') {
    return arch === 'mage' || arch === 'healer' || arch === 'novice' || classId === 'celestial';
  }
  if (sub === 'heavy_armor') {
    return arch === 'tank' || arch === 'novice';
  }
  if (sub === 'light_armor') {
    return arch === 'assassin' || arch === 'archer' || arch === 'healer' || arch === 'novice' || classId === 'celestial';
  }

  if (!cat || cat === 'all') return true;
  if (cat === 'tank') return arch === 'tank';
  if (cat === 'assassin') return arch === 'assassin';
  if (cat === 'archer') return arch === 'archer';
  if (cat === 'healer') return arch === 'healer';
  if (cat === 'mage') return arch === 'mage';
  if (cat === 'melee') return arch === 'tank' || arch === 'assassin' || arch === 'novice' || classId === 'cleric';
  if (cat === 'ranged') return arch === 'archer' || arch === 'mage' || arch === 'healer';
  if (cat === 'knight_paladin') return arch === 'tank' || arch === 'novice';
  if (cat === 'berserker') return arch === 'tank';
  if (cat === 'spearmaster') return arch === 'tank';
  if (cat === 'celestial') return classId === 'celestial';
  return true;
}

export function getNpcInteractRadius(isTouchMode: boolean): number {
  return isTouchMode ? 148 : 108;
}

export function getSignpostInteractRadius(isTouchMode: boolean): number {
  return isTouchMode ? 136 : 104;
}

export function getCanvasTapInteractConfig(isTouchMode: boolean): {
  tapHitRadius: number;
  maxPlayerReach: number;
} {
  return isTouchMode
    ? { tapHitRadius: 88, maxPlayerReach: 220 }
    : { tapHitRadius: 68, maxPlayerReach: 165 };
}

function doesWeaponSubtypeMatchClassKind(
  weaponKind: WeaponKind,
  subtype?: GearWeaponSubtype
): boolean {
  if (!subtype) return false;
  if (weaponKind === 'sword' && subtype === 'sword') return true;
  if (weaponKind === 'shield_blade' && (subtype === 'sword' || subtype === 'spear')) return true;
  if (weaponKind === 'axe' && subtype === 'axe') return true;
  if (weaponKind === 'dagger' && subtype === 'dagger') return true;
  if (weaponKind === 'scythe' && (subtype === 'dagger' || subtype === 'spear')) return true;
  if (weaponKind === 'spear' && subtype === 'spear') return true;
  if (weaponKind === 'bow' && subtype === 'bow') return true;
  if (weaponKind === 'crossbow' && subtype === 'crossbow') return true;
  if (weaponKind === 'staff' && subtype === 'staff') return true;
  if ((weaponKind === 'scepter' || weaponKind === 'harp') && subtype === 'scepter') return true;
  if (weaponKind === 'celestial_blade' && (subtype === 'sword' || subtype === 'spear')) return true;
  return false;
}

export function scoreGearForClass(classId: ClassId, item: GearItem): number {
  if (!canClassEquipItem(classId, item)) return -1;
  const cls = CLASS_DEFS[classId] ?? CLASS_DEFS.novice;
  const a = item.affixes;
  const arch = cls.archetype;

  let score =
    RARITY_META[item.rarity].rank * 18 +
    (item.enhanceLv ?? 0) * 16 +
    item.level * 2.5;

  if (item.slot === 'weapon' && doesWeaponSubtypeMatchClassKind(cls.weaponKind, item.weaponSubtype)) {
    score += 24;
  }

  if (arch === 'mage' || cls.critDisabled) {
    score += (a.atk ?? 0) * 5.0;
    score += (a.def ?? 0) * 3.5;
    score += (a.maxHp ?? 0) * 0.42;
    score += (a.maxMp ?? 0) * 0.85;
    score += (a.mpRegen ?? 0) * 7.5;
    score += (a.attackSpeed ?? 0) * 2.4;
    score += (a.speed ?? 0) * 0.9;
    score += (a.lifeOnKill ?? 0) * 2.0;
  } else if (arch === 'healer') {
    score += (a.atk ?? 0) * 4.2;
    score += (a.def ?? 0) * 4.0;
    score += (a.maxHp ?? 0) * 0.55;
    score += (a.maxMp ?? 0) * 0.95;
    score += (a.mpRegen ?? 0) * 8.2;
    score += (a.attackSpeed ?? 0) * 2.3;
    score += (a.speed ?? 0) * 1.1;
    score += (a.lifeOnKill ?? 0) * 2.5;
    score += (a.critChance ?? 0) * 2.5;
  } else if (arch === 'assassin') {
    score += (a.atk ?? 0) * 4.6;
    score += (a.def ?? 0) * 2.8;
    score += (a.maxHp ?? 0) * 0.35;
    score += (a.maxMp ?? 0) * 0.25;
    score += (a.mpRegen ?? 0) * 1.5;
    score += (a.attackSpeed ?? 0) * 2.8;
    score += (a.speed ?? 0) * 1.3;
    score += (a.lifeOnKill ?? 0) * 3.0;
    score += (a.critChance ?? 0) * 4.4;
    score += (a.critDmgBonus ?? 0) * 1.55;
  } else if (arch === 'archer') {
    score += (a.atk ?? 0) * 4.9;
    score += (a.def ?? 0) * 2.8;
    score += (a.maxHp ?? 0) * 0.35;
    score += (a.maxMp ?? 0) * 0.3;
    score += (a.mpRegen ?? 0) * 1.8;
    score += (a.attackSpeed ?? 0) * 2.7;
    score += (a.speed ?? 0) * 1.4;
    score += (a.lifeOnKill ?? 0) * 2.3;
    score += (a.critChance ?? 0) * 3.8;
    score += (a.critDmgBonus ?? 0) * 1.35;
  } else {
    score += (a.atk ?? 0) * 4.6;
    score += (a.def ?? 0) * 4.4;
    score += (a.maxHp ?? 0) * 0.58;
    score += (a.maxMp ?? 0) * 0.25;
    score += (a.mpRegen ?? 0) * 1.6;
    score += (a.attackSpeed ?? 0) * 2.0;
    score += (a.speed ?? 0) * 0.85;
    score += (a.lifeOnKill ?? 0) * 2.8;
    score += (a.critChance ?? 0) * 3.1;
    score += (a.critDmgBonus ?? 0) * 1.15;
  }

  return Math.round(score * 10) / 10;
}

export function autoEquipBestGear(
  classId: ClassId,
  currentEquipped: EquippedGear,
  inventory: GearItem[]
): {
  equipped: EquippedGear;
  inventory: GearItem[];
  changedCount: number;
  upgradedSlots: GearSlot[];
  skippedIncompatibleCount: number;
} {
  const pool: GearItem[] = [...inventory];
  const slots: GearSlot[] = ['weapon', 'armor', 'accessory'];
  for (const s of slots) {
    const eq = currentEquipped[s];
    if (eq) pool.push(eq);
  }

  const nextEquipped: EquippedGear = { weapon: null, armor: null, accessory: null };
  const chosenIds = new Set<string>();
  const upgradedSlots: GearSlot[] = [];

  for (const s of slots) {
    const currentlyEquippedItem = currentEquipped[s];
    const currentScore = currentlyEquippedItem
      ? scoreGearForClass(classId, currentlyEquippedItem)
      : -1;

    let bestItem: GearItem | null = null;
    let bestScore = -1;

    for (const candidate of pool) {
      if (candidate.slot !== s || chosenIds.has(candidate.id)) continue;
      const sc = scoreGearForClass(classId, candidate);
      if (sc < 0) continue;

      if (
        sc > bestScore ||
        (sc === bestScore &&
          bestItem &&
          ((candidate.enhanceLv ?? 0) > (bestItem.enhanceLv ?? 0) ||
            ((candidate.enhanceLv ?? 0) === (bestItem.enhanceLv ?? 0) &&
              candidate.level > bestItem.level)))
      ) {
        bestScore = sc;
        bestItem = candidate;
      }
    }

    if (
      currentlyEquippedItem &&
      currentScore >= 0 &&
      bestItem &&
      bestScore <= currentScore
    ) {
      bestItem = currentlyEquippedItem;
    }

    if (bestItem) {
      nextEquipped[s] = bestItem;
      chosenIds.add(bestItem.id);
    }
  }

  const nextInventory = pool.filter((it) => !chosenIds.has(it.id));
  let changedCount = 0;
  for (const s of slots) {
    if (nextEquipped[s]?.id !== currentEquipped[s]?.id) {
      changedCount++;
      upgradedSlots.push(s);
    }
  }

  const skippedIncompatibleCount = nextInventory.filter(
    (it) => !canClassEquipItem(classId, it)
  ).length;

  return {
    equipped: nextEquipped,
    inventory: nextInventory,
    changedCount,
    upgradedSlots,
    skippedIncompatibleCount,
  };
}

// ---- 一键售卖烂品质装 ----
export function sellJunkGear(
  inventory: GearItem[],
  maxRarity: 'common' | 'rare' = 'common'
): {
  kept: GearItem[];
  sold: GearItem[];
  totalGold: number;
} {
  const maxRank = RARITY_META[maxRarity].rank;
  const kept: GearItem[] = [];
  const sold: GearItem[] = [];
  let totalGold = 0;

  for (const item of inventory) {
    const itemRank = RARITY_META[item.rarity].rank;
    const isEnhanced = (item.enhanceLv ?? 0) > 0;
    if (itemRank <= maxRank && !isEnhanced) {
      sold.push(item);
      totalGold += Math.max(1, Math.round(item.sellValue));
    } else {
      kept.push(item);
    }
  }

  return { kept, sold, totalGold };
}

// ---- 装备强化（升级上限提升至 +100，附带一键升级） ----
export function getGearUpgradeCost(item: GearItem): {
  canUpgrade: boolean;
  nextLv: number;
  gold: number;
  materials: { id: MaterialId; count: number }[];
} {
  const curLv = Math.max(0, Math.floor(item.enhanceLv ?? 0));
  if (curLv >= MAX_ENHANCE_LV) {
    return { canUpgrade: false, nextLv: MAX_ENHANCE_LV, gold: 0, materials: [] };
  }
  const nextLv = curLv + 1;
  const rank = RARITY_META[item.rarity].rank;
  const gold = Math.round(
    (28 + nextLv * 16 + Math.pow(nextLv, 1.12) * 5) * (0.72 + rank * 0.24)
  );

  const mats: { id: MaterialId; count: number }[] = [];
  if (nextLv <= 10) {
    mats.push({ id: item.slot === 'armor' ? 'stone' : 'iron_ore', count: Math.min(4, 1 + Math.floor(nextLv / 3)) });
    mats.push({ id: 'copper_ore', count: 1 });
  } else if (nextLv <= 30) {
    mats.push({ id: 'silver_ore', count: Math.min(4, 1 + Math.floor((nextLv - 10) / 6)) });
    mats.push({ id: 'magic_crystal', count: nextLv >= 20 ? 2 : 1 });
  } else if (nextLv <= 60) {
    mats.push({ id: 'mythril_ore', count: Math.min(4, 1 + Math.floor((nextLv - 30) / 10)) });
    mats.push({ id: item.slot === 'armor' ? 'frost_shard' : 'ember_core', count: 1 });
  } else if (nextLv <= 85) {
    mats.push({ id: 'dragon_scale', count: 2 });
    mats.push({ id: 'void_essence', count: 1 });
  } else {
    mats.push({ id: 'dragon_scale', count: 2 });
    mats.push({ id: 'titan_bone', count: 1 });
  }

  return { canUpgrade: true, nextLv, gold, materials: mats };
}

export function upgradeGearItem(item: GearItem): GearItem {
  const curLv = Math.max(0, Math.floor(item.enhanceLv ?? 0));
  if (curLv >= MAX_ENHANCE_LV) return item;
  const nextLv = curLv + 1;
  const a = { ...item.affixes };

  // 防膨胀阶梯成长率：+1~+10 显著提升，+11~+100 平稳线性/小复利叠加
  const rate =
    nextLv <= 10 ? 0.095 : nextLv <= 35 ? 0.042 : nextLv <= 70 ? 0.022 : 0.014;

  const boostInt = (
    val: number | undefined,
    minStep: number,
    maxStep: number,
    scaleRate = rate
  ): number | undefined => {
    if (!val || val <= 0) return val;
    const add = Math.min(maxStep, Math.max(minStep, Math.round(val * scaleRate)));
    return val + add;
  };

  a.atk = boostInt(a.atk, 2, 18);
  a.def = boostInt(a.def, 1, 10, rate * 0.9);
  a.maxHp = boostInt(a.maxHp, 6, 65, rate * 0.95);
  a.maxMp = boostInt(a.maxMp, 4, 38, rate * 0.9);
  if (nextLv <= 40 || nextLv % 2 === 0) {
    a.critChance = a.critChance ? Math.min(45, a.critChance + (nextLv <= 15 ? 1 : nextLv % 4 === 0 ? 1 : 0)) : a.critChance;
    a.critDmgBonus = boostInt(a.critDmgBonus, 2, 8, rate * 0.75);
    a.attackSpeed = a.attackSpeed ? Math.min(85, a.attackSpeed + (nextLv <= 20 ? 1 : nextLv % 3 === 0 ? 1 : 0)) : a.attackSpeed;
    a.speed = a.speed ? Math.min(80, a.speed + (nextLv % 2 === 0 ? 1 : 0)) : a.speed;
  }
  a.lifeOnKill = a.lifeOnKill ? Math.min(45, a.lifeOnKill + (nextLv % 3 === 0 || nextLv <= 6 ? 1 : 0)) : a.lifeOnKill;
  if (a.mpRegen && a.mpRegen > 0) {
    a.mpRegen = Math.min(40, Math.round((a.mpRegen + (nextLv <= 15 ? 0.3 : 0.15)) * 10) / 10);
  }

  const baseTitle = item.name.replace(/\s+\+\d+$/, '');
  return {
    ...item,
    name: `${baseTitle} +${nextLv}`,
    enhanceLv: nextLv,
    affixes: a,
    sellValue: Math.round(item.sellValue + 14 + nextLv * 4),
  };
}

export function upgradeGearBatch(
  item: GearItem,
  maxSteps: number,
  currentGold: number,
  currentMaterials: MaterialBag
): {
  item: GearItem;
  goldLeft: number;
  materialsLeft: MaterialBag;
  levelsGained: number;
  stopReason: 'max' | 'gold' | 'materials' | 'steps';
} {
  let curItem = item;
  let gold = currentGold;
  let mats: MaterialBag = { ...currentMaterials };
  let levelsGained = 0;
  let stopReason: 'max' | 'gold' | 'materials' | 'steps' = 'steps';

  const limit = Math.max(1, Math.min(MAX_ENHANCE_LV, Math.floor(maxSteps)));
  for (let i = 0; i < limit; i++) {
    const cost = getGearUpgradeCost(curItem);
    if (!cost.canUpgrade) {
      stopReason = 'max';
      break;
    }
    if (gold < cost.gold) {
      stopReason = 'gold';
      break;
    }
    if (!hasEnoughMaterials(mats, cost.materials)) {
      stopReason = 'materials';
      break;
    }
    gold -= cost.gold;
    mats = consumeMaterials(mats, cost.materials);
    curItem = upgradeGearItem(curItem);
    levelsGained++;
  }

  return {
    item: curItem,
    goldLeft: gold,
    materialsLeft: mats,
    levelsGained,
    stopReason,
  };
}

// ---- 技能冷却 & 技能书体系 ----

export function getSkillPowerMultiplier(baseMult: number, skillLv = 1): number {
  const safeLv = Math.max(1, Math.min(MAX_SKILL_LV, Math.floor(skillLv)));
  return Math.round(baseMult * (1 + (safeLv - 1) * 0.14) * 100) / 100;
}

export const MIN_BASIC_COOLDOWN = 0.30;

export function getEffectiveBasicCooldown(
  baseCooldown: number,
  attackSpeed = 100
): number {
  const safeBase = Math.max(0.32, baseCooldown);
  const clampedAs = Math.max(60, Math.min(165, attackSpeed));
  const speedMult = 1 + (clampedAs - 100) * 0.0065;
  return Math.max(
    MIN_BASIC_COOLDOWN,
    Math.round((safeBase / Math.max(0.65, speedMult)) * 100) / 100
  );
}

export function getEffectiveSkillCooldown(
  baseCooldown: number,
  skillLv = 1,
  attackSpeed = 100
): number {
  const safeLv = Math.max(1, Math.min(MAX_SKILL_LV, Math.floor(skillLv)));
  const lvReduction = (safeLv - 1) * 0.032;
  const hasteReduction = Math.max(0, attackSpeed - 100) * 0.002;
  const totalReduction = Math.min(0.45, lvReduction + hasteReduction);
  return Math.max(0.9, Math.round(baseCooldown * (1 - totalReduction) * 100) / 100);
}

const SLOT_KEY_NAMES = ['Q 技能秘籍', 'E 技能秘籍', 'C 技能秘籍', 'V 奥义秘籍'] as const;

let bookSeq = 1;

export function generateSkillBookItem(
  options?: {
    rng?: () => number;
    targetSlot?: SkillSlotIndex;
    archetype?: ArchetypeId | 'all';
    rarity?: GearRarity;
  }
): SkillBookItem {
  const rng = options?.rng ?? Math.random;
  const slot: SkillSlotIndex =
    options?.targetSlot ?? ([0, 1, 2, 3][Math.floor(rng() * 4) % 4] as SkillSlotIndex);
  const archPool: Array<ArchetypeId | 'all'> = ['all', 'tank', 'assassin', 'archer', 'healer', 'mage'];
  const archetype =
    options?.archetype ?? archPool[Math.floor(rng() * archPool.length) % archPool.length];
  const rarity: GearRarity = options?.rarity ?? (slot === 3 ? 'epic' : rng() > 0.65 ? 'epic' : 'rare');
  const levelBonus = rarity === 'legendary' ? 2 : 1;
  const archLabel = archetype === 'all' ? '全系通用' : `${ARCHETYPE_DEFS[archetype].name}系`;
  const keyTag = ['Q', 'E', 'C', 'V'][slot];
  return {
    id: `book_${Date.now().toString(36)}_${bookSeq++}_${Math.floor(rng() * 1000)}`,
    name: `${archLabel}·${SLOT_KEY_NAMES[slot]}`,
    targetSlot: slot,
    archetype,
    rarity,
    levelBonus,
    sellValue: 45 + RARITY_META[rarity].rank * 35,
    desc: `研习后使 ${keyTag} 槽位技能等级 +${levelBonus}（最高 Lv.${MAX_SKILL_LV}），大幅提升技能威力与缩短冷却。`,
  };
}

export function canLearnSkillBook(
  classId: ClassId,
  skillLevels: [number, number, number, number],
  book: SkillBookItem
): { ok: boolean; reason?: string } {
  const cls = CLASS_DEFS[classId] ?? CLASS_DEFS.novice;
  if (book.archetype !== 'all' && cls.archetype !== book.archetype) {
    return {
      ok: false,
      reason: `需要【${ARCHETYPE_DEFS[book.archetype].name}体系】职业方可研习此秘籍`,
    };
  }
  const curLv = skillLevels[book.targetSlot] ?? 1;
  if (curLv >= MAX_SKILL_LV) {
    return { ok: false, reason: '该技能已修炼至满级 Lv.10' };
  }
  return { ok: true };
}

export function applySkillBookUse(
  classId: ClassId,
  skillLevels: [number, number, number, number],
  books: SkillBookItem[],
  bookId: string
): {
  learned: boolean;
  reason?: string;
  nextLevels: [number, number, number, number];
  nextBooks: SkillBookItem[];
  usedBook: SkillBookItem | null;
} {
  const idx = books.findIndex((b) => b.id === bookId);
  if (idx < 0) {
    return {
      learned: false,
      reason: '背包中未找到该技能书',
      nextLevels: [...skillLevels] as [number, number, number, number],
      nextBooks: books,
      usedBook: null,
    };
  }
  const book = books[idx];
  const check = canLearnSkillBook(classId, skillLevels, book);
  if (!check.ok) {
    return {
      learned: false,
      reason: check.reason,
      nextLevels: [...skillLevels] as [number, number, number, number],
      nextBooks: books,
      usedBook: null,
    };
  }
  const nextLevels = [...skillLevels] as [number, number, number, number];
  nextLevels[book.targetSlot] = Math.min(
    MAX_SKILL_LV,
    (nextLevels[book.targetSlot] ?? 1) + book.levelBonus
  );
  const nextBooks = [...books.slice(0, idx), ...books.slice(idx + 1)];
  return {
    learned: true,
    nextLevels,
    nextBooks,
    usedBook: book,
  };
}

export function createCraftedItem(recipe: CraftRecipeDef): GearItem {
  return {
    id: `craft_${recipe.id}_${Date.now().toString(36)}_${Math.floor(Math.random() * 999)}`,
    name: recipe.name,
    slot: recipe.slot,
    rarity: recipe.rarity,
    level: recipe.level,
    weaponSubtype: recipe.weaponSubtype,
    requiredCategory: recipe.requiredCategory,
    enhanceLv: 0,
    flavor: recipe.flavor,
    affixes: { ...recipe.affixes },
    sellValue: Math.max(25, Math.round(recipe.goldCost * 0.6)),
  };
}

export function hasEnoughMaterials(bag: MaterialBag, reqs: { id: MaterialId; count: number }[]): boolean {
  return reqs.every((r) => (bag[r.id] ?? 0) >= r.count);
}

export function consumeMaterials(bag: MaterialBag, reqs: { id: MaterialId; count: number }[]): MaterialBag {
  const next: MaterialBag = { ...bag };
  for (const r of reqs) {
    next[r.id] = Math.max(0, (next[r.id] ?? 0) - r.count);
  }
  return next;
}

const PREFIXES: Record<GearRarity, string[]> = {
  common: ['铁制', '磨损的', '旅者', '简朴'],
  rare: ['符文', '精钢', '疾风', '幽蓝'],
  epic: ['暗影', '秘银', '狂怒', '虚空'],
  legendary: ['泰坦', '炎魔之核', '圣光破晓', '不朽'],
};

interface SubtypeTemplate {
  subtype: GearWeaponSubtype;
  req: ClassCategoryRestriction;
  names: string[];
  flavor: string;
}

const WEAPON_TEMPLATES: SubtypeTemplate[] = [
  { subtype: 'sword', req: 'knight_paladin', names: ['圣剑', '骑士长剑', '破晓剑'], flavor: '适合坦克与剑仙系装配的精良剑刃。' },
  { subtype: 'axe', req: 'berserker', names: ['战斧', '狂战重斧', '裂颅斧'], flavor: '专为坦克系重装职业打造的沉重战斧。' },
  { subtype: 'dagger', req: 'assassin', names: ['影刃', '双锋匕首', '夜行短刃'], flavor: '刺客系专属极速双刃，提升攻速与暴击。' },
  { subtype: 'spear', req: 'spearmaster', names: ['长枪', '龙骑银枪', '破阵枪'], flavor: '坦克长枪系专属突刺锐枪。' },
  { subtype: 'bow', req: 'archer', names: ['猎弓', '森林长弓', '疾风弓'], flavor: '射手系专属远程长弓，精准穿透林间风雪。' },
  { subtype: 'crossbow', req: 'archer', names: ['重弩', '破甲连弩', '猎魔强弩'], flavor: '射手系专属强力弩机，爆伤出众。' },
  { subtype: 'scepter', req: 'healer', names: ['圣杖', '治愈权杖', '光辉竖琴'], flavor: '奶妈系专属治疗武器，蕴含充沛法力与生机。' },
  { subtype: 'staff', req: 'mage', names: ['秘杖', '奥术法杖', '元素权杖'], flavor: '仅限法师系职业装配的魔导法杖（无暴击加成）。' },
];

const ARMOR_TEMPLATES: SubtypeTemplate[] = [
  { subtype: 'heavy_armor', req: 'tank', names: ['胸甲', '骑士重铠', '板甲'], flavor: '厚重坚固的坦克重甲，提供高额生命与防御。' },
  { subtype: 'light_armor', req: 'all', names: ['皮甲', '游侠风衣', '暗影衣'], flavor: '轻便灵巧的护甲，适合刺客、射手与奶妈。' },
  { subtype: 'robe', req: 'mage', names: ['法袍', '星纹法衣', '元素圣袍'], flavor: '法师系与奶妈系偏爱的高魔力礼袍。' },
];

const ACCESSORY_NAMES = ['指环', '护符', '徽记', '吊坠'];

let gearSeq = 1;

export function expNeeded(level: number): number {
  return Math.floor(42 * Math.pow(level, 1.66) + level * 18);
}

export function applyExpWithBreakthrough(
  startLevel: number,
  startExp: number,
  gain: number,
  breakthroughTier: number
): {
  level: number;
  exp: number;
  levelsGained: number;
  hitCap: boolean;
  cap: number;
} {
  const cap = getBreakthroughCap(breakthroughTier);
  let level = Math.max(1, startLevel);
  let exp = Math.max(0, startExp + Math.max(0, gain));
  let levelsGained = 0;

  while (level < cap && exp >= expNeeded(level)) {
    exp -= expNeeded(level);
    level++;
    levelsGained++;
  }

  const hitCap = level >= cap && exp >= expNeeded(level);
  if (level >= cap) {
    exp = Math.min(exp, expNeeded(cap) * 3);
  }

  return {
    level,
    exp,
    levelsGained,
    hitCap,
    cap,
  };
}

export function getTalentCost(def: TalentDef, currentLevel: number): number {
  return def.baseCost + currentLevel * def.costStep;
}

export function getAccountLevel(account: AccountData): number {
  const talentSum =
    account.talents.atkLv +
    account.talents.hpLv +
    account.talents.goldLv +
    account.talents.critDmgLv +
    account.talents.potCapLv;
  const maxCharLv = Math.max(
    1,
    account.slots.slot1?.level ?? 1,
    account.slots.slot2?.level ?? 1,
    account.slots.slot3?.level ?? 1
  );
  return maxCharLv + Math.floor(talentSum / 2) + account.unlockedAchievements.length;
}

export function getAchievementMetricValue(
  bestiary: Record<string, number>,
  metric: AchievementDef['metric']
): number {
  if (metric === 'totalKills') {
    let sum = 0;
    for (const m of BESTIARY_MONSTERS) {
      sum += bestiary[m.name] ?? 0;
    }
    return sum;
  }
  if (metric === 'bossKills') return (bestiary['野外首领'] ?? 0) + (bestiary['试炼塔领主'] ?? 0);
  if (metric === 'chestsOpened') return bestiary._chests ?? 0;
  if (metric === 'questsCompleted') return bestiary._quests ?? 0;
  if (metric === 'maxLevel') return bestiary._maxLevel ?? 1;
  if (metric === 'bestRarityRank') return bestiary._bestRarity ?? 1;
  return 0;
}

export function evaluateAchievements(
  bestiary: Record<string, number>,
  unlocked: string[]
): {
  nextUnlocked: string[];
  newlyUnlocked: AchievementDef[];
  rewardSoulStones: number;
} {
  const set = new Set(unlocked);
  const newlyUnlocked: AchievementDef[] = [];
  let rewardSoulStones = 0;

  for (const ach of ACHIEVEMENT_DEFS) {
    if (set.has(ach.id)) continue;
    const val = getAchievementMetricValue(bestiary, ach.metric);
    if (val >= ach.target) {
      set.add(ach.id);
      newlyUnlocked.push(ach);
      rewardSoulStones += ach.rewardSoulStones;
    }
  }

  return {
    nextUnlocked: Array.from(set),
    newlyUnlocked,
    rewardSoulStones,
  };
}

export function computeAchievementBonuses(unlocked: string[]) {
  const set = new Set(unlocked);
  let atk = 0;
  let def = 0;
  let maxHp = 0;
  let critChance = 0;
  let speed = 0;
  for (const ach of ACHIEVEMENT_DEFS) {
    if (!set.has(ach.id)) continue;
    if (ach.bonus.atk) atk += ach.bonus.atk;
    if (ach.bonus.def) def += ach.bonus.def;
    if (ach.bonus.maxHp) maxHp += ach.bonus.maxHp;
    if (ach.bonus.critChance) critChance += ach.bonus.critChance;
    if (ach.bonus.speed) speed += ach.bonus.speed;
  }
  return { atk, def, maxHp, critChance, speed };
}

export function rollRarity(rng = Math.random, minRarity?: GearRarity): GearRarity {
  const order: GearRarity[] = ['common', 'rare', 'epic', 'legendary'];
  const r = rng();
  let rolled: GearRarity = 'common';
  if (r > 0.94) rolled = 'legendary';
  else if (r > 0.78) rolled = 'epic';
  else if (r > 0.45) rolled = 'rare';
  if (minRarity && order.indexOf(rolled) < order.indexOf(minRarity)) {
    return minRarity;
  }
  return rolled;
}

function pickWeaponTemplateForClass(classId: ClassId, rng: () => number): SubtypeTemplate {
  const candidates = WEAPON_TEMPLATES.filter((t) =>
    canClassEquipItem(classId, {
      id: 'tmp',
      name: '',
      slot: 'weapon',
      rarity: 'common',
      level: 1,
      affixes: {},
      sellValue: 1,
      weaponSubtype: t.subtype,
      requiredCategory: t.req,
    })
  );
  const pool = candidates.length > 0 ? candidates : WEAPON_TEMPLATES;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

export function generateGearItem(
  level: number,
  options?: {
    rng?: () => number;
    forceRarity?: GearRarity;
    minRarity?: GearRarity;
    forceSlot?: GearSlot;
    forClassId?: ClassId;
    forceSubtype?: GearWeaponSubtype;
  }
): GearItem {
  const rng = options?.rng ?? Math.random;
  const slots: GearSlot[] = ['weapon', 'armor', 'accessory'];
  const slot = options?.forceSlot ?? slots[Math.floor(rng() * slots.length) % slots.length];
  const rarity = options?.forceRarity ?? rollRarity(rng, options?.minRarity);
  const meta = RARITY_META[rarity];

  const lvScale = 1 + (Math.max(1, level) - 1) * 0.2;
  const affixes: GearAffixes = {};

  let weaponSubtype: GearWeaponSubtype = 'universal';
  let requiredCategory: ClassCategoryRestriction = 'all';
  let baseName = '装备';
  let flavor = '蕴含幻想大陆魔力的冒险者装备。';

  if (slot === 'weapon') {
    const tpl = options?.forceSubtype
      ? WEAPON_TEMPLATES.find((t) => t.subtype === options.forceSubtype) ?? WEAPON_TEMPLATES[0]
      : options?.forClassId
      ? pickWeaponTemplateForClass(options.forClassId, rng)
      : WEAPON_TEMPLATES[Math.floor(rng() * WEAPON_TEMPLATES.length) % WEAPON_TEMPLATES.length];

    weaponSubtype = tpl.subtype;
    requiredCategory = tpl.req;
    baseName = tpl.names[Math.floor(rng() * tpl.names.length) % tpl.names.length];
    flavor = tpl.flavor;

    affixes.atk = Math.max(2, Math.round((2.4 + rng() * 3.0) * meta.mult * lvScale));
    if (tpl.subtype === 'staff' || tpl.subtype === 'scepter') {
      affixes.maxMp = Math.max(8, Math.round((8 + rng() * 8) * meta.mult));
      affixes.mpRegen = Math.round((0.6 + rng() * 0.8) * meta.mult * 10) / 10;
    } else if (tpl.subtype === 'dagger' || tpl.subtype === 'bow') {
      affixes.attackSpeed = Math.max(3, Math.round((3 + rng() * 4) * meta.mult));
    } else if (tpl.subtype === 'axe' || tpl.subtype === 'crossbow') {
      affixes.critDmgBonus = Math.max(6, Math.round((6 + rng() * 7) * meta.mult));
    }
  } else if (slot === 'armor') {
    const validArmors = options?.forClassId
      ? ARMOR_TEMPLATES.filter((t) =>
          canClassEquipItem(options.forClassId!, {
            id: 'tmp',
            name: '',
            slot: 'armor',
            rarity: 'common',
            level: 1,
            affixes: {},
            sellValue: 1,
            weaponSubtype: t.subtype,
            requiredCategory: t.req,
          })
        )
      : ARMOR_TEMPLATES;
    const pool = validArmors.length > 0 ? validArmors : ARMOR_TEMPLATES;
    const tpl = pool[Math.floor(rng() * pool.length) % pool.length];
    weaponSubtype = tpl.subtype;
    requiredCategory = tpl.req;
    baseName = tpl.names[Math.floor(rng() * tpl.names.length) % tpl.names.length];
    flavor = tpl.flavor;

    affixes.def = Math.max(1, Math.round((1.1 + rng() * 2.0) * meta.mult * lvScale));
    affixes.maxHp = Math.max(6, Math.round((8 + rng() * 10) * meta.mult * lvScale));
    if (tpl.subtype === 'robe') {
      affixes.maxMp = Math.max(10, Math.round((10 + rng() * 10) * meta.mult));
    }
  } else {
    weaponSubtype = 'universal';
    requiredCategory = 'all';
    baseName = ACCESSORY_NAMES[Math.floor(rng() * ACCESSORY_NAMES.length) % ACCESSORY_NAMES.length];
    flavor = '全职业通用饰品，提供均衡属性增幅。';
    if (options?.forClassId && CLASS_DEFS[options.forClassId]?.critDisabled) {
      affixes.atk = Math.max(1, Math.round((1.5 + rng() * 2.2) * meta.mult * lvScale));
      affixes.mpRegen = Math.round((0.5 + rng() * 0.7) * meta.mult * 10) / 10;
    } else {
      affixes.critChance = Math.max(2, Math.round((2 + rng() * 3) * meta.mult));
    }
  }

  const extraPool: (keyof GearAffixes)[] =
    weaponSubtype === 'staff'
      ? ['atk', 'maxHp', 'maxMp', 'mpRegen', 'attackSpeed', 'speed', 'lifeOnKill']
      : ['atk', 'def', 'maxHp', 'critChance', 'critDmgBonus', 'attackSpeed', 'speed', 'lifeOnKill'];

  const neededExtras = Math.max(0, meta.affixCount - 1);
  for (let i = 0; i < neededExtras; i++) {
    const pick = extraPool[Math.floor(rng() * extraPool.length) % extraPool.length];
    if (pick === 'atk') {
      affixes.atk = (affixes.atk ?? 0) + Math.max(1, Math.round((1.5 + rng() * 2.5) * meta.mult * lvScale));
    } else if (pick === 'def') {
      affixes.def = (affixes.def ?? 0) + Math.max(1, Math.round((1 + rng() * 1.5) * meta.mult * lvScale));
    } else if (pick === 'maxHp') {
      affixes.maxHp = (affixes.maxHp ?? 0) + Math.max(5, Math.round((7 + rng() * 9) * meta.mult * lvScale));
    } else if (pick === 'maxMp') {
      affixes.maxMp = (affixes.maxMp ?? 0) + Math.max(6, Math.round((8 + rng() * 10) * meta.mult));
    } else if (pick === 'critChance') {
      affixes.critChance = (affixes.critChance ?? 0) + Math.max(1, Math.round((1.5 + rng() * 2.5) * meta.mult));
    } else if (pick === 'critDmgBonus') {
      affixes.critDmgBonus = (affixes.critDmgBonus ?? 0) + Math.max(4, Math.round((5 + rng() * 8) * meta.mult));
    } else if (pick === 'attackSpeed') {
      affixes.attackSpeed = (affixes.attackSpeed ?? 0) + Math.max(2, Math.round((3 + rng() * 4) * meta.mult));
    } else if (pick === 'speed') {
      affixes.speed = (affixes.speed ?? 0) + Math.max(3, Math.round((4 + rng() * 6) * meta.mult));
    } else if (pick === 'lifeOnKill') {
      affixes.lifeOnKill = (affixes.lifeOnKill ?? 0) + Math.max(1, Math.round((1 + rng() * 2) * meta.mult));
    } else if (pick === 'mpRegen') {
      affixes.mpRegen = Math.round(((affixes.mpRegen ?? 0) + 0.5 * meta.mult) * 10) / 10;
    }
  }

  const prefList = PREFIXES[rarity];
  const prefix = prefList[Math.floor(rng() * prefList.length) % prefList.length];
  const sellValue = Math.max(8, Math.round((10 + level * 4) * meta.mult));

  return {
    id: `gear_${Date.now().toString(36)}_${gearSeq++}_${Math.floor(rng() * 1000)}`,
    name: `${prefix}${baseName}`,
    slot,
    rarity,
    level: Math.max(1, level),
    weaponSubtype,
    requiredCategory,
    enhanceLv: 0,
    flavor,
    affixes,
    sellValue,
  };
}

export function computePlayerStats(
  base: { maxHp: number; maxMp: number; atk: number; def: number; speed: number; critChance: number },
  equipped: EquippedGear,
  talents: TalentLevels = DEFAULT_TALENTS,
  unlockedAchievements: string[] = [],
  classId: ClassId = 'knight'
): ComputedStats {
  const cls = CLASS_DEFS[classId] ?? CLASS_DEFS.knight;
  const achBonus = computeAchievementBonuses(unlockedAchievements);

  let maxHp = base.maxHp + talents.hpLv * 18 + achBonus.maxHp;
  let maxMp = base.maxMp;
  let atk = base.atk + talents.atkLv * 2 + achBonus.atk;
  let def = base.def + achBonus.def;
  let speed = base.speed + achBonus.speed;
  let critChance = base.critChance + achBonus.critChance;
  let critDmgPct = cls.baseCritDmg ?? 190;
  let attackSpeed = cls.baseAttackSpeed ?? 100;
  let mpRegen = cls.baseMpRegen ?? 4.5;
  let lifeOnKill = 0;

  const items = [equipped.weapon, equipped.armor, equipped.accessory];
  for (const item of items) {
    if (!item) continue;
    if (item.affixes.atk) atk += item.affixes.atk;
    if (item.affixes.def) def += item.affixes.def;
    if (item.affixes.maxHp) maxHp += item.affixes.maxHp;
    if (item.affixes.maxMp) maxMp += item.affixes.maxMp;
    if (item.affixes.critChance) critChance += item.affixes.critChance;
    if (item.affixes.critDmgBonus) critDmgPct += item.affixes.critDmgBonus;
    if (item.affixes.attackSpeed) attackSpeed += item.affixes.attackSpeed;
    if (item.affixes.speed) speed += item.affixes.speed;
    if (item.affixes.lifeOnKill) lifeOnKill += item.affixes.lifeOnKill;
    if (item.affixes.mpRegen) mpRegen += item.affixes.mpRegen;
  }

  // 法师系职业强制无暴击率！
  const critDisabled = Boolean(cls.critDisabled);
  const finalCrit = critDisabled ? 0 : Math.min(85, Math.max(0, Math.round(critChance)));
  const finalCritDmgMult = critDisabled
    ? 1
    : Math.round(((critDmgPct + talents.critDmgLv * 12) / 100) * 100) / 100;

  return {
    maxHp: Math.round(maxHp),
    maxMp: Math.round(maxMp),
    atk: Math.round(atk * 10) / 10,
    def: Math.round(def * 10) / 10,
    speed: Math.round(speed),
    attackSpeed: Math.max(60, Math.min(165, Math.round(attackSpeed))),
    critChance: finalCrit,
    critDmgMult: finalCritDmgMult,
    critDisabled,
    goldMult: Math.round((1 + talents.goldLv * 0.1) * 100) / 100,
    potionCap: 5 + talents.potCapLv * 2,
    potionHealBonus: talents.potCapLv * 0.08,
    lifeOnKill: Math.round(lifeOnKill),
    mpRegen: Math.round(mpRegen * 10) / 10,
  };
}

export function rollDamage(
  atk: number,
  critChancePercent = 15,
  forceCrit = false,
  rng = Math.random,
  critDmgMult = 1.9,
  critDisabled = false
) {
  const crit = !critDisabled && (forceCrit || rng() < critChancePercent / 100);
  const variance = 0.86 + rng() * 0.3;
  const d = atk * variance * (crit ? critDmgMult : 1);
  return { dmg: Math.max(1, Math.round(d)), crit };
}

export const DAY_CYCLE_DURATION = 120;

export function getTimeOfDay(gameTime: number, cycleDuration = DAY_CYCLE_DURATION): TimeOfDayInfo {
  const raw = (gameTime / cycleDuration + 0.22) % 1;
  const p = raw < 0 ? raw + 1 : raw;

  let phase: DayPhase = '白天';
  let darkness = 0;
  let tintColor = 'rgba(0,0,0,0)';

  if (p < 0.15) {
    phase = '黎明';
    const t = p / 0.15;
    darkness = 0.72 * (1 - t);
    tintColor = `rgba(30, 41, 78, ${darkness.toFixed(3)})`;
  } else if (p < 0.55) {
    phase = '白天';
    darkness = 0;
    tintColor = 'rgba(0, 0, 0, 0)';
  } else if (p < 0.72) {
    phase = '黄昏';
    const t = (p - 0.55) / 0.17;
    darkness = t * 0.52;
    const warmAlpha = Math.sin(t * Math.PI) * 0.22;
    tintColor = `rgba(120, 45, 25, ${warmAlpha.toFixed(3)})`;
  } else {
    phase = '夜晚';
    const t = (p - 0.72) / 0.28;
    const arch = t < 0.2 ? t / 0.2 : t > 0.85 ? (1 - t) / 0.15 : 1;
    darkness = 0.52 + arch * 0.24;
    tintColor = `rgba(6, 12, 32, ${darkness.toFixed(3)})`;
  }

  const totalMinutes = Math.floor(((p * 24 + 5) % 24) * 60);
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');

  return {
    phase,
    cycleProgress: p,
    darkness,
    tintColor,
    clockText: `${hh}:${mm}`,
  };
}

// ---- 全局动态天气系统（基于 getTimeOfDay 昼夜阶段 + 地图 ID） ----

export const WEATHER_DEFS: Record<WeatherKind, WeatherInfo> = {
  clear: {
    kind: 'clear',
    label: '晴朗',
    icon: '🌤️',
    speedMult: 1.0,
    critBonusPct: 0,
    fireDmgMult: 1.0,
    overlayTint: 'rgba(0, 0, 0, 0)',
    effectSummary: '视野开阔，无额外属性增减益',
  },
  drizzle: {
    kind: 'drizzle',
    label: '细雨',
    icon: '🌧️',
    speedMult: 0.94,
    critBonusPct: 4,
    fireDmgMult: 0.85,
    overlayTint: 'rgba(30, 58, 95, 0.14)',
    effectSummary: '移速 -6% · 暴击 +4% · 火属性伤害 -15%',
  },
  thunderstorm: {
    kind: 'thunderstorm',
    label: '雷雨',
    icon: '⛈️',
    speedMult: 0.9,
    critBonusPct: 8,
    fireDmgMult: 0.78,
    overlayTint: 'rgba(15, 23, 54, 0.24)',
    effectSummary: '移速 -10% · 暴击 +8% · 火属性伤害 -22%',
  },
  fog: {
    kind: 'fog',
    label: '迷雾',
    icon: '🌫️',
    speedMult: 0.92,
    critBonusPct: -4,
    fireDmgMult: 1.0,
    overlayTint: 'rgba(148, 163, 184, 0.22)',
    effectSummary: '移速 -8% · 暴击 -4% · 浓雾蔽日',
  },
  snow: {
    kind: 'snow',
    label: '飘雪',
    icon: '❄️',
    speedMult: 0.93,
    critBonusPct: 6,
    fireDmgMult: 0.9,
    overlayTint: 'rgba(186, 230, 253, 0.14)',
    effectSummary: '移速 -7% · 暴击 +6% · 火属性伤害 -10%',
  },
};

const WORLD_WEATHER_POOLS: Record<WorldId, Record<DayPhase, WeatherKind[]>> = {
  world1: {
    白天: ['clear', 'clear', 'drizzle', 'thunderstorm', 'fog'],
    黄昏: ['drizzle', 'fog', 'thunderstorm', 'clear'],
    夜晚: ['fog', 'drizzle', 'thunderstorm', 'clear'],
    黎明: ['fog', 'drizzle', 'clear', 'snow'],
  },
  world2: {
    白天: ['clear', 'fog', 'thunderstorm', 'snow'],
    黄昏: ['fog', 'thunderstorm', 'clear', 'snow'],
    夜晚: ['thunderstorm', 'fog', 'snow', 'drizzle'],
    黎明: ['fog', 'snow', 'clear', 'thunderstorm'],
  },
  grand_city: {
    白天: ['clear', 'clear', 'drizzle', 'snow'],
    黄昏: ['clear', 'drizzle', 'fog', 'snow'],
    夜晚: ['clear', 'fog', 'snow', 'drizzle'],
    黎明: ['clear', 'snow', 'fog', 'drizzle'],
  },
  dungeon: {
    白天: ['fog', 'thunderstorm', 'snow', 'drizzle'],
    黄昏: ['fog', 'snow', 'thunderstorm', 'drizzle'],
    夜晚: ['thunderstorm', 'fog', 'snow', 'drizzle'],
    黎明: ['snow', 'fog', 'drizzle', 'thunderstorm'],
  },
};

export const WEATHER_CYCLE_DURATION = 180;

export function resolveWeatherForWorldAndTime(
  worldId: WorldId,
  gameTime: number,
  seedOffset = 0,
  cycleDuration = DAY_CYCLE_DURATION
): WeatherInfo {
  // 独立稳态天气周期（默认 180 秒，且锁定每个窗口内的昼夜相位），彻底解决天气频繁切换问题
  const weatherPeriod = Math.max(WEATHER_CYCLE_DURATION, cycleDuration * 1.5);
  const epoch = Math.floor(Math.max(0, gameTime) / weatherPeriod);
  const tod = getTimeOfDay(epoch * weatherPeriod + weatherPeriod * 0.5, cycleDuration);
  const pool = WORLD_WEATHER_POOLS[worldId]?.[tod.phase] ?? ['clear', 'drizzle', 'fog', 'thunderstorm'];
  let h = 2166136261 | 0;
  for (let i = 0; i < worldId.length; i++) {
    h ^= worldId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= Math.imul(epoch | 0, 0x9e3779b1);
  h ^= Math.imul((seedOffset | 0) + 17, 0x85ebca6b);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  const idx = (h >>> 0) % pool.length;
  const pickedKind = pool[idx] ?? 'clear';
  return WEATHER_DEFS[pickedKind];
}

const FIRE_SKILL_RE = /火|炎|熔|焚|炽|焰|爆裂|烈焰|陨星/;

export function isFireElementalAttack(classId: ClassId, skillName?: string): boolean {
  if (skillName && FIRE_SKILL_RE.test(skillName)) return true;
  if (!skillName && (classId === 'mage' || classId === 'flame_marksman')) return true;
  return false;
}

// ---- 精英怪物词缀系统 ----

export const ELITE_AFFIX_LIST: EliteAffixId[] = ['frozen', 'swift', 'splitter', 'vampiric'];

export const ELITE_AFFIX_DEFS: Record<EliteAffixId, EliteAffixDef> = {
  frozen: {
    id: 'frozen',
    label: '冰冻',
    prefix: '【冰冻】',
    color: '#38bdf8',
    glowColor: '#7dd3fc',
    desc: '攻击附带极寒霜冻减速效果，周身环绕冰霜符文',
  },
  swift: {
    id: 'swift',
    label: '迅捷',
    prefix: '【迅捷】',
    color: '#4ade80',
    glowColor: '#86efac',
    desc: '移动速度提升 38% 且攻击冷却大幅缩短',
  },
  splitter: {
    id: 'splitter',
    label: '分裂',
    prefix: '【分裂】',
    color: '#c084fc',
    glowColor: '#e879f9',
    desc: '阵亡时会裂变为 2 只小型魔物继续围攻',
  },
  vampiric: {
    id: 'vampiric',
    label: '吸血',
    prefix: '【吸血】',
    color: '#fb7185',
    glowColor: '#fda4af',
    desc: '每次命中玩家都将汲取伤害 45% 回复自身生命',
  },
};

export function pickEliteAffix(rng: () => number = Math.random): EliteAffixId {
  const idx = Math.floor(rng() * ELITE_AFFIX_LIST.length) % ELITE_AFFIX_LIST.length;
  return ELITE_AFFIX_LIST[idx];
}

export function applyEliteAffixToMobStats(
  base: {
    name: string;
    r: number;
    hp: number;
    atk: number;
    exp: number;
    speed: number;
    atkSpeed: number;
  },
  affix: EliteAffixId
): {
  name: string;
  r: number;
  maxHp: number;
  atk: number;
  exp: number;
  speed: number;
  atkSpeed: number;
  affix: EliteAffixId;
} {
  const def = ELITE_AFFIX_DEFS[affix];
  return {
    name: `${def.prefix}${base.name}`,
    r: Math.round(base.r * 1.18),
    maxHp: Math.round(base.hp * 1.68),
    atk: Math.round(base.atk * 1.24),
    exp: Math.round(base.exp * 1.95),
    speed: Math.round(base.speed * (affix === 'swift' ? 1.38 : 1.05)),
    atkSpeed: Math.max(0.55, Math.round(base.atkSpeed * (affix === 'swift' ? 0.7 : 0.92) * 100) / 100),
    affix,
  };
}

export function advanceQuestProgress(
  quest: ActiveQuestState | null,
  eventType: QuestType,
  amount = 1,
  breakthroughTier = 0,
  worldId: WorldId = 'world1'
): ActiveQuestState | null {
  if (!quest || quest.completed) return quest;
  const def = findQuestDefById(quest.questId, breakthroughTier, worldId);
  if (!def || def.type !== eventType) return quest;
  const nextProgress = Math.min(def.target, quest.progress + amount);
  return {
    ...quest,
    progress: nextProgress,
    completed: nextProgress >= def.target,
  };
}

// ---- 联机队伍经验分配、队长拾取与副本入场规则 ----

export function splitPartyExp(
  totalExp: number,
  memberUids: readonly string[],
  leaderUid: string,
  expShareRatio: number
): Record<string, number> {
  const safeTotal = Math.max(0, Math.round(totalExp));
  if (memberUids.length === 0) return {};
  if (memberUids.length === 1) {
    return { [memberUids[0]]: safeTotal };
  }
  const sharePct = Math.max(0, Math.min(100, expShareRatio)) / 100;
  const teammates = memberUids.filter((u) => u !== leaderUid);
  const actualLeader = teammates.length < memberUids.length ? leaderUid : memberUids[0];
  const actualTeammates = memberUids.filter((u) => u !== actualLeader);

  if (actualTeammates.length === 0) {
    return { [actualLeader]: safeTotal };
  }

  const sharedPool = Math.round(safeTotal * sharePct);
  const eachTeammate = Math.floor(sharedPool / actualTeammates.length);
  const givenToTeammates = eachTeammate * actualTeammates.length;
  const leaderShare = Math.max(0, safeTotal - givenToTeammates);

  const result: Record<string, number> = {
    [actualLeader]: leaderShare,
  };
  for (const uid of actualTeammates) {
    result[uid] = eachTeammate;
  }
  return result;
}

export function resolvePartyLootRecipient(
  party: PartyState | null | undefined,
  selfUid: string
): string {
  if (party && party.members.length > 0) {
    return party.leaderUid;
  }
  return selfUid;
}

export function canEnterDungeonFloor(
  floor: number | DungeonFloorDef,
  highestDungeonFloor = 0
): { allowed: boolean; maxUnlockedFloor: number; reason?: string } {
  const targetFloor =
    typeof floor === 'number'
      ? Math.max(1, Math.floor(Number.isFinite(floor) ? floor : 1))
      : Math.max(1, Math.floor(floor.floor));
  const maxUnlockedFloor = Math.max(1, Math.floor(Math.max(0, highestDungeonFloor)) + 1);
  if (targetFloor > maxUnlockedFloor) {
    return {
      allowed: false,
      maxUnlockedFloor,
      reason: `试炼之塔需从 1F 逐层通关解锁：请先击败第 ${maxUnlockedFloor} 层首领（当前已解锁至 ${maxUnlockedFloor}F）`,
    };
  }
  return { allowed: true, maxUnlockedFloor };
}

const VALID_CLASS_IDS = new Set<string>(Object.keys(CLASS_DEFS));

export function sanitizeAccountData(raw: unknown, fallbackUid = 'guest', fallbackName = '流浪冒险者'): AccountData {
  const def = createDefaultAccountData(fallbackUid, fallbackName);
  if (!raw || typeof raw !== 'object') return def;
  const obj = raw as Partial<AccountData>;

  const sanitizeSlot = (slotId: SaveSlotId, s: unknown): SaveSlotData | null => {
    if (!s || typeof s !== 'object') return null;
    const sd = s as Partial<SaveSlotData>;
    if (!sd.player || typeof sd.player.x !== 'number' || typeof sd.player.y !== 'number') return null;
    const classId: ClassId =
      typeof sd.classId === 'string' && VALID_CLASS_IDS.has(sd.classId)
        ? (sd.classId as ClassId)
        : 'knight';
    // 重载时若角色上次在临时副本内，安全传送回幻光王城
    const rawWorld = sd.worldId;
    const worldId: WorldId =
      rawWorld === 'world2'
        ? 'world2'
        : rawWorld === 'grand_city' || rawWorld === 'dungeon'
        ? 'grand_city'
        : 'world1';
    const breakthroughTier =
      typeof sd.breakthroughTier === 'number' && sd.breakthroughTier >= 0
        ? Math.floor(sd.breakthroughTier)
        : Math.max(0, Math.floor(((typeof sd.level === 'number' ? sd.level : 1) - 1) / 10));

    const cleanMaterials: MaterialBag = {};
    if (sd.materials && typeof sd.materials === 'object') {
      for (const m of MATERIAL_DEFS) {
        const val = sd.materials[m.id];
        if (typeof val === 'number' && val > 0) {
          cleanMaterials[m.id] = Math.floor(val);
        }
      }
    }

    const rawSkillLvs = Array.isArray(sd.skillLevels) ? sd.skillLevels : [1, 1, 1, 1];
    const skillLevels: [number, number, number, number] = [
      Math.max(1, Math.min(MAX_SKILL_LV, Math.floor(Number(rawSkillLvs[0]) || 1))),
      Math.max(1, Math.min(MAX_SKILL_LV, Math.floor(Number(rawSkillLvs[1]) || 1))),
      Math.max(1, Math.min(MAX_SKILL_LV, Math.floor(Number(rawSkillLvs[2]) || 1))),
      Math.max(1, Math.min(MAX_SKILL_LV, Math.floor(Number(rawSkillLvs[3]) || 1))),
    ];

    return {
      slotId,
      seed: typeof sd.seed === 'number' && isFinite(sd.seed) ? sd.seed : 123456,
      worldId,
      breakthroughTier,
      classId,
      awakened: typeof sd.awakened === 'boolean' ? sd.awakened : classId !== 'novice',
      level: typeof sd.level === 'number' && sd.level >= 1 ? Math.floor(sd.level) : 1,
      exp: typeof sd.exp === 'number' && sd.exp >= 0 ? sd.exp : 0,
      gold: typeof sd.gold === 'number' && sd.gold >= 0 ? Math.floor(sd.gold) : 0,
      potions: typeof sd.potions === 'number' && sd.potions >= 0 ? Math.floor(sd.potions) : 2,
      kills: typeof sd.kills === 'number' && sd.kills >= 0 ? Math.floor(sd.kills) : 0,
      player: {
        x: sd.player.x,
        y: sd.player.y,
        hp: typeof sd.player.hp === 'number' ? sd.player.hp : 100,
        mp: typeof sd.player.mp === 'number' ? sd.player.mp : 50,
        baseMaxHp: typeof sd.player.baseMaxHp === 'number' ? sd.player.baseMaxHp : CLASS_DEFS[classId].baseHp,
        baseMaxMp: typeof sd.player.baseMaxMp === 'number' ? sd.player.baseMaxMp : CLASS_DEFS[classId].baseMp,
        baseAtk: typeof sd.player.baseAtk === 'number' ? sd.player.baseAtk : CLASS_DEFS[classId].baseAtk,
        baseDef: typeof sd.player.baseDef === 'number' ? sd.player.baseDef : CLASS_DEFS[classId].baseDef,
        baseSpeed: typeof sd.player.baseSpeed === 'number' ? sd.player.baseSpeed : CLASS_DEFS[classId].baseSpeed,
        baseCrit: typeof sd.player.baseCrit === 'number' ? sd.player.baseCrit : CLASS_DEFS[classId].baseCrit,
      },
      chests: typeof sd.chests === 'string' ? sd.chests : '',
      world2Chests: typeof sd.world2Chests === 'string' ? sd.world2Chests : '',
      grandCityChests: typeof sd.grandCityChests === 'string' ? sd.grandCityChests : '',
      prices: sd.prices && typeof sd.prices === 'object' ? { ...sd.prices } : {},
      equipped:
        sd.equipped && typeof sd.equipped === 'object'
          ? {
              weapon: sd.equipped.weapon ?? null,
              armor: sd.equipped.armor ?? null,
              accessory: sd.equipped.accessory ?? null,
            }
          : { weapon: null, armor: null, accessory: null },
      inventory: Array.isArray(sd.inventory) ? sd.inventory : [],
      materials: cleanMaterials,
      skillLevels,
      skillBooks: Array.isArray(sd.skillBooks) ? sd.skillBooks : [],
      highestDungeonFloor:
        typeof sd.highestDungeonFloor === 'number' && sd.highestDungeonFloor >= 0
          ? Math.floor(sd.highestDungeonFloor)
          : 0,
      fogExplored:
        sd.fogExplored && typeof sd.fogExplored === 'object'
          ? {
              ...(typeof sd.fogExplored.world1 === 'string' && sd.fogExplored.world1.length <= 16384
                ? { world1: sd.fogExplored.world1 }
                : {}),
              ...(typeof sd.fogExplored.world2 === 'string' && sd.fogExplored.world2.length <= 16384
                ? { world2: sd.fogExplored.world2 }
                : {}),
              ...(typeof sd.fogExplored.grand_city === 'string' && sd.fogExplored.grand_city.length <= 16384
                ? { grand_city: sd.fogExplored.grand_city }
                : {}),
            }
          : undefined,
      activeQuest: sd.activeQuest ?? null,
      completedQuestCount: typeof sd.completedQuestCount === 'number' ? sd.completedQuestCount : 0,
      time: typeof sd.time === 'number' ? sd.time : 0,
      updatedAt: typeof sd.updatedAt === 'number' ? sd.updatedAt : Date.now(),
    };
  };

  const t = obj.talents ?? ({} as Partial<TalentLevels>);
  const s = obj.settings ?? ({} as Partial<GameSettings>);
  const mode: PlayMode = obj.mode === 'online' ? 'online' : 'singleplayer';

  return {
    uid: typeof obj.uid === 'string' && obj.uid ? obj.uid.slice(0, 128) : fallbackUid,
    displayName:
      typeof obj.displayName === 'string' && obj.displayName.trim()
        ? obj.displayName.trim().slice(0, 64)
        : fallbackName,
    mode,
    friendCode:
      typeof obj.friendCode === 'string' && obj.friendCode.trim()
        ? obj.friendCode.trim().slice(0, 24)
        : generateFriendCode(`${fallbackUid}_${mode}`),
    soulStones: typeof obj.soulStones === 'number' && obj.soulStones >= 0 ? Math.floor(obj.soulStones) : 0,
    talents: {
      atkLv: Math.max(0, Math.min(10, Math.floor(Number(t.atkLv) || 0))),
      hpLv: Math.max(0, Math.min(10, Math.floor(Number(t.hpLv) || 0))),
      goldLv: Math.max(0, Math.min(10, Math.floor(Number(t.goldLv) || 0))),
      critDmgLv: Math.max(0, Math.min(10, Math.floor(Number(t.critDmgLv) || 0))),
      potCapLv: Math.max(0, Math.min(5, Math.floor(Number(t.potCapLv) || 0))),
    },
    bestiary: obj.bestiary && typeof obj.bestiary === 'object' ? { ...obj.bestiary } : {},
    unlockedAchievements: Array.isArray(obj.unlockedAchievements)
      ? obj.unlockedAchievements.filter((x): x is string => typeof x === 'string').slice(0, 64)
      : [],
    slots:
      mode === 'online'
        ? {
            slot1: sanitizeSlot('slot1', obj.slots?.slot1 ?? obj.slots?.slot2 ?? obj.slots?.slot3),
            slot2: null,
            slot3: null,
          }
        : {
            slot1: sanitizeSlot('slot1', obj.slots?.slot1),
            slot2: sanitizeSlot('slot2', obj.slots?.slot2),
            slot3: sanitizeSlot('slot3', obj.slots?.slot3),
          },
    settings: {
      muted: Boolean(s.muted),
      bgmEnabled: s.bgmEnabled === undefined ? true : Boolean(s.bgmEnabled),
      sfxVolume:
        typeof s.sfxVolume === 'number' && isFinite(s.sfxVolume)
          ? Math.max(0, Math.min(1, s.sfxVolume))
          : 0.75,
      bgmVolume:
        typeof s.bgmVolume === 'number' && isFinite(s.bgmVolume)
          ? Math.max(0, Math.min(1, s.bgmVolume))
          : 0.35,
    },
  };
}

export function exportAccountJson(account: AccountData): string {
  return JSON.stringify(account, null, 2);
}

export function importAccountJson(jsonText: string, uid: string, displayName: string): AccountData {
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object' || !('slots' in parsed || 'talents' in parsed)) {
    throw new Error('无效的《幻想大陆》存档 JSON 格式');
  }
  const clean = sanitizeAccountData(parsed, uid, displayName);
  clean.uid = uid;
  clean.displayName = displayName;
  return clean;
}

export interface JoystickVector {
  x: number;
  y: number;
  mag: number;
  angle: number;
}

export function computeJoystickVector(
  dx: number,
  dy: number,
  maxRadius: number,
  deadzone = 0.14
): JoystickVector {
  if (maxRadius <= 0) return { x: 0, y: 0, mag: 0, angle: 0 };
  const rawDist = Math.hypot(dx, dy);
  const deadPx = maxRadius * deadzone;
  if (rawDist <= deadPx || rawDist === 0) {
    return { x: 0, y: 0, mag: 0, angle: 0 };
  }
  const clampedDist = Math.min(rawDist, maxRadius);
  const mag = Math.min(1, (clampedDist - deadPx) / Math.max(1, maxRadius - deadPx));
  const angle = Math.atan2(dy, dx);
  return {
    x: Math.cos(angle) * mag,
    y: Math.sin(angle) * mag,
    mag,
    angle,
  };
}

export function computeAutoAimAngle(
  px: number,
  py: number,
  fallbackAngle: number,
  maxRange: number,
  targets: readonly { x: number; y: number }[],
  extraTarget?: { x: number; y: number } | null
): number {
  let bestDistSq = maxRange * maxRange;
  let bestTarget: { x: number; y: number } | null = null;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const dx = t.x - px;
    const dy = t.y - py;
    const dSq = dx * dx + dy * dy;
    if (dSq > 0 && dSq <= bestDistSq) {
      bestDistSq = dSq;
      bestTarget = t;
    }
  }
  if (extraTarget) {
    const dx = extraTarget.x - px;
    const dy = extraTarget.y - py;
    const dSq = dx * dx + dy * dy;
    if (dSq > 0 && dSq <= bestDistSq) {
      bestTarget = extraTarget;
    }
  }
  if (!bestTarget) return fallbackAngle;
  return Math.atan2(bestTarget.y - py, bestTarget.x - px);
}

// ---- 连击震屏与边缘脉冲反馈 ----

export interface ComboImpactFeedback {
  shake: number;
  vignetteStrength: number;
  tier: 'none' | 'hot' | 'gold';
}

export function computeComboImpactFeedback(
  comboCount: number,
  isCrit: boolean
): ComboImpactFeedback {
  if (comboCount < 15) {
    return { shake: 0, vignetteStrength: 0, tier: 'none' };
  }
  if (comboCount < 25) {
    return {
      shake: isCrit ? 1.4 : 0,
      vignetteStrength: isCrit ? 0.36 : 0.2,
      tier: 'hot',
    };
  }
  if (comboCount < 50) {
    const isTen = comboCount % 10 === 0;
    const isFive = comboCount % 5 === 0;
    return {
      shake: isTen ? 3.8 : isFive || isCrit ? 2.4 : 1.2,
      vignetteStrength: isTen ? 0.92 : isFive || isCrit ? 0.68 : 0.48,
      tier: 'hot',
    };
  }
  const isTen = comboCount === 50 || comboCount % 10 === 0;
  const isFive = comboCount % 5 === 0;
  return {
    shake: isTen ? 5.6 : isFive || isCrit ? 3.5 : 1.9,
    vignetteStrength: isTen || isCrit ? 1.0 : 0.74,
    tier: 'gold',
  };
}

// ---- 小地图战争迷雾（探索记录） ----

const FOG_B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function createFogBitmap(width: number, height: number): Uint8Array {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  return new Uint8Array(w * h);
}

export function revealFogCircle(
  bitmap: Uint8Array,
  width: number,
  height: number,
  centerTx: number,
  centerTy: number,
  radiusTiles: number
): boolean {
  if (width <= 0 || height <= 0 || bitmap.length < width * height) return false;
  const r = Math.max(1, Math.floor(radiusTiles));
  const rSq = r * r;
  const x0 = Math.max(0, Math.floor(centerTx - r));
  const x1 = Math.min(width - 1, Math.ceil(centerTx + r));
  const y0 = Math.max(0, Math.floor(centerTy - r));
  const y1 = Math.min(height - 1, Math.ceil(centerTy + r));
  let changed = false;
  for (let ty = y0; ty <= y1; ty++) {
    const dy = ty - centerTy;
    const dySq = dy * dy;
    const rowOff = ty * width;
    for (let tx = x0; tx <= x1; tx++) {
      const dx = tx - centerTx;
      if (dx * dx + dySq <= rSq) {
        const idx = rowOff + tx;
        if (bitmap[idx] === 0) {
          bitmap[idx] = 1;
          changed = true;
        }
      }
    }
  }
  return changed;
}

export function countExploredTiles(bitmap: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < bitmap.length; i++) {
    if (bitmap[i] !== 0) count++;
  }
  return count;
}

export function encodeFogBitmap(bitmap: Uint8Array): string {
  const byteLen = Math.ceil(bitmap.length / 8);
  const bytes = new Uint8Array(byteLen);
  for (let i = 0; i < bitmap.length; i++) {
    if (bitmap[i] !== 0) {
      bytes[i >> 3] |= 1 << (i & 7);
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    const trip = (b0 << 16) | (b1 << 8) | b2;
    out += FOG_B64_CHARS[(trip >> 18) & 63];
    out += FOG_B64_CHARS[(trip >> 12) & 63];
    out += hasB1 ? FOG_B64_CHARS[(trip >> 6) & 63] : '=';
    out += hasB2 ? FOG_B64_CHARS[trip & 63] : '=';
  }
  return out;
}

export function decodeFogBitmap(
  encoded: string | undefined,
  width: number,
  height: number
): Uint8Array {
  const bitmap = createFogBitmap(width, height);
  if (!encoded || typeof encoded !== 'string') return bitmap;
  const clean = encoded.replace(/=+$/, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = FOG_B64_CHARS.indexOf(clean[i] ?? '');
    const c1 = FOG_B64_CHARS.indexOf(clean[i + 1] ?? '');
    if (c0 < 0 || c1 < 0) break;
    const c2 = i + 2 < clean.length ? FOG_B64_CHARS.indexOf(clean[i + 2]) : -1;
    const c3 = i + 3 < clean.length ? FOG_B64_CHARS.indexOf(clean[i + 3]) : -1;
    const trip =
      (c0 << 18) | (c1 << 12) | ((c2 >= 0 ? c2 : 0) << 6) | (c3 >= 0 ? c3 : 0);
    bytes.push((trip >> 16) & 255);
    if (c2 >= 0) bytes.push((trip >> 8) & 255);
    if (c3 >= 0) bytes.push(trip & 255);
  }
  const totalBits = Math.min(bitmap.length, bytes.length * 8);
  for (let i = 0; i < totalBits; i++) {
    if ((bytes[i >> 3] & (1 << (i & 7))) !== 0) {
      bitmap[i] = 1;
    }
  }
  return bitmap;
}

// ---- 空间区块刷怪密度限制工具（防止局部堆怪扎堆） ----

export const MOB_CHUNK_TILES = 24;
export const MAX_MOBS_PER_CHUNK = 3;
export const MIN_MOB_SPAWN_SPACING = 115;

export function getMobChunkKey(
  x: number,
  y: number,
  tileSize = 32,
  chunkTiles = MOB_CHUNK_TILES
): string {
  const chunkPx = Math.max(1, tileSize * chunkTiles);
  const cx = Math.floor(x / chunkPx);
  const cy = Math.floor(y / chunkPx);
  return `${cx}:${cy}`;
}

export function countMobsByChunk(
  mobs: readonly { x: number; y: number }[],
  tileSize = 32,
  chunkTiles = MOB_CHUNK_TILES
): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < mobs.length; i++) {
    const key = getMobChunkKey(mobs[i].x, mobs[i].y, tileSize, chunkTiles);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function canSpawnMobAtPosition(
  x: number,
  y: number,
  existingMobs: readonly { x: number; y: number }[],
  maxPerChunk = MAX_MOBS_PER_CHUNK,
  minSpacing = MIN_MOB_SPAWN_SPACING,
  tileSize = 32,
  chunkTiles = MOB_CHUNK_TILES
): { ok: boolean; chunkCount: number } {
  const targetKey = getMobChunkKey(x, y, tileSize, chunkTiles);
  let chunkCount = 0;
  for (let i = 0; i < existingMobs.length; i++) {
    const m = existingMobs[i];
    if (getMobChunkKey(m.x, m.y, tileSize, chunkTiles) === targetKey) {
      chunkCount++;
      if (chunkCount >= maxPerChunk) {
        return { ok: false, chunkCount };
      }
    }
    if (Math.hypot(x - m.x, y - m.y) < minSpacing) {
      return { ok: false, chunkCount };
    }
  }
  return { ok: true, chunkCount };
}

