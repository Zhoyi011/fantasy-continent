import { WORLD_META } from '../game/rules';
import type { WorldId, WorldRegionLabel } from '../game/types';
import type {
  AltarEntity,
  ChestEntity,
  DecoEntity,
  DungeonGateEntity,
  FixedBossArena,
  NpcEntity,
  PortalEntity,
  SignpostEntity,
  SocialBoardEntity,
  TorchEntity,
} from './entities';

export const TILE = 32;
export const WW = 210;
export const WH = 210;
export const W_PX = WW * TILE;
export const H_PX = WH * TILE;

export const T_GRASS = 0;
export const T_WATER = 1;
export const T_TREE = 2;
export const T_ROCK = 3;
export const T_SAND = 4;
export const T_DIRT = 5;

export const WATER_SPEED_MULT = 0.55;
export const MAIN_CITY_SAFE_RADIUS = 500;

export const TAU = Math.PI * 2;

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function randi(a: number, b: number): number {
  return Math.floor(rand(a, b + 1));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

export function hash2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = h ^ (h >>> 13);
  h = Math.imul(h, 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

export function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(x: number, y: number, s: number): number {
  let v = 0;
  let amp = 1;
  let f = 1;
  let tot = 0;
  for (let i = 0; i < 4; i++) {
    v += vnoise(x * f, y * f, s + i * 137) * amp;
    tot += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / tot;
}

function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export interface WorldSpriteSet {
  imgs: HTMLCanvasElement[];
  base: Record<number, number>;
  dirtCount: number;
}

export interface TileSpriteAtlas extends WorldSpriteSet {
  byWorld: Record<WorldId, WorldSpriteSet>;
}

function buildSpritesForPalette(worldId: WorldId): WorldSpriteSet {
  const V = 5;
  const SPR_GRASS: HTMLCanvasElement[] = [];
  const SPR_WATER: HTMLCanvasElement[] = [];
  const SPR_SAND: HTMLCanvasElement[] = [];
  const SPR_ROCK: HTMLCanvasElement[] = [];
  const SPR_DIRT: HTMLCanvasElement[] = [];
  const isW2 = worldId === 'world2';
  const isCity = worldId === 'grand_city';
  const isDungeon = worldId === 'dungeon';

  // 草地 / 焦土 / 王城草坪 / 地下城地砖
  for (let v = 0; v < V; v++) {
    const c = mkCanvas(TILE, TILE);
    const g = c.getContext('2d')!;
    const hh = v / V;
    const grd = g.createLinearGradient(0, 0, 0, TILE);
    if (isDungeon) {
      grd.addColorStop(0, `hsl(${234 + hh * 10},${22 + hh * 6}%,${15 + hh * 5}%)`);
      grd.addColorStop(1, `hsl(${238 + hh * 10},${20 + hh * 6}%,${11 + hh * 4}%)`);
    } else if (isCity) {
      grd.addColorStop(0, `hsl(${114 + hh * 12},${34 + hh * 8}%,${29 + hh * 7}%)`);
      grd.addColorStop(1, `hsl(${118 + hh * 12},${30 + hh * 8}%,${23 + hh * 6}%)`);
    } else if (!isW2) {
      grd.addColorStop(0, `hsl(${100 + hh * 16},${30 + hh * 8}%,${27 + hh * 7}%)`);
      grd.addColorStop(1, `hsl(${104 + hh * 16},${28 + hh * 8}%,${21 + hh * 7}%)`);
    } else {
      grd.addColorStop(0, `hsl(${342 + hh * 14},${26 + hh * 10}%,${18 + hh * 6}%)`);
      grd.addColorStop(1, `hsl(${346 + hh * 14},${24 + hh * 8}%,${13 + hh * 5}%)`);
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, TILE, TILE);
    if (isDungeon) {
      g.strokeStyle = 'rgba(129,140,248,0.14)';
      g.lineWidth = 1;
      g.strokeRect(1, 1, TILE - 2, TILE - 2);
    } else {
      for (let i = 0; i < 5; i++) {
        const x = (hash2(v, i, 11) * TILE) | 0;
        const y = (hash2(v, i, 22) * TILE) | 0;
        g.fillStyle = !isW2
          ? `hsla(${106 + hh * 22},48%,${35 + hh * 12}%,.5)`
          : `hsla(${14 + hh * 22},68%,${42 + hh * 12}%,.36)`;
        g.fillRect(x, y, 2, 4);
        g.fillRect(x + 3, y - 2, 2, 6);
      }
    }
    g.fillStyle = 'rgba(0,0,0,.08)';
    for (let i = 0; i < 3; i++) {
      const x = (hash2(v, i, 33) * TILE) | 0;
      const y = (hash2(v, i, 44) * TILE) | 0;
      g.fillRect(x, y, 3, 2);
    }
    SPR_GRASS.push(c);
  }

  // 水 / 运河 / 魔泉
  for (let v = 0; v < V; v++) {
    const c = mkCanvas(TILE, TILE);
    const g = c.getContext('2d')!;
    const hh = v / V;
    const grd = g.createLinearGradient(0, 0, 0, TILE);
    if (isDungeon) {
      grd.addColorStop(0, `hsl(${265 + hh * 12},45%,${19 + hh * 6}%)`);
      grd.addColorStop(1, `hsl(${272 + hh * 12},40%,${13 + hh * 5}%)`);
    } else if (isCity) {
      grd.addColorStop(0, `hsl(${194 + hh * 8},56%,${27 + hh * 7}%)`);
      grd.addColorStop(1, `hsl(${198 + hh * 8},52%,${21 + hh * 6}%)`);
    } else if (!isW2) {
      grd.addColorStop(0, `hsl(${204 + hh * 10},48%,${22 + hh * 6}%)`);
      grd.addColorStop(1, `hsl(${208 + hh * 10},44%,${17 + hh * 6}%)`);
    } else {
      grd.addColorStop(0, `hsl(${276 + hh * 14},48%,${22 + hh * 7}%)`);
      grd.addColorStop(1, `hsl(${284 + hh * 14},44%,${15 + hh * 6}%)`);
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, TILE, TILE);
    g.strokeStyle = isW2 || isDungeon ? 'rgba(232,121,249,.24)' : 'rgba(150,210,255,.22)';
    g.lineWidth = 1.4;
    const yy = 6 + hh * 14;
    g.beginPath();
    g.moveTo(4, yy);
    g.quadraticCurveTo(16, yy - 3, 28, yy);
    g.stroke();
    SPR_WATER.push(c);
  }

  // 主城石板路 / 王城白金大道 / 大道砂石 / 试炼符文大道
  for (let v = 0; v < V; v++) {
    const c = mkCanvas(TILE, TILE);
    const g = c.getContext('2d')!;
    const hh = v / V;
    if (isDungeon) {
      g.fillStyle = `hsl(${245 + hh * 8},18%,${24 + hh * 6}%)`;
      g.fillRect(0, 0, TILE, TILE);
      g.strokeStyle = 'rgba(167,139,250,0.22)';
      g.strokeRect(2, 2, TILE - 4, TILE - 4);
    } else if (isCity) {
      g.fillStyle = `hsl(${44 + hh * 6},32%,${64 + hh * 7}%)`;
      g.fillRect(0, 0, TILE, TILE);
      g.strokeStyle = 'rgba(120,113,108,0.26)';
      g.lineWidth = 1;
      g.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(2, 2, TILE - 4, 3);
    } else {
      g.fillStyle = !isW2
        ? `hsl(${42 + hh * 8},34%,${54 + hh * 8}%)`
        : `hsl(${20 + hh * 10},16%,${32 + hh * 8}%)`;
      g.fillRect(0, 0, TILE, TILE);
      for (let i = 0; i < 7; i++) {
        const x = (hash2(v, i, 55) * TILE) | 0;
        const y = (hash2(v, i, 66) * TILE) | 0;
        g.fillStyle = !isW2
          ? `hsla(${38 + hh * 10},40%,${44 + hh * 10}%,.5)`
          : `hsla(${14 + hh * 10},40%,${22 + hh * 8}%,.55)`;
        g.fillRect(x, y, 2, 2);
      }
    }
    SPR_SAND.push(c);
  }

  // 岩石地 / 城墙 / 石柱
  for (let v = 0; v < V; v++) {
    const c = mkCanvas(TILE, TILE);
    const g = c.getContext('2d')!;
    const hh = v / V;
    g.fillStyle = isDungeon
      ? `hsl(245,16%,${19 + hh * 7}%)`
      : isCity
      ? `hsl(215,14%,${38 + hh * 8}%)`
      : !isW2
      ? `hsl(215,7%,${31 + hh * 9}%)`
      : `hsl(255,14%,${17 + hh * 7}%)`;
    g.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 4; i++) {
      const x = (hash2(v, i, 77) * TILE) | 0;
      const y = (hash2(v, i, 88) * TILE) | 0;
      g.fillStyle = isW2 || isDungeon
        ? `hsla(12,60%,${40 + hh * 12}%,.32)`
        : `hsla(215,10%,${45 + hh * 12}%,.5)`;
      g.beginPath();
      g.arc(x + 2, y + 2, 2 + hh * 2, 0, TAU);
      g.fill();
    }
    SPR_ROCK.push(c);
  }

  // 林间泥土小径 / 焦土路 / 王城石砖小道
  for (let v = 0; v < V; v++) {
    const c = mkCanvas(TILE, TILE);
    const g = c.getContext('2d')!;
    const hh = v / V;
    g.fillStyle = isDungeon
      ? `hsl(${252 + hh * 8},20%,${18 + hh * 5}%)`
      : isCity
      ? `hsl(${34 + hh * 8},28%,${38 + hh * 7}%)`
      : !isW2
      ? `hsl(${28 + hh * 8},26%,${19 + hh * 6}%)`
      : `hsl(${12 + hh * 8},24%,${15 + hh * 5}%)`;
    g.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 5; i++) {
      const x = (hash2(v, i, 99) * TILE) | 0;
      const y = (hash2(v, i, 111) * TILE) | 0;
      g.fillStyle = !isW2
        ? `hsla(${26 + hh * 10},30%,${26 + hh * 8}%,.6)`
        : `hsla(${16 + hh * 10},42%,${28 + hh * 8}%,.5)`;
      g.fillRect(x, y, 3, 2);
    }
    SPR_DIRT.push(c);
  }

  const imgs: HTMLCanvasElement[] = [];
  const base: Record<number, number> = {};
  base[T_GRASS] = imgs.length;
  SPR_GRASS.forEach((c) => imgs.push(c));
  base[T_WATER] = imgs.length;
  SPR_WATER.forEach((c) => imgs.push(c));
  base[T_SAND] = imgs.length;
  SPR_SAND.forEach((c) => imgs.push(c));
  base[T_ROCK] = imgs.length;
  SPR_ROCK.forEach((c) => imgs.push(c));
  base[T_DIRT] = imgs.length;
  SPR_DIRT.forEach((c) => imgs.push(c));
  base[T_TREE] = base[T_DIRT];

  return { imgs, base, dirtCount: SPR_DIRT.length };
}

export function buildTileSprites(): TileSpriteAtlas {
  const world1 = buildSpritesForPalette('world1');
  const world2 = buildSpritesForPalette('world2');
  const grand_city = buildSpritesForPalette('grand_city');
  const dungeon = buildSpritesForPalette('dungeon');
  return {
    ...world1,
    byWorld: {
      world1,
      world2,
      grand_city,
      dungeon,
    },
  };
}

export interface WorldData {
  seed: number;
  worldId: WorldId;
  width: number;
  height: number;
  safeRadius: number;
  dungeonFloor?: number;
  tiles: Uint8Array[];
  tileImgIdx: Uint8Array;
  decos: DecoEntity[];
  chests: ChestEntity[];
  merchant: NpcEntity;
  elder: NpcEntity;
  awakening: NpcEntity;
  armorer: NpcEntity;
  blacksmith: NpcEntity;
  upgrader: NpcEntity;
  altar: AltarEntity;
  portal: PortalEntity;
  dungeonGate?: DungeonGateEntity;
  socialBoard?: SocialBoardEntity;
  signposts: SignpostEntity[];
  torches: TorchEntity[];
  bossArenas: FixedBossArena[];
  regions: WorldRegionLabel[];
  spawnX: number;
  spawnY: number;
}

function getGridDims(tiles: Uint8Array[]): { w: number; h: number } {
  const h = tiles.length;
  const w = h > 0 ? tiles[0].length : WW;
  return { w, h };
}

function paintDisc(
  tiles: Uint8Array[],
  cx: number,
  cy: number,
  r: number,
  tile: number,
  minBound = 3,
  maxBound?: number
): void {
  const { w, h } = getGridDims(tiles);
  const maxX = maxBound !== undefined ? Math.min(maxBound, w - 4) : w - 4;
  const maxY = maxBound !== undefined ? Math.min(maxBound, h - 4) : h - 4;
  const r2 = r * r;
  const y0 = Math.max(minBound, Math.floor(cy - r));
  const y1 = Math.min(maxY, Math.ceil(cy + r));
  const x0 = Math.max(minBound, Math.floor(cx - r));
  const x1 = Math.min(maxX, Math.ceil(cx + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) {
        tiles[y][x] = tile;
      }
    }
  }
}

