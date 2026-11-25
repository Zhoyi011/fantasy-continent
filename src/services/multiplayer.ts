import type {
  ClassId,
  FriendEntry,
  GearItem,
  OnlineInviteNotice,
  PartyState,
  RemotePlayerSnapshot,
  SkillBookItem,
  TradeOffer,
  TradeSession,
  WorldId,
} from '../game/types';

export type MultiplayerEvent =
  | { type: 'connected'; connected: boolean }
  | { type: 'players'; players: RemotePlayerSnapshot[] }
  | { type: 'player_delta'; player: RemotePlayerSnapshot }
  | { type: 'friends'; friends: FriendEntry[] }
  | { type: 'party'; party: PartyState | null }
  | { type: 'invite'; notice: OnlineInviteNotice }
  | { type: 'trade_state'; trade: TradeSession }
  | {
      type: 'trade_executed';
      tradeId: string;
      peerName: string;
      give: TradeOffer;
      receive: TradeOffer;
    }
  | { type: 'party_exp'; exp: number; fromName: string }
  | {
      type: 'party_loot_leader';
      gear?: GearItem;
      skillBook?: SkillBookItem;
      fromName: string;
    }
  | { type: 'party_heal'; fromName: string; healHp: number; shieldHp: number }
  | { type: 'notice'; level: 'ok' | 'warn'; text: string };

type Listener = (ev: MultiplayerEvent) => void;

class MultiplayerClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private reconnectTimer: number | null = null;
  private activeHello: {
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
    dungeonFloor: number | null;
  } | null = null;
  private shouldStayConnected = false;

  public players = new Map<string, RemotePlayerSnapshot>();
  public friends: FriendEntry[] = [];
  public party: PartyState | null = null;
  public activeTrade: TradeSession | null = null;
  public connected = false;

  onEvent(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(ev: MultiplayerEvent) {
    for (const fn of this.listeners) fn(ev);
  }

  connect(hello: NonNullable<MultiplayerClient['activeHello']>) {
    this.activeHello = { ...hello };
    this.shouldStayConnected = true;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'auth:hello', ...hello });
      }
      return;
    }

    if (typeof window === 'undefined') return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.emit({ type: 'connected', connected: true });
      if (this.activeHello) {
        this.send({ type: 'auth:hello', ...this.activeHello });
      }
    };

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const type = String(msg.type || '');
      if (type === 'ws:welcome') {
        const list = Array.isArray(msg.players) ? (msg.players as RemotePlayerSnapshot[]) : [];
        this.players.clear();
        for (const p of list) this.players.set(p.uid, p);
        this.friends = Array.isArray(msg.friends) ? (msg.friends as FriendEntry[]) : [];
        this.party = (msg.party as PartyState | null) ?? null;
        this.emit({ type: 'players', players: list });
        this.emit({ type: 'friends', friends: this.friends });
        this.emit({ type: 'party', party: this.party });
      } else if (type === 'world:players') {
        const list = Array.isArray(msg.players) ? (msg.players as RemotePlayerSnapshot[]) : [];
        this.players.clear();
        for (const p of list) this.players.set(p.uid, p);
        this.emit({ type: 'players', players: list });
      } else if (type === 'world:player_delta') {
        const p = msg.player as RemotePlayerSnapshot | undefined;
        if (p?.uid) {
          this.players.set(p.uid, p);
          this.emit({ type: 'player_delta', player: p });
        }
      } else if (type === 'friends:update') {
        this.friends = Array.isArray(msg.friends) ? (msg.friends as FriendEntry[]) : [];
        this.emit({ type: 'friends', friends: this.friends });
      } else if (type === 'party:update') {
        this.party = (msg.party as PartyState | null) ?? null;
        this.emit({ type: 'party', party: this.party });
      } else if (type === 'invite:notice') {
        const notice = msg.notice as OnlineInviteNotice | undefined;
        if (notice) this.emit({ type: 'invite', notice });
      } else if (type === 'trade:state') {
        const trade = msg.trade as TradeSession | undefined;
        if (trade) {
          this.activeTrade =
            trade.status === 'active' || trade.status === 'pending' ? trade : null;
          this.emit({ type: 'trade_state', trade });
        }
      } else if (type === 'trade:executed') {
        this.activeTrade = null;
        this.emit({
          type: 'trade_executed',
          tradeId: String(msg.tradeId || ''),
          peerName: String(msg.peerName || ''),
          give: msg.give as TradeOffer,
          receive: msg.receive as TradeOffer,
        });
      } else if (type === 'party:exp_grant') {
        this.emit({
          type: 'party_exp',
          exp: Number(msg.exp) || 0,
          fromName: String(msg.fromName || '队友'),
        });
      } else if (type === 'party:loot_to_leader') {
        this.emit({
          type: 'party_loot_leader',
          gear: msg.gear as GearItem | undefined,
          skillBook: msg.skillBook as SkillBookItem | undefined,
          fromName: String(msg.fromName || '队友'),
        });
      } else if (type === 'party:heal_received') {
        this.emit({
          type: 'party_heal',
          fromName: String(msg.fromName || '奶妈队友'),
          healHp: Number(msg.healHp) || 0,
          shieldHp: Number(msg.shieldHp) || 0,
        });
      } else if (type === 'ws:notice') {
        this.emit({
          type: 'notice',
          level: msg.level === 'warn' ? 'warn' : 'ok',
          text: String(msg.text || ''),
        });
      }
    };

    ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      this.emit({ type: 'connected', connected: false });
      if (this.shouldStayConnected && typeof window !== 'undefined') {
        if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => {
          if (this.shouldStayConnected && this.activeHello) {
            this.connect(this.activeHello);
          }
        }, 1800);
      }
    };
  }

  disconnect() {
    this.shouldStayConnected = false;
    if (this.reconnectTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.players.clear();
    this.friends = [];
    this.party = null;
    this.activeTrade = null;
    this.connected = false;
    this.emit({ type: 'connected', connected: false });
  }

  send(payload: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  sendMove(state: {
    worldId: WorldId;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    level: number;
    classId: ClassId;
    facingAng: number;
    name?: string;
    dungeonFloor?: number | null;
  }) {
    if (this.activeHello) {
      this.activeHello = {
        ...this.activeHello,
        ...state,
        dungeonFloor: state.dungeonFloor ?? null,
      };
    }
    this.send({ type: 'player:move', ...state });
  }

  addFriendByCode(code: string) {
    this.send({ type: 'friend:add_by_code', code });
  }

  removeFriend(targetUid: string) {
    this.send({ type: 'friend:remove', targetUid });
  }

  createParty() {
    this.send({ type: 'party:create' });
  }

  inviteToParty(targetUid: string) {
    this.send({ type: 'party:invite', targetUid });
  }

  acceptPartyInvite(partyId: string) {
    this.send({ type: 'party:accept', partyId });
  }

  leaveParty() {
    this.send({ type: 'party:leave' });
  }

  kickPartyMember(targetUid: string) {
    this.send({ type: 'party:kick', targetUid });
  }

  setPartyExpRatio(ratio: number) {
    this.send({ type: 'party:set_exp_ratio', ratio });
  }

  sharePartyKill(exp: number, gear?: GearItem, skillBook?: SkillBookItem) {
    this.send({ type: 'party:kill_share', exp, gear, skillBook });
  }

  sendPartyHealAura(healHp: number, shieldHp: number) {
    this.send({ type: 'party:heal_aura', healHp, shieldHp });
  }

  requestTrade(targetUid: string) {
    this.send({ type: 'trade:request', targetUid });
  }

  acceptTrade(tradeId: string) {
    this.send({ type: 'trade:accept', tradeId });
  }

  updateTradeOffer(tradeId: string, offer: Partial<TradeOffer>) {
    this.send({ type: 'trade:update_offer', tradeId, offer });
  }

  toggleTradeLock(tradeId: string) {
    this.send({ type: 'trade:toggle_lock', tradeId });
  }

  confirmTrade(tradeId: string) {
    this.send({ type: 'trade:confirm', tradeId });
  }

  cancelTrade(tradeId: string) {
    this.send({ type: 'trade:cancel', tradeId });
  }
}

export const multiplayerClient = new MultiplayerClient();
