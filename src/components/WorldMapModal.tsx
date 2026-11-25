import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Crosshair,
  Globe,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  UserPlus,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { WORLD_META } from '../game/rules';
import {
  drawFullWorldMap,
  type FullWorldMapLayers,
} from '../engine/renderer';
import type { RemotePlayerEntity } from '../engine/entities';
import type { FriendEntry, PlayMode, WorldId } from '../game/types';
import { TILE, type WorldData } from '../engine/world';

export interface WorldMapSnapshot {
  world: WorldData;
  playerX: number;
  playerY: number;
  playerAng: number;
  mobs: { x: number; y: number }[];
  boss: { x: number; y: number; name: string; fixedBossId: string } | null;
  bossCooldowns: Record<string, number>;
  friends?: FriendEntry[];
  remotePlayers?: RemotePlayerEntity[];
}

interface WorldMapModalProps {
  snapshot: WorldMapSnapshot;
  worldLevel: number;
  worldDifficulty: number;
  inSafeZone?: boolean;
  playMode?: PlayMode;
  onSwitchWorld?: (target: WorldId) => void;
  onQuickPartyInvite?: (uid: string) => void;
  onClose: () => void;
}

interface LandmarkEntry {
  id: string;
  name: string;
  category: 'region' | 'boss' | 'npc' | 'signpost';
  badge: string;
  color: string;
  tx: number;
  ty: number;
  desc: string;
}

function formatBearing(dx: number, dy: number): string {
  const dist = Math.hypot(dx, dy);
  if (dist < 2.5) return '就在脚下';
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg >= -22.5 && deg < 22.5) return '正东';
  if (deg >= 22.5 && deg < 67.5) return '东南';
  if (deg >= 67.5 && deg < 112.5) return '正南';
  if (deg >= 112.5 && deg < 157.5) return '西南';
  if (deg >= 157.5 || deg < -157.5) return '正西';
  if (deg >= -157.5 && deg < -112.5) return '西北';
  if (deg >= -112.5 && deg < -67.5) return '正北';
  return '东北';
}