function paintOrganicLake(
  tiles: Uint8Array[],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  beachPad = 2.6
): void {
  const { w, h } = getGridDims(tiles);
  const outerRx = rx + beachPad;
  const outerRy = ry + beachPad;
  const y0 = Math.max(4, Math.floor(cy - outerRy * 1.4));
  const y1 = Math.min(h - 5, Math.ceil(cy + outerRy * 1.4));
  const x0 = Math.max(4, Math.floor(cx - outerRx * 1.4));
  const x1 = Math.min(w - 5, Math.ceil(cx + outerRx * 1.4));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / Math.max(1, rx);
      const dy = (y - cy) / Math.max(1, ry);
      const ang = Math.atan2(dy, dx);
      const lobe =
        1 +
        0.22 * Math.sin(ang * 3 + seed * 0.1) +
        0.13 * Math.cos(ang * 5 - seed * 0.05) +
        0.18 * (fbm(x / 10, y / 10, seed + 91) - 0.5);
      const normDist = Math.hypot(dx, dy) / lobe;
      if (normDist <= 1.0) {
        tiles[y][x] = T_WATER;
      } else if (normDist <= 1.0 + beachPad / Math.max(rx, ry)) {
        if (tiles[y][x] !== T_WATER) tiles[y][x] = T_SAND;
      }
    }
  }
}

function carveCorridor(
  tiles: Uint8Array[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  halfWidth: number,
  tile: number,
  buildBridges = true
): void {
  const { w, h } = getGridDims(tiles);
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const tx = Math.round(lerp(x0, x1, t));
    const ty = Math.round(lerp(y0, y1, t));
    for (let dy = -halfWidth; dy <= halfWidth; dy++) {
      for (let dx = -halfWidth; dx <= halfWidth; dx++) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (nx >= 3 && ny >= 3 && nx <= w - 4 && ny <= h - 4) {
          const cur = tiles[ny][nx];
          if (cur === T_TREE || cur === T_ROCK) {
            tiles[ny][nx] = tile;
          } else if (tile === T_SAND && cur === T_GRASS) {
            tiles[ny][nx] = T_SAND;
          } else if (tile === T_DIRT && cur === T_GRASS) {
            tiles[ny][nx] = T_DIRT;
          } else if (buildBridges && cur === T_WATER && Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
            tiles[ny][nx] = T_SAND;
          }
        }
      }
    }
  }
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function carveSplineRoad(
  tiles: Uint8Array[],
  waypoints: [number, number][],
  radius: number,
  tile: number,
  seed: number,
  buildBridges = true,
  wobbleAmp = 0.85
): void {
  if (waypoints.length < 2) return;
  const { w, h } = getGridDims(tiles);
  const padded: [number, number][] = [
    waypoints[0],
    ...waypoints,
    waypoints[waypoints.length - 1],
  ];

  for (let seg = 0; seg < waypoints.length - 1; seg++) {
    const p0 = padded[seg];
    const p1 = padded[seg + 1];
    const p2 = padded[seg + 2];
    const p3 = padded[seg + 3];
    const segLen = Math.max(1, Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
    const steps = Math.ceil(segLen * 3);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const sx = catmullRom(p0[0], p1[0], p2[0], p3[0], t);
      const sy = catmullRom(p0[1], p1[1], p2[1], p3[1], t);

      const wobX = (fbm(sx / 9, sy / 9, seed + 13) - 0.5) * wobbleAmp;
      const wobY = (fbm(sx / 9 + 17, sy / 9 + 23, seed + 37) - 0.5) * wobbleAmp;
      const cxPt = sx + wobX;
      const cyPt = sy + wobY;
      const effR = radius + (hash2(Math.round(cxPt), Math.round(cyPt), seed + 71) - 0.5) * 0.32;
      const rCeil = Math.ceil(effR);

      for (let oy = -rCeil; oy <= rCeil; oy++) {
        for (let ox = -rCeil; ox <= rCeil; ox++) {
          const d = Math.hypot(ox, oy);
          if (d > effR) continue;
          const nx = Math.round(cxPt) + ox;
          const ny = Math.round(cyPt) + oy;
          if (nx < 3 || ny < 3 || nx > w - 4 || ny > h - 4) continue;
          const cur = tiles[ny][nx];
          if (tile === T_WATER) {
            tiles[ny][nx] = T_WATER;
          } else if (cur === T_TREE || cur === T_ROCK) {
            tiles[ny][nx] = tile;
          } else if (tile === T_SAND && cur === T_GRASS) {
            tiles[ny][nx] = T_SAND;
          } else if (tile === T_DIRT && cur === T_GRASS) {
            tiles[ny][nx] = T_DIRT;
          } else if (buildBridges && cur === T_WATER && d <= Math.min(1.22, Math.max(1.0, radius * 0.68))) {
            tiles[ny][nx] = T_SAND;
          }
        }
      }
    }
  }
}

function isTileWalkableId(t: number): boolean {
  return t === T_GRASS || t === T_SAND || t === T_DIRT || t === T_WATER;
}

