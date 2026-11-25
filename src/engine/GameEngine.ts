import {
  advanceQuestProgress,
  applyDeathLevelPenalty,
  applyEliteAffixToMobStats,
  applyExpWithBreakthrough,
  applySkillBookUse,
  autoEquipBestGear,
  canAwakenClass,
  canClassEquipItem,
  canEnterDungeonFloor,
  canLearnSkillBook,
  canSpawnMobAtPosition,
  canUnlockHiddenClass,
  CLASS_DEFS,
  computeAutoAimAngle,
  computeComboImpactFeedback,
  computePlayerStats,
  consumeMaterials,
  countExploredTiles,
  CRAFT_RECIPES,
  createCraftedItem,
  createDefaultAccountData,
  createFogBitmap,
  DEATH_LEVEL_PENALTY,
  decodeFogBitmap,
  ELITE_AFFIX_DEFS,
  encodeFogBitmap,
  evaluateAchievements,
  expNeeded,
  findQuestDefById,
  generateGearItem,
  generateSkillBookItem,
  getBreakthroughCap,
  getCanvasTapInteractConfig,
  getDungeonFloorDef,
  getDungeonPartyDifficultyMultiplier,
  getEffectiveBasicCooldown,
  getEffectiveSkillCooldown,
  getGearUpgradeCost,
  getNpcInteractRadius,
  getRealmName,
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
  hasEnoughMaterials,
  isFireElementalAttack,
  MATERIAL_MAP,
  MAX_ENHANCE_LV,
  MAX_MOBS_PER_CHUNK,
  MAX_SKILL_LV,
  MIN_MOB_SPAWN_SPACING,
  MOB_CHUNK_TILES,
  pickEliteAffix,
  RARITY_META,
  resolvePartyLootRecipient,
  resolveWeatherForWorldAndTime,
  RESTRICTION_LABEL,
  revealFogCircle,
  rollDamage,
  sellJunkGear,
  SHOP_ITEMS,
  shouldApplyDeathLevelPenalty,
  SLOT_LABEL,
  splitPartyExp,
  SUBTYPE_LABEL,
  TALENT_DEFS,
  upgradeGearBatch,
  upgradeGearItem,
  WORLD_META,
} from '../game/rules';
import type {
  AccountData,
  ActiveQuestState,
  BossSkillKind,
  ClassId,
  DungeonFloorDef,
  EliteAffixId,
  EquippedGear,
  FriendEntry,
  GameSettings,
  GearItem,
  GearSlot,
  HudSnapshot,
  InteractTargetKind,
  LogEntry,
  MaterialBag,
  MaterialId,
  PartyState,
  PlayMode,
  QuestType,
  RemotePlayerSnapshot,
  SaveSlotData,
  SaveSlotId,
  ShopItemDef,
  SignpostSummary,
  SkillBookItem,
  SkillMeta,
  SkillSlotIndex,
  TalentId,
  TradeOffer,
  WeatherInfo,
  WorldId,
} from '../game/types';
import {
  getMapSyncKey,
  peerRoomClient,
  resolveMapAuthorityId,
  type EntityHitPayload,
  type PartyQuestProgressPayload,
  type RoomPlayerPayload,
  type SyncBossPayload,
  type SyncMobPayload,
  type WorldActionPayload,
  type WorldEntitiesPayload,
  type WorldKillPayload,
} from '../services/peerRoom';
import { sfx } from './audio';
import {
  MOB_TYPES,
  type AfterimageEntity,
  type BossEntity,
  type DropEntity,
  type FixedBossArena,
  type FloaterEntity,
  type MobEntity,
  type ParticleEntity,
  type PlayerEntity,
  type ProjectileEntity,
  type RemotePlayerEntity,
  type WarningEntity,
} from './entities';
import { drawMinimap, renderWorld } from './renderer';
import { ObjectPool } from './ObjectPool';
import {
  angDiff,
  blocksProjectile,
  buildTileSprites,
  clamp,
  dist,
  generateFixedWorld,
  isFree,
  isRoadAt,
  isWaterAt,
  lerp,
  moveEnt,
  rand,
  randi,
  TAU,
  tierAt,
  TILE,
  WW,
  type TileSpriteAtlas,
  type WorldData,
} from './world';

const MAX_MOBS = 26;
const MAX_ACTIVE_DROPS = 140;
const MAX_FLOATERS = 48;
const MAX_AFTERIMAGES = 32;
const PROJ_TRAIL_SLOTS = 11;
const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 4;
const COMBO_DECAY_DURATION = 4.2;

