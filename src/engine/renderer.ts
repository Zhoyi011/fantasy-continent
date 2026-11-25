import { CLASS_DEFS, ELITE_AFFIX_DEFS, MATERIAL_MAP, RARITY_META, WORLD_META } from '../game/rules';
import type { ActiveQuestState, FriendEntry, TimeOfDayInfo, WeatherInfo, WorldId } from '../game/types';
import type {
  AfterimageEntity,
  AltarEntity,
  BossEntity,
  ChestEntity,
  DecoEntity,
  DropEntity,
  DungeonGateEntity,
  FixedBossArena,
  FloaterEntity,
  MobEntity,
  NpcEntity,
  ParticleEntity,
  PlayerEntity,
  PortalEntity,
  ProjectileEntity,
  RemotePlayerEntity,
  SignpostEntity,
  SocialBoardEntity,
  TorchEntity,
  WarningEntity,
} from './entities';
import {
  clamp,
  isWaterAt,
  lerp,
  rand,
  TAU,
  TILE,
  T_DIRT,
  T_ROCK,
  T_SAND,
  T_TREE,
  T_WATER,
  type TileSpriteAtlas,
  type WorldData,
} from './world';

export interface RenderState {
  vw: number;
  vh: number;
  camX: number;
  camY: number;
  camShake: number;
  gameTime: number;
  world: WorldData;
  atlas: TileSpriteAtlas;
  player: PlayerEntity;
  remotePlayers?: RemotePlayerEntity[];
  afterimages: AfterimageEntity[];
  mobs: MobEntity[];
  boss: BossEntity | null;
  drops: DropEntity[];
  projectiles: ProjectileEntity[];
  particles: ParticleEntity[];
  warnings: WarningEntity[];
  floaters: FloaterEntity[];
  timeOfDay: TimeOfDayInfo;
  weather?: WeatherInfo;
  lightningFlash?: number;
  comboCount?: number;
  comboVignettePulse?: number;
  activeQuest: ActiveQuestState | null;
  atLevelCap?: boolean;
  bossRespawns?: Record<string, number>;
  dungeonCleared?: boolean;
  forceFullRedraw?: boolean;
}

let lightCanvas: HTMLCanvasElement | null = null;
let lightCtx: CanvasRenderingContext2D | null = null;
const LIGHT_SCALE = 0.25;

// Dynamic quadrant static terrain cache (each quad = 24x24 tiles = 768x768px, safe for GPU/mobile texture caches)
const QUAD_TILES = 24;
const QUAD_PX = QUAD_TILES * TILE;
let terrainQuads: (HTMLCanvasElement | null)[] | null = null;
let terrainQuadCols = 2;
let terrainQuadRows = 2;
let terrainQuadKey: string | null = null;

// Ping-pong offscreen viewport static terrain cache (scroll-blit + edge-strip redraw on camera movement)
let terrainViewBufs: [HTMLCanvasElement, HTMLCanvasElement] | null = null;
let terrainViewCtxs: [CanvasRenderingContext2D, CanvasRenderingContext2D] | null = null;
let activeTerrainBufIdx = 0;
let terrainViewKey: string | null = null;
let terrainViewW = 0;
let terrainViewH = 0;
let terrainViewIcx = 0;
let terrainViewIcy = 0;

// Cached compact vignette sprites (stretched at draw time to cut fill bandwidth ~25x)
let vignetteCanvas: HTMLCanvasElement | null = null;
let lowHpCanvas: HTMLCanvasElement | null = null;
let comboHotVignetteCanvas: HTMLCanvasElement | null = null;
let comboGoldVignetteCanvas: HTMLCanvasElement | null = null;
let fogPuffSprite: HTMLCanvasElement | null = null;
let fogEdgeVeilCanvas: HTMLCanvasElement | null = null;
let lastLightningFlashVal = 0;
let lightningBoltSeed = 1;

// Cached offscreen radial glow & cutout sprites (eliminates per-frame createRadialGradient & shadowBlur)
const glowSpriteCache = new Map<string, HTMLCanvasElement>();
let lightCutoutSprite: HTMLCanvasElement | null = null;

function getGlowSprite(color: string): HTMLCanvasElement {
  const cached = glowSpriteCache.get(color);
  if (cached) return cached;
  if (glowSpriteCache.size >= 64) glowSpriteCache.clear();
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  rg.addColorStop(0, color);
  rg.addColorStop(0.45, color);
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  glowSpriteCache.set(color, c);
  return c;
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha = 0.35
): void {
  if (alpha <= 0.01 || radius <= 0.5) return;
  const sprite = getGlowSprite(color);
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * alpha;
  ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = prevAlpha;
}