function ensureFullConnectivity(
  tiles: Uint8Array[],
  spawnTx: number,
  spawnTy: number,
  protectedPoints: [number, number][] = []
): void {
  const { w, h } = getGridDims(tiles);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  const isNearProtected = (x: number, y: number) =>
    protectedPoints.some(([px, py]) => Math.hypot(x - px, y - py) <= 4.5);

  const bfsReachable = () => {
    const visited = new Uint8Array(w * h);
    const qx = new Int16Array(w * h);
    const qy = new Int16Array(w * h);
    let head = 0;
    let tail = 0;
    if (isTileWalkableId(tiles[spawnTy]?.[spawnTx])) {
      visited[spawnTy * w + spawnTx] = 1;
      qx[tail] = spawnTx;
      qy[tail] = spawnTy;
      tail++;
    }
    while (head < tail) {
      const x = qx[head];
      const y = qy[head];
      head++;
      for (let d = 0; d < 4; d++) {
        const nx = x + dirs[d][0];
        const ny = y + dirs[d][1];
        if (nx < 3 || ny < 3 || nx > w - 4 || ny > h - 4) continue;
        const idx = ny * w + nx;
        if (visited[idx]) continue;
        if (!isTileWalkableId(tiles[ny][nx])) continue;
        visited[idx] = 1;
        qx[tail] = nx;
        qy[tail] = ny;
        tail++;
      }
    }
    return visited;
  };

  const findComponents = (visited: Uint8Array) => {
    const seen = new Uint8Array(w * h);
    const comps: { tiles: [number, number][]; hasProtected: boolean; fillTile: number }[] = [];
    for (let y = 3; y <= h - 4; y++) {
      for (let x = 3; x <= w - 4; x++) {
        const idx = y * w + x;
        if (!isTileWalkableId(tiles[y][x]) || visited[idx] || seen[idx]) continue;

        const comp: [number, number][] = [];
        const q: [number, number][] = [[x, y]];
        seen[idx] = 1;
        let qHead = 0;
        let hasProtected = false;
        let rockNeighbors = 0;
        let treeNeighbors = 0;

        while (qHead < q.length) {
          const [cx, cy] = q[qHead++];
          comp.push([cx, cy]);
          if (isNearProtected(cx, cy)) hasProtected = true;
          for (let d = 0; d < 4; d++) {
            const nx = cx + dirs[d][0];
            const ny = cy + dirs[d][1];
            if (nx < 3 || ny < 3 || nx > w - 4 || ny > h - 4) {
              rockNeighbors++;
              continue;
            }
            const nt = tiles[ny][nx];
            if (nt === T_ROCK) rockNeighbors++;
            else if (nt === T_TREE) treeNeighbors++;
            else if (isTileWalkableId(nt)) {
              const nIdx = ny * w + nx;
              if (!visited[nIdx] && !seen[nIdx]) {
                seen[nIdx] = 1;
                q.push([nx, ny]);
              }
            }
          }
        }
        comps.push({
          tiles: comp,
          hasProtected,
          fillTile: rockNeighbors > treeNeighbors ? T_ROCK : T_TREE,
        });
      }
    }
    return comps;
  };

  {
    const visited = bfsReachable();
    const comps = findComponents(visited);
    for (const c of comps) {
      if (!c.hasProtected && c.tiles.length <= 36) {
        for (const [px, py] of c.tiles) {
          tiles[py][px] = c.fillTile;
        }
      }
    }
  }

  const searchRadii = [24, 52, 96, 180];
  for (let pass = 0; pass < 96; pass++) {
    const visited = bfsReachable();
    const comps = findComponents(visited);
    if (comps.length === 0) break;

    const targetComp = comps[0];
    if (!targetComp.hasProtected && targetComp.tiles.length <= 36) {
      for (const [px, py] of targetComp.tiles) {
        tiles[py][px] = targetComp.fillTile;
      }
      continue;
    }

    let bestDist = Infinity;
    let bestFrom: [number, number] = targetComp.tiles[0];
    let bestTo: [number, number] = [spawnTx, spawnTy];
    const step = Math.max(1, Math.floor(targetComp.tiles.length / 28));

    for (const rad of searchRadii) {
      for (let ci = 0; ci < targetComp.tiles.length; ci += step) {
        const [fx, fy] = targetComp.tiles[ci];
        for (let sy = Math.max(3, fy - rad); sy <= Math.min(h - 4, fy + rad); sy++) {
          for (let sx = Math.max(3, fx - rad); sx <= Math.min(w - 4, fx + rad); sx++) {
            if (!visited[sy * w + sx]) continue;
            const dd = (sx - fx) * (sx - fx) + (sy - fy) * (sy - fy);
            if (dd < bestDist) {
              bestDist = dd;
              bestFrom = [fx, fy];
              bestTo = [sx, sy];
            }
          }
        }
      }
      if (bestDist < Infinity) break;
    }

    carveCorridor(tiles, bestFrom[0], bestFrom[1], bestTo[0], bestTo[1], 1, T_DIRT, true);
  }

  for (let guard = 0; guard < 64; guard++) {
    const visited = bfsReachable();
    const comps = findComponents(visited);
    if (comps.length === 0) break;
    const c = comps[0];
    let bestDist = Infinity;
    let bestTo: [number, number] = [spawnTx, spawnTy];
    const [fx, fy] = c.tiles[0];
    for (let y = 3; y <= h - 4; y++) {
      for (let x = 3; x <= w - 4; x++) {
        if (!visited[y * w + x]) continue;
        const dd = (x - fx) * (x - fx) + (y - fy) * (y - fy);
        if (dd < bestDist) {
          bestDist = dd;
          bestTo = [x, y];
        }
      }
    }
    carveCorridor(tiles, fx, fy, bestTo[0], bestTo[1], 1, T_DIRT, true);
  }
}

function sc(val: number, fromDim: number, toDim: number): number {
  return Math.round((val / fromDim) * toDim);
}

function getFixedBossArenas(worldId: WorldId, w: number): FixedBossArena[] {
  const s = (v: number) => sc(v, 210, w);
  const cx = w >> 1;
  const toWorldArena = (
    id: string,
    name: string,
    title: string,
    tx: number,
    ty: number,
    baseLevel: number,
    color: string,
    hpMult: number,
    atkMult: number
  ): FixedBossArena => ({
    id,
    worldId,
    name,
    title,
    tx,
    ty,
    x: tx * TILE + TILE / 2,
    y: ty * TILE + TILE / 2,
    r: 44,
    baseLevel,
    color,
    hpMult,
    atkMult,
  });

  if (worldId === 'world1') {
    return [
      toWorldArena('w1_boss_forest', '棘刺古树王', '西北古林外环领主', s(34), s(34), 6, '#22c55e', 1.0, 1.0),
      toWorldArena('w1_boss_lake', '潮汐海妖领主', '西南碧湖外环领主', s(34), s(174), 8, '#38bdf8', 1.18, 1.1),
      toWorldArena('w1_boss_crag', '炎甲山岭暴君', '东北山岭外环霸主', s(176), s(34), 10, '#f97316', 1.36, 1.22),
      toWorldArena('w1_boss_wind_void', '风息暗影巨像', '东南遗迹外环霸主', s(176), s(174), 11, '#a855f7', 1.52, 1.3),
      toWorldArena('w1_boss_north_dragon', '北境苍穹龙魂', '极北大道终点龙魂', cx, s(20), 13, '#fb7185', 1.72, 1.4),
    ];
  }

  if (worldId === 'world2') {
    return [
      toWorldArena('w2_boss_ember_demon', '炼狱炎魔领主', '西北焦土外环领主', s(34), s(34), 17, '#fb7185', 1.85, 1.48),
      toWorldArena('w2_boss_frost_siren', '魔泉寒渊海妖', '西南魔泉外环领主', s(34), s(176), 19, '#38bdf8', 2.05, 1.58),
      toWorldArena('w2_boss_titan', '灭世灰烬泰坦', '东北铸炉外环霸主', s(176), s(34), 22, '#f43f5e', 2.28, 1.72),
      toWorldArena('w2_boss_void', '虚空吞噬者', '东南暗渊外环领主', s(176), s(176), 24, '#c084fc', 2.5, 1.84),
      toWorldArena('w2_boss_flame_dragon', '深渊焚天魔龙', '极南大道终点魔龙', cx, s(190), 27, '#f97316', 2.78, 1.98),
    ];
  }

  if (worldId === 'grand_city') {
    return [
      toWorldArena('gc_boss_sewer_titan', '城南铁甲暴君', '南郊驰道守卫霸主', 105, 186, 9, '#f59e0b', 1.15, 1.1),
      toWorldArena('gc_boss_west_treant', '西郊林冠树皇', '西境驰道古树领主', 24, 105, 10, '#22c55e', 1.24, 1.16),
      toWorldArena('gc_boss_east_demon', '东郊绯红剑魔', '东境驰道暗红剑魔', 186, 105, 11, '#fb7185', 1.32, 1.22),
      toWorldArena('gc_boss_nw_siren', '北河冰魄水灵', '西北外环水灵领主', 38, 38, 12, '#38bdf8', 1.42, 1.28),
      toWorldArena('gc_boss_ne_void', '星辉禁地幻影领主', '东北外环星辉领主', 172, 38, 14, '#c084fc', 1.56, 1.36),
    ];
  }

  return [];
}

const FIXED_CHEST_COORDS_W1: [number, number][] = [
  [54, 72], [93, 76], [72, 52], [77, 96],
  [48, 52], [41, 45], [35, 39], [22, 26], [19, 43], [44, 22],
  [52, 97], [47, 114], [19, 108], [18, 128], [46, 130], [60, 114],
  [36, 110],
  [93, 52], [110, 44], [128, 24], [134, 42], [108, 20], [123, 56],
  [96, 98], [109, 106], [128, 126], [134, 106], [104, 130], [88, 122],
  [64, 34], [86, 30], [60, 132], [86, 134],
  [18, 74], [26, 62], [25, 89], [132, 74], [122, 62], [124, 88],
  [54, 18], [92, 18], [16, 16], [136, 16], [16, 136], [136, 136],
  [65, 91], [84, 58], [52, 63],
];

