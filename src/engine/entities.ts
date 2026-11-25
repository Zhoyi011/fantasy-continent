import type {
  BossSkillKind,
  ClassId,
  EliteAffixId,
  GearItem,
  MaterialId,
  SkillBookItem,
  WorldId,
} from '../game/types';

export type MobBehavior = 'chaser' | 'ranged' | 'charger' | 'orbiter' | 'tank';

export type MobShapeTrait =
  | 'slime'
  | 'beast'
  | 'humanoid'
  | 'construct'
  | 'winged'
  | 'spider'
  | 'flora'
  | 'undead'
  | 'elemental'
  | 'void';

export interface MobTypeDef {
  name: string;
  color: string;
  r: number;
  hp: number;
  atk: number;
  exp: number;
  spd: number;
  aggro: number;
  minTier: number;
  ranged?: boolean;
  behavior: MobBehavior;
  trait: MobShapeTrait;
  world: WorldId | 'both';
  drops: MaterialId[];
}

export const MOB_TYPES: MobTypeDef[] = [
  // ---- 原有 10 种魔物 ----
  { name: '史莱姆', color: '#4ade80', r: 12, hp: 24, atk: 4, exp: 8, spd: 50, aggro: 230, minTier: 0, behavior: 'chaser', trait: 'slime', world: 'world1', drops: ['slime_gel', 'herb_leaf'] },
  { name: '野狼', color: '#a78bfa', r: 13, hp: 36, atk: 6, exp: 12, spd: 94, aggro: 310, minTier: 0.3, behavior: 'chaser', trait: 'beast', world: 'world1', drops: ['beast_hide', 'wolf_fang'] },
  { name: '哥布林', color: '#f59e0b', r: 13, hp: 54, atk: 9, exp: 18, spd: 72, aggro: 280, minTier: 0.8, behavior: 'chaser', trait: 'humanoid', world: 'world1', drops: ['copper_ore', 'wood', 'linen_cloth'] },
  { name: '骷髅战士', color: '#e2e8f0', r: 14, hp: 86, atk: 13, exp: 27, spd: 74, aggro: 320, minTier: 1.5, behavior: 'chaser', trait: 'undead', world: 'world1', drops: ['iron_ore', 'stone'] },
  { name: '暗影法师', color: '#c084fc', r: 14, hp: 72, atk: 15, exp: 33, spd: 58, aggro: 360, minTier: 2.0, ranged: true, behavior: 'ranged', trait: 'elemental', world: 'both', drops: ['magic_crystal', 'shadow_dust'] },
  { name: '石巨人', color: '#94a3b8', r: 20, hp: 185, atk: 21, exp: 56, spd: 46, aggro: 260, minTier: 2.8, behavior: 'tank', trait: 'construct', world: 'world1', drops: ['stone', 'iron_ore', 'silver_ore'] },
  { name: '炎魔', color: '#fb7185', r: 18, hp: 235, atk: 28, exp: 84, spd: 66, aggro: 350, minTier: 3.4, ranged: true, behavior: 'ranged', trait: 'elemental', world: 'both', drops: ['ember_core', 'magic_crystal'] },
  { name: '熔岩幼龙', color: '#f97316', r: 16, hp: 170, atk: 22, exp: 65, spd: 82, aggro: 340, minTier: 0, ranged: true, behavior: 'ranged', trait: 'winged', world: 'world2', drops: ['dragon_scale', 'ember_core'] },
  { name: '灰烬骑士', color: '#cbd5e1', r: 17, hp: 245, atk: 27, exp: 88, spd: 76, aggro: 330, minTier: 0.8, behavior: 'tank', trait: 'humanoid', world: 'world2', drops: ['mythril_ore', 'iron_ore'] },
  { name: '炼狱魔眼', color: '#e879f9', r: 15, hp: 195, atk: 31, exp: 96, spd: 68, aggro: 380, minTier: 1.6, ranged: true, behavior: 'orbiter', trait: 'void', world: 'world2', drops: ['void_essence', 'magic_crystal'] },

  // ---- 新增 30 种魔物（1~15 第一世界原始森林 & 道路） ----
  { name: '剧毒蜘蛛', color: '#84cc16', r: 13, hp: 40, atk: 8, exp: 15, spd: 80, aggro: 310, minTier: 0.4, ranged: true, behavior: 'ranged', trait: 'spider', world: 'world1', drops: ['venom_sac', 'linen_cloth'] },
  { name: '森林野猪', color: '#a16207', r: 15, hp: 62, atk: 11, exp: 20, spd: 78, aggro: 300, minTier: 0.6, behavior: 'charger', trait: 'beast', world: 'world1', drops: ['beast_hide', 'wolf_fang'] },
  { name: '树精幼苗', color: '#22c55e', r: 13, hp: 46, atk: 7, exp: 16, spd: 58, aggro: 270, minTier: 0.2, behavior: 'chaser', trait: 'flora', world: 'world1', drops: ['wood', 'ancient_bark', 'herb_leaf'] },
  { name: '食人花', color: '#ec4899', r: 14, hp: 56, atk: 11, exp: 22, spd: 32, aggro: 340, minTier: 0.9, ranged: true, behavior: 'ranged', trait: 'flora', world: 'world1', drops: ['herb_leaf', 'venom_sac'] },
  { name: '风灵鸟', color: '#38bdf8', r: 12, hp: 44, atk: 9, exp: 19, spd: 112, aggro: 360, minTier: 0.7, behavior: 'orbiter', trait: 'winged', world: 'world1', drops: ['linen_cloth', 'magic_crystal'] },
  { name: '盗贼斥候', color: '#fb923c', r: 13, hp: 66, atk: 12, exp: 24, spd: 90, aggro: 330, minTier: 1.1, behavior: 'chaser', trait: 'humanoid', world: 'world1', drops: ['linen_cloth', 'copper_ore'] },
  { name: '沼泽蛙妖', color: '#10b981', r: 14, hp: 72, atk: 12, exp: 25, spd: 76, aggro: 310, minTier: 1.3, ranged: true, behavior: 'ranged', trait: 'slime', world: 'world1', drops: ['slime_gel', 'venom_sac'] },
  { name: '腐尸矿工', color: '#a8a29e', r: 14, hp: 92, atk: 14, exp: 30, spd: 64, aggro: 290, minTier: 1.6, behavior: 'chaser', trait: 'undead', world: 'world1', drops: ['copper_ore', 'iron_ore', 'stone'] },
  { name: '银背魔猿', color: '#64748b', r: 17, hp: 125, atk: 17, exp: 38, spd: 86, aggro: 320, minTier: 1.9, behavior: 'charger', trait: 'beast', world: 'world1', drops: ['beast_hide', 'silver_ore'] },
  { name: '重锤食人魔', color: '#ea580c', r: 21, hp: 205, atk: 24, exp: 60, spd: 52, aggro: 290, minTier: 2.3, behavior: 'tank', trait: 'humanoid', world: 'world1', drops: ['stone', 'titan_bone', 'iron_ore'] },
  { name: '雷霆鹰身女妖', color: '#fde047', r: 14, hp: 108, atk: 19, exp: 44, spd: 102, aggro: 370, minTier: 2.4, ranged: true, behavior: 'orbiter', trait: 'winged', world: 'world1', drops: ['magic_crystal', 'silver_ore'] },
  { name: '幽灵女妖', color: '#67e8f9', r: 14, hp: 112, atk: 20, exp: 48, spd: 84, aggro: 350, minTier: 2.7, ranged: true, behavior: 'orbiter', trait: 'undead', world: 'world1', drops: ['shadow_dust', 'frost_shard'] },
  { name: '寒霜狼魂', color: '#7dd3fc', r: 15, hp: 142, atk: 22, exp: 54, spd: 106, aggro: 350, minTier: 3.0, behavior: 'charger', trait: 'beast', world: 'world1', drops: ['frost_shard', 'wolf_fang'] },
  { name: '狂暴半人马', color: '#d97706', r: 18, hp: 175, atk: 24, exp: 64, spd: 98, aggro: 360, minTier: 3.2, behavior: 'charger', trait: 'beast', world: 'world1', drops: ['ancient_bark', 'silver_ore'] },
  { name: '圣殿叛徒', color: '#818cf8', r: 16, hp: 195, atk: 26, exp: 72, spd: 82, aggro: 340, minTier: 3.6, behavior: 'tank', trait: 'humanoid', world: 'world1', drops: ['silver_ore', 'mythril_ore'] },

  // ---- 新增 30 种魔物（16~30 第二世界烈焰深渊） ----
  { name: '熔岩史莱姆', color: '#f97316', r: 14, hp: 145, atk: 19, exp: 52, spd: 60, aggro: 290, minTier: 0, behavior: 'chaser', trait: 'slime', world: 'world2', drops: ['slime_gel', 'ember_core'] },
  { name: '焦土蝎狮', color: '#b45309', r: 17, hp: 188, atk: 24, exp: 68, spd: 96, aggro: 350, minTier: 0.4, behavior: 'charger', trait: 'beast', world: 'world2', drops: ['venom_sac', 'wolf_fang'] },
  { name: '暗影刺客怪', color: '#6366f1', r: 14, hp: 156, atk: 26, exp: 70, spd: 118, aggro: 360, minTier: 0.7, behavior: 'orbiter', trait: 'humanoid', world: 'world2', drops: ['shadow_dust', 'linen_cloth'] },
  { name: '深渊双头犬', color: '#dc2626', r: 16, hp: 205, atk: 25, exp: 74, spd: 102, aggro: 340, minTier: 1.0, behavior: 'charger', trait: 'beast', world: 'world2', drops: ['wolf_fang', 'ember_core'] },
  { name: '骸骨弓手', color: '#cbd5e1', r: 14, hp: 162, atk: 26, exp: 76, spd: 72, aggro: 390, minTier: 1.2, ranged: true, behavior: 'ranged', trait: 'undead', world: 'world2', drops: ['wood', 'titan_bone'] },
  { name: '炼金傀儡', color: '#eab308', r: 20, hp: 290, atk: 29, exp: 92, spd: 50, aggro: 300, minTier: 1.5, behavior: 'tank', trait: 'construct', world: 'world2', drops: ['copper_ore', 'mythril_ore'] },
  { name: '血月吸血鬼', color: '#be123c', r: 15, hp: 215, atk: 30, exp: 98, spd: 92, aggro: 370, minTier: 1.8, ranged: true, behavior: 'orbiter', trait: 'undead', world: 'world2', drops: ['shadow_dust', 'magic_crystal'] },
  { name: '混沌恶魔', color: '#9333ea', r: 18, hp: 275, atk: 33, exp: 112, spd: 80, aggro: 350, minTier: 2.1, behavior: 'chaser', trait: 'elemental', world: 'world2', drops: ['void_essence', 'ember_core'] },
  { name: '虚空行者', color: '#7c3aed', r: 15, hp: 220, atk: 32, exp: 108, spd: 95, aggro: 390, minTier: 2.3, ranged: true, behavior: 'orbiter', trait: 'void', world: 'world2', drops: ['void_essence', 'shadow_dust'] },
  { name: '陨星石魔', color: '#57534e', r: 22, hp: 360, atk: 35, exp: 128, spd: 46, aggro: 280, minTier: 2.6, behavior: 'tank', trait: 'construct', world: 'world2', drops: ['stone', 'titan_bone', 'ember_core'] },
  { name: '幽魂巫妖', color: '#22d3ee', r: 16, hp: 240, atk: 36, exp: 132, spd: 66, aggro: 410, minTier: 2.9, ranged: true, behavior: 'ranged', trait: 'undead', world: 'world2', drops: ['frost_shard', 'void_essence'] },
  { name: '炼狱火蜥蜴', color: '#ef4444', r: 16, hp: 255, atk: 34, exp: 124, spd: 90, aggro: 360, minTier: 3.1, ranged: true, behavior: 'ranged', trait: 'beast', world: 'world2', drops: ['dragon_scale', 'ember_core'] },
  { name: '深渊触手怪', color: '#a855f7', r: 18, hp: 295, atk: 35, exp: 136, spd: 64, aggro: 340, minTier: 3.3, behavior: 'tank', trait: 'void', world: 'world2', drops: ['void_essence', 'venom_sac'] },
  { name: '堕落圣骑士', color: '#f43f5e', r: 18, hp: 340, atk: 38, exp: 152, spd: 82, aggro: 350, minTier: 3.6, behavior: 'charger', trait: 'humanoid', world: 'world2', drops: ['mythril_ore', 'dragon_scale'] },
  { name: '末日毁灭卫士', color: '#fbbf24', r: 21, hp: 410, atk: 42, exp: 175, spd: 72, aggro: 360, minTier: 4.0, behavior: 'tank', trait: 'construct', world: 'world2', drops: ['titan_bone', 'dragon_scale', 'void_essence'] },

  // ---- 第二批扩展 25 种魔物（幻光王城外环 + 试炼之塔高阶怪物 + 深渊高地） ----
  { name: '下水道鼠妖', color: '#78716c', r: 12, hp: 48, atk: 9, exp: 16, spd: 102, aggro: 320, minTier: 0, behavior: 'chaser', trait: 'beast', world: 'grand_city', drops: ['beast_hide', 'copper_ore'] },
  { name: '盗宝地精', color: '#eab308', r: 13, hp: 62, atk: 10, exp: 26, spd: 108, aggro: 330, minTier: 0.4, behavior: 'orbiter', trait: 'humanoid', world: 'grand_city', drops: ['copper_ore', 'silver_ore', 'linen_cloth'] },
  { name: '石像鬼卫兵', color: '#64748b', r: 16, hp: 135, atk: 18, exp: 42, spd: 68, aggro: 330, minTier: 0.8, behavior: 'tank', trait: 'winged', world: 'dungeon', drops: ['stone', 'iron_ore'] },
  { name: '翡翠巡林灵', color: '#10b981', r: 13, hp: 74, atk: 12, exp: 24, spd: 86, aggro: 320, minTier: 0.5, behavior: 'chaser', trait: 'flora', world: 'grand_city', drops: ['wood', 'herb_leaf', 'ancient_bark'] },
  { name: '暗夜枭兽', color: '#818cf8', r: 16, hp: 112, atk: 16, exp: 35, spd: 92, aggro: 340, minTier: 1.0, behavior: 'charger', trait: 'beast', world: 'grand_city', drops: ['beast_hide', 'wolf_fang'] },
  { name: '铁甲野猪骑手', color: '#b45309', r: 17, hp: 138, atk: 19, exp: 40, spd: 96, aggro: 350, minTier: 1.2, behavior: 'charger', trait: 'beast', world: 'grand_city', drops: ['iron_ore', 'beast_hide'] },
  { name: '晶矿甲虫', color: '#38bdf8', r: 15, hp: 148, atk: 17, exp: 46, spd: 62, aggro: 300, minTier: 0.6, behavior: 'tank', trait: 'construct', world: 'dungeon', drops: ['magic_crystal', 'silver_ore'] },
  { name: '星纹幽灵侍', color: '#a5b4fc', r: 14, hp: 122, atk: 20, exp: 52, spd: 88, aggro: 360, minTier: 1.0, ranged: true, behavior: 'orbiter', trait: 'undead', world: 'dungeon', drops: ['shadow_dust', 'silver_ore'] },
  { name: '秘银构装体', color: '#cbd5e1', r: 19, hp: 210, atk: 23, exp: 64, spd: 56, aggro: 310, minTier: 1.4, behavior: 'tank', trait: 'construct', world: 'dungeon', drops: ['mythril_ore', 'iron_ore'] },
  { name: '烈焰术士学徒', color: '#f97316', r: 14, hp: 132, atk: 24, exp: 58, spd: 70, aggro: 400, minTier: 1.4, ranged: true, behavior: 'ranged', trait: 'humanoid', world: 'dungeon', drops: ['ember_core', 'magic_crystal'] },
  { name: '寒冰元素灵', color: '#67e8f9', r: 14, hp: 136, atk: 22, exp: 56, spd: 76, aggro: 390, minTier: 1.2, ranged: true, behavior: 'orbiter', trait: 'elemental', world: 'dungeon', drops: ['frost_shard', 'magic_crystal'] },
  { name: '血棘妖姬', color: '#ec4899', r: 15, hp: 148, atk: 25, exp: 66, spd: 74, aggro: 380, minTier: 1.8, ranged: true, behavior: 'ranged', trait: 'flora', world: 'dungeon', drops: ['venom_sac', 'herb_leaf'] },
  { name: '深渊暗影豹', color: '#6366f1', r: 15, hp: 156, atk: 26, exp: 70, spd: 120, aggro: 390, minTier: 2.0, behavior: 'charger', trait: 'beast', world: 'dungeon', drops: ['shadow_dust', 'beast_hide'] },
  { name: '虚空魔导师', color: '#c084fc', r: 15, hp: 168, atk: 29, exp: 84, spd: 68, aggro: 420, minTier: 2.3, ranged: true, behavior: 'ranged', trait: 'void', world: 'dungeon', drops: ['void_essence', 'magic_crystal'] },
  { name: '古墓棺椁卫', color: '#a8a29e', r: 20, hp: 265, atk: 28, exp: 88, spd: 52, aggro: 320, minTier: 2.4, behavior: 'tank', trait: 'undead', world: 'dungeon', drops: ['titan_bone', 'stone'] },
  { name: '黑曜石翼龙', color: '#334155', r: 18, hp: 225, atk: 31, exp: 96, spd: 96, aggro: 400, minTier: 2.6, ranged: true, behavior: 'orbiter', trait: 'winged', world: 'dungeon', drops: ['dragon_scale', 'ember_core'] },
  { name: '苍穹雷灵', color: '#fde047', r: 14, hp: 175, atk: 30, exp: 92, spd: 110, aggro: 410, minTier: 2.5, ranged: true, behavior: 'orbiter', trait: 'elemental', world: 'dungeon', drops: ['magic_crystal', 'silver_ore'] },
  { name: '剧毒蝎王', color: '#84cc16', r: 17, hp: 230, atk: 28, exp: 102, spd: 86, aggro: 360, minTier: 1.5, behavior: 'charger', trait: 'spider', world: 'world2', drops: ['venom_sac', 'wolf_fang'] },
  { name: '熔核巨人', color: '#ea580c', r: 22, hp: 350, atk: 34, exp: 124, spd: 50, aggro: 310, minTier: 2.2, behavior: 'tank', trait: 'construct', world: 'world2', drops: ['ember_core', 'titan_bone'] },
  { name: '深渊收割灵', color: '#f43f5e', r: 15, hp: 198, atk: 34, exp: 112, spd: 114, aggro: 400, minTier: 3.0, behavior: 'charger', trait: 'void', world: 'dungeon', drops: ['shadow_dust', 'void_essence'] },
  { name: '星界游魂射手', color: '#7dd3fc', r: 14, hp: 185, atk: 33, exp: 110, spd: 82, aggro: 430, minTier: 3.0, ranged: true, behavior: 'ranged', trait: 'undead', world: 'dungeon', drops: ['frost_shard', 'silver_ore'] },
  { name: '泰坦青铜守卫', color: '#d97706', r: 21, hp: 330, atk: 36, exp: 130, spd: 58, aggro: 340, minTier: 3.3, behavior: 'tank', trait: 'construct', world: 'dungeon', drops: ['titan_bone', 'mythril_ore'] },
  { name: '混沌裂隙蝶', color: '#e879f9', r: 14, hp: 190, atk: 35, exp: 122, spd: 104, aggro: 420, minTier: 3.4, ranged: true, behavior: 'orbiter', trait: 'winged', world: 'dungeon', drops: ['void_essence', 'magic_crystal'] },
  { name: '冥火狼骑', color: '#dc2626', r: 18, hp: 270, atk: 37, exp: 138, spd: 108, aggro: 390, minTier: 3.6, behavior: 'charger', trait: 'beast', world: 'dungeon', drops: ['ember_core', 'wolf_fang'] },
  { name: '终末暗星使', color: '#a855f7', r: 18, hp: 310, atk: 40, exp: 160, spd: 90, aggro: 440, minTier: 3.8, ranged: true, behavior: 'orbiter', trait: 'void', world: 'dungeon', drops: ['void_essence', 'dragon_scale'] },
];

