import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');

function parseArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return String(process.argv[idx + 1] ?? '').trim();
  }
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1).trim() : '';
}

const versionJsonArg = parseArg('--version-json');
const versionJsonPath = versionJsonArg
  ? path.resolve(rootDir, versionJsonArg)
  : path.join(rootDir, 'public', 'version.json');

if (!fs.existsSync(versionJsonPath)) {
  console.error(
    `[generate-release-notes] Missing ${versionJsonPath}. Run generate-version-json.mjs first.`
  );
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
const cats = data.categories || { features: [], improvements: [], fixes: [] };
const repo = (data.repository || 'https://github.com/Zhoyi011/fantasy-continent').replace(/\/+$/, '');
const latestBase = `${repo}/releases/latest/download`;

const lines = [
  `# ${data.title || `《幻想大陆》${data.tag}`}`,
  '',
  `> 发布版本：**${data.tag}** · 发布日期：**${data.releaseDate}** · 应用标识：\`${data.packageId}\``,
  '',
];

if (data.highlights) {
  lines.push(data.highlights, '');
}

if (Array.isArray(cats.features) && cats.features.length > 0) {
  lines.push('### 新增功能');
  for (const item of cats.features) {
    lines.push(`- ${item}`);
  }
  lines.push('');
}

if (Array.isArray(cats.improvements) && cats.improvements.length > 0) {
  lines.push('### 优化体验');
  for (const item of cats.improvements) {
    lines.push(`- ${item}`);
  }
  lines.push('');
}

if (Array.isArray(cats.fixes) && cats.fixes.length > 0) {
  lines.push('### 问题修复');
  for (const item of cats.fixes) {
    lines.push(`- ${item}`);
  }
  lines.push('');
}

lines.push(
  '### 全平台客户端下载（Latest 固定直链）',
  `- **Windows 安装版**：[\`fantasy-continent-windows-setup.exe\`](${latestBase}/fantasy-continent-windows-setup.exe)`,
  `- **Windows 绿色便携版**：[\`fantasy-continent-windows-portable.exe\`](${latestBase}/fantasy-continent-windows-portable.exe)`,
  `- **Android 正式签名版**：[\`fantasy-continent-android.apk\`](${latestBase}/fantasy-continent-android.apk)`,
  `- **Linux AppImage 通用包**：[\`fantasy-continent-linux.AppImage\`](${latestBase}/fantasy-continent-linux.AppImage)`,
  `- **Linux Debian / Ubuntu 安装包**：[\`fantasy-continent-linux.deb\`](${latestBase}/fantasy-continent-linux.deb)`,
  `- **Web / PWA 离线包**：[\`fantasy-continent-web-pwa.tar.gz\`](${latestBase}/fantasy-continent-web-pwa.tar.gz)`,
  `- **版本清单与校验文件**：[\`version.json\`](${latestBase}/version.json) · [\`SHA256SUMS.txt\`](${latestBase}/SHA256SUMS.txt)`,
  ''
);

const outArg = parseArg('--out');
const outPath = outArg ? path.resolve(rootDir, outArg) : path.join(rootDir, 'RELEASE_NOTES.md');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf-8');

console.log(`[generate-release-notes] Wrote Simplified Chinese release notes to ${outPath}`);