export function WorldMapModal({
  snapshot,
  worldLevel,
  worldDifficulty,
  inSafeZone = false,
  playMode = 'singleplayer',
  onSwitchWorld,
  onQuickPartyInvite,
  onClose,
}: WorldMapModalProps) {
  const {
    world,
    playerX,
    playerY,
    playerAng,
    mobs,
    boss,
    bossCooldowns,
    friends = [],
    remotePlayers = [],
  } = snapshot;
  const meta = WORLD_META[world.worldId];
  const playerTx = Math.round(playerX / TILE);
  const playerTy = Math.round(playerY / TILE);
  const mapMaxDim = Math.max(world.width, world.height);

  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderGeomRef = useRef<{ viewOriginX: number; viewOriginY: number; scale: number }>({
    viewOriginX: 0,
    viewOriginY: 0,
    scale: 2,
  });

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [layers, setLayers] = useState<FullWorldMapLayers>({
    showRegions: true,
    showNpcs: true,
    showBosses: true,
    showChests: true,
    showSignposts: true,
    showMobs: true,
  });
  const [dirTab, setDirTab] = useState<'landmarks' | 'friends'>('landmarks');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 560, h: 420 });

  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
  }>({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    origPanX: 0,
    origPanY: 0,
  });

  const landmarks = useMemo<LandmarkEntry[]>(() => {
    const out: LandmarkEntry[] = [];
    for (const reg of world.regions) {
      out.push({
        id: `reg_${reg.id}`,
        name: reg.name,
        category: 'region',
        badge: reg.danger,
        color:
          reg.kind === 'city'
            ? '#67e8f9'
            : reg.kind === 'water'
            ? '#93c5fd'
            : reg.kind === 'mountain'
            ? '#fda4af'
            : reg.kind === 'plains'
            ? '#fde68a'
            : '#86efac',
        tx: reg.tx,
        ty: reg.ty,
        desc: reg.subtitle,
      });
    }
    for (const arena of world.bossArenas) {
      const active = boss?.fixedBossId === arena.id;
      const cd = Math.ceil(bossCooldowns[arena.id] ?? 0);
      out.push({
        id: `boss_${arena.id}`,
        name: arena.name,
        category: 'boss',
        badge: active ? '现身战斗中' : cd > 0 ? `重生 ${cd}s` : '领主祭坛',
        color: '#fda4af',
        tx: arena.tx,
        ty: arena.ty,
        desc: `${arena.title} · 进入祭坛圈自动苏醒`,
      });
    }
    out.push(
      {
        id: 'npc_elder',
        name: meta.elderName,
        category: 'npc',
        badge: '悬赏/破境',
        color: '#2dd4bf',
        tx: Math.round(world.elder.x / TILE),
        ty: Math.round(world.elder.y / TILE),
        desc: '接取每日悬赏与每10级境界突破试炼',
      },
      {
        id: 'npc_awakening',
        name: meta.awakeningName,
        category: 'npc',
        badge: '职业觉醒',
        color: '#38bdf8',
        tx: Math.round(world.awakening.x / TILE),
        ty: Math.round(world.awakening.y / TILE),
        desc: '选择近战5系 / 远程5系或隐藏职业觉醒',
      },
      {
        id: 'npc_blacksmith',
        name: meta.blacksmithName,
        category: 'npc',
        badge: '原料锻造',
        color: '#fb923c',
        tx: Math.round(world.blacksmith.x / TILE),
        ty: Math.round(world.blacksmith.y / TILE),
        desc: '消耗野外收集的20种原料锻造传奇神装',
      },
      {
        id: 'npc_portal',
        name: meta.portalLabel,
        category: 'npc',
        badge: '跨界传送',
        color: '#f472b6',
        tx: Math.round(world.portal.x / TILE),
        ty: Math.round(world.portal.y / TILE),
        desc: world.worldId === 'world1' ? '前往熔火焦土【第二世界】' : '返回翡翠苍穹【第一世界】',
      }
    );
    for (const sp of world.signposts) {
      out.push({
        id: `sign_${sp.id}`,
        name: sp.title,
        category: 'signpost',
        badge: sp.dangerLevel,
        color: '#fde68a',
        tx: Math.round(sp.x / TILE),
        ty: Math.round(sp.y / TILE),
        desc: `${sp.direction} → ${sp.destDesc}`,
      });
    }
    return out;
  }, [world, meta, boss, bossCooldowns]);

  const selectedLandmark = useMemo(
    () => landmarks.find((l) => l.id === selectedId) ?? null,
    [landmarks, selectedId]
  );

  // Measure canvas container accurately on resize / orientation change
  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const updateSize = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 40) {
        setCanvasSize({
          w: Math.floor(rect.width),
          h: Math.floor(rect.height),
        });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Draw Full World Map Canvas whenever zoom/pan/layers/selection/size updates
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = canvasSize.w;
    c.height = canvasSize.h;
    renderGeomRef.current = drawFullWorldMap(c, world, {
      playerX,
      playerY,
      playerAng,
      mobs,
      boss,
      bossCooldowns,
      friends,
      remotePlayers,
      zoom,
      panX: pan.x,
      panY: pan.y,
      layers,
      selectedTx: selectedLandmark?.tx ?? null,
      selectedTy: selectedLandmark?.ty ?? null,
    });
  }, [
    world,
    playerX,
    playerY,
    playerAng,
    mobs,
    boss,
    bossCooldowns,
    friends,
    remotePlayers,
    zoom,
    pan,
    layers,
    selectedLandmark,
    canvasSize,
  ]);

  const focusOnTile = (tx: number, ty: number, targetZoom?: number) => {
    const nextZoom = targetZoom ?? Math.max(zoom, 1.5);
    const size = Math.min(canvasSize.w, canvasSize.h);
    const scale = (size / mapMaxDim) * nextZoom;
    setZoom(nextZoom);
    setPan({
      x: (world.width / 2 - tx) * scale,
      y: (world.height / 2 - ty) * scale,
    });
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleCanvasTap = (clientX: number, clientY: number) => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { viewOriginX, viewOriginY, scale } = renderGeomRef.current;
    const tapTx = (x - viewOriginX) / scale;
    const tapTy = (y - viewOriginY) / scale;

    let closest: { id: string; dist: number } | null = null;
    for (const lm of landmarks) {
      const d = Math.hypot(tapTx - lm.tx, tapTy - lm.ty);
      if (d <= 12 / Math.max(1, zoom * 0.75) && (!closest || d < closest.dist)) {
        closest = { id: lm.id, dist: d };
      }
    }
    if (closest) {
      setSelectedId(closest.id);
    }
  };

  const unopenedChests = world.chests.filter((c) => !c.opened).length;

  const layerOptions: { key: keyof FullWorldMapLayers; label: string; dot: string }[] = [
    { key: 'showRegions', label: '区域地名', dot: '#67e8f9' },
    { key: 'showNpcs', label: '主城NPC', dot: '#2dd4bf' },
    { key: 'showBosses', label: '领主祭坛', dot: '#fb7185' },
    { key: 'showSignposts', label: '路牌指引', dot: '#fde68a' },
    { key: 'showChests', label: '未开宝箱', dot: '#fbbf24' },
    { key: 'showMobs', label: '魔物位置', dot: '#ef4444' },
  ];

  return (
    <div
      className="modal-backdrop bg-slate-950/75"
      role="dialog"
      aria-modal="true"
      aria-labelledby="world-map-modal-title"
    >
      <div className="modal-shell max-w-5xl rounded-2xl bg-[#0a111d]/96 border-2 border-emerald-400/40 p-3 sm:p-5 shadow-[0_24px_80px_rgba(0,0,0,0.92)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800 shrink-0">
          <div className="min-w-0">
            <h2
              id="world-map-modal-title"
              className="text-base sm:text-lg font-bold text-emerald-300 flex items-center gap-2 truncate"
            >
              <Compass className="w-5 h-5 shrink-0" />
              {meta.name} · 全境地理舆图
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 truncate tabular-nums">
              当前坐标 ({playerTx}, {playerTy}) · 世界 Lv.{worldLevel} (×{worldDifficulty}) · 未开启宝箱 {unopenedChests} 个
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
            {onSwitchWorld && inSafeZone && world.worldId !== 'dungeon' && (
              <div className="hidden md:flex items-center gap-1 mr-1">
                {(
                  [
                    { id: 'world1', label: '晨曦大陆' },
                    { id: 'grand_city', label: '幻光王城' },
                    { id: 'world2', label: '烈焰深渊' },
                  ] as { id: WorldId; label: string }[]
                ).map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    disabled={world.worldId === w.id}
                    onClick={() => onSwitchWorld(w.id)}
                    className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold border transition-colors ${
                      world.worldId === w.id
                        ? 'bg-emerald-500/25 border-emerald-400/60 text-emerald-200 cursor-default'
                        : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 cursor-pointer'
                    }`}
                  >
                    <Globe className="w-3 h-3 inline mr-1" />
                    {w.label}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => focusOnTile(playerTx, playerTy, Math.max(1.5, zoom))}
              className="min-h-[40px] px-2.5 sm:px-3 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/45 text-sky-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <Crosshair className="w-4 h-4" />
              <span className="hidden sm:inline">定位自己</span>
            </button>
            <button
              type="button"
              data-testid="close-world-map-btn"
              onClick={onClose}
              aria-label="关闭世界地图"
              className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-200 cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile World Switcher (visible below md when in safe zone) */}
        {onSwitchWorld && inSafeZone && world.worldId !== 'dungeon' && (
          <div className="mt-2 flex md:hidden items-center gap-1.5 overflow-x-auto shrink-0">
            {(
              [
                { id: 'world1', label: '晨曦大陆' },
                { id: 'grand_city', label: '幻光王城' },
                { id: 'world2', label: '烈焰深渊' },
              ] as { id: WorldId; label: string }[]
            ).map((w) => (
              <button
                key={w.id}
                type="button"
                disabled={world.worldId === w.id}
                onClick={() => onSwitchWorld(w.id)}
                className={`flex-1 min-h-[34px] px-2 rounded-lg text-[11px] font-bold border whitespace-nowrap transition-colors ${
                  world.worldId === w.id
                    ? 'bg-emerald-500/25 border-emerald-400/60 text-emerald-200 cursor-default'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 cursor-pointer'
                }`}
              >
                <Globe className="w-3 h-3 inline mr-1" />
                {w.label}
              </button>
            ))}
          </div>
        )}

        {/* Layer Filters & Zoom Controls */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400 flex items-center gap-1 mr-0.5">
              <Layers className="w-3.5 h-3.5" />
              图层:
            </span>
            {layerOptions.map((opt) => {
              const active = layers[opt.key];
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setLayers((prev) => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                  className={`min-h-[34px] sm:min-h-[30px] px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 border cursor-pointer transition-colors ${
                    active
                      ? 'bg-slate-800 border-slate-500 text-slate-100'
                      : 'bg-slate-950/70 border-slate-800 text-slate-500'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: active ? opt.dot : '#475569' }}
                  />
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
              disabled={zoom <= 1}
              aria-label="缩小地图"
              className="min-w-[38px] min-h-[36px] rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 flex items-center justify-center text-slate-200 cursor-pointer"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-slate-200 tabular-nums min-w-[40px] text-center">
              {zoom.toFixed(1)}×
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.5).toFixed(1))))}
              disabled={zoom >= 2.5}
              aria-label="放大地图"
              className="min-w-[38px] min-h-[36px] rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 flex items-center justify-center text-slate-200 cursor-pointer"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={resetView}
              aria-label="重置地图视角"
              className="min-h-[36px] px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1 cursor-pointer"
            >
              {zoom > 1 ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              全景
            </button>
          </div>
        </div>

        {/* Main Content: Map Canvas + Landmark Directory */}
        <div className="mt-2.5 flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 gap-2.5 sm:gap-3 overflow-hidden">
          {/* Interactive Map Canvas */}
          <div className="lg:col-span-8 flex flex-col shrink-0 lg:shrink lg:min-h-0">
            <div
              ref={canvasWrapRef}
              className="relative h-[215px] sm:h-[280px] lg:h-auto lg:flex-1 lg:min-h-[340px] rounded-xl overflow-hidden border border-slate-700/80 bg-[#060a10] touch-none"
            >
              <canvas
                ref={canvasRef}
                data-testid="world-map-canvas"
                className="block w-full h-full cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => {
                  dragRef.current = {
                    active: true,
                    moved: false,
                    startX: e.clientX,
                    startY: e.clientY,
                    origPanX: pan.x,
                    origPanY: pan.y,
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!dragRef.current.active) return;
                  const dx = e.clientX - dragRef.current.startX;
                  const dy = e.clientY - dragRef.current.startY;
                  if (Math.hypot(dx, dy) > 5) dragRef.current.moved = true;
                  setPan({
                    x: dragRef.current.origPanX + dx,
                    y: dragRef.current.origPanY + dy,
                  });
                }}
                onPointerUp={(e) => {
                  if (!dragRef.current.moved) {
                    handleCanvasTap(e.clientX, e.clientY);
                  }
                  dragRef.current.active = false;
                }}
                onPointerCancel={() => {
                  dragRef.current.active = false;
                }}
              />
            </div>

            {/* Clean Legend Strip outside Canvas */}
            <div className="mt-1.5 rounded-lg bg-slate-900/80 border border-slate-800 px-2.5 py-1 text-[10px] sm:text-[11px] text-slate-300 flex flex-wrap items-center gap-x-2.5 sm:gap-x-3 gap-y-0.5 shrink-0">
              <span className="text-sky-300 font-bold">● 冒险者</span>
              <span className="text-emerald-300">◌ 安全区</span>
              <span className="text-rose-300">◎ 领主祭坛</span>
              <span className="text-amber-300">■ 宝箱</span>
              <span className="text-amber-200">◆ 路牌</span>
              <span className="text-slate-400">可拖拽平移 · 点击地标测距</span>
            </div>
          </div>

          {/* Right/Bottom: Directory Tabs (Landmarks vs Online Friend Locator) */}
          <div className="lg:col-span-4 flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
            {playMode === 'online' && (
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setDirTab('landmarks')}
                  className={`min-h-[32px] rounded-md text-xs font-bold cursor-pointer transition-colors ${
                    dirTab === 'landmarks'
                      ? 'bg-emerald-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  地标目录 ({landmarks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDirTab('friends')}
                  className={`min-h-[32px] rounded-md text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                    dirTab === 'friends'
                      ? 'bg-cyan-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  好友定位 ({friends.length})
                </button>
              </div>
            )}

            {dirTab === 'friends' && playMode === 'online' ? (
              <div className="flex-1 min-h-0 overflow-y-auto game-scroll pr-0.5 space-y-2 pb-3">
                {friends.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-xs text-slate-400">
                    暂无好友。前往社交公告栏输入好友码即可互加好友、实时定位与快速组队。
                  </div>
                ) : (
                  friends.map((fr) => {
                    const frTx = fr.x !== undefined ? Math.round(fr.x / TILE) : null;
                    const frTy = fr.y !== undefined ? Math.round(fr.y / TILE) : null;
                    const sameWorld = fr.online && fr.worldId === world.worldId && frTx !== null && frTy !== null;
                    const wName = fr.worldId ? WORLD_META[fr.worldId]?.name ?? fr.worldId : '离线';
                    return (
                      <div
                        key={fr.uid}
                        className="rounded-xl border border-slate-700/80 bg-slate-900/75 p-2.5 flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-100 truncate">
                              {fr.online ? '🟢' : '⚫'} {fr.name}
                              {fr.level ? ` · Lv.${fr.level}` : ''}
                            </div>
                            <div className="text-[10px] text-slate-400 tabular-nums">
                              {fr.online
                                ? `${wName}${frTx !== null ? ` (${frTx}, ${frTy})` : ''}`
                                : '当前离线'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {sameWorld && frTx !== null && frTy !== null && (
                              <button
                                type="button"
                                onClick={() => focusOnTile(frTx, frTy, 1.8)}
                                className="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/50 text-sky-200 text-[10px] font-bold cursor-pointer"
                              >
                                定位
                              </button>
                            )}
                            {fr.online && onQuickPartyInvite && (
                              <button
                                type="button"
                                onClick={() => onQuickPartyInvite(fr.uid)}
                                className="px-2 py-1 rounded bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                              >
                                <UserPlus className="w-3 h-3" />
                                组队
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <>
                {selectedLandmark ? (
                  <div
                    data-testid="world-map-selected-card"
                    className="rounded-xl border border-amber-400/50 bg-slate-900/90 p-2.5 sm:p-3 shrink-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold flex items-center gap-1.5" style={{ color: selectedLandmark.color }}>
                        <MapPin className="w-4 h-4 shrink-0" />
                        {selectedLandmark.name}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-200 tabular-nums">
                        ({selectedLandmark.tx}, {selectedLandmark.ty})
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">{selectedLandmark.desc}</p>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-amber-300 tabular-nums">
                      <span>
                        方位：{formatBearing(selectedLandmark.tx - playerTx, selectedLandmark.ty - playerTy)} · 距离{' '}
                        {Math.round(Math.hypot(selectedLandmark.tx - playerTx, selectedLandmark.ty - playerTy))} 格
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-400/35">
                        {selectedLandmark.badge}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/65 p-2.5 text-xs text-slate-400 shrink-0">
                    点击地图上的地标或下方目录条目，可定位并查看相对方位与距离（快捷键 N / Tab 关闭）。
                  </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto game-scroll pr-0.5 space-y-1.5 pb-3">
                  {landmarks.map((lm) => {
                    const isSel = lm.id === selectedId;
                    const d = Math.round(Math.hypot(lm.tx - playerTx, lm.ty - playerTy));
                    const dir = formatBearing(lm.tx - playerTx, lm.ty - playerTy);
                    return (
                      <button
                        key={lm.id}
                        type="button"
                        data-testid={`world-map-landmark-${lm.id}`}
                        onClick={() => {
                          setSelectedId(lm.id);
                          focusOnTile(lm.tx, lm.ty, Math.max(zoom, 1.5));
                        }}
                        className={`w-full min-h-[44px] rounded-xl px-3 py-2 border text-left transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                          isSel
                            ? 'border-amber-400/65 bg-amber-950/25'
                            : 'border-slate-800 bg-slate-900/70 hover:border-slate-600'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate" style={{ color: lm.color }}>
                            {lm.name}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{lm.badge}</div>
                        </div>
                        <div className="text-right text-[10px] text-slate-300 tabular-nums shrink-0">
                          <div>{dir}</div>
                          <div className="text-slate-400">{d} 格</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
