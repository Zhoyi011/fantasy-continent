import { memo, useRef, type RefObject } from 'react';
import { Backpack, Building2, Maximize2, Pause, Save, Users, Volume2, VolumeX } from 'lucide-react';
import { CLASS_DEFS, findQuestDefById, WORLD_META } from '../game/rules';
import type { DayPhase, HudSnapshot, InteractTargetKind } from '../game/types';
import { MobileControls } from './MobileControls';
import { VirtualJoystick } from './VirtualJoystick';

interface HUDProps {
  hud: HudSnapshot;
  minimapRef: RefObject<HTMLCanvasElement | null>;
  showTouchControls: boolean;
  isCompactViewport: boolean;
  isPortrait: boolean;
  viewportW: number;
  onlineConnected?: boolean;
  partyCount?: number;
  inParty?: boolean;
  roomCode?: string | null;
  roomRole?: 'host' | 'guest' | null;
  onTriggerSkill: (
    slot: 'basic' | 'q' | 'e' | 'c' | 'v' | 'dash' | 'potion',
    source?: 'mouse' | 'virtual'
  ) => void;
  onJoystickVector: (x: number, y: number) => void;
  onVirtualAttackHold: (held: boolean) => void;
  onToggleInventory: () => void;
  onOpenWorldMap: () => void;
  onOpenDungeon: () => void;
  onEnterDungeonFloor?: (floor: number) => void;
  onExitDungeon: () => void;
  onOpenSocial: () => void;
  onInteract: () => void;
  onToggleMute: () => void;
  onManualSave: () => void;
  onOpenPause: () => void;
}

const PHASE_ICON: Record<DayPhase, string> = {
  白天: '☀️',
  黄昏: '🌅',
  夜晚: '🌙',
  黎明: '🌄',
};

function getInteractStyle(kind: InteractTargetKind, atLevelCap: boolean): string {
  switch (kind) {
    case 'awakening':
      return 'bg-slate-950/82 hover:bg-cyan-950/88 border-cyan-400/70 text-cyan-200';
    case 'merchant':
      return 'bg-slate-950/82 hover:bg-amber-950/88 border-amber-400/65 text-amber-300';
    case 'armorer':
      return 'bg-slate-950/82 hover:bg-sky-950/88 border-sky-400/65 text-sky-200';
    case 'blacksmith':
      return 'bg-slate-950/82 hover:bg-orange-950/88 border-orange-400/65 text-orange-200';
    case 'upgrader':
      return 'bg-slate-950/82 hover:bg-purple-950/88 border-purple-400/65 text-purple-200';
    case 'altar':
      return 'bg-slate-950/82 hover:bg-indigo-950/88 border-indigo-400/65 text-indigo-300';
    case 'portal':
      return 'bg-slate-950/82 hover:bg-fuchsia-950/88 border-fuchsia-400/70 text-fuchsia-200';
    case 'signpost':
      return 'bg-slate-950/82 hover:bg-emerald-950/88 border-emerald-400/65 text-emerald-200';
    case 'dungeon_gate':
      return 'bg-slate-950/82 hover:bg-amber-950/88 border-amber-400/75 text-amber-200';
    case 'social_board':
      return 'bg-slate-950/82 hover:bg-cyan-950/88 border-cyan-400/70 text-cyan-200';
    case 'elder':
    default:
      return atLevelCap
        ? 'bg-slate-950/82 hover:bg-pink-950/88 border-pink-400/75 text-pink-200'
        : 'bg-slate-950/82 hover:bg-teal-950/88 border-teal-400/65 text-teal-300';
  }
}

function getCompactPortalTarget(
  worldId: HudSnapshot['worldId'],
  dungeonFloor: number | null,
  dungeonCleared: boolean
): string {
  switch (worldId) {
    case 'world1':
      return '前往幻光王城';
    case 'world2':
      return '回晨曦大陆';
    case 'grand_city':
      return '前往试炼大陆';
    case 'dungeon':
    default:
      return dungeonCleared
        ? `前往 ${(dungeonFloor ?? 1) + 1}F`
        : '传送门(先斩首领)';
  }
}

function getInteractLabel(
  kind: InteractTargetKind,
  worldId: HudSnapshot['worldId'],
  worldMeta: (typeof WORLD_META)['world1'],
  showTouchControls: boolean,
  atLevelCap: boolean,
  dungeonFloor: number | null,
  dungeonCleared: boolean
): string {
  const keyHint = showTouchControls ? '' : '[F] ';
  switch (kind) {
    case 'awakening':
      return `✨ ${keyHint}觉醒职业`;
    case 'merchant':
      return `🏪 ${keyHint}${worldMeta.merchantName}`;
    case 'armorer':
      return `🛡️ ${keyHint}${worldMeta.armorerName}`;
    case 'blacksmith':
      return `⚒️ ${keyHint}${worldMeta.blacksmithName}`;
    case 'upgrader':
      return `🔮 ${keyHint}${worldMeta.upgraderName}`;
    case 'altar':
      return `⛩️ ${keyHint}参拜祭坛`;
    case 'portal':
      return `${worldId === 'dungeon' && !dungeonCleared ? '🔒' : '🌀'} ${keyHint}${getCompactPortalTarget(
        worldId,
        dungeonFloor,
        dungeonCleared
      )}`;
    case 'signpost':
      return `🪧 ${keyHint}路牌指引`;
    case 'dungeon_gate':
      return worldId === 'dungeon' ? `🚪 ${keyHint}撤离试炼之塔` : `🗼 ${keyHint}试炼之塔`;
    case 'social_board':
      return `🤝 ${keyHint}组队公告栏`;
    case 'elder':
    default:
      return atLevelCap ? `🌟 ${keyHint}突破境界` : `📜 ${keyHint}对话长老`;
  }
}

