import { useEffect, useRef, useState } from 'react';
import { ArmorShopModal } from './components/ArmorShopModal';
import { AuthModal } from './components/AuthModal';
import { AwakeningModal } from './components/AwakeningModal';
import { BestiaryModal } from './components/BestiaryModal';
import { BlacksmithModal } from './components/BlacksmithModal';
import { ChangelogModal } from './components/ChangelogModal';
import { ClientDownloadModal } from './components/ClientDownloadModal';
import { ClientUpdateModal } from './components/ClientUpdateModal';
import { DungeonModal } from './components/DungeonModal';
import { HUD } from './components/HUD';
import { InventoryModal } from './components/InventoryModal';
import { MainMenu } from './components/MainMenu';
import { PauseModal } from './components/PauseModal';
import { OfflineIndicator } from './components/PWAInstallButton';
import { QuestModal } from './components/QuestModal';
import { RoomLobbyModal } from './components/RoomLobbyModal';
import { SaveSlotModal } from './components/SaveSlotModal';
import { SettingsModal } from './components/SettingsModal';
import { ShopModal } from './components/ShopModal';
import { SocialModal } from './components/SocialModal';
import { TalentModal } from './components/TalentModal';
import { UpgradeModal } from './components/UpgradeModal';
import { WorldMapModal } from './components/WorldMapModal';
import { GameEngine } from './engine/GameEngine';
import { TILE } from './engine/world';
import { subscribeAuth } from './firebase';
import {
  checkForNativeClientUpdate,
  type VersionManifest,
} from './services/appUpdate';
import {
  isCapacitorNativeShell,
  isNativeClientShell,
} from './services/platform';
import {
  CLASS_DEFS,
  expNeeded,
  getTimeOfDay,
  resolveWeatherForWorldAndTime,
} from './game/rules';
import type {
  AccountData,
  AuthUserInfo,
  ClassId,
  GameSettings,
  HudSnapshot,
  PartyState,
  PlayMode,
  SaveSlotId,
  SyncStatus,
  TalentId,
} from './game/types';
import { useMobileControls } from './hooks/useMobileControls';
import {
  getOrCreateOnlineDeviceUid,
  loadAndMergeCloudAccount,
  loadLocalAccount,
  loadOnlineRoomProfile,
  saveAccountSyncForUnload,
  saveLocalAccount,
  saveOnlineRoomProfile,
  syncAccountToCloud,
} from './services/cloudSave';
import {
  createEphemeralPlayerId,
  peerRoomClient,
  type PeerRoomRole,
  type RoomPlayerPayload,
} from './services/peerRoom';

type MenuSubModal = 'none' | 'slots' | 'room' | 'talents' | 'bestiary' | 'auth' | 'settings';

const GUEST_USER: AuthUserInfo = {
  uid: 'guest',
  email: null,
  displayName: '流浪冒险者',
  photoURL: null,
  emailVerified: false,
  isGuest: true,
};