const FIXED_CHEST_COORDS_W2: [number, number][] = [
  [54, 74], [94, 76], [74, 52], [76, 96],
  [46, 48], [38, 40], [22, 24], [18, 44], [46, 20], [58, 30],
  [49, 98], [45, 116], [19, 124], [44, 132], [62, 126], [24, 102],
  [102, 48], [112, 42], [130, 22], [136, 44], [106, 20], [128, 56],
  [100, 104], [114, 112], [128, 128], [136, 114], [108, 134], [88, 122],
  [62, 18], [88, 18], [62, 136], [88, 136],
  [16, 74], [26, 58], [26, 92], [134, 74], [126, 58], [124, 92],
  [14, 14], [136, 14], [14, 136], [136, 136],
  [64, 58], [86, 92], [48, 82], [104, 62], [82, 44], [68, 108],
];

const FIXED_CHEST_COORDS_CITY: [number, number][] = [
  [78, 78], [132, 78], [78, 132], [132, 132],
  [52, 52], [158, 52], [52, 158], [158, 158],
  [24, 86], [186, 86], [105, 22], [105, 166],
  [66, 26], [144, 26], [66, 184], [144, 184],
];

function getFixedSignposts(worldId: WorldId, cx: number, cy: number, w: number): SignpostEntity[] {
  const s = (v: number) => sc(v, 210, w);
  const toSign = (
    id: string,
    tx: number,
    ty: number,
    title: string,
    direction: string,
    destDesc: string,
    dangerLevel: string,
    angle: number
  ): SignpostEntity => ({
    id,
    x: tx * TILE + TILE / 2,
    y: ty * TILE + TILE / 2,
    title,
    direction,
    destDesc,
    dangerLevel,
    angle,
  });

  if (worldId === 'world1') {
    return [
      toSign('w1_sign_n', cx + 3, cy - 18, '北门大道标', '↑ 北境直道', '直行抵【北境苍穹龙魂】，外环左右接西北古林/东北山岭', '清晰主路 · Lv.1~8', -Math.PI / 2),
      toSign('w1_sign_s', cx + 3, cy + 18, '南门大道标', '↓ 南境直道', '直行至外环南枢 → 左转西南碧湖 / 右转东南遗迹', '清晰主路 · Lv.2~10', Math.PI / 2),
      toSign('w1_sign_w', cx - 18, cy + 3, '西门大道标', '← 西境直道', '直行至西外环枢纽 → 上行太古幽林 / 下行潮汐碧湖', '清晰主路 · Lv.4~10', Math.PI),
      toSign('w1_sign_e', cx + 18, cy + 3, '东门大道标', '→ 东境跨河石桥', '过桥至东外环枢纽 → 上行炎甲山岭 / 下行风息遗迹', '清晰主路 · Lv.6~12', 0),
      toSign('w1_sign_nw', s(38), s(38), '西北外环口', '↖ 古树王祭坛', '外环西北角：棘刺古树王祭坛（沿白砂环路可顺畅环游全图）', 'BOSS 警戒区', -Math.PI * 0.75),
      toSign('w1_sign_sw', s(38), s(170), '西南外环口', '↙ 海妖祭坛', '外环西南角：潮汐海妖领主祭坛与湖心岛石桥入口', 'BOSS 警戒区', Math.PI * 0.75),
      toSign('w1_sign_ne', s(172), s(38), '东北外环口', '↗ 暴君祭坛', '外环东北角：炎甲山岭暴君祭坛', 'BOSS 警戒区', -Math.PI * 0.25),
      toSign('w1_sign_se', s(172), s(170), '东南外环口', '↘ 暗影巨像', '外环东南角：风息暗影巨像祭坛', 'BOSS 警戒区', Math.PI * 0.25),
    ];
  }

  if (worldId === 'grand_city') {
    return [
      toSign('gc_sign_n', cx + 3, cy - 13, '试炼大道北标', '↑ 试炼之塔 & 北门', '直行【试炼之塔】传送正门（1F~∞）· 出北门通外环猎场', '核心副本入口', -Math.PI / 2),
      toSign('gc_sign_w', cx - 13, cy + 3, '圣殿觉醒大道', '← 西区觉醒圣殿', '觉醒导师 · 远古天赋祭坛 · 出西门抵西郊古树皇', '圣城区', Math.PI),
      toSign('gc_sign_e', cx + 13, cy + 3, '皇家工匠大道', '→ 东区工匠坊', '铁匠 · 军械库 · 百锻大师 · 出东门抵东郊绯红剑魔', '工匠区', 0),
      toSign('gc_sign_s', cx + 3, cy + 13, '南门商贸大道', '↓ 公会榜 & 南郊', '好友组队榜 · 传送阵 · 出南门石桥抵城南铁甲暴君', '商业与出城门', Math.PI / 2),
      toSign('gc_sign_out_s', cx + 3, cy + 50, '外环驰道南枢', '↓ 城南铁甲暴君', '沿外环白砂驰道顺/逆时针巡猎全城郊 5 大领主，绝不迷路', '外环驰道 · Lv.8+', Math.PI / 2),
      toSign('gc_sign_out_n', cx + 3, cy - 50, '外环驰道北枢', '↖ 水灵 / ↗ 幻影', '西北接北河冰魄水灵 · 东北接星辉禁地幻影领主', '外环驰道 · Lv.10+', -Math.PI / 2),
    ];
  }

  if (worldId === 'dungeon') {
    return [];
  }

  return [
    toSign('w2_sign_n', cx + 3, cy - 18, '深渊北门标', '↑ 焦土北直道', '直行至北外环枢纽 → 左接炼狱炎魔 / 右接灰烬泰坦', '极危 · Lv.14+', -Math.PI / 2),
    toSign('w2_sign_s', cx + 3, cy + 18, '深渊南门标', '↓ 魔泉南直道', '直行终点：深渊焚天魔龙；外环左右接双子魔泉与虚空裂隙', '极危 · Lv.16+', Math.PI / 2),
    toSign('w2_sign_w', cx - 18, cy + 3, '深渊西门标', '← 西渊直道', '直行至西外环枢纽，南北贯通炎魔焦土与魔泉海妖', '高危主道', Math.PI),
    toSign('w2_sign_e', cx + 18, cy + 3, '深渊东门标', '→ 东渊直道', '直行至东外环枢纽，南北贯通灰烬泰坦与虚空吞噬者', '高危主道', 0),
    toSign('w2_sign_nw', s(38), s(38), '西北外环口', '↖ 炼狱炎魔', '外环西北角：炼狱炎魔领主祭坛', 'BOSS 警戒区', -Math.PI * 0.75),
    toSign('w2_sign_ne', s(172), s(38), '东北外环口', '↗ 灰烬泰坦', '外环东北角：灭世灰烬泰坦祭坛', '终极 BOSS', -Math.PI * 0.25),
    toSign('w2_sign_sw', s(38), s(172), '西南外环口', '↙ 魔泉海妖', '外环西南角：魔泉寒渊海妖祭坛', 'BOSS 警戒区', Math.PI * 0.75),
    toSign('w2_sign_se', s(172), s(172), '东南外环口', '↘ 虚空吞噬者', '外环东南角：虚空吞噬者祭坛', 'BOSS 警戒区', Math.PI * 0.25),
  ];
}

function getWorldRegions(worldId: WorldId, w: number): WorldRegionLabel[] {
  const s = (v: number) => sc(v, 210, w);
  const cx = w >> 1;
  if (worldId === 'world1') {
    return [
      { id: 'w1_city', name: '晨曦圣城', subtitle: '中央安全区 · 四向直通大道枢纽', tx: cx, ty: cx, kind: 'city', danger: '安全区' },
      { id: 'w1_forest', name: '太古幽林', subtitle: '西北林海 · 棘刺古树王领地', tx: s(42), ty: s(48), kind: 'forest', danger: 'Lv.4~8' },
      { id: 'w1_crag', name: '炎甲山岭', subtitle: '东北山脊 · 炎甲山岭暴君领地', tx: s(168), ty: s(48), kind: 'mountain', danger: 'Lv.8~14' },
      { id: 'w1_north', name: '北境龙眠峰', subtitle: '极北大道尽头 · 北境苍穹龙魂祭坛', tx: cx, ty: s(24), kind: 'mountain', danger: 'Lv.10~15' },
      { id: 'w1_lake', name: '潮汐碧湖', subtitle: '西南湿地大湖 · 潮汐海妖领地', tx: s(44), ty: s(160), kind: 'water', danger: 'Lv.6~11' },
      { id: 'w1_plains', name: '风息遗迹', subtitle: '东南古草甸 · 风息暗影巨像领地', tx: s(166), ty: s(160), kind: 'plains', danger: 'Lv.7~13' },
    ];
  }
  if (worldId === 'grand_city') {
    return [
      { id: 'gc_plaza', name: '幻光中央广场', subtitle: '白金环路 · 全职业枢纽', tx: cx, ty: cx, kind: 'city', danger: '安全区' },
      { id: 'gc_tower', name: '试炼之塔北门', subtitle: '1F~∞ 无尽高爆经验装备副本', tx: cx, ty: cx - 20, kind: 'city', danger: '副本入口' },
      { id: 'gc_west_wild', name: '西境林冠猎场', subtitle: '西郊驰道 · 西郊林冠树皇领地', tx: 30, ty: cx, kind: 'forest', danger: 'Lv.7~12' },
      { id: 'gc_east_wild', name: '东境绯红营地', subtitle: '东郊驰道 · 东郊绯红剑魔领地', tx: 180, ty: cx, kind: 'mountain', danger: 'Lv.8~13' },
      { id: 'gc_outskirts', name: '南郊外环驰道', subtitle: '南郊石桥外 · 城南铁甲暴君领地', tx: cx, ty: 178, kind: 'plains', danger: 'Lv.6~11' },
    ];
  }
  if (worldId === 'dungeon') {
    return [
      { id: 'dg_arena', name: '试炼圣殿大厅', subtitle: '清剿魔物并击败楼层领主', tx: 27, ty: 27, kind: 'city', danger: '副本战斗区' },
    ];
  }
  return [
    { id: 'w2_city', name: '深渊庇护所', subtitle: '黑曜石堡垒 · 四向直通大道枢纽', tx: cx, ty: cx, kind: 'city', danger: '安全区' },
    { id: 'w2_ember', name: '炼狱焦土', subtitle: '西北焦林 · 炼狱炎魔领主领地', tx: s(44), ty: s(48), kind: 'forest', danger: 'Lv.14~20' },
    { id: 'w2_titan', name: '灰烬高炉', subtitle: '东北高地 · 灭世灰烬泰坦领地', tx: s(166), ty: s(48), kind: 'mountain', danger: 'Lv.20~28' },
    { id: 'w2_spring', name: '双子魔泉', subtitle: '西南紫晶湖 · 魔泉寒渊海妖领地', tx: s(44), ty: s(162), kind: 'water', danger: 'Lv.15~22' },
    { id: 'w2_void', name: '虚空裂隙', subtitle: '东南渊谷 · 虚空吞噬者祭坛', tx: s(166), ty: s(162), kind: 'plains', danger: 'Lv.18~26' },
    { id: 'w2_dragon', name: '炼狱龙巢', subtitle: '极南大道尽头 · 深渊焚天魔龙巢穴', tx: cx, ty: s(188), kind: 'mountain', danger: 'Lv.24~32' },
  ];
}