export const BOSS_NAMES = ['熔岩领主', '深渊守望者', '荒野暴君', '灰烬巨兽', '虚空吞噬者'];

export interface PlayerEntity {
  classId: ClassId;
  awakened: boolean;
  x: number;
  y: number;
  r: number;
  collR?: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  level: number;
  exp: number;
  baseMaxHp: number;
  baseMaxMp: number;
  baseAtk: number;
  baseDef: number;
  baseSpeed: number;
  baseCrit: number;
  atk: number;
  def: number;
  speed: number;
  attackSpeed: number;
  critChance: number;
  critDmgMult: number;
  critDisabled: boolean;
  mpRegen: number;
  goldMult: number;
  potionCap: number;
  potionHealBonus: number;
  lifeOnKill: number;
  facingAng: number;
  attackCd: number;
  swing: number;
  swingTotal: number;
  skillQCd: number;
  skillECd: number;
  skillCds: [number, number, number, number];
  skillLevels: [number, number, number, number];
  shieldHp: number;
  shieldTimer: number;
  slowTimer: number;
  stunTimer: number;
  dashCd: number;
  dashTime: number;
  dashVx: number;
  dashVy: number;
  potCd: number;
  invuln: number;
  gold: number;
  potions: number;
  kills: number;
  moving: boolean;
  walkPhase: number;
  cloak: number;
  hurtFlash: number;
}

