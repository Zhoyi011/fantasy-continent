export type PlayMode = 'singleplayer' | 'online';

export type ArchetypeId = 'tank' | 'assassin' | 'archer' | 'healer' | 'mage';

export type ClassBranch = 'novice' | ArchetypeId;

export type ClassId =
  | 'novice'
  // 坦克系 (6 常规 + 2 隐藏)
  | 'knight'
  | 'paladin'
  | 'berserker'
  | 'spearmaster'
  | 'aegis_warden'
  | 'earth_juggernaut'
  | 'celestial'
  | 'abyss_bastion'
  // 刺客系 (6 常规 + 2 隐藏)
  | 'assassin'
  | 'venom_blade'
  | 'phantom_dancer'
  | 'night_reaper'
  | 'blood_stalker'
  | 'storm_ninjutsu'
  | 'void_slayer'
  | 'crimson_emperor'
  // 射手系 (6 常规 + 2 隐藏)
  | 'ranger'
  | 'crossbowman'
  | 'wind_sniper'
  | 'flame_marksman'
  | 'frost_tracker'
  | 'beast_bowman'
  | 'starlight_archer'
  | 'mechanical_gunner'
  // 奶妈系 (6 常规 + 2 隐藏)
  | 'holy_priest'
  | 'druid'
  | 'oracle'
  | 'bard'
  | 'cleric'
  | 'spirit_shaman'
  | 'seraph'
  | 'soul_weaver'
  // 法师系 (6 常规 + 2 隐藏)
  | 'mage'
  | 'frostmage'
  | 'necromancer'
  | 'storm_archmage'
  | 'arcane_scholar'
  | 'earth_geomancer'
  | 'time_chronomancer'
  | 'chaos_warlock';

export type WeaponKind =
  | 'sword'
  | 'axe'
  | 'dagger'
  | 'spear'
  | 'bow'
  | 'crossbow'
  | 'staff'
  | 'celestial_blade'
  | 'shield_blade'
  | 'scythe'
  | 'scepter'
  | 'harp';

export type GearWeaponSubtype =
  | 'sword'
  | 'axe'
  | 'dagger'
  | 'spear'
  | 'bow'
  | 'crossbow'
  | 'staff'
  | 'scepter'
  | 'heavy_armor'
  | 'light_armor'
  | 'robe'
  | 'universal';

export type ClassCategoryRestriction =
  | 'all'
  | 'melee'
  | 'ranged'
  | 'tank'
  | 'assassin'
  | 'archer'
  | 'healer'
  | 'mage'
  | 'knight_paladin'
  | 'berserker'
  | 'spearmaster'
  | 'celestial';

export type WorldId = 'world1' | 'world2' | 'grand_city' | 'dungeon';

export type GearRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type GearSlot = 'weapon' | 'armor' | 'accessory';

export type SkillSlotIndex = 0 | 1 | 2 | 3;

export type SkillPattern =
  | 'spin_aoe'
  | 'stun_slam'
  | 'dash_strike'
  | 'cone_volley'
  | 'heavy_projectile'
  | 'aoe_blast'
  | 'heal_pulse'
  | 'shield_fortify'
  | 'vortex_pull';

export interface GearAffixes {
  atk?: number;
  def?: number;
  maxHp?: number;
  maxMp?: number;
  critChance?: number; // percentage points, e.g. 6 means +6%
  critDmgBonus?: number; // percentage points, e.g. 18 means +18% crit dmg
  attackSpeed?: number; // percentage points, e.g. 10 means +10% attack speed
  speed?: number;
  lifeOnKill?: number;
  mpRegen?: number;
}

export interface GearItem {
  id: string;
  name: string;
  slot: GearSlot;
  rarity: GearRarity;
  level: number;
  affixes: GearAffixes;
  sellValue: number;
  weaponSubtype?: GearWeaponSubtype;
  requiredCategory?: ClassCategoryRestriction;
  enhanceLv?: number;
  flavor?: string;
}

export interface EquippedGear {
  weapon: GearItem | null;
  armor: GearItem | null;
  accessory: GearItem | null;
}

export interface SkillBookItem {
  id: string;
  name: string;
  targetSlot: SkillSlotIndex;
  archetype: ArchetypeId | 'all';
  rarity: GearRarity;
  levelBonus: number;
  sellValue: number;
  desc: string;
}

