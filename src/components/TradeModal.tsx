import { ArrowLeftRight, CheckCircle2, Coins, Lock, ShieldCheck, Unlock, X } from 'lucide-react';
import { MATERIAL_MAP, RARITY_META, SLOT_LABEL } from '../game/rules';
import type {
  GearItem,
  MaterialBag,
  MaterialId,
  SkillBookItem,
  TradeOffer,
  TradeSession,
} from '../game/types';

interface TradeModalProps {
  trade: TradeSession;
  selfUid: string;
  inventoryPool: {
    gold: number;
    inventory: GearItem[];
    materials: MaterialBag;
    skillBooks: SkillBookItem[];
  };
  onUpdateOffer: (partial: Partial<TradeOffer>) => void;
  onToggleLock: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const EMPTY_OFFER = (uid: string): TradeOffer => ({
  uid,
  gold: 0,
  gear: [],
  materials: {},
  skillBooks: [],
  locked: false,
  confirmed: false,
});

export function TradeModal({
  trade,
  selfUid,
  inventoryPool,
  onUpdateOffer,
  onToggleLock,
  onConfirm,
  onCancel,
}: TradeModalProps) {
  const peerUid = trade.initiatorUid === selfUid ? trade.targetUid : trade.initiatorUid;
  const peerName = trade.initiatorUid === selfUid ? trade.targetName : trade.initiatorName;

  const myOffer = trade.offers[selfUid] ?? EMPTY_OFFER(selfUid);
  const peerOffer = trade.offers[peerUid] ?? EMPTY_OFFER(peerUid);

  const selectedGearIds = new Set(myOffer.gear.map((g) => g.id));
  const selectedBookIds = new Set(myOffer.skillBooks.map((b) => b.id));
  const ownedMaterials = Object.entries(inventoryPool.materials).filter(
    ([, amt]) => (amt ?? 0) > 0
  ) as [MaterialId, number][];

  const bothLocked = myOffer.locked && peerOffer.locked;

  const toggleGear = (item: GearItem) => {
    const nextGear = selectedGearIds.has(item.id)
      ? myOffer.gear.filter((g) => g.id !== item.id)
      : [...myOffer.gear, item];
    onUpdateOffer({ gear: nextGear });
  };

  const toggleBook = (book: SkillBookItem) => {
    const nextBooks = selectedBookIds.has(book.id)
      ? myOffer.skillBooks.filter((b) => b.id !== book.id)
      : [...myOffer.skillBooks, book];
    onUpdateOffer({ skillBooks: nextBooks });
  };

  const setMaterialCount = (matId: MaterialId, count: number, maxOwned: number) => {
    const clamped = Math.max(0, Math.min(maxOwned, Math.floor(count)));
    const nextMats: MaterialBag = { ...myOffer.materials };
    if (clamped <= 0) {
      delete nextMats[matId];
    } else {
      nextMats[matId] = clamped;
    }
    onUpdateOffer({ materials: nextMats });
  };

  const setGoldAmount = (val: number) => {
    const clamped = Math.max(0, Math.min(inventoryPool.gold, Math.floor(val) || 0));
    onUpdateOffer({ gold: clamped });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4 safe-inset-pad">
      <div
        data-testid="trade-modal"
        className="w-full max-w-5xl max-h-[92vh] flex flex-col bg-[#101824] border-2 border-amber-400/65 rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3 sm:px-5 bg-gradient-to-r from-[#241b12] via-[#17202e] to-[#132231] border-b border-amber-400/30 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ArrowLeftRight className="w-5 h-5 text-amber-300 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-amber-100 truncate">
                面对面安全交易 · 交易对象：{peerName}
              </h2>
              <p className="text-[11px] text-slate-400">
                支持装备、原材料、技能书与金币任意互通置换
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/70 border border-slate-600/60 text-slate-300 cursor-pointer shrink-0"
            aria-label="取消交易"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Two-column Exchange Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Left: My Offer */}
          <div className="rounded-xl bg-slate-950/75 border border-cyan-400/35 p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-cyan-200">
                我方出价（点击选择物品）
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                  myOffer.locked
                    ? 'bg-emerald-950/80 border-emerald-400/60 text-emerald-300'
                    : 'bg-slate-900 border-slate-600 text-slate-400'
                }`}
              >
                {myOffer.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {myOffer.locked ? '已锁定' : '编辑中'}
              </span>
            </div>

            {/* Gold */}
            <div className="rounded-lg bg-slate-900/80 border border-amber-400/25 p-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-amber-300 font-bold">
                <Coins className="w-4 h-4" />
                <span>交易金币 (持有 {inventoryPool.gold})</span>
              </div>
              <input
                type="number"
                data-testid="trade-gold-input"
                min={0}
                max={inventoryPool.gold}
                value={myOffer.gold}
                onChange={(e) => setGoldAmount(Number(e.target.value))}
                className="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right text-xs font-mono text-amber-200 outline-none focus:border-amber-400"
              />
            </div>

            {/* Gear */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-300">
                背包装备 ({myOffer.gear.length}/{inventoryPool.inventory.length})
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                {inventoryPool.inventory.length === 0 ? (
                  <div className="text-[11px] text-slate-500 py-2 text-center bg-black/25 rounded">
                    背包暂无可交易装备
                  </div>
                ) : (
                  inventoryPool.inventory.map((g) => {
                    const selected = selectedGearIds.has(g.id);
                    const rm = RARITY_META[g.rarity];
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleGear(g)}
                        className={`w-full text-left px-2.5 py-1.5 rounded border text-xs flex items-center justify-between gap-2 cursor-pointer ${
                          selected
                            ? 'bg-cyan-950/75 border-cyan-400 text-white'
                            : 'bg-slate-900/70 border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <span className="truncate font-semibold" style={{ color: rm.color }}>
                          [{rm.label}] {g.name}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {SLOT_LABEL[g.slot]} · {selected ? '✓ 已选' : '选择'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Skill Books */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-300">
                技能秘籍 ({myOffer.skillBooks.length}/{inventoryPool.skillBooks.length})
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                {inventoryPool.skillBooks.length === 0 ? (
                  <div className="text-[11px] text-slate-500 py-2 text-center bg-black/25 rounded">
                    暂无技能书
                  </div>
                ) : (
                  inventoryPool.skillBooks.map((b) => {
                    const selected = selectedBookIds.has(b.id);
                    const rm = RARITY_META[b.rarity];
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleBook(b)}
                        className={`w-full text-left px-2.5 py-1.5 rounded border text-xs flex items-center justify-between gap-2 cursor-pointer ${
                          selected
                            ? 'bg-purple-950/75 border-purple-400 text-white'
                            : 'bg-slate-900/70 border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <span className="truncate font-semibold" style={{ color: rm.color }}>
                          📘 {b.name} (+{b.levelBonus})
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {selected ? '✓ 已选' : '选择'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Materials */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-300">原料素材</div>
              <div className="max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
                {ownedMaterials.length === 0 ? (
                  <div className="col-span-full text-[11px] text-slate-500 py-2 text-center bg-black/25 rounded">
                    暂无原料
                  </div>
                ) : (
                  ownedMaterials.map(([matId, owned]) => {
                    const def = MATERIAL_MAP[matId];
                    const chosen = myOffer.materials[matId] ?? 0;
                    return (
                      <div
                        key={matId}
                        className="rounded bg-slate-900/80 border border-white/10 px-2 py-1 flex items-center justify-between gap-1.5 text-[11px]"
                      >
                        <span className="truncate text-slate-200">
                          {def.icon} {def.name} ({owned})
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={owned}
                          value={chosen}
                          onChange={(e) => setMaterialCount(matId, Number(e.target.value), owned)}
                          className="w-12 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-right font-mono text-cyan-200"
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right: Peer Offer */}
          <div className="rounded-xl bg-slate-950/75 border border-amber-400/35 p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-amber-200">
                对方出价（{peerName}）
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                    peerOffer.locked
                      ? 'bg-emerald-950/80 border-emerald-400/60 text-emerald-300'
                      : 'bg-slate-900 border-slate-600 text-slate-400'
                  }`}
                >
                  {peerOffer.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  {peerOffer.locked ? '对方已锁定' : '对方编辑中'}
                </span>
                {peerOffer.confirmed && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-600 text-white">
                    已确认
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-slate-900/80 border border-amber-400/25 p-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-300 flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-300" />
                对方金币
              </span>
              <strong data-testid="trade-peer-gold" className="font-mono text-amber-300 text-sm">
                {peerOffer.gold} 金币
              </strong>
            </div>

            <div className="flex-1 rounded-lg bg-black/30 border border-white/10 p-2.5 space-y-2.5 overflow-y-auto max-h-80">
              <div>
                <div className="text-[11px] font-bold text-slate-400 mb-1">
                  装备 ({peerOffer.gear.length})
                </div>
                {peerOffer.gear.length === 0 ? (
                  <div className="text-[11px] text-slate-500">无</div>
                ) : (
                  <div className="space-y-1">
                    {peerOffer.gear.map((g) => (
                      <div
                        key={g.id}
                        className="px-2 py-1 rounded bg-slate-900/85 border border-white/10 text-xs flex justify-between"
                      >
                        <span style={{ color: RARITY_META[g.rarity].color }}>
                          [{RARITY_META[g.rarity].label}] {g.name}
                        </span>
                        <span className="text-[10px] text-slate-400">{SLOT_LABEL[g.slot]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[11px] font-bold text-slate-400 mb-1">
                  技能秘籍 ({peerOffer.skillBooks.length})
                </div>
                {peerOffer.skillBooks.length === 0 ? (
                  <div className="text-[11px] text-slate-500">无</div>
                ) : (
                  <div className="space-y-1">
                    {peerOffer.skillBooks.map((b) => (
                      <div
                        key={b.id}
                        className="px-2 py-1 rounded bg-slate-900/85 border border-white/10 text-xs"
                        style={{ color: RARITY_META[b.rarity].color }}
                      >
                        📘 {b.name} (+{b.levelBonus})
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[11px] font-bold text-slate-400 mb-1">原料素材</div>
                {Object.entries(peerOffer.materials).filter(([, c]) => (c ?? 0) > 0).length === 0 ? (
                  <div className="text-[11px] text-slate-500">无</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(peerOffer.materials)
                      .filter(([, c]) => (c ?? 0) > 0)
                      .map(([id, c]) => {
                        const def = MATERIAL_MAP[id as MaterialId];
                        return (
                          <span
                            key={id}
                            className="px-2 py-0.5 rounded bg-slate-900 border border-white/10 text-[11px] text-slate-200"
                          >
                            {def.icon} {def.name} ×{c}
                          </span>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Controls */}
        <div className="px-4 py-3 bg-slate-950/90 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-amber-300/90">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>防欺诈机制：修改任何交易物将自动解除双方锁定，需重新锁定后方可成交</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-slate-200 cursor-pointer"
            >
              取消交易
            </button>
            <button
              type="button"
              data-testid="trade-lock-btn"
              onClick={onToggleLock}
              className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                myOffer.locked
                  ? 'bg-slate-700 hover:bg-slate-600 text-amber-200 border border-amber-400/50'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-slate-950'
              }`}
            >
              {myOffer.locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              {myOffer.locked ? '解锁修改' : '锁定物品'}
            </button>
            <button
              type="button"
              data-testid="trade-confirm-btn"
              disabled={!bothLocked || myOffer.confirmed}
              onClick={onConfirm}
              className="px-4 py-2 rounded-lg text-xs font-extrabold flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {myOffer.confirmed ? '等待对方确认...' : '确认交易'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