export interface AfterimageEntity {
  x: number;
  y: number;
  r: number;
  facingAng: number;
  classId: ClassId;
  life: number;
  maxLife: number;
}

export interface MobEntity {
  netId?: string;
  syncTargetX?: number;
  syncTargetY?: number;
  x: number;
  y: number;
  r: number;
  collR?: number;
  type: MobTypeDef;
  name: string;
  color: string;
  level: number;
  maxHp: number;
  hp: number;
  atk: number;
  exp: number;
  speed: number;
  aggro: number;
  ranged: boolean;
  behavior: MobBehavior;
  trait: MobShapeTrait;
  atkCd: number;
  atkSpeed: number;
  chargeCd: number;
  chargeTime: number;
  chargeDir: number;
  hitFlash: number;
  lunge: number;
  phase: number;
  homeX: number;
  homeY: number;
  hpBarTimer: number;
  stunTimer: number;
  freezeTimer: number;
  knockVx: number;
  knockVy: number;
  isElite?: boolean;
  eliteAffix?: EliteAffixId;
  isSplitChild?: boolean;
}

export interface FixedBossArena {
  id: string;
  worldId: WorldId;
  name: string;
  title: string;
  tx: number;
  ty: number;
  x: number;
  y: number;
  r: number;
  baseLevel: number;
  color: string;
  hpMult: number;
  atkMult: number;
}