function clearRoadShoulders(tiles: Uint8Array[], w: number, h: number): void {
  // 清理贴近主大道的孤立碎树/碎石障碍，保持视觉开阔、走路绝不卡顿
  for (let y = 5; y < h - 5; y++) {
    for (let x = 5; x < w - 5; x++) {
      const t = tiles[y][x];
      if (t !== T_TREE && t !== T_ROCK) continue;
      let sandNeighbors = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (tiles[y + oy][x + ox] === T_SAND) sandNeighbors++;
        }
      }
      if (sandNeighbors >= 3) {
        tiles[y][x] = T_GRASS;
      }
    }
  }
}

function generateGrandCity(
  atlas?: TileSpriteAtlas | null
): WorldData {
  const w = WW;
  const h = WH;
  const seed = 30303;
  const cx = w >> 1;
  const cy = h >> 1;
  const tiles: Uint8Array[] = new Array(h);
  const tileImgIdx = new Uint8Array(w * h);

  // 1. 清晰整洁的王城基盘与外郊森林草原
  for (let y = 0; y < h; y++) {
    const row = new Uint8Array(w);
    for (let x = 0; x < w; x++) {
      if (x < 3 || y < 3 || x > w - 4 || y > h - 4) {
        row[x] = T_ROCK;
        continue;
      }
      const d = Math.hypot(x - cx, y - cy);
      if (d <= 44) {
        row[x] = T_GRASS;
      } else {
        const canopy = fbm(x / 14, y / 14, seed + 21);
        const detail = fbm(x / 10, y / 10, seed + 77);
        if (canopy > 0.65) row[x] = T_TREE;
        else if (detail > 0.82) row[x] = T_ROCK;
        else row[x] = T_GRASS;
      }
    }
    tiles[y] = row;
  }

  // 2. 护城运河环带 (r = 43 ~ 46.2)
  for (let y = 10; y < h - 10; y++) {
    for (let x = 10; x < w - 10; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= 43.0 && d <= 46.2) {
        tiles[y][x] = T_WATER;
      }
    }
  }

  // 3. 宏伟工整的三环白金石板布局：内广场(r<=15) + 中环大道(r=20..24) + 外内城环道(r=31..34)
  for (let y = cy - 36; y <= cy + 36; y++) {
    for (let x = cx - 36; x <= cx + 36; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= 30.8 && d <= 34.2) {
        tiles[y][x] = T_DIRT;
      } else if (d >= 19.5 && d <= 23.2) {
        tiles[y][x] = T_SAND;
      }
    }
  }
  paintDisc(tiles, cx, cy, 15.0, T_SAND);
  paintDisc(tiles, cx, cy, 3.2, T_WATER); // 中央喷泉水池
  paintDisc(tiles, cx, cy, 1.4, T_SAND);

  // 王城城墙 (r = 37.2 ~ 39.2) 带四向宽阔 9 格王城正门
  for (let y = cy - 41; y <= cy + 41; y++) {
    for (let x = cx - 41; x <= cx + 41; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= 37.2 && d <= 39.2) {
        const isNS = Math.abs(x - cx) <= 4;
        const isWE = Math.abs(y - cy) <= 4;
        if (!isNS && !isWE) {
          tiles[y][x] = T_ROCK;
        }
      }
    }
  }

  // 4. 笔直十字白金主大道（跨护城河石桥直抵城外东西南北端）
  carveCorridor(tiles, 18, cy, w - 19, cy, 2, T_SAND, true);
  carveCorridor(tiles, cx, 18, cx, h - 19, 2, T_SAND, true);

  // 清晰几何八边形外环驰道（无缝串起 5 大城郊领主，绝无杂乱断头路）
  carveSplineRoad(
    tiles,
    [
      [cx, 22],
      [172, 38],
      [186, cy],
      [172, 172],
      [cx, 186],
      [38, 172],
      [24, cy],
      [38, 38],
      [cx, 22],
    ],
    2.1,
    T_SAND,
    seed + 5,
    true,
    0.05
  );

  // 四条直线对角线林荫石道（连接城内与四角外环领主）
  carveCorridor(tiles, cx - 22, cy - 22, 38, 38, 1, T_DIRT, true);
  carveCorridor(tiles, cx + 22, cy - 22, 172, 38, 1, T_DIRT, true);
  carveCorridor(tiles, cx - 22, cy + 22, 38, 172, 1, T_DIRT, true);
  carveCorridor(tiles, cx + 22, cy + 22, 172, 172, 1, T_DIRT, true);

  // 北区试炼之塔前广场 (cx, cy - 20)
  paintDisc(tiles, cx, cy - 20, 6.8, T_SAND);
  for (let i = -3; i <= 3; i++) {
    tiles[cy - 4][cx + i] = T_SAND;
    tiles[cy + 4][cx + i] = T_SAND;
    tiles[cy + i][cx - 4] = T_SAND;
    tiles[cy + i][cx + 4] = T_SAND;
  }

  const bossArenas = getFixedBossArenas('grand_city', w);
  for (const arena of bossArenas) {
    paintDisc(tiles, arena.tx, arena.ty, 10.5, T_GRASS);
    paintDisc(tiles, arena.tx, arena.ty, 7.2, T_SAND);
  }

  const signposts = getFixedSignposts('grand_city', cx, cy, w);
  for (const sp of signposts) {
    paintDisc(tiles, Math.floor(sp.x / TILE), Math.floor(sp.y / TILE), 2, T_SAND);
  }

  const chests: ChestEntity[] = FIXED_CHEST_COORDS_CITY.map(([tx, ty], idx) => {
    paintDisc(tiles, tx, ty, 2.2, T_GRASS);
    return {
      tx,
      ty,
      x: tx * TILE + TILE / 2,
      y: ty * TILE + TILE / 2,
      opened: false,
      ph: (idx * 0.61) % TAU,
    };
  });

  clearRoadShoulders(tiles, w, h);

  const protectedPoints: [number, number][] = [
    [cx, cy - 20],
    ...bossArenas.map((a): [number, number] => [a.tx, a.ty]),
    ...signposts.map((sp): [number, number] => [Math.floor(sp.x / TILE), Math.floor(sp.y / TILE)]),
    ...FIXED_CHEST_COORDS_CITY,
  ];
  ensureFullConnectivity(tiles, cx, cy + 5, protectedPoints);

  const decos: DecoEntity[] = [];
  const spriteSet = atlas ? atlas.byWorld.grand_city ?? atlas : null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tiles[y][x];
      if (t === T_TREE || t === T_ROCK) {
        decos.push({
          kind: t === T_TREE ? 'tree' : 'rock',
          x: x * TILE + TILE / 2,
          y: y * TILE + TILE / 2,
          v: hash2(x, y, 321 + seed),
          ph: hash2(x, y, 654 + seed) * TAU,
        });
      }
      if (spriteSet) {
        const hh = hash2(x, y, 5 + seed);
        const base = spriteSet.base[t] !== undefined ? spriteSet.base[t] : 0;
        const n = t === T_TREE ? spriteSet.dirtCount : 5;
        tileImgIdx[y * w + x] = base + Math.min(n - 1, Math.floor(hh * n));
      }
    }
  }

  const meta = WORLD_META.grand_city;
  const spawnX = cx * TILE + TILE / 2;
  const spawnY = (cy + 5) * TILE + TILE / 2;

  return {
    seed,
    worldId: 'grand_city',
    width: w,
    height: h,
    safeRadius: 1180,
    tiles,
    tileImgIdx,
    decos,
    chests,
    awakening: { kind: 'awakening', label: meta.awakeningName, x: (cx - 10) * TILE + TILE / 2, y: (cy - 5) * TILE + TILE / 2, r: 14, ph: 0.4 },
    elder: { kind: 'elder', label: meta.elderName, x: (cx - 10) * TILE + TILE / 2, y: (cy + 4) * TILE + TILE / 2, r: 14, ph: 1.5 },
    merchant: { kind: 'merchant', label: meta.merchantName, x: (cx - 6) * TILE + TILE / 2, y: (cy + 9) * TILE + TILE / 2, r: 14, ph: 0 },
    blacksmith: { kind: 'blacksmith', label: meta.blacksmithName, x: (cx + 10) * TILE + TILE / 2, y: (cy - 5) * TILE + TILE / 2, r: 14, ph: 2.2 },
    armorer: { kind: 'armorer', label: meta.armorerName, x: (cx + 10) * TILE + TILE / 2, y: (cy + 4) * TILE + TILE / 2, r: 14, ph: 3.1 },
    upgrader: { kind: 'upgrader', label: meta.upgraderName, x: (cx + 6) * TILE + TILE / 2, y: (cy + 9) * TILE + TILE / 2, r: 14, ph: 4.0 },
    altar: { label: meta.altarName, x: (cx - 15) * TILE + TILE / 2, y: cy * TILE + TILE / 2, r: 20, ph: 0.8 },
    portal: { x: (cx + 15) * TILE + TILE / 2, y: cy * TILE + TILE / 2, r: 24, ph: 2.1, targetWorld: 'world2', label: '🌀 烈焰深渊传送阵' },
    dungeonGate: { x: cx * TILE + TILE / 2, y: (cy - 20) * TILE + TILE / 2, r: 28, ph: 1.1, label: '🏰 试炼之塔（1F~∞）' },
    socialBoard: { x: cx * TILE + TILE / 2, y: (cy + 14) * TILE + TILE / 2, r: 20, ph: 0.6, label: '📜 公会好友组队榜' },
    signposts,
    torches: [
      { x: (cx - 8) * TILE + TILE / 2, y: (cy - 8) * TILE + TILE / 2, ph: 0.4 },
      { x: (cx + 8) * TILE + TILE / 2, y: (cy - 8) * TILE + TILE / 2, ph: 1.9 },
      { x: (cx - 8) * TILE + TILE / 2, y: (cy + 8) * TILE + TILE / 2, ph: 3.1 },
      { x: (cx + 8) * TILE + TILE / 2, y: (cy + 8) * TILE + TILE / 2, ph: 4.5 },
      { x: (cx - 5) * TILE + TILE / 2, y: (cy - 21) * TILE + TILE / 2, ph: 0.9 },
      { x: (cx + 5) * TILE + TILE / 2, y: (cy - 21) * TILE + TILE / 2, ph: 2.3 },
    ],
    bossArenas,
    regions: getWorldRegions('grand_city', w),
    spawnX,
    spawnY,
  };
}