const MOB_TYPES_BY_WORLD: Record<WorldId, typeof MOB_TYPES> = {
  world1: MOB_TYPES.filter((t) => t.world === 'both' || t.world === 'world1'),
  world2: MOB_TYPES.filter((t) => t.world === 'both' || t.world === 'world2'),
  grand_city: MOB_TYPES.filter((t) => t.world === 'both' || t.world === 'grand_city'),
  dungeon: MOB_TYPES.filter((t) => t.world === 'both' || t.world === 'dungeon'),
};
const MOB_TYPE_INDEX = new Map<object, number>(MOB_TYPES.map((t, idx) => [t, idx]));
const COMMON_DROP_MATS: MaterialId[] = ['wood', 'stone', 'herb_leaf', 'copper_ore', 'iron_ore'];
const BOSS_DROP_MATS: MaterialId[] = ['dragon_scale', 'void_essence', 'titan_bone', 'mythril_ore'];

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onAccountChange: (account: AccountData, shouldCloudSync: boolean) => void;
  onHitFlash: (color: string, opacity: number) => void;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private miniCanvas: HTMLCanvasElement | null = null;
  private miniCtx: CanvasRenderingContext2D | null = null;
  private callbacks: EngineCallbacks;

  private vw = 900;
  private vh = 600;
  private dpr = 1;

  private atlas: TileSpriteAtlas;
  private worldId: WorldId = 'world1';
  private world: WorldData;
  private player: PlayerEntity;

  private account: AccountData = createDefaultAccountData();
  private activeSlot: SaveSlotId = 'slot1';
  private playMode: PlayMode = 'singleplayer';
  private playerUid = 'guest';
  private playerName = '冒险者';

  private breakthroughTier = 0;
  private hitCapNotified = false;
  private worldChestsState: Record<WorldId, string> = {
    world1: '',
    world2: '',
    grand_city: '',
    dungeon: '',
  };
  private fixedBossCooldowns: Record<string, number> = {};
  private activeFixedBossArena: FixedBossArena | null = null;
  private waterRippleTimer = 0;

  private currentDungeonFloor: number | null = null;
  private highestDungeonFloor = 0;
  private dungeonCleared = false;

  private mobs: MobEntity[] = [];
  private boss: BossEntity | null = null;
  private remotePlayers: RemotePlayerEntity[] = [];
  private friends: FriendEntry[] = [];
  private party: PartyState | null = null;
  private drops: DropEntity[] = [];
  private projectiles: ProjectileEntity[] = [];
  private particles: ParticleEntity[] = [];
  private floaters: FloaterEntity[] = [];
  private warnings: WarningEntity[] = [];
  private afterimages: AfterimageEntity[] = [];

  private cam = { x: 0, y: 0 };
  private keys: Record<string, boolean> = {};
  private mouse = { x: 0, y: 0, wx: 0, wy: 0, down: false };
  private joy = { x: 0, y: 0, active: false };
  private virtualAttackHold = false;
  private usingVirtualControls = false;
  private touchUiActive = false;
  private canvasTouchId: number | null = null;

  private started = false;
  private paused = false;
  private menuModalPaused = false;
  private gameTime = 0;
  private demoTourTime = 0;
  private camShake = 0;
  private hitstop = 0;
  private saveTimer = 5;
  private cloudSaveAccum = 0;
  private spawnTimer = 0.45;
  private miniTimer = 0;
  private hudTimer = 0;
  private netSyncTimer = 0;
  private entitySyncTimer = 0;
  private worldResetSeq = 0;
  private entityNetSeq = 1;
  private worldEntitySyncSeq = 1;
  private wasMapAuthority = true;
  private lastSyncedWorldSeqByMap = new Map<string, number>();
  private processedKillEventIds = new Set<string>();
  private processedPartyQuestEventIds = new Set<string>();
  private partyQuestEventSeq = 1;

  private weatherSeedOffset = Math.floor(Math.random() * 10000);
  private weather: WeatherInfo = resolveWeatherForWorldAndTime('world1', 0, this.weatherSeedOffset);
  private lightningFlash = 0;
  private thunderTimer = 7;

  private comboCount = 0;
  private comboTimer = 0;
  private comboGoldenMilestoneNotified = false;
  private comboVignettePulse = 0;
  private prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private fogExploredByWorld: Record<string, Uint8Array> = {};
  private fogRevision = 0;
  private lastFogTx = -999;
  private lastFogTy = -999;
  private lastFogWorldKey = '';

  private shopOpen = false;
  private questOpen = false;
  private inventoryOpen = false;
  private talentOpen = false;
  private bestiaryOpen = false;
  private awakeningOpen = false;
  private armorerOpen = false;
  private blacksmithOpen = false;
  private upgraderOpen = false;
  private worldMapOpen = false;
  private dungeonOpen = false;
  private socialOpen = false;
  private tradeModalOpen = false;
  private shopPrices: Record<string, number> = {};
  private armorStock: GearItem[] = [];

  private equipped: EquippedGear = { weapon: null, armor: null, accessory: null };
  private inventory: GearItem[] = [];
  private materials: MaterialBag = {};
  private skillBooks: SkillBookItem[] = [];
  private activeQuest: ActiveQuestState | null = null;
  private completedQuestCount = 0;

  private logs: LogEntry[] = [];
  private logSeq = 1;
  private toastMsg: string | null = null;
  private toastTimer: number | null = null;

  private rafId = 0;
  private inLoop = false;
  private loopFn: ((now: number) => void) | null = null;
  private lastTs = 0;
  private accumulator = 0;
  private destroyed = false;
  private needsPausedRender = true;
  private forceFullRedraw = true;

  private mobPool: ObjectPool<MobEntity>;
  private projectilePool: ObjectPool<ProjectileEntity>;
  private dropPool: ObjectPool<DropEntity>;
  private particlePool: ObjectPool<ParticleEntity>;
  private floaterPool: ObjectPool<FloaterEntity>;
  private warningPool: ObjectPool<WarningEntity>;
  private afterimagePool: ObjectPool<AfterimageEntity>;
  private dashHitMobs = new Set<MobEntity>();

  private onResizeBound: () => void;
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onMouseMoveBound: (e: MouseEvent) => void;
  private onMouseDownBound: (e: MouseEvent) => void;
  private onMouseUpBound: () => void;
  private onContextMenuBound: (e: MouseEvent) => void;
  private onTouchStartBound: (e: TouchEvent) => void;
  private onTouchMoveBound: (e: TouchEvent) => void;
  private onTouchEndBound: (e: TouchEvent) => void;
  private onBlurBound: () => void;
  private onBeforeUnloadBound: () => void;
  private onPageHideBound: () => void;
  private onVisibilityChangeBound: () => void;
  private onPreventGestureBound: (e: Event) => void;

  private swapRemoveAt<T>(arr: T[], idx: number): void {
    const last = arr.length - 1;
    if (idx < last) arr[idx] = arr[last];
    arr.pop();
  }

  private clearPooledEntities(): void {
    this.worldResetSeq++;
    this.mobPool.releaseAll(this.mobs);
    this.projectilePool.releaseAll(this.projectiles);
    this.dropPool.releaseAll(this.drops);
    this.particlePool.releaseAll(this.particles);
    this.floaterPool.releaseAll(this.floaters);
    this.warningPool.releaseAll(this.warnings);
    this.afterimagePool.releaseAll(this.afterimages);
    this.forceFullRedraw = true;
  }

  private releaseMobAt(idx: number): void {
    if (idx < 0 || idx >= this.mobs.length) return;
    const item = this.mobs[idx];
    if (item) this.mobPool.release(item);
    this.swapRemoveAt(this.mobs, idx);
  }

  private releaseProjectileAt(idx: number): void {
    if (idx < 0 || idx >= this.projectiles.length) return;
    const item = this.projectiles[idx];
    if (item) this.projectilePool.release(item);
    this.swapRemoveAt(this.projectiles, idx);
  }

  private releaseDropAt(idx: number): void {
    if (idx < 0 || idx >= this.drops.length) return;
    const item = this.drops[idx];
    if (item) this.dropPool.release(item);
    this.swapRemoveAt(this.drops, idx);
  }

  private nextEntityNetId(prefix: string): string {
    const idTail = (peerRoomClient.getSelfId() || this.playerUid || 'local').slice(-5);
    return `${prefix}_${idTail}_${this.entityNetSeq++}`;
  }

  private getCurrentMapKey(): string {
    return getMapSyncKey(this.worldId, this.currentDungeonFloor);
  }

  public isMapEntityAuthority(): boolean {
    if (this.playMode !== 'online' || !peerRoomClient.isConnected()) return true;
    const members = peerRoomClient.getMembers();
    const selfId = peerRoomClient.getSelfId() || this.playerUid;
    const hostId = peerRoomClient.getHostId();
    return (
      resolveMapAuthorityId(
        members,
        hostId,
        selfId,
        this.worldId,
        this.currentDungeonFloor
      ) === selfId
    );
  }

  private isInSafeZoneAt(x: number, y: number): boolean {
    return (
      this.world.safeRadius > 0 &&
      Math.hypot(x - this.world.spawnX, y - this.world.spawnY) < this.world.safeRadius
    );
  }

  private findNearestTargetTo(
    x: number,
    y: number,
    ignoreSafeZone = true
  ): { x: number; y: number; r: number; isLocal: boolean } | null {
    let best: { x: number; y: number; r: number; isLocal: boolean } | null = null;
    let bestDist = Infinity;

    const p = this.player;
    if (p.hp > 0 && (!ignoreSafeZone || !this.isInSafeZoneAt(p.x, p.y))) {
      bestDist = Math.hypot(p.x - x, p.y - y);
      best = { x: p.x, y: p.y, r: p.r, isLocal: true };
    }

    if (this.playMode === 'online') {
      for (let i = 0; i < this.remotePlayers.length; i++) {
        const rp = this.remotePlayers[i];
        if (rp.hp <= 0) continue;
        if (ignoreSafeZone && this.isInSafeZoneAt(rp.x, rp.y)) continue;
        const dd = Math.hypot(rp.x - x, rp.y - y);
        if (dd < bestDist) {
          bestDist = dd;
          best = { x: rp.x, y: rp.y, r: 16, isLocal: false };
        }
      }
    }

    return best;
  }

  private isAnyMapPlayerWithin(x: number, y: number, maxDist: number): boolean {
    if (Math.hypot(this.player.x - x, this.player.y - y) <= maxDist) return true;
    if (this.playMode === 'online') {
      for (let i = 0; i < this.remotePlayers.length; i++) {
        const rp = this.remotePlayers[i];
        if (Math.hypot(rp.x - x, rp.y - y) <= maxDist) return true;
      }
    }
    return false;
  }

  private acquireMob(
    base: (typeof MOB_TYPES)[number],
    x: number,
    y: number,
    level: number,
    maxHp: number,
    atk: number,
    exp: number,
    speed: number,
    aggro: number,
    atkCd: number,
    chargeCd: number,
    presetNetId?: string
  ): MobEntity {
    const m = this.mobPool.acquire();
    m.netId = presetNetId ?? this.nextEntityNetId('m');
    m.syncTargetX = x;
    m.syncTargetY = y;
    m.x = x;
    m.y = y;
    m.r = base.r;
    m.collR = undefined;
    m.type = base;
    m.name = base.name;
    m.color = base.color;
    m.level = level;
    m.maxHp = maxHp;
    m.hp = maxHp;
    m.atk = atk;
    m.exp = exp;
    m.speed = speed;
    m.aggro = aggro;
    m.ranged = !!base.ranged;
    m.behavior = base.behavior;
    m.trait = base.trait;
    m.atkCd = atkCd;
    m.atkSpeed = base.ranged ? 2.0 : 1.25;
    m.chargeCd = chargeCd;
    m.chargeTime = 0;
    m.chargeDir = 0;
    m.hitFlash = 0;
    m.lunge = 0;
    m.phase = Math.random() * TAU;
    m.homeX = x;
    m.homeY = y;
    m.hpBarTimer = 0;
    m.stunTimer = 0;
    m.freezeTimer = 0;
    m.knockVx = 0;
    m.knockVy = 0;
    m.isElite = false;
    m.eliteAffix = undefined;
    m.isSplitChild = false;
    this.mobs.push(m);
    return m;
  }

  private promoteMobToElite(m: MobEntity, affix: EliteAffixId): void {
    const boosted = applyEliteAffixToMobStats(
      {
        name: m.type.name,
        r: m.type.r,
        hp: m.maxHp,
        atk: m.atk,
        exp: m.exp,
        speed: m.speed,
        atkSpeed: m.atkSpeed,
      },
      affix
    );
    m.isElite = true;
    m.eliteAffix = affix;
    m.name = boosted.name;
    m.r = boosted.r;
    m.maxHp = boosted.maxHp;
    m.hp = boosted.maxHp;
    m.atk = boosted.atk;
    m.exp = boosted.exp;
    m.speed = boosted.speed;
    m.atkSpeed = boosted.atkSpeed;
  }

  private spawnProjectile(
    x: number,
    y: number,
    vx: number,
    vy: number,
    r: number,
    dmg: number,
    life: number,
    team: 'player' | 'mob',
    color: string,
    opts?: {
      explosive?: boolean;
      freezeSec?: number;
      lifestealRatio?: number;
      stunSec?: number;
      pierce?: number;
      shape?: 'orb' | 'trident' | 'crescent';
      isFire?: boolean;
    }
  ): ProjectileEntity {
    const pr = this.projectilePool.acquire();
    pr.x = x;
    pr.y = y;
    pr.vx = vx;
    pr.vy = vy;
    pr.r = r;
    pr.dmg = dmg;
    pr.life = life;
    pr.team = team;
    pr.color = color;
    pr.explosive = opts?.explosive ?? false;
    pr.freezeSec = opts?.freezeSec ?? 0;
    pr.lifestealRatio = opts?.lifestealRatio ?? 0;
    pr.stunSec = opts?.stunSec ?? 0;
    pr.pierce = opts?.pierce ?? 0;
    pr.shape = opts?.shape ?? 'orb';
    pr.isFire = opts?.isFire ?? false;
    pr.trailCursor = 0;
    pr.hitSet?.clear();
    for (let k = 0; k < pr.trail.length; k++) {
      pr.trail[k].life = 0;
    }
    this.projectiles.push(pr);
    return pr;
  }

  private spawnDrop(
    x: number,
    y: number,
    kind: DropEntity['kind'],
    amount: number,
    life: number,
    gearItem?: GearItem,
    materialId?: MaterialId,
    skillBook?: SkillBookItem
  ): DropEntity {
    if (kind === 'gold') {
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const existing = this.drops[i];
        if (existing.kind === 'gold' && Math.hypot(existing.x - x, existing.y - y) < 42) {
          existing.amount += amount;
          existing.life = Math.max(existing.life, life);
          return existing;
        }
      }
    }
    if (this.drops.length >= MAX_ACTIVE_DROPS) {
      let evictIdx = 0;
      for (let i = 0; i < this.drops.length; i++) {
        const k = this.drops[i].kind;
        if (k !== 'gear' && k !== 'skillbook' && k !== 'soulstone') {
          evictIdx = i;
          break;
        }
      }
      this.releaseDropAt(evictIdx);
    }
    const d = this.dropPool.acquire();
    d.x = x;
    d.y = y;
    d.kind = kind;
    d.amount = amount;
    d.gearItem = gearItem;
    d.materialId = materialId;
    d.skillBook = skillBook;
    d.life = life;
    d.bob = Math.random() * TAU;
    this.drops.push(d);
    return d;
  }

  private spawnWarning(x: number, y: number, r: number, life: number, color: string): void {
    const w = this.warningPool.acquire();
    w.x = x;
    w.y = y;
    w.r = r;
    w.life = life;
    w.maxLife = life;
    w.color = color;
    this.warnings.push(w);
  }

  private spawnAfterimage(x: number, y: number, r: number, facingAng: number, classId: ClassId, life: number, maxLife: number): void {
    if (this.afterimages.length >= MAX_AFTERIMAGES) {
      this.afterimagePool.release(this.afterimages[0]);
      this.swapRemoveAt(this.afterimages, 0);
    }
    const af = this.afterimagePool.acquire();
    af.x = x;
    af.y = y;
    af.r = r;
    af.facingAng = facingAng;
    af.classId = classId;
    af.life = life;
    af.maxLife = maxLife;
    this.afterimages.push(af);
  }

  private pickMobTypeForTier(worldId: WorldId, tier: number): (typeof MOB_TYPES)[number] {
    const worldPool = MOB_TYPES_BY_WORLD[worldId];
    let matchCount = 0;
    for (let i = 0; i < worldPool.length; i++) {
      if (tier >= worldPool[i].minTier) matchCount++;
    }
    if (matchCount > 0) {
      let target = Math.floor(Math.random() * matchCount);
      for (let i = 0; i < worldPool.length; i++) {
        if (tier >= worldPool[i].minTier) {
          if (target === 0) return worldPool[i];
          target--;
        }
      }
    }
    return worldPool[Math.floor(Math.random() * worldPool.length)] ?? MOB_TYPES[0];
  }

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D context unavailable');
    this.ctx = context;
    this.callbacks = callbacks;

    this.mobPool = new ObjectPool<MobEntity>(
      () => ({
        x: 0,
        y: 0,
        r: 12,
        type: MOB_TYPES[0],
        name: '',
        color: '#fff',
        level: 1,
        maxHp: 1,
        hp: 1,
        atk: 1,
        exp: 1,
        speed: 50,
        aggro: 200,
        ranged: false,
        behavior: 'chaser',
        trait: 'slime',
        atkCd: 0,
        atkSpeed: 1.25,
        chargeCd: 0,
        chargeTime: 0,
        chargeDir: 0,
        hitFlash: 0,
        lunge: 0,
        phase: 0,
        homeX: 0,
        homeY: 0,
        hpBarTimer: 0,
        stunTimer: 0,
        freezeTimer: 0,
        knockVx: 0,
        knockVy: 0,
      }),
      (m) => {
        m.netId = undefined;
        m.syncTargetX = undefined;
        m.syncTargetY = undefined;
        m.hp = 0;
        m.hitFlash = 0;
        m.hpBarTimer = 0;
        m.stunTimer = 0;
        m.freezeTimer = 0;
        m.knockVx = 0;
        m.knockVy = 0;
        m.chargeTime = 0;
        m.isElite = false;
        m.eliteAffix = undefined;
        m.isSplitChild = false;
      },
      32,
      128
    );

    this.projectilePool = new ObjectPool<ProjectileEntity>(
      () => {
        const trail: { x: number; y: number; life: number }[] = [];
        for (let i = 0; i < PROJ_TRAIL_SLOTS; i++) {
          trail.push({ x: 0, y: 0, life: 0 });
        }
        return {
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          r: 6,
          dmg: 0,
          life: 0,
          team: 'player',
          color: '#fff',
          explosive: false,
          freezeSec: 0,
          lifestealRatio: 0,
          stunSec: 0,
          pierce: 0,
          hitSet: new Set<object>(),
          shape: 'orb',
          isFire: false,
          trail,
          trailCursor: 0,
        };
      },
      (pr) => {
        pr.life = 0;
        pr.explosive = false;
        pr.freezeSec = 0;
        pr.lifestealRatio = 0;
        pr.stunSec = 0;
        pr.pierce = 0;
        pr.shape = 'orb';
        pr.isFire = false;
        pr.trailCursor = 0;
        pr.hitSet?.clear();
        for (let i = 0; i < pr.trail.length; i++) {
          pr.trail[i].life = 0;
        }
      },
      48,
      192
    );

    this.dropPool = new ObjectPool<DropEntity>(
      () => ({
        x: 0,
        y: 0,
        kind: 'gold',
        amount: 0,
        life: 0,
        bob: 0,
      }),
      (d) => {
        d.life = 0;
        d.amount = 0;
        d.gearItem = undefined;
        d.materialId = undefined;
        d.skillBook = undefined;
      },
      48,
      256
    );

    this.particlePool = new ObjectPool<ParticleEntity>(
      () => ({
        ring: false,
        kind: 'dot',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: 2,
        r0: 6,
        r1: 60,
        ang: 0,
        arc: 1.8,
        spin: 0,
        width: 10,
        life: 0,
        maxLife: 1,
        color: '#fff',
        drag: 3.2,
      }),
      (pt) => {
        pt.ring = false;
        pt.kind = 'dot';
        pt.life = 0;
        pt.vx = 0;
        pt.vy = 0;
        pt.ang = 0;
        pt.arc = 1.8;
        pt.spin = 0;
        pt.width = 10;
      },
      96,
      360
    );

    this.floaterPool = new ObjectPool<FloaterEntity>(
      () => ({
        x: 0,
        y: 0,
        text: '',
        color: '#fff',
        size: 16,
        life: 0,
        vy: -58,
        scale: 1,
      }),
      (f) => {
        f.life = 0;
        f.text = '';
      },
      32,
      80
    );

    this.warningPool = new ObjectPool<WarningEntity>(
      () => ({
        x: 0,
        y: 0,
        r: 60,
        life: 0,
        maxLife: 1,
        color: '#ef4444',
      }),
      (w) => {
        w.life = 0;
      },
      12,
      48
    );

    this.afterimagePool = new ObjectPool<AfterimageEntity>(
      () => ({
        x: 0,
        y: 0,
        r: 13,
        facingAng: 0,
        classId: 'knight',
        life: 0,
        maxLife: 0.24,
      }),
      (af) => {
        af.life = 0;
      },
      16,
      64
    );

    this.atlas = buildTileSprites();
    this.initShopPrices();
    this.world = generateFixedWorld('world1', this.atlas);
    this.player = this.createPlayer('knight');

    this.onResizeBound = () => this.resize();
    this.onKeyDownBound = (e) => this.handleKeyDown(e);
    this.onKeyUpBound = (e) => this.handleKeyUp(e);
    this.onMouseMoveBound = (e) => this.handleMouseMove(e);
    this.onMouseDownBound = (e) => this.handleMouseDown(e);
    this.onMouseUpBound = () => {
      this.mouse.down = false;
    };
    this.onContextMenuBound = (e) => e.preventDefault();
    this.onTouchStartBound = (e) => this.handleTouchStart(e);
    this.onTouchMoveBound = (e) => this.handleTouchMove(e);
    this.onTouchEndBound = (e) => this.handleTouchEnd(e);
    this.onBlurBound = () => {
      this.keys = {};
      this.mouse.down = false;
      this.joy = { x: 0, y: 0, active: false };
      this.virtualAttackHold = false;
      this.canvasTouchId = null;
      if (this.started) {
        this.saveCurrentSlot(true, false);
      }
    };
    this.onBeforeUnloadBound = () => {
      if (this.started) {
        this.saveCurrentSlot(true, false);
      }
      if (this.playMode === 'online') {
        peerRoomClient.leaveRoom(true);
      }
    };
    this.onPageHideBound = () => {
      if (this.started) {
        this.saveCurrentSlot(true, false);
      }
    };
    this.onVisibilityChangeBound = () => {
      if (document.visibilityState === 'hidden' && this.started) {
        this.saveCurrentSlot(true, false);
      }
    };
    this.onPreventGestureBound = (e) => e.preventDefault();
  }

  public setMinimapCanvas(mini: HTMLCanvasElement | null): void {
    this.miniCanvas = mini;
    this.miniCtx = mini ? mini.getContext('2d') : null;
    this.miniTimer = 0;
    if (this.miniCtx && this.started) {
      drawMinimap(
        this.miniCtx,
        this.world,
        this.player,
        this.mobs,
        this.boss,
        this.remotePlayers,
        this.ensureActiveFogBitmap(),
        this.fogRevision
      );
    }
  }

  public setTouchUiActive(active: boolean): void {
    this.touchUiActive = active;
  }

  public getWorldMapState(): {
    world: WorldData;
    playerX: number;
    playerY: number;
    playerAng: number;
    mobs: { x: number; y: number }[];
    boss: { x: number; y: number; name: string; fixedBossId: string } | null;
    bossCooldowns: Record<string, number>;
    friends: FriendEntry[];
    remotePlayers: RemotePlayerEntity[];
  } {
    return {
      world: this.world,
      playerX: this.player.x,
      playerY: this.player.y,
      playerAng: this.player.facingAng,
      mobs: this.mobs.map((m) => ({ x: m.x, y: m.y })),
      boss: this.boss
        ? {
            x: this.boss.x,
            y: this.boss.y,
            name: this.boss.name,
            fixedBossId: this.boss.fixedBossId ?? '',
          }
        : null,
      bossCooldowns: { ...this.fixedBossCooldowns },
      friends: [...this.friends],
      remotePlayers: [...this.remotePlayers],
    };
  }

  public setPlayMode(mode: PlayMode): void {
    if (this.playMode === mode) return;
    this.playMode = mode;
    if (mode === 'singleplayer') {
      this.friends = [];
      this.party = null;
      this.remotePlayers = [];
    }
    this.emitHud();
  }

  public getPlayMode(): PlayMode {
    return this.playMode;
  }

  public setIdentity(uid: string, name: string): void {
    this.playerUid = uid;
    this.playerName = name;
  }

  public setRoomMembers(members: RoomPlayerPayload[]): void {
    const existingByUid = new Map<string, RemotePlayerEntity>();
    for (let i = 0; i < this.remotePlayers.length; i++) {
      existingByUid.set(this.remotePlayers[i].uid, this.remotePlayers[i]);
    }

    const nextList: RemotePlayerEntity[] = [];
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (!m || m.id === this.playerUid) continue;
      if (m.worldId && m.worldId !== this.worldId) continue;
      if (
        this.worldId === 'dungeon' &&
        this.currentDungeonFloor !== null &&
        m.dungeonFloor &&
        m.dungeonFloor !== this.currentDungeonFloor
      ) {
        continue;
      }

      const prev = existingByUid.get(m.id);
      const hpRatio = m.maxHp > 0 ? clamp(m.hp / m.maxHp, 0, 1) : 1;
      const distJump = prev ? Math.hypot(m.x - prev.x, m.y - prev.y) : 0;
      const inParty = this.party
        ? this.party.members.some((pm) => pm.uid === m.id)
        : false;

      if (prev && distJump <= 420) {
        prev.name = m.name;
        prev.classId = m.classType;
        prev.level = m.level ?? prev.level;
        prev.worldId = m.worldId;
        prev.targetX = m.x;
        prev.targetY = m.y;
        prev.targetFacingAng = m.facingAng;
        prev.hp = m.hp;
        prev.maxHp = m.maxHp;
        prev.hpRatio = hpRatio;
        prev.isAttacking = m.isAttacking;
        prev.inParty = inParty;
        if (m.isAttacking && prev.swing <= 0) {
          prev.swingTotal = 0.24;
          prev.swing = 0.24;
        }
        nextList.push(prev);
      } else {
        nextList.push({
          uid: m.id,
          name: m.name,
          classId: m.classType,
          level: m.level ?? 1,
          worldId: m.worldId,
          x: m.x,
          y: m.y,
          targetX: m.x,
          targetY: m.y,
          facingAng: m.facingAng,
          targetFacingAng: m.facingAng,
          hp: m.hp,
          maxHp: m.maxHp,
          hpRatio,
          isAttacking: m.isAttacking,
          moving: false,
          walkPhase: prev?.walkPhase ?? 0,
          swing: m.isAttacking ? 0.24 : 0,
          swingTotal: 0.24,
          inParty,
          isFriend: false,
        });
      }
    }

    this.remotePlayers = nextList;
    if (this.started && this.playMode === 'online') {
      const nowAuthority = this.isMapEntityAuthority();
      if (!this.wasMapAuthority && nowAuthority) {
        this.wasMapAuthority = true;
        this.broadcastWorldEntitiesNow();
      } else if (this.wasMapAuthority && !nowAuthority) {
        this.wasMapAuthority = false;
        peerRoomClient.requestWorldSync(this.getCurrentMapKey());
      } else {
        this.wasMapAuthority = nowAuthority;
      }
    }
    this.needsPausedRender = true;
  }

  public setMultiplayerState(data: {
    friends?: FriendEntry[];
    party?: PartyState | null;
    allPlayers?: RemotePlayerSnapshot[];
  }): void {
    if (data.friends !== undefined) this.friends = data.friends;
    if (data.party !== undefined) {
      this.party = data.party;
      for (let i = 0; i < this.remotePlayers.length; i++) {
        const rp = this.remotePlayers[i];
        rp.inParty = data.party
          ? data.party.members.some((pm) => pm.uid === rp.uid)
          : false;
      }
      this.emitHud();
    }
    if (data.allPlayers !== undefined) {
      this.setRoomMembers(
        data.allPlayers.map((rp) => ({
          id: rp.uid,
          name: rp.name,
          classType: rp.classId,
          worldId: rp.worldId,
          dungeonFloor: rp.dungeonFloor,
          level: rp.level,
          x: rp.x,
          y: rp.y,
          facingAng: rp.facingAng,
          hp: rp.hp,
          maxHp: rp.maxHp,
          isAttacking: false,
        }))
      );
    }
  }

  public getRoomPlayerPayload(): RoomPlayerPayload {
    return {
      id: this.playerUid,
      name: this.playerName,
      classType: this.player.classId,
      worldId: this.worldId,
      dungeonFloor: this.worldId === 'dungeon' ? this.currentDungeonFloor : null,
      level: this.player.level,
      x: Math.round(this.player.x * 10) / 10,
      y: Math.round(this.player.y * 10) / 10,
      facingAng: Math.round(this.player.facingAng * 100) / 100,
      hp: Math.round(this.player.hp),
      maxHp: Math.round(this.player.maxHp),
      isAttacking: this.player.swing > 0 || this.mouse.down || this.virtualAttackHold,
    };
  }

  public getMultiplayerHelloState(): {
    worldId: WorldId;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    level: number;
    classId: ClassId;
    facingAng: number;
    dungeonFloor: number | null;
  } {
    return {
      worldId: this.worldId,
      x: Math.round(this.player.x),
      y: Math.round(this.player.y),
      hp: Math.round(this.player.hp),
      maxHp: Math.round(this.player.maxHp),
      level: this.player.level,
      classId: this.player.classId,
      facingAng: this.player.facingAng,
      dungeonFloor: this.currentDungeonFloor,
    };
  }

  public setTradeModalOpen(open: boolean): void {
    this.tradeModalOpen = open;
    this.needsPausedRender = true;
    this.emitHud();
  }

  public setAccount(nextAccount: AccountData): void {
    this.account = nextAccount;
    sfx.setSettings(nextAccount.settings);
    this.recalculateStats();
    this.emitHud();
  }

  public getAccount(): AccountData {
    return this.account;
  }

  public updateSettings(next: GameSettings): void {
    this.account = {
      ...this.account,
      settings: { ...next },
    };
    sfx.setSettings(next);
    this.callbacks.onAccountChange(this.account, true);
    this.emitHud();
  }

  public upgradeTalent(talentId: TalentId): boolean {
    const def = TALENT_DEFS.find((t) => t.id === talentId);
    if (!def) return false;
    const currentLv = this.account.talents[talentId];
    if (currentLv >= def.maxLevel) return false;
    const cost = getTalentCost(def, currentLv);
    if (this.account.soulStones < cost) return false;

    this.account = {
      ...this.account,
      soulStones: this.account.soulStones - cost,
      talents: {
        ...this.account.talents,
        [talentId]: currentLv + 1,
      },
    };
    sfx.lvl();
    this.recalculateStats();
    if (this.started) {
      this.log(`✨ 遗迹天赋【${def.name}】升至 Lv.${currentLv + 1}！`, '#a5f3fc');
      this.saveCurrentSlot(true, true);
    } else {
      this.callbacks.onAccountChange(this.account, true);
    }
    this.emitHud();
    return true;
  }

  public deleteSlot(slotId: SaveSlotId): void {
    if (this.playMode === 'online') {
      this.toast('联机模式唯一角色槽位不可删除');
      return;
    }
    this.account = {
      ...this.account,
      slots: {
        ...this.account.slots,
        [slotId]: null,
      },
    };
    this.callbacks.onAccountChange(this.account, true);
    this.emitHud();
  }

  public mount(initialAccount: AccountData, autoStartClass?: ClassId): void {
    this.account = initialAccount;
    sfx.setSettings(initialAccount.settings);
    this.resize();
    this.attachEvents();

    // Populate ambient demo world behind Main Menu
    this.cam.x = this.player.x - this.vw / 2;
    this.cam.y = this.player.y - this.vh / 2;
    for (let i = 0; i < 14; i++) this.spawnMob();

    if (autoStartClass) {
      this.startNewGame(autoStartClass, 'slot1');
    } else {
      document.body.dataset.state = 'title';
      this.emitHud();
    }

    this.lastTs = performance.now();
    this.accumulator = 0;
    const loop = (now: number) => {
      this.rafId = 0;
      if (this.destroyed) return;
      this.inLoop = true;
      let shouldContinueLoop = true;

      try {
        let frameDt = (now - this.lastTs) / 1000;
        this.lastTs = now;
        if (frameDt > 0.05) frameDt = 0.05;
        if (frameDt < 0) frameDt = 0;

        if (!this.started) {
          sfx.setSuspended(this.menuModalPaused);
          if (!this.menuModalPaused) {
            this.accumulator += frameDt;
            let steps = 0;
            while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
              this.updateDemoTour(FIXED_DT);
              this.accumulator -= FIXED_DT;
              steps++;
            }
            if (steps >= MAX_SUBSTEPS && this.accumulator > FIXED_DT) {
              this.accumulator = 0;
            }
            this.render();
            this.needsPausedRender = true;
          } else if (this.needsPausedRender) {
            this.accumulator = 0;
            this.forceFullRedraw = true;
            this.render();
            this.needsPausedRender = false;
            shouldContinueLoop = false;
          } else {
            shouldContinueLoop = false;
          }
        } else {
          const modalPaused =
            this.paused ||
            this.shopOpen ||
            this.questOpen ||
            this.inventoryOpen ||
            this.talentOpen ||
            this.bestiaryOpen ||
            this.awakeningOpen ||
            this.armorerOpen ||
            this.blacksmithOpen ||
            this.upgraderOpen ||
            this.worldMapOpen ||
            this.dungeonOpen ||
            this.socialOpen ||
            this.tradeModalOpen;

          sfx.setSuspended(modalPaused);

          if (!modalPaused) {
            this.accumulator += frameDt;
            let steps = 0;
            while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
              if (this.hitstop > 0) {
                this.hitstop = Math.max(0, this.hitstop - FIXED_DT);
                this.camShake = Math.max(0, this.camShake - FIXED_DT * 26);
                this.gameTime += FIXED_DT;
              } else {
                this.update(FIXED_DT);
              }
              this.accumulator -= FIXED_DT;
              steps++;
            }
            if (steps >= MAX_SUBSTEPS && this.accumulator > FIXED_DT) {
              this.accumulator = 0;
            }

            this.hudTimer -= frameDt;
            if (this.hudTimer <= 0) {
              this.hudTimer = 0.18;
              this.emitHud();
            }
            this.needsPausedRender = true;
          } else {
            this.accumulator = 0;
          }

          if (!modalPaused || this.needsPausedRender) {
            if (modalPaused) this.forceFullRedraw = true;
            this.render();
            if (this.miniCtx) {
              this.miniTimer -= frameDt;
              if (this.miniTimer <= 0 || modalPaused) {
                this.miniTimer = 0.18;
                drawMinimap(
                  this.miniCtx,
                  this.world,
                  this.player,
                  this.mobs,
                  this.boss,
                  this.remotePlayers,
                  this.ensureActiveFogBitmap(),
                  this.fogRevision
                );
              }
            }
            if (modalPaused) {
              this.needsPausedRender = false;
              shouldContinueLoop = false;
            }
          } else if (modalPaused) {
            shouldContinueLoop = false;
          }
        }
      } finally {
        this.inLoop = false;
      }

      if (shouldContinueLoop && !this.destroyed && this.rafId === 0) {
        this.rafId = requestAnimationFrame(loop);
      }
    };
    this.loopFn = loop;
    this.rafId = requestAnimationFrame(loop);
  }

  private wakeLoop(): void {
    if (!this.destroyed && !this.inLoop && this.rafId === 0 && this.loopFn) {
      this.lastTs = performance.now();
      this.accumulator = 0;
      this.rafId = requestAnimationFrame(this.loopFn);
    }
  }

  private updateDemoTour(dt: number): void {
    this.demoTourTime += dt;
    this.gameTime += dt * 1.4; // gently showcase day/dusk/night lighting in background
    this.updateWeather(dt, false);

    const wPx = this.world.width * TILE;
    const hPx = this.world.height * TILE;
    const centerX = wPx / 2;
    const centerY = hPx / 2;
    const targetX = centerX + Math.sin(this.demoTourTime * 0.14) * 520 - this.vw / 2;
    const targetY = centerY + Math.cos(this.demoTourTime * 0.11) * 420 - this.vh / 2;
    this.cam.x = clamp(targetX, 0, Math.max(0, wPx - this.vw));
    this.cam.y = clamp(targetY, 0, Math.max(0, hPx - this.vh));

    for (const m of this.mobs) {
      m.phase += dt * 2.4;
      const a = m.phase * 0.28;
      moveEnt(this.world.tiles, m, Math.cos(a) * m.speed * 0.18 * dt, Math.sin(a) * m.speed * 0.18 * dt);
    }
  }

  public destroy(): void {
    if (this.started) {
      this.saveCurrentSlot(true, false);
    }
    this.destroyed = true;
    sfx.setSuspended(true);
    cancelAnimationFrame(this.rafId);
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.detachEvents();
  }

  private attachEvents(): void {
    window.addEventListener('resize', this.onResizeBound);
    window.addEventListener('orientationchange', this.onResizeBound);
    window.visualViewport?.addEventListener('resize', this.onResizeBound);
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('mouseup', this.onMouseUpBound);
    window.addEventListener('blur', this.onBlurBound);
    window.addEventListener('beforeunload', this.onBeforeUnloadBound);
    window.addEventListener('pagehide', this.onPageHideBound);
    document.addEventListener('visibilitychange', this.onVisibilityChangeBound);
    document.addEventListener('gesturestart', this.onPreventGestureBound);
    document.addEventListener('gesturechange', this.onPreventGestureBound);
    this.canvas.addEventListener('mousemove', this.onMouseMoveBound);
    this.canvas.addEventListener('mousedown', this.onMouseDownBound);
    this.canvas.addEventListener('contextmenu', this.onContextMenuBound);
    this.canvas.addEventListener('touchstart', this.onTouchStartBound, { passive: false });
    this.canvas.addEventListener('touchmove', this.onTouchMoveBound, { passive: false });
    this.canvas.addEventListener('touchend', this.onTouchEndBound, { passive: false });
    this.canvas.addEventListener('touchcancel', this.onTouchEndBound, { passive: false });
  }

  private detachEvents(): void {
    window.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('orientationchange', this.onResizeBound);
    window.visualViewport?.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('mouseup', this.onMouseUpBound);
    window.removeEventListener('blur', this.onBlurBound);
    window.removeEventListener('beforeunload', this.onBeforeUnloadBound);
    window.removeEventListener('pagehide', this.onPageHideBound);
    document.removeEventListener('visibilitychange', this.onVisibilityChangeBound);
    document.removeEventListener('gesturestart', this.onPreventGestureBound);
    document.removeEventListener('gesturechange', this.onPreventGestureBound);
    this.canvas.removeEventListener('mousemove', this.onMouseMoveBound);
    this.canvas.removeEventListener('mousedown', this.onMouseDownBound);
    this.canvas.removeEventListener('contextmenu', this.onContextMenuBound);
    this.canvas.removeEventListener('touchstart', this.onTouchStartBound);
    this.canvas.removeEventListener('touchmove', this.onTouchMoveBound);
    this.canvas.removeEventListener('touchend', this.onTouchEndBound);
    this.canvas.removeEventListener('touchcancel', this.onTouchEndBound);
  }

  public resize(): void {
    this.vw = Math.max(1, Math.round(window.innerWidth || 900));
    this.vh = Math.max(1, Math.round(window.innerHeight || 600));
    const area = this.vw * this.vh;
    const maxDpr = area > 950_000 ? 1.25 : 1.5;
    this.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.canvas.width = Math.max(1, Math.floor(this.vw * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(this.vh * this.dpr));
    this.canvas.style.width = `${this.vw}px`;
    this.canvas.style.height = `${this.vh}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.needsPausedRender = true;
    this.forceFullRedraw = true;
    this.wakeLoop();
  }

  private initShopPrices(): void {
    this.shopPrices = {};
    SHOP_ITEMS.forEach((it) => {
      this.shopPrices[it.id] = it.base;
    });
  }

  private createPlayer(classId: ClassId): PlayerEntity {
    const def = CLASS_DEFS[classId];
    const cx = this.world?.spawnX ?? (WW >> 1) * TILE + TILE / 2;
    const cy = this.world?.spawnY ?? (WW >> 1) * TILE + TILE / 2;
    return {
      classId,
      awakened: classId !== 'novice',
      x: cx,
      y: cy,
      r: 13,
      hp: def.baseHp,
      maxHp: def.baseHp,
      mp: def.baseMp,
      maxMp: def.baseMp,
      level: 1,
      exp: 0,
      baseMaxHp: def.baseHp,
      baseMaxMp: def.baseMp,
      baseAtk: def.baseAtk,
      baseDef: def.baseDef,
      baseSpeed: def.baseSpeed,
      baseCrit: def.baseCrit,
      atk: def.baseAtk,
      def: def.baseDef,
      speed: def.baseSpeed,
      attackSpeed: def.baseAttackSpeed ?? 100,
      critChance: def.critDisabled ? 0 : def.baseCrit,
      critDmgMult: def.critDisabled ? 1 : (def.baseCritDmg ?? 190) / 100,
      critDisabled: Boolean(def.critDisabled),
      mpRegen: def.baseMpRegen ?? 4.5,
      goldMult: 1,
      potionCap: 5,
      potionHealBonus: 0,
      lifeOnKill: 0,
      facingAng: Math.PI / 2,
      attackCd: 0,
      swing: 0,
      swingTotal: 0.24,
      skillQCd: 0,
      skillECd: 0,
      skillCds: [0, 0, 0, 0],
      skillLevels: [1, 1, 1, 1],
      shieldHp: 0,
      shieldTimer: 0,
      slowTimer: 0,
      stunTimer: 0,
      dashCd: 0,
      dashTime: 0,
      dashVx: 0,
      dashVy: 0,
      potCd: 0,
      invuln: 0,
      gold: 0,
      potions: 2 + this.account.talents.potCapLv,
      kills: 0,
      moving: false,
      walkPhase: 0,
      cloak: 0,
      hurtFlash: 0,
    };
  }

  private recalculateStats(): void {
    const p = this.player;
    const computed = computePlayerStats(
      {
        maxHp: p.baseMaxHp,
        maxMp: p.baseMaxMp,
        atk: p.baseAtk,
        def: p.baseDef,
        speed: p.baseSpeed,
        critChance: p.baseCrit,
      },
      this.equipped,
      this.account.talents,
      this.account.unlockedAchievements,
      p.classId
    );
    p.maxHp = computed.maxHp;
    p.maxMp = computed.maxMp;
    p.atk = computed.atk;
    p.def = computed.def;
    p.speed = computed.speed;
    p.attackSpeed = computed.attackSpeed;
    p.critChance = computed.critChance;
    p.critDmgMult = computed.critDmgMult;
    p.critDisabled = computed.critDisabled;
    p.mpRegen = computed.mpRegen;
    p.goldMult = computed.goldMult;
    p.potionCap = computed.potionCap;
    p.potionHealBonus = computed.potionHealBonus;
    p.lifeOnKill = computed.lifeOnKill;
    if (p.hp > p.maxHp) p.hp = p.maxHp;
    if (p.mp > p.maxMp) p.mp = p.maxMp;
  }

  public startNewGame(classId: ClassId = 'novice', slotId: SaveSlotId = 'slot1'): void {
    sfx.ensure();
    this.activeSlot = this.playMode === 'online' ? 'slot1' : slotId;
    this.worldId = 'world1';
    this.breakthroughTier = 0;
    this.hitCapNotified = false;
    this.worldChestsState = { world1: '', world2: '', grand_city: '', dungeon: '' };
    this.fixedBossCooldowns = {};
    this.activeFixedBossArena = null;
    this.currentDungeonFloor = null;
    this.highestDungeonFloor = 0;
    this.dungeonCleared = false;
    this.world = generateFixedWorld('world1', this.atlas, {
      expandedOnline: this.playMode === 'online',
    });
    this.initShopPrices();
    this.equipped = { weapon: null, armor: null, accessory: null };
    this.inventory = [];
    this.materials = {};
    this.skillBooks = [];
    this.activeQuest = null;
    this.completedQuestCount = 0;
    this.clearPooledEntities();
    this.boss = null;
    this.accumulator = 0;
    this.gameTime = 0;
    this.lightningFlash = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.comboGoldenMilestoneNotified = false;
    this.comboVignettePulse = 0;
    this.fogExploredByWorld = {};
    this.fogRevision++;
    this.lastFogTx = -999;
    this.lastFogTy = -999;
    this.lastFogWorldKey = '';
    this.syncWeatherForWorldAndTime(false);
    this.saveTimer = 5;
    this.cloudSaveAccum = 0;
    this.logs = [];
    this.player = this.createPlayer(classId);
    this.player.awakened = classId !== 'novice';

    const cls = CLASS_DEFS[classId];
    const starterWeapon = generateGearItem(1, {
      forceRarity: 'common',
      forceSlot: 'weapon',
      forClassId: classId,
    });
    starterWeapon.name =
      classId === 'novice'
        ? '见习短剑'
        : cls.archetype === 'mage'
        ? '学徒法杖'
        : cls.archetype === 'healer'
        ? '见习圣杖'
        : cls.archetype === 'archer'
        ? '猎手短弓'
        : cls.archetype === 'assassin'
        ? '影卫短刃'
        : '新兵武器';
    this.equipped.weapon = starterWeapon;
    this.recalculateStats();
    this.player.hp = this.player.maxHp;
    this.player.mp = this.player.maxMp;
    this.refreshArmorStock(true);
    this.updatePlayerFogReveal(true);

    this.cam.x = this.player.x - this.vw / 2;
    this.cam.y = this.player.y - this.vh / 2;
    const isAuth = this.isMapEntityAuthority();
    this.wasMapAuthority = isAuth;
    if (isAuth) {
      for (let i = 0; i < 14; i++) this.spawnMob();
    } else {
      peerRoomClient.requestWorldSync(this.getCurrentMapKey());
    }

    this.started = true;
    this.paused = false;
    this.closeAllSubModals();
    this.keys = {};
    this.mouse.down = false;
    document.body.dataset.state = 'playing';

    this.log(
      this.playMode === 'online'
        ? `🌐 多人联机（房间模式）：【${this.playerName}】以【${cls.name}】开启专属联机档案（仅存 1 份，与单机严格隔离）！`
        : `🌍 存档槽位 ${slotId.slice(-1)}（单机模式）：以【${cls.name}】抵达【晨曦圣城】！`,
      '#7dd3fc'
    );
    if (!this.player.awakened) {
      this.log('✨ 请前往主城西北方【觉醒导师】处觉醒（五大体系 · 40 种进阶职业，选定后永久锁定）！', '#fde047');
    }
    this.log('所有职业配备 4 大技能（Q / E / C / V），可通过副本与首领掉落技能书升级！', '#94a3b8');
    this.saveCurrentSlot(true, true);
    this.emitHud();
  }

  public loadGameFromSlot(slotId: SaveSlotId): boolean {
    sfx.ensure();
    const resolvedSlotId: SaveSlotId = this.playMode === 'online' ? 'slot1' : slotId;
    const slot = this.account.slots[resolvedSlotId];
    if (!slot) return false;

    this.activeSlot = resolvedSlotId;
    const rawWorld = slot.worldId;
    this.worldId =
      rawWorld === 'world2'
        ? 'world2'
        : rawWorld === 'grand_city' || rawWorld === 'dungeon'
        ? 'grand_city'
        : 'world1';
    this.breakthroughTier = Math.max(0, slot.breakthroughTier ?? Math.floor((slot.level - 1) / 10));
    this.hitCapNotified = false;
    this.fixedBossCooldowns = {};
    this.activeFixedBossArena = null;
    this.currentDungeonFloor = null;
    this.highestDungeonFloor = slot.highestDungeonFloor ?? 0;
    this.dungeonCleared = false;
    this.worldChestsState = {
      world1: typeof slot.chests === 'string' ? slot.chests : '',
      world2: typeof slot.world2Chests === 'string' ? slot.world2Chests : '',
      grand_city: typeof slot.grandCityChests === 'string' ? slot.grandCityChests : '',
      dungeon: '',
    };
    this.world = generateFixedWorld(this.worldId, this.atlas, {
      expandedOnline: this.playMode === 'online',
    });
    this.initShopPrices();
    this.player = this.createPlayer(slot.classId);
    this.player.awakened = typeof slot.awakened === 'boolean' ? slot.awakened : slot.classId !== 'novice';
    this.player.level = slot.level;
    this.player.exp = slot.exp;
    this.player.gold = slot.gold;
    this.player.potions = slot.potions;
    this.player.kills = slot.kills;
    if (Array.isArray(slot.skillLevels) && slot.skillLevels.length === 4) {
      this.player.skillLevels = [...slot.skillLevels] as [number, number, number, number];
    }
    Object.assign(this.player, slot.player);
    // Ensure saved coordinates are safely walkable in the fixed map
    if (rawWorld === 'dungeon' || !isFree(this.world.tiles, this.player.x, this.player.y, this.player.r)) {
      this.player.x = this.world.spawnX;
      this.player.y = this.world.spawnY;
    }
    this.player.facingAng = Math.PI / 2;

    const chestStr = this.worldChestsState[this.worldId];
    if (chestStr) {
      for (let i = 0; i < this.world.chests.length && i < chestStr.length; i++) {
        this.world.chests[i].opened = chestStr[i] === '1';
      }
    }
    if (slot.prices) {
      for (const k in slot.prices) {
        if (isFinite(slot.prices[k])) this.shopPrices[k] = slot.prices[k];
      }
    }
    this.equipped = slot.equipped || { weapon: null, armor: null, accessory: null };
    this.inventory = Array.isArray(slot.inventory) ? [...slot.inventory] : [];
    this.materials = slot.materials ? { ...slot.materials } : {};
    this.skillBooks = Array.isArray(slot.skillBooks) ? [...slot.skillBooks] : [];
    this.activeQuest = slot.activeQuest || null;
    this.completedQuestCount = slot.completedQuestCount || 0;
    this.gameTime = slot.time || 0;
    this.lightningFlash = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.comboGoldenMilestoneNotified = false;
    this.comboVignettePulse = 0;
    this.fogExploredByWorld = {};
    if (slot.fogExplored) {
      const isOnline = this.playMode === 'online';
      for (const wid of ['world1', 'world2', 'grand_city'] as const) {
        const enc = slot.fogExplored[wid];
        if (enc) {
          const dims = this.getWorldFogDim(wid, isOnline);
          this.fogExploredByWorld[`${wid}:${dims}x${dims}:0`] = decodeFogBitmap(enc, dims, dims);
        }
      }
    }
    this.fogRevision++;
    this.lastFogTx = -999;
    this.lastFogTy = -999;
    this.lastFogWorldKey = '';
    this.syncWeatherForWorldAndTime(false);

    this.recalculateStats();
    this.refreshArmorStock(true);
    this.clearPooledEntities();
    this.boss = null;
    this.accumulator = 0;
    this.updatePlayerFogReveal(true);
    this.cam.x = this.player.x - this.vw / 2;
    this.cam.y = this.player.y - this.vh / 2;
    const isAuth = this.isMapEntityAuthority();
    this.wasMapAuthority = isAuth;
    if (isAuth) {
      for (let i = 0; i < 14; i++) this.spawnMob();
    } else {
      peerRoomClient.requestWorldSync(this.getCurrentMapKey());
    }

    this.started = true;
    this.paused = false;
    this.saveTimer = 5;
    this.cloudSaveAccum = 0;
    this.closeAllSubModals();
    this.keys = {};
    this.mouse.down = false;
    document.body.dataset.state = 'playing';
    this.log(`💾 已读取存档槽位 ${slotId.slice(-1)}（${WORLD_META[this.worldId].name}），欢迎回归！`, '#7dd3fc');
    this.emitHud();
    return true;
  }

  public saveCurrentSlot(silent = false, shouldCloudSync = true): void {
    if (!this.started) return;
    const isOnline = this.playMode === 'online';
    const targetSlot: SaveSlotId = isOnline ? 'slot1' : this.activeSlot;
    this.activeSlot = targetSlot;

    const p = this.player;
    if (this.worldId !== 'dungeon') {
      const currentChestBits = this.world.chests.map((c) => (c.opened ? 1 : 0)).join('');
      this.worldChestsState[this.worldId] = currentChestBits;
    }
    const saveWorldId: WorldId = this.worldId === 'dungeon' ? 'grand_city' : this.worldId;
    const saveX = this.worldId === 'dungeon' ? 105 * TILE : Math.round(p.x * 10) / 10;
    const saveY = this.worldId === 'dungeon' ? 85 * TILE : Math.round(p.y * 10) / 10;

    const slotData: SaveSlotData = {
      slotId: targetSlot,
      seed: this.world.seed,
      worldId: saveWorldId,
      breakthroughTier: this.breakthroughTier,
      classId: p.classId,
      awakened: p.awakened,
      level: p.level,
      exp: p.exp,
      gold: p.gold,
      potions: p.potions,
      kills: p.kills,
      player: {
        x: saveX,
        y: saveY,
        hp: Math.round(p.hp * 10) / 10,
        mp: Math.round(p.mp * 10) / 10,
        baseMaxHp: p.baseMaxHp,
        baseMaxMp: p.baseMaxMp,
        baseAtk: p.baseAtk,
        baseDef: p.baseDef,
        baseSpeed: p.baseSpeed,
        baseCrit: p.baseCrit,
      },
      chests: this.worldChestsState.world1,
      world2Chests: this.worldChestsState.world2,
      grandCityChests: this.worldChestsState.grand_city,
      prices: { ...this.shopPrices },
      equipped: { ...this.equipped },
      inventory: [...this.inventory],
      materials: { ...this.materials },
      skillLevels: [...p.skillLevels] as [number, number, number, number],
      skillBooks: [...this.skillBooks],
      highestDungeonFloor: this.highestDungeonFloor,
      fogExplored: this.exportWorldFogMap(),
      activeQuest: this.activeQuest ? { ...this.activeQuest } : null,
      completedQuestCount: this.completedQuestCount,
      time: Math.round(this.gameTime * 10) / 10,
      updatedAt: Date.now(),
    };

    this.account = {
      ...this.account,
      displayName: this.playerName || this.account.displayName,
      mode: this.playMode,
      slots: isOnline
        ? {
            slot1: slotData,
            slot2: null,
            slot3: null,
          }
        : {
            ...this.account.slots,
            [targetSlot]: slotData,
          },
    };
    this.callbacks.onAccountChange(this.account, shouldCloudSync);

    if (!silent) {
      this.toast(isOnline ? '联机角色资料已保存' : '单机存档已保存');
      this.log(
        isOnline
          ? '💾 联机专属角色资料（唯一槽位）已加密保存，与单机完全隔离。'
          : '💾 单机角色存档与账号进度已保存。',
        '#7dd3fc'
      );
      this.emitHud();
    }
  }

  public returnToMainMenu(): void {
    if (this.started) {
      this.saveCurrentSlot(true, true);
    }
    if (this.playMode === 'online') {
      peerRoomClient.leaveRoom();
      this.remotePlayers = [];
      this.party = null;
    }
    this.started = false;
    this.paused = false;
    this.closeAllSubModals();
    this.boss = null;
    this.keys = {};
    this.mouse.down = false;
    document.body.dataset.state = 'title';
    this.emitHud();
  }

  public setPaused(val: boolean): void {
    if (!this.started) return;
    this.paused = val;
    if (val) {
      this.closeAllSubModals();
      this.keys = {};
      this.mouse.down = false;
      this.joy = { x: 0, y: 0, active: false };
      this.virtualAttackHold = false;
      this.canvasTouchId = null;
      document.body.dataset.state = 'paused';
    } else {
      document.body.dataset.state = 'playing';
    }
    this.needsPausedRender = true;
    this.forceFullRedraw = true;
    this.accumulator = 0;
    this.emitHud();
  }

  public setJoystickVector(x: number, y: number): void {
    const active = Math.hypot(x, y) > 0.01;
    if (active) {
      this.usingVirtualControls = true;
    }
    this.joy = { x, y, active };
  }

  public setVirtualAttackHold(held: boolean): void {
    if (!this.started || this.paused) {
      this.virtualAttackHold = false;
      return;
    }
    if (held) {
      sfx.ensure();
      this.usingVirtualControls = true;
      if (!this.isAnySubModalOpen()) {
        this.virtualAttackHold = true;
        this.playerAttack('virtual');
      }
    } else {
      this.virtualAttackHold = false;
    }
  }

  public setMenuModalPaused(val: boolean): void {
    this.menuModalPaused = val;
    this.needsPausedRender = true;
    this.forceFullRedraw = true;
    this.accumulator = 0;
    this.wakeLoop();
  }

  public toggleMute(): void {
    sfx.ensure();
    const muted = sfx.toggleMute();
    this.account = {
      ...this.account,
      settings: { ...this.account.settings, muted },
    };
    this.callbacks.onAccountChange(this.account, true);
    this.log(muted ? '🔇 已静音音效' : '🔊 已开启音效', '#94a3b8');
    this.emitHud();
  }

  public interact(): void {
    if (!this.started || this.paused) return;
    sfx.ensure();
    this.handleInteract();
  }

  public toggleInventory(force?: boolean): void {
    if (!this.started || this.paused) return;
    const next = force !== undefined ? force : !this.inventoryOpen;
    this.closeAllSubModals();
    this.inventoryOpen = next;
    if (next) {
      this.keys = {};
      this.mouse.down = false;
    }
    this.needsPausedRender = true;
    this.emitHud();
  }

  public openTalentModal(force = true): void {
    if (!this.started) return;
    this.closeAllSubModals();
    this.talentOpen = force;
    if (force) {
      this.keys = {};
      this.mouse.down = false;
    }
    this.needsPausedRender = true;
    this.emitHud();
  }

  public openBestiaryModal(force = true): void {
    if (!this.started) return;
    this.closeAllSubModals();
    this.bestiaryOpen = force;
    if (force) {
      this.keys = {};
      this.mouse.down = false;
    }
    this.needsPausedRender = true;
    this.emitHud();
  }

  public toggleWorldMap(force?: boolean): void {
    if (!this.started || this.paused) return;
    const next = force !== undefined ? force : !this.worldMapOpen;
    this.closeAllSubModals();
    this.worldMapOpen = next;
    if (next) {
      this.keys = {};
      this.mouse.down = false;
      this.joy = { x: 0, y: 0, active: false };
      this.virtualAttackHold = false;
    }
    this.needsPausedRender = true;
    this.emitHud();
  }

  public openDungeonModal(force = true): void {
    if (!this.started || this.paused) return;
    this.closeAllSubModals();
    this.dungeonOpen = force;
    if (force) {
      this.keys = {};
      this.mouse.down = false;
      this.joy = { x: 0, y: 0, active: false };
      this.virtualAttackHold = false;
    }
    this.needsPausedRender = true;
    this.emitHud();
  }

  public openSocialModal(force = true): void {
    if (!this.started || this.paused) return;
    this.closeAllSubModals();
    this.socialOpen = force;
    if (force) {
      this.keys = {};
      this.mouse.down = false;
      this.joy = { x: 0, y: 0, active: false };
      this.virtualAttackHold = false;
    }
    this.needsPausedRender = true;
    this.emitHud();
  }

  private isAnySubModalOpen(): boolean {
    return (
      this.shopOpen ||
      this.questOpen ||
      this.inventoryOpen ||
      this.talentOpen ||
      this.bestiaryOpen ||
      this.awakeningOpen ||
      this.armorerOpen ||
      this.blacksmithOpen ||
      this.upgraderOpen ||
      this.worldMapOpen ||
      this.dungeonOpen ||
      this.socialOpen ||
      this.tradeModalOpen
    );
  }

  private closeAllSubModals(): void {
    this.shopOpen = false;
    this.questOpen = false;
    this.inventoryOpen = false;
    this.talentOpen = false;
    this.bestiaryOpen = false;
    this.awakeningOpen = false;
    this.armorerOpen = false;
    this.blacksmithOpen = false;
    this.upgraderOpen = false;
    this.worldMapOpen = false;
    this.dungeonOpen = false;
    this.socialOpen = false;
  }

  public closeAllModals(): void {
    this.closeAllSubModals();
    this.keys = {};
    this.mouse.down = false;
    this.needsPausedRender = true;
    this.forceFullRedraw = true;
    this.accumulator = 0;
    this.emitHud();
  }

  public awakenClass(classId: ClassId): boolean {
    if (classId === 'novice') return false;
    const p = this.player;
    const lockCheck = canAwakenClass(p.classId, p.awakened);
    if (!lockCheck.allowed) {
      this.toast(lockCheck.reason || '职业选定后不可更换');
      this.log(`⛔ ${lockCheck.reason}`, '#f87171');
      return false;
    }
    const def = CLASS_DEFS[classId];
    if (def.isHidden && !canUnlockHiddenClass(p.level, p.kills, this.account.soulStones)) {
      this.toast(`未满足隐藏职业【${def.name}】觉醒条件（需角色等级达到 Lv.30，当前 Lv.${p.level}）！`);
      return false;
    }

    const extraLv = Math.max(0, p.level - 1);
    p.classId = classId;
    p.awakened = true;
    p.baseMaxHp = def.baseHp + extraLv * def.hpPerLv;
    p.baseMaxMp = def.baseMp + extraLv * def.mpPerLv;
    p.baseAtk = def.baseAtk + extraLv * def.atkPerLv + this.breakthroughTier * 4;
    p.baseDef = def.baseDef + extraLv * def.defPerLv + this.breakthroughTier * 2;
    p.baseSpeed = def.baseSpeed + extraLv * def.speedPerLv;
    p.baseCrit = def.critDisabled ? 0 : def.baseCrit;

    // 卸下新职业不再兼容的已穿戴装备到背包
    (['weapon', 'armor', 'accessory'] as GearSlot[]).forEach((slot) => {
      const eq = this.equipped[slot];
      if (eq && !canClassEquipItem(classId, eq)) {
        this.inventory.push(eq);
        this.equipped[slot] = null;
      }
    });

    if (!this.equipped.weapon) {
      const starter = generateGearItem(Math.max(1, p.level), {
        forceRarity: 'rare',
        forceSlot: 'weapon',
        forClassId: classId,
      });
      this.equipped.weapon = starter;
    }

    this.recalculateStats();
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    this.refreshArmorStock(true);
    this.closeAllSubModals();

    sfx.lvl();
    this.burst(p.x, p.y, def.accentColor, 42, 320);
    this.ring(p.x, p.y, '#fde047', 12, 160, 0.75);
    this.toast(`职业觉醒：【${def.name}】！`);
    this.log(`✨ 觉醒成功！你已正式转职为【${def.name}】（${def.title}）！`, def.accentColor);
    this.saveCurrentSlot(true, true);
    this.emitHud();
    return true;
  }

  public refreshArmorStock(silent = false): void {
    const lv = Math.max(1, this.player.level);
    const items: GearItem[] = [
      generateGearItem(lv, { forceSlot: 'weapon', forClassId: this.player.classId, minRarity: 'rare' }),
      generateGearItem(lv, { forceSlot: 'armor', forClassId: this.player.classId }),
      generateGearItem(lv, { forceSlot: 'weapon', forceSubtype: 'staff' }),
      generateGearItem(lv, { forceSlot: 'weapon', forceSubtype: 'bow' }),
      generateGearItem(lv, { forceSlot: 'weapon', forceSubtype: 'sword' }),
      generateGearItem(lv, { forceSlot: 'accessory', minRarity: 'rare' }),
    ];
    this.armorStock = items;
    if (!silent) {
      sfx.coin();
      this.log('🛡️ 军械商人刷新了一批新装备货架。', '#7dd3fc');
      this.emitHud();
    }
  }

  public buyArmorShopItem(itemId: string): boolean {
    const idx = this.armorStock.findIndex((i) => i.id === itemId);
    if (idx < 0) return false;
    const item = this.armorStock[idx];
    const price = Math.max(45, Math.round(item.sellValue * 2.4));
    if (this.player.gold < price) {
      this.toast('金币不足！');
      return false;
    }
    this.player.gold -= price;
    this.armorStock.splice(idx, 1);
    this.inventory.push(item);
    const rm = RARITY_META[item.rarity];
    this.recordMetaProgress({
      _bestRarity: Math.max(this.account.bestiary._bestRarity ?? 1, rm.rank),
    });
    sfx.buy();
    this.log(`🛡️ 购买装备：[${rm.label}] ${item.name}（-${price} 金币）`, rm.color);
    this.saveCurrentSlot(true, true);
    this.emitHud();
    return true;
  }

  public craftRecipe(recipeId: string): boolean {
    const recipe = CRAFT_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return false;
    if (this.player.gold < recipe.goldCost) {
      this.toast('锻造金币不足！');
      return false;
    }
    if (!hasEnoughMaterials(this.materials, recipe.materials)) {
      this.toast('锻造原料不足！');
      return false;
    }
    this.player.gold -= recipe.goldCost;
    this.materials = consumeMaterials(this.materials, recipe.materials);
    const crafted = createCraftedItem(recipe);
    this.inventory.push(crafted);
    const rm = RARITY_META[crafted.rarity];
    this.recordMetaProgress({
      _bestRarity: Math.max(this.account.bestiary._bestRarity ?? 1, rm.rank),
    });
    sfx.lvl();
    this.burst(this.player.x, this.player.y, rm.color, 24, 220);
    this.toast(`打造成功：${crafted.name}`);
    this.log(`⚒️ 铁匠打造完成：[${rm.label}] ${crafted.name}（已放入背包）`, rm.color);
    this.saveCurrentSlot(true, true);
    this.emitHud();
    return true;
  }

  public upgradeGear(itemId: string, source: 'equipped' | 'inventory'): boolean {
    let target: GearItem | null = null;
    let equippedSlot: GearSlot | null = null;
    let invIdx = -1;

    if (source === 'equipped') {
      for (const s of ['weapon', 'armor', 'accessory'] as GearSlot[]) {
        if (this.equipped[s]?.id === itemId) {
          target = this.equipped[s];
          equippedSlot = s;
          break;
        }
      }
    } else {
      invIdx = this.inventory.findIndex((it) => it.id === itemId);
      if (invIdx >= 0) target = this.inventory[invIdx];
    }

    if (!target) return false;
    const cost = getGearUpgradeCost(target);
    if (!cost.canUpgrade) {
      this.toast(`已达到最高强化等级 +${MAX_ENHANCE_LV}！`);
      return false;
    }
    if (this.player.gold < cost.gold) {
      this.toast('强化金币不足！');
      return false;
    }
    if (!hasEnoughMaterials(this.materials, cost.materials)) {
      this.toast('强化矿石原料不足！');
      return false;
    }

    this.player.gold -= cost.gold;
    this.materials = consumeMaterials(this.materials, cost.materials);
    const upgraded = upgradeGearItem(target);
    if (source === 'equipped' && equippedSlot) {
      this.equipped[equippedSlot] = upgraded;
      this.recalculateStats();
    } else if (invIdx >= 0) {
      this.inventory[invIdx] = upgraded;
    }

    sfx.equip();
    this.toast(`强化成功：${upgraded.name}`);
    this.log(`✨ 装备升级：【${upgraded.name}】属性已提升！`, RARITY_META[upgraded.rarity].color);
    this.saveCurrentSlot(true, true);
    this.emitHud();
    return true;
  }

  public upgradeGearBatchAction(
    itemId: string,
    source: 'equipped' | 'inventory',
    steps = 10
  ): number {
    let target: GearItem | null = null;
    let equippedSlot: GearSlot | null = null;
    let invIdx = -1;
    if (source === 'equipped') {
      for (const s of ['weapon', 'armor', 'accessory'] as GearSlot[]) {
        if (this.equipped[s]?.id === itemId) {
          target = this.equipped[s];
          equippedSlot = s;
          break;
        }
      }
    } else {
      invIdx = this.inventory.findIndex((it) => it.id === itemId);
      if (invIdx >= 0) target = this.inventory[invIdx];
    }
    if (!target) return 0;

    const res = upgradeGearBatch(target, steps, this.player.gold, this.materials);
    if (res.levelsGained <= 0) {
      if (res.stopReason === 'max') this.toast(`已达到最高强化等级 +${MAX_ENHANCE_LV}！`);
      else if (res.stopReason === 'gold') this.toast('金币不足，无法继续一键强化！');
      else this.toast('矿石原料不足，无法继续一键强化！');
      return 0;
    }

    this.player.gold = res.goldLeft;
    this.materials = res.materialsLeft;
    if (source === 'equipped' && equippedSlot) {
      this.equipped[equippedSlot] = res.item;
      this.recalculateStats();
    } else if (invIdx >= 0) {
      this.inventory[invIdx] = res.item;
    }
    sfx.lvl();
    this.toast(`一键强化 +${res.levelsGained} 级：${res.item.name}`);
    this.log(
      `⚒️ 一键强化完成：【${res.item.name}】连续提升 ${res.levelsGained} 级（上限 +${MAX_ENHANCE_LV}）！`,
      RARITY_META[res.item.rarity].color
    );
    this.saveCurrentSlot(true, true);
    this.emitHud();
    return res.levelsGained;
  }

  public sellJunkGearItems(maxRarity: 'common' | 'rare' = 'common'): number {
    const res = sellJunkGear(this.inventory, maxRarity);
    if (res.sold.length === 0) {
      this.toast(maxRarity === 'common' ? '背包中没有可出售的普通(白)装备' : '背包中没有可出售的低阶装备');
      return 0;
    }
    this.inventory = res.kept;
    this.player.gold += res.totalGold;
    sfx.coin();
    const label = maxRarity === 'common' ? '普通(白)' : '精良(蓝)及以下';
    this.toast(`一键售出 ${res.sold.length} 件装备，获得 ${res.totalGold} 金币`);
    this.log(`🪙 一键清理 ${label}未强化装备 ×${res.sold.length}，获得 ${res.totalGold} 金币！`, '#fbbf24');
    this.saveCurrentSlot(true, true);
    this.emitHud();
    return res.sold.length;
  }

  public useSkillBook(bookId: string): boolean {
    const res = applySkillBookUse(
      this.player.classId,
      this.player.skillLevels,
      this.skillBooks,
      bookId
    );
    if (!res.learned || !res.usedBook) {
      this.toast(res.reason || '无法研习该技能书');
      return false;
    }
    this.player.skillLevels = res.nextLevels;
    this.skillBooks = res.nextBooks;
    const slotKey = ['Q', 'E', 'C', 'V'][res.usedBook.targetSlot];
    const skillName = CLASS_DEFS[this.player.classId].skills[res.usedBook.targetSlot].name;
    sfx.lvl();
    this.burst(this.player.x, this.player.y, '#c084fc', 24, 220);
    this.toast(`${skillName}(${slotKey}) 升至 Lv.${this.player.skillLevels[res.usedBook.targetSlot]}！`);
    this.log(
      `📘 研习【${res.usedBook.name}】成功！技能【${skillName}】提升至 Lv.${this.player.skillLevels[res.usedBook.targetSlot]}！`,
      '#c084fc'
    );
    this.saveCurrentSlot(true, true);
    this.emitHud();
    return true;
  }

  public sellSkillBook(bookId: string): void {
    const idx = this.skillBooks.findIndex((b) => b.id === bookId);
    if (idx < 0) return;
    const [book] = this.skillBooks.splice(idx, 1);
    this.player.gold += book.sellValue;
    sfx.coin();
    this.log(`🪙 出售技能书【${book.name}】，获得 ${book.sellValue} 金币`, '#fbbf24');
    this.saveCurrentSlot(true, true);
    this.emitHud();
  }

  public autoEquipBest(): void {
    const res = autoEquipBestGear(this.player.classId, this.equipped, this.inventory);
    this.equipped = res.equipped;
    this.inventory = res.inventory;
    this.recalculateStats();
    sfx.equip();
    if (res.changedCount > 0) {
      const slotNames = res.upgradedSlots.map((s) => SLOT_LABEL[s]).join('、');
      this.toast(`一键配装完成（${slotNames} 已更新）`);
      this.log(
        `⚡ 已为【${CLASS_DEFS[this.player.classId].name}】智能换装 ${slotNames}${
          res.skippedIncompatibleCount > 0
            ? `（保留了 ${res.skippedIncompatibleCount} 件跨职业装备在背包）`
            : ''
        }！`,
        '#38bdf8'
      );
    } else if (res.skippedIncompatibleCount > 0) {
      this.toast('当前已穿戴全部最优兼容装备');
      this.log(
        `ℹ️ 背包内有 ${res.skippedIncompatibleCount} 件跨职业装备无法穿戴，当前槽位已是最优。`,
        '#94a3b8'
      );
    } else {
      this.toast('当前已是最优配装');
    }
    this.saveCurrentSlot(true, true);
    this.emitHud();
  }

  public buyShopItem(item: ShopItemDef): void {
    const p = this.player;
    const price = Math.round(this.shopPrices[item.id]);
    if (p.gold < price) return;
    if (item.id === 'potion' && p.potions >= p.potionCap) {
      this.toast(`药水已达上限 (${p.potionCap})`);
      return;
    }
    p.gold -= price;
    this.shopPrices[item.id] *= item.rep;
    sfx.buy();

    if (item.id === 'potion') {
      p.potions++;
      this.log('🧪 购买了治疗药水', '#4ade80');
    } else if (item.id === 'atk') {
      p.baseAtk += 3;
      this.log('⚔️ 基础攻击力 +3', '#f87171');
    } else if (item.id === 'def') {
      p.baseDef += 2;
      this.log('🛡️ 基础防御力 +2', '#60a5fa');
    } else if (item.id === 'hp') {
      p.baseMaxHp += 22;
      p.hp += 22;
      this.log('❤️ 基础生命上限 +22', '#f472b6');
    }
    this.recalculateStats();
    this.saveCurrentSlot(true, true);
    this.emitHud();
  }

  public equipItem(itemId: string): void {
    const idx = this.inventory.findIndex((it) => it.id === itemId);
    if (idx < 0) return;
    const item = this.inventory[idx];
    if (!canClassEquipItem(this.player.classId, item)) {
      const sub = item.weaponSubtype ? SUBTYPE_LABEL[item.weaponSubtype] : '该装备';
      const req = item.requiredCategory ? RESTRICTION_LABEL[item.requiredCategory] : '特定职业';
      this.toast(`职业不符：${sub}限${req}`);
      this.log(`⛔ 无法装配【${item.name}】：${sub}仅限【${req}】装配！`, '#f87171');
      return;
    }
    const current = this.equipped[item.slot];
    this.inventory.splice(idx, 1);
    if (current) {
      this.inventory.push(current);
    }
    this.equipped[item.slot] = item;
    this.recalculateStats();
    sfx.equip();
    this.log(`🛡️ 穿戴了 [${RARITY_META[item.rarity].label}] ${item.name}`, RARITY_META[item.rarity].color);
    this.saveCurrentSlot(true, true);
    this.emitHud();
  }

  public unequipSlot(slot: GearSlot): void {
    const item = this.equipped[slot];
    if (!item) return;
    this.equipped[slot] = null;
    this.inventory.push(item);
    this.recalculateStats();
    sfx.equip();
    this.log(`卸下了 ${item.name}`, '#94a3b8');
    this.saveCurrentSlot(true, true);
    this.emitHud();
  }

  public sellItem(itemId: string): void {
    const idx = this.inventory.findIndex((it) => it.id === itemId);
    if (idx < 0) return;
    const [item] = this.inventory.splice(idx, 1);
    this.player.gold += item.sellValue;
    sfx.coin();
    this.log(`🪙 出售 ${item.name}，获得 ${item.sellValue} 金币`, '#fbbf24');
    this.saveCurrentSlot(true, true);
    this.emitHud();
  }

  public acceptQuest(questId: string): void {
    const def = findQuestDefById(questId, this.breakthroughTier, this.worldId);
    if (!def) return;
    this.activeQuest = {
      questId: def.id,
      progress: 0,
      completed: false,
      isBreakthrough: Boolean(def.isBreakthrough),
      targetTier: def.isBreakthrough ? this.breakthroughTier + 1 : undefined,
    };
    sfx.quest();
    this.log(`📜 接取${def.isBreakthrough ? '突破试炼' : '悬赏'}：【${def.title}】`, def.isBreakthrough ? '#f472b6' : '#7dd3fc');
    this.saveCurrentSlot(true, true);
    this.emitHud();
  }

  public claimQuestReward(): void {
    if (!this.activeQuest || !this.activeQuest.completed) return;
    const def = findQuestDefById(this.activeQuest.questId, this.breakthroughTier, this.worldId);
    if (!def) return;

    const isBreakthrough = Boolean(def.isBreakthrough || this.activeQuest.isBreakthrough);
    const goldGain = Math.round(def.rewardGold * this.player.goldMult);
    this.player.gold += goldGain;
    this.completedQuestCount++;
    this.activeQuest = null;
    this.recordMetaProgress({ _quests: (this.account.bestiary._quests ?? 0) + 1 });

    if (isBreakthrough) {
      this.breakthroughTier++;
      this.hitCapNotified = false;
      this.player.baseAtk += 4;
      this.player.baseDef += 2;
      this.player.baseMaxHp += 35;
      this.recalculateStats();
      this.player.hp = this.player.maxHp;
      this.player.mp = this.player.maxMp;

      const nextRealm = getRealmName(this.breakthroughTier);
      const nextCap = getBreakthroughCap(this.breakthroughTier);
      const nextDiff = getWorldDifficultyMultiplier(this.worldId, this.breakthroughTier);
      this.toast(`🌟 境界突破：${nextRealm}！`);
      this.log(
        `🌟 突破成功！晋升【${nextRealm}】，等级上限升至 Lv.${nextCap}（基础生命+35 攻+4 防+2）！`,
        '#f472b6'
      );
      this.log(
        `🔥 世界难度提升！当前【${WORLD_META[this.worldId].name}】魔物强度倍率 ×${nextDiff}！`,
        '#fbbf24'
      );
      this.burst(this.player.x, this.player.y, '#f472b6', 44, 340);
      this.ring(this.player.x, this.player.y, '#fde047', 12, 180, 0.85);
      sfx.lvl();
    } else {
      sfx.quest();
      this.toast('悬赏完成！');
      this.log(`🏆 完成【${def.title}】，获得 ${goldGain} 金币与 ${def.rewardExp} 经验！`, '#fde047');
      this.burst(this.player.x, this.player.y, '#fde047', 26, 240);
    }

    this.gainExp(def.rewardExp);
    this.saveCurrentSlot(true, true);
    this.emitHud();
  }

  public triggerSkill(
    slot: 'basic' | 'q' | 'e' | 'c' | 'v' | 'skill0' | 'skill1' | 'skill2' | 'skill3' | 'dash' | 'potion',
    source: 'mouse' | 'virtual' = 'mouse'
  ): void {
    if (!this.started || this.paused || this.isAnySubModalOpen()) {
      return;
    }
    sfx.ensure();
    if (source === 'virtual') {
      this.usingVirtualControls = true;
    }
    if (slot === 'basic') this.playerAttack(source);
    else if (slot === 'q' || slot === 'skill0') this.useSkillSlot(0, source);
    else if (slot === 'e' || slot === 'skill1') this.useSkillSlot(1, source);
    else if (slot === 'c' || slot === 'skill2') this.useSkillSlot(2, source);
    else if (slot === 'v' || slot === 'skill3') this.useSkillSlot(3, source);
    else if (slot === 'dash') this.useDash(source);
    else if (slot === 'potion') this.usePotion();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.started) return;
    sfx.ensure();
    const k = e.key.toLowerCase();
    this.keys[k] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
      e.preventDefault();
    }

    if (k === 'escape') {
      if (this.isAnySubModalOpen()) {
        this.closeAllModals();
      } else {
        this.setPaused(!this.paused);
      }
      return;
    }

    if (this.paused) return;

    if (k === 'b') {
      this.toggleInventory();
      return;
    }

    if (k === 'n' || k === 'tab') {
      e.preventDefault();
      this.toggleWorldMap();
      return;
    }

    if (k === 'm') {
      this.toggleMute();
      return;
    }

    if (k === 't') {
      this.openDungeonModal(!this.dungeonOpen);
      return;
    }

    if (k === 'p') {
      this.openSocialModal(!this.socialOpen);
      return;
    }

    if (k === 'f') {
      this.handleInteract();
      return;
    }

    if (this.isAnySubModalOpen()) {
      return;
    }

    if (k === 'j') this.playerAttack('mouse');
    if (k === 'q' || k === '1') this.useSkillSlot(0);
    if (k === 'e' || k === '2') this.useSkillSlot(1);
    if (k === 'c' || k === '3') this.useSkillSlot(2);
    if (k === 'v' || k === '4') this.useSkillSlot(3);
    if (k === 'r') this.usePotion();
    if (k === ' ' || e.key === 'Shift') {
      e.preventDefault();
      this.useDash();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys[e.key.toLowerCase()] = false;
  }

  private handleMouseMove(e: MouseEvent): void {
    this.usingVirtualControls = false;
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.started || this.paused) return;
    sfx.ensure();
    if (e.button === 0) {
      this.usingVirtualControls = false;
      if (this.isAnySubModalOpen()) {
        return;
      }
      const r = this.canvas.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      if (this.tryInteractAtScreenPos(sx, sy)) {
        return;
      }
      this.mouse.down = true;
      this.playerAttack('mouse');
    }
  }

  private handleTouchStart(e: TouchEvent): void {
    if (!this.started || this.paused) return;
    if (e.target !== this.canvas) return;
    sfx.ensure();
    e.preventDefault();
    if (this.canvasTouchId !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const r = this.canvas.getBoundingClientRect();
    const sx = t.clientX - r.left;
    const sy = t.clientY - r.top;
    this.mouse.x = sx;
    this.mouse.y = sy;
    if (!this.isAnySubModalOpen() && this.tryInteractAtScreenPos(sx, sy)) {
      return;
    }
    this.canvasTouchId = t.identifier;
    this.usingVirtualControls = false;
    if (!this.isAnySubModalOpen()) {
      this.mouse.down = true;
      this.playerAttack('mouse');
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (this.canvasTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.canvasTouchId) {
        e.preventDefault();
        const r = this.canvas.getBoundingClientRect();
        this.mouse.x = t.clientX - r.left;
        this.mouse.y = t.clientY - r.top;
        break;
      }
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (this.canvasTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.canvasTouchId) {
        e.preventDefault();
        this.canvasTouchId = null;
        this.mouse.down = false;
        break;
      }
    }
  }

  private getNearSignpost(): SignpostSummary | null {
    const p = this.player;
    const isTouch = this.touchUiActive || this.usingVirtualControls;
    const maxRadius = getSignpostInteractRadius(isTouch);
    let best: { d: number; sp: SignpostSummary } | null = null;
    for (const sp of this.world.signposts) {
      const d = Math.hypot(p.x - sp.x, p.y - sp.y);
      if (d < maxRadius && (!best || d < best.d)) {
        best = {
          d,
          sp: {
            title: sp.title,
            direction: sp.direction,
            destDesc: sp.destDesc,
            dangerLevel: sp.dangerLevel,
          },
        };
      }
    }
    return best ? best.sp : null;
  }

  private getNearInteract(): InteractTargetKind | null {
    const p = this.player;
    const isTouch = this.touchUiActive || this.usingVirtualControls;
    const npcRadius = getNpcInteractRadius(isTouch);
    const signRadius = getSignpostInteractRadius(isTouch);
    let bestKind: InteractTargetKind | null = null;
    let bestDist = Infinity;

    const consider = (kind: InteractTargetKind, tx: number, ty: number, limit: number) => {
      const d = Math.hypot(p.x - tx, p.y - ty);
      if (d <= limit && d < bestDist) {
        bestDist = d;
        bestKind = kind;
      }
    };

    if (this.worldId !== 'dungeon') {
      consider('awakening', this.world.awakening.x, this.world.awakening.y, npcRadius);
      consider('elder', this.world.elder.x, this.world.elder.y, npcRadius);
      consider('merchant', this.world.merchant.x, this.world.merchant.y, npcRadius);
      consider('armorer', this.world.armorer.x, this.world.armorer.y, npcRadius);
      consider('blacksmith', this.world.blacksmith.x, this.world.blacksmith.y, npcRadius);
      consider('upgrader', this.world.upgrader.x, this.world.upgrader.y, npcRadius);
      consider('altar', this.world.altar.x, this.world.altar.y, npcRadius);
    }
    consider('portal', this.world.portal.x, this.world.portal.y, npcRadius);
    if (this.world.dungeonGate) {
      consider('dungeon_gate', this.world.dungeonGate.x, this.world.dungeonGate.y, npcRadius + 14);
    }
    if (this.world.socialBoard) {
      consider('social_board', this.world.socialBoard.x, this.world.socialBoard.y, npcRadius);
    }
    for (let i = 0; i < this.world.signposts.length; i++) {
      const sp = this.world.signposts[i];
      consider('signpost', sp.x, sp.y, signRadius);
    }
    return bestKind;
  }

  private tryInteractAtScreenPos(sx: number, sy: number): boolean {
    const wx = sx + this.cam.x;
    const wy = sy + this.cam.y;
    const p = this.player;
    const isTouch = this.touchUiActive || this.usingVirtualControls;
    const { tapHitRadius, maxPlayerReach } = getCanvasTapInteractConfig(isTouch);
    const targets: { kind: InteractTargetKind; x: number; y: number }[] = [];
    if (this.worldId !== 'dungeon') {
      targets.push(
        { kind: 'awakening', x: this.world.awakening.x, y: this.world.awakening.y },
        { kind: 'elder', x: this.world.elder.x, y: this.world.elder.y },
        { kind: 'merchant', x: this.world.merchant.x, y: this.world.merchant.y },
        { kind: 'armorer', x: this.world.armorer.x, y: this.world.armorer.y },
        { kind: 'blacksmith', x: this.world.blacksmith.x, y: this.world.blacksmith.y },
        { kind: 'upgrader', x: this.world.upgrader.x, y: this.world.upgrader.y },
        { kind: 'altar', x: this.world.altar.x, y: this.world.altar.y }
      );
    }
    targets.push({ kind: 'portal', x: this.world.portal.x, y: this.world.portal.y });
    if (this.world.dungeonGate) {
      targets.push({ kind: 'dungeon_gate', x: this.world.dungeonGate.x, y: this.world.dungeonGate.y });
    }
    if (this.world.socialBoard) {
      targets.push({ kind: 'social_board', x: this.world.socialBoard.x, y: this.world.socialBoard.y });
    }
    targets.push(...this.world.signposts.map((sp) => ({ kind: 'signpost' as InteractTargetKind, x: sp.x, y: sp.y })));

    let bestTarget: { kind: InteractTargetKind; tapDist: number } | null = null;
    for (const t of targets) {
      const tapDist = Math.hypot(wx - t.x, wy - t.y);
      const playerDist = Math.hypot(p.x - t.x, p.y - t.y);
      if (tapDist <= tapHitRadius && playerDist <= maxPlayerReach) {
        if (!bestTarget || tapDist < bestTarget.tapDist) {
          bestTarget = { kind: t.kind, tapDist };
        }
      }
    }
    if (bestTarget) {
      this.openInteractTarget(bestTarget.kind);
      return true;
    }
    return false;
  }

  private openInteractTarget(kind: InteractTargetKind): void {
    this.joy = { x: 0, y: 0, active: false };
    this.virtualAttackHold = false;
    this.keys = {};
    this.mouse.down = false;
    if (kind === 'merchant') {
      this.closeAllSubModals();
      this.shopOpen = true;
      this.needsPausedRender = true;
      this.emitHud();
    } else if (kind === 'elder') {
      this.closeAllSubModals();
      this.questOpen = true;
      this.needsPausedRender = true;
      this.emitHud();
    } else if (kind === 'awakening') {
      this.closeAllSubModals();
      this.awakeningOpen = true;
      this.needsPausedRender = true;
      this.emitHud();
    } else if (kind === 'armorer') {
      this.closeAllSubModals();
      this.armorerOpen = true;
      this.needsPausedRender = true;
      this.emitHud();
    } else if (kind === 'blacksmith') {
      this.closeAllSubModals();
      this.blacksmithOpen = true;
      this.needsPausedRender = true;
      this.emitHud();
    } else if (kind === 'upgrader') {
      this.closeAllSubModals();
      this.upgraderOpen = true;
      this.needsPausedRender = true;
      this.emitHud();
    } else if (kind === 'altar') {
      this.openTalentModal(true);
    } else if (kind === 'portal') {
      if (this.worldId === 'dungeon') {
        if (!this.dungeonCleared) {
          this.toast('传送门已封印！请先击败本层首领');
          this.log('🔒 下一层传送门处于封印状态，击败本层镇守首领即可解封进入下一层！', '#fb7185');
          this.emitHud();
          return;
        }
        const nextFloor = (this.currentDungeonFloor ?? 1) + 1;
        this.enterDungeonFloor(nextFloor);
      } else {
        this.switchWorld(this.world.portal.targetWorld);
      }
    } else if (kind === 'dungeon_gate') {
      if (this.worldId === 'dungeon') {
        this.exitDungeon();
      } else {
        this.openDungeonModal(true);
      }
    } else if (kind === 'social_board') {
      this.openSocialModal(true);
    } else if (kind === 'signpost') {
      const sp = this.getNearSignpost();
      if (sp) {
        this.toast(`${sp.direction}：${sp.title}`);
        this.log(`🪧 【${sp.title}】${sp.direction} → ${sp.destDesc}（${sp.dangerLevel}）`, '#fde047');
        this.emitHud();
      }
    }
  }

  public switchWorld(targetWorld: WorldId): void {
    if (!this.started) return;
    if (targetWorld === 'dungeon') {
      this.openDungeonModal(true);
      return;
    }
    if (targetWorld === this.worldId) return;

    if (this.worldId !== 'dungeon') {
      this.worldChestsState[this.worldId] = this.world.chests.map((c) => (c.opened ? 1 : 0)).join('');
    }
    this.currentDungeonFloor = null;
    this.dungeonCleared = false;
    this.worldId = targetWorld;
    this.world = generateFixedWorld(targetWorld, this.atlas, {
      expandedOnline: this.playMode === 'online',
    });
    const chestStr = this.worldChestsState[targetWorld];
    if (chestStr) {
      for (let i = 0; i < this.world.chests.length && i < chestStr.length; i++) {
        this.world.chests[i].opened = chestStr[i] === '1';
      }
    }

    this.clearPooledEntities();
    this.boss = null;
    this.activeFixedBossArena = null;
    this.accumulator = 0;
    this.closeAllSubModals();

    const wPx = this.world.width * TILE;
    const hPx = this.world.height * TILE;
    this.player.x = this.world.spawnX;
    this.player.y = this.world.spawnY;
    this.player.invuln = 1.2;
    this.cam.x = clamp(this.player.x - this.vw / 2, 0, Math.max(0, wPx - this.vw));
    this.cam.y = clamp(this.player.y - this.vh / 2, 0, Math.max(0, hPx - this.vh));

    const isAuth = this.isMapEntityAuthority();
    this.wasMapAuthority = isAuth;
    if (isAuth) {
      for (let i = 0; i < 14; i++) this.spawnMob();
    }

    const meta = WORLD_META[targetWorld];
    const diff = getWorldDifficultyMultiplier(targetWorld, this.breakthroughTier);
    this.lightningFlash = 0;
    this.updatePlayerFogReveal(true);
    this.syncWeatherForWorldAndTime(false);
    sfx.quest();
    this.burst(this.player.x, this.player.y, targetWorld === 'world2' ? '#fb7185' : '#38bdf8', 36, 260);
    this.ring(this.player.x, this.player.y, targetWorld === 'world2' ? '#fb7185' : '#38bdf8', 10, 140, 0.65);
    this.toast(`进入【${meta.name}】`);
    this.log(`🌀 已穿越位面传送阵抵达【${meta.name}】（推荐 Lv.${meta.recommendedLv}+ · 难度倍率 ×${diff}）`, '#7dd3fc');
    this.log(`${this.weather.icon} 当前区域天气：【${this.weather.label}】(${this.weather.effectSummary})`, '#cbd5e1');
    this.saveCurrentSlot(true, true);
    if (this.playMode === 'online' && peerRoomClient.isConnected()) {
      peerRoomClient.sendLocalState(this.getRoomPlayerPayload());
      if (isAuth) {
        this.broadcastWorldEntitiesNow();
      } else {
        peerRoomClient.requestWorldSync(this.getCurrentMapKey());
      }
    }
    this.emitHud();
  }

  private getDungeonParticipantCount(): number {
    if (this.playMode !== 'online') return 1;
    const partyCount = this.party?.members.length ?? 1;
    const roomCount = peerRoomClient.getMembers().length;
    return Math.max(1, partyCount, roomCount);
  }

  public joinLeaderDungeonFloor(floor: number, leaderName: string): boolean {
    if (!this.started) return false;
    if (this.worldId === 'dungeon' && this.currentDungeonFloor === floor) return true;
    const ok = this.enterDungeonFloor(floor, true);
    if (ok) {
      this.log(`👥 已随队长【${leaderName}】进入试炼之塔 ${floor}F！`, '#a5f3fc');
    }
    return ok;
  }

  public enterDungeonFloor(floor: number, bypassSequentialGate = false): boolean {
    if (!this.started) return false;
    const targetFloor = Math.max(1, Math.floor(Number.isFinite(floor) ? floor : 1));
    const floorDef = getDungeonFloorDef(targetFloor);
    if (!bypassSequentialGate) {
      const gate = canEnterDungeonFloor(targetFloor, this.highestDungeonFloor);
      if (!gate.allowed) {
        this.toast(gate.reason || '当前无法进入该副本层数');
        this.log(`⛔ ${gate.reason}`, '#f87171');
        return false;
      }
    }

    if (this.worldId !== 'dungeon') {
      this.worldChestsState[this.worldId] = this.world.chests.map((c) => (c.opened ? 1 : 0)).join('');
    }
    this.worldId = 'dungeon';
    this.currentDungeonFloor = targetFloor;
    this.dungeonCleared = false;
    this.world = generateFixedWorld('dungeon', this.atlas, { dungeonFloor: targetFloor });

    this.clearPooledEntities();
    this.boss = null;
    this.activeFixedBossArena = null;
    this.accumulator = 0;
    this.closeAllSubModals();

    const wPx = this.world.width * TILE;
    const hPx = this.world.height * TILE;
    this.player.x = this.world.spawnX;
    this.player.y = this.world.spawnY;
    this.player.invuln = 1.5;
    this.cam.x = clamp(this.player.x - this.vw / 2, 0, Math.max(0, wPx - this.vw));
    this.cam.y = clamp(this.player.y - this.vh / 2, 0, Math.max(0, hPx - this.vh));

    const playerCount = this.getDungeonParticipantCount();
    const partyDiff = getDungeonPartyDifficultyMultiplier(playerCount);

    const dungeonArena: FixedBossArena = this.world.bossArenas[0] ?? {
      id: floorDef.bossId,
      name: floorDef.bossName,
      title: floorDef.bossTitle,
      color: floorDef.bossColor,
      tx: 27,
      ty: 18,
      x: 27 * TILE + TILE / 2,
      y: 18 * TILE + TILE / 2,
      r: 28,
      hpMult: 1,
      atkMult: 1,
    };

    const isAuth = this.isMapEntityAuthority();
    this.wasMapAuthority = isAuth;
    if (isAuth) {
      // 生成本层守卫魔物与首领（支持 1F~100000F+ 递增、Lv.1000 上限与多人翻倍强度）
      const dungeonPool = MOB_TYPES_BY_WORLD.dungeon;
      for (let i = 0; i < floorDef.mobCount; i++) {
        const mx = clamp(rand(14 * TILE, 40 * TILE), 4 * TILE, wPx - 4 * TILE);
        const my = clamp(rand(20 * TILE, 37 * TILE), 4 * TILE, hPx - 4 * TILE);
        if (!isFree(this.world.tiles, mx, my, 18)) continue;
        const base = dungeonPool[(targetFloor * 3 + i) % dungeonPool.length] ?? MOB_TYPES[0];
        const sc = getScaledDungeonMobStats(base.hp, base.atk, base.exp, targetFloor, playerCount);
        const mob = this.acquireMob(
          base,
          mx,
          my,
          sc.level,
          sc.hp,
          sc.atk,
          sc.exp,
          base.spd * sc.speedMult,
          base.aggro + 80,
          rand(0.3, 1.1),
          rand(1.6, 3.0)
        );
        if (Math.random() < (targetFloor >= 3 ? 0.34 : 0.22)) {
          this.promoteMobToElite(mob, pickEliteAffix());
        }
      }

      // 召唤当前楼层固定副本 BOSS
      this.spawnFixedBoss(dungeonArena, floorDef, playerCount);
    }

    if (
      !bypassSequentialGate &&
      this.playMode === 'online' &&
      this.party &&
      this.party.members.length > 1
    ) {
      peerRoomClient.broadcastDungeonEnter(targetFloor, this.playerName);
    }

    if (this.playMode === 'online' && peerRoomClient.isConnected()) {
      peerRoomClient.sendLocalState(this.getRoomPlayerPayload());
      if (isAuth) {
        this.broadcastWorldEntitiesNow();
      } else {
        peerRoomClient.requestWorldSync(this.getCurrentMapKey());
      }
    }

    this.lightningFlash = 0;
    this.updatePlayerFogReveal(true);
    this.syncWeatherForWorldAndTime(false);
    sfx.boss();
    this.burst(this.player.x, this.player.y, floorDef.bossColor, 36, 260);
    this.toast(
      playerCount > 1
        ? `进入 ${targetFloor}F (${playerCount}人难度 ×${partyDiff.difficultyMult})`
        : `进入试炼之塔 ${targetFloor}F：${floorDef.name}`
    );
    this.log(
      `🗼 进入【${floorDef.name}】${
        playerCount > 1 ? ` · 多人难度翻倍 (${playerCount}人 ×${partyDiff.difficultyMult})` : ''
      }！击败【${floorDef.bossName}】开启北侧传送门前往 ${targetFloor + 1}F！`,
      floorDef.bossColor
    );
    this.log(`${this.weather.icon} 本层异象：【${this.weather.label}】(${this.weather.effectSummary})`, '#cbd5e1');
    this.emitHud();
    return true;
  }

  public exitDungeon(): void {
    if (!this.started) return;
    this.currentDungeonFloor = null;
    this.dungeonCleared = false;
    this.switchWorld('grand_city');
    this.log('🏰 已脱离试炼之塔，安全返回【幻光王城】。', '#7dd3fc');
  }

  private handleInteract(): void {
    if (
      this.shopOpen ||
      this.questOpen ||
      this.talentOpen ||
      this.awakeningOpen ||
      this.armorerOpen ||
      this.blacksmithOpen ||
      this.upgraderOpen ||
      this.worldMapOpen ||
      this.dungeonOpen ||
      this.socialOpen
    ) {
      this.closeAllModals();
      return;
    }
    const near = this.getNearInteract();
    if (near) {
      this.openInteractTarget(near);
    }
  }

  private log(text: string, color = '#e2e8f0'): void {
    this.logs = [...this.logs.slice(-4), { id: this.logSeq++, text, color }];
  }

  private toast(msg: string): void {
    this.toastMsg = msg;
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastMsg = null;
      this.emitHud();
    }, 1700);
    this.emitHud();
  }

  private floatText(x: number, y: number, text: string, color: string, size = 16): void {
    if (this.floaters.length >= MAX_FLOATERS) {
      this.floaterPool.release(this.floaters[0]);
      this.swapRemoveAt(this.floaters, 0);
    }
    const f = this.floaterPool.acquire();
    f.x = x;
    f.y = y;
    f.text = text;
    f.color = color;
    f.size = size;
    f.life = 1;
    f.vy = -58;
    f.scale = 1.5;
    this.floaters.push(f);
  }

  private burst(x: number, y: number, color: string, count = 10, power = 150): void {
    if (this.particles.length >= 260) return;
    const n = this.particles.length > 150 ? Math.max(2, Math.ceil(count * 0.5)) : count;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = rand(power * 0.3, power);
      const pt = this.particlePool.acquire();
      pt.ring = false;
      pt.x = x;
      pt.y = y;
      pt.vx = Math.cos(a) * sp;
      pt.vy = Math.sin(a) * sp;
      pt.life = rand(0.28, 0.7);
      pt.maxLife = 0.7;
      pt.color = color;
      pt.r = rand(1.4, 3.6);
      pt.drag = rand(2.4, 4.2);
      this.particles.push(pt);
    }
  }

  private ring(x: number, y: number, color: string, r0: number, r1: number, life = 0.45): void {
    if (this.particles.length >= 300) return;
    const pt = this.particlePool.acquire();
    pt.ring = true;
    pt.kind = 'ring';
    pt.x = x;
    pt.y = y;
    pt.vx = 0;
    pt.vy = 0;
    pt.color = color;
    pt.r0 = r0;
    pt.r1 = r1;
    pt.life = life;
    pt.maxLife = life;
    this.particles.push(pt);
  }

  private spawnRuneRing(
    x: number,
    y: number,
    color: string,
    r0: number,
    r1: number,
    life = 0.52,
    ang = 0,
    spin = 2.6
  ): void {
    if (this.particles.length >= 300) return;
    const pt = this.particlePool.acquire();
    pt.ring = true;
    pt.kind = 'rune';
    pt.x = x;
    pt.y = y;
    pt.vx = 0;
    pt.vy = 0;
    pt.color = color;
    pt.r0 = r0;
    pt.r1 = r1;
    pt.ang = ang;
    pt.spin = spin;
    pt.life = life;
    pt.maxLife = life;
    this.particles.push(pt);
  }

  private spawnSlashArc(
    x: number,
    y: number,
    color: string,
    ang: number,
    r0: number,
    r1: number,
    arc = 2.0,
    width = 14,
    life = 0.28,
    spin = 0
  ): void {
    if (this.particles.length >= 300) return;
    const pt = this.particlePool.acquire();
    pt.ring = false;
    pt.kind = 'slash';
    pt.x = x;
    pt.y = y;
    pt.vx = 0;
    pt.vy = 0;
    pt.color = color;
    pt.r0 = r0;
    pt.r1 = r1;
    pt.ang = ang;
    pt.arc = arc;
    pt.width = width;
    pt.spin = spin;
    pt.life = life;
    pt.maxLife = life;
    this.particles.push(pt);
  }

  private spawnShardBurst(
    x: number,
    y: number,
    color: string,
    count = 14,
    power = 240,
    baseAng?: number,
    spread = TAU
  ): void {
    if (this.particles.length >= 260) return;
    const n = this.particles.length > 150 ? Math.max(3, Math.ceil(count * 0.5)) : count;
    for (let i = 0; i < n; i++) {
      const a =
        baseAng !== undefined
          ? baseAng + (Math.random() - 0.5) * spread
          : Math.random() * TAU;
      const sp = rand(power * 0.45, power);
      const pt = this.particlePool.acquire();
      pt.ring = false;
      pt.kind = 'shard';
      pt.x = x;
      pt.y = y;
      pt.vx = Math.cos(a) * sp;
      pt.vy = Math.sin(a) * sp;
      pt.ang = a;
      pt.spin = 0;
      pt.life = rand(0.26, 0.58);
      pt.maxLife = 0.58;
      pt.color = color;
      pt.r = rand(2.6, 4.8);
      pt.drag = rand(2.6, 4.4);
      this.particles.push(pt);
    }
  }

  private recordMetaProgress(updates: Record<string, number>, addStones = 0): void {
    const nextBestiary = { ...this.account.bestiary };
    for (const [k, v] of Object.entries(updates)) {
      nextBestiary[k] = Math.max(nextBestiary[k] ?? 0, v);
    }
    const evalRes = evaluateAchievements(nextBestiary, this.account.unlockedAchievements);
    const gainedStones = addStones + evalRes.rewardSoulStones;

    this.account = {
      ...this.account,
      soulStones: this.account.soulStones + gainedStones,
      bestiary: nextBestiary,
      unlockedAchievements: evalRes.nextUnlocked,
    };

    if (evalRes.newlyUnlocked.length > 0) {
      for (const ach of evalRes.newlyUnlocked) {
        this.log(`🏅 解锁成就【${ach.title}】+${ach.rewardSoulStones} 灵魂石`, '#fde047');
        this.toast(`成就达成：${ach.title}`);
      }
      this.recalculateStats();
      sfx.quest();
    }
  }

  private syncWeatherForWorldAndTime(announceTransition = true): void {
    const next = resolveWeatherForWorldAndTime(this.worldId, this.gameTime, this.weatherSeedOffset);
    if (next.kind !== this.weather.kind) {
      this.weather = next;
      if (next.kind === 'thunderstorm') {
        this.thunderTimer = rand(3.5, 8.5);
      }
      if (announceTransition && this.started) {
        this.log(
          `${next.icon} 天气变化为【${next.label}】：${next.effectSummary}`,
          next.kind === 'thunderstorm'
            ? '#fbbf24'
            : next.kind === 'drizzle'
            ? '#7dd3fc'
            : next.kind === 'snow'
            ? '#e0f2fe'
            : next.kind === 'fog'
            ? '#cbd5e1'
            : '#fde047'
        );
      }
    } else {
      this.weather = next;
    }
  }

  private updateWeather(dt: number, announce = true): void {
    this.syncWeatherForWorldAndTime(announce);
    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 2.6);
    }
    if (this.weather.kind === 'thunderstorm') {
      this.thunderTimer -= dt;
      if (this.thunderTimer <= 0) {
        this.thunderTimer = rand(5.5, 11.5);
        this.lightningFlash = 0.85;
        if (this.started) {
          this.camShake = Math.max(this.camShake, 3.2);
        }
      }
    }
  }

  private getActiveFogKey(): string {
    return `${this.world.worldId}:${this.world.width}x${this.world.height}:${this.world.dungeonFloor ?? 0}`;
  }

  private ensureActiveFogBitmap(): Uint8Array {
    const key = this.getActiveFogKey();
    const expectedLen = this.world.width * this.world.height;
    let bmp = this.fogExploredByWorld[key];
    if (!bmp || bmp.length !== expectedLen) {
      bmp = createFogBitmap(this.world.width, this.world.height);
      const stx = Math.floor(this.world.spawnX / TILE);
      const sty = Math.floor(this.world.spawnY / TILE);
      const spawnRad =
        this.world.safeRadius > 0
          ? Math.max(12, Math.ceil(this.world.safeRadius / TILE) + 2)
          : 12;
      revealFogCircle(bmp, this.world.width, this.world.height, stx, sty, spawnRad);
      this.fogExploredByWorld[key] = bmp;
      this.fogRevision++;
    }
    return bmp;
  }

  private updatePlayerFogReveal(force = false): void {
    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor(this.player.y / TILE);
    const key = this.getActiveFogKey();
    if (!force && ptx === this.lastFogTx && pty === this.lastFogTy && key === this.lastFogWorldKey) {
      return;
    }
    this.lastFogTx = ptx;
    this.lastFogTy = pty;
    this.lastFogWorldKey = key;
    const bmp = this.ensureActiveFogBitmap();
    if (revealFogCircle(bmp, this.world.width, this.world.height, ptx, pty, 12)) {
      this.fogRevision++;
    }
  }

  private getWorldFogDim(wid: 'world1' | 'world2' | 'grand_city', isOnline: boolean): number {
    if (wid === 'grand_city') return 210;
    return isOnline ? 250 : 210;
  }

  private exportWorldFogMap(): Partial<Record<'world1' | 'world2' | 'grand_city', string>> {
    const isOnline = this.playMode === 'online';
    const out: Partial<Record<'world1' | 'world2' | 'grand_city', string>> = {};
    for (const wid of ['world1', 'world2', 'grand_city'] as const) {
      const dims = this.getWorldFogDim(wid, isOnline);
      const bmp = this.fogExploredByWorld[`${wid}:${dims}x${dims}:0`];
      if (bmp && bmp.length === dims * dims) {
        out[wid] = encodeFogBitmap(bmp);
      }
    }
    return out;
  }

  private registerComboHit(targetX: number, targetY: number, crit: boolean): void {
    this.comboCount += 1;
    this.comboTimer = COMBO_DECAY_DURATION;
    const impact = computeComboImpactFeedback(this.comboCount, crit);
    if (impact.vignetteStrength > 0) {
      this.comboVignettePulse = Math.max(this.comboVignettePulse, impact.vignetteStrength);
    }
    if (impact.shake > 0) {
      const shakeMult = this.prefersReducedMotion ? 0.25 : 1;
      this.camShake = Math.max(this.camShake, impact.shake * shakeMult);
    }
    if (this.comboCount >= 50) {
      if (!this.comboGoldenMilestoneNotified) {
        this.comboGoldenMilestoneNotified = true;
        this.toast('🔥 50连击达成 · 金辉狂澜!');
        this.log('✨ 连击突破 50 次！进入【黄金连击狂澜】状态！', '#fbbf24');
        this.spawnRuneRing(this.player.x, this.player.y, '#fbbf24', 18, 92, 0.55, 0, 5.2);
      }
      if (this.comboCount % 5 === 0 || crit) {
        this.spawnShardBurst(targetX, targetY, '#fbbf24', 8, 220);
        this.ring(targetX, targetY, '#fde047', 6, 44, 0.32);
      }
    }
  }

  private update(dt: number): void {
    const p = this.player;
    const wPx = this.world.width * TILE;
    const hPx = this.world.height * TILE;

    let tx = p.x - this.vw / 2;
    let ty = p.y - this.vh / 2;
    if (wPx < this.vw) tx = (wPx - this.vw) / 2;
    if (hPx < this.vh) ty = (hPx - this.vh) / 2;
    const k = Math.min(1, dt * 11);
    this.cam.x += (clamp(tx, 0, Math.max(0, wPx - this.vw)) - this.cam.x) * k;
    this.cam.y += (clamp(ty, 0, Math.max(0, hPx - this.vh)) - this.cam.y) * k;

    this.mouse.wx = this.mouse.x + this.cam.x;
    this.mouse.wy = this.mouse.y + this.cam.y;

    p.stunTimer = Math.max(0, p.stunTimer - dt);
    p.slowTimer = Math.max(0, p.slowTimer - dt);
    if (p.shieldTimer > 0) {
      p.shieldTimer = Math.max(0, p.shieldTimer - dt);
      if (p.shieldTimer <= 0) p.shieldHp = 0;
    }

    if (p.dashTime > 0) {
      p.dashTime = Math.max(0, p.dashTime - dt);
      moveEnt(this.world.tiles, p, p.dashVx * dt, p.dashVy * dt, true);
      p.moving = true;
      p.walkPhase += dt * 18;
      if (Math.floor(p.dashTime * 60) % 2 === 0) {
        this.spawnAfterimage(p.x, p.y, p.r, p.facingAng, p.classId, 0.24, 0.24);
      }
    } else if (p.stunTimer <= 0) {
      let mx = 0;
      let my = 0;
      if (this.keys['w'] || this.keys['arrowup']) my -= 1;
      if (this.keys['s'] || this.keys['arrowdown']) my += 1;
      if (this.keys['a'] || this.keys['arrowleft']) mx -= 1;
      if (this.keys['d'] || this.keys['arrowright']) mx += 1;

      if (this.joy.active) {
        mx += this.joy.x;
        my += this.joy.y;
      }

      const mag = Math.hypot(mx, my);
      if (mag > 0.01) {
        const clampedMag = Math.min(1, mag);
        const nx = mx / mag;
        const ny = my / mag;
        const slowFactor = p.slowTimer > 0 ? 0.58 : 1;
        const weatherSpeed = this.weather.speedMult;
        moveEnt(
          this.world.tiles,
          p,
          nx * clampedMag * p.speed * slowFactor * weatherSpeed * dt,
          ny * clampedMag * p.speed * slowFactor * weatherSpeed * dt
        );
        if (this.joy.active) {
          p.facingAng = Math.atan2(ny, nx);
        } else if (p.swing <= 0 && !this.mouse.down) {
          p.facingAng = Math.atan2(ny, nx);
        }
        p.walkPhase += dt * (8 + 4 * clampedMag);
        p.moving = true;
        if (isWaterAt(this.world.tiles, p.x, p.y)) {
          this.waterRippleTimer -= dt;
          if (this.waterRippleTimer <= 0) {
            this.waterRippleTimer = 0.22;
            this.ring(p.x, p.y + 8, this.worldId === 'world2' ? '#e879f9' : '#bae6fd', 4, 22, 0.42);
          }
        }
      } else {
        p.moving = false;
        p.walkPhase += dt * 2;
      }
    } else {
      p.moving = false;
    }

    if (!p.moving && !this.usingVirtualControls && p.swing <= 0 && !this.mouse.down) {
      p.facingAng = Math.atan2(this.mouse.wy - p.y, this.mouse.wx - p.x);
    }

    p.cloak = Math.max(0, p.cloak - dt * 3.2);
    p.attackCd = Math.max(0, p.attackCd - dt);
    for (let s = 0; s < 4; s++) {
      p.skillCds[s] = Math.max(0, p.skillCds[s] - dt);
    }
    p.skillQCd = p.skillCds[0];
    p.skillECd = p.skillCds[1];
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.potCd = Math.max(0, p.potCd - dt);
    p.swing = Math.max(0, p.swing - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.hurtFlash = Math.max(0, p.hurtFlash - dt);

    if (p.stunTimer <= 0) {
      if (this.virtualAttackHold) {
        this.playerAttack('virtual');
      } else if (this.mouse.down) {
        this.playerAttack('mouse');
      }
    }

    p.mp = Math.min(p.maxMp, p.mp + dt * p.mpRegen);
    p.hp = Math.min(p.maxHp, p.hp + dt * 0.8);

    this.camShake = Math.max(0, this.camShake - dt * 26);

    this.updateMobs(dt);
    this.updateBoss(dt);
    this.updateProjectiles(dt);

    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const af = this.afterimages[i];
      af.life -= dt;
      if (af.life <= 0) {
        this.afterimagePool.release(af);
        this.swapRemoveAt(this.afterimages, i);
      }
    }

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.releaseDropAt(i);
        continue;
      }
      const dd = Math.hypot(d.x - p.x, d.y - p.y);
      if (dd < 98) {
        const a = Math.atan2(p.y - d.y, p.x - d.x);
        d.x += Math.cos(a) * dt * 410;
        d.y += Math.sin(a) * dt * 410;
      }
      if (dd < 28) {
        this.pickup(d);
        this.releaseDropAt(i);
      }
    }

    for (const c of this.world.chests) {
      if (c.opened) continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) < 44) {
        this.openChest(c);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particlePool.release(pt);
        this.swapRemoveAt(this.particles, i);
        continue;
      }
      if (pt.spin) {
        pt.ang = (pt.ang ?? 0) + pt.spin * dt;
      }
      if (pt.ring || pt.kind === 'ring' || pt.kind === 'rune' || pt.kind === 'slash') continue;
      pt.x += (pt.vx ?? 0) * dt;
      pt.y += (pt.vy ?? 0) * dt;
      const dr = 1 - dt * (pt.drag || 3.2);
      pt.vx = (pt.vx ?? 0) * dr;
      pt.vy = (pt.vy ?? 0) * dr;
    }

    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const w = this.warnings[i];
      w.life -= dt;
      if (w.life <= 0) {
        this.warningPool.release(w);
        this.swapRemoveAt(this.warnings, i);
      }
    }

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt * 1.3;
      f.y += f.vy * dt;
      f.vy *= 1 - dt * 2.2;
      f.scale = lerp(f.scale, 1, dt * 10);
      if (f.life <= 0) {
        this.floaterPool.release(f);
        this.swapRemoveAt(this.floaters, i);
      }
    }

    const isAuthority = this.isMapEntityAuthority();
    this.wasMapAuthority = isAuthority;

    if (this.worldId !== 'dungeon' && isAuthority) {
      this.spawnTimer -= dt;
      if (!this.boss && this.mobs.length < MAX_MOBS && this.spawnTimer <= 0) {
        this.spawnTimer = 0.45;
        this.spawnMob();
      }
    }

    // 固定领主祭坛冷却与触发检测（联机下任一同图玩家靠近即可唤醒）
    for (const id of Object.keys(this.fixedBossCooldowns)) {
      this.fixedBossCooldowns[id] = Math.max(0, this.fixedBossCooldowns[id] - dt);
    }
    if (isAuthority) {
      if (!this.boss && this.worldId !== 'dungeon') {
        for (const arena of this.world.bossArenas) {
          const cd = this.fixedBossCooldowns[arena.id] ?? 0;
          if (cd <= 0 && this.isAnyMapPlayerWithin(arena.x, arena.y, 460)) {
            this.spawnFixedBoss(arena);
            break;
          }
        }
      } else if (
        this.boss &&
        this.worldId !== 'dungeon' &&
        this.boss.arenaX !== undefined &&
        this.boss.arenaY !== undefined &&
        !this.isAnyMapPlayerWithin(this.boss.arenaX, this.boss.arenaY, 1050)
      ) {
        // 同图所有玩家脱离固定祭坛过远时重置领主回巢
        this.boss = null;
        this.activeFixedBossArena = null;
        this.log('👑 领主失去了目标，重新隐入祭坛深处。', '#94a3b8');
        this.broadcastWorldEntitiesNow();
      }

      if (this.worldId !== 'dungeon') {
        for (let i = this.mobs.length - 1; i >= 0; i--) {
          if (i >= this.mobs.length) continue;
          const m = this.mobs[i];
          if (!m) continue;
          if (!this.isAnyMapPlayerWithin(m.x, m.y, 1750)) this.releaseMobAt(i);
        }
      }
    }

    // 联机房间平滑插值 + 80ms 双向状态同步 + 90ms 世界怪物/首领权威快照同步
    if (this.playMode === 'online') {
      const lerpAlpha = Math.min(1, dt * 14);
      for (let i = 0; i < this.remotePlayers.length; i++) {
        const rp = this.remotePlayers[i];
        const dx = rp.targetX - rp.x;
        const dy = rp.targetY - rp.y;
        const d = Math.hypot(dx, dy);
        if (d > 420) {
          rp.x = rp.targetX;
          rp.y = rp.targetY;
        } else if (d > 0.35) {
          rp.x = lerp(rp.x, rp.targetX, lerpAlpha);
          rp.y = lerp(rp.y, rp.targetY, lerpAlpha);
        }
        rp.moving = d > 1.8;
        rp.walkPhase += dt * (rp.moving ? 11 : 2);
        rp.facingAng += angDiff(rp.facingAng, rp.targetFacingAng) * Math.min(1, dt * 16);
        if (rp.swing > 0) {
          rp.swing = Math.max(0, rp.swing - dt);
        } else if (rp.isAttacking) {
          rp.swingTotal = 0.24;
          rp.swing = 0.24;
        }
      }

      this.netSyncTimer -= dt;
      if (this.netSyncTimer <= 0) {
        this.netSyncTimer = 0.08;
        peerRoomClient.sendLocalState(this.getRoomPlayerPayload());
      }

      if (isAuthority && peerRoomClient.isConnected()) {
        this.entitySyncTimer -= dt;
        if (this.entitySyncTimer <= 0) {
          this.entitySyncTimer = 0.09;
          this.broadcastWorldEntitiesNow();
        }
      }
    }

    // Silent auto-save: local flush every 5s (both singleplayer & online pending backup), cloud sync throttled every 25s
    this.saveTimer -= dt;
    this.cloudSaveAccum += dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 5;
      const doCloudSync = this.cloudSaveAccum >= 25;
      if (doCloudSync) this.cloudSaveAccum = 0;
      this.saveCurrentSlot(true, doCloudSync);
    }

    if (this.comboVignettePulse > 0) {
      this.comboVignettePulse = Math.max(0, this.comboVignettePulse - dt * 2.3);
    }
    if (this.comboTimer > 0) {
      this.comboTimer = Math.max(0, this.comboTimer - dt);
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.comboGoldenMilestoneNotified = false;
        this.comboVignettePulse = 0;
      }
    }

    this.updatePlayerFogReveal(false);
    this.gameTime += dt;
    this.updateWeather(dt, true);
  }

  private getCombatAimAngle(_source: 'mouse' | 'virtual'): number {
    const p = this.player;
    const def = CLASS_DEFS[p.classId];
    const isRanged =
      Boolean(def.isRangedCombat) ||
      def.archetype === 'archer' ||
      def.archetype === 'mage' ||
      def.archetype === 'healer' ||
      def.weaponKind === 'celestial_blade';
    const maxRange = isRanged ? 480 : 195;
    const fallback = this.joy.active
      ? Math.atan2(this.joy.y, this.joy.x)
      : !this.usingVirtualControls
      ? Math.atan2(this.mouse.wy - p.y, this.mouse.wx - p.x)
      : p.facingAng;
    // 电脑端与移动端均自动索敌最近目标
    return computeAutoAimAngle(p.x, p.y, fallback, maxRange, this.mobs, this.boss);
  }

  private getEffectiveCritChance(): number {
    const p = this.player;
    if (p.critDisabled) return 0;
    return clamp(p.critChance + this.weather.critBonusPct, 0, 95);
  }

  private rollPlayerDmg(mult = 1, forceCrit = false, isFire = false): { dmg: number; crit: boolean } {
    const p = this.player;
    const fireMult = isFire ? this.weather.fireDmgMult : 1;
    return rollDamage(
      p.atk * mult * fireMult,
      this.getEffectiveCritChance(),
      forceCrit,
      Math.random,
      p.critDmgMult,
      p.critDisabled
    );
  }

  private meleeSweep(
    ang: number,
    reach: number,
    halfArc: number,
    dmgMult: number,
    knock: number,
    options?: { forceCrit?: boolean; stunSec?: number; freezeSec?: number; lifestealRatio?: number; isFire?: boolean }
  ): boolean {
    const p = this.player;
    const startSeq = this.worldResetSeq;
    let hitAny = false;
    let totalHeal = 0;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      if (this.worldResetSeq !== startSeq) break;
      if (i >= this.mobs.length) continue;
      const m = this.mobs[i];
      if (!m) continue;
      if (dist(p, m) > reach + m.r) continue;
      const a = Math.atan2(m.y - p.y, m.x - p.x);
      if (Math.abs(angDiff(a, ang)) > halfArc) continue;
      if (options?.stunSec) m.stunTimer = Math.max(m.stunTimer, options.stunSec);
      if (options?.freezeSec) m.freezeTimer = Math.max(m.freezeTimer, options.freezeSec);
      const { dmg, crit } = this.rollPlayerDmg(dmgMult, options?.forceCrit, options?.isFire);
      this.damageMob(m, dmg, crit, p.x, p.y, knock, {
        stunSec: options?.stunSec,
        freezeSec: options?.freezeSec,
      });
      if (options?.lifestealRatio) totalHeal += Math.max(1, Math.round(dmg * options.lifestealRatio));
      hitAny = true;
    }
    if (this.worldResetSeq === startSeq && this.boss && dist(p, this.boss) <= reach + this.boss.r) {
      const a = Math.atan2(this.boss.y - p.y, this.boss.x - p.x);
      if (Math.abs(angDiff(a, ang)) <= halfArc) {
        if (options?.stunSec) this.boss.stunTimer = Math.max(this.boss.stunTimer, options.stunSec * 0.45);
        if (options?.freezeSec) this.boss.freezeTimer = Math.max(this.boss.freezeTimer, options.freezeSec * 0.55);
        const { dmg, crit } = this.rollPlayerDmg(dmgMult * 0.92, options?.forceCrit, options?.isFire);
        this.damageBoss(dmg, crit, p.x, p.y, Math.round(knock * 0.45), {
          stunSec: options?.stunSec ? options.stunSec * 0.45 : undefined,
          freezeSec: options?.freezeSec ? options.freezeSec * 0.55 : undefined,
        });
        if (options?.lifestealRatio) totalHeal += Math.max(1, Math.round(dmg * options.lifestealRatio));
        hitAny = true;
      }
    }
    if (totalHeal > 0) {
      p.hp = Math.min(p.maxHp, p.hp + totalHeal);
      this.floatText(p.x, p.y - 34, `+${totalHeal}`, '#4ade80', 14);
    }
    return hitAny;
  }

  private playerAttack(source: 'mouse' | 'virtual' = 'mouse'): void {
    const p = this.player;
    const def = CLASS_DEFS[p.classId];
    if (p.attackCd > 0) return;

    p.attackCd = getEffectiveBasicCooldown(def.basicCooldown, p.attackSpeed);
    p.swingTotal = Math.min(0.28, p.attackCd * 0.78);
    p.swing = p.swingTotal;
    const ang = this.getCombatAimAngle(source);
    p.facingAng = ang;
    p.cloak = 1;
    const isFireBasic = isFireElementalAttack(p.classId);

    if (def.weaponKind === 'staff' || def.weaponKind === 'scepter' || def.weaponKind === 'harp') {
      const boltColor = def.accentColor;
      const isHealerBolt = def.weaponKind === 'scepter' || def.weaponKind === 'harp';
      this.spawnProjectile(
        p.x + Math.cos(ang) * 20,
        p.y + Math.sin(ang) * 20,
        Math.cos(ang) * (isHealerBolt ? 520 : 495),
        Math.sin(ang) * (isHealerBolt ? 520 : 495),
        isHealerBolt ? 7 : 7.5,
        p.atk * (isHealerBolt ? 1.08 : 1.22),
        1.05,
        'player',
        boltColor,
        {
          freezeSec: p.classId === 'frostmage' || p.classId === 'time_chronomancer' ? 1.4 : 0,
          lifestealRatio: p.classId === 'necromancer' || p.classId === 'soul_weaver' ? 0.12 : 0,
          isFire: isFireBasic,
        }
      );
      if (isHealerBolt && p.hp < p.maxHp) {
        const selfHeal = Math.max(2, Math.round(p.maxHp * 0.025));
        p.hp = Math.min(p.maxHp, p.hp + selfHeal);
      }
      this.burst(p.x + Math.cos(ang) * 22, p.y + Math.sin(ang) * 22, boltColor, 5, 100);
      sfx.arcane();
    } else if (def.weaponKind === 'bow' || def.weaponKind === 'crossbow') {
      const isXbow = def.weaponKind === 'crossbow';
      this.spawnProjectile(
        p.x + Math.cos(ang) * 20,
        p.y + Math.sin(ang) * 20,
        Math.cos(ang) * (isXbow ? 700 : 635),
        Math.sin(ang) * (isXbow ? 700 : 635),
        isXbow ? 6.5 : 5.5,
        p.atk * (isXbow ? 1.18 : 1.04),
        0.92,
        'player',
        def.accentColor,
        {
          pierce: isXbow ? 1 : 0,
          isFire: isFireBasic,
        }
      );
      this.burst(p.x + Math.cos(ang) * 20, p.y + Math.sin(ang) * 20, def.accentColor, 4, 90);
      sfx.bow();
    } else if (def.weaponKind === 'celestial_blade') {
      const hitAny = this.meleeSweep(ang, 94, 1.32, 1.05, 200, { isFire: isFireBasic });
      this.spawnProjectile(
        p.x + Math.cos(ang) * 24,
        p.y + Math.sin(ang) * 24,
        Math.cos(ang) * 610,
        Math.sin(ang) * 610,
        7,
        p.atk * 0.85,
        0.72,
        'player',
        def.accentColor,
        {
          pierce: 2,
          shape: 'crescent',
          isFire: isFireBasic,
        }
      );
      this.spawnSlashArc(p.x, p.y, def.accentColor, ang, 30, 82, 2.2, 12, 0.24, 3.2);
      this.spawnShardBurst(p.x + Math.cos(ang) * 44, p.y + Math.sin(ang) * 44, def.accentColor, 6, 150, ang, 1.4);
      sfx.swing();
      if (hitAny) this.camShake = Math.min(this.camShake + 2.8, 9);
    } else {
      const reach =
        def.weaponKind === 'spear'
          ? 104
          : def.weaponKind === 'scythe'
          ? 96
          : def.weaponKind === 'dagger'
          ? 74
          : 86;
      const half =
        def.weaponKind === 'spear'
          ? 0.82
          : def.weaponKind === 'axe' || def.weaponKind === 'scythe'
          ? 1.34
          : 1.2;
      const dmgMult =
        def.weaponKind === 'axe'
          ? 1.22
          : def.weaponKind === 'scythe'
          ? 1.12
          : def.weaponKind === 'dagger'
          ? 0.94
          : 1.02;
      const hitAny = this.meleeSweep(
        ang,
        reach,
        half,
        dmgMult,
        def.weaponKind === 'axe' ? 245 : 200,
        {
          lifestealRatio: def.weaponKind === 'scythe' ? 0.1 : undefined,
          isFire: isFireBasic,
        }
      );
      this.spawnSlashArc(p.x, p.y, def.accentColor, ang, 24, reach * 0.82, half * 1.6, 11, 0.21);
      this.spawnShardBurst(p.x + Math.cos(ang) * 40, p.y + Math.sin(ang) * 40, def.accentColor, 5, 130, ang, 1.3);
      sfx.swing();
      if (hitAny) this.camShake = Math.min(this.camShake + 2.6, 9);
    }
  }

  private useSkillSlot(slot: SkillSlotIndex, source: 'mouse' | 'virtual' = 'mouse'): void {
    const p = this.player;
    const def = CLASS_DEFS[p.classId];
    const skill: SkillMeta = def.skills[slot];
    if (!skill || p.skillCds[slot] > 0 || p.mp < skill.mpCost) return;

    const skillLv = p.skillLevels[slot] ?? 1;
    const effCd = getEffectiveSkillCooldown(skill.cooldown, skillLv, p.attackSpeed);
    const mult = getSkillPowerMultiplier(skill.powerMult, skillLv);
    const color = skill.color || def.accentColor;

    p.skillCds[slot] = effCd;
    p.skillQCd = p.skillCds[0];
    p.skillECd = p.skillCds[1];
    p.mp -= skill.mpCost;

    const ang = this.getCombatAimAngle(source);
    p.facingAng = ang;

    const radius = Math.max(80, skill.range || 140);
    const isFireSkill = isFireElementalAttack(p.classId, skill.name);

    if (skill.pattern === 'spin_aoe') {
      p.swingTotal = 0.42;
      p.swing = 0.42;
      this.camShake = 8;
      this.spawnRuneRing(p.x, p.y, color, 16, radius, 0.46, ang, 6.2);
      this.spawnSlashArc(p.x, p.y, color, ang, 30, radius * 0.92, 4.6, 16, 0.34, 14);
      this.spawnSlashArc(p.x, p.y, '#991b1b', ang + Math.PI, 24, radius * 0.78, 4.2, 12, 0.32, 14);
      this.spawnShardBurst(p.x, p.y, color, 20, 320);
      this.burst(p.x, p.y, '#4c1d95', 10, 210);
      sfx.whirl();
      this.meleeSweep(ang, radius, Math.PI, mult, 250, {
        lifestealRatio: skill.lifestealRatio,
        stunSec: skill.stunDur,
        freezeSec: skill.slowDur,
        forceCrit: skill.forceCrit,
        isFire: isFireSkill,
      });
    } else if (skill.pattern === 'stun_slam') {
      this.camShake = 10;
      this.spawnRuneRing(p.x, p.y, color, 14, radius, 0.52, ang, -3.5);
      this.ring(p.x, p.y, '#fbbf24', 10, radius * 0.65, 0.38);
      this.spawnSlashArc(p.x, p.y, color, ang, 24, radius * 0.88, 2.7, 18, 0.28);
      this.spawnShardBurst(p.x, p.y, color, 22, 310);
      this.burst(p.x, p.y, '#7f1d1d', 12, 230);
      sfx.bash();
      this.meleeSweep(ang, radius, Math.PI, mult, 300, {
        stunSec: skill.stunDur ?? 1.8,
        freezeSec: skill.slowDur,
        lifestealRatio: skill.lifestealRatio,
        forceCrit: skill.forceCrit,
        isFire: isFireSkill,
      });
    } else if (skill.pattern === 'dash_strike') {
      const dashDist = skill.dashDist ?? 185;
      const steps = 10;
      const hitMobs = this.dashHitMobs;
      hitMobs.clear();
      let hitBoss = false;
      p.invuln = Math.max(p.invuln, 0.42);
      this.spawnSlashArc(p.x, p.y, color, ang, 22, 74, 2.1, 14, 0.24);
      const startSeq = this.worldResetSeq;
      for (let s = 0; s < steps; s++) {
        if (this.worldResetSeq !== startSeq) break;
        this.spawnAfterimage(p.x, p.y, p.r, ang, p.classId, 0.34 - s * 0.015, 0.34);
        moveEnt(
          this.world.tiles,
          p,
          (Math.cos(ang) * dashDist) / steps,
          (Math.sin(ang) * dashDist) / steps,
          true
        );
        for (let i = this.mobs.length - 1; i >= 0; i--) {
          if (this.worldResetSeq !== startSeq) break;
          if (i >= this.mobs.length) continue;
          const m = this.mobs[i];
          if (!m) continue;
          if (!hitMobs.has(m) && dist(p, m) < m.r + 42) {
            hitMobs.add(m);
            if (skill.stunDur) m.stunTimer = Math.max(m.stunTimer, skill.stunDur);
            if (skill.slowDur) m.freezeTimer = Math.max(m.freezeTimer, skill.slowDur);
            const { dmg, crit } = this.rollPlayerDmg(mult, skill.forceCrit, isFireSkill);
            this.damageMob(m, dmg, crit, p.x, p.y, 240, {
              stunSec: skill.stunDur,
              freezeSec: skill.slowDur,
            });
          }
        }
        if (this.worldResetSeq === startSeq && !hitBoss && this.boss && dist(p, this.boss) < this.boss.r + 42) {
          hitBoss = true;
          if (skill.stunDur) this.boss.stunTimer = Math.max(this.boss.stunTimer, skill.stunDur * 0.45);
          if (skill.slowDur) this.boss.freezeTimer = Math.max(this.boss.freezeTimer, skill.slowDur * 0.55);
          const { dmg, crit } = this.rollPlayerDmg(mult * 0.92, skill.forceCrit, isFireSkill);
          this.damageBoss(dmg, crit, p.x, p.y, 120, {
            stunSec: skill.stunDur ? skill.stunDur * 0.45 : undefined,
            freezeSec: skill.slowDur ? skill.slowDur * 0.55 : undefined,
          });
        }
      }
      hitMobs.clear();
      this.spawnSlashArc(p.x, p.y, color, ang, 26, 94, 2.5, 16, 0.28);
      this.spawnRuneRing(p.x, p.y, color, 10, 88, 0.38, ang, 5.2);
      this.spawnShardBurst(p.x, p.y, color, 18, 260, ang, 2.2);
      sfx.crit();
    } else if (skill.pattern === 'cone_volley') {
      const count = Math.max(3, skill.projCount ?? 5);
      const totalSpread = skill.spread ?? 0.56;
      for (let i = 0; i < count; i++) {
        const offset = count === 1 ? 0 : -totalSpread / 2 + (totalSpread * i) / (count - 1);
        const a = ang + offset;
        this.spawnProjectile(
          p.x + Math.cos(a) * 20,
          p.y + Math.sin(a) * 20,
          Math.cos(a) * 630,
          Math.sin(a) * 630,
          7,
          p.atk * (mult / Math.max(1.8, count * 0.48)),
          0.98,
          'player',
          color,
          {
            pierce: skill.pierce ? 2 : 0,
            freezeSec: skill.slowDur ?? 0,
            stunSec: skill.stunDur ?? 0,
            lifestealRatio: skill.lifestealRatio ?? 0,
            shape: def.archetype === 'archer' ? 'trident' : 'crescent',
            isFire: isFireSkill,
          }
        );
      }
      this.spawnSlashArc(p.x, p.y, color, ang, 22, 68, totalSpread + 0.5, 10, 0.24);
      this.spawnShardBurst(p.x + Math.cos(ang) * 22, p.y + Math.sin(ang) * 22, color, 14, 210, ang, totalSpread + 0.4);
      sfx.bow();
    } else if (skill.pattern === 'heavy_projectile') {
      this.spawnProjectile(
        p.x + Math.cos(ang) * 24,
        p.y + Math.sin(ang) * 24,
        Math.cos(ang) * 560,
        Math.sin(ang) * 560,
        12,
        p.atk * mult,
        1.3,
        'player',
        color,
        {
          explosive: Boolean(skill.explodeRadius),
          pierce: skill.pierce ? 3 : 0,
          freezeSec: skill.slowDur ?? 0,
          stunSec: skill.stunDur ?? 0,
          lifestealRatio: skill.lifestealRatio ?? 0,
          shape: def.archetype === 'archer' ? 'trident' : 'crescent',
          isFire: isFireSkill,
        }
      );
      this.spawnRuneRing(p.x, p.y, color, 8, 56, 0.34, ang, 4.0);
      this.spawnShardBurst(p.x + Math.cos(ang) * 24, p.y + Math.sin(ang) * 24, color, 14, 220, ang, 1.1);
      if (def.archetype === 'mage') sfx.fire();
      else sfx.bow();
    } else if (skill.pattern === 'aoe_blast') {
      this.camShake = 9;
      this.spawnRuneRing(p.x, p.y, color, 14, radius, 0.56, ang, 4.4);
      this.ring(p.x, p.y, '#4c1d95', 10, radius * 0.72, 0.42);
      this.spawnShardBurst(p.x, p.y, color, 24, 310);
      this.burst(p.x, p.y, '#0f172a', 10, 220);
      sfx.ice();
      let drained = 0;
      const startSeq = this.worldResetSeq;
      for (let i = this.mobs.length - 1; i >= 0; i--) {
        if (this.worldResetSeq !== startSeq) break;
        if (i >= this.mobs.length) continue;
        const m = this.mobs[i];
        if (!m) continue;
        if (dist(p, m) > radius + m.r) continue;
        if (skill.slowDur) m.freezeTimer = Math.max(m.freezeTimer, skill.slowDur);
        if (skill.stunDur) m.stunTimer = Math.max(m.stunTimer, skill.stunDur);
        const { dmg, crit } = this.rollPlayerDmg(mult, skill.forceCrit, isFireSkill);
        this.damageMob(m, dmg, crit, p.x, p.y, 240, {
          stunSec: skill.stunDur,
          freezeSec: skill.slowDur,
        });
        if (skill.lifestealRatio) drained += Math.round(dmg * skill.lifestealRatio);
      }
      if (this.worldResetSeq === startSeq && this.boss && dist(p, this.boss) < radius + this.boss.r) {
        if (skill.slowDur) this.boss.freezeTimer = Math.max(this.boss.freezeTimer, skill.slowDur * 0.6);
        if (skill.stunDur) this.boss.stunTimer = Math.max(this.boss.stunTimer, skill.stunDur * 0.45);
        const { dmg, crit } = this.rollPlayerDmg(mult * 0.9, skill.forceCrit, isFireSkill);
        this.damageBoss(dmg, crit, p.x, p.y, 100, {
          stunSec: skill.stunDur ? skill.stunDur * 0.45 : undefined,
          freezeSec: skill.slowDur ? skill.slowDur * 0.6 : undefined,
        });
        if (skill.lifestealRatio) drained += Math.round(dmg * skill.lifestealRatio);
      }
      if (drained > 0) {
        p.hp = Math.min(p.maxHp, p.hp + drained);
        this.floatText(p.x, p.y - 34, `+${drained}`, '#e879f9', 15);
      }
    } else if (skill.pattern === 'heal_pulse') {
      const healPct = skill.healPct ?? 0.28;
      const healHp = Math.max(12, Math.round(p.maxHp * healPct * (1 + (skillLv - 1) * 0.08)));
      const shieldHp = skill.shieldPct ? Math.round(p.maxHp * skill.shieldPct) : 0;
      p.hp = Math.min(p.maxHp, p.hp + healHp);
      if (shieldHp > 0) {
        p.shieldHp = Math.max(p.shieldHp, shieldHp);
        p.shieldTimer = Math.max(p.shieldTimer, 6);
      }
      this.spawnRuneRing(p.x, p.y, '#4ade80', 12, radius, 0.56, ang, 3.2);
      this.ring(p.x, p.y, '#fde047', 10, radius * 0.68, 0.44);
      this.spawnShardBurst(p.x, p.y, color, 18, 220);
      this.floatText(p.x, p.y - 34, `+${healHp} 圣愈`, '#4ade80', 17);
      sfx.potion();
      if (this.playMode === 'online' && this.party && this.party.members.length > 1) {
        peerRoomClient.broadcastPartyHeal(healHp, shieldHp, this.playerName);
      }
      if (mult > 0.3) {
        this.meleeSweep(ang, radius, Math.PI, mult * 0.85, 190, { stunSec: skill.stunDur, isFire: isFireSkill });
      }
    } else if (skill.pattern === 'shield_fortify') {
      const shieldHp = Math.max(18, Math.round(p.maxHp * (skill.shieldPct ?? 0.26) * (1 + (skillLv - 1) * 0.08)));
      p.shieldHp = Math.max(p.shieldHp, shieldHp);
      p.shieldTimer = 6.5;
      this.spawnRuneRing(p.x, p.y, '#93c5fd', 12, radius, 0.54, ang, -3.6);
      this.ring(p.x, p.y, '#f59e0b', 16, radius * 0.72, 0.4);
      this.spawnShardBurst(p.x, p.y, color, 18, 230);
      this.floatText(p.x, p.y - 34, `护盾 +${shieldHp}`, '#93c5fd', 16);
      sfx.bash();
      if (this.playMode === 'online' && this.party && this.party.members.length > 1) {
        peerRoomClient.broadcastPartyHeal(0, Math.round(shieldHp * 0.65), this.playerName);
      }
      if (mult > 0.2) {
        this.meleeSweep(ang, radius, Math.PI, mult, 220, { stunSec: skill.stunDur, isFire: isFireSkill });
      }
    } else if (skill.pattern === 'vortex_pull') {
      this.camShake = 9;
      this.spawnRuneRing(p.x, p.y, color, radius, 22, 0.55, ang, -6.5);
      this.ring(p.x, p.y, '#7e22ce', radius * 0.7, 16, 0.46);
      this.spawnShardBurst(p.x, p.y, color, 22, 260);
      sfx.arcane();
      const startSeq = this.worldResetSeq;
      for (let i = this.mobs.length - 1; i >= 0; i--) {
        if (this.worldResetSeq !== startSeq) break;
        if (i >= this.mobs.length) continue;
        const m = this.mobs[i];
        if (!m) continue;
        const d = dist(p, m);
        if (d > radius + m.r) continue;
        // 聚怪拉扯向玩家身边
        const pullAng = Math.atan2(p.y - m.y, p.x - m.x);
        moveEnt(this.world.tiles, m, Math.cos(pullAng) * Math.min(84, Math.max(0, d - 34)), Math.sin(pullAng) * Math.min(84, Math.max(0, d - 34)), true);
        if (skill.slowDur) m.freezeTimer = Math.max(m.freezeTimer, skill.slowDur);
        if (skill.stunDur) m.stunTimer = Math.max(m.stunTimer, skill.stunDur);
        const { dmg, crit } = this.rollPlayerDmg(mult, skill.forceCrit, isFireSkill);
        this.damageMob(m, dmg, crit, p.x, p.y, 40, {
          stunSec: skill.stunDur,
          freezeSec: skill.slowDur,
        });
      }
      if (this.worldResetSeq === startSeq && this.boss && dist(p, this.boss) <= radius + this.boss.r) {
        if (skill.slowDur) this.boss.freezeTimer = Math.max(this.boss.freezeTimer, skill.slowDur * 0.55);
        if (skill.stunDur) this.boss.stunTimer = Math.max(this.boss.stunTimer, skill.stunDur * 0.45);
        const { dmg, crit } = this.rollPlayerDmg(mult * 0.9, skill.forceCrit, isFireSkill);
        this.damageBoss(dmg, crit, p.x, p.y, 50, {
          stunSec: skill.stunDur ? skill.stunDur * 0.45 : undefined,
          freezeSec: skill.slowDur ? skill.slowDur * 0.55 : undefined,
        });
      }
    }

    this.log(`${skill.icon} [${skill.key}] ${skill.name} Lv.${skillLv}！`, color);
    this.emitHud();
  }

  private useDash(source: 'mouse' | 'virtual' = 'mouse'): void {
    const p = this.player;
    if (p.dashCd > 0 || p.dashTime > 0) return;

    let dx = 0;
    let dy = 0;
    if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
    if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
    if (this.keys['d'] || this.keys['arrowright']) dx += 1;
    if (this.joy.active) {
      dx += this.joy.x;
      dy += this.joy.y;
    }

    let ang = p.facingAng;
    if (Math.hypot(dx, dy) > 0.05) {
      ang = Math.atan2(dy, dx);
    } else if (source === 'mouse' && !this.usingVirtualControls) {
      ang = Math.atan2(this.mouse.wy - p.y, this.mouse.wx - p.x);
    }

    p.facingAng = ang;
    p.dashCd = 1.4;
    p.dashTime = 0.18;
    p.invuln = Math.max(p.invuln, 0.28);
    const dashSpeed = p.speed * 3.35;
    p.dashVx = Math.cos(ang) * dashSpeed;
    p.dashVy = Math.sin(ang) * dashSpeed;
    p.cloak = 1;

    this.burst(p.x, p.y, CLASS_DEFS[p.classId].accentColor, 10, 140);
    sfx.dash();
    this.emitHud();
  }

  private usePotion(): void {
    const p = this.player;
    if (p.potCd > 0 || p.potions <= 0 || p.hp >= p.maxHp) return;
    p.potCd = 1.2;
    p.potions--;
    const heal = Math.round(p.maxHp * (0.5 + p.potionHealBonus));
    p.hp = Math.min(p.maxHp, p.hp + heal);
    this.floatText(p.x, p.y - 32, '+' + heal, '#4ade80', 19);
    this.burst(p.x, p.y, '#4ade80', 16, 170);
    this.ring(p.x, p.y, '#4ade80', 6, 60, 0.5);
    sfx.potion();
    this.log('🧪 使用药水，恢复 ' + heal + ' 生命', '#4ade80');
    this.emitHud();
  }

  private spawnMob(): void {
    const p = this.player;
    const wPx = this.world.width * TILE;
    const hPx = this.world.height * TILE;
    const anchors: Array<{ x: number; y: number }> = [{ x: p.x, y: p.y }];
    if (this.playMode === 'online') {
      for (let i = 0; i < this.remotePlayers.length; i++) {
        const rp = this.remotePlayers[i];
        anchors.push({ x: rp.x, y: rp.y });
      }
    }

    let bestCand: { x: number; y: number; score: number } | null = null;

    for (let a = 0; a < 36; a++) {
      const anchor = anchors[a % anchors.length];
      const ang = Math.random() * TAU;
      const d = rand(420, 960);
      const x = anchor.x + Math.cos(ang) * d;
      const y = anchor.y + Math.sin(ang) * d;
      if (x < 110 || y < 110 || x > wPx - 110 || y > hPx - 110) continue;
      if (!isFree(this.world.tiles, x, y, 18)) continue;
      if (this.isAnyMapPlayerWithin(x, y, 360)) continue;
      if (
        this.world.safeRadius > 0 &&
        Math.hypot(x - this.world.spawnX, y - this.world.spawnY) < this.world.safeRadius + 24
      ) {
        continue;
      }
      const spawnCheck = canSpawnMobAtPosition(
        x,
        y,
        this.mobs,
        MAX_MOBS_PER_CHUNK,
        MIN_MOB_SPAWN_SPACING,
        TILE,
        MOB_CHUNK_TILES
      );
      if (!spawnCheck.ok) {
        continue;
      }

      const roadBonus = isRoadAt(this.world.tiles, x, y) ? -2 : 0;
      const score = spawnCheck.chunkCount * 10 + roadBonus;
      if (!bestCand || score < bestCand.score) {
        bestCand = { x, y, score };
        if (score <= 0) break;
      }
    }

    if (!bestCand) return;
    const { x, y } = bestCand;
    const tier = tierAt(x, y, this.world);
    const base = this.pickMobTypeForTier(this.worldId, tier);
    const lv = getScaledMobLevel(tier, this.worldId, this.breakthroughTier, rand(-0.6, 0.9));
    const sc = getScaledMobStats(base.hp, base.atk, base.exp, this.worldId, this.breakthroughTier, tier);

    const mob = this.acquireMob(
      base,
      x,
      y,
      lv,
      sc.hp,
      sc.atk,
      sc.exp,
      base.spd * sc.speedMult,
      base.aggro,
      rand(0, 1),
      rand(1.4, 3.2)
    );
    if (this.started && (lv >= 2 || tier >= 0.45) && Math.random() < 0.24) {
      this.promoteMobToElite(mob, pickEliteAffix());
    }
  }

  private resolveBossArchetype(rawId: string): string {
    const id = rawId.toLowerCase();
    if (id.includes('treant') || id.includes('grove') || id.includes('flora')) return 'treant';
    if (id.includes('siren') || id.includes('frost') || id.includes('aqua') || id.includes('lake')) return 'siren';
    if (id.includes('void') || id.includes('abyss') || id.includes('eye') || id.includes('shadow')) return 'void';
    if (id.includes('titan') || id.includes('golem') || id.includes('colossus')) return 'titan';
    if (id.includes('demon') || id.includes('flame') || id.includes('lava') || id.includes('dragon')) return 'demon';
    return 'tower';
  }

  private spawnFixedBoss(
    arena: FixedBossArena,
    dungeonFloorDef?: DungeonFloorDef,
    dungeonPlayerCount = 1
  ): void {
    const arenaTier = Math.max(1, Math.round(tierAt(arena.x, arena.y, this.world)));
    const scaled = getScaledBossStats(
      this.worldId,
      this.breakthroughTier,
      arenaTier,
      dungeonFloorDef?.floor,
      dungeonPlayerCount
    );
    const lv = scaled.level;
    const maxHp = Math.round(scaled.maxHp * (dungeonFloorDef ? 1 : arena.hpMult));
    const atk = Math.round(scaled.atk * (dungeonFloorDef ? 1 : arena.atkMult));
    const bossName = dungeonFloorDef?.bossName ?? arena.name;
    const bossTitle = dungeonFloorDef?.bossTitle ?? arena.title;
    const bossColor = dungeonFloorDef?.bossColor ?? arena.color;
    const archetype = this.resolveBossArchetype(dungeonFloorDef?.bossId ?? arena.id);

    this.activeFixedBossArena = arena;
    this.boss = {
      netId: this.nextEntityNetId('b'),
      syncTargetX: arena.x,
      syncTargetY: arena.y,
      fixedBossId: dungeonFloorDef ? dungeonFloorDef.bossId : arena.id,
      title: bossTitle,
      bossArchetype: archetype,
      arenaX: arena.x,
      arenaY: arena.y,
      x: arena.x,
      y: arena.y,
      r: arena.r,
      collR: 26,
      name: bossName,
      level: lv,
      maxHp,
      hp: maxHp,
      atk,
      speed: scaled.speed,
      state: 'idle',
      stateTimer: 1.2,
      atkCd: 2.0,
      hitFlash: 0,
      lunge: 0,
      phase: Math.random() * TAU,
      chargeDir: 0,
      chargeHit: false,
      slamR: 0,
      slamT: 0,
      rage: 0,
      stunTimer: 0,
      freezeTimer: 0,
      knockVx: 0,
      knockVy: 0,
      shieldHp: 0,
      shieldTimer: 0,
      reflectRatio: 0,
      evadeCd: 2.2,
      skillCds: { special: 3.5 },
    };
    this.toast(`⚠ ${bossName} (${bossTitle}) 苏醒！`);
    this.log(`⚠ 领主【${bossName} Lv.${lv}】在 ${bossTitle} 降临！`, bossColor);
    sfx.boss();
    this.camShake = 16;
    this.ring(arena.x, arena.y, bossColor, 20, 220, 0.8);
    if (this.playMode === 'online' && peerRoomClient.isConnected() && this.isMapEntityAuthority()) {
      this.broadcastWorldEntitiesNow();
    }
    this.emitHud();
  }

  private updateMobs(dt: number): void {
    const p = this.player;
    const startSeq = this.worldResetSeq;
    const isAuthority = this.isMapEntityAuthority();

    if (!isAuthority) {
      const lerpAlpha = Math.min(1, dt * 15);
      for (let i = this.mobs.length - 1; i >= 0; i--) {
        if (this.worldResetSeq !== startSeq) break;
        if (i >= this.mobs.length) continue;
        const m = this.mobs[i];
        if (!m) continue;
        m.atkCd = Math.max(0, m.atkCd - dt);
        m.chargeCd = Math.max(0, m.chargeCd - dt);
        m.hitFlash = Math.max(0, m.hitFlash - dt);
        m.hpBarTimer = Math.max(0, m.hpBarTimer - dt);
        m.lunge = Math.max(0, m.lunge - dt);
        m.stunTimer = Math.max(0, m.stunTimer - dt);
        m.freezeTimer = Math.max(0, m.freezeTimer - dt);
        const speedMult = m.freezeTimer > 0 ? 0.35 : 1;
        m.phase += dt * 3 * speedMult;

        if (m.syncTargetX !== undefined && m.syncTargetY !== undefined) {
          const jumpD = Math.hypot(m.syncTargetX - m.x, m.syncTargetY - m.y);
          if (jumpD > 420) {
            m.x = m.syncTargetX;
            m.y = m.syncTargetY;
          } else if (jumpD > 0.25) {
            m.x = lerp(m.x, m.syncTargetX, lerpAlpha);
            m.y = lerp(m.y, m.syncTargetY, lerpAlpha);
          }
        }

        if (m.stunTimer <= 0 && !m.ranged && p.hp > 0 && !this.isInSafeZoneAt(p.x, p.y)) {
          const d = Math.hypot(p.x - m.x, p.y - m.y);
          if (d <= m.r + p.r + 8 && m.atkCd <= 0) {
            m.atkCd = m.atkSpeed * (m.freezeTimer > 0 ? 1.5 : 1);
            m.lunge = 0.18;
            this.damagePlayer(m.atk, m);
            if (this.worldResetSeq !== startSeq || p.hp <= 0) break;
          }
        }
      }
      return;
    }

    const emitMobProj = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      r: number,
      dmg: number,
      life: number,
      color: string,
      freezeSec = 0
    ) => {
      this.spawnProjectile(x, y, vx, vy, r, dmg, life, 'mob', color, { freezeSec });
      if (this.playMode === 'online' && peerRoomClient.isConnected()) {
        peerRoomClient.sendWorldAction({
          mapKey: this.getCurrentMapKey(),
          action: { kind: 'mob_proj', x, y, vx, vy, r, dmg, life, color, freezeSec },
        });
      }
    };

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      if (this.worldResetSeq !== startSeq) break;
      if (i >= this.mobs.length) continue;
      const m = this.mobs[i];
      if (!m) continue;

      m.atkCd = Math.max(0, m.atkCd - dt);
      m.chargeCd = Math.max(0, m.chargeCd - dt);
      m.hitFlash = Math.max(0, m.hitFlash - dt);
      m.hpBarTimer = Math.max(0, m.hpBarTimer - dt);
      m.lunge = Math.max(0, m.lunge - dt);
      m.stunTimer = Math.max(0, m.stunTimer - dt);
      m.freezeTimer = Math.max(0, m.freezeTimer - dt);

      if (Math.abs(m.knockVx) > 1 || Math.abs(m.knockVy) > 1) {
        const kbResistance = m.behavior === 'tank' ? 0.45 : 1;
        moveEnt(this.world.tiles, m, m.knockVx * kbResistance * dt, m.knockVy * kbResistance * dt);
        const decay = Math.max(0, 1 - dt * 9);
        m.knockVx *= decay;
        m.knockVy *= decay;
      }

      if (m.stunTimer > 0) continue;

      const speedMult = m.freezeTimer > 0 ? 0.35 : 1;
      m.phase += dt * 3 * speedMult;

      const target = this.findNearestTargetTo(m.x, m.y, true);
      const d = target ? Math.hypot(target.x - m.x, target.y - m.y) : Infinity;
      if (target && d < m.aggro) {
        const ang = Math.atan2(target.y - m.y, target.x - m.x);
        if (m.behavior === 'charger' && m.chargeTime > 0) {
          m.chargeTime = Math.max(0, m.chargeTime - dt);
          moveEnt(
            this.world.tiles,
            m,
            Math.cos(m.chargeDir) * m.speed * 2.75 * speedMult * dt,
            Math.sin(m.chargeDir) * m.speed * 2.75 * speedMult * dt
          );
          if (d <= m.r + target.r + 8 && m.atkCd <= 0) {
            m.atkCd = m.atkSpeed;
            m.lunge = 0.22;
            if (target.isLocal) {
              this.damagePlayer(m.atk * 1.25, m);
              if (this.worldResetSeq !== startSeq || p.hp <= 0) break;
            }
          }
        } else if (m.behavior === 'orbiter') {
          const tangent = ang + Math.PI / 2;
          const radial = d < 160 ? -0.45 : d > 250 ? 0.65 : 0;
          const vx = (Math.cos(tangent) * 0.9 + Math.cos(ang) * radial) * m.speed * speedMult;
          const vy = (Math.sin(tangent) * 0.9 + Math.sin(ang) * radial) * m.speed * speedMult;
          moveEnt(this.world.tiles, m, vx * dt, vy * dt);
          if (m.ranged && m.atkCd <= 0 && d < 390) {
            m.atkCd = m.atkSpeed * (m.freezeTimer > 0 ? 1.5 : 1);
            emitMobProj(
              m.x,
              m.y,
              Math.cos(ang) * 320,
              Math.sin(ang) * 320,
              7.5,
              m.atk,
              2.1,
              m.eliteAffix === 'frozen' ? '#38bdf8' : m.color,
              m.eliteAffix === 'frozen' ? 1.3 : 0
            );
            m.lunge = 0.14;
          } else if (!m.ranged && d <= m.r + target.r + 10 && m.atkCd <= 0) {
            m.atkCd = m.atkSpeed;
            m.lunge = 0.16;
            if (target.isLocal) {
              this.damagePlayer(m.atk, m);
              if (this.worldResetSeq !== startSeq || p.hp <= 0) break;
            }
          }
        } else if (m.ranged || m.behavior === 'ranged') {
          if (d < 180) moveEnt(this.world.tiles, m, -Math.cos(ang) * m.speed * speedMult * dt, -Math.sin(ang) * m.speed * speedMult * dt);
          else if (d > 300) moveEnt(this.world.tiles, m, Math.cos(ang) * m.speed * speedMult * dt, Math.sin(ang) * m.speed * speedMult * dt);
          if (m.atkCd <= 0 && d < 410) {
            m.atkCd = m.atkSpeed * (m.freezeTimer > 0 ? 1.5 : 1);
            emitMobProj(
              m.x,
              m.y,
              Math.cos(ang) * 310,
              Math.sin(ang) * 310,
              8,
              m.atk,
              2.2,
              m.eliteAffix === 'frozen' ? '#38bdf8' : m.color,
              m.eliteAffix === 'frozen' ? 1.3 : 0
            );
            m.lunge = 0.15;
          }
        } else {
          if (m.behavior === 'charger' && m.chargeCd <= 0 && d > 85 && d < 240) {
            m.chargeCd = rand(3.2, 4.8);
            m.chargeTime = 0.42;
            m.chargeDir = ang;
            this.ring(m.x, m.y, m.color, 4, m.r * 2.2, 0.35);
          } else if (d > m.r + target.r + 8) {
            moveEnt(this.world.tiles, m, Math.cos(ang) * m.speed * speedMult * dt, Math.sin(ang) * m.speed * speedMult * dt);
          } else if (m.atkCd <= 0) {
            m.atkCd = m.atkSpeed * (m.freezeTimer > 0 ? 1.5 : 1);
            m.lunge = 0.18;
            if (target.isLocal) {
              this.damagePlayer(m.atk, m);
              if (this.worldResetSeq !== startSeq || p.hp <= 0) break;
            }
          }
        }
      } else {
        const hd = Math.hypot(m.homeX - m.x, m.homeY - m.y);
        if (hd > 40) {
          const a = Math.atan2(m.homeY - m.y, m.homeX - m.x);
          moveEnt(this.world.tiles, m, Math.cos(a) * m.speed * 0.4 * speedMult * dt, Math.sin(a) * m.speed * 0.4 * speedMult * dt);
        } else {
          const a = m.phase * 0.25;
          moveEnt(this.world.tiles, m, Math.cos(a) * m.speed * 0.16 * speedMult * dt, Math.sin(a) * m.speed * 0.16 * speedMult * dt);
        }
      }

      // 主城安全区屏障：禁止任何魔物踏入主城核心（副本大厅无安全区不触发）
      if (this.world.safeRadius > 0) {
        const cityDist = Math.hypot(m.x - this.world.spawnX, m.y - this.world.spawnY);
        if (cityDist < this.world.safeRadius - 8 && cityDist > 0.01) {
          const pushAng = Math.atan2(m.y - this.world.spawnY, m.x - this.world.spawnX);
          m.x = this.world.spawnX + Math.cos(pushAng) * (this.world.safeRadius - 4);
          m.y = this.world.spawnY + Math.sin(pushAng) * (this.world.safeRadius - 4);
          m.chargeTime = 0;
        }
      }
    }

    if (this.worldResetSeq !== startSeq) return;

    for (let i = 0; i < this.mobs.length; i++) {
      const a = this.mobs[i];
      if (!a) continue;
      for (let j = i + 1; j < this.mobs.length; j++) {
        const b = this.mobs[j];
        if (!b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dd = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (dd < min && dd > 0.001) {
          const push = (min - dd) * 0.5;
          const nx = dx / dd;
          const ny = dy / dd;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  private pickBossSignatureSkill(b: BossEntity): BossSkillKind {
    const inPhase2 = b.rage >= 0.45;
    if (b.shieldTimer <= 0 && (b.rage > 0.28 || b.bossArchetype === 'titan') && Math.random() < 0.26) {
      return 'def_shield';
    }
    const arch = b.bossArchetype ?? 'tower';
    const r = Math.random();
    if (arch === 'siren') {
      if (r < 0.28) return 'cc_freeze';
      if (r < 0.54) return 'spiral_storm';
      if (r < 0.78) return 'meteor_rain';
      return 'aoe_barrage';
    }
    if (arch === 'treant') {
      if (r < 0.28) return 'cc_pull';
      if (r < 0.55) return 'meteor_rain';
      if (r < 0.8) return 'aoe_nova';
      return 'spiral_storm';
    }
    if (arch === 'void') {
      if (r < 0.26) return 'blink_execute';
      if (r < 0.52) return 'cc_pull';
      if (r < 0.76) return 'cross_slash';
      return 'spiral_storm';
    }
    if (arch === 'titan') {
      if (r < 0.28) return 'cc_stun';
      if (r < 0.54) return 'meteor_rain';
      if (r < 0.78) return 'cross_slash';
      return 'dash_strike';
    }
    if (arch === 'demon') {
      if (r < 0.28) return 'blink_execute';
      if (r < 0.56) return 'meteor_rain';
      if (r < 0.8) return 'cross_slash';
      return 'aoe_nova';
    }
    const pool: BossSkillKind[] = inPhase2
      ? ['meteor_rain', 'cross_slash', 'spiral_storm', 'blink_execute', 'aoe_barrage', 'cc_stun', 'aoe_nova', 'cc_freeze', 'cc_pull', 'dash_strike']
      : ['meteor_rain', 'cross_slash', 'aoe_barrage', 'cc_stun', 'aoe_nova', 'cc_freeze', 'cc_pull', 'dash_strike'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private updateBoss(dt: number): void {
    const startSeq = this.worldResetSeq;
    const b = this.boss;
    const p = this.player;
    if (!b) return;

    const wPx = this.world.width * TILE;
    const hPx = this.world.height * TILE;

    b.hitFlash = Math.max(0, b.hitFlash - dt);
    b.lunge = Math.max(0, b.lunge - dt);
    b.attackAnim = Math.max(0, (b.attackAnim ?? 0) - dt);
    b.stunTimer = Math.max(0, b.stunTimer - dt);
    b.freezeTimer = Math.max(0, b.freezeTimer - dt);
    b.atkCd = Math.max(0, b.atkCd - dt);
    b.evadeCd = Math.max(0, b.evadeCd - dt);
    if (b.shieldTimer > 0) {
      b.shieldTimer = Math.max(0, b.shieldTimer - dt);
      if (b.shieldTimer <= 0) {
        b.shieldHp = 0;
        b.reflectRatio = 0;
      }
    }
    b.skillCds.special = Math.max(0, (b.skillCds.special ?? 0) - dt);
    const prevRage = b.rage;
    b.rage = clamp(1 - b.hp / b.maxHp, 0, 1);
    if (prevRage < 0.5 && b.rage >= 0.5) {
      this.ring(b.x, b.y, '#f43f5e', b.r * 0.8, 220, 0.7);
      this.burst(b.x, b.y, '#fbbf24', 36, 300);
      this.floatText(b.x, b.y - b.r - 24, '🔥 霸主狂暴二阶段!', '#f43f5e', 17);
      this.camShake = Math.max(this.camShake, 11);
      sfx.boss();
    }
    const inPhase2 = b.rage >= 0.5;
    const speedMult = (b.freezeTimer > 0 ? 0.5 : 1) * (inPhase2 ? 1.18 : 1);

    if (!this.isMapEntityAuthority()) {
      const lerpAlpha = Math.min(1, dt * 15);
      if (b.syncTargetX !== undefined && b.syncTargetY !== undefined) {
        const jumpD = Math.hypot(b.syncTargetX - b.x, b.syncTargetY - b.y);
        if (jumpD > 420) {
          b.x = b.syncTargetX;
          b.y = b.syncTargetY;
        } else if (jumpD > 0.25) {
          b.x = lerp(b.x, b.syncTargetX, lerpAlpha);
          b.y = lerp(b.y, b.syncTargetY, lerpAlpha);
        }
      }
      b.phase += dt * 2.4 * speedMult;
      if (b.telegraph) {
        b.telegraph.timer = Math.max(0, b.telegraph.timer - dt);
      }
      if (b.stunTimer <= 0 && b.state !== 'charge' && p.hp > 0 && dist(b, p) < b.r + p.r - 4) {
        if (b.atkCd <= 0) {
          b.atkCd = 1.1;
          this.damagePlayer(b.atk * 0.7);
        }
      }
      return;
    }

    if (Math.abs(b.knockVx) > 1 || Math.abs(b.knockVy) > 1) {
      moveEnt(this.world.tiles, b, b.knockVx * dt, b.knockVy * dt);
      const decay = Math.max(0, 1 - dt * 10);
      b.knockVx *= decay;
      b.knockVy *= decay;
    }

    if (b.stunTimer > 0) return;
    b.phase += dt * 2.4 * speedMult;
    b.stateTimer -= dt;

    const target = this.findNearestTargetTo(b.x, b.y, false) ?? (p.hp > 0 ? { x: p.x, y: p.y, r: p.r, isLocal: true } : null);
    const txTarget = target ? target.x : b.x;
    const tyTarget = target ? target.y : b.y;
    const d = target ? Math.hypot(txTarget - b.x, tyTarget - b.y) : Infinity;
    const ang = target ? Math.atan2(tyTarget - b.y, txTarget - b.x) : (b.facingAng ?? 0);
    if (b.state === 'idle' || b.state === 'telegraph' || b.state === 'slam' || b.state === 'summon') {
      b.facingAng = ang;
    } else {
      b.facingAng = b.chargeDir;
    }

    const triggerBossSwing = (duration = 0.45) => {
      b.attackAnim = duration;
      b.attackAnimTotal = duration;
      b.lunge = Math.max(b.lunge, 0.22);
    };
    const isTridentBoss =
      b.bossArchetype === 'tower' ||
      b.bossArchetype === 'titan' ||
      b.bossArchetype === 'siren' ||
      b.bossArchetype === 'treant';
    const bossProjShape = isTridentBoss ? 'trident' : 'crescent';

    const fireBossProj = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      r: number,
      dmg: number,
      life: number,
      color: string,
      shape: 'orb' | 'trident' | 'crescent'
    ) => {
      this.spawnProjectile(x, y, vx, vy, r, dmg, life, 'mob', color, { shape });
      if (this.playMode === 'online' && peerRoomClient.isConnected()) {
        peerRoomClient.sendWorldAction({
          mapKey: this.getCurrentMapKey(),
          action: { kind: 'mob_proj', x, y, vx, vy, r, dmg, life, color, shape },
        });
      }
    };

    const broadcastBossAoe = (
      skillKind: BossSkillKind | 'slam',
      x: number,
      y: number,
      r: number,
      color: string,
      subTargets?: { x: number; y: number; r?: number }[],
      destX?: number,
      destY?: number
    ) => {
      if (this.playMode === 'online' && peerRoomClient.isConnected()) {
        peerRoomClient.sendWorldAction({
          mapKey: this.getCurrentMapKey(),
          action: { kind: 'boss_aoe', skillKind, x, y, r, atk: b.atk, inPhase2, color, subTargets, destX, destY },
        });
      }
    };

    if (b.state === 'idle') {
      // 高智商 Boss：感应来袭玩家弹道并横向闪避
      if (b.evadeCd <= 0) {
        const threat = this.projectiles.find((pr) => {
          if (pr.team !== 'player') return false;
          const distToBoss = Math.hypot(b.x - pr.x, b.y - pr.y);
          if (distToBoss > 175) return false;
          return (b.x - pr.x) * pr.vx + (b.y - pr.y) * pr.vy > 0;
        });
        if (threat) {
          b.state = 'evade';
          b.stateTimer = 0.28;
          b.evadeCd = Math.max(1.5, 2.8 - b.rage * 0.9);
          b.chargeDir =
            Math.atan2(threat.vy, threat.vx) + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
          b.facingAng = b.chargeDir;
          this.ring(b.x, b.y, '#38bdf8', b.r * 0.7, b.r * 2.1, 0.28);
          this.floatText(b.x, b.y - b.r - 12, '瞬步闪避!', '#7dd3fc', 13);
          return;
        }
      }

      if (d > 80) {
        moveEnt(this.world.tiles, b, Math.cos(ang) * b.speed * speedMult * dt, Math.sin(ang) * b.speed * speedMult * dt);
      }
      if (b.stateTimer <= 0) {
        if ((b.skillCds.special ?? 0) <= 0 && Math.random() < (inPhase2 ? 0.8 : 0.68)) {
          const skillKind = this.pickBossSignatureSkill(b);
          b.skillCds.special = Math.max(2.6, 4.8 - b.rage * 1.6);
          if (skillKind === 'def_shield') {
            b.shieldHp = Math.round(b.maxHp * (inPhase2 ? 0.18 : 0.14));
            b.shieldTimer = 4.5;
            b.reflectRatio = b.bossArchetype === 'void' || b.bossArchetype === 'tower' ? 0.16 : 0.08;
            triggerBossSwing(0.38);
            this.ring(b.x, b.y, '#38bdf8', 12, b.r * 2.6, 0.5);
            this.ring(b.x, b.y, '#e0f2fe', b.r * 0.6, b.r * 1.9, 0.35);
            this.floatText(
              b.x,
              b.y - b.r - 14,
              b.reflectRatio > 0 ? '反伤圣盾!' : '防御护盾!',
              '#38bdf8',
              15
            );
            b.stateTimer = 0.85;
            return;
          }

          const colorMap: Record<BossSkillKind, string> = {
            cc_stun: '#fbbf24',
            cc_freeze: '#38bdf8',
            cc_pull: '#c084fc',
            def_shield: '#38bdf8',
            aoe_nova: '#f43f5e',
            aoe_barrage: '#fb923c',
            dash_strike: '#ef4444',
            meteor_rain: '#f97316',
            cross_slash: '#e879f9',
            spiral_storm: '#38bdf8',
            blink_execute: '#f43f5e',
          };
          const radiusMap: Record<BossSkillKind, number> = {
            cc_stun: 165,
            cc_freeze: 190,
            cc_pull: 235,
            def_shield: 120,
            aoe_nova: 215,
            aoe_barrage: 165,
            dash_strike: 145,
            meteor_rain: 92,
            cross_slash: 220,
            spiral_storm: 175,
            blink_execute: 140,
          };

          let tx = b.x;
          let ty = b.y;
          let subTargets: { x: number; y: number; r?: number }[] | undefined;
          if (skillKind === 'cc_stun' || skillKind === 'dash_strike' || skillKind === 'blink_execute') {
            tx = txTarget;
            ty = tyTarget;
          } else if (skillKind === 'meteor_rain') {
            tx = txTarget;
            ty = tyTarget;
            const meteorCount = inPhase2 ? 6 : 4;
            subTargets = [{ x: txTarget, y: tyTarget, r: 90 }];
            for (let m = 1; m < meteorCount; m++) {
              const ma = (TAU * m) / meteorCount + Math.random() * 0.6;
              const md = rand(85, 195);
              subTargets.push({
                x: clamp(txTarget + Math.cos(ma) * md, 60, wPx - 60),
                y: clamp(tyTarget + Math.sin(ma) * md, 60, hPx - 60),
                r: 86,
              });
            }
          }

          const rTele = radiusMap[skillKind];
          const windup = skillKind === 'blink_execute' ? 0.72 : skillKind === 'spiral_storm' ? 0.8 : 0.92;
          b.state = 'telegraph';
          b.stateTimer = windup + 0.1;
          b.telegraph = {
            kind: skillKind,
            x: tx,
            y: ty,
            r: rTele,
            timer: windup,
            maxTimer: windup,
            ang,
            color: colorMap[skillKind],
            subTargets,
          };
          if (subTargets && subTargets.length > 0) {
            for (const st of subTargets) {
              this.spawnWarning(st.x, st.y, st.r ?? rTele, windup, colorMap[skillKind]);
            }
          } else {
            this.spawnWarning(tx, ty, rTele, windup, colorMap[skillKind]);
          }
          if (this.playMode === 'online' && peerRoomClient.isConnected()) {
            this.broadcastWorldEntitiesNow();
          }
          return;
        }

        const roll = Math.random();
        if (roll < 0.42) {
          b.state = 'charge';
          b.stateTimer = 1.05;
          b.chargeDir = ang;
          b.facingAng = ang;
          b.chargeHit = false;
          triggerBossSwing(0.5);
          this.ring(b.x, b.y, '#f97316', 10, 120, 0.4);
          sfx.slam();
        } else if (roll < 0.78) {
          b.state = 'slam';
          b.stateTimer = 1.15;
          b.slamR = 0;
          b.slamT = 0;
          this.spawnWarning(b.x, b.y, 195, 1.0, '#ef4444');
          if (this.playMode === 'online' && peerRoomClient.isConnected()) {
            this.broadcastWorldEntitiesNow();
          }
        } else {
          b.state = 'summon';
          b.stateTimer = 0.75;
          triggerBossSwing(0.4);
        }
      }
    } else if (b.state === 'evade') {
      const sp = b.speed * 3.8 * speedMult;
      moveEnt(this.world.tiles, b, Math.cos(b.chargeDir) * sp * dt, Math.sin(b.chargeDir) * sp * dt);
      b.x = clamp(b.x, 60, wPx - 60);
      b.y = clamp(b.y, 60, hPx - 60);
      this.burst(b.x, b.y, '#38bdf8', 2, 70);
      if (b.stateTimer <= 0) {
        b.state = 'idle';
        b.stateTimer = 0.42;
      }
    } else if (b.state === 'telegraph' && b.telegraph) {
      b.telegraph.timer -= dt;
      if (b.telegraph.timer <= 0) {
        const tg = b.telegraph;
        const col = tg.color ?? '#f43f5e';
        triggerBossSwing(0.48);
        this.ring(tg.x, tg.y, col, 16, tg.r, 0.52);
        this.ring(tg.x, tg.y, '#fef08a', 8, tg.r * 0.68, 0.34);
        this.burst(tg.x, tg.y, col, 32, 290);
        this.camShake = Math.max(this.camShake, 12);

        if (tg.kind === 'cc_stun') {
          sfx.slam();
          this.floatText(b.x, b.y - b.r - 18, '⚡ 主宰雷狱!', '#fbbf24', 15);
          broadcastBossAoe('cc_stun', tg.x, tg.y, tg.r, col);
          if (Math.hypot(p.x - tg.x, p.y - tg.y) <= tg.r) {
            p.stunTimer = Math.max(p.stunTimer, 1.1);
            this.damagePlayer(b.atk * 1.15);
            this.floatText(p.x, p.y - 34, '眩晕!', '#fbbf24', 15);
            if (this.worldResetSeq !== startSeq || this.boss !== b || p.hp <= 0) return;
          }
        } else if (tg.kind === 'cc_freeze') {
          sfx.ice();
          this.floatText(b.x, b.y - b.r - 18, '❄️ 极寒潮汐!', '#38bdf8', 15);
          broadcastBossAoe('cc_freeze', tg.x, tg.y, tg.r, col);
          if (Math.hypot(p.x - tg.x, p.y - tg.y) <= tg.r) {
            p.slowTimer = Math.max(p.slowTimer, 2.4);
            this.damagePlayer(b.atk * 1.05);
            this.floatText(p.x, p.y - 34, '极寒减速!', '#38bdf8', 15);
            if (this.worldResetSeq !== startSeq || this.boss !== b || p.hp <= 0) return;
          }
        } else if (tg.kind === 'cc_pull') {
          sfx.arcane();
          this.floatText(b.x, b.y - b.r - 18, '🌀 虚空坍缩!', '#c084fc', 15);
          broadcastBossAoe('cc_pull', tg.x, tg.y, tg.r, col);
          if (Math.hypot(p.x - tg.x, p.y - tg.y) <= tg.r) {
            const pullAng = Math.atan2(b.y - p.y, b.x - p.x);
            moveEnt(this.world.tiles, p, Math.cos(pullAng) * 110, Math.sin(pullAng) * 110, true);
            this.damagePlayer(b.atk * 1.1);
            this.floatText(p.x, p.y - 34, '引力牵引!', '#c084fc', 15);
            if (this.worldResetSeq !== startSeq || this.boss !== b || p.hp <= 0) return;
          }
        } else if (tg.kind === 'aoe_barrage') {
          sfx.fire();
          this.floatText(b.x, b.y - b.r - 18, isTridentBoss ? '🔱 破空剑气波!' : '🌙 裂空月牙阵!', col, 15);
          const baseAng = Math.atan2(tyTarget - b.y, txTarget - b.x);
          const half = inPhase2 ? 3 : 2;
          for (let k = -half; k <= half; k++) {
            const a = baseAng + k * 0.22;
            fireBossProj(
              b.x + Math.cos(a) * b.r,
              b.y + Math.sin(a) * b.r,
              Math.cos(a) * 370,
              Math.sin(a) * 370,
              12,
              b.atk * 0.96,
              2.2,
              col,
              bossProjShape
            );
          }
        } else if (tg.kind === 'aoe_nova') {
          sfx.boss();
          this.floatText(b.x, b.y - b.r - 18, b.bossArchetype === 'treant' ? '🌿 森罗万象!' : '🔥 炼狱震爆!', col, 15);
          broadcastBossAoe('aoe_nova', tg.x, tg.y, tg.r, col);
          if (Math.hypot(p.x - tg.x, p.y - tg.y) <= tg.r) {
            this.damagePlayer(b.atk * 1.42);
            if (this.worldResetSeq !== startSeq || this.boss !== b || p.hp <= 0) return;
          }
        } else if (tg.kind === 'dash_strike') {
          sfx.slam();
          this.floatText(b.x, b.y - b.r - 18, '⚔️ 圣戟裂地斩!', '#fbbf24', 15);
          const dashAng = Math.atan2(tg.y - b.y, tg.x - b.x);
          b.facingAng = dashAng;
          const jumpDist = Math.min(240, Math.hypot(tg.x - b.x, tg.y - b.y));
          moveEnt(this.world.tiles, b, Math.cos(dashAng) * jumpDist, Math.sin(dashAng) * jumpDist, true);
          this.ring(b.x, b.y, '#fbbf24', 18, b.r * 3.1, 0.42);
          for (let k = -1; k <= 1; k++) {
            const waveAng = dashAng + k * 0.26;
            fireBossProj(
              b.x + Math.cos(waveAng) * (b.r * 0.9),
              b.y + Math.sin(waveAng) * (b.r * 0.9),
              Math.cos(waveAng) * 355,
              Math.sin(waveAng) * 355,
              12,
              b.atk * 0.9,
              1.6,
              col,
              bossProjShape
            );
          }
          broadcastBossAoe('dash_strike', b.x, b.y, b.r + 64, '#fbbf24');
          if (dist(b, p) <= b.r + p.r + 64) {
            this.damagePlayer(b.atk * 1.38);
            if (this.worldResetSeq !== startSeq || this.boss !== b || p.hp <= 0) return;
          }
        } else if (tg.kind === 'meteor_rain') {
          sfx.fire();
          this.floatText(b.x, b.y - b.r - 18, '☄️ 天降星陨!', '#f97316', 16);
          const targets = tg.subTargets && tg.subTargets.length > 0 ? tg.subTargets : [{ x: tg.x, y: tg.y, r: tg.r }];
          broadcastBossAoe('meteor_rain', tg.x, tg.y, tg.r, '#f97316', targets);
          let hitPlayer = false;
          for (const st of targets) {
            const mr = st.r ?? 88;
            this.ring(st.x, st.y, '#fb923c', 12, mr, 0.55);
            this.ring(st.x, st.y, '#fde047', 6, mr * 0.6, 0.36);
            this.burst(st.x, st.y, '#f97316', 22, 240);
            if (!hitPlayer && Math.hypot(p.x - st.x, p.y - st.y) <= mr) {
              hitPlayer = true;
              this.damagePlayer(b.atk * (inPhase2 ? 1.48 : 1.32));
              if (this.worldResetSeq !== startSeq || this.boss !== b || p.hp <= 0) return;
            }
          }
        } else if (tg.kind === 'cross_slash') {
          sfx.slam();
          this.floatText(b.x, b.y - b.r - 18, '✨ 十字星辉斩!', '#e879f9', 16);
          const arms = inPhase2 ? 8 : 4;
          const baseA = tg.ang ?? ang;
          for (let k = 0; k < arms; k++) {
            const wa = baseA + (TAU * k) / arms;
            fireBossProj(
              b.x + Math.cos(wa) * (b.r * 0.8),
              b.y + Math.sin(wa) * (b.r * 0.8),
              Math.cos(wa) * 390,
              Math.sin(wa) * 390,
              13,
              b.atk * 1.05,
              1.9,
              col,
              'crescent'
            );
          }
          broadcastBossAoe('cross_slash', b.x, b.y, 135, col);
          if (dist(b, p) <= 135) {
            this.damagePlayer(b.atk * 1.25);
            if (this.worldResetSeq !== startSeq || this.boss !== b || p.hp <= 0) return;
          }
        } else if (tg.kind === 'spiral_storm') {
          sfx.arcane();
          this.floatText(b.x, b.y - b.r - 18, '🌪️ 苍穹风暴阵!', '#38bdf8', 16);
          const count = inPhase2 ? 14 : 10;
          const baseA = b.phase * 1.3;
          for (let k = 0; k < count; k++) {
            const wa = baseA + (TAU * k) / count;
            const spd = k % 2 === 0 ? 330 : 255;
            fireBossProj(
              b.x + Math.cos(wa) * b.r,
              b.y + Math.sin(wa) * b.r,
              Math.cos(wa) * spd,
              Math.sin(wa) * spd,
              10,
              b.atk * 0.88,
              2.5,
              k % 2 === 0 ? '#38bdf8' : '#a855f7',
              bossProjShape
            );
          }
        } else if (tg.kind === 'blink_execute') {
          sfx.boss();
          this.floatText(b.x, b.y - b.r - 18, '⚡ 瞬影绝斩!', '#f43f5e', 16);
          this.burst(b.x, b.y, '#c084fc', 24, 220);
          const blinkAng = Math.atan2(tg.y - b.y, tg.x - b.x);
          const destX = clamp(tg.x - Math.cos(blinkAng) * 52, 60, wPx - 60);
          const destY = clamp(tg.y - Math.sin(blinkAng) * 52, 60, hPx - 60);
          if (isFree(this.world.tiles, destX, destY, b.collR)) {
            b.x = destX;
            b.y = destY;
          }
          b.facingAng = Math.atan2(tyTarget - b.y, txTarget - b.x);
          this.ring(b.x, b.y, '#f43f5e', 14, 155, 0.45);
          this.burst(b.x, b.y, '#fbbf24', 28, 280);
          broadcastBossAoe('blink_execute', b.x, b.y, b.r + 86, '#f43f5e', undefined, b.x, b.y);
          if (dist(b, p) <= b.r + p.r + 86) {
            this.damagePlayer(b.atk * (inPhase2 ? 1.55 : 1.38));
            if (this.worldResetSeq !== startSeq || this.boss !== b || p.hp <= 0) return;
          }
        }

        b.telegraph = undefined;
        b.state = 'idle';
        b.stateTimer = rand(0.95, 1.55) / (1 + b.rage * 0.65);
      }
    } else if (b.state === 'charge') {
      const sp = b.speed * 3.4 * speedMult;
      moveEnt(this.world.tiles, b, Math.cos(b.chargeDir) * sp * dt, Math.sin(b.chargeDir) * sp * dt);
      b.x = clamp(b.x, 60, wPx - 60);
      b.y = clamp(b.y, 60, hPx - 60);
      this.burst(b.x, b.y, '#f97316', 1, 60);
      if (!b.chargeHit && dist(b, p) < b.r + p.r + 6) {
        b.chargeHit = true;
        triggerBossSwing(0.42);
        this.damagePlayer(b.atk * 1.25);
        this.camShake = 10;
        if (this.worldResetSeq !== startSeq || this.boss !== b || p.hp <= 0) return;
      }
      if (b.stateTimer <= 0) {
        b.state = 'idle';
        b.stateTimer = rand(1.0, 1.8) / (1 + b.rage * 0.7);
      }
    } else if (b.state === 'slam') {
      b.slamT += dt;
      if (b.slamT >= 1.0 && b.slamR === 0) {
        b.slamR = 185;
        this.camShake = 18;
        sfx.slam();
        triggerBossSwing(0.5);
        this.ring(b.x, b.y, '#ef4444', 20, 200, 0.55);
        this.ring(b.x, b.y, '#fbbf24', 12, 135, 0.36);
        this.burst(b.x, b.y, '#f97316', 36, 320);
        if (isTridentBoss) {
          for (let k = -1; k <= 1; k++) {
            const waveAng = ang + k * 0.32;
            fireBossProj(
              b.x + Math.cos(waveAng) * b.r,
              b.y + Math.sin(waveAng) * b.r,
              Math.cos(waveAng) * 320,
              Math.sin(waveAng) * 320,
              12,
              b.atk * 0.8,
              1.4,
              '#fbbf24',
              'trident'
            );
          }
        }
        broadcastBossAoe('slam', b.x, b.y, 200, '#ef4444');
        if (dist(b, p) < 200) {
          this.damagePlayer(b.atk * 1.42);
          if (this.worldResetSeq !== startSeq || this.boss !== b || p.hp <= 0) return;
        }
      }
      if (b.stateTimer <= 0) {
        b.state = 'idle';
        b.stateTimer = rand(1.0, 1.7) / (1 + b.rage * 0.8);
      }
    } else if (b.state === 'summon') {
      if (b.stateTimer <= 0) {
        const summonWorld = this.worldId === 'dungeon' ? 'dungeon' : this.worldId;
        const worldPool = MOB_TYPES_BY_WORLD[summonWorld];
        const dungeonFloor = this.currentDungeonFloor ?? 1;
        const dungeonPlayers = this.getDungeonParticipantCount();
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * TAU;
          const dd = rand(70, 120);
          const sx = b.x + Math.cos(a) * dd;
          const sy = b.y + Math.sin(a) * dd;
          if (!isFree(this.world.tiles, sx, sy, 16)) continue;
          const base = worldPool[Math.floor(Math.random() * worldPool.length)] ?? MOB_TYPES[0];
          const sc =
            summonWorld === 'dungeon'
              ? getScaledDungeonMobStats(base.hp, base.atk, base.exp, dungeonFloor, dungeonPlayers)
              : getScaledMobStats(base.hp, base.atk, base.exp, summonWorld, this.breakthroughTier, 2);
          this.acquireMob(
            base,
            sx,
            sy,
            b.level,
            Math.round(sc.hp * 1.15),
            sc.atk,
            sc.exp,
            base.spd * sc.speedMult,
            400,
            1,
            2.5
          );
          this.ring(sx, sy, '#c084fc', 5, 60, 0.4);
        }
        b.state = 'idle';
        b.stateTimer = rand(1.2, 2.0);
        if (this.playMode === 'online' && peerRoomClient.isConnected()) {
          this.broadcastWorldEntitiesNow();
        }
      }
    }

    if (b.state !== 'charge' && dist(b, p) < b.r + p.r - 4) {
      if (b.atkCd <= 0) {
        b.atkCd = 1.1;
        this.damagePlayer(b.atk * 0.7);
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const p = this.player;
    const startSeq = this.worldResetSeq;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (this.worldResetSeq !== startSeq) break;
      if (i >= this.projectiles.length) continue;
      const pr = this.projectiles[i];
      if (!pr) continue;
      pr.life -= dt;
      if (pr.life <= 0) {
        this.releaseProjectileAt(i);
        continue;
      }

      for (let tIdx = 0; tIdx < pr.trail.length; tIdx++) {
        if (pr.trail[tIdx].life > 0) pr.trail[tIdx].life -= dt;
      }
      const cursor = pr.trailCursor ?? 0;
      const slot = pr.trail[cursor];
      if (slot) {
        slot.x = pr.x;
        slot.y = pr.y;
        slot.life = 0.25;
        pr.trailCursor = (cursor + 1) % pr.trail.length;
      }

      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;

      // 弓箭与魔法投射物可以飞越水面，仅在碰到树木、岩石或边界时消失
      if (blocksProjectile(this.world.tiles, pr.x, pr.y)) {
        this.burst(pr.x, pr.y, pr.color, 11, 150);
        this.releaseProjectileAt(i);
        continue;
      }

      if (pr.team === 'player') {
        const effCrit = this.getEffectiveCritChance();
        const projDmgBase = pr.dmg * (pr.isFire ? this.weather.fireDmgMult : 1);
        let hitTarget: MobEntity | BossEntity | null = null;
        for (let j = this.mobs.length - 1; j >= 0; j--) {
          if (this.worldResetSeq !== startSeq) break;
          if (j >= this.mobs.length) continue;
          const m = this.mobs[j];
          if (!m) continue;
          if (pr.hitSet?.has(m)) continue;
          if (Math.hypot(m.x - pr.x, m.y - pr.y) < m.r + pr.r) {
            const { dmg, crit } = rollDamage(projDmgBase, effCrit, false, Math.random, p.critDmgMult, p.critDisabled);
            if (pr.freezeSec) m.freezeTimer = Math.max(m.freezeTimer, pr.freezeSec);
            if (pr.stunSec) m.stunTimer = Math.max(m.stunTimer, pr.stunSec);
            this.damageMob(m, dmg, crit, pr.x - pr.vx * 0.05, pr.y - pr.vy * 0.05, 165, {
              freezeSec: pr.freezeSec,
              stunSec: pr.stunSec,
            });
            if (this.worldResetSeq !== startSeq) return;
            if (pr.lifestealRatio) {
              const heal = Math.max(1, Math.round(dmg * pr.lifestealRatio));
              p.hp = Math.min(p.maxHp, p.hp + heal);
            }
            pr.hitSet?.add(m);
            hitTarget = m;
            break;
          }
        }
        if (this.worldResetSeq !== startSeq) return;
        if (!hitTarget && this.boss && !pr.hitSet?.has(this.boss) && Math.hypot(this.boss.x - pr.x, this.boss.y - pr.y) < this.boss.r + pr.r) {
          const { dmg, crit } = rollDamage(projDmgBase, effCrit, false, Math.random, p.critDmgMult, p.critDisabled);
          if (pr.freezeSec) this.boss.freezeTimer = Math.max(this.boss.freezeTimer, pr.freezeSec * 0.5);
          if (pr.stunSec) this.boss.stunTimer = Math.max(this.boss.stunTimer, pr.stunSec * 0.4);
          this.damageBoss(dmg, crit, pr.x - pr.vx * 0.05, pr.y - pr.vy * 0.05, 70, {
            freezeSec: pr.freezeSec ? pr.freezeSec * 0.5 : undefined,
            stunSec: pr.stunSec ? pr.stunSec * 0.4 : undefined,
          });
          if (this.worldResetSeq !== startSeq) return;
          if (pr.lifestealRatio) {
            const heal = Math.max(1, Math.round(dmg * pr.lifestealRatio));
            p.hp = Math.min(p.maxHp, p.hp + heal);
          }
          if (this.boss) pr.hitSet?.add(this.boss);
          hitTarget = this.boss ?? hitTarget;
        }

        if (hitTarget) {
          if (pr.explosive) {
            this.burst(pr.x, pr.y, pr.color, 22, 260);
            this.ring(pr.x, pr.y, pr.color, 6, 85, 0.35);
            this.camShake = Math.max(this.camShake, 5);
            for (let k = this.mobs.length - 1; k >= 0; k--) {
              if (this.worldResetSeq !== startSeq) break;
              if (k >= this.mobs.length) continue;
              const m = this.mobs[k];
              if (!m || m === hitTarget) continue;
              if (Math.hypot(m.x - pr.x, m.y - pr.y) < 88 + m.r) {
                if (pr.freezeSec) m.freezeTimer = Math.max(m.freezeTimer, pr.freezeSec);
                if (pr.stunSec) m.stunTimer = Math.max(m.stunTimer, pr.stunSec);
                const { dmg, crit } = rollDamage(projDmgBase * 0.65, effCrit, false, Math.random, p.critDmgMult, p.critDisabled);
                this.damageMob(m, dmg, crit, pr.x, pr.y, 190, {
                  freezeSec: pr.freezeSec,
                  stunSec: pr.stunSec,
                });
                if (this.worldResetSeq !== startSeq) return;
              }
            }
          } else {
            this.burst(pr.x, pr.y, pr.color, 12, 180);
            this.ring(pr.x, pr.y, pr.color, 4, 34, 0.25);
          }

          if (pr.pierce && pr.pierce > 0) {
            pr.pierce--;
          } else {
            this.releaseProjectileAt(i);
          }
        }
      } else {
        if (Math.hypot(p.x - pr.x, p.y - pr.y) < p.r + pr.r) {
          this.damagePlayer(pr.dmg);
          if (this.worldResetSeq !== startSeq) return;
          if (pr.freezeSec && pr.freezeSec > 0) {
            p.slowTimer = Math.max(p.slowTimer, pr.freezeSec);
            this.floatText(p.x, p.y - 36, '❄️ 冰霜迟缓', '#7dd3fc', 13);
            this.burst(p.x, p.y, '#38bdf8', 7, 120);
          }
          this.burst(pr.x, pr.y, pr.color, 13, 180);
          this.releaseProjectileAt(i);
        }
      }
    }
  }

  private damageMob(
    m: MobEntity,
    dmg: number,
    crit: boolean,
    fromX = this.player.x,
    fromY = this.player.y,
    knockPower = 180,
    opts?: {
      isRemoteHit?: boolean;
      attackerId?: string;
      attackerName?: string;
      stunSec?: number;
      freezeSec?: number;
    }
  ): void {
    const isRemote = Boolean(opts?.isRemoteHit);
    m.hitFlash = 0.16;
    m.hpBarTimer = 2.2;
    const ka = Math.atan2(m.y - fromY, m.x - fromX);
    const mult = crit ? 1.35 : 1;
    m.knockVx = Math.cos(ka) * knockPower * mult;
    m.knockVy = Math.sin(ka) * knockPower * mult;

    if (!isRemote) {
      this.registerComboHit(m.x, m.y, crit);
      this.floatText(
        m.x + rand(-8, 8),
        m.y - m.r - 6,
        (crit ? '暴击 ' : '') + dmg,
        crit ? '#fbbf24' : '#fff',
        crit ? 21 : 15
      );
      this.burst(m.x, m.y, m.color, crit ? 9 : 4, 140);
      if (crit) {
        sfx.crit();
        this.hitstop = Math.max(this.hitstop, 0.032);
      } else {
        sfx.hit();
      }
    }

    if (!this.isMapEntityAuthority() && !isRemote) {
      m.hp = Math.max(1, m.hp - dmg);
      if (m.netId) {
        peerRoomClient.sendEntityHit({
          mapKey: this.getCurrentMapKey(),
          targetKind: 'mob',
          targetId: m.netId,
          dmg,
          crit,
          fromX,
          fromY,
          knockPower,
          freezeSec: opts?.freezeSec,
          stunSec: opts?.stunSec,
          fromName: this.playerName,
        });
      }
      return;
    }

    if (opts?.stunSec) m.stunTimer = Math.max(m.stunTimer, opts.stunSec);
    if (opts?.freezeSec) m.freezeTimer = Math.max(m.freezeTimer, opts.freezeSec);
    m.hp -= dmg;
    if (isRemote) {
      this.floatText(
        m.x + rand(-8, 8),
        m.y - m.r - 6,
        (crit ? '暴击 ' : '') + dmg,
        crit ? '#fbbf24' : '#e2e8f0',
        crit ? 18 : 13
      );
      this.burst(m.x, m.y, m.color, 4, 110);
    }
    if (m.hp <= 0) {
      this.killMob(m, { killerId: opts?.attackerId, killerName: opts?.attackerName });
    }
  }

  private distributeExpAndLoot(
    totalExp: number,
    lootX: number,
    lootY: number,
    droppedGear?: GearItem,
    droppedBook?: SkillBookItem
  ): void {
    const p = this.player;
    if (this.playMode === 'online' && this.party && this.party.members.length > 1) {
      const uids = this.party.members.map((m) => m.uid);
      const shares = splitPartyExp(totalExp, uids, this.party.leaderUid, this.party.expShareRatio);
      const selfShare = shares[this.playerUid] ?? totalExp;
      this.gainExp(selfShare);
      const otherShares = uids
        .filter((u) => u !== this.playerUid)
        .map((u) => shares[u] ?? 0);
      const avgShare =
        otherShares.length > 0
          ? Math.round(otherShares.reduce((acc, v) => acc + v, 0) / otherShares.length)
          : 0;
      if (avgShare > 0) {
        peerRoomClient.broadcastPartyExp(avgShare, this.playerName);
      }
    } else {
      this.gainExp(totalExp);
    }

    if (droppedGear) {
      this.spawnDrop(lootX + rand(-16, 16), lootY + rand(-16, 16), 'gear', 1, 36, droppedGear);
    }
    if (droppedBook) {
      this.spawnDrop(lootX + rand(-18, 18), lootY + rand(-18, 18), 'skillbook', 1, 36, undefined, undefined, droppedBook);
    }
    void p;
  }

  private emitPartyQuestProgress(eventType: QuestType, amount = 1, targetName?: string): void {
    if (
      this.playMode !== 'online' ||
      !peerRoomClient.isConnected() ||
      !this.party ||
      this.party.members.length <= 1
    ) {
      return;
    }
    const selfId = peerRoomClient.getSelfId() || this.playerUid;
    const eventId = `pq_${selfId.slice(-5)}_${this.partyQuestEventSeq++}`;
    peerRoomClient.broadcastPartyQuestProgress({
      eventId,
      eventType,
      amount,
      worldId: this.worldId,
      fromId: selfId,
      fromName: this.playerName,
      targetName,
    });
  }

  private killMob(
    m: MobEntity,
    meta?: { killerId?: string; killerName?: string }
  ): void {
    const i = this.mobs.indexOf(m);
    if (i < 0) return;
    const targetNetId = m.netId ?? '';
    const wasElite = Boolean(m.isElite);
    const affix = m.eliteAffix;
    const wasSplitChild = Boolean(m.isSplitChild);
    const mobBase = m.type;
    const mobName = m.name;
    const mx = m.x;
    const my = m.y;
    const mColor = m.color;
    const mLv = m.level;
    const mExp = m.exp;
    const mMaxHp = m.maxHp;
    const mAtk = m.atk;
    const mSpeed = m.speed;

    const selfId = peerRoomClient.getSelfId() || this.playerUid;
    const killerId = meta?.killerId || selfId;
    const killerName = meta?.killerName || this.playerName;
    const killerIsSelf = killerId === selfId;
    const inParty = this.playMode === 'online' && Boolean(this.party && this.party.members.length > 1);

    this.releaseMobAt(i);
    this.burst(mx, my, mColor, wasElite ? 28 : 20, wasElite ? 280 : 240);
    this.ring(mx, my, wasElite && affix ? ELITE_AFFIX_DEFS[affix].color : mColor, 4, wasElite ? 60 : 40, 0.4);
    this.floatText(mx, my - 18, '+' + mExp + ' EXP', '#a5f3fc', 14);
    if (killerIsSelf) {
      this.player.kills++;
    }

    if (affix === 'splitter' && !wasSplitChild) {
      this.floatText(mx, my - 34, '☄️ 精英分裂!', '#c084fc', 14);
      this.ring(mx, my, '#c084fc', 8, 56, 0.45);
      for (let c = 0; c < 2; c++) {
        const ang = c === 0 ? 0.5 : Math.PI + 0.5;
        let sx = mx + Math.cos(ang) * 20;
        let sy = my + Math.sin(ang) * 20;
        if (!isFree(this.world.tiles, sx, sy, 12)) {
          sx = mx;
          sy = my;
        }
        const child = this.acquireMob(
          mobBase,
          sx,
          sy,
          mLv,
          Math.max(12, Math.round(mMaxHp * 0.34)),
          Math.max(4, Math.round(mAtk * 0.62)),
          Math.max(4, Math.round(mExp * 0.3)),
          Math.round(mSpeed * 1.15),
          mobBase.aggro + 40,
          0.35,
          2.2
        );
        child.isSplitChild = true;
        child.isElite = false;
        child.eliteAffix = undefined;
        child.name = `分裂·${mobBase.name}`;
        child.r = Math.max(8, Math.round(mobBase.r * 0.72));
        child.hpBarTimer = 3.0;
      }
    }

    if (killerIsSelf || inParty) {
      const bestiaryKey = mobBase.name;
      this.recordMetaProgress({
        [bestiaryKey]: (this.account.bestiary[bestiaryKey] ?? 0) + 1,
      });

      if (killerIsSelf && this.player.lifeOnKill > 0 && this.player.hp < this.player.maxHp) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.lifeOnKill);
        this.floatText(this.player.x, this.player.y - 44, `+${this.player.lifeOnKill} 吸血`, '#4ade80', 12);
      }

      if (this.activeQuest) {
        const next = advanceQuestProgress(this.activeQuest, 'kill_mobs', 1, this.breakthroughTier, this.worldId);
        if (next && next.completed && !this.activeQuest.completed) {
          this.toast('悬赏目标达成！');
          this.log('📜 悬赏目标已达成，返回村庄向长老领奖！', '#4ade80');
        }
        this.activeQuest = next;
      }
    }

    if (inParty) {
      this.emitPartyQuestProgress('kill_mobs', 1, mobName);
    }

    const gold = Math.round((rand(1, 3) + mLv * rand(1.2, 3.2)) * (wasElite ? 1.55 : 1) * this.player.goldMult);
    this.spawnDrop(mx + rand(-10, 10), my + rand(-10, 10), 'gold', gold, 26);
    if (Math.random() < (wasElite ? 0.32 : 0.16)) {
      this.spawnDrop(mx + rand(-14, 14), my + rand(-14, 14), 'potion', 1, 26);
    }
    if (mLv >= 5 && Math.random() < (wasElite ? 0.68 : 0.45)) {
      this.spawnDrop(mx + rand(-14, 14), my + rand(-14, 14), 'soulstone', 1, 30);
    }
    if (mobBase.drops.length > 0 && Math.random() < (wasElite ? 0.88 : 0.68)) {
      const matId = mobBase.drops[Math.floor(Math.random() * mobBase.drops.length)];
      this.spawnDrop(
        mx + rand(-16, 16),
        my + rand(-16, 16),
        'material',
        wasElite || Math.random() < 0.25 ? 2 : 1,
        32,
        undefined,
        matId
      );
    }
    if (Math.random() < 0.25) {
      const matId = COMMON_DROP_MATS[Math.floor(Math.random() * COMMON_DROP_MATS.length)];
      this.spawnDrop(mx + rand(-14, 14), my + rand(-14, 14), 'material', 1, 30, undefined, matId);
    }

    const droppedGear =
      Math.random() < (wasElite ? 0.38 : 0.19)
        ? generateGearItem(Math.max(this.player.level, mLv), {
            minRarity: wasElite ? 'rare' : undefined,
            forClassId: this.player.classId,
          })
        : undefined;
    const bookChance = wasElite ? 0.2 : mLv >= 8 ? 0.12 : 0.07;
    const droppedBook =
      Math.random() < bookChance
        ? generateSkillBookItem({ archetype: CLASS_DEFS[this.player.classId].archetype === 'novice' ? 'all' : undefined })
        : undefined;

    this.distributeExpAndLoot(mExp, mx, my, droppedGear, droppedBook);

    if (this.playMode === 'online' && peerRoomClient.isConnected() && targetNetId) {
      const eventId = `km_${selfId.slice(-5)}_${this.entityNetSeq++}`;
      this.processedKillEventIds.add(eventId);
      peerRoomClient.sendWorldKill({
        eventId,
        mapKey: this.getCurrentMapKey(),
        kind: 'mob',
        targetId: targetNetId,
        killerId,
        killerName,
        mobName,
        x: mx,
        y: my,
        color: mColor,
        level: mLv,
        isElite: wasElite,
        eliteAffix: affix,
        rewardGold: gold,
        rewardExp: mExp,
      });
      this.broadcastWorldEntitiesNow();
    }
  }

  private damageBoss(
    dmg: number,
    crit: boolean,
    fromX = this.player.x,
    fromY = this.player.y,
    knockPower = 80,
    opts?: {
      isRemoteHit?: boolean;
      attackerId?: string;
      attackerName?: string;
      stunSec?: number;
      freezeSec?: number;
    }
  ): void {
    const b = this.boss;
    const p = this.player;
    if (!b) return;
    const isRemote = Boolean(opts?.isRemoteHit);

    if (!isRemote) {
      this.registerComboHit(b.x, b.y, crit);
    }

    let hpDmg = dmg;
    if (b.shieldHp > 0) {
      const absorbed = Math.min(b.shieldHp, dmg);
      b.shieldHp -= absorbed;
      hpDmg = dmg - absorbed;
      if (b.shieldHp <= 0) {
        b.shieldTimer = 0;
        b.reflectRatio = 0;
        this.floatText(b.x, b.y - b.r - 18, '破盾!', '#38bdf8', 16);
      }
      if (!isRemote && b.reflectRatio > 0 && p.invuln <= 0) {
        const refDmg = Math.max(1, Math.min(Math.round(p.maxHp * 0.07), Math.round(dmg * b.reflectRatio)));
        this.damagePlayer(refDmg);
      }
    }

    b.hitFlash = 0.14;
    const ka = Math.atan2(b.y - fromY, b.x - fromX);
    b.knockVx = Math.cos(ka) * knockPower;
    b.knockVy = Math.sin(ka) * knockPower;

    if (!isRemote) {
      this.floatText(
        b.x + rand(-14, 14),
        b.y - b.r - 10,
        (crit ? '暴击 ' : '') + dmg + (b.shieldHp > 0 ? ' (盾)' : ''),
        crit ? '#fbbf24' : '#fff',
        crit ? 22 : 16
      );
      this.burst(b.x, b.y, '#fda4af', crit ? 10 : 5, 150);
      if (crit) {
        sfx.crit();
        this.hitstop = Math.max(this.hitstop, 0.035);
      } else {
        sfx.hit();
      }
    }

    if (!this.isMapEntityAuthority() && !isRemote) {
      b.hp = Math.max(1, b.hp - hpDmg);
      peerRoomClient.sendEntityHit({
        mapKey: this.getCurrentMapKey(),
        targetKind: 'boss',
        targetId: b.netId || b.fixedBossId || 'boss',
        dmg,
        crit,
        fromX,
        fromY,
        knockPower,
        freezeSec: opts?.freezeSec,
        stunSec: opts?.stunSec,
        fromName: this.playerName,
      });
      return;
    }

    if (opts?.stunSec) b.stunTimer = Math.max(b.stunTimer, opts.stunSec);
    if (opts?.freezeSec) b.freezeTimer = Math.max(b.freezeTimer, opts.freezeSec);
    b.hp -= hpDmg;
    if (isRemote) {
      this.floatText(
        b.x + rand(-14, 14),
        b.y - b.r - 10,
        (crit ? '暴击 ' : '') + dmg + (b.shieldHp > 0 ? ' (盾)' : ''),
        crit ? '#fbbf24' : '#e2e8f0',
        crit ? 19 : 14
      );
      this.burst(b.x, b.y, '#fda4af', 5, 120);
    }
    if (b.hp <= 0) {
      this.killBoss({ killerId: opts?.attackerId, killerName: opts?.attackerName });
    }
  }

  private killBoss(meta?: { killerId?: string; killerName?: string }): void {
    const b = this.boss;
    const p = this.player;
    if (!b) return;
    const targetNetId = b.netId || b.fixedBossId || 'boss';
    this.boss = null;
    const inDungeon = this.worldId === 'dungeon' && this.currentDungeonFloor !== null;
    const floorDef =
      inDungeon && this.currentDungeonFloor !== null
        ? getDungeonFloorDef(this.currentDungeonFloor)
        : null;
    const partyDiff = getDungeonPartyDifficultyMultiplier(
      inDungeon ? this.getDungeonParticipantCount() : 1
    );

    const selfId = peerRoomClient.getSelfId() || this.playerUid;
    const killerId = meta?.killerId || selfId;
    const killerName = meta?.killerName || this.playerName;
    const killerIsSelf = killerId === selfId;
    const inParty = this.playMode === 'online' && Boolean(this.party && this.party.members.length > 1);

    if (!inDungeon && b.fixedBossId) {
      this.fixedBossCooldowns[b.fixedBossId] = 45;
    }
    this.activeFixedBossArena = null;
    this.hitstop = 0.06;

    this.burst(b.x, b.y, '#fda4af', 60, 420);
    this.ring(b.x, b.y, '#fbbf24', 20, 280, 0.9);
    this.camShake = 22;
    sfx.lvl();

    const scaledFloorGold = floorDef ? Math.round(floorDef.rewardGold * partyDiff.rewardMult) : 0;
    const scaledFloorExp = floorDef ? Math.round(floorDef.rewardExp * partyDiff.rewardMult) : 0;

    if (inDungeon && floorDef) {
      this.dungeonCleared = true;
      this.highestDungeonFloor = Math.max(this.highestDungeonFloor, floorDef.floor);
      p.gold += Math.round(scaledFloorGold * p.goldMult);
      this.ring(this.world.portal.x, this.world.portal.y, '#22d3ee', 14, 150, 0.75);
      this.burst(this.world.portal.x, this.world.portal.y, '#fde047', 26, 200);
      this.toast(`🗼 通关 ${floorDef.floor}F！传送门已解封`);
      this.log(
        `🏆 ${killerIsSelf ? '成功' : `【${killerName}】协助`}讨伐 ${floorDef.floor}F 镇守领主【${b.name}】！奖励 ${scaledFloorExp} 经验与 ${scaledFloorGold} 金币！北侧传送门已开启，可前往 ${floorDef.floor + 1}F！`,
        '#fde047'
      );
      this.recordMetaProgress({
        试炼塔领主: (this.account.bestiary['试炼塔领主'] ?? 0) + 1,
      });
    } else {
      this.toast('BOSS 被击败！');
      this.log(
        `🏆 ${killerIsSelf ? '你' : `【${killerName}】`}击败了 ${b.name}！（45秒后将在原祭坛重新苏醒）`,
        '#fde047'
      );
      this.recordMetaProgress({
        野外首领: (this.account.bestiary['野外首领'] ?? 0) + 1,
      });
    }

    if (killerIsSelf || inParty) {
      if (this.activeQuest) {
        const next = advanceQuestProgress(this.activeQuest, 'kill_boss', 1, this.breakthroughTier, this.worldId);
        if (next && next.completed && !this.activeQuest.completed) {
          this.log(
            next.isBreakthrough
              ? '⚡ 破境试炼目标已达成！请向当前世界长老交付突破任务！'
              : '📜 讨伐悬赏已完成，返回村庄向长老领奖！',
            '#4ade80'
          );
        }
        this.activeQuest = next;
      }
    }

    if (inParty) {
      this.emitPartyQuestProgress('kill_boss', 1, b.name);
    }

    const gold = Math.round((rand(80, 140) + b.level * rand(10, 22)) * p.goldMult * partyDiff.rewardMult);
    this.spawnDrop(b.x, b.y, 'gold', gold, 40);
    this.spawnDrop(b.x + rand(-24, 24), b.y + rand(-24, 24), 'soulstone', randi(3, 5), 45);
    for (let i = 0; i < 3; i++) {
      this.spawnDrop(b.x + rand(-40, 40), b.y + rand(-40, 40), 'potion', 1, 40);
    }

    const minRarity = floorDef ? floorDef.guaranteedRarity : 'epic';
    const bossGear = generateGearItem(b.level, { minRarity, forClassId: p.classId });
    const bookDropChance = floorDef ? floorDef.skillBookDropChance : 0.6;
    const bossBook =
      Math.random() < bookDropChance
        ? generateSkillBookItem({ rarity: floorDef && floorDef.floor >= 12 ? 'legendary' : 'epic' })
        : undefined;

    for (let k = 0; k < 2; k++) {
      const mId = BOSS_DROP_MATS[Math.floor(Math.random() * BOSS_DROP_MATS.length)];
      this.spawnDrop(b.x + rand(-34, 34), b.y + rand(-34, 34), 'material', randi(1, 2), 45, undefined, mId);
    }

    const totalExp = floorDef ? scaledFloorExp : Math.round(95 + b.level * 40);
    this.distributeExpAndLoot(totalExp, b.x, b.y, bossGear, bossBook);

    if (this.playMode === 'online' && peerRoomClient.isConnected()) {
      const eventId = `kb_${selfId.slice(-5)}_${this.entityNetSeq++}`;
      this.processedKillEventIds.add(eventId);
      peerRoomClient.sendWorldKill({
        eventId,
        mapKey: this.getCurrentMapKey(),
        kind: 'boss',
        targetId: targetNetId,
        killerId,
        killerName,
        mobName: b.name,
        x: b.x,
        y: b.y,
        color: floorDef?.bossColor ?? '#f43f5e',
        level: b.level,
        fixedBossId: b.fixedBossId,
        dungeonFloor: inDungeon ? this.currentDungeonFloor : null,
        rewardGold: inDungeon ? scaledFloorGold : gold,
        rewardExp: totalExp,
        bossGear,
        bossBook,
      });
      this.broadcastWorldEntitiesNow();
    }

    this.saveCurrentSlot(true, true);
    this.emitHud();
  }

  private gainExp(v: number): void {
    const p = this.player;
    const def = CLASS_DEFS[p.classId];
    const res = applyExpWithBreakthrough(p.level, p.exp, v, this.breakthroughTier);
    p.exp = res.exp;

    for (let lvStep = 0; lvStep < res.levelsGained; lvStep++) {
      p.level++;
      p.baseMaxHp += def.hpPerLv;
      p.baseMaxMp += def.mpPerLv;
      p.baseAtk += def.atkPerLv;
      p.baseDef += def.defPerLv;
      p.baseSpeed += def.speedPerLv;
    }

    if (res.levelsGained > 0) {
      this.recalculateStats();
      p.hp = p.maxHp;
      p.mp = p.maxMp;
      this.recordMetaProgress({
        _maxLevel: Math.max(this.account.bestiary._maxLevel ?? 1, p.level),
      });
      this.toast('等级提升！ Lv.' + p.level);
      this.log('⬆ 等级提升到 Lv.' + p.level + '！', '#fde047');
      this.burst(p.x, p.y, '#fde047', 36, 300);
      this.ring(p.x, p.y, '#fde047', 10, 140, 0.7);
      sfx.lvl();
      this.saveCurrentSlot(true, true);
    }

    if (p.level >= res.cap && res.hitCap && !this.hitCapNotified) {
      this.hitCapNotified = true;
      this.toast(`Lv.${res.cap} 瓶颈 · 找长老突破！`);
      this.log(
        `⚡ 你已达到当前境界上限 Lv.${res.cap}！请前往【${WORLD_META[this.worldId].elderName}】接取突破任务方可继续升级！`,
        '#f472b6'
      );
    }
  }

  private damagePlayer(dmg: number, sourceMob?: MobEntity): void {
    const p = this.player;
    if (p.invuln > 0) return;
    const minFloor = Math.max(1, Math.round(dmg * 0.18));
    let real = Math.max(minFloor, Math.round(dmg - p.def * 0.55));
    if (p.shieldHp > 0) {
      const absorbed = Math.min(p.shieldHp, real);
      p.shieldHp -= absorbed;
      real -= absorbed;
      if (p.shieldHp <= 0) p.shieldTimer = 0;
      if (real <= 0) {
        p.invuln = 0.25;
        this.floatText(p.x, p.y - 26, `护盾吸收 -${absorbed}`, '#93c5fd', 14);
        this.burst(p.x, p.y, '#93c5fd', 6, 120);
        return;
      }
    }
    p.hp -= real;
    p.invuln = 0.45;
    p.hurtFlash = 0.35;
    this.floatText(p.x, p.y - 26, '-' + real, '#fca5a5', 16);
    this.burst(p.x, p.y, '#ef4444', 7, 130);
    this.camShake = Math.max(this.camShake, 5);
    this.callbacks.onHitFlash('rgba(220,38,38,.55)', 0.45);
    sfx.hurt();

    if (sourceMob && sourceMob.eliteAffix === 'frozen') {
      p.slowTimer = Math.max(p.slowTimer, 1.45);
      this.floatText(p.x, p.y - 42, '❄️ 冰霜迟缓', '#7dd3fc', 13);
      this.burst(p.x, p.y, '#38bdf8', 7, 120);
    }
    if (sourceMob && sourceMob.eliteAffix === 'vampiric' && sourceMob.hp > 0 && real > 0) {
      const leech = Math.max(4, Math.round(real * 0.45));
      sourceMob.hp = Math.min(sourceMob.maxHp, sourceMob.hp + leech);
      this.floatText(sourceMob.x, sourceMob.y - sourceMob.r - 12, `+${leech} 吸血`, '#fb7185', 13);
      this.burst(sourceMob.x, sourceMob.y, '#fb7185', 6, 110);
    }

    if (p.hp <= 0) this.onDeath();
  }

  private onDeath(): void {
    const p = this.player;
    const lost = Math.floor(p.gold * 0.12);
    p.gold -= lost;

    const applyLvPenalty = shouldApplyDeathLevelPenalty(this.worldId);
    const prevLv = p.level;
    let droppedLevels = 0;

    if (applyLvPenalty) {
      const penalty = applyDeathLevelPenalty(
        p.level,
        {
          baseMaxHp: p.baseMaxHp,
          baseMaxMp: p.baseMaxMp,
          baseAtk: p.baseAtk,
          baseDef: p.baseDef,
          baseSpeed: p.baseSpeed,
        },
        p.classId,
        this.breakthroughTier,
        DEATH_LEVEL_PENALTY
      );
      droppedLevels = penalty.droppedLevels;
      p.level = penalty.newLevel;
      p.exp = 0;
      p.baseMaxHp = penalty.baseMaxHp;
      p.baseMaxMp = penalty.baseMaxMp;
      p.baseAtk = penalty.baseAtk;
      p.baseDef = penalty.baseDef;
      p.baseSpeed = penalty.baseSpeed;
      this.hitCapNotified = false;
      this.recalculateStats();
    }

    p.hp = p.maxHp;
    p.mp = p.maxMp;
    p.shieldHp = 0;
    p.shieldTimer = 0;
    p.stunTimer = 0;
    p.slowTimer = 0;
    p.invuln = 2.6;
    if (this.boss) this.boss = null;

    if (!applyLvPenalty) {
      this.toast(`战败脱离副本（保留 Lv.${p.level}）`);
      this.log(
        `💀 试炼之塔挑战失败！副本保护生效（不扣等级、保留 Lv.${p.level}），损失 ${lost} 金币，已护送返回【幻光王城】。`,
        '#f87171'
      );
      this.exitDungeon();
      this.saveCurrentSlot(true, true);
      return;
    }

    const lvPenaltyText =
      droppedLevels > 0
        ? `等级倒扣 ${droppedLevels} 级（Lv.${prevLv} → Lv.${p.level}，已突破境界保留）`
        : `当前为 Lv.1（已保留境界进度）`;

    p.x = this.world.spawnX;
    p.y = this.world.spawnY;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (Math.hypot(m.x - p.x, m.y - p.y) <= 620) {
        this.releaseMobAt(i);
      }
    }
    this.forceFullRedraw = true;
    this.toast(`战败倒扣 ${droppedLevels} 级（Lv.${prevLv}→Lv.${p.level}）`);
    this.log(`💀 你在旅途中倒下，${lvPenaltyText}，损失 ${lost} 金币，已返回安全区复活。`, '#f87171');
    this.saveCurrentSlot(true, true);
    this.emitHud();
  }

  // ---- 联机队伍 / 治疗 / 交易联动方法 ----

  public receivePartyExp(exp: number, fromName: string): void {
    if (!this.started || exp <= 0) return;
    this.gainExp(exp);
    this.floatText(this.player.x, this.player.y - 42, `+${exp} 共享EXP`, '#a78bfa', 13);
    this.log(`👥 来自队友【${fromName}】的经验共享：+${exp} EXP`, '#c4b5fd');
    this.emitHud();
  }

  public receivePartyLoot(gear?: GearItem, skillBook?: SkillBookItem, fromName = '队友'): void {
    if (!this.started) return;
    if (gear) {
      this.inventory.push(gear);
      const rm = RARITY_META[gear.rarity];
      this.recordMetaProgress({
        _bestRarity: Math.max(this.account.bestiary._bestRarity ?? 1, rm.rank),
      });
      this.floatText(this.player.x, this.player.y - 48, `队长拾取 ${gear.name}`, rm.color, 14);
      this.log(`👑 【队长拾取】${fromName} 击杀掉落 [${rm.label}] ${gear.name} 已入你背包！`, rm.color);
    }
    if (skillBook) {
      this.skillBooks.push(skillBook);
      const rm = RARITY_META[skillBook.rarity];
      this.log(`👑 【队长拾取】获得技能书《${skillBook.name}》！`, rm.color);
    }
    if (gear || skillBook) {
      sfx.equip();
      this.saveCurrentSlot(true, true);
      this.emitHud();
    }
  }

  public receivePartyHeal(healHp: number, shieldHp: number, fromName: string): void {
    if (!this.started) return;
    const p = this.player;
    if (healHp > 0) {
      p.hp = Math.min(p.maxHp, p.hp + healHp);
      this.floatText(p.x, p.y - 36, `+${healHp} 队友圣愈`, '#4ade80', 14);
    }
    if (shieldHp > 0) {
      p.shieldHp = Math.max(p.shieldHp, shieldHp);
      p.shieldTimer = Math.max(p.shieldTimer, 5.5);
      this.floatText(p.x, p.y - 52, `+${shieldHp} 队友护盾`, '#93c5fd', 13);
    }
    this.ring(p.x, p.y, '#4ade80', 8, 72, 0.45);
    this.log(`💚 受到队友【${fromName}】支援：生命 +${healHp} 护盾 +${shieldHp}`, '#4ade80');
    this.emitHud();
  }

  public receivePartyQuestProgress(pkt: PartyQuestProgressPayload): void {
    if (!this.started || this.playMode !== 'online') return;
    if (!this.party || this.party.members.length <= 1) return;
    if (pkt.eventId) {
      if (this.processedPartyQuestEventIds.has(pkt.eventId)) return;
      this.processedPartyQuestEventIds.add(pkt.eventId);
      if (this.processedPartyQuestEventIds.size > 400) {
        const first = this.processedPartyQuestEventIds.values().next().value;
        if (first) this.processedPartyQuestEventIds.delete(first);
      }
    }
    if (!this.activeQuest || this.activeQuest.completed) return;

    const next = advanceQuestProgress(
      this.activeQuest,
      pkt.eventType,
      Math.max(1, pkt.amount || 1),
      this.breakthroughTier,
      this.worldId
    );
    if (!next || next.progress === this.activeQuest.progress) return;

    const def = findQuestDefById(next.questId, this.breakthroughTier, this.worldId);
    const label = def?.title ?? '当前任务';
    const progressText = def ? `(${next.progress}/${def.target})` : '';
    this.activeQuest = next;

    if (next.completed) {
      sfx.quest();
      this.toast(`组队共享：${label} 已完成！`);
      this.log(
        next.isBreakthrough
          ? `⚡ 队友【${pkt.fromName}】助你推进破境试炼【${label}】${progressText}，已达标！请前往长老处交付突破！`
          : `📜 队友【${pkt.fromName}】共享完成了悬赏【${label}】${progressText}，返回村庄领奖！`,
        '#4ade80'
      );
    } else {
      this.log(
        `👥 组队任务同步：队友【${pkt.fromName}】${pkt.targetName ? `讨伐/触发 ${pkt.targetName}，` : ''}推进【${label}】 ${progressText}`,
        '#c4b5fd'
      );
    }
    this.saveCurrentSlot(true, true);
    this.emitHud();
  }

  private buildWorldEntitiesPayload(): WorldEntitiesPayload {
    const mobs: SyncMobPayload[] = [];
    for (let i = 0; i < this.mobs.length; i++) {
      const m = this.mobs[i];
      if (!m) continue;
      if (!m.netId) m.netId = this.nextEntityNetId('m');
      mobs.push({
        id: m.netId,
        typeIdx: MOB_TYPE_INDEX.get(m.type) ?? 0,
        name: m.name,
        color: m.color,
        r: m.r,
        x: Math.round(m.x * 10) / 10,
        y: Math.round(m.y * 10) / 10,
        hp: Math.max(0, Math.round(m.hp)),
        maxHp: Math.max(1, Math.round(m.maxHp)),
        level: m.level,
        atk: m.atk,
        exp: m.exp,
        speed: m.speed,
        aggro: m.aggro,
        ranged: m.ranged,
        behavior: m.behavior,
        atkSpeed: m.atkSpeed,
        isElite: m.isElite,
        eliteAffix: m.eliteAffix,
        isSplitChild: m.isSplitChild,
        stunTimer: Math.round(m.stunTimer * 100) / 100,
        freezeTimer: Math.round(m.freezeTimer * 100) / 100,
        lunge: Math.round(m.lunge * 100) / 100,
        hitFlash: Math.round(m.hitFlash * 100) / 100,
        chargeTime: Math.round(m.chargeTime * 100) / 100,
        chargeDir: Math.round(m.chargeDir * 100) / 100,
      });
    }

    let boss: SyncBossPayload | null = null;
    if (this.boss) {
      const b = this.boss;
      if (!b.netId) b.netId = this.nextEntityNetId('b');
      boss = {
        id: b.netId,
        fixedBossId: b.fixedBossId,
        name: b.name,
        title: b.title,
        bossArchetype: b.bossArchetype,
        arenaX: b.arenaX,
        arenaY: b.arenaY,
        x: Math.round(b.x * 10) / 10,
        y: Math.round(b.y * 10) / 10,
        r: b.r,
        hp: Math.max(0, Math.round(b.hp)),
        maxHp: Math.max(1, Math.round(b.maxHp)),
        level: b.level,
        atk: b.atk,
        speed: b.speed,
        state: b.state,
        stateTimer: Math.round(b.stateTimer * 100) / 100,
        rage: Math.round(b.rage * 1000) / 1000,
        shieldHp: Math.round(b.shieldHp),
        shieldTimer: Math.round(b.shieldTimer * 100) / 100,
        reflectRatio: b.reflectRatio,
        stunTimer: Math.round(b.stunTimer * 100) / 100,
        freezeTimer: Math.round(b.freezeTimer * 100) / 100,
        facingAng: b.facingAng !== undefined ? Math.round(b.facingAng * 100) / 100 : undefined,
        lunge: Math.round(b.lunge * 100) / 100,
        hitFlash: Math.round(b.hitFlash * 100) / 100,
        attackAnim: b.attackAnim !== undefined ? Math.round(b.attackAnim * 100) / 100 : undefined,
        attackAnimTotal: b.attackAnimTotal,
        telegraph: b.telegraph ? { ...b.telegraph } : undefined,
      };
    }

    const bossRespawns: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.fixedBossCooldowns)) {
      if (v > 0) bossRespawns[k] = Math.round(v * 10) / 10;
    }

    return {
      mapKey: this.getCurrentMapKey(),
      authorityId: peerRoomClient.getSelfId() || this.playerUid,
      seq: this.worldEntitySyncSeq++,
      mobs,
      boss,
      bossRespawns,
      dungeonCleared: this.worldId === 'dungeon' ? this.dungeonCleared : undefined,
    };
  }

  public broadcastWorldEntitiesNow(): void {
    if (!this.started || this.playMode !== 'online' || !peerRoomClient.isConnected()) return;
    if (!this.isMapEntityAuthority()) return;
    peerRoomClient.sendWorldEntities(this.buildWorldEntitiesPayload());
  }

  public syncOnlineWorldStateAfterRoomJoin(): void {
    if (!this.started || this.playMode !== 'online' || !peerRoomClient.isConnected()) return;
    peerRoomClient.sendLocalState(this.getRoomPlayerPayload());
    const isAuth = this.isMapEntityAuthority();
    this.wasMapAuthority = isAuth;
    if (isAuth) {
      if (this.mobs.length === 0 && this.worldId !== 'dungeon') {
        for (let i = 0; i < 14; i++) this.spawnMob();
      }
      this.broadcastWorldEntitiesNow();
    } else {
      this.clearPooledEntities();
      this.boss = null;
      peerRoomClient.requestWorldSync(this.getCurrentMapKey());
    }
    this.emitHud();
  }

  public receiveWorldSyncRequest(mapKey: string): void {
    if (!this.started || this.playMode !== 'online') return;
    if (mapKey !== this.getCurrentMapKey()) return;
    if (!this.isMapEntityAuthority()) return;
    this.broadcastWorldEntitiesNow();
  }

  public receiveWorldEntities(pkt: WorldEntitiesPayload): void {
    if (!this.started || this.playMode !== 'online') return;
    const curMapKey = this.getCurrentMapKey();
    if (pkt.mapKey !== curMapKey) return;
    if (this.isMapEntityAuthority()) return;

    const lastSeq = this.lastSyncedWorldSeqByMap.get(curMapKey) ?? 0;
    if (pkt.seq > 0 && pkt.seq < lastSeq && lastSeq - pkt.seq < 1000) {
      return;
    }
    this.lastSyncedWorldSeqByMap.set(curMapKey, pkt.seq);

    if (pkt.bossRespawns) {
      this.fixedBossCooldowns = { ...pkt.bossRespawns };
    }
    if (this.worldId === 'dungeon' && typeof pkt.dungeonCleared === 'boolean' && pkt.dungeonCleared) {
      this.dungeonCleared = true;
      if (this.currentDungeonFloor !== null) {
        this.highestDungeonFloor = Math.max(this.highestDungeonFloor, this.currentDungeonFloor);
      }
    }

    // 同步当前地图所有怪物
    const existingById = new Map<string, MobEntity>();
    for (let i = 0; i < this.mobs.length; i++) {
      const m = this.mobs[i];
      if (m?.netId) existingById.set(m.netId, m);
    }

    const keepIds = new Set<string>();
    for (let i = 0; i < pkt.mobs.length; i++) {
      const sm = pkt.mobs[i];
      keepIds.add(sm.id);
      const existing = existingById.get(sm.id);
      if (existing) {
        existing.syncTargetX = sm.x;
        existing.syncTargetY = sm.y;
        if (Math.hypot(sm.x - existing.x, sm.y - existing.y) > 420) {
          existing.x = sm.x;
          existing.y = sm.y;
        }
        existing.name = sm.name;
        existing.color = sm.color;
        existing.r = sm.r;
        existing.hp = sm.hp;
        existing.maxHp = sm.maxHp;
        existing.level = sm.level;
        existing.atk = sm.atk;
        existing.exp = sm.exp;
        existing.speed = sm.speed;
        existing.aggro = sm.aggro;
        existing.ranged = sm.ranged;
        existing.behavior = sm.behavior;
        existing.atkSpeed = sm.atkSpeed;
        existing.isElite = sm.isElite;
        existing.eliteAffix = sm.eliteAffix;
        existing.isSplitChild = sm.isSplitChild;
        existing.stunTimer = sm.stunTimer;
        existing.freezeTimer = sm.freezeTimer;
        existing.lunge = Math.max(existing.lunge, sm.lunge);
        existing.hitFlash = Math.max(existing.hitFlash, sm.hitFlash);
        existing.chargeTime = sm.chargeTime;
        existing.chargeDir = sm.chargeDir;
        if (sm.hp < sm.maxHp) {
          existing.hpBarTimer = Math.max(existing.hpBarTimer, 2.2);
        }
      } else {
        const base = MOB_TYPES[sm.typeIdx] ?? MOB_TYPES[0];
        const mob = this.acquireMob(
          base,
          sm.x,
          sm.y,
          sm.level,
          sm.maxHp,
          sm.atk,
          sm.exp,
          sm.speed,
          sm.aggro,
          0.4,
          1.8,
          sm.id
        );
        mob.name = sm.name;
        mob.color = sm.color;
        mob.r = sm.r;
        mob.hp = sm.hp;
        mob.ranged = sm.ranged;
        mob.behavior = sm.behavior;
        mob.atkSpeed = sm.atkSpeed;
        mob.isElite = sm.isElite;
        mob.eliteAffix = sm.eliteAffix;
        mob.isSplitChild = sm.isSplitChild;
        mob.stunTimer = sm.stunTimer;
        mob.freezeTimer = sm.freezeTimer;
        mob.chargeTime = sm.chargeTime;
        mob.chargeDir = sm.chargeDir;
      }
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (!m || !m.netId || !keepIds.has(m.netId)) {
        this.releaseMobAt(i);
      }
    }

    // 同步当前地图领主/BOSS
    if (pkt.boss) {
      const sb = pkt.boss;
      if (this.boss && this.boss.netId === sb.id) {
        const cur = this.boss;
        const hadTelegraph = Boolean(cur.telegraph);
        cur.syncTargetX = sb.x;
        cur.syncTargetY = sb.y;
        if (Math.hypot(sb.x - cur.x, sb.y - cur.y) > 420) {
          cur.x = sb.x;
          cur.y = sb.y;
        }
        cur.hp = sb.hp;
        cur.maxHp = sb.maxHp;
        cur.level = sb.level;
        cur.atk = sb.atk;
        cur.speed = sb.speed;
        cur.state = sb.state;
        cur.stateTimer = sb.stateTimer;
        cur.rage = sb.rage;
        cur.shieldHp = sb.shieldHp;
        cur.shieldTimer = sb.shieldTimer;
        cur.reflectRatio = sb.reflectRatio;
        cur.stunTimer = sb.stunTimer;
        cur.freezeTimer = sb.freezeTimer;
        if (sb.facingAng !== undefined) cur.facingAng = sb.facingAng;
        cur.lunge = Math.max(cur.lunge, sb.lunge);
        cur.hitFlash = Math.max(cur.hitFlash, sb.hitFlash);
        if (sb.attackAnim !== undefined && sb.attackAnim > (cur.attackAnim ?? 0)) {
          cur.attackAnim = sb.attackAnim;
          cur.attackAnimTotal = sb.attackAnimTotal;
        }
        if (sb.telegraph) {
          if (!hadTelegraph) {
            if (sb.telegraph.subTargets && sb.telegraph.subTargets.length > 0) {
              for (const st of sb.telegraph.subTargets) {
                this.spawnWarning(st.x, st.y, st.r ?? sb.telegraph.r, sb.telegraph.timer, sb.telegraph.color ?? '#f43f5e');
              }
            } else {
              this.spawnWarning(sb.telegraph.x, sb.telegraph.y, sb.telegraph.r, sb.telegraph.timer, sb.telegraph.color ?? '#f43f5e');
            }
          }
          cur.telegraph = { ...sb.telegraph };
        } else {
          cur.telegraph = undefined;
        }
      } else {
        this.boss = {
          netId: sb.id,
          syncTargetX: sb.x,
          syncTargetY: sb.y,
          fixedBossId: sb.fixedBossId,
          title: sb.title,
          bossArchetype: sb.bossArchetype ?? this.resolveBossArchetype(sb.fixedBossId || sb.name),
          arenaX: sb.arenaX,
          arenaY: sb.arenaY,
          x: sb.x,
          y: sb.y,
          r: sb.r,
          collR: 26,
          name: sb.name,
          level: sb.level,
          maxHp: sb.maxHp,
          hp: sb.hp,
          atk: sb.atk,
          speed: sb.speed,
          state: sb.state,
          stateTimer: sb.stateTimer,
          atkCd: 1.0,
          hitFlash: sb.hitFlash,
          lunge: sb.lunge,
          phase: 0,
          chargeDir: sb.facingAng ?? 0,
          chargeHit: false,
          slamR: 0,
          slamT: 0,
          rage: sb.rage,
          stunTimer: sb.stunTimer,
          freezeTimer: sb.freezeTimer,
          knockVx: 0,
          knockVy: 0,
          shieldHp: sb.shieldHp,
          shieldTimer: sb.shieldTimer,
          reflectRatio: sb.reflectRatio,
          evadeCd: 2.0,
          skillCds: {},
          facingAng: sb.facingAng,
          attackAnim: sb.attackAnim,
          attackAnimTotal: sb.attackAnimTotal,
          telegraph: sb.telegraph ? { ...sb.telegraph } : undefined,
        };
        this.toast(`⚠ ${sb.name}${sb.title ? ` (${sb.title})` : ''} 现身！`);
        this.log(`⚠ 领主【${sb.name} Lv.${sb.level}】已在当前区域现身！`, '#f43f5e');
        sfx.boss();
      }
    } else if (this.boss) {
      this.boss = null;
    }
  }

  public receiveEntityHit(hit: EntityHitPayload): void {
    if (!this.started || this.playMode !== 'online') return;
    if (hit.mapKey !== this.getCurrentMapKey()) return;
    if (!this.isMapEntityAuthority()) return;

    if (hit.targetKind === 'mob') {
      const m = this.mobs.find((it) => it.netId === hit.targetId);
      if (!m) return;
      this.damageMob(m, hit.dmg, hit.crit, hit.fromX, hit.fromY, hit.knockPower, {
        isRemoteHit: true,
        attackerId: hit.fromId,
        attackerName: hit.fromName,
        freezeSec: hit.freezeSec,
        stunSec: hit.stunSec,
      });
    } else if (hit.targetKind === 'boss' && this.boss) {
      if (
        this.boss.netId === hit.targetId ||
        this.boss.fixedBossId === hit.targetId ||
        hit.targetId === 'boss'
      ) {
        this.damageBoss(hit.dmg, hit.crit, hit.fromX, hit.fromY, hit.knockPower, {
          isRemoteHit: true,
          attackerId: hit.fromId,
          attackerName: hit.fromName,
          freezeSec: hit.freezeSec,
          stunSec: hit.stunSec,
        });
      }
    }
  }

  public receiveWorldAction(pkt: WorldActionPayload): void {
    if (!this.started || this.playMode !== 'online') return;
    if (pkt.mapKey !== this.getCurrentMapKey()) return;
    if (this.isMapEntityAuthority()) return;

    const act = pkt.action;
    const p = this.player;
    if (act.kind === 'mob_proj') {
      this.spawnProjectile(
        act.x,
        act.y,
        act.vx,
        act.vy,
        act.r,
        act.dmg,
        act.life,
        'mob',
        act.color,
        { freezeSec: act.freezeSec, shape: act.shape }
      );
      return;
    }

    if (act.kind === 'boss_aoe') {
      const b = this.boss;
      if (act.skillKind === 'meteor_rain') {
        sfx.fire();
        const targets = act.subTargets && act.subTargets.length > 0 ? act.subTargets : [{ x: act.x, y: act.y, r: act.r }];
        let hitLocal = false;
        for (const st of targets) {
          const mr = st.r ?? act.r ?? 88;
          this.ring(st.x, st.y, '#fb923c', 12, mr, 0.55);
          this.ring(st.x, st.y, '#fde047', 6, mr * 0.6, 0.36);
          this.burst(st.x, st.y, '#f97316', 18, 220);
          if (!hitLocal && p.hp > 0 && Math.hypot(p.x - st.x, p.y - st.y) <= mr) {
            hitLocal = true;
            this.damagePlayer(act.atk * (act.inPhase2 ? 1.48 : 1.32));
          }
        }
        return;
      }

      if (act.destX !== undefined && act.destY !== undefined && b) {
        b.x = act.destX;
        b.y = act.destY;
        b.syncTargetX = act.destX;
        b.syncTargetY = act.destY;
      }

      this.ring(act.x, act.y, act.color, 16, act.r, 0.52);
      this.ring(act.x, act.y, '#fef08a', 8, act.r * 0.68, 0.34);
      this.burst(act.x, act.y, act.color, 26, 260);
      this.camShake = Math.max(this.camShake, 10);

      if (p.hp <= 0) return;
      const inside = Math.hypot(p.x - act.x, p.y - act.y) <= act.r;
      if (!inside) return;

      if (act.skillKind === 'cc_stun') {
        sfx.slam();
        p.stunTimer = Math.max(p.stunTimer, 1.1);
        this.damagePlayer(act.atk * 1.15);
        this.floatText(p.x, p.y - 34, '眩晕!', '#fbbf24', 15);
      } else if (act.skillKind === 'cc_freeze') {
        sfx.ice();
        p.slowTimer = Math.max(p.slowTimer, 2.4);
        this.damagePlayer(act.atk * 1.05);
        this.floatText(p.x, p.y - 34, '极寒减速!', '#38bdf8', 15);
      } else if (act.skillKind === 'cc_pull') {
        sfx.arcane();
        if (b) {
          const pullAng = Math.atan2(b.y - p.y, b.x - p.x);
          moveEnt(this.world.tiles, p, Math.cos(pullAng) * 110, Math.sin(pullAng) * 110, true);
        }
        this.damagePlayer(act.atk * 1.1);
        this.floatText(p.x, p.y - 34, '引力牵引!', '#c084fc', 15);
      } else if (act.skillKind === 'aoe_nova') {
        sfx.boss();
        this.damagePlayer(act.atk * 1.42);
      } else if (act.skillKind === 'dash_strike') {
        sfx.slam();
        this.damagePlayer(act.atk * 1.38);
      } else if (act.skillKind === 'cross_slash') {
        sfx.slam();
        this.damagePlayer(act.atk * 1.25);
      } else if (act.skillKind === 'blink_execute') {
        sfx.boss();
        this.damagePlayer(act.atk * (act.inPhase2 ? 1.55 : 1.38));
      } else if (act.skillKind === 'slam') {
        sfx.slam();
        this.damagePlayer(act.atk * 1.42);
      }
    }
  }

  public receiveWorldKill(kill: WorldKillPayload): void {
    if (!this.started || this.playMode !== 'online') return;
    if (this.processedKillEventIds.has(kill.eventId)) return;
    this.processedKillEventIds.add(kill.eventId);
    if (this.processedKillEventIds.size > 400) {
      const first = this.processedKillEventIds.values().next().value;
      if (first) this.processedKillEventIds.delete(first);
    }

    if (kill.mapKey !== this.getCurrentMapKey()) return;
    if (this.isMapEntityAuthority()) return;

    const selfId = peerRoomClient.getSelfId() || this.playerUid;
    const isKiller = kill.killerId === selfId;
    const inParty = Boolean(this.party && this.party.members.length > 1);

    if (kill.kind === 'mob') {
      const idx = this.mobs.findIndex((m) => m.netId === kill.targetId);
      if (idx >= 0) {
        this.releaseMobAt(idx);
      }
      this.burst(kill.x, kill.y, kill.color, kill.isElite ? 28 : 20, kill.isElite ? 280 : 240);
      this.ring(
        kill.x,
        kill.y,
        kill.isElite && kill.eliteAffix ? ELITE_AFFIX_DEFS[kill.eliteAffix].color : kill.color,
        4,
        kill.isElite ? 60 : 40,
        0.4
      );
      if (isKiller) {
        this.player.kills++;
        if (this.player.lifeOnKill > 0 && this.player.hp < this.player.maxHp) {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.lifeOnKill);
          this.floatText(this.player.x, this.player.y - 44, `+${this.player.lifeOnKill} 吸血`, '#4ade80', 12);
        }
        if (kill.rewardGold && kill.rewardGold > 0) {
          this.spawnDrop(kill.x + rand(-10, 10), kill.y + rand(-10, 10), 'gold', kill.rewardGold, 26);
        }
        if (!inParty && kill.rewardExp && kill.rewardExp > 0) {
          this.gainExp(kill.rewardExp);
        }
        if (!inParty && this.activeQuest) {
          const next = advanceQuestProgress(this.activeQuest, 'kill_mobs', 1, this.breakthroughTier, this.worldId);
          if (next && next.completed && !this.activeQuest.completed) {
            this.toast('悬赏目标达成！');
            this.log('📜 悬赏目标已达成，返回村庄向长老领奖！', '#4ade80');
          }
          this.activeQuest = next;
        }
      }
      this.emitHud();
      return;
    }

    // Boss 击杀同步
    this.boss = null;
    this.activeFixedBossArena = null;
    if (kill.fixedBossId && this.worldId !== 'dungeon') {
      this.fixedBossCooldowns[kill.fixedBossId] = 45;
    }
    this.burst(kill.x, kill.y, '#fda4af', 60, 420);
    this.ring(kill.x, kill.y, '#fbbf24', 20, 280, 0.9);
    this.camShake = Math.max(this.camShake, 18);
    sfx.lvl();

    const inDungeon = this.worldId === 'dungeon' && this.currentDungeonFloor !== null;
    if (inDungeon && kill.dungeonFloor) {
      this.dungeonCleared = true;
      this.highestDungeonFloor = Math.max(this.highestDungeonFloor, kill.dungeonFloor);
      if (kill.rewardGold && kill.rewardGold > 0) {
        this.player.gold += Math.round(kill.rewardGold * this.player.goldMult);
      }
      this.ring(this.world.portal.x, this.world.portal.y, '#22d3ee', 14, 150, 0.75);
      this.burst(this.world.portal.x, this.world.portal.y, '#fde047', 26, 200);
      this.toast(`🗼 通关 ${kill.dungeonFloor}F！传送门已解封`);
      this.log(
        `🏆 【${kill.killerName}】击破 ${kill.dungeonFloor}F 领主【${kill.mobName}】！北侧传送门已开启，可前往 ${kill.dungeonFloor + 1}F！`,
        '#fde047'
      );
      this.recordMetaProgress({
        试炼塔领主: (this.account.bestiary['试炼塔领主'] ?? 0) + 1,
      });
    } else {
      this.toast('BOSS 被击败！');
      this.log(`🏆 【${kill.killerName}】击败了 ${kill.mobName}！（45秒后重新苏醒）`, '#fde047');
      this.recordMetaProgress({
        野外首领: (this.account.bestiary['野外首领'] ?? 0) + 1,
      });
    }

    if (isKiller || inParty) {
      if (kill.bossGear) {
        this.spawnDrop(kill.x + rand(-16, 16), kill.y + rand(-16, 16), 'gear', 1, 36, kill.bossGear);
      }
      if (kill.bossBook) {
        this.spawnDrop(kill.x + rand(-18, 18), kill.y + rand(-18, 18), 'skillbook', 1, 36, undefined, undefined, kill.bossBook);
      }
    }

    if (isKiller && !inParty) {
      if (kill.rewardExp && kill.rewardExp > 0) {
        this.gainExp(kill.rewardExp);
      }
      if (this.activeQuest) {
        const next = advanceQuestProgress(this.activeQuest, 'kill_boss', 1, this.breakthroughTier, this.worldId);
        if (next && next.completed && !this.activeQuest.completed) {
          this.log(
            next.isBreakthrough
              ? '⚡ 破境试炼目标已达成！请向当前世界长老交付突破任务！'
              : '📜 讨伐悬赏已完成，返回村庄向长老领奖！',
            '#4ade80'
          );
        }
        this.activeQuest = next;
      }
    }

    this.saveCurrentSlot(true, true);
    this.emitHud();
  }

  public getTradeInventoryPool(): {
    gold: number;
    inventory: GearItem[];
    materials: MaterialBag;
    skillBooks: SkillBookItem[];
  } {
    return {
      gold: this.player.gold,
      inventory: [...this.inventory],
      materials: { ...this.materials },
      skillBooks: [...this.skillBooks],
    };
  }

  public applyExecutedTrade(give: TradeOffer, receive: TradeOffer, peerName: string): void {
    if (!this.started) return;
    const p = this.player;

    // 扣除己方给出物品
    p.gold = Math.max(0, p.gold - Math.max(0, Math.floor(give.gold || 0)));
    const giveGearIds = new Set((give.gear || []).map((g) => g.id));
    if (giveGearIds.size > 0) {
      this.inventory = this.inventory.filter((g) => !giveGearIds.has(g.id));
    }
    const giveBookIds = new Set((give.skillBooks || []).map((b) => b.id));
    if (giveBookIds.size > 0) {
      this.skillBooks = this.skillBooks.filter((b) => !giveBookIds.has(b.id));
    }
    for (const [k, v] of Object.entries(give.materials || {})) {
      const mId = k as MaterialId;
      const amt = Math.max(0, Math.floor(Number(v) || 0));
      if (amt > 0) {
        this.materials[mId] = Math.max(0, (this.materials[mId] ?? 0) - amt);
      }
    }

    // 注入对方给与物品
    p.gold += Math.max(0, Math.floor(receive.gold || 0));
    for (const g of receive.gear || []) {
      this.inventory.push(g);
    }
    for (const b of receive.skillBooks || []) {
      this.skillBooks.push(b);
    }
    for (const [k, v] of Object.entries(receive.materials || {})) {
      const mId = k as MaterialId;
      const amt = Math.max(0, Math.floor(Number(v) || 0));
      if (amt > 0) {
        this.materials[mId] = (this.materials[mId] ?? 0) + amt;
      }
    }

    sfx.quest();
    this.toast(`🤝 与 ${peerName} 交易完成！`);
    this.log(`🤝 与【${peerName}】交易成功！获得 ${receive.gold || 0} 金币、${(receive.gear || []).length} 件装备、${(receive.skillBooks || []).length} 本技能书。`, '#4ade80');
    this.saveCurrentSlot(true, true);
    this.emitHud();
  }

  private pickup(d: DropEntity): void {
    const p = this.player;
    if (d.kind === 'gold') {
      p.gold += d.amount;
      this.floatText(p.x, p.y - 36, '+' + d.amount + ' 金币', '#fbbf24', 14);
      this.burst(d.x, d.y, '#fbbf24', 7, 100);
      sfx.coin();
    } else if (d.kind === 'potion') {
      p.potions = Math.min(p.potionCap, p.potions + 1);
      this.floatText(p.x, p.y - 36, '+1 药水', '#4ade80', 14);
      this.burst(d.x, d.y, '#4ade80', 7, 100);
      sfx.potion();
    } else if (d.kind === 'soulstone') {
      this.recordMetaProgress({}, d.amount);
      this.floatText(p.x, p.y - 40, `+${d.amount} 灵魂石`, '#38bdf8', 15);
      this.log(`💠 拾取灵魂石 +${d.amount}（账号全局共享）`, '#38bdf8');
      this.burst(d.x, d.y, '#38bdf8', 14, 170);
      sfx.quest();
    } else if (d.kind === 'material') {
      const matId = d.materialId ?? 'wood';
      const def = MATERIAL_MAP[matId];
      this.materials[matId] = (this.materials[matId] ?? 0) + d.amount;
      this.floatText(p.x, p.y - 36, `${def.icon} +${d.amount} ${def.name}`, RARITY_META[def.rarity].color, 13);
      this.log(`🎒 获得原料：${def.icon} ${def.name} ×${d.amount}`, RARITY_META[def.rarity].color);
      this.burst(d.x, d.y, RARITY_META[def.rarity].color, 10, 140);
      sfx.coin();
    } else if (d.kind === 'skillbook' && d.skillBook) {
      const book = d.skillBook;
      const rm = RARITY_META[book.rarity];
      this.skillBooks.push(book);
      this.floatText(p.x, p.y - 40, `📘 ${book.name}`, rm.color, 15);
      this.log(`📘 拾取技能书：[${rm.label}] 《${book.name}》（打开背包研习）`, rm.color);
      this.burst(d.x, d.y, rm.color, 14, 180);
      sfx.quest();
    } else {
      const item = d.gearItem ?? generateGearItem(p.level);
      const rm = RARITY_META[item.rarity];
      this.inventory.push(item);
      this.recordMetaProgress({
        _bestRarity: Math.max(this.account.bestiary._bestRarity ?? 1, rm.rank),
      });
      this.floatText(p.x, p.y - 36, `[${rm.label}] ${item.name}`, rm.color, 15);
      this.log(`✨ 获得装备：[${rm.label}] ${item.name}（按 B 查看）`, rm.color);
      this.burst(d.x, d.y, rm.color, 14, 170);
      sfx.equip();
    }
    if (d.kind === 'soulstone' || d.kind === 'skillbook' || d.kind === 'gear') {
      this.saveCurrentSlot(true, d.kind === 'soulstone');
    }
    this.emitHud();
  }

  private openChest(c: { x: number; y: number; opened: boolean }): void {
    c.opened = true;
    const p = this.player;
    this.burst(c.x, c.y, '#fbbf24', 26, 260);
    this.ring(c.x, c.y, '#fbbf24', 5, 70, 0.55);
    sfx.chest();
    const gold = Math.round((randi(12, 30) + p.level * randi(3, 8)) * p.goldMult);
    p.gold += gold;
    this.floatText(c.x, c.y - 22, '+' + gold + ' 金币', '#fbbf24', 16);
    this.log('📦 打开了宝箱，获得 ' + gold + ' 金币', '#fbbf24');

    let gainedStones = 0;
    if (Math.random() < 0.35) {
      gainedStones = 1;
      this.floatText(c.x, c.y - 84, '+1 灵魂石', '#38bdf8', 15);
      this.log('💠 从宝箱中发现 1 颗灵魂石！', '#38bdf8');
    }
    this.recordMetaProgress({ _chests: (this.account.bestiary._chests ?? 0) + 1 }, gainedStones);

    // 宝箱额外奖励 1-2 种锻造原料
    const chestMatPool: MaterialId[] =
      this.worldId === 'world2'
        ? ['mythril_ore', 'ember_core', 'void_essence', 'silver_ore', 'magic_crystal']
        : ['stone', 'iron_ore', 'wood', 'silver_ore', 'magic_crystal'];
    const pickedMat = chestMatPool[Math.floor(Math.random() * chestMatPool.length)];
    const matCount = randi(1, 2);
    this.materials[pickedMat] = (this.materials[pickedMat] ?? 0) + matCount;
    const matDef = MATERIAL_MAP[pickedMat];
    this.log(`📦 宝箱附带原料：${matDef.icon} ${matDef.name} ×${matCount}`, RARITY_META[matDef.rarity].color);

    if (Math.random() < 0.45 && p.potions < p.potionCap) {
      p.potions++;
      this.floatText(c.x, c.y - 44, '+1 药水', '#4ade80', 14);
    }
    if (Math.random() < 0.45) {
      const gearItem = generateGearItem(p.level, { minRarity: 'rare', forClassId: p.classId });
      const rm = RARITY_META[gearItem.rarity];
      this.inventory.push(gearItem);
      this.recordMetaProgress({
        _bestRarity: Math.max(this.account.bestiary._bestRarity ?? 1, rm.rank),
      });
      this.floatText(c.x, c.y - 66, `[${rm.label}] ${gearItem.name}`, rm.color, 15);
      this.log(`✨ 宝箱开出装备：[${rm.label}] ${gearItem.name}（按 B 查看）`, rm.color);
    }
    if (this.activeQuest) {
      const next = advanceQuestProgress(this.activeQuest, 'open_chests', 1, this.breakthroughTier, this.worldId);
      if (next && next.completed && !this.activeQuest.completed) {
        this.toast('悬赏目标达成！');
        this.log('📜 宝箱搜寻目标已达成，返回村庄向长老领奖！', '#4ade80');
      }
      this.activeQuest = next;
    }
    this.emitPartyQuestProgress('open_chests', 1, '宝箱');
    this.gainExp(Math.round(4 + p.level * 2.2));
    this.saveCurrentSlot(true, false);
    this.emitHud();
  }

  private render(): void {
    const timeOfDay = getTimeOfDay(this.gameTime);
    const levelCap = getBreakthroughCap(this.breakthroughTier);
    const forceFull = this.forceFullRedraw;
    this.forceFullRedraw = false;
    renderWorld(this.ctx, {
      vw: this.vw,
      vh: this.vh,
      camX: this.cam.x,
      camY: this.cam.y,
      camShake: this.camShake,
      gameTime: this.gameTime,
      world: this.world,
      atlas: this.atlas,
      player: this.player,
      remotePlayers: this.remotePlayers,
      afterimages: this.afterimages,
      mobs: this.mobs,
      boss: this.boss,
      drops: this.drops,
      projectiles: this.projectiles,
      particles: this.particles,
      warnings: this.warnings,
      floaters: this.floaters,
      timeOfDay,
      weather: this.weather,
      lightningFlash: this.lightningFlash,
      comboCount: this.comboCount,
      comboVignettePulse: this.comboVignettePulse,
      activeQuest: this.activeQuest,
      atLevelCap: this.player.level >= levelCap,
      bossRespawns: this.fixedBossCooldowns,
      dungeonCleared: this.dungeonCleared,
      forceFullRedraw: forceFull,
    });
  }

  private emitHud(): void {
    this.wakeLoop();
    const p = this.player;
    const cls = CLASS_DEFS[p.classId];
    const hasSave =
      this.playMode === 'online'
        ? Boolean(this.account.slots.slot1)
        : Boolean(this.account.slots.slot1 || this.account.slots.slot2 || this.account.slots.slot3);
    const levelCap = getBreakthroughCap(this.breakthroughTier);
    const inSafeZone =
      this.world.safeRadius > 0 &&
      Math.hypot(p.x - this.world.spawnX, p.y - this.world.spawnY) <= this.world.safeRadius;
    const effectiveBasicCd = getEffectiveBasicCooldown(cls.basicCooldown, p.attackSpeed);
    const cdSkills: [number, number, number, number] = [0, 1, 2, 3].map((slot) => {
      const sk = cls.skills[slot];
      const eff = Math.max(0.5, getEffectiveSkillCooldown(sk.cooldown, p.skillLevels[slot] ?? 1, p.attackSpeed));
      return clamp((p.skillCds[slot] ?? 0) / eff, 0, 1);
    }) as [number, number, number, number];

    this.callbacks.onHudUpdate({
      started: this.started,
      paused: this.paused,
      playMode: this.playMode,
      activeSlot: this.activeSlot,
      worldId: this.worldId,
      worldName: WORLD_META[this.worldId].name,
      worldLevel: getWorldLevel(this.worldId, this.breakthroughTier),
      breakthroughTier: this.breakthroughTier,
      realmName: getRealmName(this.breakthroughTier),
      levelCap,
      atLevelCap: p.level >= levelCap,
      worldDifficulty: getWorldDifficultyMultiplier(this.worldId, this.breakthroughTier),
      inWater: isWaterAt(this.world.tiles, p.x, p.y),
      inSafeZone,
      classId: p.classId,
      awakened: p.awakened,
      hp: p.hp,
      maxHp: p.maxHp,
      shieldHp: p.shieldHp,
      mp: p.mp,
      maxMp: p.maxMp,
      level: p.level,
      exp: p.exp,
      expNeeded: expNeeded(p.level),
      atk: p.atk,
      def: p.def,
      critChance: this.getEffectiveCritChance(),
      critDmgMult: p.critDmgMult,
      critDisabled: p.critDisabled,
      attackSpeed: p.attackSpeed,
      mpRegen: p.mpRegen,
      speed: Math.round(p.speed * this.weather.speedMult),
      lifeOnKill: p.lifeOnKill,
      gold: p.gold,
      potions: p.potions,
      potionCap: p.potionCap,
      kills: p.kills,
      soulStones: this.account.soulStones,
      cdBasic: clamp(p.attackCd / effectiveBasicCd, 0, 1),
      cdSkills,
      cdQ: cdSkills[0],
      cdE: cdSkills[1],
      cdC: cdSkills[2],
      cdV: cdSkills[3],
      skillLevels: [...p.skillLevels] as [number, number, number, number],
      cdDash: clamp(p.dashCd / 1.4, 0, 1),
      cdPot: clamp(p.potCd / 1.2, 0, 1),
      dungeonFloor: this.currentDungeonFloor,
      dungeonMobsRemaining: this.mobs.length,
      dungeonCleared: this.dungeonCleared,
      highestDungeonFloor: this.highestDungeonFloor,
      boss: this.boss
        ? {
            id: this.boss.fixedBossId,
            name: this.boss.name,
            title: this.boss.title,
            level: this.boss.level,
            hp: this.boss.hp,
            maxHp: this.boss.maxHp,
            shieldHp: this.boss.shieldHp,
          }
        : null,
      timeOfDay: getTimeOfDay(this.gameTime),
      weather: this.weather,
      comboCount: this.comboCount,
      comboTimerRatio: this.comboCount > 0 ? clamp(this.comboTimer / COMBO_DECAY_DURATION, 0, 1) : 0,
      mapExploredPct: Math.min(
        100,
        Math.round(
          (countExploredTiles(this.ensureActiveFogBitmap()) /
            Math.max(1, this.world.width * this.world.height)) *
            100
        )
      ),
      nearInteract: this.started && !this.paused ? this.getNearInteract() : null,
      nearSignpost: this.started && !this.paused ? this.getNearSignpost() : null,
      muted: sfx.isMuted(),
      shopOpen: this.shopOpen,
      questOpen: this.questOpen,
      inventoryOpen: this.inventoryOpen,
      talentOpen: this.talentOpen,
      bestiaryOpen: this.bestiaryOpen,
      awakeningOpen: this.awakeningOpen,
      armorerOpen: this.armorerOpen,
      blacksmithOpen: this.blacksmithOpen,
      upgraderOpen: this.upgraderOpen,
      worldMapOpen: this.worldMapOpen,
      dungeonOpen: this.dungeonOpen,
      socialOpen: this.socialOpen,
      shopPrices: { ...this.shopPrices },
      armorStock: [...this.armorStock],
      equipped: { ...this.equipped },
      inventory: [...this.inventory],
      materials: { ...this.materials },
      skillBooks: [...this.skillBooks],
      activeQuest: this.activeQuest ? { ...this.activeQuest } : null,
      completedQuestCount: this.completedQuestCount,
      logs: this.logs,
      toastMsg: this.toastMsg,
      hasSave,
    });
  }
}