export type MaterialId =
  | 'wood'
  | 'stone'
  | 'copper_ore'
  | 'iron_ore'
  | 'beast_hide'
  | 'herb_leaf'
  | 'slime_gel'
  | 'wolf_fang'
  | 'linen_cloth'
  | 'magic_crystal'
  | 'silver_ore'
  | 'venom_sac'
  | 'shadow_dust'
  | 'ancient_bark'
  | 'frost_shard'
  | 'ember_core'
  | 'mythril_ore'
  | 'dragon_scale'
  | 'void_essence'
  | 'titan_bone';

export type MaterialBag = Partial<Record<MaterialId, number>>;

export interface MaterialDef {
  id: MaterialId;
  name: string;
  icon: string;
  rarity: GearRarity;
  desc: string;
  sourceHint: string;
}

export interface CraftRecipeDef {
  id: string;
  name: string;
  slot: GearSlot;
  rarity: GearRarity;
  level: number;
  weaponSubtype: GearWeaponSubtype;
  requiredCategory: ClassCategoryRestriction;
  goldCost: number;
  materials: { id: MaterialId; count: number }[];
  affixes: GearAffixes;
  flavor: string;
}

export interface SkillMeta {
  slot: SkillSlotIndex;
  key: string;
  name: string;
  icon: string;
  desc: string;
  mpCost: number;
  cooldown: number;
  pattern: SkillPattern;
  powerMult: number;
  range: number;
  projCount?: number;
  spread?: number;
  stunDur?: number;
  slowDur?: number;
  healPct?: number;
  shieldPct?: number;
  lifestealRatio?: number;
  pierce?: boolean;
  explodeRadius?: number;
  color?: string;
  forceCrit?: boolean;
  dashDist?: number;
}

export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  icon: string;
  color: string;
  badgeBg: string;
  desc: string;
}

export interface ClassDef {
  id: ClassId;
  archetype: ArchetypeId | 'novice';
  branch: ClassBranch;
  isHidden?: boolean;
  isRangedCombat?: boolean;
  name: string;
  title: string;
  summary: string;
  bodyColor: string;
  bodyHighlight: string;
  cloakColor: string;
  helmColor: string;
  accentColor: string;
  hairColor?: string;
  weaponKind: WeaponKind;
  critDisabled?: boolean;
  baseHp: number;
  baseMp: number;
  baseAtk: number;
  baseDef: number;
  baseSpeed: number;
  baseCrit: number; // percentage, e.g. 15 = 15%
  baseCritDmg?: number; // percentage, e.g. 190 = 190%
  baseAttackSpeed?: number; // percentage, base 100
  baseMpRegen?: number;
  hpPerLv: number;
  mpPerLv: number;
  atkPerLv: number;
  defPerLv: number;
  speedPerLv: number;
  basicAttackName: string;
  basicAttackIcon: string;
  basicCooldown: number;
  unlockHint?: string;
  skills: [SkillMeta, SkillMeta, SkillMeta, SkillMeta];
  // 兼容旧引用别名
  skillQ: SkillMeta;
  skillE: SkillMeta;
}

export type QuestType = 'kill_mobs' | 'open_chests' | 'kill_boss';

export interface QuestDef {
  id: string;
  type: QuestType;
  title: string;
  desc: string;
  target: number;
  rewardGold: number;
  rewardExp: number;
  isBreakthrough?: boolean;
  requiredWorld?: WorldId;
  targetBossId?: string;
}

export interface ActiveQuestState {
  questId: string;
  progress: number;
  completed: boolean;
  isBreakthrough?: boolean;
  targetTier?: number;
}

export type DayPhase = '黎明' | '白天' | '黄昏' | '夜晚';

export interface TimeOfDayInfo {
  phase: DayPhase;
  cycleProgress: number; // 0..1
  darkness: number; // 0 (bright noon) .. 0.78 (deep night)
  tintColor: string;
  clockText: string;
}

export type WeatherKind = 'clear' | 'drizzle' | 'thunderstorm' | 'fog' | 'snow';

export interface WeatherInfo {
  kind: WeatherKind;
  label: string;
  icon: string;
  speedMult: number;
  critBonusPct: number;
  fireDmgMult: number;
  overlayTint: string;
  effectSummary: string;
}

export type EliteAffixId = 'frozen' | 'swift' | 'splitter' | 'vampiric';

export interface EliteAffixDef {
  id: EliteAffixId;
  label: string;
  prefix: string;
  color: string;
  glowColor: string;
  desc: string;
}