function generateDungeonWorld(
  dungeonFloor: number,
  atlas?: TileSpriteAtlas | null
): WorldData {
  const w = 54;
  const h = 54;
  const seed = 40400 + dungeonFloor * 17;
  const cx = 27;
  const cy = 27;
  const tiles: Uint8Array[] = new Array(h);
  const tileImgIdx = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const row = new Uint8Array(w);
    for (let x = 0; x < w; x++) {
      const edge = x < 4 || y < 4 || x > w - 5 || y > h - 5;
      const d = Math.hypot(x - cx, y - cy);
      if (edge || d > 23.5) {
        row[x] = T_ROCK;
      } else {
        row[x] = T_GRASS;
      }
    }
    tiles[y] = row;
  }

  // 中央十字符文试炼走廊
  carveCorridor(tiles, cx, 8, cx, h - 9, 2, T_SAND, false);
  carveCorridor(tiles, 8, cy, w - 9, cy, 2, T_SAND, false);
  paintDisc(tiles, cx, cy, 8.5, T_SAND);

  // 4 座对称战术石柱（可供卡位/躲弹幕）
  for (const [px, py] of [[19, 19], [35, 19], [19, 35], [35, 35]]) {
    paintDisc(tiles, px, py, 1.5, T_ROCK);
  }

  ensureFullConnectivity(tiles, cx, 42, [[cx, 11], [cx, 18], [cx, cy]]);

  const decos: DecoEntity[] = [];
  const spriteSet = atlas ? atlas.byWorld.dungeon ?? atlas : null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tiles[y][x];
      if (t === T_ROCK && x > 4 && y > 4 && x < w - 5 && y < h - 5) {
        decos.push({
          kind: 'rock',
          x: x * TILE + TILE / 2,
          y: y * TILE + TILE / 2,
          v: hash2(x, y, 321 + seed),
          ph: hash2(x, y, 654 + seed) * TAU,
        });
      }
      if (spriteSet) {
        const hh = hash2(x, y, 5 + seed);
        const base = spriteSet.base[t] !== undefined ? spriteSet.base[t] : 0;
        const n = t === T_TREE ? spriteSet.dirtCount : 5;
        tileImgIdx[y * w + x] = base + Math.min(n - 1, Math.floor(hh * n));
      }
    }
  }

  const meta = WORLD_META.dungeon;
  const offPos = -9999; // Non-city NPCs hidden off-map inside combat dungeon

  return {
    seed,
    worldId: 'dungeon',
    width: w,
    height: h,
    safeRadius: 0,
    dungeonFloor,
    tiles,
    tileImgIdx,
    decos,
    chests: [],
    merchant: { kind: 'merchant', label: meta.merchantName, x: offPos, y: offPos, r: 14, ph: 0 },
    elder: { kind: 'elder', label: meta.elderName, x: offPos, y: offPos, r: 14, ph: 0 },
    awakening: { kind: 'awakening', label: meta.awakeningName, x: offPos, y: offPos, r: 14, ph: 0 },
    armorer: { kind: 'armorer', label: meta.armorerName, x: offPos, y: offPos, r: 14, ph: 0 },
    blacksmith: { kind: 'blacksmith', label: meta.blacksmithName, x: offPos, y: offPos, r: 14, ph: 0 },
    upgrader: { kind: 'upgrader', label: meta.upgraderName, x: offPos, y: offPos, r: 14, ph: 0 },
    altar: { label: meta.altarName, x: offPos, y: offPos, r: 20, ph: 0 },
    portal: { x: cx * TILE + TILE / 2, y: 11 * TILE + TILE / 2, r: 24, ph: 1.5, targetWorld: 'dungeon', label: `🌀 前往试炼之塔 ${dungeonFloor + 1}F` },
    dungeonGate: { x: cx * TILE + TILE / 2, y: 46 * TILE + TILE / 2, r: 24, ph: 1.5, label: '🚪 撤离试炼之塔' },
    signposts: [],
    torches: [
      { x: (cx - 5) * TILE + TILE / 2, y: (cy - 10) * TILE + TILE / 2, ph: 0.4 },
      { x: (cx + 5) * TILE + TILE / 2, y: (cy - 10) * TILE + TILE / 2, ph: 1.9 },
      { x: (cx - 5) * TILE + TILE / 2, y: (cy + 10) * TILE + TILE / 2, ph: 3.1 },
      { x: (cx + 5) * TILE + TILE / 2, y: (cy + 10) * TILE + TILE / 2, ph: 4.5 },
    ],
    bossArenas: [],
    regions: getWorldRegions('dungeon', w),
    spawnX: cx * TILE + TILE / 2,
    spawnY: 42 * TILE + TILE / 2,
  };
}

