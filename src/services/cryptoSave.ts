import { MAX_ENHANCE_LV, MAX_SKILL_LV, sanitizeAccountData } from '../game/rules.ts';
import type { AccountData } from '../game/types.ts';

export interface EncryptedEnvelope {
  v: 2;
  uid: string;
  iv: string; // base64
  ct: string; // base64 (ciphertext + authTag)
  mac: string; // base64 HMAC-SHA256
  ts: number;
}

const APP_PEPPER = 'FantasyContinent_OnlineVault_AES256GCM_v2_8f4a9c';

function getSubtle(): SubtleCrypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error('WebCrypto subtle API unavailable');
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64, 'base64');
    const out = new Uint8Array(new ArrayBuffer(buf.length));
    out.set(buf);
    return out;
  }
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

async function deriveKeys(uid: string): Promise<{ aesKey: CryptoKey; hmacKey: CryptoKey }> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const material = enc.encode(`${APP_PEPPER}::${uid}`);
  const digestBuf = await subtle.digest('SHA-256', material);
  const macSeedBuf = await subtle.digest('SHA-256', enc.encode(`${uid}::HMAC::${APP_PEPPER}`));

  const aesKey = await subtle.importKey('raw', digestBuf, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
  const hmacKey = await subtle.importKey(
    'raw',
    macSeedBuf,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  return { aesKey, hmacKey };
}

export async function encryptOnlineAccount(account: AccountData): Promise<EncryptedEnvelope> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const clean: AccountData = {
    ...account,
    mode: 'online',
  };
  const plaintext = enc.encode(JSON.stringify(clean));
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);

  const { aesKey, hmacKey } = await deriveKeys(clean.uid);
  const ctBuf = await subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext);
  const ivB64 = toBase64(iv);
  const ctB64 = toBase64(new Uint8Array(ctBuf));
  const ts = Date.now();
  const macPayload = enc.encode(`v2|${clean.uid}|${ivB64}|${ctB64}|${ts}`);
  const macBuf = await subtle.sign('HMAC', hmacKey, macPayload);

  return {
    v: 2,
    uid: clean.uid,
    iv: ivB64,
    ct: ctB64,
    mac: toBase64(new Uint8Array(macBuf)),
    ts,
  };
}

export async function verifyEncryptedEnvelope(
  envelope: EncryptedEnvelope,
  expectedUid?: string
): Promise<boolean> {
  if (!envelope || envelope.v !== 2 || !envelope.uid || !envelope.iv || !envelope.ct || !envelope.mac) {
    return false;
  }
  if (expectedUid && envelope.uid !== expectedUid) {
    return false;
  }
  try {
    const subtle = getSubtle();
    const enc = new TextEncoder();
    const { hmacKey } = await deriveKeys(envelope.uid);
    const macPayload = enc.encode(
      `v2|${envelope.uid}|${envelope.iv}|${envelope.ct}|${envelope.ts}`
    );
    const macBytes = fromBase64(envelope.mac);
    return await subtle.verify('HMAC', hmacKey, macBytes, macPayload);
  } catch {
    return false;
  }
}

export async function decryptOnlineAccount(
  envelope: EncryptedEnvelope,
  expectedUid: string,
  fallbackName = '联机冒险者'
): Promise<AccountData> {
  const validMac = await verifyEncryptedEnvelope(envelope, expectedUid);
  if (!validMac) {
    throw new Error('联机加密存档校验失败：数据签名无效或已被篡改');
  }
  const subtle = getSubtle();
  const { aesKey } = await deriveKeys(envelope.uid);
  const iv = fromBase64(envelope.iv);
  const ct = fromBase64(envelope.ct);
  const ptBuf = await subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
  const jsonText = new TextDecoder().decode(ptBuf);
  const parsed = JSON.parse(jsonText);
  const sanitized = sanitizeAccountData(parsed, expectedUid, fallbackName);
  sanitized.mode = 'online';

  const check = verifyOnlineAccountIntegrity(sanitized);
  if (!check.ok) {
    throw new Error(`联机反作弊验证失败：${check.reason}`);
  }
  return sanitized;
}

export function verifyOnlineAccountIntegrity(account: AccountData): { ok: boolean; reason?: string } {
  if (!account || !account.uid) return { ok: false, reason: '缺少账号 UID' };
  if (account.soulStones < 0 || account.soulStones > 5_000_000) {
    return { ok: false, reason: '灵魂石数值异常' };
  }
  const slotList = Object.values(account.slots);
  for (const s of slotList) {
    if (!s) continue;
    if (!Number.isFinite(s.gold) || s.gold < 0 || s.gold > 500_000_000) {
      return { ok: false, reason: '金币数值超出合法阈值' };
    }
    if (!Number.isFinite(s.level) || s.level < 1 || s.level > 500) {
      return { ok: false, reason: '角色等级异常' };
    }
    const maxCap = (Math.max(0, s.breakthroughTier) + 1) * 10;
    if (s.level > maxCap) {
      return { ok: false, reason: `角色等级 Lv.${s.level} 超过当前突破上限 Lv.${maxCap}` };
    }
    if (s.skillLevels) {
      for (const lv of s.skillLevels) {
        if (lv < 1 || lv > MAX_SKILL_LV) {
          return { ok: false, reason: '技能等级超出合法范围' };
        }
      }
    }
    const allGear = [
      s.equipped.weapon,
      s.equipped.armor,
      s.equipped.accessory,
      ...s.inventory,
    ];
    for (const g of allGear) {
      if (!g) continue;
      if ((g.enhanceLv ?? 0) < 0 || (g.enhanceLv ?? 0) > MAX_ENHANCE_LV) {
        return { ok: false, reason: `装备强化等级异常 (+${g.enhanceLv})` };
      }
    }
  }
  return { ok: true };
}