export interface BossEntity {
  netId?: string;
  syncTargetX?: number;
  syncTargetY?: number;
  fixedBossId?: string;
  title?: string;
  bossArchetype?: string;
  arenaX?: number;
  arenaY?: number;
  x: number;
  y: number;
  r: number;
  collR: number;
  name: string;
  level: number;
  maxHp: number;
  hp: number;
  atk: number;
  speed: number;
  state: 'idle' | 'charge' | 'slam' | 'summon' | 'telegraph' | 'evade';
  stateTimer: number;
  atkCd: number;
  hitFlash: number;
  lunge: number;
  phase: number;
  chargeDir: number;
  chargeHit: boolean;
  slamR: number;
  slamT: number;
  rage: number;
  stunTimer: number;
  freezeTimer: number;
  knockVx: number;
  knockVy: number;
  shieldHp: number;
  shieldTimer: number;
  reflectRatio: number;
  evadeCd: number;
  skillCds: Record<string, number>;
  telegraph?: {
    kind: BossSkillKind;
    x: number;
    y: number;
    r: number;
    timer: number;
    maxTimer: number;
    ang?: number;
    color?: string;
    subTargets?: { x: number; y: number; r?: number }[];
    spiralTick?: number;
  };
  facingAng?: number;
  attackAnim?: number;
  attackAnimTotal?: number;
}