export interface ComputedStats {
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
  speed: number;
  attackSpeed: number; // percentage, base 100
  critChance: number;
  critDmgMult: number;
  critDisabled: boolean;
  goldMult: number;
  potionCap: number;
  potionHealBonus: number;
  lifeOnKill: number;
  mpRegen: number;
}

export interface LogEntry {
  id: number;
  text: string;
  color: string;
}

export interface ShopItemDef {
  id: 'potion' | 'atk' | 'def' | 'hp';
  icon: string;
  name: string;
  desc: string;
  base: number;
  rep: number;
}

// ---- 副本系统 ----
export interface DungeonFloorDef {
  floor: number;
  name: string;
  subtitle: string;
  recommendedLv: number;
  requiresParty: boolean;
  minPartySize: number;
  mobCount: number;
  bossId: string;
  bossName: string;
  bossTitle: string;
  bossColor: string;
  rewardExp: number;
  rewardGold: number;
  guaranteedRarity: GearRarity;
  skillBookDropChance: number;
}

export type BossSkillKind =
  | 'cc_stun'
  | 'cc_freeze'
  | 'cc_pull'
  | 'def_shield'
  | 'aoe_nova'
  | 'aoe_barrage'
  | 'dash_strike'
  | 'meteor_rain'
  | 'cross_slash'
  | 'spiral_storm'
  | 'blink_execute';

// ---- Meta-Progression & Saves ----
export type SaveSlotId = 'slot1' | 'slot2' | 'slot3';

export type TalentId = 'atkLv' | 'hpLv' | 'goldLv' | 'critDmgLv' | 'potCapLv';

export interface TalentLevels {
  atkLv: number;
  hpLv: number;
  goldLv: number;
  critDmgLv: number;
  potCapLv: number;
}

export interface TalentDef {
  id: TalentId;
  name: string;
  icon: string;
  desc: string;
  maxLevel: number;
  baseCost: number;
  costStep: number;
  perLevelLabel: string;
}

export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
  target: number;
  metric: 'totalKills' | 'bossKills' | 'chestsOpened' | 'questsCompleted' | 'maxLevel' | 'bestRarityRank';
  rewardSoulStones: number;
  bonusLabel: string;
  bonus: {
    atk?: number;
    def?: number;
    maxHp?: number;
    critChance?: number;
    speed?: number;
  };
}

export interface GameSettings {
  muted: boolean;
  bgmEnabled: boolean;
  sfxVolume: number; // 0..1
  bgmVolume: number; // 0..1
}

export interface SaveSlotPlayerData {
  x: number;
  y: number;
  hp: number;
  mp: number;
  baseMaxHp: number;
  baseMaxMp: number;
  baseAtk: number;
  baseDef: number;
  baseSpeed: number;
  baseCrit: number;
}

export interface SaveSlotData {
  slotId: SaveSlotId;
  seed: number;
  worldId: WorldId;
  breakthroughTier: number;
  classId: ClassId;
  awakened?: boolean;
  level: number;
  exp: number;
  gold: number;
  potions: number;
  kills: number;
  player: SaveSlotPlayerData;
  chests: string;
  world2Chests?: string;
  grandCityChests?: string;
  prices: Record<string, number>;
  equipped: EquippedGear;
  inventory: GearItem[];
  materials?: MaterialBag;
  skillLevels?: [number, number, number, number];
  skillBooks?: SkillBookItem[];
  highestDungeonFloor?: number;
  fogExplored?: Partial<Record<'world1' | 'world2' | 'grand_city', string>>;
  activeQuest: ActiveQuestState | null;
  completedQuestCount: number;
  time: number;
  updatedAt: number;
}

export interface AccountData {
  uid: string;
  displayName: string;
  mode?: PlayMode;
  friendCode?: string;
  soulStones: number;
  talents: TalentLevels;
  bestiary: Record<string, number>;
  unlockedAchievements: string[];
  slots: Record<SaveSlotId, SaveSlotData | null>;
  settings: GameSettings;
}

export interface AuthUserInfo {
  uid: string;
  email: string | null;
  displayName: string;
  photoURL: string | null;
  emailVerified: boolean;
  isGuest: boolean;
}

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'unverified' | 'error';

export type GameModeState = 'title' | 'playing' | 'paused';

export type InteractTargetKind =
  | 'merchant'
  | 'elder'
  | 'altar'
  | 'portal'
  | 'awakening'
  | 'armorer'
  | 'blacksmith'
  | 'upgrader'
  | 'signpost'
  | 'dungeon_gate'
  | 'social_board';