const INITIAL_HUD: HudSnapshot = {
  started: false,
  paused: false,
  playMode: 'singleplayer',
  activeSlot: 'slot1',
  worldId: 'world1',
  worldName: '晨曦大陆',
  worldLevel: 1,
  breakthroughTier: 0,
  realmName: '凡胎初境',
  levelCap: 10,
  atLevelCap: false,
  worldDifficulty: 1,
  inWater: false,
  inSafeZone: true,
  classId: 'novice',
  awakened: false,
  hp: 105,
  maxHp: 105,
  shieldHp: 0,
  mp: 50,
  maxMp: 50,
  level: 1,
  exp: 0,
  expNeeded: expNeeded(1),
  atk: 8.5,
  def: 2.5,
  critChance: 10,
  critDmgMult: 1.75,
  critDisabled: false,
  attackSpeed: 100,
  mpRegen: 4.5,
  speed: 164,
  lifeOnKill: 0,
  gold: 0,
  potions: 2,
  potionCap: 5,
  kills: 0,
  soulStones: 0,
  cdBasic: 0,
  cdSkills: [0, 0, 0, 0],
  cdQ: 0,
  cdE: 0,
  cdC: 0,
  cdV: 0,
  skillLevels: [1, 1, 1, 1],
  cdDash: 0,
  cdPot: 0,
  dungeonFloor: null,
  dungeonMobsRemaining: 0,
  dungeonCleared: false,
  highestDungeonFloor: 0,
  boss: null,
  timeOfDay: getTimeOfDay(0),
  weather: resolveWeatherForWorldAndTime('world1', 0),
  comboCount: 0,
  comboTimerRatio: 0,
  nearInteract: null,
  nearSignpost: null,
  muted: false,
  shopOpen: false,
  questOpen: false,
  inventoryOpen: false,
  talentOpen: false,
  bestiaryOpen: false,
  awakeningOpen: false,
  armorerOpen: false,
  blacksmithOpen: false,
  upgraderOpen: false,
  worldMapOpen: false,
  dungeonOpen: false,
  socialOpen: false,
  shopPrices: {},
  armorStock: [],
  equipped: { weapon: null, armor: null, accessory: null },
  inventory: [],
  materials: {},
  skillBooks: [],
  activeQuest: null,
  completedQuestCount: 0,
  logs: [],
  toastMsg: null,
  hasSave: false,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const hitFlashRef = useRef<HTMLDivElement | null>(null);
  const hitFlashTimerRef = useRef<number | null>(null);

  const [playMode, setPlayMode] = useState<PlayMode>('singleplayer');
  const playModeRef = useRef<PlayMode>('singleplayer');

  const [user, setUser] = useState<AuthUserInfo>(GUEST_USER);
  const userRef = useRef<AuthUserInfo>(GUEST_USER);
  const [account, setAccount] = useState<AccountData>(() =>
    loadLocalAccount(GUEST_USER.uid, GUEST_USER.displayName, 'singleplayer')
  );
  const accountRef = useRef<AccountData>(account);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [menuModal, setMenuModal] = useState<MenuSubModal>('none');
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [bootError, setBootError] = useState<string | null>(null);

  // PeerJS Room multiplayer reactive state (isolated encrypted single profile)
  const onlineDeviceUidRef = useRef<string>(getOrCreateOnlineDeviceUid());
  const [roomConnected, setRoomConnected] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomRole, setRoomRole] = useState<PeerRoomRole>(null);
  const [roomMembers, setRoomMembers] = useState<RoomPlayerPayload[]>([]);
  const [roomParty, setRoomParty] = useState<PartyState | null>(null);
  const [onlineBanner, setOnlineBanner] = useState<{ level: 'ok' | 'warn'; text: string } | null>(null);
  const onlineBannerTimerRef = useRef<number | null>(null);

  // Cross-platform client download, changelog & native-only update check state
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<VersionManifest | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateCheckFeedback, setUpdateCheckFeedback] = useState<string | null>(null);
  const dismissedUpdateVersionRef = useRef<string | null>(null);
  const lastUpdateCheckAtRef = useRef<number>(0);

  const {
    isCompactViewport,
    isPortrait,
    viewportW,
    touchMode,
    setTouchMode,
    showTouchControls,
  } = useMobileControls();

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  useEffect(() => {
    playModeRef.current = playMode;
  }, [playMode]);

  const showOnlineNotice = (level: 'ok' | 'warn', text: string) => {
    setOnlineBanner({ level, text });
    if (onlineBannerTimerRef.current !== null) {
      window.clearTimeout(onlineBannerTimerRef.current);
    }
    onlineBannerTimerRef.current = window.setTimeout(() => {
      setOnlineBanner(null);
    }, 2800);
  };

  // Mount Canvas 2D GameEngine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const initialAcc = loadLocalAccount(GUEST_USER.uid, GUEST_USER.displayName, 'singleplayer');
      const engine = new GameEngine(canvas, {
        onHudUpdate: (snapshot) => {
          setHud(snapshot);
        },
        onAccountChange: (nextAccount, shouldCloudSync) => {
          accountRef.current = nextAccount;
          setAccount(nextAccount);
          const isOnline = nextAccount.mode === 'online' || playModeRef.current === 'online';
          if (isOnline) {
            const curUser = userRef.current;
            const onlineUid = curUser.isGuest ? onlineDeviceUidRef.current : curUser.uid;
            const onlineAcc: AccountData = { ...nextAccount, uid: onlineUid, mode: 'online' };
            // Synchronously write pending recovery snapshot first in case browser closes mid-encryption
            saveAccountSyncForUnload(onlineAcc);
            void saveOnlineRoomProfile(onlineAcc).then((res) => {
              if (playModeRef.current === 'online') {
                setSyncStatus(res.status);
              }
            });
            return;
          }

          saveAccountSyncForUnload({ ...nextAccount, mode: 'singleplayer' });
          const curUser = userRef.current;
          if (shouldCloudSync && !curUser.isGuest) {
            setSyncStatus('syncing');
            void syncAccountToCloud(nextAccount, curUser).then((st) => {
              setSyncStatus(st);
            });
          }
        },
        onHitFlash: (color, opacity) => {
          const el = hitFlashRef.current;
          if (!el) return;
          el.style.background = color;
          el.style.opacity = String(opacity);
          if (hitFlashTimerRef.current !== null) {
            window.clearTimeout(hitFlashTimerRef.current);
          }
          hitFlashTimerRef.current = window.setTimeout(() => {
            if (hitFlashRef.current) hitFlashRef.current.style.opacity = '0';
          }, 90);
        },
      });

      engineRef.current = engine;
      const params = new URLSearchParams(window.location.search);
      const autostart = params.get('autostart') === '1';
      const qClass = params.get('class') as ClassId | null;
      const startClass: ClassId = qClass && qClass in CLASS_DEFS ? qClass : 'novice';
      engine.mount(initialAcc, autostart ? startClass : undefined);

      return () => {
        if (hitFlashTimerRef.current !== null) {
          window.clearTimeout(hitFlashTimerRef.current);
        }
        if (onlineBannerTimerRef.current !== null) {
          window.clearTimeout(onlineBannerTimerRef.current);
        }
        engine.destroy();
        engineRef.current = null;
      };
    } catch (err) {
      setBootError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Emergency synchronous flush on unexpected tab close, refresh, or mobile backgrounding
  useEffect(() => {
    const flushOnUnload = () => {
      const engine = engineRef.current;
      if (engine && hud.started) {
        engine.saveCurrentSlot(true, false);
        return;
      }
      const curMode = playModeRef.current;
      const curUser = userRef.current;
      const resolvedUid =
        curMode === 'online'
          ? curUser.isGuest
            ? onlineDeviceUidRef.current
            : curUser.uid
          : accountRef.current.uid;
      saveAccountSyncForUnload({
        ...accountRef.current,
        uid: resolvedUid,
        mode: curMode,
      });
    };
    window.addEventListener('pagehide', flushOnUnload);
    window.addEventListener('beforeunload', flushOnUnload);
    return () => {
      window.removeEventListener('pagehide', flushOnUnload);
      window.removeEventListener('beforeunload', flushOnUnload);
    };
  }, [hud.started]);

  // 严格边界：仅在原生客户端外壳（Windows EXE / Linux / Android APK）启动与切回前台时检测版本更新；
  // 普通浏览器网页端与 PWA 绝不触发客户端更新提示弹窗。
  useEffect(() => {
    if (!isNativeClientShell()) return;

    let active = true;
    let capHandle: { remove: () => Promise<void> } | null = null;

    const runCheck = async (force = false) => {
      if (!active) return;
      const now = Date.now();
      if (!force && now - lastUpdateCheckAtRef.current < 60_000) return;
      lastUpdateCheckAtRef.current = now;

      const manifest = await checkForNativeClientUpdate();
      if (!active || !manifest) return;
      if (dismissedUpdateVersionRef.current === manifest.version) return;
      setAvailableUpdate(manifest);
    };

    const startupTimer = window.setTimeout(() => {
      void runCheck(true);
    }, 1200);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void runCheck(false);
      }
    };
    const onFocus = () => {
      void runCheck(false);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    if (isCapacitorNativeShell()) {
      void import('@capacitor/app')
        .then(async ({ App: CapApp }) => {
          if (!active) return;
          const handle = await CapApp.addListener('appStateChange', ({ isActive }) => {
            if (isActive) {
              void runCheck(false);
            }
          });
          if (!active) {
            void handle.remove();
          } else {
            capHandle = handle;
          }
        })
        .catch(() => {
          // Ignore outside Capacitor Android runtime
        });
    }

    return () => {
      active = false;
      window.clearTimeout(startupTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      if (capHandle) {
        void capHandle.remove();
      }
    };
  }, []);

  // Subscribe to Firebase Authentication state
  useEffect(() => {
    let active = true;
    const unsub = subscribeAuth(async (fbUser) => {
      if (!active) return;
      const nextUser: AuthUserInfo = fbUser
        ? {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName || fbUser.email?.split('@')[0] || '冒险者',
            photoURL: fbUser.photoURL,
            emailVerified: fbUser.emailVerified,
            isGuest: false,
          }
        : GUEST_USER;

      userRef.current = nextUser;
      setUser(nextUser);

      if (playModeRef.current === 'online') {
        // Keep active ephemeral room session completely untouched
        return;
      }

      if (!nextUser.isGuest) {
        setSyncStatus('syncing');
        const { account: merged, status } = await loadAndMergeCloudAccount(nextUser);
        if (!active || playModeRef.current !== 'singleplayer') return;
        setAccount(merged);
        setSyncStatus(status);
        engineRef.current?.setPlayMode('singleplayer');
        engineRef.current?.setAccount(merged);
        engineRef.current?.setIdentity(merged.uid, merged.displayName);
      } else {
        const guestAcc = loadLocalAccount(GUEST_USER.uid, GUEST_USER.displayName, 'singleplayer');
        setAccount(guestAcc);
        setSyncStatus('local');
        engineRef.current?.setPlayMode('singleplayer');
        engineRef.current?.setAccount(guestAcc);
        engineRef.current?.setIdentity(guestAcc.uid, guestAcc.displayName);
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  // Subscribe to PeerJS Room Events
  useEffect(() => {
    const unsub = peerRoomClient.onEvent((ev) => {
      if (ev.type === 'connected') {
        setRoomConnected(ev.connected);
        setRoomRole(ev.role);
        setRoomCode(ev.roomCode);
      } else if (ev.type === 'members') {
        setRoomMembers(ev.members);
        engineRef.current?.setRoomMembers(ev.members);
      } else if (ev.type === 'party') {
        setRoomParty(ev.party);
        engineRef.current?.setMultiplayerState({ party: ev.party });
      } else if (ev.type === 'dungeon_enter') {
        engineRef.current?.joinLeaderDungeonFloor(ev.floor, ev.fromName);
        showOnlineNotice('ok', `🗼 队友【${ev.fromName}】开启了试炼之塔 ${ev.floor}F，已自动同步传送！`);
      } else if (ev.type === 'party_exp') {
        engineRef.current?.receivePartyExp(ev.exp, ev.fromName);
      } else if (ev.type === 'party_heal') {
        engineRef.current?.receivePartyHeal(ev.healHp, ev.shieldHp, ev.fromName);
      } else if (ev.type === 'party_quest_progress') {
        engineRef.current?.receivePartyQuestProgress(ev);
      } else if (ev.type === 'world_entities') {
        engineRef.current?.receiveWorldEntities(ev);
      } else if (ev.type === 'world_sync_req') {
        engineRef.current?.receiveWorldSyncRequest(ev.mapKey);
      } else if (ev.type === 'entity_hit') {
        engineRef.current?.receiveEntityHit(ev);
      } else if (ev.type === 'world_action') {
        engineRef.current?.receiveWorldAction(ev);
      } else if (ev.type === 'world_kill') {
        engineRef.current?.receiveWorldKill(ev);
      } else if (ev.type === 'room_closed') {
        setRoomConnected(false);
        setRoomRole(null);
        setRoomCode(null);
        setRoomMembers([]);
        setRoomParty(null);
        engineRef.current?.setMultiplayerState({ party: null });
        engineRef.current?.setRoomMembers([]);
        engineRef.current?.returnToMainMenu();
        showOnlineNotice('warn', ev.reason);
      } else if (ev.type === 'left') {
        setRoomConnected(false);
        setRoomRole(null);
        setRoomCode(null);
        setRoomMembers([]);
        setRoomParty(null);
        engineRef.current?.setMultiplayerState({ party: null });
        engineRef.current?.setRoomMembers([]);
      } else if (ev.type === 'notice') {
        showOnlineNotice(ev.level, ev.text);
      }
    });

    return () => {
      unsub();
      peerRoomClient.leaveRoom(true);
    };
  }, []);

  // Keep minimap canvas synced whenever gameplay HUD mounts, unmounts, or changes layout mode
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setMinimapCanvas(hud.started ? minimapRef.current : null);
    }
  }, [hud.started, showTouchControls, isPortrait, isCompactViewport]);

  // Pause background demo tour rendering when a main menu sub-modal covers the viewport
  useEffect(() => {
    engineRef.current?.setMenuModalPaused(!hud.started && menuModal !== 'none');
  }, [hud.started, menuModal]);

  // Sync mobile touch UI active state so GameEngine expands NPC proximity/tap tolerance cleanly
  useEffect(() => {
    engineRef.current?.setTouchUiActive(showTouchControls);
  }, [showTouchControls]);

  const handlePlayModeChange = async (nextMode: PlayMode) => {
    if (nextMode === playModeRef.current || hud.started) return;
    playModeRef.current = nextMode;
    setPlayMode(nextMode);
    setMenuModal('none');

    if (nextMode !== 'online') {
      peerRoomClient.leaveRoom(true);
      setRoomConnected(false);
      setRoomRole(null);
      setRoomCode(null);
      setRoomMembers([]);
      setRoomParty(null);
    }

    const curUser = userRef.current;
    if (nextMode === 'online') {
      const onlineUid = curUser.isGuest ? onlineDeviceUidRef.current : curUser.uid;
      const loaded = await loadOnlineRoomProfile(onlineUid, curUser.displayName);
      if (playModeRef.current !== 'online') return;
      setAccount(loaded.account);
      setSyncStatus(loaded.status);
      engineRef.current?.setPlayMode('online');
      engineRef.current?.setAccount(loaded.account);
      engineRef.current?.setIdentity(loaded.account.uid, loaded.account.displayName);
    } else {
      let spAcc: AccountData;
      let spStatus: SyncStatus = 'local';
      if (curUser.isGuest) {
        spAcc = loadLocalAccount(GUEST_USER.uid, GUEST_USER.displayName, 'singleplayer');
      } else {
        setSyncStatus('syncing');
        const res = await loadAndMergeCloudAccount(curUser);
        spAcc = res.account;
        spStatus = res.status;
      }
      if (playModeRef.current !== 'singleplayer') return;
      setAccount(spAcc);
      setSyncStatus(spStatus);
      engineRef.current?.setPlayMode('singleplayer');
      engineRef.current?.setAccount(spAcc);
      engineRef.current?.setIdentity(spAcc.uid, spAcc.displayName);
    }
  };

  const handleCreateRoom = async (params: {
    playerName: string;
    password: string;
  }) => {
    const curUser = userRef.current;
    const onlineUid = curUser.isGuest ? onlineDeviceUidRef.current : curUser.uid;
    const loaded = await loadOnlineRoomProfile(onlineUid, params.playerName);
    const existingSlot = loaded.account.slots.slot1;
    const startClass: ClassId = existingSlot?.classId ?? 'novice';
    const cls = CLASS_DEFS[startClass] ?? CLASS_DEFS.novice;
    const sessionUid = createEphemeralPlayerId();
    const spawnX = existingSlot?.player?.x ?? 105 * TILE + TILE / 2;
    const spawnY = existingSlot?.player?.y ?? 105 * TILE + TILE / 2;

    const initialPayload: RoomPlayerPayload = {
      id: sessionUid,
      name: params.playerName,
      classType: startClass,
      worldId: existingSlot?.worldId ?? 'world1',
      dungeonFloor: null,
      level: existingSlot?.level ?? 1,
      x: spawnX,
      y: spawnY,
      facingAng: Math.PI / 2,
      hp: existingSlot?.player?.hp ?? cls.baseHp,
      maxHp: existingSlot?.player?.baseMaxHp ?? cls.baseHp,
      isAttacking: false,
    };

    const res = await peerRoomClient.createRoom({
      password: params.password,
      player: initialPayload,
    });
    if (!res.ok || !res.roomCode) {
      return { ok: false, error: res.error || '创建房间失败' };
    }

    const roomAcc: AccountData = {
      ...loaded.account,
      uid: onlineUid,
      displayName: params.playerName,
      mode: 'online',
    };
    playModeRef.current = 'online';
    setPlayMode('online');
    setAccount(roomAcc);
    setMenuModal('none');
    setRoomParty(null);

    engineRef.current?.setPlayMode('online');
    engineRef.current?.setAccount(roomAcc);
    engineRef.current?.setIdentity(sessionUid, params.playerName);
    if (existingSlot && engineRef.current?.loadGameFromSlot('slot1')) {
      showOnlineNotice(
        'ok',
        `房间 ${res.roomCode} 创建成功！已读取 Lv.${existingSlot.level} ${cls.name} 联机档案`
      );
    } else {
      engineRef.current?.startNewGame('novice', 'slot1');
      showOnlineNotice(
        'ok',
        `房间 ${res.roomCode} 创建成功！已创建【见习旅者】唯一联机角色`
      );
    }
    engineRef.current?.setRoomMembers(peerRoomClient.getMembers());
    engineRef.current?.syncOnlineWorldStateAfterRoomJoin();
    return { ok: true, roomCode: res.roomCode };
  };

  const handleJoinRoom = async (params: {
    playerName: string;
    roomCode: string;
    password: string;
  }) => {
    const curUser = userRef.current;
    const onlineUid = curUser.isGuest ? onlineDeviceUidRef.current : curUser.uid;
    const loaded = await loadOnlineRoomProfile(onlineUid, params.playerName);
    const existingSlot = loaded.account.slots.slot1;
    const startClass: ClassId = existingSlot?.classId ?? 'novice';
    const cls = CLASS_DEFS[startClass] ?? CLASS_DEFS.novice;
    const sessionUid = createEphemeralPlayerId();
    const spawnX = existingSlot?.player?.x ?? 105 * TILE + TILE / 2;
    const spawnY = existingSlot?.player?.y ?? 105 * TILE + TILE / 2;

    const initialPayload: RoomPlayerPayload = {
      id: sessionUid,
      name: params.playerName,
      classType: startClass,
      worldId: existingSlot?.worldId ?? 'world1',
      dungeonFloor: null,
      level: existingSlot?.level ?? 1,
      x: spawnX,
      y: spawnY,
      facingAng: Math.PI / 2,
      hp: existingSlot?.player?.hp ?? cls.baseHp,
      maxHp: existingSlot?.player?.baseMaxHp ?? cls.baseHp,
      isAttacking: false,
    };

    const res = await peerRoomClient.joinRoom({
      roomCode: params.roomCode,
      password: params.password,
      player: initialPayload,
    });
    if (!res.ok) {
      return { ok: false, error: res.error || '加入房间失败' };
    }

    const assignedId = peerRoomClient.getSelfId() || sessionUid;
    const roomAcc: AccountData = {
      ...loaded.account,
      uid: onlineUid,
      displayName: params.playerName,
      mode: 'online',
    };
    playModeRef.current = 'online';
    setPlayMode('online');
    setAccount(roomAcc);
    setMenuModal('none');
    setRoomParty(res.party ?? null);

    engineRef.current?.setPlayMode('online');
    engineRef.current?.setAccount(roomAcc);
    engineRef.current?.setIdentity(assignedId, params.playerName);
    if (existingSlot && engineRef.current?.loadGameFromSlot('slot1')) {
      showOnlineNotice(
        'ok',
        `已加入房间 ${res.roomCode}，同步载入 Lv.${existingSlot.level} ${cls.name}`
      );
    } else {
      engineRef.current?.startNewGame('novice', 'slot1');
      showOnlineNotice('ok', `已加入房间 ${res.roomCode}，已开启【见习旅者】联机档案`);
    }
    engineRef.current?.setMultiplayerState({ party: res.party ?? null });
    engineRef.current?.setRoomMembers(res.members ?? peerRoomClient.getMembers());
    engineRef.current?.syncOnlineWorldStateAfterRoomJoin();
    return { ok: true, roomCode: res.roomCode };
  };

  const handleLeaveRoomAndReturn = () => {
    setMenuModal('none');
    engineRef.current?.returnToMainMenu();
    peerRoomClient.leaveRoom();
    setRoomConnected(false);
    setRoomRole(null);
    setRoomCode(null);
    setRoomMembers([]);
    setRoomParty(null);
  };

  const handleStartNewSlot = (slotId: SaveSlotId, classId: ClassId) => {
    if (playModeRef.current === 'online') {
      setMenuModal('room');
      return;
    }
    setMenuModal('none');
    engineRef.current?.setPlayMode('singleplayer');
    engineRef.current?.setIdentity(account.uid, account.displayName);
    engineRef.current?.startNewGame(classId, slotId);
  };

  const handleLoadSlot = (slotId: SaveSlotId) => {
    if (playModeRef.current === 'online') {
      setMenuModal('room');
      return;
    }
    engineRef.current?.setPlayMode('singleplayer');
    engineRef.current?.setIdentity(account.uid, account.displayName);
    const ok = engineRef.current?.loadGameFromSlot(slotId);
    if (ok) {
      setMenuModal('none');
    }
  };

  const handleDeleteSlot = (slotId: SaveSlotId) => {
    if (playModeRef.current === 'online') return;
    engineRef.current?.deleteSlot(slotId);
  };

  const handleUpgradeTalent = (talentId: TalentId) => {
    engineRef.current?.upgradeTalent(talentId);
  };

  const handleSettingsChange = (next: GameSettings) => {
    engineRef.current?.updateSettings(next);
  };

  const handleForceSync = async () => {
    if (playModeRef.current === 'online') return;
    const latest = engineRef.current?.getAccount() ?? account;
    if (userRef.current.isGuest) return;
    setSyncStatus('syncing');
    const st = await syncAccountToCloud(latest, userRef.current);
    setSyncStatus(st);
  };

  const handleSaveAndSyncInPause = async () => {
    engineRef.current?.saveCurrentSlot(false, true);
    const latest = engineRef.current?.getAccount();
    if (!latest) return;
    if (playModeRef.current === 'online') {
      const curUser = userRef.current;
      const onlineUid = curUser.isGuest ? onlineDeviceUidRef.current : curUser.uid;
      const res = await saveOnlineRoomProfile({ ...latest, uid: onlineUid, mode: 'online' });
      setSyncStatus(res.status);
      return;
    }
    if (!userRef.current.isGuest) {
      setSyncStatus('syncing');
      const st = await syncAccountToCloud(latest, userRef.current);
      setSyncStatus(st);
    }
  };

  const handleManualUpdateCheck = async () => {
    if (!isNativeClientShell()) return;
    setCheckingUpdate(true);
    setUpdateCheckFeedback(null);
    const manifest = await checkForNativeClientUpdate();
    setCheckingUpdate(false);
    if (manifest) {
      dismissedUpdateVersionRef.current = null;
      setAvailableUpdate(manifest);
      setUpdateCheckFeedback(`发现新版本 ${manifest.tag}！`);
    } else {
      setUpdateCheckFeedback('当前已是最新版本（离线时已自动跳过网络检测）。');
    }
  };

  const modalCoveringScreen =
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

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#070b10]">
      <canvas
        ref={canvasRef}
        data-testid="game-canvas"
        className="block w-full h-full cursor-crosshair"
      />

      {/* Main Menu Lobby over live Canvas world */}
      {!hud.started && (
        <>
          <MainMenu
            account={account}
            user={user}
            syncStatus={syncStatus}
            playMode={playMode}
            onlineConnected={roomConnected}
            subModalOpen={menuModal !== 'none' || downloadOpen || changelogOpen || Boolean(availableUpdate)}
            onPlayModeChange={(m) => {
              void handlePlayModeChange(m);
            }}
            onOpenSaveSlots={() =>
              setMenuModal(playMode === 'online' ? 'room' : 'slots')
            }
            onOpenTalents={() => setMenuModal('talents')}
            onOpenBestiary={() => setMenuModal('bestiary')}
            onOpenAuth={() => setMenuModal('auth')}
            onOpenSettings={() => {
              setUpdateCheckFeedback(null);
              setMenuModal('settings');
            }}
            onOpenDownload={() => setDownloadOpen(true)}
            onOpenChangelog={() => setChangelogOpen(true)}
          />

          {menuModal === 'slots' && (
            <SaveSlotModal
              account={account}
              playMode={playMode}
              onLoadSlot={handleLoadSlot}
              onStartNewSlot={handleStartNewSlot}
              onDeleteSlot={handleDeleteSlot}
              onClose={() => setMenuModal('none')}
            />
          )}

          {menuModal === 'room' && (
            <RoomLobbyModal
              defaultName={account.displayName}
              existingSlot={account.slots.slot1}
              onCreateRoom={handleCreateRoom}
              onJoinRoom={handleJoinRoom}
              onClose={() => setMenuModal('none')}
            />
          )}

          {menuModal === 'talents' && (
            <TalentModal
              account={account}
              onUpgrade={handleUpgradeTalent}
              onClose={() => setMenuModal('none')}
            />
          )}

          {menuModal === 'bestiary' && (
            <BestiaryModal
              account={account}
              onClose={() => setMenuModal('none')}
            />
          )}

          {menuModal === 'auth' && (
            <AuthModal
              user={user}
              account={account}
              syncStatus={syncStatus}
              onForceSync={handleForceSync}
              onClose={() => setMenuModal('none')}
            />
          )}

          {menuModal === 'settings' && (
            <SettingsModal
              settings={account.settings}
              touchMode={touchMode}
              onTouchModeChange={setTouchMode}
              onChange={handleSettingsChange}
              onOpenDownload={() => setDownloadOpen(true)}
              onOpenChangelog={() => setChangelogOpen(true)}
              onCheckUpdate={() => void handleManualUpdateCheck()}
              checkingUpdate={checkingUpdate}
              updateCheckFeedback={updateCheckFeedback}
              onClose={() => setMenuModal('none')}
            />
          )}
        </>
      )}

      {/* Active Gameplay HUD + Mobile Virtual Joystick & Action Buttons */}
      {hud.started && (
        <HUD
          hud={hud}
          minimapRef={minimapRef}
          showTouchControls={showTouchControls}
          isCompactViewport={isCompactViewport}
          isPortrait={isPortrait}
          viewportW={viewportW}
          onlineConnected={roomConnected}
          partyCount={roomParty ? roomParty.members.length : roomMembers.length}
          inParty={Boolean(roomParty && roomParty.members.length > 0)}
          roomCode={roomCode}
          roomRole={roomRole}
          onTriggerSkill={(slot, source) => engineRef.current?.triggerSkill(slot, source)}
          onJoystickVector={(x, y) => engineRef.current?.setJoystickVector(x, y)}
          onVirtualAttackHold={(held) => engineRef.current?.setVirtualAttackHold(held)}
          onToggleInventory={() => engineRef.current?.toggleInventory()}
          onOpenWorldMap={() => engineRef.current?.toggleWorldMap(true)}
          onOpenDungeon={() => engineRef.current?.openDungeonModal(true)}
          onEnterDungeonFloor={(floor) => engineRef.current?.enterDungeonFloor(floor)}
          onExitDungeon={() => engineRef.current?.exitDungeon()}
          onOpenSocial={() => engineRef.current?.openSocialModal(true)}
          onInteract={() => engineRef.current?.interact()}
          onToggleMute={() => engineRef.current?.toggleMute()}
          onManualSave={() => engineRef.current?.saveCurrentSlot(false, true)}
          onOpenPause={() => engineRef.current?.setPaused(true)}
        />
      )}

      {/* In-Game Modals */}
      {hud.started && hud.shopOpen && (
        <ShopModal
          gold={hud.gold}
          prices={hud.shopPrices}
          onBuy={(item) => engineRef.current?.buyShopItem(item)}
          onClose={() => engineRef.current?.closeAllModals()}
        />
      )}

      {hud.started && hud.questOpen && (
        <QuestModal
          worldId={hud.worldId}
          breakthroughTier={hud.breakthroughTier}
          level={hud.level}
          levelCap={hud.levelCap}
          atLevelCap={hud.atLevelCap}
          activeQuest={hud.activeQuest}
          completedQuestCount={hud.completedQuestCount}
          onAcceptQuest={(id) => engineRef.current?.acceptQuest(id)}
          onClaimReward={() => engineRef.current?.claimQuestReward()}
          onClose={() => engineRef.current?.closeAllModals()}
        />
      )}

      {hud.started && hud.inventoryOpen && (
        <InventoryModal
          hud={hud}
          onEquip={(id) => engineRef.current?.equipItem(id)}
          onUnequip={(slot) => engineRef.current?.unequipSlot(slot)}
          onSell={(id) => engineRef.current?.sellItem(id)}
          onSellJunk={(maxRarity) => engineRef.current?.sellJunkGearItems(maxRarity)}
          onAutoEquip={() => engineRef.current?.autoEquipBest()}
          onUseSkillBook={(bookId) => engineRef.current?.useSkillBook(bookId)}
          onSellSkillBook={(bookId) => engineRef.current?.sellSkillBook(bookId)}
          onClose={() => engineRef.current?.closeAllModals()}
        />
      )}

      {hud.started && hud.awakeningOpen && (
        <AwakeningModal
          classId={hud.classId}
          awakened={hud.awakened}
          level={hud.level}
          kills={hud.kills}
          soulStones={hud.soulStones}
          onAwaken={(cid) => engineRef.current?.awakenClass(cid)}
          onClose={() => engineRef.current?.closeAllModals()}
        />
      )}

      {hud.started && hud.armorerOpen && (
        <ArmorShopModal
          gold={hud.gold}
          classId={hud.classId}
          stock={hud.armorStock}
          onBuy={(id) => engineRef.current?.buyArmorShopItem(id)}
          onRefresh={() => engineRef.current?.refreshArmorStock(false)}
          onClose={() => engineRef.current?.closeAllModals()}
        />
      )}

      {hud.started && hud.blacksmithOpen && (
        <BlacksmithModal
          gold={hud.gold}
          classId={hud.classId}
          materials={hud.materials}
          onCraft={(rid) => engineRef.current?.craftRecipe(rid)}
          onClose={() => engineRef.current?.closeAllModals()}
        />
      )}

      {hud.started && hud.upgraderOpen && (
        <UpgradeModal
          gold={hud.gold}
          equipped={hud.equipped}
          inventory={hud.inventory}
          materials={hud.materials}
          onUpgrade={(id, src) => engineRef.current?.upgradeGear(id, src)}
          onUpgradeBatch={(id, src, steps) =>
            engineRef.current?.upgradeGearBatchAction(id, src, steps)
          }
          onClose={() => engineRef.current?.closeAllModals()}
        />
      )}

      {hud.started && hud.talentOpen && (
        <TalentModal
          account={account}
          onUpgrade={handleUpgradeTalent}
          onClose={() => engineRef.current?.closeAllModals()}
        />
      )}

      {hud.started && hud.bestiaryOpen && (
        <BestiaryModal
          account={account}
          onClose={() => engineRef.current?.closeAllModals()}
        />
      )}

      {hud.started && hud.worldMapOpen && engineRef.current && (
        <WorldMapModal
          snapshot={engineRef.current.getWorldMapState()}
          worldLevel={hud.worldLevel}
          worldDifficulty={hud.worldDifficulty}
          inSafeZone={hud.inSafeZone}
          playMode={playMode}
          onSwitchWorld={(target) => engineRef.current?.switchWorld(target)}
          onClose={() => engineRef.current?.closeAllModals()}
        />
      )}

      {hud.started && hud.dungeonOpen && (
        <DungeonModal
          playMode={playMode}
          party={roomParty}
          roomMemberCount={roomMembers.length}
          currentFloor={hud.dungeonFloor}
          highestFloor={hud.highestDungeonFloor}
          playerLevel={hud.level}
          inDungeon={hud.worldId === 'dungeon'}
          dungeonCleared={hud.dungeonCleared}
          onEnterFloor={(floor) => engineRef.current?.enterDungeonFloor(floor)}
          onExitDungeon={() => engineRef.current?.exitDungeon()}
          onClose={() => engineRef.current?.closeAllModals()}
        />
      )}

      {hud.started && hud.socialOpen && (
        <SocialModal
          playMode={playMode}
          selfUid={peerRoomClient.getSelfId() || account.uid}
          connected={roomConnected}
          roomCode={roomCode}
          roomRole={roomRole}
          roomMembers={roomMembers}
          party={roomParty}
          inDungeon={hud.worldId === 'dungeon'}
          dungeonFloor={hud.dungeonFloor}
          onCreateParty={() => peerRoomClient.createParty(35)}
          onJoinParty={() => peerRoomClient.joinParty()}
          onLeaveParty={() => peerRoomClient.leaveParty()}
          onSetExpShare={(ratio) => peerRoomClient.setPartyExpShare(ratio)}
          onOpenDungeon={() => engineRef.current?.openDungeonModal(true)}
          onLeaveRoom={handleLeaveRoomAndReturn}
          onClose={() => engineRef.current?.closeAllModals()}
        />
      )}

      {hud.started && hud.paused && !modalCoveringScreen && (
        <PauseModal
          syncStatus={syncStatus}
          playMode={playMode}
          roomCode={roomCode}
          onResume={() => engineRef.current?.setPaused(false)}
          onSaveAndSync={handleSaveAndSyncInPause}
          onOpenTalents={() => engineRef.current?.openTalentModal(true)}
          onOpenBestiary={() => engineRef.current?.openBestiaryModal(true)}
          onReturnToMenu={handleLeaveRoomAndReturn}
        />
      )}

      {/* Room Event Notice Toast */}
      {onlineBanner && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 w-[92vw] max-w-md pointer-events-none">
          <div
            data-testid="online-banner"
            className={`pointer-events-auto px-4 py-2 rounded-xl border text-xs font-bold shadow-xl ${
              onlineBanner.level === 'warn'
                ? 'bg-rose-950/95 border-rose-400/70 text-rose-100'
                : 'bg-cyan-950/95 border-cyan-400/70 text-cyan-100'
            }`}
          >
            {onlineBanner.text}
          </div>
        </div>
      )}

      <div
        ref={hitFlashRef}
        className="fixed inset-0 pointer-events-none opacity-0 transition-opacity duration-200 z-20"
      />

      {downloadOpen && (
        <ClientDownloadModal
          onOpenChangelog={() => setChangelogOpen(true)}
          onClose={() => setDownloadOpen(false)}
        />
      )}

      {changelogOpen && (
        <ChangelogModal onClose={() => setChangelogOpen(false)} />
      )}

      {availableUpdate && isNativeClientShell() && (
        <ClientUpdateModal
          manifest={availableUpdate}
          onOpenHistory={() => setChangelogOpen(true)}
          onDismiss={() => {
            dismissedUpdateVersionRef.current = availableUpdate.version;
            setAvailableUpdate(null);
          }}
        />
      )}

      <OfflineIndicator />

      {bootError && (
        <div className="fixed left-0 right-0 bottom-0 z-50 bg-red-950/95 text-red-200 font-mono text-xs p-3">
          运行错误: {bootError}
        </div>
      )}
    </div>
  );
}