function getLightCutoutSprite(): HTMLCanvasElement {
  if (lightCutoutSprite) return lightCutoutSprite;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(64, 64, 4, 64, 64, 63);
  rg.addColorStop(0, 'rgba(0,0,0,1)');
  rg.addColorStop(0.5, 'rgba(0,0,0,0.62)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  lightCutoutSprite = c;
  return c;
}

// Spatial chunk grid for world.decos + pre-baked tree/rock sprite caches
const DECO_CHUNK_PX = 16 * TILE;
let decoGridKey: string | null = null;
let decoGridCols = 1;
let decoGridRows = 1;
let decoGridBuckets: DecoEntity[][] = [];
const decoSpriteCache = new Map<string, HTMLCanvasElement>();

function ensureDecoGrid(world: WorldData): {
  buckets: DecoEntity[][];
  cols: number;
  rows: number;
} {
  const key = `${world.worldId}:${world.width}x${world.height}:${world.seed}:${world.dungeonFloor ?? 0}:${world.decos.length}`;
  if (decoGridKey === key) {
    return { buckets: decoGridBuckets, cols: decoGridCols, rows: decoGridRows };
  }
  const cols = Math.max(1, Math.ceil((world.width * TILE) / DECO_CHUNK_PX));
  const rows = Math.max(1, Math.ceil((world.height * TILE) / DECO_CHUNK_PX));
  const buckets: DecoEntity[][] = Array.from({ length: cols * rows }, () => []);
  for (let i = 0; i < world.decos.length; i++) {
    const dc = world.decos[i];
    const gx = clamp(Math.floor(dc.x / DECO_CHUNK_PX), 0, cols - 1);
    const gy = clamp(Math.floor(dc.y / DECO_CHUNK_PX), 0, rows - 1);
    buckets[gy * cols + gx].push(dc);
  }
  decoGridKey = key;
  decoGridCols = cols;
  decoGridRows = rows;
  decoGridBuckets = buckets;
  return { buckets, cols, rows };
}

function getDecoRockSprite(variant: number, worldId: WorldId): HTMLCanvasElement {
  const key = `rock:${worldId}:${variant}`;
  const cached = decoSpriteCache.get(key);
  if (cached) return cached;
  const v = variant / 5;
  const isW2 = worldId === 'world2';
  const c = document.createElement('canvas');
  c.width = 40;
  c.height = 36;
  const g = c.getContext('2d')!;
  const ox = 20;
  const oy = 20;
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath();
  g.ellipse(ox, oy + 9, 15, 6, 0, 0, TAU);
  g.fill();
  g.fillStyle = isW2 ? `hsl(260,14%,${24 + v * 10}%)` : `hsl(215,8%,${38 + v * 14}%)`;
  g.beginPath();
  g.moveTo(ox - 13, oy + 10);
  g.lineTo(ox - 8, oy - 8 - v * 5);
  g.lineTo(ox + 4, oy - 14);
  g.lineTo(ox + 14, oy - 3);
  g.lineTo(ox + 11, oy + 11);
  g.closePath();
  g.fill();
  g.fillStyle = isW2 ? `hsl(14,45%,${36 + v * 12}%)` : `hsl(215,11%,${52 + v * 12}%)`;
  g.beginPath();
  g.moveTo(ox - 7, oy - 6);
  g.lineTo(ox + 3, oy - 12);
  g.lineTo(ox + 8, oy - 3);
  g.closePath();
  g.fill();
  decoSpriteCache.set(key, c);
  return c;
}

function getDecoTreeCanopySprite(variant: number, worldId: WorldId): HTMLCanvasElement {
  const key = `tree:${worldId}:${variant}`;
  const cached = decoSpriteCache.get(key);
  if (cached) return cached;
  const v = variant / 5;
  const isW2 = worldId === 'world2';
  const c = document.createElement('canvas');
  c.width = 56;
  c.height = 56;
  const g = c.getContext('2d')!;
  const ox = 28;
  const oy = 30;
  const R = 15 + v * 7;
  const hue = isW2 ? 344 + v * 16 : 120 + v * 14;
  const sat = isW2 ? 42 : 36;
  g.fillStyle = `hsl(${hue},${sat}%,${19 + v * 7}%)`;
  g.beginPath();
  g.arc(ox, oy, R, 0, TAU);
  g.fill();
  g.fillStyle = `hsl(${hue - 2},${sat + 6}%,${28 + v * 9}%)`;
  g.beginPath();
  g.arc(ox - R * 0.32, oy - 6, R * 0.68, 0, TAU);
  g.fill();
  g.fillStyle = `hsl(${hue - 4},${sat + 10}%,${36 + v * 10}%)`;
  g.beginPath();
  g.arc(ox - R * 0.3, oy - 11, R * 0.38, 0, TAU);
  g.fill();
  decoSpriteCache.set(key, c);
  return c;
}

interface PooledRenderEnt {
  y: number;
  kind: 'deco' | 'mob' | 'player' | 'remote' | 'boss';
  obj: unknown;
}
const renderEntPool: PooledRenderEnt[] = [];

function bakeTerrainQuad(
  world: WorldData,
  atlas: TileSpriteAtlas,
  q: number,
  cols: number
): HTMLCanvasElement {
  const spriteSet = atlas.byWorld?.[world.worldId] ?? atlas;
  const isW2 = world.worldId === 'world2';
  const isCity = world.worldId === 'grand_city';
  const isDungeon = world.worldId === 'dungeon';
  const qCol = q % cols;
  const qRow = Math.floor(q / cols);
  const qx = qCol * QUAD_TILES;
  const qy = qRow * QUAD_TILES;
  const qwTiles = Math.min(QUAD_TILES, world.width - qx);
  const qhTiles = Math.min(QUAD_TILES, world.height - qy);

  const c = document.createElement('canvas');
  c.width = Math.max(1, qwTiles * TILE);
  c.height = Math.max(1, qhTiles * TILE);
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  for (let ly = 0; ly < qhTiles; ly++) {
    const ty = qy + ly;
    for (let lx = 0; lx < qwTiles; lx++) {
      const tx = qx + lx;
      const idx = world.tileImgIdx[ty * world.width + tx];
      const img = spriteSet.imgs[idx];
      const px = lx * TILE;
      const py = ly * TILE;
      if (img) g.drawImage(img, px, py);
      else {
        g.fillStyle = isDungeon ? '#111122' : isW2 ? '#24141d' : '#1a3a1a';
        g.fillRect(px, py, TILE, TILE);
      }

      const t = world.tiles[ty][tx];
      const up = ty > 0 ? world.tiles[ty - 1][tx] : t;
      const dn = ty < world.height - 1 ? world.tiles[ty + 1][tx] : t;
      const lf = tx > 0 ? world.tiles[ty][tx - 1] : t;
      const rt = tx < world.width - 1 ? world.tiles[ty][tx + 1] : t;

      if (t === T_WATER) {
        g.fillStyle = isW2 ? 'rgba(232,121,249,0.22)' : isCity ? 'rgba(125,211,252,0.3)' : 'rgba(186,230,253,0.24)';
        if (up !== T_WATER) g.fillRect(px, py, TILE, 3);
        if (dn !== T_WATER) g.fillRect(px, py + TILE - 3, TILE, 3);
        if (lf !== T_WATER) g.fillRect(px, py, 3, TILE);
        if (rt !== T_WATER) g.fillRect(px + TILE - 3, py, 3, TILE);
      }

      if (t === T_SAND && (up === T_WATER || dn === T_WATER || lf === T_WATER || rt === T_WATER)) {
        g.fillStyle = isW2 ? 'rgba(30,27,46,0.48)' : isCity ? 'rgba(248,250,252,0.28)' : 'rgba(71,85,105,0.34)';
        g.fillRect(px, py, TILE, TILE);
        g.fillStyle = isW2 ? '#64748b' : isCity ? '#fef3c7' : '#cbd5e1';
        if (up === T_WATER) g.fillRect(px, py, TILE, 4);
        if (dn === T_WATER) g.fillRect(px, py + TILE - 4, TILE, 4);
        if (lf === T_WATER) g.fillRect(px, py, 4, TILE);
        if (rt === T_WATER) g.fillRect(px + TILE - 4, py, 4, TILE);
        g.fillStyle = 'rgba(15,23,42,0.24)';
        g.fillRect(px + 2, py + 15, TILE - 4, 1.5);
        g.fillRect(px + 15, py + 2, 1.5, TILE - 4);
      }
    }
  }
  return c;
}

function ensureTerrainQuads(
  world: WorldData
): { quads: (HTMLCanvasElement | null)[]; cols: number; rows: number } {
  const cols = Math.max(1, Math.ceil(world.width / QUAD_TILES));
  const rows = Math.max(1, Math.ceil(world.height / QUAD_TILES));
  const key = `${world.worldId}:${world.width}x${world.height}:${world.seed}:${world.dungeonFloor ?? 0}`;
  if (terrainQuads && terrainQuadCols === cols && terrainQuadRows === rows && terrainQuadKey === key) {
    return { quads: terrainQuads, cols, rows };
  }
  const totalQuads = cols * rows;
  terrainQuads = new Array<HTMLCanvasElement | null>(totalQuads).fill(null);
  terrainQuadCols = cols;
  terrainQuadRows = rows;
  terrainQuadKey = key;
  return { quads: terrainQuads, cols, rows };
}

function ensureVignetteCanvas(): HTMLCanvasElement {
  if (vignetteCanvas) return vignetteCanvas;
  const vw = 256;
  const vh = 144;
  const c = document.createElement('canvas');
  c.width = vw;
  c.height = vh;
  const g = c.getContext('2d')!;
  const vg = g.createRadialGradient(
    vw / 2,
    vh / 2,
    Math.min(vw, vh) * 0.3,
    vw / 2,
    vh / 2,
    Math.max(vw, vh) * 0.78
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.6, 'rgba(0,0,0,.18)');
  vg.addColorStop(1, 'rgba(0,0,0,.66)');
  g.fillStyle = vg;
  g.fillRect(0, 0, vw, vh);
  vignetteCanvas = c;
  return c;
}

function ensureLowHpVignetteCanvas(): HTMLCanvasElement {
  if (lowHpCanvas) return lowHpCanvas;
  const vw = 256;
  const vh = 144;
  const c = document.createElement('canvas');
  c.width = vw;
  c.height = vh;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(
    vw / 2,
    vh / 2,
    Math.min(vw, vh) * 0.22,
    vw / 2,
    vh / 2,
    Math.max(vw, vh) * 0.68
  );
  rg.addColorStop(0, 'rgba(220,38,38,0)');
  rg.addColorStop(1, 'rgba(220,38,38,1)');
  g.fillStyle = rg;
  g.fillRect(0, 0, vw, vh);
  lowHpCanvas = c;
  return c;
}

function ensureComboVignetteCanvas(tier: 'hot' | 'gold'): HTMLCanvasElement {
  if (tier === 'gold' && comboGoldVignetteCanvas) return comboGoldVignetteCanvas;
  if (tier === 'hot' && comboHotVignetteCanvas) return comboHotVignetteCanvas;
  const vw = 256;
  const vh = 144;
  const c = document.createElement('canvas');
  c.width = vw;
  c.height = vh;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(
    vw / 2,
    vh / 2,
    Math.min(vw, vh) * 0.34,
    vw / 2,
    vh / 2,
    Math.max(vw, vh) * 0.72
  );
  if (tier === 'gold') {
    rg.addColorStop(0, 'rgba(251,191,36,0)');
    rg.addColorStop(0.62, 'rgba(245,158,11,0.16)');
    rg.addColorStop(0.86, 'rgba(251,191,36,0.58)');
    rg.addColorStop(1, 'rgba(254,240,138,0.96)');
    g.fillStyle = rg;
    g.fillRect(0, 0, vw, vh);
    comboGoldVignetteCanvas = c;
    return c;
  }
  rg.addColorStop(0, 'rgba(232,121,249,0)');
  rg.addColorStop(0.64, 'rgba(217,70,239,0.14)');
  rg.addColorStop(0.88, 'rgba(244,63,94,0.52)');
  rg.addColorStop(1, 'rgba(251,113,133,0.9)');
  g.fillStyle = rg;
  g.fillRect(0, 0, vw, vh);
  comboHotVignetteCanvas = c;
  return c;
}

function ensureFogPuffSprite(): HTMLCanvasElement {
  if (fogPuffSprite) return fogPuffSprite;
  const sz = 96;
  const c = document.createElement('canvas');
  c.width = sz;
  c.height = sz;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(sz / 2, sz / 2, 2, sz / 2, sz / 2, sz / 2);
  rg.addColorStop(0, 'rgba(241, 245, 249, 0.56)');
  rg.addColorStop(0.38, 'rgba(203, 213, 225, 0.34)');
  rg.addColorStop(0.72, 'rgba(148, 163, 184, 0.12)');
  rg.addColorStop(1, 'rgba(148, 163, 184, 0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, sz, sz);
  fogPuffSprite = c;
  return c;
}

function ensureFogEdgeVeilCanvas(): HTMLCanvasElement {
  if (fogEdgeVeilCanvas) return fogEdgeVeilCanvas;
  const vw = 256;
  const vh = 144;
  const c = document.createElement('canvas');
  c.width = vw;
  c.height = vh;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(
    vw / 2,
    vh / 2,
    Math.min(vw, vh) * 0.2,
    vw / 2,
    vh / 2,
    Math.max(vw, vh) * 0.72
  );
  rg.addColorStop(0, 'rgba(203, 213, 225, 0.03)');
  rg.addColorStop(0.55, 'rgba(148, 163, 184, 0.16)');
  rg.addColorStop(1, 'rgba(203, 213, 225, 0.36)');
  g.fillStyle = rg;
  g.fillRect(0, 0, vw, vh);
  fogEdgeVeilCanvas = c;
  return c;
}

function ensureLightCanvas(vw: number, vh: number): { ctx: CanvasRenderingContext2D; lw: number; lh: number } | null {
  const lw = Math.max(1, Math.ceil(vw * LIGHT_SCALE));
  const lh = Math.max(1, Math.ceil(vh * LIGHT_SCALE));
  if (!lightCanvas) {
    lightCanvas = document.createElement('canvas');
    lightCtx = lightCanvas.getContext('2d');
  }
  if (lightCanvas.width !== lw || lightCanvas.height !== lh) {
    lightCanvas.width = lw;
    lightCanvas.height = lh;
  }
  return lightCtx ? { ctx: lightCtx, lw, lh } : null;
}

function getWorldVoidFill(worldId: WorldId): string {
  return worldId === 'world2'
    ? '#12080f'
    : worldId === 'dungeon'
    ? '#060714'
    : worldId === 'grand_city'
    ? '#09111c'
    : '#070b10';
}

function drawTerrainQuadsIntoRect(
  g: CanvasRenderingContext2D,
  world: WorldData,
  atlas: TileSpriteAtlas,
  quads: (HTMLCanvasElement | null)[],
  cols: number,
  rows: number,
  icx: number,
  icy: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): void {
  if (rw <= 0 || rh <= 0) return;
  const rx1 = rx + rw;
  const ry1 = ry + rh;
  const wPx = world.width * TILE;
  const hPx = world.height * TILE;
  if (icx + rx < 0 || icy + ry < 0 || icx + rx1 > wPx || icy + ry1 > hPx) {
    g.fillStyle = getWorldVoidFill(world.worldId);
    g.fillRect(rx, ry, rw, rh);
  }
  const qCol0 = Math.max(0, Math.floor((icx + rx) / QUAD_PX));
  const qCol1 = Math.min(cols - 1, Math.floor((icx + rx1 - 1) / QUAD_PX));
  const qRow0 = Math.max(0, Math.floor((icy + ry) / QUAD_PX));
  const qRow1 = Math.min(rows - 1, Math.floor((icy + ry1 - 1) / QUAD_PX));
  for (let qRow = qRow0; qRow <= qRow1; qRow++) {
    const qwy = qRow * QUAD_PX;
    const dy = qwy - icy;
    for (let qCol = qCol0; qCol <= qCol1; qCol++) {
      const q = qRow * cols + qCol;
      let qCanvas = quads[q];
      if (!qCanvas) {
        qCanvas = bakeTerrainQuad(world, atlas, q, cols);
        quads[q] = qCanvas;
      }
      const qwx = qCol * QUAD_PX;
      const qw = qCanvas.width;
      const qh = qCanvas.height;
      const dx = qwx - icx;
      const ox0 = Math.max(rx, dx);
      const oy0 = Math.max(ry, dy);
      const ox1 = Math.min(rx1, dx + qw);
      const oy1 = Math.min(ry1, dy + qh);
      const sw = ox1 - ox0;
      const sh = oy1 - oy0;
      if (sw > 0 && sh > 0) {
        g.drawImage(qCanvas, ox0 - dx, oy0 - dy, sw, sh, ox0, oy0, sw, sh);
      }
    }
  }
}

function ensureTerrainViewportBuffer(
  world: WorldData,
  atlas: TileSpriteAtlas,
  worldKey: string,
  vw: number,
  vh: number,
  icx: number,
  icy: number
): { buf: HTMLCanvasElement; ivw: number; ivh: number } {
  const ivw = Math.max(1, Math.round(vw));
  const ivh = Math.max(1, Math.round(vh));
  const { quads, cols, rows } = ensureTerrainQuads(world);
  if (!terrainViewBufs || !terrainViewCtxs) {
    const b0 = document.createElement('canvas');
    const b1 = document.createElement('canvas');
    const c0 = b0.getContext('2d', { alpha: false })!;
    const c1 = b1.getContext('2d', { alpha: false })!;
    terrainViewBufs = [b0, b1];
    terrainViewCtxs = [c0, c1];
  }
  const bufs = terrainViewBufs;
  const ctxs = terrainViewCtxs;
  const wChanged = terrainViewW !== ivw || terrainViewH !== ivh;
  if (wChanged) {
    bufs[0].width = ivw;
    bufs[0].height = ivh;
    bufs[1].width = ivw;
    bufs[1].height = ivh;
    ctxs[0].imageSmoothingEnabled = false;
    ctxs[1].imageSmoothingEnabled = false;
  }

  const keyChanged = terrainViewKey !== worldKey || wChanged;
  if (keyChanged) {
    activeTerrainBufIdx = 0;
    drawTerrainQuadsIntoRect(ctxs[0], world, atlas, quads, cols, rows, icx, icy, 0, 0, ivw, ivh);
    terrainViewKey = worldKey;
    terrainViewW = ivw;
    terrainViewH = ivh;
    terrainViewIcx = icx;
    terrainViewIcy = icy;
    return { buf: bufs[0], ivw, ivh };
  }

  const dx = icx - terrainViewIcx;
  const dy = icy - terrainViewIcy;
  if (dx === 0 && dy === 0) {
    return { buf: bufs[activeTerrainBufIdx], ivw, ivh };
  }

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx < ivw && absDy < ivh) {
    const nextIdx = 1 - activeTerrainBufIdx;
    const prevBuf = bufs[activeTerrainBufIdx];
    const nextCtx = ctxs[nextIdx];
    const srcX = dx > 0 ? dx : 0;
    const srcY = dy > 0 ? dy : 0;
    const dstX = dx < 0 ? -dx : 0;
    const dstY = dy < 0 ? -dy : 0;
    const copyW = ivw - absDx;
    const copyH = ivh - absDy;
    if (copyW > 0 && copyH > 0) {
      nextCtx.drawImage(prevBuf, srcX, srcY, copyW, copyH, dstX, dstY, copyW, copyH);
    }
    if (absDx > 0) {
      const stripX = dx > 0 ? ivw - absDx : 0;
      drawTerrainQuadsIntoRect(nextCtx, world, atlas, quads, cols, rows, icx, icy, stripX, 0, absDx, ivh);
    }
    if (absDy > 0) {
      const stripY = dy > 0 ? ivh - absDy : 0;
      drawTerrainQuadsIntoRect(nextCtx, world, atlas, quads, cols, rows, icx, icy, 0, stripY, ivw, absDy);
    }
    activeTerrainBufIdx = nextIdx;
  } else {
    drawTerrainQuadsIntoRect(ctxs[activeTerrainBufIdx], world, atlas, quads, cols, rows, icx, icy, 0, 0, ivw, ivh);
  }

  terrainViewIcx = icx;
  terrainViewIcy = icy;
  return { buf: bufs[activeTerrainBufIdx], ivw, ivh };
}

export function renderWorld(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const {
    vw,
    vh,
    camX,
    camY,
    camShake,
    gameTime,
    world,
    atlas,
    player: p,
    afterimages,
    mobs,
    boss,
    drops,
    projectiles,
    particles,
    warnings,
    floaters,
    timeOfDay,
    comboCount = 0,
    comboVignettePulse = 0,
    activeQuest,
    atLevelCap,
    bossRespawns,
    dungeonCleared = false,
    forceFullRedraw,
  } = state;

  const shakeX = camShake > 0 ? rand(-camShake, camShake) : 0;
  const shakeY = camShake > 0 ? rand(-camShake, camShake) : 0;
  // 整数像素锁定：保证离屏地形与实体/怪物脚底严格对齐，彻底消除移动时地面偏移与静止黑线裂痕
  const cx = Math.round(camX + shakeX);
  const cy = Math.round(camY + shakeY);
  const icx = cx;
  const icy = cy;
  const worldKey = `${world.worldId}:${world.width}x${world.height}:${world.seed}:${world.dungeonFloor ?? 0}`;

  // ---- 地形离屏视口缓存（移动时仅增量重绘边缘新暴露条带） ----
  const { buf: terrainBuf, ivw, ivh } = ensureTerrainViewportBuffer(
    world,
    atlas,
    worldKey,
    vw,
    vh,
    icx,
    icy
  );

  const x0 = Math.max(0, Math.floor(cx / TILE));
  const y0 = Math.max(0, Math.floor(cy / TILE));
  const x1 = Math.min(world.width - 1, Math.floor((cx + vw) / TILE));
  const y1 = Math.min(world.height - 1, Math.floor((cy + vh) / TILE));

  const hasLowHp = p.hp / p.maxHp < 0.3;
  const hasComboVignette = comboCount >= 25 || comboVignettePulse > 0.01;
  void forceFullRedraw;

  // ---- 实体排序（空间分桶装饰 + 池化排序，减少 GC） ----
  let entCount = 0;
  const pushEnt = (y: number, kind: PooledRenderEnt['kind'], obj: unknown) => {
    if (entCount < renderEntPool.length) {
      const slot = renderEntPool[entCount];
      slot.y = y;
      slot.kind = kind;
      slot.obj = obj;
    } else {
      renderEntPool.push({ y, kind, obj });
    }
    entCount++;
  };

  const pad = 90;
  const { buckets, cols: dCols, rows: dRows } = ensureDecoGrid(world);
  const gx0 = clamp(Math.floor((cx - pad) / DECO_CHUNK_PX), 0, dCols - 1);
  const gy0 = clamp(Math.floor((cy - pad) / DECO_CHUNK_PX), 0, dRows - 1);
  const gx1 = clamp(Math.floor((cx + vw + pad) / DECO_CHUNK_PX), 0, dCols - 1);
  const gy1 = clamp(Math.floor((cy + vh + pad) / DECO_CHUNK_PX), 0, dRows - 1);
  const minX = cx - pad;
  const maxX = cx + vw + pad;
  const minY = cy - pad;
  const maxY = cy + vh + pad;

  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const list = buckets[gy * dCols + gx];
      for (let k = 0; k < list.length; k++) {
        const dc = list[k];
        if (dc.x < minX || dc.x > maxX || dc.y < minY || dc.y > maxY) continue;
        pushEnt(dc.y, 'deco', dc);
      }
    }
  }
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (m.x < minX || m.x > maxX || m.y < minY || m.y > maxY) continue;
    pushEnt(m.y, 'mob', m);
  }
  if (state.remotePlayers) {
    for (let i = 0; i < state.remotePlayers.length; i++) {
      const rp = state.remotePlayers[i];
      if (rp.x < minX || rp.x > maxX || rp.y < minY || rp.y > maxY) continue;
      pushEnt(rp.y, 'remote', rp);
    }
  }
  pushEnt(p.y, 'player', p);
  if (boss) {
    pushEnt(boss.y, 'boss', boss);
  }

  // 整帧单次无裁切贴图：杜绝非整数 DPR 下脏矩形 clip 边界造成的黑线裂痕与怪物脚下地面抖动偏移
  ctx.drawImage(terrainBuf, 0, 0, ivw, ivh, 0, 0, vw, vh);

  // 水面动态高光（状态提升至循环外，消除每格 fillStyle 重置）
  ctx.fillStyle = world.worldId === 'world2' ? 'rgba(232,121,249,.14)' : 'rgba(160,220,255,.12)';
  const gtWater = gameTime * 2;
  for (let ty = y0; ty <= y1; ty++) {
    const row = world.tiles[ty];
    const sy = (ty * TILE - cy) | 0;
    for (let tx = x0; tx <= x1; tx++) {
      if (row[tx] !== T_WATER) continue;
      const sx = (tx * TILE - cx) | 0;
      const off = Math.sin(gtWater + tx * 0.7 + ty * 0.4) * 3;
      ctx.fillRect(sx + 4, sy + 10 + off, 20, 2);
    }
  }

  // ---- 主城安全区光环结界 ----
  if (world.safeRadius > 0) {
    const cityX = world.spawnX - cx;
    const cityY = world.spawnY - cy;
    const sr = world.safeRadius;
    if (
      cityX + sr > -40 &&
      cityY + sr > -40 &&
      cityX - sr < vw + 40 &&
      cityY - sr < vh + 40
    ) {
      ctx.save();
      ctx.strokeStyle =
        world.worldId === 'world2' ? 'rgba(244, 114, 182, 0.25)' : 'rgba(52, 211, 153, 0.28)';
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 10]);
      ctx.beginPath();
      ctx.arc(cityX, cityY, sr, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // ---- 固定 BOSS 祭坛印记 ----
  for (let i = 0; i < world.bossArenas.length; i++) {
    const arena = world.bossArenas[i];
    const sx = arena.x - cx;
    const sy = arena.y - cy;
    if (sx < -220 || sy < -220 || sx > vw + 220 || sy > vh + 220) continue;
    const cd = bossRespawns?.[arena.id] ?? 0;
    const isActive = boss?.fixedBossId === arena.id;
    drawBossArenaSigil(ctx, arena, sx, sy, gameTime, cd, isActive);
  }

  // ---- 路牌 ----
  for (let i = 0; i < world.signposts.length; i++) {
    const sp = world.signposts[i];
    const sx = sp.x - cx;
    const sy = sp.y - cy;
    if (sx < -90 || sy < -90 || sx > vw + 90 || sy > vh + 90) continue;
    drawSignpost(ctx, sp, sx, sy);
  }

  // ---- 宝箱 ----
  for (let i = 0; i < world.chests.length; i++) {
    const c = world.chests[i];
    const sx = c.x - cx;
    const sy = c.y - cy;
    if (sx < -70 || sy < -70 || sx > vw + 70 || sy > vh + 70) continue;
    drawChest(ctx, c, sx, sy, gameTime);
  }

  // ---- 火把 ----
  for (let i = 0; i < world.torches.length; i++) {
    const t = world.torches[i];
    const sx = t.x - cx;
    const sy = t.y - cy;
    if (sx < -60 || sy < -60 || sx > vw + 60 || sy > vh + 60) continue;
    drawTorch(ctx, t, sx, sy, gameTime);
  }

  // ---- 主城 NPC 群与地标 ----
  const onMap = (e: { x: number; y: number }, padR = 90) =>
    e.x > -500 &&
    e.y > -500 &&
    e.x - cx > -padR &&
    e.y - cy > -padR &&
    e.x - cx < vw + padR &&
    e.y - cy < vh + padR;

  if (onMap(world.merchant)) drawMerchant(ctx, world.merchant, world.merchant.x - cx, world.merchant.y - cy, gameTime);
  if (onMap(world.elder)) drawElder(ctx, world.elder, world.elder.x - cx, world.elder.y - cy, gameTime, activeQuest, Boolean(atLevelCap));
  if (onMap(world.awakening)) drawAwakeningNpc(ctx, world.awakening, world.awakening.x - cx, world.awakening.y - cy, gameTime, !p.awakened);
  if (onMap(world.blacksmith)) drawBlacksmith(ctx, world.blacksmith, world.blacksmith.x - cx, world.blacksmith.y - cy, gameTime);
  if (onMap(world.armorer)) drawArmorer(ctx, world.armorer, world.armorer.x - cx, world.armorer.y - cy, gameTime);
  if (onMap(world.upgrader)) drawUpgrader(ctx, world.upgrader, world.upgrader.x - cx, world.upgrader.y - cy, gameTime);
  if (onMap(world.altar)) drawAltar(ctx, world.altar, world.altar.x - cx, world.altar.y - cy, gameTime);
  if (onMap(world.portal, 78)) {
    drawPortal(
      ctx,
      world.portal,
      world.portal.x - cx,
      world.portal.y - cy,
      gameTime,
      world.dungeonFloor,
      dungeonCleared
    );
  }
  if (world.dungeonGate && onMap(world.dungeonGate, 84)) {
    drawDungeonGate(ctx, world.dungeonGate, world.dungeonGate.x - cx, world.dungeonGate.y - cy, gameTime);
  }
  if (world.socialBoard && onMap(world.socialBoard, 76)) {
    drawSocialBoard(ctx, world.socialBoard, world.socialBoard.x - cx, world.socialBoard.y - cy, gameTime);
  }

  // ---- 掉落物 ----
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    const sx = d.x - cx;
    const sy = d.y - cy;
    if (sx < -50 || sy < -50 || sx > vw + 50 || sy > vh + 50) continue;
    drawDrop(ctx, d, sx, sy, gameTime);
  }

  // ---- 预警圈 ----
  for (let i = 0; i < warnings.length; i++) {
    const w = warnings[i];
    const sx = w.x - cx;
    const sy = w.y - cy;
    const a = 1 - w.life / w.maxLife;
    ctx.save();
    ctx.globalAlpha = 0.25 + a * 0.28;
    ctx.fillStyle = w.color;
    ctx.beginPath();
    ctx.arc(sx, sy, w.r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = w.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx, sy, w.r, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // ---- 冲刺残影 ----
  for (let i = 0; i < afterimages.length; i++) {
    const af = afterimages[i];
    drawPlayerAfterimage(ctx, af, cx, cy);
  }

  // Insertion sort on small active visible entity slice (fast & zero-allocation)
  for (let i = 1; i < entCount; i++) {
    const curY = renderEntPool[i].y;
    const curKind = renderEntPool[i].kind;
    const curObj = renderEntPool[i].obj;
    let j = i - 1;
    while (j >= 0 && renderEntPool[j].y > curY) {
      renderEntPool[j + 1].y = renderEntPool[j].y;
      renderEntPool[j + 1].kind = renderEntPool[j].kind;
      renderEntPool[j + 1].obj = renderEntPool[j].obj;
      j--;
    }
    renderEntPool[j + 1].y = curY;
    renderEntPool[j + 1].kind = curKind;
    renderEntPool[j + 1].obj = curObj;
  }

  for (let i = 0; i < entCount; i++) {
    const e = renderEntPool[i];
    if (e.kind === 'deco') {
      const dc = e.obj as DecoEntity;
      drawDeco(ctx, dc, cx, cy, gameTime, world.worldId);
    } else if (e.kind === 'mob') {
      const m = e.obj as MobEntity;
      if (isWaterAt(world.tiles, m.x, m.y)) {
        drawWaterRipple(ctx, m.x - cx, m.y - cy + m.r * 0.72, m.r * 1.15, gameTime + m.phase, world.worldId);
      }
      drawMob(ctx, m, cx, cy, p, vw, vh, gameTime);
    } else if (e.kind === 'boss') {
      drawBoss(ctx, e.obj as BossEntity, cx, cy, p, gameTime);
    } else if (e.kind === 'remote') {
      const rp = e.obj as RemotePlayerEntity;
      drawRemotePlayer(ctx, rp, cx, cy, gameTime);
    } else {
      if (isWaterAt(world.tiles, p.x, p.y)) {
        drawWaterRipple(ctx, p.x - cx, p.y - cy + p.r * 0.76, p.r * 1.3, gameTime * 1.6, world.worldId);
      }
      drawPlayer(ctx, e.obj as PlayerEntity, cx, cy, gameTime);
    }
  }

  // ---- 投射物（预烘光晕精灵替代 shadowBlur） ----
  for (let i = 0; i < projectiles.length; i++) {
    const pr = projectiles[i];
    for (let tIdx = 0; tIdx < pr.trail.length; tIdx++) {
      const t = pr.trail[tIdx];
      if (t.life <= 0) continue;
      const a = t.life / 0.25;
      ctx.globalAlpha = a * 0.55;
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.arc(t.x - cx, t.y - cy, pr.r * a * 0.85, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const px = pr.x - cx;
    const py = pr.y - cy;
    if (px < -60 || py < -60 || px > vw + 60 || py > vh + 60) continue;
    drawGlow(ctx, px, py, pr.r * 2.2, pr.color, 0.5);
    const ang = Math.atan2(pr.vy, pr.vx);
    ctx.save();
    if (pr.shape === 'trident') {
      ctx.translate(px, py);
      ctx.rotate(ang);
      const s = Math.max(1.0, pr.r / 9);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.2;
      ctx.fillStyle = '#fde047';
      ctx.fillRect(-13 * s, -1.6 * s, 21 * s, 3.2 * s);
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.moveTo(18 * s, 0);
      ctx.lineTo(5 * s, -4.4 * s);
      ctx.lineTo(13 * s, -9.5 * s);
      ctx.lineTo(1 * s, -6.5 * s);
      ctx.lineTo(3 * s, -2.5 * s);
      ctx.lineTo(3 * s, 2.5 * s);
      ctx.lineTo(1 * s, 6.5 * s);
      ctx.lineTo(13 * s, 9.5 * s);
      ctx.lineTo(5 * s, 4.4 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(6 * s, 0, 2.6 * s, 0, TAU);
      ctx.fill();
    } else if (pr.shape === 'crescent') {
      ctx.translate(px, py);
      ctx.rotate(ang);
      const s = Math.max(1.0, pr.r / 8);
      ctx.fillStyle = pr.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, 12 * s, -1.25, 1.25);
      ctx.quadraticCurveTo(3 * s, 0, 12 * s * Math.cos(-1.25), 12 * s * Math.sin(-1.25));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.arc(px, py, pr.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(px, py, pr.r * 0.45, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- 粒子（暗黑奇幻多形态特效：斩击弧线 / 符文震波 / 锐利晶屑 / 余烬微粒） ----
  for (let i = 0; i < particles.length; i++) {
    const pt = particles[i];
    const sx = pt.x - cx;
    const sy = pt.y - cy;
    const kind = pt.kind ?? (pt.ring ? 'ring' : 'dot');
    const isRingLike = kind === 'ring' || kind === 'rune' || Boolean(pt.ring);
    const rad =
      kind === 'slash'
        ? (pt.r1 ?? pt.r ?? 64) + 18
        : isRingLike
        ? (pt.r1 ?? 60) + 14
        : (pt.r ?? 3) + 10;
    if (sx < -rad || sy < -rad || sx > vw + rad || sy > vh + rad) continue;
    const a = clamp(pt.life / pt.maxLife, 0, 1);

    if (kind === 'slash') {
      const t = 1 - a;
      const radius = lerp(pt.r0 ?? 26, pt.r1 ?? 86, 1 - Math.pow(1 - t, 2));
      const ang = pt.ang ?? 0;
      const halfArc = (pt.arc ?? 1.9) * 0.5;
      const strokeW = (pt.width ?? 14) * a + 2;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ang);
      // 暗影外轮廓描边
      ctx.globalAlpha = a * 0.65;
      ctx.strokeStyle = '#0f071a';
      ctx.lineWidth = strokeW + 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, radius, -halfArc, halfArc);
      ctx.stroke();
      // 主色斩击光弧
      ctx.globalAlpha = a * 0.92;
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = strokeW;
      ctx.beginPath();
      ctx.arc(0, 0, radius, -halfArc, halfArc);
      ctx.stroke();
      // 炽白锋芒核心线
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = '#fef9c3';
      ctx.lineWidth = Math.max(1.4, strokeW * 0.34);
      ctx.beginPath();
      ctx.arc(0, 0, radius + strokeW * 0.14, -halfArc * 0.78, halfArc * 0.78);
      ctx.stroke();
      ctx.restore();
      continue;
    }

    if (kind === 'rune') {
      const t = 1 - a;
      const r = lerp(pt.r0 ?? 12, pt.r1 ?? 110, 1 - Math.pow(1 - t, 2));
      const rot = (pt.ang ?? 0) + t * 2.2;
      drawGlow(ctx, sx, sy, Math.min(r * 1.15, 160), pt.color, a * 0.22);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(rot);
      ctx.globalAlpha = a * 0.45;
      ctx.strokeStyle = '#0f071a';
      ctx.lineWidth = 6 * a + 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();

      ctx.globalAlpha = a * 0.92;
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 2.6 * a + 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();

      // 内环虚线符文刻度
      if (r > 18) {
        ctx.globalAlpha = a * 0.72;
        ctx.lineWidth = 1.6 * a + 0.8;
        ctx.setLineDash([7, 7]);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.72, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        // 四向符文星芒端点
        for (let q = 0; q < 4; q++) {
          const qa = (q * Math.PI) / 2;
          const qx = Math.cos(qa) * r;
          const qy = Math.sin(qa) * r;
          ctx.fillStyle = '#fef3c7';
          ctx.beginPath();
          ctx.arc(qx, qy, 2.5 * a + 1, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
      continue;
    }

    if (isRingLike) {
      const t = 1 - a;
      const r = lerp(pt.r0 ?? 6, pt.r1 ?? 60, t);
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 3 * a + 1;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.stroke();
      continue;
    }

    if (kind === 'shard') {
      const sz = (pt.r ?? 3.4) * (0.55 + a * 0.75);
      const ang = pt.ang ?? Math.atan2(pt.vy ?? 0, pt.vx ?? 1);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ang);
      ctx.globalAlpha = a * 0.94;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.moveTo(sz * 2.1, 0);
      ctx.lineTo(0, sz * 0.65);
      ctx.lineTo(-sz * 1.4, 0);
      ctx.lineTo(0, -sz * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = a * 0.75;
      ctx.fillStyle = '#fffbeb';
      ctx.beginPath();
      ctx.moveTo(sz * 1.15, 0);
      ctx.lineTo(0, sz * 0.28);
      ctx.lineTo(-sz * 0.65, 0);
      ctx.lineTo(0, -sz * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      continue;
    }

    const rDot = (pt.r ?? 2) * a;
    if (rDot > 2.4 && a > 0.35) {
      drawGlow(ctx, sx, sy, rDot * 3.1, pt.color, a * 0.24);
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(sx, sy, rDot, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ---- 动态昼夜光照系统 ----
  renderDayNightLighting(ctx, state, cx, cy);

  // ---- 全局天气覆盖层与雨/雪/大雾粒子 ----
  if (state.weather && state.weather.kind !== 'clear') {
    renderWeatherOverlayAndParticles(ctx, state, cx, cy);
  }

  // ---- 飘字（在光照之上，始终清晰可读） ----
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let lastFloaterFont = '';
  for (let i = 0; i < floaters.length; i++) {
    const f = floaters[i];
    const sx = f.x - cx;
    const sy = f.y - cy;
    ctx.globalAlpha = clamp(f.life, 0, 1);
    const pxSize = Math.round(f.size * f.scale);
    const fontStr = `900 ${pxSize}px system-ui,sans-serif`;
    if (fontStr !== lastFloaterFont) {
      ctx.font = fontStr;
      lastFloaterFont = fontStr;
    }
    ctx.fillStyle = '#000';
    ctx.fillText(f.text, sx + 2, sy + 2);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, sx, sy);
  }
  ctx.globalAlpha = 1;

  // ---- 全屏暗角 Vignette（256x144 紧凑精灵平铺，降低全屏带宽） ----
  const prevSmoothVig = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(ensureVignetteCanvas(), 0, 0, vw, vh);

  // 低血警告（缓存红晕精灵，仅改变 alpha 绘制）
  if (hasLowHp) {
    const a = (0.16 + Math.sin(gameTime * 6) * 0.07) * (1 - p.hp / p.maxHp);
    ctx.globalAlpha = clamp(a, 0, 0.45);
    ctx.drawImage(ensureLowHpVignetteCanvas(), 0, 0, vw, vh);
    ctx.globalAlpha = 1;
  }

  // 高连击屏边脉冲暗角（25+ 炽紫红脉冲，50+ 黄金狂澜辉光脉冲）
  if (hasComboVignette) {
    const isGold = comboCount >= 50;
    const baseBreath = isGold
      ? 0.16 + Math.sin(gameTime * 6.5) * 0.08
      : comboCount >= 25
      ? 0.07 + Math.sin(gameTime * 5) * 0.035
      : 0;
    const pulseBoost = comboVignettePulse * (isGold ? 0.38 : 0.32);
    const comboAlpha = clamp(baseBreath + pulseBoost, 0, isGold ? 0.56 : 0.44);
    if (comboAlpha > 0.01) {
      const prevComp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = comboAlpha;
      ctx.drawImage(ensureComboVignetteCanvas(isGold ? 'gold' : 'hot'), 0, 0, vw, vh);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = prevComp;
    }
  }
  ctx.imageSmoothingEnabled = prevSmoothVig;
}

function renderDayNightLighting(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  cx: number,
  cy: number
): void {
  const { vw, vh, timeOfDay, player, world, projectiles, boss, gameTime } = state;

  // 黄昏暖色滤镜（即便黑暗度较低也能体现日落氛围）
  if (timeOfDay.phase === '黄昏' && timeOfDay.tintColor !== 'rgba(0, 0, 0, 0)') {
    ctx.fillStyle = timeOfDay.tintColor;
    ctx.fillRect(0, 0, vw, vh);
  }

  if (timeOfDay.darkness <= 0.02) return;

  const light = ensureLightCanvas(vw, vh);
  if (!light || !lightCanvas) return;
  const { ctx: lctx, lw, lh } = light;
  const cutout = getLightCutoutSprite();

  lctx.save();
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.globalAlpha = 1;
  lctx.clearRect(0, 0, lw, lh);
  lctx.fillStyle = `rgba(6, 11, 28, ${timeOfDay.darkness.toFixed(3)})`;
  lctx.fillRect(0, 0, lw, lh);

  // 1/4 分辨率 + 预烘焙径向遮罩贴图挖出光源（像素开销降低 16 倍）
  lctx.scale(LIGHT_SCALE, LIGHT_SCALE);
  lctx.globalCompositeOperation = 'destination-out';

  const punchLight = (sx: number, sy: number, rOuter: number, strength = 1) => {
    if (sx < -rOuter || sy < -rOuter || sx > vw + rOuter || sy > vh + rOuter) return;
    lctx.globalAlpha = strength;
    lctx.drawImage(cutout, sx - rOuter, sy - rOuter, rOuter * 2, rOuter * 2);
  };

  // 1. 玩家自身照明光圈
  const px = player.x - cx;
  const py = player.y - cy;
  const pFlicker = Math.sin(gameTime * 5.2) * 6;
  punchLight(px, py, 210 + pFlicker, 0.96);

  // 2. 村庄火把光圈
  for (const t of world.torches) {
    const flick = Math.sin(gameTime * 8 + t.ph) * 8;
    punchLight(t.x - cx, t.y - cy - 6, 175 + flick, 0.95);
  }

  // 3. 主城 NPC 与路牌光源
  punchLight(world.merchant.x - cx, world.merchant.y - cy, 105, 0.78);
  punchLight(world.elder.x - cx, world.elder.y - cy, 105, 0.78);
  punchLight(world.awakening.x - cx, world.awakening.y - cy, 130, 0.88);
  punchLight(world.blacksmith.x - cx, world.blacksmith.y - cy, 125, 0.85);
  punchLight(world.armorer.x - cx, world.armorer.y - cy, 105, 0.78);
  punchLight(world.upgrader.x - cx, world.upgrader.y - cy, 118, 0.84);
  punchLight(world.altar.x - cx, world.altar.y - cy, 145, 0.88);
  punchLight(world.portal.x - cx, world.portal.y - cy, 175, 0.94);
  for (const sp of world.signposts) {
    punchLight(sp.x - cx, sp.y - cy, 75, 0.65);
  }

  // 4. 未开启宝箱微光
  for (const c of world.chests) {
    if (c.opened) continue;
    punchLight(c.x - cx, c.y - cy, 85, 0.75);
  }

  // 5. 投射物（火球术、奥术飞弹等）动态光照
  for (const pr of projectiles) {
    punchLight(pr.x - cx, pr.y - cy, pr.explosive ? 130 : 88, 0.92);
  }

  // 6. BOSS 强力光圈
  if (boss) {
    const bf = Math.sin(gameTime * 6) * 10;
    punchLight(boss.x - cx, boss.y - cy, 230 + bf, 0.95);
  }

  lctx.restore();

  // 将 1/4 分辨率阴影层平滑放大合入主画布
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lightCanvas, 0, 0, vw, vh);
  ctx.imageSmoothingEnabled = prevSmooth;

  // 夜间使用预烘焙光晕精灵叠加强光氛围
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glowAlpha = clamp(timeOfDay.darkness * 0.28, 0, 0.22);

  drawGlow(ctx, px, py, 145, '#ffc878', glowAlpha * 0.7);

  for (const t of world.torches) {
    const tx = t.x - cx;
    const ty = t.y - cy - 10;
    if (tx < -150 || ty < -150 || tx > vw + 150 || ty > vh + 150) continue;
    drawGlow(ctx, tx, ty, 130, '#fb923c', glowAlpha * 1.1);
  }

  for (const pr of projectiles) {
    const prx = pr.x - cx;
    const pry = pr.y - cy;
    if (prx < -110 || pry < -110 || prx > vw + 110 || pry > vh + 110) continue;
    const rad = pr.explosive ? 95 : 58;
    drawGlow(ctx, prx, pry, rad, pr.team === 'player' ? '#fb923c' : '#c084fc', 0.24);
  }

  if (boss) {
    drawGlow(ctx, boss.x - cx, boss.y - cy, 190, '#f43f5e', glowAlpha * 1.15);
  }

  ctx.restore();
}

function drawTorch(
  ctx: CanvasRenderingContext2D,
  t: TorchEntity,
  sx: number,
  sy: number,
  gameTime: number
): void {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillStyle = 'rgba(0,0,0,.38)';
  ctx.beginPath();
  ctx.ellipse(0, 10, 9, 4, 0, 0, TAU);
  ctx.fill();

  // 木桩火盆
  ctx.fillStyle = '#4a3219';
  ctx.fillRect(-3, -12, 6, 22);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-6, -15, 12, 5);

  // 跳动火焰
  const flick = Math.sin(gameTime * 11 + t.ph) * 1.6;
  drawGlow(ctx, 0, -18, 26, '#fb923c', 0.45);

  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(-5, -14);
  ctx.quadraticCurveTo(0, -28 + flick, 5, -14);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.moveTo(-2.5, -14);
  ctx.quadraticCurveTo(0, -23 + flick * 0.7, 2.5, -14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawChest(
  ctx: CanvasRenderingContext2D,
  c: ChestEntity,
  sx: number,
  sy: number,
  gameTime: number
): void {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath();
  ctx.ellipse(0, 11, 16, 6, 0, 0, TAU);
  ctx.fill();
  if (!c.opened) {
    const bob = Math.sin(gameTime * 2.4 + c.ph) * 2;
    ctx.translate(0, bob - 4);
    drawGlow(ctx, 0, -4, 26, '#ffdc78', 0.45);
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(-13, -6, 26, 16);
    ctx.fillStyle = '#a9702f';
    ctx.fillRect(-13, -13, 26, 8);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-3, -9, 6, 8);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(-2, -8, 2, 3);
  } else {
    ctx.fillStyle = '#5a4020';
    ctx.fillRect(-13, -2, 26, 12);
    ctx.fillStyle = '#3a2a15';
    ctx.fillRect(-13, -2, 26, 3);
  }
  ctx.restore();
}

function drawWaterRipple(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  rx: number,
  phase: number,
  worldId: WorldId
): void {
  const pulse = (Math.sin(phase * 3.4) + 1) * 0.5;
  ctx.save();
  ctx.strokeStyle =
    worldId === 'world2'
      ? `rgba(232, 121, 249, ${0.35 + pulse * 0.25})`
      : `rgba(186, 230, 253, ${0.42 + pulse * 0.28})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx + pulse * 4, rx * 0.42 + pulse * 1.6, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawBossArenaSigil(
  ctx: CanvasRenderingContext2D,
  arena: FixedBossArena,
  sx: number,
  sy: number,
  gameTime: number,
  cooldown: number,
  isActive: boolean
): void {
  const pulse = Math.sin(gameTime * 2.2) * 0.5 + 0.5;
  ctx.save();
  ctx.translate(sx, sy);

  const rOuter = 138;
  drawGlow(ctx, 0, 0, rOuter, arena.color, isActive ? 0.22 : cooldown > 0 ? 0.08 : 0.16);

  ctx.strokeStyle = cooldown > 0 ? 'rgba(148,163,184,0.3)' : arena.color;
  ctx.globalAlpha = cooldown > 0 ? 0.35 : 0.48 + pulse * 0.22;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, 112, 0, TAU);
  ctx.stroke();

  ctx.save();
  ctx.rotate(gameTime * 0.35);
  ctx.setLineDash([12, 10]);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, 86, 0, TAU);
  ctx.stroke();
  ctx.restore();

  ctx.globalAlpha = 0.9;
  ctx.font = '700 11px system-ui,sans-serif';
  ctx.textAlign = 'center';
  const statusText = isActive
    ? `⚔ ${arena.name} · 激战中`
    : cooldown > 0
    ? `⏳ ${arena.name} (${Math.ceil(cooldown)}s 后苏醒)`
    : `👑 领主祭坛 · ${arena.name}`;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillText(statusText, 1, -118);
  ctx.fillStyle = cooldown > 0 ? '#cbd5e1' : '#fde68a';
  ctx.fillText(statusText, 0, -119);
  ctx.restore();
}

function drawCompactGateBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  textColor: string,
  borderColor: string
): void {
  ctx.font = '700 9px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  const pw = tw + 10;
  const ph = 14;
  ctx.fillStyle = 'rgba(6,10,16,0.72)';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-pw / 2, y - ph / 2, pw, ph, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.fillText(text, 0, y + 0.5);
}

function drawPortal(
  ctx: CanvasRenderingContext2D,
  portal: PortalEntity,
  sx: number,
  sy: number,
  gameTime: number,
  dungeonFloor?: number,
  dungeonCleared = false
): void {
  const isToW2 = portal.targetWorld === 'world2';
  const isToCity = portal.targetWorld === 'grand_city';
  const isDungeonNext = portal.targetWorld === 'dungeon';
  const isLockedDungeon = isDungeonNext && !dungeonCleared;
  const primary = isLockedDungeon
    ? '#64748b'
    : isDungeonNext
    ? '#22d3ee'
    : isToW2
    ? '#fb7185'
    : isToCity
    ? '#fbbf24'
    : '#38bdf8';
  const secondary = isLockedDungeon
    ? '#f43f5e'
    : isDungeonNext
    ? '#fde047'
    : isToW2
    ? '#f59e0b'
    : isToCity
    ? '#fef08a'
    : '#a5f3fc';
  const pulse = Math.sin(gameTime * 3.1 + portal.ph) * 0.5 + 0.5;

  ctx.save();
  ctx.translate(sx, sy);

  drawGlow(ctx, 0, 2, isLockedDungeon ? 24 : 30, primary, isLockedDungeon ? 0.16 : 0.28);

  ctx.strokeStyle = primary;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(0, 5, 19, 8, 0, 0, TAU);
  ctx.stroke();

  ctx.save();
  ctx.translate(0, -6);
  ctx.rotate(isLockedDungeon ? gameTime * 0.35 : gameTime * 1.4);
  ctx.strokeStyle = secondary;
  ctx.lineWidth = 1.8;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, 12.5 + (isLockedDungeon ? 0.4 : pulse * 1.4), 0, TAU);
  ctx.stroke();
  ctx.restore();

  ctx.globalAlpha = isLockedDungeon ? 0.45 : 0.85;
  ctx.fillStyle = primary;
  ctx.beginPath();
  ctx.arc(0, -6, 9.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = secondary;
  ctx.beginPath();
  ctx.arc(0, -6, isLockedDungeon ? 4.5 : 6, 0, TAU);
  ctx.fill();
  if (!isLockedDungeon) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -6, 2.8, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const nextFloor = (dungeonFloor ?? 1) + 1;
  const shortLabel = isDungeonNext
    ? dungeonCleared
      ? `前往 ${nextFloor}F`
      : `封印·击败首领`
    : isToW2
    ? '烈焰深渊'
    : isToCity
    ? '幻光王城'
    : '晨曦大陆';
  drawCompactGateBadge(ctx, shortLabel, -25, secondary, primary);
  ctx.restore();
}

function drawDungeonGate(
  ctx: CanvasRenderingContext2D,
  gate: DungeonGateEntity,
  sx: number,
  sy: number,
  gameTime: number
): void {
  const pulse = Math.sin(gameTime * 2.6 + gate.ph) * 0.5 + 0.5;
  ctx.save();
  ctx.translate(sx, sy);

  drawGlow(ctx, 0, -2, 34, '#a855f7', 0.26 + pulse * 0.12);

  // Compact stone arch
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.4;
  ctx.fillRect(-18, -17, 7, 27);
  ctx.strokeRect(-18, -17, 7, 27);
  ctx.fillRect(11, -17, 7, 27);
  ctx.strokeRect(11, -17, 7, 27);
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.roundRect(-20, -22, 40, 6.5, 2.5);
  ctx.fill();
  ctx.stroke();

  // Swirling violet portal inside arch
  ctx.fillStyle = '#4c1d95';
  ctx.fillRect(-11, -15, 22, 24);
  ctx.fillStyle = '#9333ea';
  ctx.fillRect(-11, -15, 22, 12);

  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 1.4;
  ctx.save();
  ctx.translate(0, -3);
  ctx.rotate(gameTime * 1.2);
  ctx.setLineDash([3.5, 3.5]);
  ctx.beginPath();
  ctx.arc(0, 0, 7.5 + pulse * 1.2, 0, TAU);
  ctx.stroke();
  ctx.restore();

  const compactLabel = gate.label.includes('撤离') ? '撤离门' : '试炼塔';
  drawCompactGateBadge(ctx, compactLabel, -30, '#f5d0fe', 'rgba(192,132,252,0.75)');
  ctx.restore();
}

function drawSocialBoard(
  ctx: CanvasRenderingContext2D,
  board: SocialBoardEntity,
  sx: number,
  sy: number,
  gameTime: number
): void {
  const pulse = Math.sin(gameTime * 3 + board.ph) * 0.5 + 0.5;
  ctx.save();
  ctx.translate(sx, sy);

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 11, 14, 4.5, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#78350f';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.3;
  ctx.fillRect(-12, -16, 3.5, 26);
  ctx.strokeRect(-12, -16, 3.5, 26);
  ctx.fillRect(8.5, -16, 3.5, 26);
  ctx.strokeRect(8.5, -16, 3.5, 26);

  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.roundRect(-14, -18, 28, 17, 2);
  ctx.fill();
  ctx.stroke();

  // Parchment notices
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(-10, -15, 8.5, 10.5);
  ctx.fillStyle = '#e0f2fe';
  ctx.fillRect(1, -14, 9.5, 9.5);
  ctx.fillStyle = `rgba(251,191,36,${0.6 + pulse * 0.4})`;
  ctx.beginPath();
  ctx.arc(-6, -14, 1.5, 0, TAU);
  ctx.arc(5.5, -13, 1.5, 0, TAU);
  ctx.fill();

  drawCompactGateBadge(ctx, '公告栏', -25, '#fde68a', 'rgba(251,191,36,0.65)');
  ctx.restore();
}

interface ChibiNpcVisualOpts {
  robeDark: string;
  robeLight: string;
  trimColor: string;
  cloakColor: string;
  hairColor: string;
  eyeColor: string;
  tabardColor?: string;
  skinLight?: string;
  skinDark?: string;
  longHair?: boolean;
  hatStyle: 'merchant_cap' | 'sage_beard' | 'halo_crown' | 'forge_goggles' | 'knight_helm' | 'witch_hat';
  bob: number;
  gameTime: number;
}

function drawChibiEyes(
  ctx: CanvasRenderingContext2D,
  ex: number,
  ey: number,
  irisColor: string,
  determined = false
): void {
  const eyePositions = [-3.4, 3.4];
  for (let i = 0; i < 2; i++) {
    const cx = ex + eyePositions[i];
    const cy = ey;
    // Sclera
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 2.05, 2.55, 0, 0, TAU);
    ctx.fill();
    // Colored iris
    ctx.fillStyle = irisColor;
    ctx.beginPath();
    ctx.ellipse(cx + ex * 0.08, cy + 0.25, 1.5, 2.05, 0, 0, TAU);
    ctx.fill();
    // Upper iris shade for anime depth
    ctx.fillStyle = 'rgba(15,23,42,0.34)';
    ctx.beginPath();
    ctx.ellipse(cx + ex * 0.08, cy - 0.85, 1.45, 0.85, 0, 0, TAU);
    ctx.fill();
    // Pupil
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx + ex * 0.1, cy + 0.35, 0.82, 0, TAU);
    ctx.fill();
    // Twin specular catchlights
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 0.62, cy - 0.88, 0.8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx + 0.55, cy + 0.95, 0.42, 0, TAU);
    ctx.fill();
    // Curved dark upper lash
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.45;
    ctx.beginPath();
    ctx.arc(cx, cy + 0.2, 2.15, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    // Expressive brow
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    if (determined) {
      const slope = i === 0 ? 0.65 : -0.65;
      ctx.moveTo(cx - 2.1, cy - 3.0 - slope);
      ctx.lineTo(cx + 2.1, cy - 3.0 + slope);
    } else {
      ctx.moveTo(cx - 1.9, cy - 3.1);
      ctx.quadraticCurveTo(cx, cy - 3.65, cx + 1.9, cy - 3.1);
    }
    ctx.stroke();
  }
}

function drawLongBackHair(ctx: CanvasRenderingContext2D, hairColor: string): void {
  const ink = '#0f172a';
  ctx.fillStyle = hairColor;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-8.4, -13.2);
  ctx.quadraticCurveTo(-11.8, -2.5, -8.8, 3.8);
  ctx.quadraticCurveTo(-4.5, 5.2, 0, 4.4);
  ctx.quadraticCurveTo(4.5, 5.2, 8.8, 3.8);
  ctx.quadraticCurveTo(11.8, -2.5, 8.4, -13.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Subtle curved strand shadow lines for lush volume
  ctx.strokeStyle = 'rgba(15,23,42,0.18)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-6.2, -5.0);
  ctx.quadraticCurveTo(-7.2, -0.5, -6.0, 3.2);
  ctx.moveTo(6.2, -5.0);
  ctx.quadraticCurveTo(7.2, -0.5, 6.0, 3.2);
  ctx.stroke();
}

function drawChibiHeadWithHair(
  ctx: CanvasRenderingContext2D,
  opts: {
    hairColor: string;
    eyeColor: string;
    ex: number;
    ey: number;
    determined?: boolean;
    skipBangs?: boolean;
    skipMouth?: boolean;
    skinLight?: string;
    skinDark?: string;
  }
): void {
  const ink = '#0f172a';
  const skinL = opts.skinLight ?? '#ffebd6';
  const skinD = opts.skinDark ?? '#f1b98c';

  // Cute Chibi Ears
  for (const s of [-1, 1]) {
    ctx.fillStyle = skinD;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(s * 8.4, -10.8, 1.8, 2.3, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Sculpted Chibi Head (cel-shaded oval without per-frame gradient alloc)
  ctx.fillStyle = skinL;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.45;
  ctx.beginPath();
  ctx.moveTo(-8.4, -13.2);
  ctx.bezierCurveTo(-8.6, -19.8, 8.6, -19.8, 8.4, -13.2);
  ctx.bezierCurveTo(8.3, -6.2, 4.4, -4.0, 0, -4.0);
  ctx.bezierCurveTo(-4.4, -4.0, -8.3, -6.2, -8.4, -13.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Soft Warm Cheek Blush
  ctx.fillStyle = 'rgba(244,114,182,0.18)';
  ctx.beginPath();
  ctx.ellipse(-4.8, -9.1, 1.4, 0.72, 0, 0, TAU);
  ctx.ellipse(4.8, -9.1, 1.4, 0.72, 0, 0, TAU);
  ctx.fill();

  // Hair Crown Back Volume
  ctx.fillStyle = opts.hairColor;
  ctx.beginPath();
  ctx.arc(0, -13.6, 8.75, Math.PI * 0.92, Math.PI * 2.08);
  ctx.fill();

  // Expressive Eyes
  drawChibiEyes(ctx, opts.ex, opts.ey, opts.eyeColor, Boolean(opts.determined));

  // Delicate Chibi Smile
  if (!opts.skipMouth) {
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.arc(opts.ex * 0.65, opts.ey + 3.2, 0.95, 0.25, Math.PI - 0.25);
    ctx.stroke();
  }

  // Framing Side-locks & Layered Bangs
  if (!opts.skipBangs) {
    ctx.fillStyle = opts.hairColor;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(-8.3, -13.8);
    ctx.quadraticCurveTo(-8.7, -8.5, -6.7, -6.2); // left side-lock hugging cheek
    ctx.quadraticCurveTo(-6.2, -10.5, -5.2, -12.8);
    ctx.lineTo(-3.4, -11.4);
    ctx.lineTo(-1.3, -14.1);
    ctx.lineTo(1.2, -11.3);
    ctx.lineTo(3.4, -13.9);
    ctx.lineTo(5.2, -12.6);
    ctx.quadraticCurveTo(6.2, -10.5, 6.7, -6.2); // right side-lock hugging cheek
    ctx.quadraticCurveTo(8.7, -8.5, 8.3, -13.8);
    ctx.bezierCurveTo(7.4, -20.2, -7.4, -20.2, -8.3, -13.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Subtle Hair Highlight Gloss
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(0, -14.2, 5.2, Math.PI * 1.18, Math.PI * 1.82);
    ctx.stroke();
  }
}

function drawChibiNpcBase(ctx: CanvasRenderingContext2D, opts: ChibiNpcVisualOpts): void {
  const ink = '#0f172a';
  ctx.translate(0, opts.bob);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 1. Sleek Back Cape
  ctx.fillStyle = opts.cloakColor;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.moveTo(-7.2, -4.5);
  ctx.quadraticCurveTo(-11.2, 5.5, -7.8, 12.0);
  ctx.lineTo(7.8, 12.0);
  ctx.quadraticCurveTo(11.2, 5.5, 7.2, -4.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 1.5 Long Back Hair Behind Shoulders & Torso
  if (opts.longHair) {
    drawLongBackHair(ctx, opts.hairColor);
  }

  // 2. Compact Cuffed Boots
  for (const bx of [-3.6, 3.6]) {
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(bx - 2.3, 8.0, 4.6, 5.2, 2.0);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = opts.trimColor;
    ctx.fillRect(bx - 1.6, 8.4, 3.2, 1.3);
  }

  // 3. Tapered Heroic-Chibi Torso / Coat / Robe
  ctx.fillStyle = opts.robeLight;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-6.8, -5.0);
  ctx.lineTo(6.8, -5.0);
  ctx.quadraticCurveTo(7.0, 0.5, 6.0, 2.5); // defined waist
  ctx.lineTo(8.8, 9.2);
  ctx.quadraticCurveTo(0, 11.4, -8.8, 9.2);
  ctx.lineTo(-6.0, 2.5);
  ctx.quadraticCurveTo(-7.0, 0.5, -6.8, -5.0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Front Tabard / Stole / Apron
  if (opts.tabardColor) {
    ctx.fillStyle = opts.tabardColor;
    ctx.beginPath();
    ctx.moveTo(-3.2, -4.2);
    ctx.lineTo(3.2, -4.2);
    ctx.lineTo(4.0, 9.5);
    ctx.quadraticCurveTo(0, 10.6, -4.0, 9.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.0;
    ctx.stroke();
  }

  // Collar Trim & Belt Buckle
  ctx.fillStyle = opts.trimColor;
  ctx.beginPath();
  ctx.moveTo(-4.8, -5.0);
  ctx.lineTo(0, -1.6);
  ctx.lineTo(4.8, -5.0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-6.2, 2.0, 12.4, 2.2);
  ctx.fillStyle = opts.trimColor;
  ctx.beginPath();
  ctx.roundRect(-2.0, 1.5, 4.0, 3.2, 0.9);
  ctx.fill();

  // Articulated Sleeves & Hands
  for (const s of [-1, 1]) {
    ctx.fillStyle = opts.robeLight;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(s * 7.6, -1.2, 2.6, 3.6, s * 0.35, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = opts.skinLight ?? '#ffebd6';
    ctx.beginPath();
    ctx.arc(s * 8.4, 2.0, 1.85, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // 4. Sculpted Chibi Head + Hair
  drawChibiHeadWithHair(ctx, {
    hairColor: opts.hairColor,
    eyeColor: opts.eyeColor,
    ex: 0,
    ey: -10.8,
    skipBangs: opts.hatStyle === 'knight_helm',
    skinLight: opts.skinLight,
    skinDark: opts.skinDark,
  });

  // 5. Bespoke NPC Headgear / Beard
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.3;
  if (opts.hatStyle === 'merchant_cap') {
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.moveTo(-9.5, -14.8);
    ctx.quadraticCurveTo(0, -25.8, 9.5, -14.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.roundRect(-10.2, -15.8, 20.4, 2.8, 1.4);
    ctx.fill();
    ctx.stroke();
    // Plume feather
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.ellipse(7.2, -20.2, 4.4, 1.9, -0.55, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // Gold monocle
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.arc(3.4, -10.8, 2.55, 0, TAU);
    ctx.stroke();
  } else if (opts.hatStyle === 'sage_beard') {
    // Layered Wise Sage Beard & Mustache
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(-4.8, -7.8);
    ctx.quadraticCurveTo(-5.8, -1.5, -2.2, 3.2);
    ctx.lineTo(0, 5.2);
    ctx.lineTo(2.2, 3.2);
    ctx.quadraticCurveTo(5.8, -1.5, 4.8, -7.8);
    ctx.quadraticCurveTo(0, -5.8, -4.8, -7.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Soft mustache curl
    ctx.beginPath();
    ctx.ellipse(-2.1, -7.3, 2.2, 1.0, -0.22, 0, TAU);
    ctx.ellipse(2.1, -7.3, 2.2, 1.0, 0.22, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // Aquamarine sage circlet + gem
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-7.8, -16.0, 15.6, 2.0);
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(0, -15.0, 1.7, 0, TAU);
    ctx.fill();
  } else if (opts.hatStyle === 'halo_crown') {
    const glowY = Math.sin(opts.gameTime * 3) * 1.1;
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.moveTo(-6.2, -16.0);
    ctx.lineTo(-3.6, -22.0);
    ctx.lineTo(0, -18.2);
    ctx.lineTo(3.6, -22.0);
    ctx.lineTo(6.2, -16.0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(254,240,138,0.88)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, -23.8 + glowY, 7.6, 2.1, 0, 0, TAU);
    ctx.stroke();
  } else if (opts.hatStyle === 'forge_goggles') {
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.roundRect(-8.4, -16.8, 16.8, 2.8, 1.2);
    ctx.fill();
    ctx.stroke();
    for (const gx of [-3.3, 3.3]) {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(gx, -16.4, 2.3, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.35;
      ctx.stroke();
    }
    // Rugged smith chin goatee
    ctx.fillStyle = opts.hairColor;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-2.5, -5.2);
    ctx.lineTo(0, -2.5);
    ctx.lineTo(2.5, -5.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (opts.hatStyle === 'knight_helm') {
    // Dark Steel Guard Sallet Helm + Cheek Guards + Cobalt Plume
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(0, -13.6, 9.0, Math.PI * 0.92, Math.PI * 2.08);
    ctx.lineTo(8.5, -8.8);
    ctx.lineTo(6.2, -9.8);
    ctx.lineTo(5.6, -13.2);
    ctx.lineTo(-5.6, -13.2);
    ctx.lineTo(-6.2, -9.8);
    ctx.lineTo(-8.5, -8.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-8.4, -14.2, 16.8, 2.0);
    // Swept cobalt crest plume
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(0, -22.2);
    ctx.quadraticCurveTo(-7.5, -27.5, -10.2, -20.5);
    ctx.quadraticCurveTo(-4, -20.0, 2, -21.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (opts.hatStyle === 'witch_hat') {
    ctx.fillStyle = '#4c1d95';
    ctx.beginPath();
    ctx.ellipse(0, -15.0, 11.8, 3.0, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#6b21a8';
    ctx.beginPath();
    ctx.moveTo(-7.8, -15.6);
    ctx.quadraticCurveTo(1.8, -29.5, 4.2, -28.0);
    ctx.quadraticCurveTo(6.2, -21, 7.8, -15.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f0abfc';
    ctx.fillRect(-7.2, -16.8, 14.4, 2.2);
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.roundRect(-1.8, -17.1, 3.6, 2.8, 0.7);
    ctx.fill();
  }
}

function drawMerchant(
  ctx: CanvasRenderingContext2D,
  merchant: NpcEntity,
  sx: number,
  sy: number,
  gameTime: number
): void {
  ctx.save();
  ctx.translate(sx, sy);
  const bob = Math.sin(gameTime * 1.8) * 1.4;
  ctx.fillStyle = 'rgba(0,0,0,.42)';
  ctx.beginPath();
  ctx.ellipse(0, 12.5, 13.5, 5.0, 0, 0, TAU);
  ctx.fill();

  drawGlow(ctx, 0, 0, 28, '#fbbf24', 0.25);

  // Treasure pack behind shoulder
  ctx.save();
  ctx.translate(0, bob);
  ctx.fillStyle = '#92400e';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(6.5, -5.5, 8.2, 12.2, 3.2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(10.6, -1.8, 2.3, 0, TAU);
  ctx.fill();
  ctx.restore();

  drawChibiNpcBase(ctx, {
    robeDark: '#5b21b6',
    robeLight: '#8b5cf6',
    trimColor: '#fbbf24',
    cloakColor: '#4c1d95',
    tabardColor: '#78350f',
    hairColor: '#92400e',
    eyeColor: '#d97706',
    hatStyle: 'merchant_cap',
    bob,
    gameTime,
  });

  // Glowing emerald potion bottle in left hand
  ctx.save();
  ctx.translate(-9.5, 0.5);
  ctx.fillStyle = '#22c55e';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, 1.5, 2.6, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#bbf7d0';
  ctx.fillRect(-1.0, -2.5, 2.0, 2.2);
  ctx.restore();

  const label = merchant.label || '流浪商人';
  ctx.font = '700 10px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillText(label, 1, -30);
  ctx.fillStyle = '#fde68a';
  ctx.fillText(label, 0, -31);
  ctx.restore();
}

function drawElder(
  ctx: CanvasRenderingContext2D,
  elder: NpcEntity,
  sx: number,
  sy: number,
  gameTime: number,
  activeQuest: ActiveQuestState | null,
  atLevelCap = false
): void {
  ctx.save();
  ctx.translate(sx, sy);
  const bob = Math.sin(gameTime * 1.6 + elder.ph) * 1.3;
  ctx.fillStyle = 'rgba(0,0,0,.42)';
  ctx.beginPath();
  ctx.ellipse(0, 12.5, 13.5, 5.0, 0, 0, TAU);
  ctx.fill();

  drawGlow(ctx, 0, 0, 28, atLevelCap ? '#fbbf24' : '#38bdf8', atLevelCap ? 0.32 : 0.24);

  drawChibiNpcBase(ctx, {
    robeDark: '#0f766e',
    robeLight: '#14b8a6',
    trimColor: '#fde68a',
    cloakColor: '#134e4a',
    tabardColor: '#f8fafc',
    hairColor: '#e2e8f0',
    eyeColor: '#0284c7',
    longHair: true,
    hatStyle: 'sage_beard',
    bob,
    gameTime,
  });

  // Oak sage staff in left hand
  ctx.save();
  ctx.fillStyle = '#78350f';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.2;
  ctx.fillRect(-12.2, -16, 2.8, 27);
  ctx.strokeRect(-12.2, -16, 2.8, 27);
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(-10.8, -17.5, 3.4, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e0f2fe';
  ctx.beginPath();
  ctx.arc(-11.6, -18.5, 1.15, 0, TAU);
  ctx.fill();
  ctx.restore();

  const questMark = activeQuest?.completed
    ? '?'
    : atLevelCap && !activeQuest
    ? '突破!'
    : !activeQuest
    ? '!'
    : null;
  if (questMark) {
    const bounce = Math.sin(gameTime * 4.5) * 2.5;
    ctx.font = '900 15px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(questMark, 1, -39 + bounce);
    ctx.fillStyle = activeQuest?.completed ? '#4ade80' : atLevelCap ? '#f472b6' : '#fbbf24';
    ctx.fillText(questMark, 0, -40 + bounce);
  }

  const label = elder.label || '村庄长老';
  ctx.font = '700 10px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillText(label, 1, -26);
  ctx.fillStyle = '#99f6e4';
  ctx.fillText(label, 0, -27);
  ctx.restore();
}

function drawDrop(
  ctx: CanvasRenderingContext2D,
  d: DropEntity,
  sx: number,
  sy: number,
  gameTime: number
): void {
  const bob = Math.sin(gameTime * 4 + d.bob) * 3;
  const alpha = d.life < 4 ? Math.sin(d.life * 12) * 0.5 + 0.5 : 1;
  ctx.globalAlpha = alpha;
  ctx.save();
  ctx.translate(sx, sy + bob);
  if (d.kind === 'gold') {
    drawGlow(ctx, 0, 0, 13, '#fbbf24', 0.45);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(-1.5, -1.5, 2.6, 0, TAU);
    ctx.fill();
  } else if (d.kind === 'potion') {
    drawGlow(ctx, 0, 0, 14, '#22c55e', 0.42);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(-4, -4, 8, 10);
    ctx.fillStyle = '#86efac';
    ctx.fillRect(-2, -9, 4, 6);
  } else if (d.kind === 'soulstone') {
    drawGlow(ctx, 0, 0, 18, '#38bdf8', 0.5);
    ctx.fillStyle = '#818cf8';
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, -2);
    ctx.lineTo(5, 9);
    ctx.lineTo(-5, 9);
    ctx.lineTo(-8, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#bae6fd';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4, -1);
    ctx.lineTo(0, 5);
    ctx.lineTo(-4, -1);
    ctx.closePath();
    ctx.fill();
  } else if (d.kind === 'material') {
    const matDef = d.materialId ? MATERIAL_MAP[d.materialId] : undefined;
    const matColor = matDef ? RARITY_META[matDef.rarity].color : '#38bdf8';
    drawGlow(ctx, 0, 0, 14, matColor, 0.44);
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(0, 1, 7.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = matColor;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, -1);
    ctx.lineTo(4, 6);
    ctx.lineTo(-4, 6);
    ctx.lineTo(-6, -1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(-1.5, -2, 2, 0, TAU);
    ctx.fill();
  } else if (d.kind === 'skillbook') {
    const bookCol = d.skillBook ? RARITY_META[d.skillBook.rarity].color : '#38bdf8';
    drawGlow(ctx, 0, 0, 16, bookCol, 0.48);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-8, -9, 16, 18);
    ctx.fillStyle = bookCol;
    ctx.fillRect(-6, -7, 12, 14);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(-4, -3, 8, 2);
    ctx.fillRect(-1, -6, 2, 8);
  } else {
    const rarityColor = d.gearItem ? RARITY_META[d.gearItem.rarity].color : '#c084fc';
    drawGlow(ctx, 0, 0, 16, rarityColor, 0.48);
    ctx.fillStyle = rarityColor;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(9, 0);
    ctx.lineTo(0, 10);
    ctx.lineTo(-9, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4, 0);
    ctx.lineTo(0, 5);
    ctx.lineTo(-4, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawSignpost(
  ctx: CanvasRenderingContext2D,
  sp: SignpostEntity,
  sx: number,
  sy: number
): void {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 10, 4, 0, 0, TAU);
  ctx.fill();

  // 木柱
  ctx.fillStyle = '#5c3a21';
  ctx.fillRect(-2.5, -16, 5, 28);
  ctx.fillStyle = '#7c4d2b';
  ctx.fillRect(-2.5, -16, 2, 28);

  // 指向木牌
  const dirX = Math.cos(sp.angle) >= 0 ? 1 : -1;
  ctx.fillStyle = '#9a6332';
  ctx.beginPath();
  ctx.moveTo(-13 * dirX, -15);
  ctx.lineTo(10 * dirX, -15);
  ctx.lineTo(16 * dirX, -10);
  ctx.lineTo(10 * dirX, -5);
  ctx.lineTo(-13 * dirX, -5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 方向刻痕
  ctx.fillStyle = '#fde68a';
  ctx.fillRect(-7, -11, 14, 2);

  // 头顶路牌标示（精简紧凑）
  ctx.font = '700 9px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillText(sp.title, 1, -19);
  ctx.fillStyle = '#fde68a';
  ctx.fillText(sp.title, 0, -20);
  ctx.restore();
}

function drawAwakeningNpc(
  ctx: CanvasRenderingContext2D,
  npc: NpcEntity,
  sx: number,
  sy: number,
  gameTime: number,
  highlight: boolean
): void {
  ctx.save();
  ctx.translate(sx, sy);
  const bob = Math.sin(gameTime * 2.2 + npc.ph) * 1.4;
  ctx.fillStyle = 'rgba(0,0,0,.44)';
  ctx.beginPath();
  ctx.ellipse(0, 12.5, 13.5, 5.0, 0, 0, TAU);
  ctx.fill();

  drawGlow(ctx, 0, 0, highlight ? 36 : 28, highlight ? '#facc15' : '#38bdf8', highlight ? 0.34 : 0.24);

  drawChibiNpcBase(ctx, {
    robeDark: '#0369a1',
    robeLight: '#38bdf8',
    trimColor: '#fde047',
    cloakColor: '#0c4a6e',
    tabardColor: '#f8fafc',
    hairColor: '#bae6fd',
    eyeColor: '#0284c7',
    longHair: true,
    hatStyle: 'halo_crown',
    bob,
    gameTime,
  });

  // Levitating starlight orb in right hand
  ctx.save();
  ctx.translate(10.5, -2 + Math.sin(gameTime * 3.8) * 1.8);
  ctx.fillStyle = '#fde047';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.arc(0, 0, 2.7, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-0.8, -0.8, 0.95, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (highlight) {
    const bounce = Math.sin(gameTime * 5) * 3;
    ctx.font = '900 13px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText('觉醒!', 1, -39 + bounce);
    ctx.fillStyle = '#fde047';
    ctx.fillText('觉醒!', 0, -40 + bounce);
  }

  const label = npc.label || '觉醒导师';
  ctx.font = '700 10px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillText(label, 1, -28);
  ctx.fillStyle = '#bae6fd';
  ctx.fillText(label, 0, -29);
  ctx.restore();
}

function drawBlacksmith(
  ctx: CanvasRenderingContext2D,
  npc: NpcEntity,
  sx: number,
  sy: number,
  gameTime: number
): void {
  ctx.save();
  ctx.translate(sx, sy);
  const bob = Math.sin(gameTime * 2.0 + npc.ph) * 1.3;
  ctx.fillStyle = 'rgba(0,0,0,.44)';
  ctx.beginPath();
  ctx.ellipse(0, 12.5, 13.5, 5.0, 0, 0, TAU);
  ctx.fill();

  drawGlow(ctx, 0, 0, 30, '#f97316', 0.28);

  drawChibiNpcBase(ctx, {
    robeDark: '#9a3412',
    robeLight: '#ea580c',
    trimColor: '#fdba74',
    cloakColor: '#431407',
    tabardColor: '#57534e',
    hairColor: '#5c2d16',
    eyeColor: '#c2410c',
    skinLight: '#f6cca6',
    skinDark: '#dc9f72',
    hatStyle: 'forge_goggles',
    bob,
    gameTime,
  });

  // Heavy iron rune forge hammer
  ctx.save();
  ctx.translate(10.5, -2);
  ctx.rotate(Math.sin(gameTime * 3) * 0.12);
  ctx.fillStyle = '#78350f';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.2;
  ctx.fillRect(-1.4, -7, 2.8, 16);
  ctx.strokeRect(-1.4, -7, 2.8, 16);
  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.roundRect(-4.6, -12, 9.2, 6.0, 1.4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fb923c';
  ctx.fillRect(-3.0, -9.8, 6.0, 1.5);
  ctx.restore();

  const label = npc.label || '锻造铁匠';
  ctx.font = '700 10px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillText(label, 1, -28);
  ctx.fillStyle = '#fdba74';
  ctx.fillText(label, 0, -29);
  ctx.restore();
}

function drawArmorer(
  ctx: CanvasRenderingContext2D,
  npc: NpcEntity,
  sx: number,
  sy: number,
  gameTime: number
): void {
  ctx.save();
  ctx.translate(sx, sy);
  const bob = Math.sin(gameTime * 1.9 + npc.ph) * 1.3;
  ctx.fillStyle = 'rgba(0,0,0,.42)';
  ctx.beginPath();
  ctx.ellipse(0, 12.5, 13.5, 5.0, 0, 0, TAU);
  ctx.fill();

  drawChibiNpcBase(ctx, {
    robeDark: '#1e3a8a',
    robeLight: '#3b82f6',
    trimColor: '#93c5fd',
    cloakColor: '#7f1d1d',
    tabardColor: '#cbd5e1',
    hairColor: '#475569',
    eyeColor: '#2563eb',
    hatStyle: 'knight_helm',
    bob,
    gameTime,
  });

  // Steel heater shield on left arm
  ctx.save();
  ctx.translate(-10.2, 1.5);
  ctx.fillStyle = '#cbd5e1';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(-4.2, -5.0);
  ctx.lineTo(4.2, -5.0);
  ctx.lineTo(4.2, 1.4);
  ctx.quadraticCurveTo(0, 6.8, 0, 6.8);
  ctx.quadraticCurveTo(-4.2, 2.8, -4.2, 1.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.arc(0, -1.0, 2.0, 0, TAU);
  ctx.fill();
  ctx.restore();

  const label = npc.label || '军械商人';
  ctx.font = '700 10px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillText(label, 1, -28);
  ctx.fillStyle = '#93c5fd';
  ctx.fillText(label, 0, -29);
  ctx.restore();
}

function drawUpgrader(
  ctx: CanvasRenderingContext2D,
  npc: NpcEntity,
  sx: number,
  sy: number,
  gameTime: number
): void {
  ctx.save();
  ctx.translate(sx, sy);
  const bob = Math.sin(gameTime * 2.1 + npc.ph) * 1.4;
  ctx.fillStyle = 'rgba(0,0,0,.42)';
  ctx.beginPath();
  ctx.ellipse(0, 12.5, 13.5, 5.0, 0, 0, TAU);
  ctx.fill();

  drawGlow(ctx, 0, 0, 30, '#d946ef', 0.28);

  drawChibiNpcBase(ctx, {
    robeDark: '#86198f',
    robeLight: '#d946ef',
    trimColor: '#fde047',
    cloakColor: '#4a044e',
    tabardColor: '#fae8ff',
    hairColor: '#f0abfc',
    eyeColor: '#c026d3',
    longHair: true,
    hatStyle: 'witch_hat',
    bob,
    gameTime,
  });

  // Orbiting starlight crystal
  ctx.save();
  ctx.translate(10.8, -4 + Math.sin(gameTime * 4) * 2.2);
  ctx.fillStyle = '#f0abfc';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(0, -4.6);
  ctx.lineTo(3.6, 0);
  ctx.lineTo(0, 4.6);
  ctx.lineTo(-3.6, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const label = npc.label || '星纹强化师';
  ctx.font = '700 10px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillText(label, 1, -31);
  ctx.fillStyle = '#f0abfc';
  ctx.fillText(label, 0, -32);
  ctx.restore();
}

function drawAltar(
  ctx: CanvasRenderingContext2D,
  altar: AltarEntity,
  sx: number,
  sy: number,
  gameTime: number
): void {
  const pulse = Math.sin(gameTime * 2.4 + altar.ph) * 0.5 + 0.5;
  ctx.save();
  ctx.translate(sx, sy);

  // 魔法阵外环
  drawGlow(ctx, 0, 0, 38, '#818cf8', 0.28 + pulse * 0.16);

  ctx.strokeStyle = `rgba(125, 211, 252, ${0.4 + pulse * 0.3})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(0, 4, 24, 11, 0, 0, TAU);
  ctx.stroke();

  // 石座
  ctx.fillStyle = '#334155';
  ctx.fillRect(-13, -3, 26, 11);
  ctx.fillStyle = '#475569';
  ctx.fillRect(-10, -10, 20, 8);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(-12, -12, 24, 3);

  // 悬浮灵魂核心
  const bob = Math.sin(gameTime * 3 + altar.ph) * 2.5;
  ctx.save();
  ctx.translate(0, -21 + bob);
  drawGlow(ctx, 0, 0, 17, '#38bdf8', 0.52);
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(7, 0);
  ctx.lineTo(0, 9);
  ctx.lineTo(-7, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e0f2fe';
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, TAU);
  ctx.fill();
  ctx.restore();

  const altarLabel = altar.label || '远古祭坛';
  ctx.font = '700 10px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillText(altarLabel, 1, -37);
  ctx.fillStyle = '#a5f3fc';
  ctx.fillText(altarLabel, 0, -38);
  ctx.restore();
}

function drawDeco(
  ctx: CanvasRenderingContext2D,
  dc: DecoEntity,
  cx: number,
  cy: number,
  gameTime: number,
  worldId: WorldId = 'world1'
): void {
  const sx = dc.x - cx;
  const sy = dc.y - cy;
  const variant = clamp(Math.round(dc.v * 5), 0, 5);
  const isW2 = worldId === 'world2';
  if (dc.kind === 'tree') {
    const sway = Math.sin(gameTime * 1.15 + dc.ph) * 2.2;
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 8, 16, 7, 0, 0, TAU);
    ctx.fill();
    // 树干
    ctx.fillStyle = isW2 ? '#291a24' : '#3b2a1a';
    ctx.fillRect(sx - 3, sy - 12, 6, 22);
    ctx.fillStyle = isW2 ? '#45283a' : '#54391f';
    ctx.fillRect(sx - 3, sy - 12, 2.5, 22);
    // 预烘焙树冠精灵（零 hsl() 与 arc() 每帧开销）
    const canopy = getDecoTreeCanopySprite(variant, worldId);
    ctx.drawImage(canopy, (sx + sway - 28) | 0, (sy - 50) | 0);
  } else {
    const rock = getDecoRockSprite(variant, worldId);
    ctx.drawImage(rock, (sx - 20) | 0, (sy - 20) | 0);
  }
}

function drawPlayerAfterimage(
  ctx: CanvasRenderingContext2D,
  af: AfterimageEntity,
  cx: number,
  cy: number
): void {
  const cls = CLASS_DEFS[af.classId];
  const sx = af.x - cx;
  const sy = af.y - cy;
  const a = clamp(af.life / af.maxLife, 0, 1);

  ctx.save();
  ctx.globalAlpha = a * 0.42;
  ctx.translate(sx, sy);
  drawGlow(ctx, 0, -2, af.r * 1.9, cls.accentColor, 0.7);

  ctx.fillStyle = cls.accentColor;
  ctx.beginPath();
  ctx.moveTo(-7.5, -5);
  ctx.lineTo(7.5, -5);
  ctx.lineTo(9.5, 11);
  ctx.lineTo(-9.5, 11);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -12, 8.2, 7.6, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

interface ChibiHeroLike {
  classId: PlayerEntity['classId'];
  x: number;
  y: number;
  r: number;
  facingAng: number;
  moving: boolean;
  walkPhase: number;
  swing: number;
  swingTotal: number;
  cloak: number;
  invuln: number;
  dashTime: number;
  hurtFlash: number;
  shieldHp?: number;
}

function drawHeroAvatar(
  ctx: CanvasRenderingContext2D,
  p: ChibiHeroLike,
  cx: number,
  cy: number,
  gameTime: number
): void {
  const cls = CLASS_DEFS[p.classId];
  const sx = p.x - cx;
  const sy = p.y - cy;
  const stride = p.moving ? Math.sin(p.walkPhase) * 3.8 : 0;
  const bob = p.moving ? Math.abs(Math.cos(p.walkPhase)) * -2.2 : Math.sin(gameTime * 2.2) * 1.05;
  const isHidden = Boolean(cls.isHidden);
  const arch = cls.archetype;

  ctx.fillStyle = 'rgba(0,0,0,.44)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + p.r * 0.9, p.r * 0.92, p.r * 0.38, 0, 0, TAU);
  ctx.fill();

  // Hidden Class / Shield Aura
  if (isHidden || (p.shieldHp && p.shieldHp > 0)) {
    const auraR = p.shieldHp && p.shieldHp > 0 ? 32 : 30;
    drawGlow(ctx, sx, sy - 4, auraR, p.shieldHp && p.shieldHp > 0 ? '#38bdf8' : cls.accentColor, 0.32);
  }

  // Attack swing sector arc
  if (p.swing > 0) {
    const a0 = p.facingAng - 1.18;
    const a1 = p.facingAng + 1.18;
    const reach =
      cls.weaponKind === 'spear'
        ? 98
        : arch === 'tank' || arch === 'assassin' || isHidden
        ? 86
        : 66;
    ctx.globalAlpha = 0.36;
    ctx.fillStyle = cls.accentColor;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.arc(sx, sy, reach, a0, a1);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (p.invuln > 0 && p.dashTime <= 0 && Math.floor(p.invuln * 16) % 2 === 0) {
    ctx.globalAlpha = 0.45;
  }

  ctx.save();
  ctx.translate(sx, sy + bob);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const ink = '#0f172a';
  const hairCol = cls.hairColor || '#78350f';
  const cw = Math.sin(gameTime * 4.2) * 2.0 + p.cloak * 4.2;

  // Flowing Silk Ribbons for Hidden classes or Healers
  if (isHidden || arch === 'healer') {
    const ribWave = Math.sin(gameTime * 3.5) * 3.5;
    ctx.strokeStyle = isHidden ? 'rgba(254,240,138,0.88)' : 'rgba(167,243,208,0.75)';
    ctx.lineWidth = isHidden ? 2.4 : 1.9;
    ctx.beginPath();
    ctx.moveTo(-7.5, -4);
    ctx.bezierCurveTo(-17, -13 + ribWave, -19, 6, -10.5, 12.5);
    ctx.moveTo(7.5, -4);
    ctx.bezierCurveTo(17, -13 - ribWave, 19, 6, 10.5, 12.5);
    ctx.stroke();
  }

  // Flowing Cape
  ctx.fillStyle = cls.cloakColor;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-7.6, -5.0);
  ctx.quadraticCurveTo(-12.5 + cw * 0.55, 6.5, -7.8 + cw * 0.35, 13.0);
  if (arch === 'assassin' || cls.weaponKind === 'scythe') {
    ctx.lineTo(-2.5, 10.5);
    ctx.lineTo(0, 14.2);
    ctx.lineTo(2.5, 10.5);
  }
  ctx.lineTo(7.8 - cw * 0.35, 13.0);
  ctx.quadraticCurveTo(12.5 - cw * 0.55, 6.5, 7.6, -5.0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (arch === 'healer' || arch === 'mage' || isHidden) {
    drawLongBackHair(ctx, hairCol);
  }

  if (cls.weaponKind === 'bow' || cls.weaponKind === 'crossbow') {
    ctx.save();
    ctx.translate(-7.8, -6);
    ctx.rotate(-0.42);
    ctx.fillStyle = '#78350f';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.roundRect(-2.3, -8, 4.6, 12.5, 1.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f87171';
    ctx.fillRect(-1.8, -10.5, 1.6, 3);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(0.3, -10.5, 1.6, 3);
    ctx.restore();
  }

  // Boots
  const leftBootY = 8.2 + stride * 0.55;
  const rightBootY = 8.2 - stride * 0.55;
  const bootFill = arch === 'tank' ? '#334155' : '#451a03';
  for (let bSide = 0; bSide < 2; bSide++) {
    const bx = bSide === 0 ? -3.8 : 3.8;
    const by = bSide === 0 ? leftBootY : rightBootY;
    ctx.fillStyle = bootFill;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.roundRect(bx - 2.5, by - 0.8, 5.0, 5.6, 2.0);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = cls.helmColor;
    ctx.fillRect(bx - 1.8, by - 0.3, 3.6, 1.4);
  }

  // Torso (cel-shaded)
  ctx.fillStyle = cls.bodyHighlight;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.45;
  ctx.beginPath();
  ctx.moveTo(-7.2, -5.2);
  ctx.lineTo(7.2, -5.2);
  ctx.quadraticCurveTo(7.4, 0.5, 6.2, 2.6);
  ctx.lineTo(9.0, 9.2);
  ctx.quadraticCurveTo(0, 11.4, -9.0, 9.2);
  ctx.lineTo(-6.2, 2.6);
  ctx.quadraticCurveTo(-7.4, 0.5, -7.2, -5.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(-4.8, -4.6);
  ctx.lineTo(0, 1.8);
  ctx.lineTo(4.8, -4.6);
  ctx.closePath();
  ctx.fill();

  if (arch === 'healer' || arch === 'mage' || isHidden) {
    ctx.fillStyle = arch === 'healer' ? '#fef3c7' : `${cls.accentColor}cc`;
    ctx.beginPath();
    ctx.moveTo(-2.5, -4.0);
    ctx.lineTo(2.5, -4.0);
    ctx.lineTo(3.3, 9.6);
    ctx.lineTo(-3.3, 9.6);
    ctx.closePath();
    ctx.fill();
  }

  // Belt
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-6.5, 2.1, 13.0, 2.3);
  ctx.fillStyle = cls.accentColor;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.95;
  ctx.beginPath();
  ctx.roundRect(-2.1, 1.6, 4.2, 3.3, 0.9);
  ctx.fill();
  ctx.stroke();

  // Shoulder Pauldrons
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 7.8, -2.5);
    ctx.rotate(side * -0.22);
    ctx.fillStyle = cls.helmColor;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(0, 0, arch === 'tank' ? 3.8 : 3.1, arch === 'tank' ? 3.2 : 2.7, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Off-hand Shield / Dagger / Floating Arcane Crystal / Healer Book
  const offSide = Math.cos(p.facingAng) >= 0 ? -1 : 1;
  if (arch === 'tank' || cls.weaponKind === 'shield_blade') {
    ctx.save();
    ctx.translate(offSide * 10.6, 1.5);
    ctx.fillStyle = cls.helmColor;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-4.4, -5.2);
    ctx.lineTo(4.4, -5.2);
    ctx.lineTo(4.4, 1.5);
    ctx.quadraticCurveTo(0, 7.0, 0, 7.0);
    ctx.quadraticCurveTo(-4.4, 3.0, -4.4, 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = cls.accentColor;
    ctx.fillRect(-0.9, -3.8, 1.8, 8.4);
    ctx.fillRect(-3.0, -1.4, 6.0, 1.8);
    ctx.restore();
  } else if (arch === 'mage' || arch === 'healer') {
    const orbY = -2 + Math.sin(gameTime * 4.5) * 2.0;
    ctx.save();
    ctx.translate(offSide * 11.2, orbY);
    ctx.fillStyle = `${cls.accentColor}44`;
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = cls.accentColor;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(0, 0, 2.9, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-0.7, -0.7, 1.1, 0, TAU);
    ctx.fill();
    ctx.restore();
  } else if (arch === 'assassin') {
    ctx.save();
    ctx.translate(offSide * 10.2, 2.2);
    ctx.rotate(offSide * 0.5);
    ctx.fillStyle = cls.accentColor;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(2.2, 1.8);
    ctx.lineTo(-2.2, 1.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Head & Eyes
  const ex = Math.cos(p.facingAng) * 1.75;
  const ey = -11.0 + Math.sin(p.facingAng) * 0.95;
  const fullHelm =
    p.classId === 'knight' || p.classId === 'aegis_warden' || p.classId === 'abyss_bastion';
  drawChibiHeadWithHair(ctx, {
    hairColor: hairCol,
    eyeColor: cls.accentColor,
    ex,
    ey,
    determined: p.swing > 0 || arch === 'assassin' || arch === 'tank',
    skipBangs: fullHelm,
    skipMouth: arch === 'assassin',
  });

  if (arch === 'assassin') {
    ctx.fillStyle = cls.bodyColor;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(-6.2, -8.8);
    ctx.quadraticCurveTo(0, -7.8, 6.2, -8.8);
    ctx.quadraticCurveTo(5.2, -4.0, 0, -3.8);
    ctx.quadraticCurveTo(-5.2, -4.0, -6.2, -8.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Headgear per archetype + hidden crown
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.35;
  if (isHidden) {
    // Hidden Class Radiant Crown + Star Halo
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.moveTo(-6.0, -16.8);
    ctx.lineTo(-2.8, -24.2);
    ctx.lineTo(0, -19.8);
    ctx.lineTo(2.8, -24.2);
    ctx.lineTo(6.0, -16.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = cls.accentColor;
    ctx.beginPath();
    ctx.arc(0, -18.4, 1.8, 0, TAU);
    ctx.fill();
  } else if (arch === 'mage') {
    ctx.fillStyle = cls.cloakColor;
    ctx.beginPath();
    ctx.ellipse(0, -15.2, 12.2, 3.0, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = cls.bodyColor;
    ctx.beginPath();
    ctx.moveTo(-8.2, -15.6);
    ctx.quadraticCurveTo(1.5, -30.0, 4.2, -28.0);
    ctx.quadraticCurveTo(6.4, -20.8, 8.2, -15.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = cls.helmColor;
    ctx.fillRect(-7.2, -16.8, 14.4, 2.2);
  } else if (arch === 'healer') {
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(-8.0, -16.0, 16.0, 2.0);
    ctx.strokeStyle = cls.accentColor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, -22.8 + Math.sin(gameTime * 3.5) * 0.9, 7.2, 1.9, 0, 0, TAU);
    ctx.stroke();
  } else if (fullHelm) {
    ctx.fillStyle = cls.helmColor;
    ctx.beginPath();
    ctx.arc(0, -13.6, 9.2, Math.PI * 0.9, Math.PI * 2.1);
    ctx.lineTo(8.6, -8.4);
    ctx.lineTo(5.8, -13.2);
    ctx.lineTo(-5.8, -13.2);
    ctx.lineTo(-8.6, -8.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = cls.accentColor;
    ctx.fillRect(-8.2, -14.2, 16.4, 2.1);
  } else if (arch === 'tank') {
    ctx.fillStyle = cls.helmColor;
    ctx.beginPath();
    ctx.roundRect(-8.4, -17.0, 16.8, 3.0, 1.4);
    ctx.fill();
    ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(s * 6.4, -16.0);
      ctx.quadraticCurveTo(s * 12.5, -21.0, s * 10.2, -24.5);
      ctx.quadraticCurveTo(s * 8.2, -19.2, s * 4.0, -17.0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (arch === 'archer' || arch === 'assassin') {
    ctx.fillStyle = cls.bodyColor;
    ctx.beginPath();
    ctx.arc(0, arch === 'assassin' ? -14.0 : -14.8, 9.2, Math.PI * 0.98, Math.PI * 2.02);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = cls.helmColor;
    ctx.fillRect(-8.5, -15.8, 17.0, 1.9);
    if (arch === 'archer') {
      ctx.fillStyle = cls.accentColor;
      ctx.beginPath();
      ctx.ellipse(-7.4, -20.2, 4.4, 1.7, -0.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-8.2, -15.8, 16.4, 2.3);
    ctx.strokeRect(-8.2, -15.8, 16.4, 2.3);
  }

  // Front Gauntlet & Sleek Detailed Weapons (All 12 WeaponKind archetypes)
  const total = p.swingTotal || 0.24;
  const swProg = p.swing > 0 ? 1 - p.swing / total : 0;
  const sw = p.facingAng + (p.swing > 0 ? swProg * 1.85 - 0.92 : 0);
  ctx.save();
  ctx.rotate(sw);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.15;

  // Armored gauntlet wrist & hand
  ctx.fillStyle = arch === 'tank' ? '#cbd5e1' : arch === 'mage' || arch === 'healer' ? '#fde68a' : '#e2e8f0';
  ctx.beginPath();
  ctx.arc(8.0, 0, 2.6, 0, TAU);
  ctx.fill();
  ctx.stroke();

  const accent = cls.accentColor;

  if (cls.weaponKind === 'shield_blade') {
    // Lance-blade + sculpted kite shield
    const bGrad = ctx.createLinearGradient(8, -3, 28, 3);
    bGrad.addColorStop(0, '#94a3b8');
    bGrad.addColorStop(0.5, '#f8fafc');
    bGrad.addColorStop(1, accent);
    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.moveTo(8, -2.2);
    ctx.lineTo(25, -1.8);
    ctx.lineTo(30, 0);
    ctx.lineTo(25, 1.8);
    ctx.lineTo(8, 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Ornate kite shield
    ctx.fillStyle = cls.helmColor;
    ctx.beginPath();
    ctx.moveTo(15, -7.8);
    ctx.lineTo(23.5, -6.4);
    ctx.lineTo(26.2, 0);
    ctx.lineTo(23.5, 6.4);
    ctx.lineTo(15, 7.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(18, -3.5);
    ctx.lineTo(22.5, 0);
    ctx.lineTo(18, 3.5);
    ctx.lineTo(16.5, 0);
    ctx.closePath();
    ctx.fill();
  } else if (cls.weaponKind === 'scythe') {
    // Sleek dark-metal pole + glowing crescent scythe
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(1, -1.35, 30, 2.7, 1.2);
    ctx.fill();
    ctx.stroke();
    // Pommel spike
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(1, -1.8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(1, 1.8);
    ctx.closePath();
    ctx.fill();
    // Glowing crescent blade
    const sGrad = ctx.createLinearGradient(22, -18, 34, 4);
    sGrad.addColorStop(0, '#ffffff');
    sGrad.addColorStop(0.45, accent);
    sGrad.addColorStop(1, '#312e81');
    ctx.fillStyle = sGrad;
    ctx.beginPath();
    ctx.moveTo(27, -1.2);
    ctx.quadraticCurveTo(38.5, -10.5, 29, -20.5);
    ctx.quadraticCurveTo(21, -19.5, 14, -14.5);
    ctx.quadraticCurveTo(27, -12.5, 25.5, 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Collar gem
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(27, 0, 2.1, 0, TAU);
    ctx.fill();
  } else if (cls.weaponKind === 'scepter') {
    // Royal winged angel scepter with floating crystal
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.roundRect(4, -1.3, 22, 2.6, 1.2);
    ctx.fill();
    ctx.stroke();
    // Golden wings around orb
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.moveTo(24, -1.8);
    ctx.lineTo(29.5, -8.5);
    ctx.lineTo(26.8, -1.2);
    ctx.moveTo(24, 1.8);
    ctx.lineTo(29.5, 8.5);
    ctx.lineTo(26.8, 1.2);
    ctx.fill();
    // Radiant crystal core
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.lineTo(31, -4.4);
    ctx.lineTo(36, 0);
    ctx.lineTo(31, 4.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(31, 0, 1.7, 0, TAU);
    ctx.fill();
  } else if (cls.weaponKind === 'harp') {
    // Radiant celestial lyre
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(13, 0, 10.2, -1.38, 1.38);
    ctx.stroke();
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 0.9;
    for (let s = -5.5; s <= 5.5; s += 2.75) {
      ctx.beginPath();
      ctx.moveTo(13, s);
      ctx.lineTo(22.8, s * 0.65);
      ctx.stroke();
    }
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(23.5, 0, 2.4, 0, TAU);
    ctx.fill();
  } else if (cls.weaponKind === 'sword' || cls.weaponKind === 'celestial_blade') {
    const isCel = cls.weaponKind === 'celestial_blade';
    const bladeLen = isCel ? 31 : 25;
    const swGrad = ctx.createLinearGradient(9, -3, 10 + bladeLen, 3);
    swGrad.addColorStop(0, isCel ? '#e0f2fe' : '#94a3b8');
    swGrad.addColorStop(0.55, isCel ? accent : '#f8fafc');
    swGrad.addColorStop(1, '#ffffff');
    // Hilt grip
    ctx.fillStyle = '#475569';
    ctx.fillRect(3.5, -1.2, 5.5, 2.4);
    // Double-edged beveled blade
    ctx.fillStyle = swGrad;
    ctx.beginPath();
    ctx.moveTo(10, -2.9);
    ctx.lineTo(10 + bladeLen - 6, -2.0);
    ctx.lineTo(10 + bladeLen + 1, 0);
    ctx.lineTo(10 + bladeLen - 6, 2.0);
    ctx.lineTo(10, 2.9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Center glowing fuller ridge
    ctx.strokeStyle = isCel ? '#ffffff' : accent;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(10 + bladeLen - 7, 0);
    ctx.stroke();
    // Swept winged gold crossguard
    ctx.strokeStyle = ink;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(9, -6.2);
    ctx.lineTo(12.2, -2.4);
    ctx.lineTo(12.2, 2.4);
    ctx.lineTo(9, 6.2);
    ctx.lineTo(7.4, 2.6);
    ctx.lineTo(7.4, -2.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Crossguard gem
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(9.8, 0, 1.5, 0, TAU);
    ctx.fill();
  } else if (cls.weaponKind === 'axe') {
    // Double-bearded war halberd-axe
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.roundRect(2, -1.5, 28, 3.0, 1.2);
    ctx.fill();
    ctx.stroke();
    const axGrad = ctx.createLinearGradient(20, -12, 34, 12);
    axGrad.addColorStop(0, '#f8fafc');
    axGrad.addColorStop(0.6, '#94a3b8');
    axGrad.addColorStop(1, accent);
    ctx.fillStyle = axGrad;
    ctx.beginPath();
    ctx.moveTo(21, -2.2);
    ctx.lineTo(29.5, -12.5);
    ctx.quadraticCurveTo(36, 0, 29.5, 12.5);
    ctx.lineTo(21, 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Spear tip
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.moveTo(28, -2.0);
    ctx.lineTo(36, 0);
    ctx.lineTo(28, 2.0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (cls.weaponKind === 'dagger') {
    // Sleek shadow kukri / phantom twin-edge dagger
    const dgGrad = ctx.createLinearGradient(9, -4, 28, 4);
    dgGrad.addColorStop(0, '#94a3b8');
    dgGrad.addColorStop(0.5, '#f8fafc');
    dgGrad.addColorStop(1, accent);
    ctx.fillStyle = dgGrad;
    ctx.beginPath();
    ctx.moveTo(9, -2.0);
    ctx.quadraticCurveTo(19, -5.2, 27.5, -1.0);
    ctx.lineTo(21.5, 1.8);
    ctx.lineTo(9, 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(8, -3.5, 2.2, 7.0);
  } else if (cls.weaponKind === 'spear') {
    // Dragon-wing silver halberd spear
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.roundRect(-2, -1.35, 35, 2.7, 1.2);
    ctx.fill();
    ctx.stroke();
    // Gold collar wings
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(29, -5.5);
    ctx.lineTo(34, 0);
    ctx.lineTo(29, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Long spearhead
    const spGrad = ctx.createLinearGradient(31, -4, 46, 4);
    spGrad.addColorStop(0, accent);
    spGrad.addColorStop(1, '#ffffff');
    ctx.fillStyle = spGrad;
    ctx.beginPath();
    ctx.moveTo(31.5, -3.4);
    ctx.lineTo(46.5, 0);
    ctx.lineTo(31.5, 3.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (cls.weaponKind === 'staff') {
    // Archmage celestial rune staff with crescent cradle & glowing gem
    ctx.fillStyle = '#312e81';
    ctx.beginPath();
    ctx.roundRect(2, -1.4, 27, 2.8, 1.2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(30.5, 0, 5.8, 0.9, TAU - 0.9);
    ctx.stroke();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.1;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(32, -4.6);
    ctx.lineTo(37.5, 0);
    ctx.lineTo(32, 4.6);
    ctx.lineTo(27.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(32, 0, 1.4, 0, TAU);
    ctx.fill();
  } else if (cls.weaponKind === 'crossbow') {
    // Sleek gilded repeating arbalest
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.roundRect(6, -1.9, 21, 3.8, 1.5);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(19, -11.5);
    ctx.quadraticCurveTo(26.5, 0, 19, 11.5);
    ctx.stroke();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(19, -11.5);
    ctx.lineTo(13, 0);
    ctx.lineTo(19, 11.5);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(14, -1.1);
    ctx.lineTo(29, 0);
    ctx.lineTo(14, 1.1);
    ctx.closePath();
    ctx.fill();
  } else {
    // Composite Starlight Longbow
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.7;
    ctx.beginPath();
    ctx.moveTo(14, -12.5);
    ctx.quadraticCurveTo(25.5, -5.5, 19.5, 0);
    ctx.quadraticCurveTo(25.5, 5.5, 14, 12.5);
    ctx.stroke();
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.moveTo(14, -12.5);
    ctx.lineTo(12, 0);
    ctx.lineTo(14, 12.5);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(12, -1.0);
    ctx.lineTo(27.5, 0);
    ctx.lineTo(12, 1.0);
    ctx.closePath();
    ctx.fill();
  }

  // Luminous weapon slash trail when attacking
  if (p.swing > 0) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.6;
    ctx.globalAlpha = clamp(1 - swProg * 0.7, 0.2, 0.85);
    ctx.beginPath();
    ctx.arc(4, 0, 26, -0.75, 0.75);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  ctx.restore();

  // Active Protective Shield Barrier Ring
  if (p.shieldHp && p.shieldHp > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(56,189,248,0.85)';
    ctx.fillStyle = 'rgba(56,189,248,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy - 3, p.r + 8, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (p.hurtFlash > 0) {
    ctx.globalAlpha = p.hurtFlash * 1.4;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(sx, sy, p.r + 4, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  p: ChibiHeroLike,
  cx: number,
  cy: number,
  gameTime: number
): void {
  drawHeroAvatar(ctx, p, cx, cy, gameTime);
}

const remoteHeroScratch: ChibiHeroLike = {
  classId: 'knight',
  x: 0,
  y: 0,
  r: 13,
  facingAng: 0,
  moving: false,
  walkPhase: 0,
  swing: 0,
  swingTotal: 0.24,
  cloak: 0,
  invuln: 0,
  dashTime: 0,
  hurtFlash: 0,
};

function drawRemotePlayer(
  ctx: CanvasRenderingContext2D,
  rp: RemotePlayerEntity,
  cx: number,
  cy: number,
  gameTime: number
): void {
  const sx = rp.x - cx;
  const sy = rp.y - cy;

  ctx.save();
  ctx.strokeStyle = rp.inParty ? '#4ade80' : '#38bdf8';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(sx, sy + 12, 16, 6, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();

  remoteHeroScratch.classId = rp.classId;
  remoteHeroScratch.x = rp.x;
  remoteHeroScratch.y = rp.y;
  remoteHeroScratch.facingAng = rp.facingAng;
  remoteHeroScratch.moving = rp.moving;
  remoteHeroScratch.walkPhase = rp.walkPhase;
  remoteHeroScratch.swing = rp.swing;
  remoteHeroScratch.swingTotal = rp.swingTotal || 0.24;
  drawPlayer(ctx, remoteHeroScratch, cx, cy, gameTime);

  // Remote Player Name Tag & HP Bar
  ctx.save();
  ctx.font = '700 11px system-ui,sans-serif';
  ctx.textAlign = 'center';
  const tag = `${rp.name}${rp.level > 1 ? ` Lv.${rp.level}` : ''}`;
  ctx.fillStyle = 'rgba(0,0,0,0.86)';
  ctx.fillText(tag, sx + 1, sy - 31);
  ctx.fillStyle = rp.inParty ? '#86efac' : '#bae6fd';
  ctx.fillText(tag, sx, sy - 32);

  const barW = 36;
  const barH = 4.5;
  const barX = sx - barW / 2;
  const barY = sy - 27;
  const ratio = clamp(rp.hpRatio, 0, 1);
  ctx.fillStyle = 'rgba(2,6,23,0.9)';
  ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
  ctx.fillStyle = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#f59e0b' : '#ef4444';
  ctx.fillRect(barX, barY, barW * ratio, barH);
  ctx.restore();
}

function renderWeatherOverlayAndParticles(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  cx: number,
  cy: number
): void {
  const weather = state.weather;
  if (!weather || weather.kind === 'clear') return;
  const { vw, vh, gameTime, lightningFlash = 0 } = state;

  ctx.save();
  // 1. 大气染色覆盖层
  if (weather.overlayTint && weather.overlayTint !== 'rgba(0, 0, 0, 0)') {
    ctx.fillStyle = weather.overlayTint;
    ctx.fillRect(0, 0, vw, vh);
  }

  const kind = weather.kind;
  if (kind === 'drizzle' || kind === 'thunderstorm') {
    const isStorm = kind === 'thunderstorm';
    const fogPuff = ensureFogPuffSprite();

    // 低空流动湿气薄雾（强化雨幕纵深感）
    const mistCount = isStorm ? 8 : 5;
    for (let i = 0; i < mistCount; i++) {
      const rw = (isStorm ? 260 : 210) + ((i * 67) % 110);
      const rh = rw * 0.46;
      const speedX = (isStorm ? -68 : -28) - (i % 3) * 10;
      const xRaw = i * 245 + gameTime * speedX - cx * 0.22;
      const yRaw = ((i * 157) % Math.max(160, vh)) + Math.sin(gameTime * 0.6 + i) * 14 - cy * 0.14;
      const sx = ((xRaw % (vw + rw)) + (vw + rw)) % (vw + rw) - rw * 0.5;
      const sy = ((yRaw % (vh + rh)) + (vh + rh)) % (vh + rh) - rh * 0.5;
      ctx.globalAlpha = isStorm ? 0.1 : 0.065;
      ctx.drawImage(fogPuff, sx - rw / 2, sy - rh / 2, rw, rh);
    }
    ctx.globalAlpha = 1;

    // 远景微雨丝层
    const bgCount = isStorm ? 64 : 42;
    const bgFall = isStorm ? 640 : 420;
    const bgWind = isStorm ? -175 : -88;
    const bgLen = isStorm ? 14 : 9;
    ctx.strokeStyle = isStorm ? 'rgba(147, 197, 253, 0.28)' : 'rgba(147, 197, 253, 0.22)';
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < bgCount; i++) {
      const sA = (i * 1597 + 23) % 997;
      const sB = (i * 2503 + 61) % 991;
      const sv = 0.88 + (sA % 25) / 100;
      const xRaw = sA * 2.1 + gameTime * bgWind * sv - cx * 0.28;
      const yRaw = sB * 1.9 + gameTime * bgFall * sv - cy * 0.28;
      const sx = ((xRaw % (vw + 60)) + (vw + 60)) % (vw + 60) - 30;
      const sy = ((yRaw % (vh + 60)) + (vh + 60)) % (vh + 60) - 30;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + bgWind * (bgLen / bgFall), sy + bgLen);
    }
    ctx.stroke();

    // 近景主雨幕（双色拖尾+高光雨滴尖端）
    const fgCount = isStorm ? 72 : 46;
    const fallSpeed = isStorm ? 940 : 630;
    const windDrift = isStorm ? -265 : -132;
    const streakLen = isStorm ? 25 : 16;
    const dxTail = windDrift * (streakLen / fallSpeed);
    ctx.strokeStyle = isStorm ? 'rgba(186, 230, 253, 0.56)' : 'rgba(186, 230, 253, 0.44)';
    ctx.lineWidth = isStorm ? 1.55 : 1.15;
    ctx.beginPath();
    for (let i = 0; i < fgCount; i++) {
      const seedA = (i * 1973 + 41) % 997;
      const seedB = (i * 3137 + 89) % 991;
      const speedVar = 0.85 + (seedA % 35) / 100;
      const xRaw = seedA * 2.1 + gameTime * windDrift * speedVar - cx * 0.48;
      const yRaw = seedB * 1.9 + gameTime * fallSpeed * speedVar - cy * 0.48;
      const sx = ((xRaw % (vw + 80)) + (vw + 80)) % (vw + 80) - 40;
      const sy = ((yRaw % (vh + 80)) + (vh + 80)) % (vh + 80) - 40;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + dxTail, sy + streakLen);
    }
    ctx.stroke();

    // 雨滴尖端高光
    ctx.strokeStyle = isStorm ? 'rgba(240, 249, 255, 0.72)' : 'rgba(224, 242, 254, 0.55)';
    ctx.lineWidth = isStorm ? 1.3 : 1.0;
    ctx.beginPath();
    for (let i = 0; i < fgCount; i += 2) {
      const seedA = (i * 1973 + 41) % 997;
      const seedB = (i * 3137 + 89) % 991;
      const speedVar = 0.85 + (seedA % 35) / 100;
      const xRaw = seedA * 2.1 + gameTime * windDrift * speedVar - cx * 0.48;
      const yRaw = seedB * 1.9 + gameTime * fallSpeed * speedVar - cy * 0.48;
      const sx = ((xRaw % (vw + 80)) + (vw + 80)) % (vw + 80) - 40;
      const sy = ((yRaw % (vh + 80)) + (vh + 80)) % (vh + 80) - 40;
      ctx.moveTo(sx + dxTail * 0.72, sy + streakLen * 0.72);
      ctx.lineTo(sx + dxTail, sy + streakLen);
    }
    ctx.stroke();

    // 地面水花溅起涟漪 + 弹跳微水珠
    const splashCount = isStorm ? 20 : 10;
    ctx.strokeStyle = isStorm ? 'rgba(224, 242, 254, 0.48)' : 'rgba(186, 230, 253, 0.36)';
    ctx.lineWidth = 1;
    for (let i = 0; i < splashCount; i++) {
      const phase = (gameTime * (isStorm ? 2.7 : 1.95) + i * 0.37) % 1;
      const bucket = Math.floor(gameTime * (isStorm ? 2.7 : 1.95) + i * 0.37);
      const rx = ((i * 211 + bucket * 73) % Math.max(120, vw - 40)) + 20;
      const ry = ((i * 167 + bucket * 53) % Math.max(120, vh - 40)) + 20;
      const rad = 2 + phase * (isStorm ? 11.5 : 7.5);
      ctx.globalAlpha = (1 - phase) * 0.56;
      ctx.beginPath();
      ctx.ellipse(rx, ry, rad, rad * 0.38, 0, 0, TAU);
      ctx.stroke();
      if (phase < 0.45) {
        const hop = Math.sin((phase / 0.45) * Math.PI) * (isStorm ? 6 : 4);
        ctx.fillStyle = 'rgba(224, 242, 254, 0.65)';
        ctx.fillRect(rx - 2 - phase * 6, ry - hop, 1.5, 1.5);
        ctx.fillRect(rx + 2 + phase * 6, ry - hop * 0.85, 1.5, 1.5);
      }
    }
    ctx.globalAlpha = 1;

    // 雷暴闪电光爆 + 分支闪电弧
    if (isStorm) {
      if (lightningFlash > lastLightningFlashVal + 0.25) {
        lightningBoltSeed = ((lightningBoltSeed * 1664525 + 1013904223) >>> 0) || 1;
      }
      lastLightningFlashVal = lightningFlash;
      if (lightningFlash > 0.01) {
        const boltAlpha = clamp(lightningFlash * 1.15, 0, 0.95);
        const startX = ((lightningBoltSeed % 70) / 100 + 0.15) * vw;
        const skyGlow = getGlowSprite('#dbeafe');
        ctx.globalAlpha = clamp(lightningFlash * 0.55, 0, 0.55);
        ctx.drawImage(skyGlow, startX - 240, -140, 480, 360);

        ctx.fillStyle = `rgba(219, 234, 254, ${clamp(lightningFlash * 0.32, 0, 0.32).toFixed(3)})`;
        ctx.fillRect(0, 0, vw, vh);

        if (lightningFlash > 0.14) {
          const segs = 8;
          const pts: { x: number; y: number }[] = [{ x: startX, y: 0 }];
          let curX = startX;
          let curY = 0;
          const stepH = (vh * 0.62) / segs;
          for (let s = 1; s <= segs; s++) {
            const h = ((lightningBoltSeed >> (s * 2)) ^ (s * 97)) & 31;
            curX += (h - 15) * 3.1;
            curY += stepH;
            pts.push({ x: curX, y: curY });
          }

          const strokeBolt = () => {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let s = 1; s < pts.length; s++) {
              ctx.lineTo(pts[s].x, pts[s].y);
            }
            // 闪电分支
            for (let b = 2; b <= 5; b += 3) {
              const bp = pts[b];
              const dir = b % 2 === 0 ? 1 : -1;
              ctx.moveTo(bp.x, bp.y);
              ctx.lineTo(bp.x + dir * 26, bp.y + 30);
              ctx.lineTo(bp.x + dir * 44, bp.y + 58);
            }
            ctx.stroke();
          };

          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.globalAlpha = boltAlpha * 0.5;
          ctx.strokeStyle = '#60a5fa';
          ctx.lineWidth = 6;
          strokeBolt();

          ctx.globalAlpha = boltAlpha * 0.92;
          ctx.strokeStyle = '#f0f9ff';
          ctx.lineWidth = 2.1;
          strokeBolt();
          ctx.globalAlpha = 1;
        }
      }
    } else {
      lastLightningFlashVal = 0;
    }
  } else if (kind === 'snow') {
    const fogPuff = ensureFogPuffSprite();
    const snowGlow = getGlowSprite('#e0f2fe');

    // 地面低空冰雾层
    for (let i = 0; i < 6; i++) {
      const rw = 220 + ((i * 53) % 90);
      const rh = rw * 0.42;
      const xRaw = i * 260 + gameTime * (-22 - (i % 3) * 8) - cx * 0.16;
      const yRaw = ((i * 149) % Math.max(160, vh)) + Math.sin(gameTime * 0.5 + i) * 16 - cy * 0.1;
      const sx = ((xRaw % (vw + rw)) + (vw + rw)) % (vw + rw) - rw * 0.5;
      const sy = ((yRaw % (vh + rh)) + (vh + rh)) % (vh + rh) - rh * 0.5;
      ctx.globalAlpha = 0.075;
      ctx.drawImage(fogPuff, sx - rw / 2, sy - rh / 2, rw, rh);
    }

    // 远景微雪尘
    ctx.fillStyle = '#e0f2fe';
    for (let i = 0; i < 46; i++) {
      const sA = (i * 1277 + 13) % 997;
      const sB = (i * 2341 + 59) % 991;
      const sway = Math.sin(gameTime * 1.1 + i) * 12;
      const xRaw = sA * 2.2 + gameTime * -18 + sway - cx * 0.14;
      const yRaw = sB * 2.0 + gameTime * 48 - cy * 0.14;
      const sx = ((xRaw % (vw + 30)) + (vw + 30)) % (vw + 30) - 15;
      const sy = ((yRaw % (vh + 30)) + (vh + 30)) % (vh + 30) - 15;
      ctx.globalAlpha = 0.36;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.2, 0, TAU);
      ctx.fill();
    }

    // 中景柔光雪片
    for (let i = 0; i < 34; i++) {
      const seedA = (i * 1429 + 19) % 997;
      const seedB = (i * 2791 + 73) % 991;
      const depth = 0.8 + (seedA % 4) * 0.18;
      const sway = Math.sin(gameTime * (1.3 + depth) + i) * (20 * depth);
      const xRaw = seedA * 2.3 + gameTime * (-34 * depth) + sway - cx * 0.28;
      const yRaw = seedB * 2.1 + gameTime * (82 * depth) - cy * 0.28;
      const sx = ((xRaw % (vw + 40)) + (vw + 40)) % (vw + 40) - 20;
      const sy = ((yRaw % (vh + 40)) + (vh + 40)) % (vh + 40) - 20;
      const r = 1.6 + depth * 1.1;
      ctx.globalAlpha = 0.22 * depth;
      ctx.drawImage(snowGlow, sx - r * 3, sy - r * 3, r * 6, r * 6);
      ctx.globalAlpha = 0.58 + depth * 0.22;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.fill();
    }

    // 近景旋转六角冰晶雪花
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.85)';
    ctx.lineWidth = 1.15;
    ctx.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const sA = (i * 1741 + 31) % 997;
      const sB = (i * 3011 + 83) % 991;
      const sway = Math.sin(gameTime * 1.7 + i * 1.3) * 28;
      const xRaw = sA * 2.5 + gameTime * -48 + sway - cx * 0.42;
      const yRaw = sB * 2.2 + gameTime * 112 - cy * 0.42;
      const sx = ((xRaw % (vw + 60)) + (vw + 60)) % (vw + 60) - 30;
      const sy = ((yRaw % (vh + 60)) + (vh + 60)) % (vh + 60) - 30;
      const rad = 4.2 + (i % 3) * 1.1;
      const rot = gameTime * (0.9 + (i % 3) * 0.35) + i;
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      for (let arm = 0; arm < 3; arm++) {
        const a = rot + (arm * Math.PI) / 3;
        const dx = Math.cos(a) * rad;
        const dy = Math.sin(a) * rad;
        ctx.moveTo(sx - dx, sy - dy);
        ctx.lineTo(sx + dx, sy + dy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (kind === 'fog') {
    // 1. 屏幕边缘浓雾渐变纱幔（保持屏幕中心战斗区视野清晰）
    ctx.drawImage(ensureFogEdgeVeilCanvas(), 0, 0, vw, vh);

    // 2. 双层径向柔边云雾团（彻底替代生硬纯色椭圆）
    const fogPuff = ensureFogPuffSprite();
    const mistCount = 18;
    for (let i = 0; i < mistCount; i++) {
      const farLayer = i < 10;
      const rw = (farLayer ? 260 : 210) + ((i * 71) % 140);
      const rh = rw * (farLayer ? 0.5 : 0.46);
      const speedX = (farLayer ? 15 : 28) + (i % 4) * 7;
      const parallax = farLayer ? 0.16 : 0.3;
      const xRaw = i * 225 + gameTime * speedX - cx * parallax;
      const yRaw =
        ((i * 139) % Math.max(200, vh)) +
        Math.sin(gameTime * 0.45 + i) * 24 -
        cy * (parallax * 0.7);
      const sx = ((xRaw % (vw + rw)) + (vw + rw)) % (vw + rw) - rw * 0.5;
      const sy = ((yRaw % (vh + rh)) + (vh + rh)) % (vh + rh) - rh * 0.5;
      ctx.globalAlpha = farLayer ? 0.18 + (i % 3) * 0.03 : 0.14 + (i % 3) * 0.025;
      ctx.drawImage(fogPuff, sx - rw / 2, sy - rh / 2, rw, rh);
    }

    // 3. 迷雾微光孢子/水汽光斑
    const mistGlow = getGlowSprite('#e2e8f0');
    for (let i = 0; i < 26; i++) {
      const xRaw = i * 193 + gameTime * (24 + (i % 5) * 6) - cx * 0.34;
      const yRaw =
        ((i * 157) % Math.max(120, vh)) + Math.cos(gameTime * 0.8 + i) * 18 - cy * 0.2;
      const sx = ((xRaw % (vw + 30)) + (vw + 30)) % (vw + 30) - 15;
      const sy = ((yRaw % (vh + 30)) + (vh + 30)) % (vh + 30) - 15;
      const r = 5 + (i % 4) * 2;
      ctx.globalAlpha = 0.18 + 0.1 * Math.sin(gameTime * 1.8 + i);
      ctx.drawImage(mistGlow, sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawMob(
  ctx: CanvasRenderingContext2D,
  m: MobEntity,
  cx: number,
  cy: number,
  player: PlayerEntity,
  vw: number,
  vh: number,
  gameTime = 0
): void {
  const sx = m.x - cx;
  const sy = m.y - cy;
  if (sx < -105 || sy < -125 || sx > vw + 105 || sy > vh + 125) return;

  const bob = Math.sin(m.phase) * 2;
  const lunge = m.lunge > 0 ? (m.lunge / 0.18) * 5 : 0;
  const la = Math.atan2(player.y - m.y, player.x - m.x);
  const ox = Math.cos(la) * lunge;
  const oy = Math.sin(la) * lunge;
  const eliteDef = m.isElite && m.eliteAffix ? ELITE_AFFIX_DEFS[m.eliteAffix] : null;

  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + m.r * 0.8, m.r * 0.95, m.r * 0.42, 0, 0, TAU);
  ctx.fill();

  // 精英词缀地面光环与环绕粒子特效
  if (eliteDef) {
    const pulse = 0.72 + Math.sin(gameTime * 4.5 + m.phase) * 0.25;
    drawGlow(ctx, sx, sy, m.r * 2.45, eliteDef.glowColor, 0.36 * pulse);
    ctx.save();
    ctx.translate(sx, sy + m.r * 0.42);
    ctx.strokeStyle = eliteDef.color;
    ctx.globalAlpha = 0.65 * pulse;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.ellipse(0, 0, m.r * 1.48, m.r * 0.66, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, m.r * 1.72, m.r * 0.78, gameTime * 1.4, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(sx + ox, sy + bob + oy);

  const flash = m.hitFlash > 0;
  // 外发光（预烘焙光晕精灵，避免每怪每帧 createRadialGradient）
  if (!flash) {
    drawGlow(ctx, 0, 0, m.r * 1.6, eliteDef ? eliteDef.color : m.color, eliteDef ? 0.44 : 0.34);
  }
  // 身体（保留发光与渐变，同时按 10 种形态特征绘出差异化轮廓）
  if (m.trait === 'spider') {
    ctx.strokeStyle = flash ? '#fff' : '#1e293b';
    ctx.lineWidth = 2.2;
    for (let s = -1; s <= 1; s++) {
      const yOff = s * 4.5;
      ctx.beginPath();
      ctx.moveTo(-m.r * 0.6, yOff);
      ctx.lineTo(-m.r * 1.45, yOff - 3);
      ctx.moveTo(m.r * 0.6, yOff);
      ctx.lineTo(m.r * 1.45, yOff - 3);
      ctx.stroke();
    }
  } else if (m.trait === 'winged') {
    const flap = Math.sin(m.phase * 3) * 4;
    if (!flash) ctx.globalAlpha = 0.8;
    ctx.fillStyle = flash ? '#fff' : m.color;
    ctx.beginPath();
    ctx.moveTo(-m.r * 0.5, 0);
    ctx.lineTo(-m.r * 1.6, -8 + flap);
    ctx.lineTo(-m.r * 0.7, 5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(m.r * 0.5, 0);
    ctx.lineTo(m.r * 1.6, -8 + flap);
    ctx.lineTo(m.r * 0.7, 5);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = flash ? '#fff' : m.freezeTimer > 0 ? '#67e8f9' : m.color;
  ctx.beginPath();
  ctx.arc(0, 0, m.r, 0, TAU);
  ctx.fill();
  if (eliteDef && !flash) {
    ctx.strokeStyle = eliteDef.color;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }
  ctx.fillStyle = flash ? '#fff' : 'rgba(255,255,255,.25)';
  ctx.beginPath();
  ctx.arc(0, -m.r * 0.22, m.r * 0.66, 0, TAU);
  ctx.fill();

  // 形态细节装饰
  if (!flash) {
    if (m.trait === 'beast') {
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.moveTo(-m.r * 0.65, -m.r * 0.45);
      ctx.lineTo(-m.r * 0.85, -m.r * 1.15);
      ctx.lineTo(-m.r * 0.2, -m.r * 0.85);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(m.r * 0.65, -m.r * 0.45);
      ctx.lineTo(m.r * 0.85, -m.r * 1.15);
      ctx.lineTo(m.r * 0.2, -m.r * 0.85);
      ctx.fill();
    } else if (m.trait === 'flora') {
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.ellipse(-5, -m.r - 2, 5, 3, -0.5, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(5, -m.r - 2, 5, 3, 0.5, 0, TAU);
      ctx.fill();
    } else if (m.trait === 'construct') {
      ctx.strokeStyle = 'rgba(15,23,42,0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-m.r * 0.9, -m.r * 0.5, m.r * 1.8, m.r * 1.1);
    } else if (m.trait === 'undead' || m.trait === 'void') {
      ctx.strokeStyle = m.trait === 'void' ? '#e879f9' : '#e2e8f0';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, m.r * 1.22, 0, Math.PI);
      ctx.stroke();
    }
  }

  // 眼睛
  const ex = Math.cos(la) * m.r * 0.28;
  const ey = Math.sin(la) * m.r * 0.22;
  ctx.fillStyle = flash ? '#000' : eliteDef ? '#fef08a' : '#111827';
  ctx.beginPath();
  ctx.arc(ex - m.r * 0.26, ey - m.r * 0.12, m.r * 0.15, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ex + m.r * 0.26, ey - m.r * 0.12, m.r * 0.15, 0, TAU);
  ctx.fill();

  // 眩晕 / 冰冻提示环
  if (m.stunTimer > 0) {
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -m.r - 4, m.r * 0.7, 3.5, 0, 0, TAU);
    ctx.stroke();
  } else if (m.freezeTimer > 0) {
    ctx.strokeStyle = '#a5f3fc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, m.r + 3, 0, TAU);
    ctx.stroke();
  }

  // 精英王冠徽记 & 环绕词缀微粒
  if (eliteDef) {
    for (let k = 0; k < 3; k++) {
      const oa = gameTime * (m.eliteAffix === 'swift' ? 4.8 : 2.6) + (k * TAU) / 3;
      const oxOrb = Math.cos(oa) * (m.r + 7);
      const oyOrb = Math.sin(oa) * (m.r * 0.55 + 3);
      ctx.fillStyle = eliteDef.glowColor;
      ctx.beginPath();
      ctx.arc(oxOrb, oyOrb, 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = eliteDef.color;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-6, -m.r - 3);
    ctx.lineTo(-4, -m.r - 10);
    ctx.lineTo(0, -m.r - 6);
    ctx.lineTo(4, -m.r - 10);
    ctx.lineTo(6, -m.r - 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (m.level >= 5) {
    ctx.fillStyle = 'rgba(251,191,36,.95)';
    ctx.beginPath();
    ctx.arc(0, -m.r - 3, 3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // 血条与名称前缀（精英怪物常驻显示词缀前缀与血条）
  if (eliteDef || m.hpBarTimer > 0 || m.hp < m.maxHp) {
    const w = Math.max(m.r * 2.4, eliteDef ? 44 : 28);
    const hx = sx - w / 2;
    const hy = sy - m.r - (eliteDef ? 20 : 15);
    ctx.fillStyle = 'rgba(0,0,0,.78)';
    ctx.fillRect(hx - 1, hy - 1, w + 2, eliteDef ? 7 : 6);
    ctx.fillStyle = eliteDef ? eliteDef.color : '#ef4444';
    ctx.fillRect(hx, hy, w * clamp(m.hp / m.maxHp, 0, 1), eliteDef ? 5 : 4);
    ctx.font = eliteDef ? '900 11px system-ui,sans-serif' : '700 10px system-ui,sans-serif';
    ctx.textAlign = 'center';
    const label = `${m.name} Lv.${m.level}`;
    ctx.fillStyle = 'rgba(0,0,0,.86)';
    ctx.fillText(label, sx + 1, hy - 6);
    ctx.fillStyle = eliteDef ? eliteDef.glowColor : '#e2e8f0';
    ctx.fillText(label, sx, hy - 7);
  }
}

function drawBoss(
  ctx: CanvasRenderingContext2D,
  b: BossEntity,
  cx: number,
  cy: number,
  player: PlayerEntity,
  gameTime: number
): void {
  const sx = b.x - cx;
  const sy = b.y - cy;
  const flash = b.hitFlash > 0;
  const ink = '#0f172a';
  const id = (b.fixedBossId || b.bossArchetype || b.name).toLowerCase();
  const isVoid = id.includes('void') || id.includes('虚空') || id.includes('暗星') || id.includes('魔皇');
  const isTreant = id.includes('forest') || id.includes('treant') || id.includes('grove') || id.includes('树');
  const isSiren = id.includes('lake') || id.includes('siren') || id.includes('aqua') || id.includes('海妖') || id.includes('毒');
  const isDemon = id.includes('demon') || id.includes('flame') || id.includes('lava') || id.includes('dragon') || id.includes('炎');
  const isLord = !isVoid && !isTreant && !isSiren && !isDemon;

  const coreColor = isVoid
    ? '#c084fc'
    : isTreant
    ? '#4ade80'
    : isSiren
    ? '#38bdf8'
    : isDemon
    ? '#fb7185'
    : '#fbbf24';
  const armorDark = isVoid
    ? '#2e1065'
    : isTreant
    ? '#14532d'
    : isSiren
    ? '#0c4a6e'
    : isDemon
    ? '#450a0a'
    : '#1e3a8a';
  const armorMid = isVoid
    ? '#581c87'
    : isTreant
    ? '#166534'
    : isSiren
    ? '#0284c7'
    : isDemon
    ? '#991b1b'
    : '#1d4ed8';
  const armorLight = isVoid
    ? '#a855f7'
    : isTreant
    ? '#22c55e'
    : isSiren
    ? '#0ea5e9'
    : isDemon
    ? '#ef4444'
    : '#3b82f6';
  const trimGold = isVoid
    ? '#e879f9'
    : isTreant
    ? '#bef264'
    : isSiren
    ? '#bae6fd'
    : '#fde047';

  // Active Skill Telegraph on ground (Rotating Runic Circle + Multi-Point Meteor + Cross Slash)
  if (b.telegraph) {
    const tf = b.telegraph;
    const prog = 1 - clamp(tf.timer / Math.max(0.01, tf.maxTimer), 0, 1);
    const tc = tf.color || coreColor;
    const targets =
      tf.subTargets && tf.subTargets.length > 0
        ? tf.subTargets
        : [{ x: tf.x, y: tf.y, r: tf.r }];

    ctx.save();
    for (const st of targets) {
      const tx = st.x - cx;
      const ty = st.y - cy;
      const tr = st.r ?? tf.r;

      ctx.fillStyle = tc;
      ctx.globalAlpha = 0.12 + prog * 0.24;
      ctx.beginPath();
      ctx.arc(tx, ty, tr, 0, TAU);
      ctx.fill();

      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = tc;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(tx, ty, tr, 0, TAU);
      ctx.stroke();

      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(gameTime * 1.9);
      ctx.setLineDash([12, 8]);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, tr * 0.86, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      ctx.globalAlpha = 0.92;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(tx, ty, tr * prog, 0, TAU);
      ctx.stroke();
    }

    if (tf.kind === 'dash_strike' || tf.kind === 'blink_execute') {
      const tx = tf.x - cx;
      const ty = tf.y - cy;
      ctx.strokeStyle = tf.kind === 'blink_execute' ? '#f43f5e' : '#fde047';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (tf.kind === 'cross_slash') {
      const baseA = tf.ang ?? 0;
      const arms = b.rage >= 0.5 ? 8 : 4;
      ctx.strokeStyle = tc;
      ctx.globalAlpha = 0.6 + prog * 0.35;
      ctx.lineWidth = 3.2;
      for (let k = 0; k < arms; k++) {
        const wa = baseA + (TAU * k) / arms;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(wa) * tf.r, sy + Math.sin(wa) * tf.r);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  const sc = clamp(b.r / 22, 1.38, 1.88);
  const bob = Math.sin(b.phase) * 2.2;
  const la = b.facingAng ?? Math.atan2(player.y - b.y, player.x - b.x);
  const atkProg =
    b.attackAnim && b.attackAnim > 0
      ? 1 - b.attackAnim / Math.max(0.01, b.attackAnimTotal ?? 0.45)
      : 0;
  const windup = b.state === 'telegraph' || b.state === 'slam' ? -0.45 : 0;
  const enraged = b.rage >= 0.5;

  // Ground Runic Sovereign Circle + Shadow
  ctx.save();
  ctx.strokeStyle = enraged ? 'rgba(244,63,94,0.68)' : `${coreColor}77`;
  ctx.lineWidth = enraged ? 2.2 : 1.6;
  ctx.beginPath();
  ctx.ellipse(sx, sy + 18 * sc, 25 * sc, 9.5 * sc, 0, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.52)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + 18 * sc, 19 * sc, 7.2 * sc, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Ambient Sovereign Aura (+ Phase 2 Crimson Surge)
  drawGlow(ctx, sx, sy - 6 * sc, b.r * (enraged ? 2.65 : 2.25), enraged ? '#f43f5e' : coreColor, enraged ? 0.34 : 0.24);

  ctx.save();
  ctx.translate(sx, sy + bob);
  ctx.scale(sc, sc);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 0. Celestial Geometric Runic Halo behind Heroic Sovereign Silhouette
  ctx.save();
  ctx.translate(0, -14);
  ctx.rotate(gameTime * (enraged ? 1.15 : 0.55));
  ctx.strokeStyle = enraged ? '#fb7185' : trimGold;
  ctx.globalAlpha = enraged ? 0.72 : 0.48;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(0, 0, 16.5, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
    ctx.lineTo(Math.cos(a) * 19.5, Math.sin(a) * 19.5);
    ctx.stroke();
  }
  ctx.restore();

  // 1. Sleek Back Mantle / Energy Wings / Astral Blades
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.25;
  if (isVoid) {
    // Twin Seraphic Void Energy Wings + Orbiting Shards
    for (const s of [-1, 1]) {
      const flap = Math.sin(gameTime * 3.0) * 1.8;
      const wGrad = ctx.createLinearGradient(0, -14, s * 22, 6);
      wGrad.addColorStop(0, '#581c87');
      wGrad.addColorStop(1, '#e879f9');
      ctx.fillStyle = flash ? '#fff' : wGrad;
      ctx.beginPath();
      ctx.moveTo(s * 4, -10);
      ctx.quadraticCurveTo(s * 20, -24 + flap, s * 24, -10 + flap * 0.5);
      ctx.quadraticCurveTo(s * 17, -4, s * 14, 4);
      ctx.lineTo(s * 5, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const oa = gameTime * 1.5 + (i * TAU) / 4;
      const ox = Math.cos(oa) * 20;
      const oy = -10 + Math.sin(oa) * 8;
      ctx.fillStyle = flash ? '#fff' : '#f0abfc';
      ctx.beginPath();
      ctx.moveTo(ox, oy - 5.5);
      ctx.lineTo(ox + 3.0, oy);
      ctx.lineTo(ox, oy + 5.5);
      ctx.lineTo(ox - 3.0, oy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (isDemon) {
    // Sleek Blazing Archfiend Wings
    const flap = Math.sin(gameTime * 3.6) * 2.6;
    for (const s of [-1, 1]) {
      const dGrad = ctx.createLinearGradient(s * 4, -10, s * 25, -20);
      dGrad.addColorStop(0, '#450a0a');
      dGrad.addColorStop(0.6, '#dc2626');
      dGrad.addColorStop(1, '#fbbf24');
      ctx.fillStyle = flash ? '#fff' : dGrad;
      ctx.beginPath();
      ctx.moveTo(s * 4.5, -10);
      ctx.lineTo(s * 23, -24 + flap);
      ctx.lineTo(s * 18, -9 + flap * 0.4);
      ctx.lineTo(s * 21, -1 + flap * 0.2);
      ctx.lineTo(s * 6, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else {
    // Heroic Flowing Sovereign War-Cape with Gold Trim
    const flutter = Math.sin(gameTime * 3.2) * 2.4;
    const cGrad = ctx.createLinearGradient(0, -12, 0, 17);
    cGrad.addColorStop(0, isSiren ? '#0369a1' : isTreant ? '#14532d' : '#7f1d1d');
    cGrad.addColorStop(1, isSiren ? '#0c4a6e' : isTreant ? '#052e16' : '#1e1b4b');
    ctx.fillStyle = flash ? '#fff' : cGrad;
    ctx.beginPath();
    ctx.moveTo(-9, -11);
    ctx.quadraticCurveTo(-15 + flutter * 0.4, 3, -13 + flutter * 0.6, 15.5);
    ctx.lineTo(0, 17.5);
    ctx.lineTo(13 - flutter * 0.6, 15.5);
    ctx.quadraticCurveTo(15 - flutter * 0.4, 3, 9, -11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 2. Tapered Heroic Greaves & Armored Boots
  const stride = Math.sin(b.phase * 1.4) * 1.6;
  for (const s of [-1, 1]) {
    ctx.fillStyle = flash ? '#fff' : armorDark;
    ctx.beginPath();
    ctx.moveTo(s * 2.2, 5.2);
    ctx.lineTo(s * 7.8, 5.2);
    ctx.lineTo(s * 6.4, 15.8 + (s < 0 ? stride : -stride) * 0.35);
    ctx.lineTo(s * 2.8, 15.8 + (s < 0 ? stride : -stride) * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = flash ? '#fff' : trimGold;
    ctx.fillRect(s * 3.2 + (s < 0 ? -3.4 : 0), 9.2, 3.4, 1.8);
  }

  // 3. Sleek V-Tapered Sovereign Cuirass + Armored Tassets
  const chestGrad = ctx.createLinearGradient(-10, -12, 10, 8);
  chestGrad.addColorStop(0, armorLight);
  chestGrad.addColorStop(0.55, armorMid);
  chestGrad.addColorStop(1, armorDark);
  ctx.fillStyle = flash ? '#fff' : b.freezeTimer > 0 ? '#67e8f9' : chestGrad;
  ctx.beginPath();
  ctx.moveTo(-10.8, -12.0);
  ctx.lineTo(10.8, -12.0);
  ctx.lineTo(6.8, 2.5);
  ctx.lineTo(8.2, 8.0);
  ctx.lineTo(0, 10.2);
  ctx.lineTo(-8.2, 8.0);
  ctx.lineTo(-6.8, 2.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Glowing Runic Sternum Crest & Gold Waist Belt
  ctx.strokeStyle = flash ? '#fff' : trimGold;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-7.2, -9.5);
  ctx.lineTo(0, -1.5);
  ctx.lineTo(7.2, -9.5);
  ctx.stroke();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.25;
  ctx.fillStyle = flash ? '#fff' : trimGold;
  ctx.fillRect(-6.8, 2.2, 13.6, 2.2);
  ctx.fillStyle = flash ? '#fff' : coreColor;
  ctx.beginPath();
  ctx.moveTo(0, -8.5);
  ctx.lineTo(3.2, -4.6);
  ctx.lineTo(0, -0.7);
  ctx.lineTo(-3.2, -4.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 4. Swept Winged Shoulder Pauldrons (Sleek Knight-Sovereign Angle)
  for (const s of [-1, 1]) {
    ctx.fillStyle = flash ? '#fff' : armorMid;
    ctx.beginPath();
    ctx.moveTo(s * 6.5, -13.2);
    ctx.lineTo(s * 16.5, -17.5);
    ctx.lineTo(s * 13.2, -8.2);
    ctx.lineTo(s * 7.2, -7.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = flash ? '#fff' : trimGold;
    ctx.beginPath();
    ctx.moveTo(s * 11.2, -15.2);
    ctx.lineTo(s * 18.8, -19.8);
    ctx.lineTo(s * 14.5, -12.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 5. Handsome Sculpted Visored Warrior Helm + Radiant Crown Crest
  // Neck guard / collar
  ctx.fillStyle = flash ? '#fff' : armorDark;
  ctx.fillRect(-3.6, -14.2, 7.2, 3.2);

  // Sleek tapered jawline helm
  const helmGrad = ctx.createLinearGradient(-7, -25, 7, -11);
  helmGrad.addColorStop(0, armorLight);
  helmGrad.addColorStop(0.5, armorMid);
  helmGrad.addColorStop(1, armorDark);
  ctx.fillStyle = flash ? '#fff' : helmGrad;
  ctx.beginPath();
  ctx.moveTo(-6.2, -21.2);
  ctx.quadraticCurveTo(0, -26.2, 6.2, -21.2);
  ctx.lineTo(5.2, -14.2);
  ctx.lineTo(0, -11.4);
  ctx.lineTo(-5.2, -14.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Dark inner visor recess for sharp eyes
  ctx.fillStyle = '#090d16';
  ctx.beginPath();
  ctx.moveTo(-4.8, -18.8);
  ctx.lineTo(4.8, -18.8);
  ctx.lineTo(3.6, -15.0);
  ctx.lineTo(0, -14.0);
  ctx.lineTo(-3.6, -15.0);
  ctx.closePath();
  ctx.fill();

  // Swept Side Fin Horns / Crown Crest
  if (isTreant) {
    ctx.strokeStyle = flash ? '#fff' : '#854d0e';
    ctx.lineWidth = 2.6;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 3.8, -23.0);
      ctx.quadraticCurveTo(s * 10.5, -31.5, s * 13.0, -26.8);
      ctx.stroke();
    }
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = ink;
  } else {
    for (const s of [-1, 1]) {
      ctx.fillStyle = flash ? '#fff' : trimGold;
      ctx.beginPath();
      ctx.moveTo(s * 4.5, -21.2);
      ctx.quadraticCurveTo(s * 12.2, -27.5, s * 11.2, -33.5);
      ctx.quadraticCurveTo(s * 8.2, -26.5, s * 3.0, -23.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // Central Royal Crown Spike + Crest Jewel
    ctx.fillStyle = flash ? '#fff' : trimGold;
    ctx.beginPath();
    ctx.moveTo(-3.2, -23.4);
    ctx.lineTo(0, -32.8);
    ctx.lineTo(3.2, -23.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.arc(0, -24.4, 1.7, 0, TAU);
    ctx.fill();
  }

  // Sharp Glowing Visor Eyes (following facing direction)
  const ex = Math.cos(la) * 1.4;
  const ey = Math.sin(la) * 0.9;
  ctx.fillStyle = isSiren ? '#67e8f9' : isVoid ? '#f0abfc' : enraged ? '#fb7185' : '#fde047';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(ex + s * 1.1, -16.8 + ey);
    ctx.lineTo(ex + s * 3.6, -17.9 + ey);
    ctx.lineTo(ex + s * 3.1, -16.2 + ey);
    ctx.closePath();
    ctx.fill();
  }

  // 6. Epic Held Sovereign Boss Weapon + Luminous Cleave Arc
  const swOffset =
    b.attackAnim && b.attackAnim > 0
      ? Math.sin(atkProg * Math.PI) * 1.65 - 0.58
      : windup + Math.sin(b.phase * 1.1) * 0.08;
  const weaponAng = la + swOffset;

  ctx.save();
  ctx.rotate(weaponAng);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.3;

  // Armored Gauntlet
  ctx.fillStyle = flash ? '#fff' : trimGold;
  ctx.beginPath();
  ctx.arc(10.0, 0, 3.3, 0, TAU);
  ctx.fill();
  ctx.stroke();

  if (isVoid) {
    // 虚空魔皇 · 双月星界终焉镰刀（星璇核心 + 蚀刻双刃 + 浮空星尘尾刃）
    const vShaft = ctx.createLinearGradient(-18, 0, 32, 0);
    vShaft.addColorStop(0, '#312e81');
    vShaft.addColorStop(0.6, '#1e1b4b');
    vShaft.addColorStop(1, '#c084fc');
    ctx.fillStyle = flash ? '#fff' : vShaft;
    ctx.beginPath();
    ctx.roundRect(-17, -1.9, 48, 3.8, 1.6);
    ctx.fill();
    ctx.stroke();

    // 剑柄尾端星芒晶棘
    ctx.fillStyle = flash ? '#fff' : '#f0abfc';
    ctx.beginPath();
    ctx.moveTo(-17, -3.2);
    ctx.lineTo(-27, 0);
    ctx.lineTo(-17, 3.2);
    ctx.lineTo(-14, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 镰颈旋转暗星法阵环
    ctx.save();
    ctx.translate(26, 0);
    ctx.rotate(gameTime * 2.8);
    ctx.strokeStyle = '#f0abfc';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 5.8, 0, TAU);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#e879f9';
    ctx.beginPath();
    ctx.arc(26, 0, 2.5, 0, TAU);
    ctx.fill();

    // 主弧形虚空星月刃 + 内弧炽白刃线
    const vGrad = ctx.createLinearGradient(14, -27, 44, 6);
    vGrad.addColorStop(0, '#ffffff');
    vGrad.addColorStop(0.35, '#f0abfc');
    vGrad.addColorStop(0.75, '#7e22ce');
    vGrad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = flash ? '#fff' : vGrad;
    ctx.beginPath();
    ctx.moveTo(28, -2.0);
    ctx.quadraticCurveTo(48, -14, 34, -29);
    ctx.quadraticCurveTo(22, -28, 10, -18);
    ctx.quadraticCurveTo(28, -16, 25, 3.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 副反手弧刃
    ctx.fillStyle = flash ? '#fff' : '#a855f7';
    ctx.beginPath();
    ctx.moveTo(27, 2.2);
    ctx.quadraticCurveTo(36, 10, 25, 14);
    ctx.quadraticCurveTo(27, 7, 23, 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (isDemon) {
    // 炼狱炎魔 · 龙骨焚天巨剑（黑曜龙脊剑柄 + 炽焰龙翼护手 + 熔核裂隙巨刃）
    ctx.fillStyle = flash ? '#fff' : '#450a0a';
    ctx.beginPath();
    ctx.roundRect(-15, -2.0, 24, 4.0, 1.5);
    ctx.fill();
    ctx.stroke();
    // 龙炎尾锤
    ctx.fillStyle = flash ? '#fff' : '#fbbf24';
    ctx.beginPath();
    ctx.arc(-16.5, 0, 3.1, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // 双翼龙角护手
    ctx.fillStyle = flash ? '#fff' : '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(8, -11.5);
    ctx.quadraticCurveTo(16, -8, 14.5, -2.5);
    ctx.lineTo(14.5, 2.5);
    ctx.quadraticCurveTo(16, 8, 8, 11.5);
    ctx.lineTo(6.5, 4.5);
    ctx.lineTo(6.5, -4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 宽厚熔核裂焰巨剑刃
    const dBlade = ctx.createLinearGradient(13, -6, 52, 6);
    dBlade.addColorStop(0, '#7f1d1d');
    dBlade.addColorStop(0.45, '#ef4444');
    dBlade.addColorStop(0.82, '#fb923c');
    dBlade.addColorStop(1, '#fef08a');
    ctx.fillStyle = flash ? '#fff' : dBlade;
    ctx.beginPath();
    ctx.moveTo(13, -5.0);
    ctx.lineTo(42, -3.6);
    ctx.lineTo(52, 0);
    ctx.lineTo(42, 3.6);
    ctx.lineTo(13, 5.0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 剑脊熔金血槽亮线
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(44, 0);
    ctx.stroke();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.3;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(11.5, 0, 2.5, 0, TAU);
    ctx.fill();
  } else if (isSiren) {
    // 沧溟海妖 · 渊蓝晶魄三叉戟（海王冠护手 + 三棱晶刺 + 浮游寒珠）
    ctx.fillStyle = flash ? '#fff' : '#0c4a6e';
    ctx.beginPath();
    ctx.roundRect(-15, -1.7, 42, 3.4, 1.4);
    ctx.fill();
    ctx.stroke();

    // 黄金海冠横轭
    ctx.fillStyle = flash ? '#fff' : '#bae6fd';
    ctx.beginPath();
    ctx.moveTo(22, -10.5);
    ctx.quadraticCurveTo(28, -4, 27, 0);
    ctx.quadraticCurveTo(28, 4, 22, 10.5);
    ctx.lineTo(19, 5.5);
    ctx.lineTo(19, -5.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 中心寒晶主戟
    const sGrad = ctx.createLinearGradient(25, -4, 51, 4);
    sGrad.addColorStop(0, '#38bdf8');
    sGrad.addColorStop(0.55, '#e0f2fe');
    sGrad.addColorStop(1, '#ffffff');
    ctx.fillStyle = flash ? '#fff' : sGrad;
    ctx.beginPath();
    ctx.moveTo(26, -3.0);
    ctx.lineTo(44, -1.8);
    ctx.lineTo(51, 0);
    ctx.lineTo(44, 1.8);
    ctx.lineTo(26, 3.0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 两侧弧形海晶副戟
    ctx.fillStyle = flash ? '#fff' : '#7dd3fc';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(23, s * 5.2);
      ctx.quadraticCurveTo(33, s * 13.5, 43.5, s * 6.8);
      ctx.quadraticCurveTo(34, s * 7.8, 25, s * 2.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(24.5, 0, 2.4, 0, TAU);
    ctx.fill();
  } else if (isTreant) {
    // 世界树守望 · 翠脉古木月牙圣戟（缠藤古枝 + 日轮翡翠晶核 + 月牙长刃）
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.roundRect(-14, -1.9, 41, 3.8, 1.4);
    ctx.fill();
    ctx.stroke();
    // 缠绕生机藤蔓金纹
    ctx.strokeStyle = '#bef264';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-4, -1.8);
    ctx.quadraticCurveTo(6, 2.6, 16, -1.8);
    ctx.stroke();
    ctx.strokeStyle = ink;

    const gGrad = ctx.createLinearGradient(22, -14, 49, 12);
    gGrad.addColorStop(0, '#fef08a');
    gGrad.addColorStop(0.45, '#4ade80');
    gGrad.addColorStop(1, '#14532d');
    ctx.fillStyle = flash ? '#fff' : gGrad;
    ctx.beginPath();
    ctx.moveTo(24, -2.5);
    ctx.quadraticCurveTo(36, -15, 50, -2.5);
    ctx.quadraticCurveTo(39, 7.5, 24, 3.0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#bef264';
    ctx.beginPath();
    ctx.arc(25, 0, 2.6, 0, TAU);
    ctx.fill();
  } else {
    // 帝国圣辉 / 泰坦 / 试炼统帅 · 苍穹圣辉龙戟巨剑
    const shaftGrad = ctx.createLinearGradient(-15, 0, 28, 0);
    shaftGrad.addColorStop(0, '#78350f');
    shaftGrad.addColorStop(0.6, '#d97706');
    shaftGrad.addColorStop(1, '#fef08a');
    ctx.fillStyle = flash ? '#fff' : shaftGrad;
    ctx.beginPath();
    ctx.roundRect(-15, -1.85, 42, 3.7, 1.4);
    ctx.fill();
    ctx.stroke();

    // 天使展翼黄金十字护手
    ctx.fillStyle = flash ? '#fff' : trimGold;
    ctx.beginPath();
    ctx.moveTo(22, -11.2);
    ctx.lineTo(28.5, -3.4);
    ctx.lineTo(28.5, 3.4);
    ctx.lineTo(22, 11.2);
    ctx.lineTo(19.5, 6.4);
    ctx.lineTo(19.5, -6.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 圣辉白金棱面主剑锋
    const tGrad = ctx.createLinearGradient(26, -3.5, 52, 3.5);
    tGrad.addColorStop(0, trimGold);
    tGrad.addColorStop(0.45, '#ffffff');
    tGrad.addColorStop(0.8, coreColor);
    tGrad.addColorStop(1, '#fef9c3');
    ctx.fillStyle = flash ? '#fff' : tGrad;
    ctx.beginPath();
    ctx.moveTo(26.5, -3.6);
    ctx.lineTo(43.5, -2.2);
    ctx.lineTo(52, 0);
    ctx.lineTo(43.5, 2.2);
    ctx.lineTo(26.5, 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 剑身圣光脊线
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(47, 0);
    ctx.stroke();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.3;

    // 两侧圣翼戟锋
    ctx.fillStyle = flash ? '#fff' : trimGold;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(24.5, s * 5.6);
      ctx.quadraticCurveTo(33.5, s * 13.5, 42, s * 7.2);
      ctx.quadraticCurveTo(33, s * 8.2, 26.5, s * 2.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 耀金圣晶核
    ctx.fillStyle = coreColor;
    ctx.beginPath();
    ctx.arc(27, 0, 2.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(27, 0, 1.1, 0, TAU);
    ctx.fill();
  }

  // Boss Weapon Cleave Arc on Attack Animation (暗黑外缘 + 主色斩弧 + 炽白锋芒)
  if (b.attackAnim && b.attackAnim > 0) {
    ctx.strokeStyle = '#0f071a';
    ctx.lineWidth = 8.0;
    ctx.globalAlpha = clamp(1 - atkProg * 0.72, 0.2, 0.75);
    ctx.beginPath();
    ctx.arc(8, 0, 41, -1.05, 1.05);
    ctx.stroke();
    ctx.strokeStyle = coreColor;
    ctx.lineWidth = 4.6;
    ctx.globalAlpha = clamp(1 - atkProg * 0.65, 0.28, 0.96);
    ctx.beginPath();
    ctx.arc(8, 0, 41, -1.0, 1.0);
    ctx.stroke();
    ctx.strokeStyle = '#fef9c3';
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.arc(8, 0, 44, -0.82, 0.82);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Boss Active Shield Bubble
  if (b.shieldHp > 0) {
    ctx.strokeStyle = b.reflectRatio > 0 ? '#f43f5e' : '#38bdf8';
    ctx.fillStyle = b.reflectRatio > 0 ? 'rgba(244,63,94,0.16)' : 'rgba(56,189,248,0.16)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, -4, 24, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();

  // Overhead Boss Label + Enrage/Shield Indicator
  const labelY = sy - 38 * sc;
  ctx.font = '900 13px system-ui,sans-serif';
  ctx.textAlign = 'center';
  const bLabel = `${b.name} Lv.${b.level}${enraged ? ' 🔥' : ''}${b.shieldHp > 0 ? ' 🛡' : ''}`;
  ctx.fillStyle = 'rgba(0,0,0,.86)';
  ctx.fillText(bLabel, sx + 1, labelY + 1);
  ctx.fillStyle = b.shieldHp > 0 ? '#7dd3fc' : enraged ? '#fb7185' : '#fde68a';
  ctx.fillText(bLabel, sx, labelY);
}

const MINI_PAD = 32;
let minimapTerrainCanvas: HTMLCanvasElement | null = null;
let minimapTerrainKey: string | null = null;

function ensureMinimapTerrain(world: WorldData): HTMLCanvasElement {
  const key = `${world.worldId}:${world.width}x${world.height}:${world.seed}:${world.dungeonFloor ?? 0}`;
  if (minimapTerrainCanvas && minimapTerrainKey === key) {
    return minimapTerrainCanvas;
  }
  const w = world.width;
  const h = world.height;
  const isW2 = world.worldId === 'world2';
  const isCity = world.worldId === 'grand_city';
  const isDungeon = world.worldId === 'dungeon';
  const c = minimapTerrainCanvas ?? document.createElement('canvas');
  c.width = w + MINI_PAD * 2;
  c.height = h + MINI_PAD * 2;
  const g = c.getContext('2d')!;
  g.fillStyle = '#070b10';
  g.fillRect(0, 0, c.width, c.height);
  for (let ty = 0; ty < h; ty++) {
    const row = world.tiles[ty];
    for (let tx = 0; tx < w; tx++) {
      const t = row[tx];
      const up = ty > 0 ? world.tiles[ty - 1][tx] : t;
      const dn = ty < h - 1 ? world.tiles[ty + 1][tx] : t;
      const lf = tx > 0 ? row[tx - 1] : t;
      const rt = tx < w - 1 ? row[tx + 1] : t;
      const touchesWater = up === T_WATER || dn === T_WATER || lf === T_WATER || rt === T_WATER;
      const deepWater = up === T_WATER && dn === T_WATER && lf === T_WATER && rt === T_WATER;

      let col = isDungeon ? '#1e1b4b' : isW2 ? '#3b1c2a' : isCity ? '#316b3b' : '#2f5e32';
      if (t === T_WATER) {
        col = isW2 || isDungeon ? (deepWater ? '#581c87' : '#7e22ce') : deepWater ? '#163859' : '#296594';
      } else if (t === T_TREE) {
        col = isW2 ? '#581c2e' : '#173a1e';
      } else if (t === T_ROCK) {
        col = isDungeon ? '#312e81' : isW2 ? '#29213c' : '#4b5563';
      } else if (t === T_SAND) {
        col = touchesWater
          ? '#e2e8f0'
          : isDungeon
          ? '#4338ca'
          : isW2
          ? '#8a6956'
          : isCity
          ? '#e7d5a8'
          : '#c7ad6f';
      } else if (t === T_DIRT) {
        col = isW2 ? '#784835' : '#967047';
      } else if (touchesWater) {
        col = isW2 ? '#4d2738' : '#3a7241';
      }
      g.fillStyle = col;
      g.fillRect(tx + MINI_PAD, ty + MINI_PAD, 1, 1);
    }
  }
  minimapTerrainCanvas = c;
  minimapTerrainKey = key;
  return c;
}

let minimapFogCanvas: HTMLCanvasElement | null = null;
let minimapFogKey: string | null = null;
let minimapFogRevision = -1;

function ensureMinimapFogCanvas(
  world: WorldData,
  fogBitmap: Uint8Array,
  fogRevision: number
): HTMLCanvasElement {
  const key = `${world.worldId}:${world.width}x${world.height}:${world.seed}:${world.dungeonFloor ?? 0}`;
  const fullW = world.width + MINI_PAD * 2;
  const fullH = world.height + MINI_PAD * 2;
  if (
    minimapFogCanvas &&
    minimapFogKey === key &&
    minimapFogRevision === fogRevision &&
    minimapFogCanvas.width === fullW &&
    minimapFogCanvas.height === fullH
  ) {
    return minimapFogCanvas;
  }
  const c = minimapFogCanvas ?? document.createElement('canvas');
  c.width = fullW;
  c.height = fullH;
  const g = c.getContext('2d')!;
  const img = g.createImageData(fullW, fullH);
  const data = img.data;
  const mw = world.width;
  const mh = world.height;

  // 外围边界统一暗色遮蔽
  for (let y = 0; y < fullH; y++) {
    const ty = y - MINI_PAD;
    const rowOff = y * fullW;
    for (let x = 0; x < fullW; x++) {
      const tx = x - MINI_PAD;
      const p = (rowOff + x) * 4;
      if (tx < 0 || ty < 0 || tx >= mw || ty >= mh) {
        data[p] = 7;
        data[p + 1] = 11;
        data[p + 2] = 16;
        data[p + 3] = 255;
        continue;
      }
      const idx = ty * mw + tx;
      if (fogBitmap[idx] !== 0) {
        data[p + 3] = 0;
        continue;
      }
      // 与已探索区域相邻的边缘格使用半透明过渡灰雾
      const nearExplored =
        (tx > 0 && fogBitmap[idx - 1] !== 0) ||
        (tx < mw - 1 && fogBitmap[idx + 1] !== 0) ||
        (ty > 0 && fogBitmap[idx - mw] !== 0) ||
        (ty < mh - 1 && fogBitmap[idx + mw] !== 0);
      data[p] = 44;
      data[p + 1] = 51;
      data[p + 2] = 63;
      data[p + 3] = nearExplored ? 150 : 226;
    }
  }
  g.putImageData(img, 0, 0);
  minimapFogCanvas = c;
  minimapFogKey = key;
  minimapFogRevision = fogRevision;
  return c;
}

export function drawMinimap(
  miniCtx: CanvasRenderingContext2D,
  world: WorldData,
  player: PlayerEntity,
  mobs: MobEntity[],
  boss: BossEntity | null,
  remotePlayers?: RemotePlayerEntity[],
  fogBitmap?: Uint8Array,
  fogRevision = 0
): void {
  const S = 156;
  const R = MINI_PAD;
  const cell = S / (R * 2);
  miniCtx.fillStyle = '#070b10';
  miniCtx.fillRect(0, 0, S, S);

  const ptx = Math.floor(player.x / TILE);
  const pty = Math.floor(player.y / TILE);
  const mw = world.width;
  const mh = world.height;
  const isTileExplored = (tx: number, ty: number) =>
    !fogBitmap || (tx >= 0 && ty >= 0 && tx < mw && ty < mh && fogBitmap[ty * mw + tx] !== 0);

  const terrain = ensureMinimapTerrain(world);
  miniCtx.imageSmoothingEnabled = false;
  miniCtx.drawImage(terrain, ptx, pty, R * 2, R * 2, 0, 0, S, S);

  for (const c of world.chests) {
    if (c.opened) continue;
    if (!isTileExplored(c.tx, c.ty)) continue;
    const dx = c.tx - ptx;
    const dy = c.ty - pty;
    if (Math.abs(dx) >= R || Math.abs(dy) >= R) continue;
    miniCtx.fillStyle = '#fbbf24';
    miniCtx.fillRect((dx + R) * cell, (dy + R) * cell, cell, cell);
  }

  if (world.safeRadius > 0) {
    const cx = world.spawnX / TILE - ptx;
    const cy = world.spawnY / TILE - pty;
    const rTiles = world.safeRadius / TILE;
    miniCtx.strokeStyle = 'rgba(52,211,153,0.4)';
    miniCtx.lineWidth = 1;
    miniCtx.beginPath();
    miniCtx.arc((cx + R) * cell, (cy + R) * cell, rTiles * cell, 0, TAU);
    miniCtx.stroke();
  }

  const drawPin = (x: number, y: number, color: string, requireExplored = false) => {
    if (x < -500 || y < -500) return;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (requireExplored && !isTileExplored(tx, ty)) return;
    const dx = x / TILE - ptx;
    const dy = y / TILE - pty;
    if (Math.abs(dx) < R && Math.abs(dy) < R) {
      miniCtx.fillStyle = color;
      miniCtx.fillRect((dx + R) * cell - 1, (dy + R) * cell - 1, cell + 2, cell + 2);
    }
  };
  drawPin(world.merchant.x, world.merchant.y, '#a78bfa', true);
  drawPin(world.elder.x, world.elder.y, '#2dd4bf', true);
  drawPin(world.awakening.x, world.awakening.y, '#38bdf8', true);
  drawPin(world.blacksmith.x, world.blacksmith.y, '#fb923c', true);
  drawPin(world.armorer.x, world.armorer.y, '#60a5fa', true);
  drawPin(world.upgrader.x, world.upgrader.y, '#e879f9', true);
  drawPin(world.altar.x, world.altar.y, '#818cf8', true);
  if (world.dungeonGate) drawPin(world.dungeonGate.x, world.dungeonGate.y, '#c084fc', true);
  if (world.socialBoard) drawPin(world.socialBoard.x, world.socialBoard.y, '#fde047', true);

  for (const sp of world.signposts) {
    const tx = Math.floor(sp.x / TILE);
    const ty = Math.floor(sp.y / TILE);
    if (!isTileExplored(tx, ty)) continue;
    const dx = sp.x / TILE - ptx;
    const dy = sp.y / TILE - pty;
    if (Math.abs(dx) < R && Math.abs(dy) < R) {
      miniCtx.fillStyle = '#fde68a';
      miniCtx.fillRect((dx + R) * cell, (dy + R) * cell, 2, 2);
    }
  }

  drawPin(world.portal.x, world.portal.y, '#f472b6', true);

  for (const arena of world.bossArenas) {
    if (!isTileExplored(arena.tx, arena.ty)) continue;
    const dx = arena.tx - ptx;
    const dy = arena.ty - pty;
    if (Math.abs(dx) < R && Math.abs(dy) < R) {
      miniCtx.strokeStyle = '#fb7185';
      miniCtx.lineWidth = 1.5;
      miniCtx.beginPath();
      miniCtx.arc((dx + R) * cell, (dy + R) * cell, 4, 0, TAU);
      miniCtx.stroke();
    }
  }

  for (const m of mobs) {
    const mtx = Math.floor(m.x / TILE);
    const mty = Math.floor(m.y / TILE);
    if (!isTileExplored(mtx, mty)) continue;
    const dx = m.x / TILE - ptx;
    const dy = m.y / TILE - pty;
    if (Math.abs(dx) >= R || Math.abs(dy) >= R) continue;
    miniCtx.fillStyle = '#ef4444';
    miniCtx.fillRect((dx + R) * cell - 1, (dy + R) * cell - 1, cell + 2, cell + 2);
  }

  if (boss) {
    const btx = Math.floor(boss.x / TILE);
    const bty = Math.floor(boss.y / TILE);
    if (isTileExplored(btx, bty)) {
      const dx = boss.x / TILE - ptx;
      const dy = boss.y / TILE - pty;
      if (Math.abs(dx) < R && Math.abs(dy) < R) {
        miniCtx.fillStyle = '#f43f5e';
        miniCtx.beginPath();
        miniCtx.arc((dx + R) * cell, (dy + R) * cell, 4.5, 0, TAU);
        miniCtx.fill();
        miniCtx.strokeStyle = '#fff';
        miniCtx.lineWidth = 1.5;
        miniCtx.stroke();
      }
    }
  }

  // 战争迷雾灰度遮罩：未探索区域呈灰暗迷雾，已探索区域完全清晰可见
  if (fogBitmap && fogBitmap.length >= mw * mh) {
    const fogOverlay = ensureMinimapFogCanvas(world, fogBitmap, fogRevision);
    miniCtx.imageSmoothingEnabled = false;
    miniCtx.drawImage(fogOverlay, ptx, pty, R * 2, R * 2, 0, 0, S, S);
  }

  // 队友与联机玩家位置保持可见，方便协作汇合
  if (remotePlayers) {
    for (const rp of remotePlayers) {
      const rtx = Math.floor(rp.x / TILE);
      const rty = Math.floor(rp.y / TILE);
      if (!rp.inParty && !rp.isFriend && !isTileExplored(rtx, rty)) continue;
      const dx = rp.x / TILE - ptx;
      const dy = rp.y / TILE - pty;
      if (Math.abs(dx) >= R || Math.abs(dy) >= R) continue;
      miniCtx.fillStyle = rp.inParty ? '#4ade80' : rp.isFriend ? '#fbbf24' : '#7dd3fc';
      miniCtx.beginPath();
      miniCtx.arc((dx + R) * cell, (dy + R) * cell, 3, 0, TAU);
      miniCtx.fill();
    }
  }

  // 玩家探测半径微光圈 + 中心坐标点
  miniCtx.strokeStyle = 'rgba(56,189,248,0.28)';
  miniCtx.lineWidth = 1;
  miniCtx.beginPath();
  miniCtx.arc(S / 2, S / 2, 12 * cell, 0, TAU);
  miniCtx.stroke();

  miniCtx.fillStyle = '#38bdf8';
  miniCtx.beginPath();
  miniCtx.arc(S / 2, S / 2, 3.4, 0, TAU);
  miniCtx.fill();
  miniCtx.strokeStyle = '#fff';
  miniCtx.lineWidth = 1.5;
  miniCtx.stroke();
}

export interface FullWorldMapLayers {
  showRegions: boolean;
  showNpcs: boolean;
  showBosses: boolean;
  showChests: boolean;
  showSignposts: boolean;
  showMobs: boolean;
}

export interface FullWorldMapRenderState {
  playerX: number;
  playerY: number;
  playerAng: number;
  mobs: { x: number; y: number }[];
  boss: { x: number; y: number; name: string; fixedBossId: string } | null;
  bossCooldowns: Record<string, number>;
  friends?: FriendEntry[];
  remotePlayers?: RemotePlayerEntity[];
  zoom: number;
  panX: number;
  panY: number;
  layers: FullWorldMapLayers;
  selectedTx?: number | null;
  selectedTy?: number | null;
}

export function drawFullWorldMap(
  canvas: HTMLCanvasElement,
  world: WorldData,
  state: FullWorldMapRenderState
): { viewOriginX: number; viewOriginY: number; scale: number } {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { viewOriginX: 0, viewOriginY: 0, scale: 1 };
  const w = canvas.width;
  const h = canvas.height;
  const mw = world.width;
  const mh = world.height;
  const size = Math.min(w, h);
  const scale = (size / Math.max(mw, mh)) * state.zoom;
  const mapPxW = mw * scale;
  const mapPxH = mh * scale;
  const viewOriginX = (w - mapPxW) / 2 + state.panX;
  const viewOriginY = (h - mapPxH) / 2 + state.panY;

  ctx.fillStyle = '#060a10';
  ctx.fillRect(0, 0, w, h);

  const terrain = ensureMinimapTerrain(world);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrain, MINI_PAD, MINI_PAD, mw, mh, viewOriginX, viewOriginY, mapPxW, mapPxH);
  ctx.restore();

  const toCanvasX = (tx: number) => viewOriginX + tx * scale;
  const toCanvasY = (ty: number) => viewOriginY + ty * scale;

  ctx.save();
  ctx.strokeStyle = 'rgba(148,163,184,0.12)';
  ctx.lineWidth = 1;
  for (let g = 25; g < mw; g += 25) {
    const gx = toCanvasX(g);
    ctx.beginPath();
    ctx.moveTo(gx, viewOriginY);
    ctx.lineTo(gx, viewOriginY + mapPxH);
    ctx.stroke();
  }
  for (let g = 25; g < mh; g += 25) {
    const gy = toCanvasY(g);
    ctx.beginPath();
    ctx.moveTo(viewOriginX, gy);
    ctx.lineTo(viewOriginX + mapPxW, gy);
    ctx.stroke();
  }

  if (world.safeRadius > 0) {
    const spawnTx = world.spawnX / TILE;
    const spawnTy = world.spawnY / TILE;
    const safeR = (world.safeRadius / TILE) * scale;
    const safeGrad = ctx.createRadialGradient(
      toCanvasX(spawnTx),
      toCanvasY(spawnTy),
      safeR * 0.25,
      toCanvasX(spawnTx),
      toCanvasY(spawnTy),
      safeR
    );
    safeGrad.addColorStop(0, 'rgba(56,189,248,0.08)');
    safeGrad.addColorStop(1, 'rgba(52,211,153,0.18)');
    ctx.fillStyle = safeGrad;
    ctx.beginPath();
    ctx.arc(toCanvasX(spawnTx), toCanvasY(spawnTy), safeR, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = 'rgba(52,211,153,0.65)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(toCanvasX(spawnTx), toCanvasY(spawnTy), safeR, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (state.layers.showChests) {
    for (const c of world.chests) {
      if (c.opened) continue;
      const cx = toCanvasX(c.tx + 0.5);
      const cy = toCanvasY(c.ty + 0.5);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx - 4, cy - 4, 8, 8);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(cx - 2.8, cy - 2.8, 5.6, 5.6);
    }
  }

  if (state.layers.showSignposts) {
    for (const sp of world.signposts) {
      const sx = toCanvasX(sp.x / TILE);
      const sy = toCanvasY(sp.y / TILE);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-4.2, -4.2, 8.4, 8.4);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    }
  }

  if (state.layers.showMobs) {
    ctx.fillStyle = 'rgba(248,113,113,0.88)';
    for (const m of state.mobs) {
      const mx = toCanvasX(m.x / TILE);
      const my = toCanvasY(m.y / TILE);
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(2.2, scale * 0.65), 0, TAU);
      ctx.fill();
    }
  }

  if (state.layers.showBosses) {
    for (const arena of world.bossArenas) {
      const ax = toCanvasX(arena.tx);
      const ay = toCanvasY(arena.ty);
      const isSpawned = state.boss?.fixedBossId === arena.id;
      const cd = Math.ceil(state.bossCooldowns[arena.id] ?? 0);

      ctx.fillStyle = isSpawned ? 'rgba(244,63,94,0.34)' : 'rgba(244,63,94,0.16)';
      ctx.beginPath();
      ctx.arc(ax, ay, Math.max(10, 7.5 * scale), 0, TAU);
      ctx.fill();

      ctx.strokeStyle = isSpawned ? '#fb7185' : 'rgba(251,113,133,0.8)';
      ctx.lineWidth = isSpawned ? 2.4 : 1.6;
      ctx.beginPath();
      ctx.arc(ax, ay, Math.max(10, 7.5 * scale), 0, TAU);
      ctx.stroke();

      ctx.fillStyle = isSpawned ? '#f43f5e' : '#be123c';
      ctx.beginPath();
      ctx.arc(ax, ay, 5.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#fff1f2';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.font = '700 11px system-ui,sans-serif';
      ctx.textAlign = 'center';
      const label = cd > 0 ? `${arena.name} (${cd}s)` : arena.name;
      ctx.fillStyle = 'rgba(6,10,16,0.92)';
      ctx.fillText(label, ax + 1, ay - 12);
      ctx.fillStyle = '#fda4af';
      ctx.fillText(label, ax, ay - 13);
    }

    if (state.boss) {
      const bx = toCanvasX(state.boss.x / TILE);
      const by = toCanvasY(state.boss.y / TILE);
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, 8.5, 0, TAU);
      ctx.stroke();
    }
  }

  if (state.layers.showNpcs) {
    const meta = WORLD_META[world.worldId];
    const npcPins: { x: number; y: number; color: string; short: string; r?: number }[] = [
      { x: world.awakening.x, y: world.awakening.y, color: '#38bdf8', short: '觉醒' },
      { x: world.elder.x, y: world.elder.y, color: '#2dd4bf', short: '长老' },
      { x: world.merchant.x, y: world.merchant.y, color: '#a78bfa', short: '补给' },
      { x: world.blacksmith.x, y: world.blacksmith.y, color: '#fb923c', short: '铁匠' },
      { x: world.armorer.x, y: world.armorer.y, color: '#60a5fa', short: '军械' },
      { x: world.upgrader.x, y: world.upgrader.y, color: '#e879f9', short: '强化' },
      { x: world.altar.x, y: world.altar.y, color: '#818cf8', short: '祭坛' },
      { x: world.portal.x, y: world.portal.y, color: '#f472b6', short: meta.portalLabel.slice(0, 4), r: 5.5 },
    ];
    if (world.dungeonGate) {
      npcPins.push({ x: world.dungeonGate.x, y: world.dungeonGate.y, color: '#c084fc', short: '试炼塔', r: 6 });
    }
    if (world.socialBoard) {
      npcPins.push({ x: world.socialBoard.x, y: world.socialBoard.y, color: '#fde047', short: '公会榜', r: 4.5 });
    }

    for (const pin of npcPins) {
      if (pin.x < -500 || pin.y < -500) continue;
      const px = toCanvasX(pin.x / TILE);
      const py = toCanvasY(pin.y / TILE);
      const pr = pin.r ?? 4;
      ctx.fillStyle = '#090f19';
      ctx.beginPath();
      ctx.arc(px, py, pr + 1.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = pin.color;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.fill();

      if (state.zoom >= 1.2 || pin.short === '试炼塔' || pin.short === '长老' || pin.short === '觉醒') {
        ctx.font = '700 10px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(6,10,16,0.92)';
        ctx.fillText(pin.short, px + 1, py - pr - 4);
        ctx.fillStyle = pin.color;
        ctx.fillText(pin.short, px, py - pr - 5);
      }
    }
  }

  // Live Online Friends & Party Mates on Full World Map
  if (state.friends) {
    for (const f of state.friends) {
      if (!f.online || f.worldId !== world.worldId || f.x == null || f.y == null) continue;
      const fx = toCanvasX(f.x / TILE);
      const fy = toCanvasY(f.y / TILE);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(fx, fy, 5.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.font = '800 10px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(6,10,16,0.9)';
      ctx.fillText(`★ ${f.name}`, fx + 1, fy - 9);
      ctx.fillStyle = '#fde68a';
      ctx.fillText(`★ ${f.name}`, fx, fy - 10);
    }
  }

  if (state.layers.showRegions) {
    for (const reg of world.regions) {
      const isCity = reg.kind === 'city';
      const labelTy = isCity ? reg.ty - (world.safeRadius / TILE) * 0.85 : reg.ty;
      const rx = toCanvasX(reg.tx);
      const ry = toCanvasY(labelTy);
      const showSub = state.zoom >= 1.35 && !isCity;
      const titleText =
        state.zoom < 1.35 && reg.danger && !isCity ? `${reg.name} (${reg.danger})` : reg.name;

      ctx.font = '800 12px system-ui,sans-serif';
      const tw = ctx.measureText(titleText).width;
      ctx.font = '600 10px system-ui,sans-serif';
      const sw = showSub ? ctx.measureText(reg.subtitle).width : 0;
      const pillW = Math.max(tw, sw) + 14;
      const pillH = showSub ? 30 : 18;

      ctx.fillStyle = 'rgba(6,10,18,0.72)';
      ctx.beginPath();
      ctx.roundRect(rx - pillW / 2, ry - 12, pillW, pillH, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148,163,184,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = '800 12px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle =
        reg.kind === 'city'
          ? '#67e8f9'
          : reg.kind === 'water'
          ? '#93c5fd'
          : reg.kind === 'mountain'
          ? '#fda4af'
          : reg.kind === 'plains'
          ? '#fde68a'
          : '#86efac';
      ctx.fillText(titleText, rx, ry + 1);

      if (showSub) {
        ctx.font = '600 10px system-ui,sans-serif';
        ctx.fillStyle = 'rgba(226,232,240,0.84)';
        ctx.fillText(reg.subtitle, rx, ry + 14);
      }
    }
  }

  if (state.selectedTx != null && state.selectedTy != null) {
    const sx = toCanvasX(state.selectedTx);
    const sy = toCanvasY(state.selectedTy);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 12, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx - 16, sy);
    ctx.lineTo(sx - 8, sy);
    ctx.moveTo(sx + 8, sy);
    ctx.lineTo(sx + 16, sy);
    ctx.moveTo(sx, sy - 16);
    ctx.lineTo(sx, sy - 8);
    ctx.moveTo(sx, sy + 8);
    ctx.lineTo(sx, sy + 16);
    ctx.stroke();
  }

  const plx = toCanvasX(state.playerX / TILE);
  const ply = toCanvasY(state.playerY / TILE);
  ctx.fillStyle = 'rgba(56,189,248,0.28)';
  ctx.beginPath();
  ctx.moveTo(plx, ply);
  ctx.arc(plx, ply, 18, state.playerAng - 0.45, state.playerAng + 0.45);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(plx, ply, 5.2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(148,163,184,0.45)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(viewOriginX, viewOriginY, mapPxW, mapPxH);
  ctx.restore();

  return { viewOriginX, viewOriginY, scale };
}