export function generateFixedWorld(
  worldId: WorldId = 'world1',
  atlas?: TileSpriteAtlas | null,
  options?: { expandedOnline?: boolean; dungeonFloor?: number }
): WorldData {
  if (worldId === 'grand_city') {
    return generateGrandCity(atlas);
  }
  if (worldId === 'dungeon') {
    return generateDungeonWorld(options?.dungeonFloor ?? 1, atlas);
  }

  const w = options?.expandedOnline ? 250 : WW;
  const h = options?.expandedOnline ? 250 : WH;
  const s = (v: number) => sc(v, 150, w);
  const s2 = (v: number) => sc(v, 210, w);
  const seed = worldId === 'world1' ? 10101 : 20202;
  const cx = w >> 1;
  const cy = h >> 1;
  const tiles: Uint8Array[] = new Array(h);
  const tileImgIdx = new Uint8Array(w * h);

  // 1. 分区生态地形（适当留白，确保清晰探索视野）
  for (let y = 0; y < h; y++) {
    const row = new Uint8Array(w);
    for (let x = 0; x < w; x++) {
      if (x < 3 || y < 3 || x > w - 4 || y > h - 4) {
        row[x] = T_ROCK;
        continue;
      }

      const dx = (x - cx) / (cx - 3);
      const dy = (y - cy) / (cy - 3);
      const nwWeight = clamp((-dx + 0.15) * (-dy + 0.15), 0, 1);
      const neWeight = clamp((dx + 0.1) * (-dy + 0.15), 0, 1);
      const swWeight = clamp((-dx + 0.1) * (dy + 0.1), 0, 1);
      const seWeight = clamp((dx + 0.1) * (dy + 0.1), 0, 1);

      const warpX = (fbm(x / 22, y / 22, seed + 51) - 0.5) * 5;
      const warpY = (fbm(x / 22 + 31, y / 22 + 17, seed + 67) - 0.5) * 5;
      const wx = x + warpX;
      const wy = y + warpY;

      const canopyNoise = fbm(wx / 14 + 19, wy / 14 + 53, seed + 211);
      const clearingNoise = fbm(wx / 24 + 7, wy / 24 + 41, seed + 409);
      const ridgeBase = fbm(wx / 18 + wy * 0.02, wy / 18 - wx * 0.02, seed + 777);
      const ridgeVal = 1 - Math.abs(ridgeBase - 0.5) * 2;
      const detailNoise = fbm(wx / 11 + 31, wy / 11 + 13, seed + 991);

      let t = T_GRASS;

      if (worldId === 'world1') {
        if (neWeight > 0.2) {
          if (ridgeVal > 0.83 - neWeight * 0.1 || detailNoise > 0.77) t = T_ROCK;
          else if (canopyNoise > 0.64 && clearingNoise < 0.62) t = T_TREE;
        } else if (nwWeight > 0.2) {
          if (canopyNoise > 0.52 - nwWeight * 0.04 && clearingNoise > 0.36) t = T_TREE;
          else if (detailNoise > 0.82) t = T_ROCK;
        } else if (swWeight > 0.22) {
          if (canopyNoise > 0.67) t = T_TREE;
          else if (detailNoise > 0.82) t = T_ROCK;
        } else if (seWeight > 0.22) {
          if (ridgeVal > 0.9 && detailNoise > 0.58) t = T_ROCK;
          else if (canopyNoise > 0.65) t = T_TREE;
        } else {
          if (canopyNoise > 0.65) t = T_TREE;
          else if (detailNoise > 0.81) t = T_ROCK;
        }
      } else {
        if (neWeight > 0.2) {
          if (ridgeVal > 0.81 - neWeight * 0.1 || detailNoise > 0.75) t = T_ROCK;
          else if (canopyNoise > 0.67) t = T_TREE;
        } else if (nwWeight > 0.2) {
          if (canopyNoise > 0.54 && clearingNoise > 0.38) t = T_TREE;
          else if (ridgeVal > 0.88) t = T_ROCK;
        } else if (seWeight > 0.22) {
          if (ridgeVal > 0.86) t = T_ROCK;
          else if (canopyNoise > 0.66) t = T_TREE;
        } else {
          if (canopyNoise > 0.66) t = T_TREE;
          else if (detailNoise > 0.8) t = T_ROCK;
        }
      }
      row[x] = t;
    }
    tiles[y] = row;
  }

  // 2. 水系与湖泊（位于象限内部，跨路处自动铺设宽阔石桥）
  if (worldId === 'world1') {
    const riverSpline: [number, number][] = [
      [s2(138), s2(14)],
      [s2(146), s2(46)],
      [s2(144), s2(76)],
      [s2(142), cy],
      [s2(146), s2(136)],
      [s2(154), s2(162)],
      [s2(174), s2(192)],
    ];
    carveSplineRoad(tiles, riverSpline, 2.35, T_SAND, seed + 801, false, 0.45);
    carveSplineRoad(tiles, riverSpline, 1.45, T_WATER, seed + 802, false, 0.45);

    paintOrganicLake(tiles, s2(48), s2(152), s2(14), s2(11), seed + 17, 2.4);
    paintDisc(tiles, s2(48), s2(152), 3.4, T_SAND);
    paintDisc(tiles, s2(48), s2(152), 2.0, T_GRASS);
    paintOrganicLake(tiles, s2(156), s2(156), s2(11), s2(9), seed + 53, 2.2);
  } else {
    const abyssalRiver: [number, number][] = [
      [s2(152), s2(86)],
      [s2(140), cy],
      [s2(132), s2(126)],
      [s2(108), s2(144)],
      [s2(80), s2(152)],
      [s2(50), s2(154)],
    ];
    carveSplineRoad(tiles, abyssalRiver, 2.2, T_SAND, seed + 811, false, 0.45);
    carveSplineRoad(tiles, abyssalRiver, 1.35, T_WATER, seed + 812, false, 0.45);
    paintOrganicLake(tiles, s2(50), s2(154), s2(12), s2(10), seed + 29, 2.2);
    paintOrganicLake(tiles, s2(158), s2(84), s2(9), s2(7.5), seed + 71, 2.1);
  }

  // 3. 宏伟主城安全区
  paintDisc(tiles, cx, cy, 16.5, T_GRASS);
  paintDisc(tiles, cx, cy, 11.2, T_SAND);
  for (let y = cy - 16; y <= cy + 16; y++) {
    for (let x = cx - 16; x <= cx + 16; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= 14.5 && d <= 16.0) {
        const isNorthSouthGate = Math.abs(x - cx) <= 3;
        const isWestEastGate = Math.abs(y - cy) <= 3;
        if (!isNorthSouthGate && !isWestEastGate) {
          tiles[y][x] = T_ROCK;
        }
      }
    }
  }

  // 4. 清晰易懂的主路骨架：
  //    ① 四向笔直 5 格主干大道（出四门直通东西南北尽头，遇水自动架石桥）
  carveCorridor(tiles, s2(18), cy, w - s2(18), cy, 2, T_SAND, true);
  carveCorridor(tiles, cx, s2(18), cx, h - s2(18), 2, T_SAND, true);

  //    ② 一条干净连贯的外环大路（串起全图东南西北及四角 BOSS 祭坛，绝不绕圈迷路）
  const rMin = s2(34);
  const rMax = w - s2(34);
  carveSplineRoad(
    tiles,
    [
      [cx, s2(20)],
      [rMax, rMin],
      [w - s2(24), cy],
      [rMax, rMax],
      [cx, h - s2(20)],
      [rMin, rMax],
      [s2(24), cy],
      [rMin, rMin],
      [cx, s2(20)],
    ],
    2.1,
    T_SAND,
    seed + 101,
    true,
    0.08
  );

  //    ③ 四条简洁对角辐射林道（从主城门外直指四角领主祭坛 + 湖心岛木桥）
  carveCorridor(tiles, cx - 13, cy - 13, rMin, rMin, 1, T_DIRT, true);
  carveCorridor(tiles, cx + 13, cy - 13, rMax, rMin, 1, T_DIRT, true);
  carveCorridor(tiles, cx - 13, cy + 13, rMin, rMax, 1, T_DIRT, true);
  carveCorridor(tiles, cx + 13, cy + 13, rMax, rMax, 1, T_DIRT, true);
  if (worldId === 'world1') {
    carveCorridor(tiles, rMin, rMax, s2(48), s2(152), 1, T_SAND, true);
  }

  const bossArenas = getFixedBossArenas(worldId, w);
  for (const arena of bossArenas) {
    paintDisc(tiles, arena.tx, arena.ty, 11.0, T_GRASS);
    paintDisc(tiles, arena.tx, arena.ty, 7.6, T_SAND);
  }

  const signposts = getFixedSignposts(worldId, cx, cy, w);
  for (const sp of signposts) {
    paintDisc(tiles, Math.floor(sp.x / TILE), Math.floor(sp.y / TILE), 2.3, T_SAND);
  }

  const rawChests = worldId === 'world1' ? FIXED_CHEST_COORDS_W1 : FIXED_CHEST_COORDS_W2;
  const chests: ChestEntity[] = rawChests.map(([rtx, rty], idx) => {
    const tx = s(rtx);
    const ty = s(rty);
    paintDisc(tiles, tx, ty, 2.2, T_GRASS);
    return {
      tx,
      ty,
      x: tx * TILE + TILE / 2,
      y: ty * TILE + TILE / 2,
      opened: false,
      ph: (idx * 0.73) % TAU,
    };
  });

  clearRoadShoulders(tiles, w, h);

  const protectedPoints: [number, number][] = [
    ...bossArenas.map((a): [number, number] => [a.tx, a.ty]),
    ...signposts.map((sp): [number, number] => [Math.floor(sp.x / TILE), Math.floor(sp.y / TILE)]),
    ...chests.map((c): [number, number] => [c.tx, c.ty]),
  ];
  ensureFullConnectivity(tiles, cx, cy, protectedPoints);

  const decos: DecoEntity[] = [];
  const spriteSet = atlas ? atlas.byWorld[worldId] ?? atlas : null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tiles[y][x];
      if (t === T_TREE || t === T_ROCK) {
        decos.push({
          kind: t === T_TREE ? 'tree' : 'rock',
          x: x * TILE + TILE / 2,
          y: y * TILE + TILE / 2,
          v: hash2(x, y, 321 + seed),
          ph: hash2(x, y, 654 + seed) * TAU,
        });
      }
      if (spriteSet) {
        const hh = hash2(x, y, 5 + seed);
        const base = spriteSet.base[t] !== undefined ? spriteSet.base[t] : 0;
        const n = t === T_TREE ? spriteSet.dirtCount : 5;
        tileImgIdx[y * w + x] = base + Math.min(n - 1, Math.floor(hh * n));
      }
    }
  }

  const meta = WORLD_META[worldId];

  const awakening: NpcEntity = { kind: 'awakening', label: meta.awakeningName, x: (cx - 5) * TILE + TILE / 2, y: (cy - 3) * TILE + TILE / 2, r: 14, ph: 0.4 };
  const elder: NpcEntity = { kind: 'elder', label: meta.elderName, x: (cx - 5) * TILE + TILE / 2, y: (cy + 2) * TILE + TILE / 2, r: 14, ph: 1.5 };
  const merchant: NpcEntity = { kind: 'merchant', label: meta.merchantName, x: (cx - 3) * TILE + TILE / 2, y: (cy + 5) * TILE + TILE / 2, r: 14, ph: 0 };
  const blacksmith: NpcEntity = { kind: 'blacksmith', label: meta.blacksmithName, x: (cx + 5) * TILE + TILE / 2, y: (cy - 3) * TILE + TILE / 2, r: 14, ph: 2.2 };
  const armorer: NpcEntity = { kind: 'armorer', label: meta.armorerName, x: (cx + 6) * TILE + TILE / 2, y: (cy + 2) * TILE + TILE / 2, r: 14, ph: 3.1 };
  const upgrader: NpcEntity = { kind: 'upgrader', label: meta.upgraderName, x: (cx + 3) * TILE + TILE / 2, y: (cy + 5) * TILE + TILE / 2, r: 14, ph: 4.0 };
  const altar: AltarEntity = { label: meta.altarName, x: cx * TILE + TILE / 2, y: (cy - 5) * TILE + TILE / 2, r: 20, ph: 0.8 };

  const targetWorld: WorldId = worldId === 'world1' ? 'grand_city' : 'world1';
  const portal: PortalEntity = {
    x: cx * TILE + TILE / 2,
    y: (cy + 8) * TILE + TILE / 2,
    r: 24,
    ph: 2.1,
    targetWorld,
    label: meta.portalLabel,
  };

  const torches: TorchEntity[] = [
    { x: (cx - 7) * TILE + TILE / 2, y: (cy - 6) * TILE + TILE / 2, ph: 0.4 },
    { x: (cx + 7) * TILE + TILE / 2, y: (cy - 6) * TILE + TILE / 2, ph: 1.9 },
    { x: (cx - 7) * TILE + TILE / 2, y: (cy + 7) * TILE + TILE / 2, ph: 3.1 },
    { x: (cx + 7) * TILE + TILE / 2, y: (cy + 7) * TILE + TILE / 2, ph: 4.5 },
    { x: (cx - 3) * TILE + TILE / 2, y: (cy - 13) * TILE + TILE / 2, ph: 0.9 },
    { x: (cx + 3) * TILE + TILE / 2, y: (cy - 13) * TILE + TILE / 2, ph: 2.3 },
    { x: (cx - 3) * TILE + TILE / 2, y: (cy + 13) * TILE + TILE / 2, ph: 3.7 },
    { x: (cx + 3) * TILE + TILE / 2, y: (cy + 13) * TILE + TILE / 2, ph: 5.1 },
  ];

  return {
    seed,
    worldId,
    width: w,
    height: h,
    safeRadius: MAIN_CITY_SAFE_RADIUS,
    tiles,
    tileImgIdx,
    decos,
    chests,
    merchant,
    elder,
    awakening,
    armorer,
    blacksmith,
    upgrader,
    altar,
    portal,
    socialBoard: { x: (cx - 8) * TILE + TILE / 2, y: (cy + 1) * TILE + TILE / 2, r: 18, ph: 0.5, label: '📜 好友组队榜' },
    signposts,
    torches,
    bossArenas,
    regions: getWorldRegions(worldId, w),
    spawnX: cx * TILE + TILE / 2,
    spawnY: cy * TILE + TILE / 2,
  };
}