export interface DropEntity {
  x: number;
  y: number;
  kind: 'gold' | 'potion' | 'gear' | 'soulstone' | 'material' | 'skillbook';
  amount: number;
  gearItem?: GearItem;
  materialId?: MaterialId;
  skillBook?: SkillBookItem;
  life: number;
  bob: number;
}

export interface ProjectileEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  life: number;
  team: 'player' | 'mob';
  color: string;
  explosive?: boolean;
  freezeSec?: number;
  lifestealRatio?: number;
  stunSec?: number;
  pierce?: number;
  hitSet?: Set<object>;
  shape?: 'orb' | 'trident' | 'crescent';
  isFire?: boolean;
  trail: { x: number; y: number; life: number }[];
  trailCursor?: number;
}

export interface ParticleEntity {
  ring?: boolean;
  kind?: 'dot' | 'ring' | 'slash' | 'shard' | 'rune';
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  r?: number;
  r0?: number;
  r1?: number;
  ang?: number;
  arc?: number;
  spin?: number;
  width?: number;
  life: number;
  maxLife: number;
  color: string;
  drag?: number;
}

export interface FloaterEntity {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  vy: number;
  scale: number;
}

export interface WarningEntity {
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface ChestEntity {
  tx: number;
  ty: number;
  x: number;
  y: number;
  opened: boolean;
  ph: number;
}

export type NpcKind = 'merchant' | 'elder' | 'awakening' | 'armorer' | 'blacksmith' | 'upgrader';

export interface NpcEntity {
  kind: NpcKind;
  label?: string;
  x: number;
  y: number;
  r: number;
  ph: number;
}

export interface SignpostEntity {
  id: string;
  x: number;
  y: number;
  title: string;
  direction: string;
  destDesc: string;
  dangerLevel: string;
  angle: number;
}

export interface TorchEntity {
  x: number;
  y: number;
  ph: number;
}

export interface AltarEntity {
  label?: string;
  x: number;
  y: number;
  r: number;
  ph: number;
}

export interface PortalEntity {
  x: number;
  y: number;
  r: number;
  ph: number;
  targetWorld: WorldId;
  label: string;
}

export interface DecoEntity {
  kind: 'tree' | 'rock';
  x: number;
  y: number;
  v: number;
  ph: number;
}

export interface DungeonGateEntity {
  x: number;
  y: number;
  r: number;
  ph: number;
  label: string;
}

export interface SocialBoardEntity {
  x: number;
  y: number;
  r: number;
  ph: number;
  label: string;
}

export interface RemotePlayerEntity {
  uid: string;
  name: string;
  classId: ClassId;
  level: number;
  worldId?: WorldId;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  facingAng: number;
  targetFacingAng: number;
  hp: number;
  maxHp: number;
  hpRatio: number;
  isAttacking: boolean;
  moving: boolean;
  walkPhase: number;
  swing: number;
  swingTotal: number;
  inParty: boolean;
  isFriend: boolean;
}