export function HUD({
  hud,
  minimapRef,
  showTouchControls,
  isCompactViewport,
  isPortrait,
  viewportW,
  onlineConnected = false,
  partyCount = 0,
  inParty = false,
  roomCode = null,
  roomRole = null,
  onTriggerSkill,
  onJoystickVector,
  onVirtualAttackHold,
  onToggleInventory,
  onOpenWorldMap,
  onOpenDungeon,
  onEnterDungeonFloor,
  onExitDungeon,
  onOpenSocial,
  onInteract,
  onToggleMute,
  onManualSave,
  onOpenPause,
}: HUDProps) {
  const lastInteractTouchTsRef = useRef(0);
  const cls = CLASS_DEFS[hud.classId];
  const worldMeta = WORLD_META[hud.worldId];
  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const mpPct = Math.max(0, Math.min(100, (hud.mp / hud.maxMp) * 100));
  const xpPct = Math.max(0, Math.min(100, (hud.exp / hud.expNeeded) * 100));

  const questDef = hud.activeQuest
    ? findQuestDefById(hud.activeQuest.questId, hud.breakthroughTier, hud.worldId)
    : null;

  const modalOpen =
    hud.paused ||
    hud.shopOpen ||
    hud.questOpen ||
    hud.inventoryOpen ||
    hud.talentOpen ||
    hud.bestiaryOpen ||
    hud.awakeningOpen ||
    hud.armorerOpen ||
    hud.blacksmithOpen ||
    hud.upgraderOpen ||
    hud.worldMapOpen ||
    hud.dungeonOpen ||
    hud.socialOpen;

  const compactHud = showTouchControls || isCompactViewport;
  const compactLandscapeHud = !isPortrait && (showTouchControls || viewportW < 960);
  const compactPortraitTouch = isPortrait && viewportW < 440;

  return (
    <div className="fixed inset-0 pointer-events-none z-10">
      {/* Top-Left: Vitality Bars & Active Bounty Quest Tracker */}
      <div
        data-testid="hud-top-left"
        className={`absolute safe-hud-tl flex flex-col gap-1.5 ${
          isPortrait
            ? 'w-[min(256px,calc(100vw-130px))]'
            : compactHud
            ? 'w-[215px] sm:w-[245px]'
            : 'w-[292px] gap-2'
        }`}
      >
        <div
          className={`relative rounded-lg bg-slate-950/80 border border-white/15 overflow-hidden shadow-md ${
            compactHud ? 'h-[18px]' : 'h-[22px]'
          }`}
        >
          <div
            className="h-full w-full origin-left bg-gradient-to-r from-red-700 to-rose-400"
            style={{ transform: `scaleX(${hpPct / 100})` }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-[11px] font-bold text-white tabular-nums [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
            HP {Math.ceil(hud.hp)} / {hud.maxHp}
            {hud.shieldHp > 0 ? ` 🛡+${Math.ceil(hud.shieldHp)}` : ''}
          </span>
        </div>

        <div
          className={`relative rounded-lg bg-slate-950/80 border border-white/15 overflow-hidden shadow-md ${
            compactHud ? 'h-[16px]' : 'h-[20px]'
          }`}
        >
          <div
            className="h-full w-full origin-left bg-gradient-to-r from-blue-700 to-sky-400"
            style={{ transform: `scaleX(${mpPct / 100})` }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-[11px] font-bold text-white tabular-nums [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
            MP {Math.floor(hud.mp)} / {hud.maxMp}
          </span>
        </div>

        <div
          className={`relative rounded-lg bg-slate-950/80 border overflow-hidden shadow-md ${
            hud.atLevelCap ? 'border-pink-400/75' : 'border-white/15'
          } ${compactHud ? 'h-[14px]' : 'h-[16px]'}`}
        >
          <div
            className={`h-full w-full origin-left ${
              hud.atLevelCap
                ? 'bg-gradient-to-r from-pink-600 to-amber-300'
                : 'bg-gradient-to-r from-purple-700 to-violet-300'
            }`}
            style={{ transform: `scaleX(${xpPct / 100})` }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-white tabular-nums [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
            {hud.atLevelCap
              ? `Lv.${hud.level} 上限！找${worldMeta.elderName}突破`
              : `Lv.${hud.level}/${hud.levelCap} · EXP ${Math.floor(hud.exp)}/${hud.expNeeded}`}
          </span>
        </div>

        {/* World Level / Mode / Safe Zone / Realm / Water Status Row */}
        <div className="flex flex-wrap items-center gap-1 text-[10px] font-semibold">
          <span
            data-testid="hud-world-level"
            className={`rounded-md px-1.5 py-0.5 border tabular-nums ${
              hud.worldId === 'world2'
                ? 'bg-rose-950/85 border-rose-500/45 text-rose-200'
                : hud.worldId === 'grand_city'
                ? 'bg-amber-950/85 border-amber-400/45 text-amber-200'
                : hud.worldId === 'dungeon'
                ? 'bg-purple-950/85 border-purple-400/50 text-purple-200'
                : 'bg-slate-950/85 border-emerald-500/40 text-emerald-200'
            }`}
          >
            {hud.worldId === 'world2'
              ? '🌋'
              : hud.worldId === 'grand_city'
              ? '🏰'
              : hud.worldId === 'dungeon'
              ? '🗼'
              : '🌲'}{' '}
            {hud.worldName} · 世界 Lv.{hud.worldLevel} (×{hud.worldDifficulty})
          </span>
          {hud.playMode === 'online' && (
            <button
              type="button"
              tabIndex={-1}
              data-testid="hud-online-badge"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenSocial();
              }}
              className={`pointer-events-auto rounded-md px-1.5 py-0.5 border font-bold tabular-nums cursor-pointer transition-colors ${
                onlineConnected && roomCode
                  ? inParty
                    ? 'bg-emerald-950/95 border-emerald-400/70 text-emerald-200 hover:bg-emerald-900'
                    : 'bg-cyan-950/95 border-cyan-400/65 text-cyan-200 hover:bg-cyan-900'
                  : 'bg-slate-900/90 border-slate-600 text-slate-300'
              }`}
              title="点击管理联机房间与组队 (P)"
            >
              {onlineConnected && roomCode
                ? `🌐 ${roomCode} · ${roomRole === 'host' ? '房主' : '队员'}${
                    inParty ? ` · 队伍${partyCount}/4` : partyCount > 1 ? ` · ${partyCount}人` : ''
                  }`
                : '🌐 连接中...'}
            </button>
          )}
          <span className="rounded-md px-1.5 py-0.5 bg-slate-950/85 border border-fuchsia-400/40 text-fuchsia-200">
            ✦ {hud.realmName}
          </span>
          {hud.inSafeZone && (
            <span
              data-testid="hud-safe-zone"
              className="rounded-md px-1.5 py-0.5 bg-cyan-950/90 border border-cyan-400/50 text-cyan-200"
            >
              🛡️ {worldMeta.cityName} · 安全区
            </span>
          )}
          {!hud.awakened && (
            <span className="rounded-md px-1.5 py-0.5 bg-amber-950/90 border border-amber-400/55 text-amber-200">
              ✨ 找觉醒导师转职(40系)
            </span>
          )}
          {hud.inWater && (
            <span className="rounded-md px-1.5 py-0.5 bg-sky-950/90 border border-sky-400/50 text-sky-200">
              🌊 涉水 -45%
            </span>
          )}
          <span
            data-testid="hud-weather-badge"
            title={`${hud.weather.label}：${hud.weather.effectSummary}`}
            className={`rounded-md px-1.5 py-0.5 border tabular-nums ${
              hud.weather.kind === 'thunderstorm'
                ? 'bg-indigo-950/90 border-amber-400/65 text-amber-200'
                : hud.weather.kind === 'drizzle'
                ? 'bg-sky-950/90 border-sky-400/55 text-sky-200'
                : hud.weather.kind === 'snow'
                ? 'bg-cyan-950/90 border-cyan-300/60 text-cyan-100'
                : hud.weather.kind === 'fog'
                ? 'bg-slate-900/90 border-slate-400/55 text-slate-200'
                : 'bg-amber-950/85 border-amber-400/45 text-amber-200'
            }`}
          >
            {hud.weather.icon} {hud.weather.label}
            {hud.weather.kind !== 'clear' ? ` · ${hud.weather.effectSummary}` : ''}
          </span>
        </div>

        {/* Active Dungeon Floor Tracker */}
        {hud.dungeonFloor !== null && (
          <div
            data-testid="hud-dungeon-banner"
            className="pointer-events-auto rounded-lg bg-purple-950/90 border border-purple-400/60 px-2.5 py-1.5 text-[11px] flex items-center justify-between gap-2 shadow-lg"
          >
            <div className="min-w-0 truncate text-purple-100 font-bold tabular-nums">
              🗼 试炼之塔 {hud.dungeonFloor}F ·{' '}
              {hud.dungeonCleared
                ? '已通关！北门已开'
                : `剩余守卫 ${hud.dungeonMobsRemaining}${hud.boss ? ' + 首领' : ''}`}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {hud.dungeonCleared && onEnterDungeonFloor && (
                <button
                  type="button"
                  data-testid="next-dungeon-floor-btn"
                  onClick={() => onEnterDungeonFloor((hud.dungeonFloor ?? 1) + 1)}
                  className="px-2 py-0.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[10px] font-black shrink-0 cursor-pointer"
                >
                  前往 {(hud.dungeonFloor ?? 1) + 1}F
                </button>
              )}
              <button
                type="button"
                data-testid="exit-dungeon-btn"
                onClick={onExitDungeon}
                className="px-2 py-0.5 rounded bg-rose-500/85 hover:bg-rose-400 text-white text-[10px] font-bold shrink-0 cursor-pointer"
              >
                脱离副本
              </button>
            </div>
          </div>
        )}

        {/* Active Quest Tracker */}
        <div
          className={`rounded-lg bg-slate-950/82 border shadow-md ${
            hud.atLevelCap && (!hud.activeQuest || !questDef?.isBreakthrough)
              ? 'border-pink-400/70'
              : 'border-slate-700/60'
          } ${compactHud ? 'px-2 py-1 text-[10px]' : 'mt-0.5 px-3 py-2 text-xs'}`}
        >
          {questDef && hud.activeQuest ? (
            <div>
              <div className="flex items-center justify-between gap-2 text-slate-100 font-semibold">
                <span className="truncate">
                  {questDef.isBreakthrough ? '🌟' : '📜'} {questDef.title}
                </span>
                <span
                  className={`tabular-nums shrink-0 ${
                    hud.activeQuest.completed ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  {hud.activeQuest.progress}/{questDef.target}
                </span>
              </div>
              {!compactHud && (
                <div className="mt-1 text-[11px] text-slate-400">
                  {hud.activeQuest.completed
                    ? `已完成！找${worldMeta.elderName}领奖${questDef.isBreakthrough ? '突破' : ''} (F)`
                    : questDef.desc}
                </div>
              )}
            </div>
          ) : hud.atLevelCap ? (
            <div className="text-[10px] sm:text-[11px] text-pink-300 font-semibold truncate">
              🌟 已达 Lv.{hud.levelCap}！找{worldMeta.elderName}接取破境试炼
            </div>
          ) : (
            <div className="text-[10px] sm:text-[11px] text-slate-400 truncate">
              {compactHud
                ? `主城内可觉醒/锻造/接悬赏`
                : `主城内可找觉醒导师、长老、铁匠、强化师与商人`}
            </div>
          )}
        </div>
      </div>

      {/* Top-Center: Combo Counter (连击计数器) */}
      {hud.comboCount > 0 && (() => {
        const c = hud.comboCount;
        const isGolden = c >= 50;
        const isTier3 = c >= 25 && c < 50;
        const isTier2 = c >= 10 && c < 25;
        const boxTone = isGolden
          ? 'bg-gradient-to-b from-amber-900/95 via-amber-950/95 to-slate-950/95 border-amber-300/90 text-amber-200 combo-gold-aura'
          : isTier3
          ? 'bg-gradient-to-b from-fuchsia-950/92 to-slate-950/95 border-fuchsia-400/75 text-fuchsia-200 shadow-[0_0_18px_rgba(217,70,239,0.35)]'
          : isTier2
          ? 'bg-gradient-to-b from-cyan-950/92 to-slate-950/95 border-cyan-400/70 text-cyan-200 shadow-[0_0_14px_rgba(34,211,238,0.28)]'
          : 'bg-slate-950/88 border-slate-400/50 text-slate-100 shadow-lg';
        const barTone = isGolden
          ? 'from-amber-400 via-yellow-200 to-amber-400'
          : isTier3
          ? 'from-rose-400 via-fuchsia-400 to-violet-400'
          : isTier2
          ? 'from-cyan-400 to-sky-300'
          : 'from-slate-300 to-slate-400';
        const goldParticles = [
          { left: '8%', delay: '0s' },
          { left: '22%', delay: '0.28s' },
          { left: '38%', delay: '0.55s' },
          { left: '54%', delay: '0.16s' },
          { left: '70%', delay: '0.44s' },
          { left: '86%', delay: '0.72s' },
        ];
        return (
          <div
            data-testid="hud-combo-counter"
            className={`absolute left-1/2 -translate-x-1/2 pointer-events-none select-none z-10 ${
              isPortrait
                ? 'top-[196px]'
                : compactLandscapeHud
                ? viewportW >= 740
                  ? 'top-2.5'
                  : 'top-[116px]'
                : 'top-3'
            }`}
          >
            <div
              className={`relative px-3.5 py-1 sm:px-4 sm:py-1.5 rounded-xl border text-center min-w-[118px] sm:min-w-[144px] transition-transform duration-150 ${
                isGolden ? 'scale-105' : isTier3 ? 'scale-[1.02]' : ''
              } ${boxTone}`}
            >
              {isGolden &&
                goldParticles.map((pt, idx) => (
                  <span
                    key={idx}
                    style={{ left: pt.left, animationDelay: pt.delay }}
                    className="combo-gold-sparkle absolute -top-1 text-[10px] sm:text-xs text-yellow-200 drop-shadow-[0_0_6px_rgba(253,224,71,0.95)] pointer-events-none"
                  >
                    ✦
                  </span>
                ))}
              <div className="flex items-baseline justify-center gap-1.5 leading-none">
                <span className="text-lg sm:text-2xl font-black tabular-nums tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,0.85)]">
                  {c}
                </span>
                <span className="text-[11px] sm:text-xs font-extrabold tracking-[0.14em] uppercase">
                  {isGolden ? '🔥 黄金连击' : isTier3 ? '⚡ 狂热连击' : '连击'}
                </span>
              </div>
              <div className="mt-1 h-1 w-full rounded-full bg-black/55 overflow-hidden">
                <div
                  className={`h-full w-full origin-left bg-gradient-to-r ${barTone}`}
                  style={{ transform: `scaleX(${Math.max(0, Math.min(1, hud.comboTimerRatio))})` }}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Top-Center: Boss Bar */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 text-center ${
          isPortrait
            ? hud.comboCount > 0
              ? 'top-[254px] w-[min(320px,86vw)]'
              : 'top-[200px] w-[min(320px,86vw)]'
            : compactLandscapeHud
            ? hud.comboCount > 0 && viewportW < 740
              ? 'top-[174px] w-[min(340px,46vw)]'
              : 'top-[118px] w-[min(340px,46vw)]'
            : viewportW < 1180
            ? hud.comboCount > 0
              ? 'top-[72px] w-[min(410px,42vw)]'
              : 'top-3 w-[min(410px,42vw)]'
            : hud.comboCount > 0
            ? 'top-[76px] w-[min(540px,48vw)]'
            : 'top-4 w-[min(540px,48vw)]'
        } ${hud.boss ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        {hud.boss && (
          <>
            <div className="text-rose-300 font-bold text-xs sm:text-base tracking-[0.16em] mb-1 [text-shadow:0_2px_4px_rgba(0,0,0,0.9)]">
              {hud.boss.name} Lv.{hud.boss.level}
              {hud.boss.shieldHp && hud.boss.shieldHp > 0 ? (
                <span className="ml-2 text-xs text-amber-300 tabular-nums">
                  🛡 护盾 {Math.ceil(hud.boss.shieldHp)}
                </span>
              ) : null}
            </div>
            <div className="h-3 sm:h-4 rounded-lg bg-slate-950/85 border border-rose-500/55 overflow-hidden shadow-[0_0_16px_rgba(244,63,94,0.35)]">
              <div
                className="h-full w-full origin-left bg-gradient-to-r from-red-900 via-red-500 to-rose-300"
                style={{
                  transform: `scaleX(${Math.max(0, Math.min(1, hud.boss.hp / hud.boss.maxHp))})`,
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Top-Right: Minimap + Audio/Save/Pause Utility Bar + Stats */}
      <div
        data-testid="hud-top-right"
        className={`absolute safe-hud-tr flex ${
          isPortrait
            ? 'flex-col items-end gap-1.5 w-[96px]'
            : compactLandscapeHud
            ? 'flex-row items-start gap-2'
            : 'flex-col items-end gap-2'
        }`}
      >
        {isPortrait ? (
          <>
            {/* Portrait Mobile: Compact Vertical Column (Minimap -> Utility Row -> Micro Stats) */}
            <button
              type="button"
              tabIndex={-1}
              data-testid="minimap-expand-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenWorldMap();
              }}
              aria-label="展开世界大地图 (N)"
              title={`点击展开全境大地图 (N)${typeof hud.mapExploredPct === 'number' ? ` · 已探索 ${hud.mapExploredPct}%` : ''}`}
              className="relative pointer-events-auto rounded-xl overflow-hidden border-2 border-white/25 hover:border-emerald-400/75 shadow-xl bg-[#070b10] cursor-pointer transition-colors"
            >
              <canvas
                ref={minimapRef}
                width={156}
                height={156}
                className="block w-[88px] h-[88px]"
              />
              <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-slate-950/85 border border-white/15 text-[9px] font-bold text-emerald-300 flex items-center gap-0.5 leading-none">
                <Maximize2 className="w-2.5 h-2.5" />
                {typeof hud.mapExploredPct === 'number' ? `${hud.mapExploredPct}%` : '地图'}
              </span>
            </button>

            <div className="grid grid-cols-3 gap-1 pointer-events-auto">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleMute();
                }}
                aria-label={hud.muted ? '开启音效 (M)' : '静音音效 (M)'}
                className="w-7 h-7 rounded-lg bg-slate-950/85 hover:bg-slate-800 border border-slate-600/70 flex items-center justify-center text-slate-200 cursor-pointer"
              >
                {hud.muted ? (
                  <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-sky-300" />
                )}
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenDungeon();
                }}
                aria-label="试炼之塔副本"
                className="w-7 h-7 rounded-lg bg-slate-950/85 hover:bg-slate-800 border border-amber-400/50 flex items-center justify-center text-amber-300 cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenSocial();
                }}
                aria-label="好友组队与交易"
                className="relative w-7 h-7 rounded-lg bg-slate-950/85 hover:bg-slate-800 border border-cyan-400/50 flex items-center justify-center text-cyan-300 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                {partyCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-cyan-400 text-slate-950 text-[8px] font-black flex items-center justify-center">
                    {partyCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onManualSave();
                }}
                aria-label="立即保存存档"
                className="w-7 h-7 rounded-lg bg-slate-950/85 hover:bg-slate-800 border border-slate-600/70 flex items-center justify-center text-slate-200 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-emerald-300" />
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenPause();
                }}
                aria-label="暂停菜单 (ESC)"
                className="col-span-2 h-7 rounded-lg bg-slate-950/85 hover:bg-slate-800 border border-slate-600/70 flex items-center justify-center gap-1 text-[10px] font-bold text-amber-300 cursor-pointer"
              >
                <Pause className="w-3 h-3" />
                菜单
              </button>
            </div>

            <div className="w-full rounded-xl bg-slate-950/84 border border-white/12 px-2 py-1 text-[9.5px] text-slate-300 leading-tight tabular-nums shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-800 pb-0.5 mb-0.5 gap-1">
                <span className="font-semibold text-slate-100 truncate">{cls.name}</span>
                <span className="text-amber-300 shrink-0">
                  {PHASE_ICON[hud.timeOfDay.phase]}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-1.5 gap-y-0.5">
                <div className="flex justify-between">
                  <span>攻</span>
                  <strong className="text-white">{Math.round(hud.atk)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>防</span>
                  <strong className="text-white">{Math.round(hud.def)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>金</span>
                  <strong className="text-amber-400">{hud.gold}</strong>
                </div>
                <div className="flex justify-between">
                  <span>魂</span>
                  <strong className="text-sky-300">{hud.soulStones}</strong>
                </div>
              </div>
            </div>
          </>
        ) : compactLandscapeHud ? (
          <>
            {/* Compact Landscape Mobile: Stats Card beside Minimap */}
            <div className="rounded-xl bg-slate-950/82 border border-white/12 px-2.5 py-1.5 text-[10px] text-slate-300 leading-snug tabular-nums shadow-lg min-w-[154px]">
              <div className="flex justify-between items-center border-b border-slate-800 pb-1 mb-1 gap-1.5">
                <span className="font-semibold text-slate-100 truncate">{cls.name}</span>
                <span className="text-amber-300 font-medium shrink-0">
                  {PHASE_ICON[hud.timeOfDay.phase]} {hud.timeOfDay.clockText} · 世界Lv.{hud.worldLevel}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-2.5 gap-y-0.5">
                <div className="flex justify-between">
                  <span>攻</span>
                  <strong className="text-white">{Math.round(hud.atk)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>防</span>
                  <strong className="text-white">{Math.round(hud.def)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>金</span>
                  <strong className="text-amber-400">{hud.gold}</strong>
                </div>
                <div className="flex justify-between">
                  <span>魂</span>
                  <strong className="text-sky-300">💠{hud.soulStones}</strong>
                </div>
              </div>
            </div>

            {/* Utility Buttons (Compact Landscape) */}
            <div className="grid grid-cols-2 gap-1 pointer-events-auto">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleMute();
                }}
                aria-label={hud.muted ? '开启音效 (M)' : '静音音效 (M)'}
                className="w-8 h-8 rounded-lg bg-slate-950/85 hover:bg-slate-800 border border-slate-600/70 flex items-center justify-center text-slate-200 cursor-pointer"
              >
                {hud.muted ? (
                  <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-sky-300" />
                )}
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenDungeon();
                }}
                aria-label="试炼之塔副本"
                className="w-8 h-8 rounded-lg bg-slate-950/85 hover:bg-slate-800 border border-amber-400/50 flex items-center justify-center text-amber-300 cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenSocial();
                }}
                aria-label="好友组队与交易"
                className="relative w-8 h-8 rounded-lg bg-slate-950/85 hover:bg-slate-800 border border-cyan-400/50 flex items-center justify-center text-cyan-300 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                {partyCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-cyan-400 text-slate-950 text-[8px] font-black flex items-center justify-center">
                    {partyCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onManualSave();
                }}
                aria-label="立即保存存档"
                className="w-8 h-8 rounded-lg bg-slate-950/85 hover:bg-slate-800 border border-slate-600/70 flex items-center justify-center text-slate-200 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-emerald-300" />
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenPause();
                }}
                aria-label="暂停菜单 (ESC)"
                className="col-span-2 h-7 rounded-lg bg-slate-950/85 hover:bg-slate-800 border border-slate-600/70 flex items-center justify-center gap-1 text-[10px] font-bold text-amber-300 cursor-pointer"
              >
                <Pause className="w-3 h-3" />
                暂停
              </button>
            </div>

            {/* Minimap (Compact 96px) */}
            <button
              type="button"
              tabIndex={-1}
              data-testid="minimap-expand-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenWorldMap();
              }}
              aria-label="展开世界大地图 (N)"
              title={`点击展开全境大地图 (N)${typeof hud.mapExploredPct === 'number' ? ` · 已探索 ${hud.mapExploredPct}%` : ''}`}
              className="relative pointer-events-auto rounded-xl overflow-hidden border-2 border-white/25 hover:border-emerald-400/75 shadow-xl bg-[#070b10] cursor-pointer transition-colors"
            >
              <canvas
                ref={minimapRef}
                width={156}
                height={156}
                className="block w-[96px] h-[96px]"
              />
              <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-slate-950/85 border border-white/15 text-[9px] font-bold text-emerald-300 flex items-center gap-0.5 leading-none">
                <Maximize2 className="w-2.5 h-2.5" />
                {typeof hud.mapExploredPct === 'number' ? `${hud.mapExploredPct}%` : '地图'}
              </span>
            </button>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2">
              {/* Utility Control Buttons (Desktop) */}
              <div className="flex flex-col gap-1.5 pointer-events-auto">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleMute();
                  }}
                  aria-label={hud.muted ? '开启音效 (M)' : '静音音效 (M)'}
                  title={hud.muted ? '开启音效 (M)' : '静音音效 (M)'}
                  className="w-9 h-9 rounded-lg bg-slate-950/85 hover:bg-slate-800 border border-slate-600/70 flex items-center justify-center text-slate-200 transition-colors cursor-pointer"
                >
                  {hud.muted ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-sky-300" />
                  )}
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  data-testid="hud-dungeon-btn"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onOpenDungeon();
                  }}
                  aria-label="试炼之塔副本 (T)"
                  title="打开无尽试炼之塔副本 1F-∞ (快捷键 T)"
                  className="w-9 h-9 rounded-lg bg-slate-950/85 hover:bg-slate-800 border border-amber-400/50 flex items-center justify-center text-amber-300 transition-colors cursor-pointer"
                >
                  <Building2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  data-testid="hud-social-btn"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onOpenSocial();
                  }}
                  aria-label="好友组队与交易 (P)"
                  title="打开好友 / 冒险组队 / 交易面板 (快捷键 P)"
                  className={`relative w-9 h-9 rounded-lg bg-slate-950/85 hover:bg-slate-800 border flex items-center justify-center transition-colors cursor-pointer ${
                    inParty
                      ? 'border-emerald-400/75 text-emerald-300'
                      : 'border-cyan-400/50 text-cyan-300'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  {partyCount > 0 && (
                    <span
                      className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-slate-950 text-[9px] font-black flex items-center justify-center tabular-nums ${
                        inParty ? 'bg-emerald-400' : 'bg-cyan-400'
                      }`}
                    >
                      {partyCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onManualSave();
                  }}
                  aria-label="立即保存存档"
                  title="立即保存存档"
                  className="w-9 h-9 rounded-lg bg-slate-950/85 hover:bg-slate-800 border border-slate-600/70 flex items-center justify-center text-slate-200 transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4 text-emerald-300" />
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onOpenPause();
                  }}
                  aria-label="暂停菜单 (ESC)"
                  title="暂停菜单 (ESC)"
                  className="w-9 h-9 rounded-lg bg-slate-950/85 hover:bg-slate-800 border border-slate-600/70 flex items-center justify-center text-slate-200 transition-colors cursor-pointer"
                >
                  <Pause className="w-4 h-4 text-amber-300" />
                </button>
              </div>

              {/* Minimap (Clickable -> Full World Map) */}
              <button
                type="button"
                tabIndex={-1}
                data-testid="minimap-expand-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenWorldMap();
                }}
                aria-label="展开世界大地图 (N)"
                title={`点击展开全境大地图 (快捷键 N)${typeof hud.mapExploredPct === 'number' ? ` · 已探索 ${hud.mapExploredPct}%` : ''}`}
                className="relative pointer-events-auto rounded-xl overflow-hidden border-2 border-white/25 hover:border-emerald-400/75 shadow-xl bg-[#070b10] cursor-pointer transition-colors group"
              >
                <canvas
                  ref={minimapRef}
                  width={156}
                  height={156}
                  className="block w-[140px] h-[140px] sm:w-[156px] sm:h-[156px]"
                />
                {typeof hud.mapExploredPct === 'number' && (
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-slate-950/80 border border-white/12 text-[9.5px] font-bold text-sky-200 leading-none tabular-nums">
                    探索 {hud.mapExploredPct}%
                  </span>
                )}
                <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-slate-950/85 border border-white/15 group-hover:border-emerald-400/60 text-[10px] font-bold text-emerald-300 flex items-center gap-1 leading-none shadow">
                  <Maximize2 className="w-3 h-3" />
                  大地图 N
                </span>
              </button>
            </div>

            {/* Character, Time-of-Day & World Level Panel (Desktop) */}
            <div className="w-[172px] rounded-xl bg-slate-950/82 border border-white/12 px-3 py-2.5 text-xs text-slate-300 leading-relaxed tabular-nums shadow-lg">
              <div className="border-b border-slate-800 pb-1.5 mb-1.5">
                <div className="flex justify-between items-center gap-1">
                  <span className="font-semibold text-slate-100 truncate">{cls.name}</span>
                  <span className="text-emerald-300 font-bold text-[11px] shrink-0">
                    世界 Lv.{hud.worldLevel}
                  </span>
                </div>
                <div className="text-[11px] text-amber-300 font-medium mt-0.5">
                  {PHASE_ICON[hud.timeOfDay.phase]} {hud.timeOfDay.phase} {hud.timeOfDay.clockText}
                </div>
                <div className="text-[10.5px] text-sky-300/95 font-medium mt-0.5 truncate" title={hud.weather.effectSummary}>
                  {hud.weather.icon} {hud.weather.label} · {hud.weather.effectSummary}
                </div>
              </div>
              <div className="flex justify-between">
                <span>等级</span>
                <strong className="text-white">{hud.level}</strong>
              </div>
              <div className="flex justify-between">
                <span>攻击</span>
                <strong className="text-white">{Math.round(hud.atk)}</strong>
              </div>
              <div className="flex justify-between">
                <span>防御</span>
                <strong className="text-white">{Math.round(hud.def)}</strong>
              </div>
              <div className="flex justify-between">
                <span>攻速</span>
                <strong className="text-cyan-300">{hud.attackSpeed}%</strong>
              </div>
              <div className="flex justify-between">
                <span>暴击率</span>
                <strong className={hud.critDisabled ? 'text-slate-500' : 'text-emerald-300'}>
                  {hud.critDisabled ? '无暴击' : `${hud.critChance}%`}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>金币</span>
                <strong className="text-amber-400">{hud.gold}</strong>
              </div>
              <div className="flex justify-between">
                <span>灵魂石</span>
                <strong className="text-sky-300">💠 {hud.soulStones}</strong>
              </div>
              <div className="flex justify-between">
                <span>药水</span>
                <strong className="text-white">
                  {hud.potions}/{hud.potionCap}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>击杀</span>
                <strong className="text-white">{hud.kills}</strong>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Combat Logs */}
      {!compactLandscapeHud && !isPortrait && (
        <div className="absolute left-4 bottom-24 w-[min(360px,52vw)] flex flex-col gap-1 text-xs pointer-events-none">
          {hud.logs.map((entry) => (
            <div
              key={entry.id}
              style={{ color: entry.color }}
              className="[text-shadow:0_1px_3px_rgba(0,0,0,0.95)] font-medium"
            >
              {entry.text}
            </div>
          ))}
        </div>
      )}

      {/* Desktop Skill (4 Active Skills + Basic + Dash + Potion + Bag) & Quick Party/Tower Dock */}
      {!showTouchControls ? (
        <>
          <div className="absolute safe-hud-bl flex items-center gap-1 sm:gap-1.5 pointer-events-auto max-w-[calc(100vw-24px)]">
            <SkillButton
              icon={cls.basicAttackIcon}
              label={cls.basicAttackName.slice(0, 3)}
              hotkey="左键/J"
              tone="steel"
              cdRatio={hud.cdBasic}
              onClick={() => onTriggerSkill('basic', 'mouse')}
            />
            <SkillButton
              icon={cls.skills[0].icon}
              label={cls.skills[0].name.slice(0, 4)}
              hotkey="Q/1"
              tone="rune"
              skillLv={hud.skillLevels[0]}
              dimmed={hud.mp < cls.skills[0].mpCost}
              cdRatio={hud.cdSkills[0] ?? hud.cdQ}
              onClick={() => onTriggerSkill('q', 'mouse')}
            />
            <SkillButton
              icon={cls.skills[1].icon}
              label={cls.skills[1].name.slice(0, 4)}
              hotkey="E/2"
              tone="rune"
              skillLv={hud.skillLevels[1]}
              dimmed={hud.mp < cls.skills[1].mpCost}
              cdRatio={hud.cdSkills[1] ?? hud.cdE}
              onClick={() => onTriggerSkill('e', 'mouse')}
            />
            <SkillButton
              icon={cls.skills[2].icon}
              label={cls.skills[2].name.slice(0, 4)}
              hotkey="C/3"
              tone="arcane"
              skillLv={hud.skillLevels[2]}
              dimmed={hud.mp < cls.skills[2].mpCost}
              cdRatio={hud.cdSkills[2] ?? hud.cdC}
              onClick={() => onTriggerSkill('c', 'mouse')}
            />
            <SkillButton
              icon={cls.skills[3].icon}
              label={cls.skills[3].name.slice(0, 4)}
              hotkey="V/4"
              tone="ultimate"
              skillLv={hud.skillLevels[3]}
              dimmed={hud.mp < cls.skills[3].mpCost}
              cdRatio={hud.cdSkills[3] ?? hud.cdV}
              onClick={() => onTriggerSkill('v', 'mouse')}
            />
            <SkillButton
              icon="💨"
              label="冲刺"
              hotkey="Space"
              tone="sky"
              cdRatio={hud.cdDash}
              onClick={() => onTriggerSkill('dash', 'mouse')}
            />
            <SkillButton
              icon="🧪"
              label={`药水(${hud.potions})`}
              hotkey="R"
              tone="emerald"
              dimmed={hud.potions <= 0}
              cdRatio={hud.cdPot}
              onClick={() => onTriggerSkill('potion', 'mouse')}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleInventory();
              }}
              aria-label="打开背包与装备栏 (B)"
              className="group relative w-[52px] h-[60px] sm:w-[60px] sm:h-[68px] rounded-xl bg-gradient-to-b from-[#1d1812]/95 via-[#110e0c]/95 to-[#080708]/98 hover:from-[#292116] border border-amber-400/55 ring-1 ring-inset ring-amber-200/15 flex flex-col items-center justify-between py-1.5 text-slate-100 text-[10px] shadow-[0_8px_20px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(251,191,36,0.2)] cursor-pointer transition-all"
            >
              <div className="w-full px-1 flex items-center justify-end leading-none">
                <span className="text-[8px] sm:text-[9px] font-bold bg-amber-400/20 border border-amber-300/30 text-amber-200 rounded px-1 py-0.5 tabular-nums">
                  B
                </span>
              </div>
              <Backpack className="w-5 h-5 text-amber-300 drop-shadow-[0_2px_6px_rgba(251,191,36,0.4)] group-hover:scale-105 transition-transform" />
              <span className="leading-none font-semibold text-amber-100">背包</span>
              {hud.inventory.length > 0 && (
                <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] flex items-center justify-center tabular-nums shadow">
                  {hud.inventory.length}
                </span>
              )}
            </button>
          </div>

          {/* Desktop Bottom-Right Quick Dock: Trial Tower (T) & Party/Social (P) */}
          {viewportW >= 820 && (
            <div className="absolute safe-hud-br flex items-center gap-2 pointer-events-auto">
              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-quick-dungeon-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenDungeon();
                }}
                className="px-3 py-2 rounded-xl bg-gradient-to-b from-[#1e1726]/95 to-[#0e0b14]/96 hover:from-[#2b2038] border border-amber-400/55 text-amber-200 text-xs font-bold shadow-[0_8px_20px_rgba(0,0,0,0.65)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                title="开启试炼之塔多层挑战 (快捷键 T)"
              >
                <Building2 className="w-3.5 h-3.5 text-amber-300" />
                <span>试炼塔</span>
                <kbd className="px-1 py-0.5 rounded bg-black/45 border border-white/15 text-[10px] text-amber-300 font-mono">
                  T
                </kbd>
              </button>

              <button
                type="button"
                tabIndex={-1}
                data-testid="hud-quick-social-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenSocial();
                }}
                className={`px-3 py-2 rounded-xl bg-gradient-to-b border text-xs font-bold shadow-[0_8px_20px_rgba(0,0,0,0.65)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  inParty
                    ? 'from-[#102620]/95 to-[#081512]/96 hover:from-[#15352c] border-emerald-400/65 text-emerald-200'
                    : 'from-[#101e2b]/95 to-[#080f18]/96 hover:from-[#152b3f] border-cyan-400/55 text-cyan-200'
                }`}
                title="管理联机房间队伍与好友 (快捷键 P)"
              >
                <Users className="w-3.5 h-3.5" />
                <span>
                  {inParty
                    ? `队伍 ${partyCount}/4`
                    : hud.playMode === 'online'
                    ? '联机大厅/组队'
                    : '组队社交'}
                </span>
                <kbd className="px-1 py-0.5 rounded bg-black/45 border border-white/15 text-[10px] font-mono">
                  P
                </kbd>
              </button>
            </div>
          )}
        </>
      ) : (
        !modalOpen && (
          <>
            <div className="absolute safe-hud-bl">
              <VirtualJoystick
                compact={compactPortraitTouch}
                onVectorChange={onJoystickVector}
              />
            </div>
            <div className="absolute safe-hud-br">
              <MobileControls
                hud={hud}
                compact={compactPortraitTouch}
                onAttackHold={onVirtualAttackHold}
                onTriggerSkill={(slot) => onTriggerSkill(slot, 'virtual')}
                onToggleInventory={onToggleInventory}
              />
            </div>
          </>
        )
      )}

      {/* Road Signpost Floating Card */}
      {!modalOpen && hud.nearSignpost && (
        <div
          data-testid="signpost-card"
          className={`absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none w-[min(272px,78vw)] rounded-xl bg-[#101824]/88 border border-emerald-400/55 px-2.5 py-1.5 shadow-xl ${
            isPortrait && showTouchControls
              ? 'bottom-[238px]'
              : (!showTouchControls && viewportW >= 1120) ||
                (!isPortrait && showTouchControls && viewportW >= 640)
              ? 'bottom-[50px]'
              : 'bottom-[122px]'
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-emerald-300">
            <span className="truncate">🪧 {hud.nearSignpost.title}</span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-amber-300 text-[10px] shrink-0">
              {hud.nearSignpost.direction}
            </span>
          </div>
          <p className="text-[10px] text-slate-200 mt-0.5 leading-snug">
            {hud.nearSignpost.destDesc}
          </p>
          <div className="text-[10px] text-rose-300 mt-0.5 font-semibold">
            危险等级：{hud.nearSignpost.dangerLevel}
          </div>
        </div>
      )}

      {/* Bottom-Center: Accessible NPC, Altar, Signpost & Portal Interaction Prompt */}
      {!modalOpen && hud.nearInteract && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-20 pointer-events-auto max-w-[min(240px,72vw)] ${
            isPortrait && showTouchControls
              ? 'bottom-[204px]'
              : (!showTouchControls && viewportW >= 1120) ||
                (!isPortrait && showTouchControls && viewportW >= 640)
              ? 'bottom-4'
              : 'bottom-[88px]'
          }`}
        >
          <button
            type="button"
            tabIndex={-1}
            data-testid="interact-prompt-btn"
            style={{ touchAction: 'manipulation' }}
            onTouchStart={(e) => {
              e.stopPropagation();
              lastInteractTouchTsRef.current = Date.now();
              onInteract();
            }}
            onClick={(e) => {
              if (Date.now() - lastInteractTouchTsRef.current < 450) return;
              e.stopPropagation();
              e.currentTarget.blur();
              onInteract();
            }}
            className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border text-[11px] sm:text-xs font-bold shadow-lg backdrop-blur-[2px] cursor-pointer transition-colors whitespace-nowrap max-w-full truncate ${getInteractStyle(
              hud.nearInteract,
              hud.atLevelCap
            )}`}
          >
            {getInteractLabel(
              hud.nearInteract,
              hud.worldId,
              worldMeta,
              showTouchControls,
              hud.atLevelCap,
              hud.dungeonFloor,
              hud.dungeonCleared
            )}
          </button>
        </div>
      )}

      {/* Center Toast (only mounted when active to avoid idle filter layer over canvas) */}
      {hud.toastMsg && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 text-yellow-300 text-xl sm:text-3xl font-black tracking-[0.2em] [text-shadow:0_0_16px_rgba(253,224,71,0.75),0_2px_4px_rgba(0,0,0,0.9)] pointer-events-none text-center max-w-[90vw] ${
            isPortrait ? 'top-[32%]' : 'top-[24%]'
          }`}
        >
          {hud.toastMsg}
        </div>
      )}
    </div>
  );
}

type SkillTone = 'steel' | 'rune' | 'arcane' | 'ultimate' | 'sky' | 'emerald';

interface SkillButtonProps {
  icon: string;
  label: string;
  hotkey: string;
  tone?: SkillTone;
  skillLv?: number;
  dimmed?: boolean;
  cdRatio: number;
  onClick: () => void;
}

const SKILL_TONE_STYLE: Record<SkillTone, string> = {
  steel:
    'from-[#1c202c]/95 via-[#0f131d]/95 to-[#07090f]/98 hover:from-[#262c3b] border-slate-400/50 ring-slate-200/15',
  rune:
    'from-[#171d32]/95 via-[#0c1020]/95 to-[#060812]/98 hover:from-[#212947] border-indigo-400/60 ring-indigo-300/20',
  arcane:
    'from-[#211834]/95 via-[#110c1e]/95 to-[#080610]/98 hover:from-[#2e2047] border-violet-400/65 ring-violet-300/20',
  ultimate:
    'from-[#2c1922]/96 via-[#160c14]/96 to-[#090509]/98 hover:from-[#3d212e] border-amber-400/75 ring-amber-300/25 shadow-[0_8px_22px_rgba(245,158,11,0.22)]',
  sky:
    'from-[#112230]/95 via-[#09131d]/95 to-[#050a10]/98 hover:from-[#173044] border-sky-400/55 ring-sky-300/15',
  emerald:
    'from-[#11261f]/95 via-[#091612]/95 to-[#050b09]/98 hover:from-[#17352b] border-emerald-400/55 ring-emerald-300/15',
};

const SkillButton = memo(function SkillButton({
  icon,
  label,
  hotkey,
  tone = 'rune',
  skillLv,
  dimmed = false,
  cdRatio,
  onClick,
}: SkillButtonProps) {
  const onCooldown = cdRatio > 0.01;
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={(e) => {
        e.currentTarget.blur();
        onClick();
      }}
      aria-label={`${label} (${hotkey})`}
      className={`group relative w-[52px] h-[60px] sm:w-[60px] sm:h-[68px] rounded-xl bg-gradient-to-b border ring-1 ring-inset flex flex-col items-center justify-between py-1.5 text-slate-100 text-[9.5px] sm:text-[10px] overflow-hidden shadow-[0_8px_20px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.1)] cursor-pointer transition-all ${
        SKILL_TONE_STYLE[tone]
      } ${dimmed && !onCooldown ? 'opacity-65' : 'opacity-100'}`}
    >
      <div className="w-full px-1 flex items-center justify-between gap-0.5 leading-none z-10">
        {skillLv !== undefined ? (
          <span className="text-[8px] font-bold text-amber-300 tabular-nums drop-shadow">
            Lv{skillLv}
          </span>
        ) : (
          <span />
        )}
        <span className="text-[8px] sm:text-[8.5px] font-bold bg-black/50 border border-white/15 text-slate-200 rounded px-1 py-0.5 leading-none tabular-nums">
          {hotkey}
        </span>
      </div>
      <span
        className={`text-lg sm:text-xl leading-none z-10 transition-transform ${
          onCooldown
            ? 'scale-95 opacity-60 grayscale-[35%]'
            : 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] group-hover:scale-110'
        }`}
      >
        {icon}
      </span>
      <span className="truncate max-w-[48px] sm:max-w-[54px] leading-none font-semibold text-slate-100 z-10">
        {label}
      </span>
      {onCooldown && (
        <div
          className="absolute inset-0 bg-[#05070e]/82 border-t border-rose-400/55 origin-bottom pointer-events-none z-10"
          style={{ transform: `scaleY(${Math.max(0, Math.min(1, cdRatio))})` }}
        />
      )}
    </button>
  );
});