export function generateWorld(
  worldOrSeed: WorldId | number = 'world1',
  atlas?: TileSpriteAtlas | null,
  options?: { expandedOnline?: boolean; dungeonFloor?: number }
): WorldData {
  const worldId: WorldId =
    worldOrSeed === 'world2' || worldOrSeed === 'grand_city' || worldOrSeed === 'dungeon'
      ? worldOrSeed
      : 'world1';
  return generateFixedWorld(worldId, atlas, options);
}

export function verifyWorldConnectivity(world: WorldData): {
  reachableWalkableCount: number;
  totalWalkableCount: number;
  unreachableCount: number;
  unreachableLandmarks: string[];
} {
  const w = world.width;
  const h = world.height;
  const spawnTx = Math.floor(world.spawnX / TILE);
  const spawnTy = Math.floor(world.spawnY / TILE);
  const visited = new Uint8Array(w * h);
  const qx = new Int16Array(w * h);
  const qy = new Int16Array(w * h);
  let head = 0;
  let tail = 0;

  if (isTileWalkableId(world.tiles[spawnTy]?.[spawnTx])) {
    visited[spawnTy * w + spawnTx] = 1;
    qx[tail] = spawnTx;
    qy[tail] = spawnTy;
    tail++;
  }

  while (head < tail) {
    const x = qx[head];
    const y = qy[head];
    head++;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (let d = 0; d < 4; d++) {
      const nx = x + dirs[d][0];
      const ny = y + dirs[d][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const idx = ny * w + nx;
      if (visited[idx]) continue;
      if (!isTileWalkableId(world.tiles[ny][nx])) continue;
      visited[idx] = 1;
      qx[tail] = nx;
      qy[tail] = ny;
      tail++;
    }
  }

  let totalWalkableCount = 0;
  let reachableWalkableCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isTileWalkableId(world.tiles[y][x])) {
        totalWalkableCount++;
        if (visited[y * w + x]) reachableWalkableCount++;
      }
    }
  }

  const unreachableLandmarks: string[] = [];
  const checkPoint = (label: string, wx: number, wy: number) => {
    if (wx < 0 || wy < 0) return;
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    if (tx < 0 || ty < 0 || tx >= w || ty >= h || !visited[ty * w + tx]) {
      unreachableLandmarks.push(label);
    }
  };

  if (world.worldId !== 'dungeon') {
    checkPoint('merchant', world.merchant.x, world.merchant.y);
    checkPoint('elder', world.elder.x, world.elder.y);
    checkPoint('awakening', world.awakening.x, world.awakening.y);
    checkPoint('armorer', world.armorer.x, world.armorer.y);
    checkPoint('blacksmith', world.blacksmith.x, world.blacksmith.y);
    checkPoint('upgrader', world.upgrader.x, world.upgrader.y);
    checkPoint('altar', world.altar.x, world.altar.y);
  }
  checkPoint('portal', world.portal.x, world.portal.y);
  if (world.dungeonGate) checkPoint('dungeonGate', world.dungeonGate.x, world.dungeonGate.y);
  if (world.socialBoard) checkPoint('socialBoard', world.socialBoard.x, world.socialBoard.y);
  world.signposts.forEach((s) => checkPoint(`sign_${s.id}`, s.x, s.y));
  world.chests.forEach((c, i) => checkPoint(`chest_${i}`, c.x, c.y));
  world.bossArenas.forEach((b) => checkPoint(`boss_${b.id}`, b.x, b.y));

  return {
    reachableWalkableCount,
    totalWalkableCount,
    unreachableCount: totalWalkableCount - reachableWalkableCount,
    unreachableLandmarks,
  };
}

export function tileAt(tiles: Uint8Array[], wx: number, wy: number): number {
  const h = tiles.length;
  const w = h > 0 ? tiles[0].length : WW;
  const tx = Math.floor(wx / TILE);
  const ty = Math.floor(wy / TILE);
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return -1;
  return tiles[ty][tx];
}

export function isWaterAt(tiles: Uint8Array[], wx: number, wy: number): boolean {
  return tileAt(tiles, wx, wy) === T_WATER;
}

export function isRoadAt(tiles: Uint8Array[], wx: number, wy: number): boolean {
  const t = tileAt(tiles, wx, wy);
  return t === T_SAND || t === T_DIRT;
}

export function walkable(tiles: Uint8Array[], wx: number, wy: number): boolean {
  const t = tileAt(tiles, wx, wy);
  return t === T_GRASS || t === T_SAND || t === T_DIRT || t === T_WATER;
}

export function blocksProjectile(tiles: Uint8Array[], wx: number, wy: number): boolean {
  const t = tileAt(tiles, wx, wy);
  return t === -1 || t === T_ROCK || t === T_TREE;
}

export function isFree(tiles: Uint8Array[], x: number, y: number, r: number): boolean {
  return (
    walkable(tiles, x - r, y) &&
    walkable(tiles, x + r, y) &&
    walkable(tiles, x, y - r) &&
    walkable(tiles, x, y + r) &&
    walkable(tiles, x - r * 0.7, y - r * 0.7) &&
    walkable(tiles, x + r * 0.7, y + r * 0.7) &&
    walkable(tiles, x - r * 0.7, y + r * 0.7) &&
    walkable(tiles, x + r * 0.7, y - r * 0.7)
  );
}

export function moveEnt(
  tiles: Uint8Array[],
  e: { x: number; y: number; r: number; collR?: number },
  dx: number,
  dy: number,
  ignoreWaterSlow = false
): void {
  const r = e.collR || e.r;
  const mult = !ignoreWaterSlow && isWaterAt(tiles, e.x, e.y) ? WATER_SPEED_MULT : 1;
  const mx = dx * mult;
  const my = dy * mult;
  if (isFree(tiles, e.x + mx, e.y, r)) e.x += mx;
  if (isFree(tiles, e.x, e.y + my, r)) e.y += my;
}

export function tierAt(wx: number, wy: number, world?: { width: number; height: number }): number {
  const w = world?.width ?? WW;
  const h = world?.height ?? WH;
  const cx = (w >> 1) * TILE;
  const cy = (h >> 1) * TILE;
  const scale = 620 * (w / 150);
  return clamp(Math.hypot(wx - cx, wy - cy) / scale, 0, 5);
}