export interface SignpostSummary {
  title: string;
  direction: string;
  destDesc: string;
  dangerLevel: string;
}

export interface WorldRegionLabel {
  id: string;
  name: string;
  subtitle: string;
  tx: number;
  ty: number;
  kind: 'city' | 'forest' | 'water' | 'mountain' | 'plains' | 'boss' | 'dungeon';
  danger: string;
}

// ---- 联机实时社交 / 组队 / 交易 ----

export interface RemotePlayerSnapshot {
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
  partyId?: string | null;
  dungeonFloor?: number | null;
  online: boolean;
  updatedAt: number;
}

export interface FriendEntry {
  uid: string;
  name: string;
  friendCode: string;
  online: boolean;
  worldId?: WorldId;
  x?: number;
  y?: number;
  level?: number;
  classId?: ClassId;
  partyId?: string | null;
}

export interface PartyMemberInfo {
  uid: string;
  name: string;
  classId: ClassId;
  level: number;
  worldId: WorldId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  online: boolean;
}

export interface PartyState {
  id: string;
  leaderUid: string;
  expShareRatio: number; // 0..100: 队友共享比例 (队长获得其余部分)
  lootRule: 'leader_only';
  members: PartyMemberInfo[];
}

export interface TradeOffer {
  uid: string;
  gold: number;
  gear: GearItem[];
  materials: MaterialBag;
  skillBooks: SkillBookItem[];
  locked: boolean;
  confirmed: boolean;
}

export interface TradeSession {
  id: string;
  initiatorUid: string;
  targetUid: string;
  initiatorName: string;
  targetName: string;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  offers: Record<string, TradeOffer>;
}

export interface OnlineInviteNotice {
  id: string;
  kind: 'party' | 'trade' | 'friend';
  fromUid: string;
  fromName: string;
  fromFriendCode?: string;
  partyId?: string;
  tradeId?: string;
  createdAt: number;
}

export interface HudSnapshot {
  started: boolean;
  paused: boolean;
  playMode: PlayMode;
  activeSlot: SaveSlotId;
  worldId: WorldId;
  worldName: string;
  worldLevel: number;
  breakthroughTier: number;
  realmName: string;
  levelCap: number;
  atLevelCap: boolean;
  worldDifficulty: number;
  inWater: boolean;
  inSafeZone: boolean;
  classId: ClassId;
  awakened: boolean;
  hp: number;
  maxHp: number;
  shieldHp: number;
  mp: number;
  maxMp: number;
  level: number;
  exp: number;
  expNeeded: number;
  atk: number;
  def: number;
  critChance: number;
  critDmgMult: number;
  critDisabled: boolean;
  attackSpeed: number;
  mpRegen: number;
  speed: number;
  lifeOnKill: number;
  gold: number;
  potions: number;
  potionCap: number;
  kills: number;
  soulStones: number;
  cdBasic: number;
  cdSkills: [number, number, number, number];
  cdQ: number;
  cdE: number;
  cdC: number;
  cdV: number;
  skillLevels: [number, number, number, number];
  cdDash: number;
  cdPot: number;
  dungeonFloor: number | null;
  dungeonMobsRemaining: number;
  dungeonCleared: boolean;
  highestDungeonFloor: number;
  boss: {
    id?: string;
    name: string;
    title?: string;
    level: number;
    hp: number;
    maxHp: number;
    shieldHp?: number;
  } | null;
  timeOfDay: TimeOfDayInfo;
  weather: WeatherInfo;
  comboCount: number;
  comboTimerRatio: number;
  mapExploredPct?: number;
  nearInteract: InteractTargetKind | null;
  nearSignpost: SignpostSummary | null;
  muted: boolean;
  shopOpen: boolean;
  questOpen: boolean;
  inventoryOpen: boolean;
  talentOpen: boolean;
  bestiaryOpen: boolean;
  awakeningOpen: boolean;
  armorerOpen: boolean;
  blacksmithOpen: boolean;
  upgraderOpen: boolean;
  worldMapOpen: boolean;
  dungeonOpen: boolean;
  socialOpen: boolean;
  shopPrices: Record<string, number>;
  armorStock: GearItem[];
  equipped: EquippedGear;
  inventory: GearItem[];
  materials: MaterialBag;
  skillBooks: SkillBookItem[];
  activeQuest: ActiveQuestState | null;
  completedQuestCount: number;
  logs: LogEntry[];
  toastMsg: string | null;
  hasSave: boolean;
}
