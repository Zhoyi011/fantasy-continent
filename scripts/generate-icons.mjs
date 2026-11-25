import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const rootDir = path.resolve(import.meta.dirname, '..');

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter none
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function blendPixel(buf, idx, r, g, b, a) {
  if (a <= 0) return;
  const srcA = Math.min(1, a);
  const dstA = buf[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  buf[idx] = clampByte((r * srcA + buf[idx] * dstA * (1 - srcA)) / outA);
  buf[idx + 1] = clampByte((g * srcA + buf[idx + 1] * dstA * (1 - srcA)) / outA);
  buf[idx + 2] = clampByte((b * srcA + buf[idx + 2] * dstA * (1 - srcA)) / outA);
  buf[idx + 3] = clampByte(outA * 255);
}

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distToPolyEdge(px, py, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = distToSegment(px, py, a[0], a[1], b[0], b[1]);
    if (d < best) best = d;
  }
  return best;
}

function renderBrandRgba(size, options = {}) {
  const { maskable = false, roundMask = false, transparentMargin = false } = options;
  const scale = maskable ? 0.68 : 0.84;
  const rgba = Buffer.alloc(size * size * 4);

  const starPoly = [
    [0, -0.72],
    [0.2, -0.2],
    [0.72, 0],
    [0.2, 0.2],
    [0, 0.72],
    [-0.2, 0.2],
    [-0.72, 0],
    [-0.2, -0.2],
  ].map(([x, y]) => [x * scale, y * scale]);

  const bladePoly = [
    [0, -0.58],
    [0.105, -0.05],
    [0, 0.56],
    [-0.105, -0.05],
  ].map(([x, y]) => [x * scale, y * scale]);

  const invHalf = 2 / size;
  const aa = 1.6 * invHalf;

  for (let y = 0; y < size; y++) {
    const ny = (y + 0.5) * invHalf - 1;
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) * invHalf - 1;
      const idx = (y * size + x) * 4;

      if (roundMask) {
        const dRound = Math.hypot(nx, ny);
        if (dRound > 0.96) continue;
      } else if (transparentMargin) {
        const cornerR = 0.28;
        const ax = Math.max(0, Math.abs(nx) - (1 - cornerR));
        const ay = Math.max(0, Math.abs(ny) - (1 - cornerR));
        if (Math.hypot(ax, ay) > cornerR) continue;
      }

      // Rich dark-navy radial glow backdrop
      const rad = Math.hypot(nx, ny + 0.14);
      const tBg = Math.min(1, rad / 1.25);
      const bgR = 23 * (1 - tBg) + 6 * tBg;
      const bgG = 37 * (1 - tBg) + 9 * tBg;
      const bgB = 66 * (1 - tBg) + 15 * tBg;
      rgba[idx] = clampByte(bgR);
      rgba[idx + 1] = clampByte(bgG);
      rgba[idx + 2] = clampByte(bgB);
      rgba[idx + 3] = 255;

      // Subtle outer golden border for non-maskable icons
      if (!maskable && !roundMask) {
        const cornerR = transparentMargin ? 0.28 : 0.32;
        const limit = transparentMargin ? 0.93 : 0.92;
        const bx = Math.max(0, Math.abs(nx) - (limit - cornerR));
        const by = Math.max(0, Math.abs(ny) - (limit - cornerR));
        const borderDist = Math.abs(Math.hypot(bx, by) - cornerR);
        if (borderDist < 0.025 && (Math.abs(nx) > limit - cornerR || Math.abs(ny) > limit - cornerR || Math.hypot(bx, by) > cornerR - 0.025)) {
          blendPixel(rgba, idx, 245, 158, 11, 0.35);
        }
      }

      // Arcane cyan dashed halo ring
      const dRing = Math.abs(Math.hypot(nx, ny) - 0.68 * scale);
      if (dRing < 0.018 * scale) {
        const ang = Math.atan2(ny, nx);
        const dash = Math.sin(ang * 14);
        if (dash > -0.25) {
          blendPixel(rgba, idx, 56, 189, 248, 0.35);
        }
      }

      // Outer golden crest star fill & crisp stroke
      if (pointInPoly(nx, ny, starPoly)) {
        blendPixel(rgba, idx, 251, 191, 36, 0.18);
      }
      const dStar = distToPolyEdge(nx, ny, starPoly);
      if (dStar < 0.055 * scale + aa) {
        const a = Math.max(0, Math.min(1, (0.055 * scale + aa - dStar) / aa));
        const gMix = Math.max(0, Math.min(1, (ny / scale + 0.72) / 1.44));
        const gr = 254 * (1 - gMix) + 217 * gMix;
        const gg = 240 * (1 - gMix) + 119 * gMix;
        const gb = 138 * (1 - gMix) + 6 * gMix;
        blendPixel(rgba, idx, gr, gg, gb, a);
      }

      // Crossbar
      const dCross = distToSegment(nx, ny, -0.34 * scale, 0, 0.34 * scale, 0);
      if (dCross < 0.028 * scale + aa) {
        const a = Math.max(0, Math.min(1, (0.028 * scale + aa - dCross) / aa));
        blendPixel(rgba, idx, 254, 240, 138, a * 0.85);
      }

      // Central golden sword/diamond spine
      if (pointInPoly(nx, ny, bladePoly)) {
        const gMix = Math.max(0, Math.min(1, (ny / scale + 0.58) / 1.14));
        const br = 254 * (1 - gMix) + 190 * gMix;
        const bg = 243 * (1 - gMix) + 100 * gMix;
        const bb = 170 * (1 - gMix) + 12 * gMix;
        blendPixel(rgba, idx, br, bg, bb, 1);
      }

      // Center obsidian bezel & luminous cyan crystal core
      const dCore = Math.hypot(nx, ny);
      const bezelR = 0.145 * scale;
      const gemR = 0.095 * scale;
      if (dCore < bezelR + aa) {
        const a = Math.max(0, Math.min(1, (bezelR + aa - dCore) / aa));
        if (dCore > gemR) {
          blendPixel(rgba, idx, 10, 16, 28, a);
          if (Math.abs(dCore - bezelR) < 0.024 * scale) {
            blendPixel(rgba, idx, 251, 191, 36, a);
          }
        } else {
          const highlight = Math.max(0, 1 - Math.hypot(nx + 0.025 * scale, ny + 0.025 * scale) / gemR);
          blendPixel(
            rgba,
            idx,
            14 + highlight * 210,
            165 + highlight * 80,
            233 + highlight * 22,
            a
          );
        }
      }
    }
  }

  return rgba;
}

function buildIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(count * 16);
  let offset = 6 + count * 16;
  const chunks = [header, dir];

  entries.forEach((entry, i) => {
    const pos = i * 16;
    dir[pos] = entry.size >= 256 ? 0 : entry.size;
    dir[pos + 1] = entry.size >= 256 ? 0 : entry.size;
    dir[pos + 2] = 0;
    dir[pos + 3] = 0;
    dir.writeUInt16LE(1, pos + 4); // planes
    dir.writeUInt16LE(32, pos + 6); // bpp
    dir.writeUInt32LE(entry.png.length, pos + 8);
    dir.writeUInt32LE(offset, pos + 12);
    offset += entry.png.length;
    chunks.push(entry.png);
  });

  return Buffer.concat(chunks);
}

function buildIcns(png256, png512) {
  // Valid Apple ICNS container using modern PNG-based ic08 (256x256) and ic09 (512x512)
  const makeEntry = (ostype, data) => {
    const hdr = Buffer.alloc(8);
    hdr.write(ostype, 0, 'ascii');
    hdr.writeUInt32BE(8 + data.length, 4);
    return Buffer.concat([hdr, data]);
  };
  const body = Buffer.concat([makeEntry('ic08', png256), makeEntry('ic09', png512)]);
  const rootHdr = Buffer.alloc(8);
  rootHdr.write('icns', 0, 'ascii');
  rootHdr.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([rootHdr, body]);
}

function ensureWrite(relPath, buf) {
  const fullPath = path.join(rootDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buf);
}

const pwa192 = encodePng(192, 192, renderBrandRgba(192));
const pwa512 = encodePng(512, 512, renderBrandRgba(512));
const pwaMaskable512 = encodePng(512, 512, renderBrandRgba(512, { maskable: true }));
const appleTouch = encodePng(180, 180, renderBrandRgba(180));

ensureWrite('public/pwa-192x192.png', pwa192);
ensureWrite('public/pwa-512x512.png', pwa512);
ensureWrite('public/pwa-maskable-512x512.png', pwaMaskable512);
ensureWrite('public/apple-touch-icon.png', appleTouch);

const png16 = encodePng(16, 16, renderBrandRgba(16, { transparentMargin: true }));
const png32 = encodePng(32, 32, renderBrandRgba(32, { transparentMargin: true }));
const png48 = encodePng(48, 48, renderBrandRgba(48, { transparentMargin: true }));
const png128 = encodePng(128, 128, renderBrandRgba(128, { transparentMargin: true }));
const png256 = encodePng(256, 256, renderBrandRgba(256, { transparentMargin: true }));

const faviconIco = buildIco([
  { size: 16, png: png16 },
  { size: 32, png: png32 },
  { size: 48, png: png48 },
]);
const tauriIco = buildIco([
  { size: 16, png: png16 },
  { size: 32, png: png32 },
  { size: 48, png: png48 },
  { size: 256, png: png256 },
]);

ensureWrite('public/favicon.ico', faviconIco);
ensureWrite('src-tauri/icons/32x32.png', png32);
ensureWrite('src-tauri/icons/128x128.png', png128);
ensureWrite('src-tauri/icons/128x128@2x.png', png256);
ensureWrite('src-tauri/icons/icon.png', pwa512);
ensureWrite('src-tauri/icons/icon.ico', tauriIco);
ensureWrite('src-tauri/icons/icon.icns', buildIcns(png256, pwa512));

// Android mipmap icons (mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi)
const androidDensities = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];
for (const [folder, px] of androidDensities) {
  ensureWrite(
    `android/app/src/main/res/${folder}/ic_launcher.png`,
    encodePng(px, px, renderBrandRgba(px))
  );
  ensureWrite(
    `android/app/src/main/res/${folder}/ic_launcher_round.png`,
    encodePng(px, px, renderBrandRgba(px, { roundMask: true }))
  );
  ensureWrite(
    `android/app/src/main/res/${folder}/ic_launcher_foreground.png`,
    encodePng(px, px, renderBrandRgba(px, { maskable: true }))
  );
}

console.log('[generate-icons] Generated PWA, Tauri (.png/.ico/.icns), and Android mipmap icons.');
