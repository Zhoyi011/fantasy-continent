import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const changelogPath = path.join(rootDir, 'changelog.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const changelogData = JSON.parse(fs.readFileSync(changelogPath, 'utf-8'));

function parseArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return String(process.argv[idx + 1] ?? '').trim();
  }
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1).trim() : '';
}

function cleanVer(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^refs\/tags\//i, '')
    .replace(/^v(?=\d)/i, '')
    .trim();
}

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const argVersion = cleanVer(parseArg('--version'));
const envVersion = cleanVer(process.env.RELEASE_VERSION);
const rawRef = cleanVer(process.env.GITHUB_REF_NAME);
const refVersion = SEMVER_RE.test(rawRef) ? rawRef : '';

const cleanVersion =
  (argVersion && SEMVER_RE.test(argVersion) ? argVersion : '') ||
  (envVersion && SEMVER_RE.test(envVersion) ? envVersion : '') ||
  refVersion ||
  cleanVer(pkg.version) ||
  cleanVer(changelogData.currentVersion) ||
  '1.0.0';

const tag = `v${cleanVersion}`;
const repo = (changelogData.repository || 'https://github.com/Zhoyi011/fantasy-continent').replace(
  /\/+$/,
  ''
);
const latestBase = `${repo}/releases/latest/download`;

const releases = Array.isArray(changelogData.releases) ? changelogData.releases : [];
// 严格按精确版本号匹配，避免新打 tag 时错误沿用上一版本的标题与日期
const matchedRelease = releases.find((r) => cleanVer(r.version) === cleanVersion) ?? null;

const releaseDate =
  parseArg('--date') ||
  (process.env.RELEASE_DATE ? process.env.RELEASE_DATE.trim() : '') ||
  matchedRelease?.releaseDate ||
  new Date().toISOString().slice(0, 10);

const categories = matchedRelease?.categories ?? {
  features: [`发布《幻想大陆》${tag} 全端版本（Windows EXE、Android APK、Linux AppImage/.deb 与 Web/PWA）。`],
  improvements: ['同步打包流程与全端运行稳定性，优化弱网及离线体验。'],
  fixes: ['修复已知跨平台兼容性及细节问题。'],
};

const resolvedTitle = matchedRelease?.title || `《幻想大陆》${tag} 版本更新`;
const resolvedHighlights =
  matchedRelease?.highlights || '全端客户端与浏览器 PWA 同步更新，支持离线单机游玩与版本校验。';

const flatNotes = [
  ...(categories.features || []).map((t) => `【新增功能】${t}`),
  ...(categories.improvements || []).map((t) => `【优化体验】${t}`),
  ...(categories.fixes || []).map((t) => `【问题修复】${t}`),
];

const history = matchedRelease
  ? releases
  : [
      {
        version: cleanVersion,
        tag,
        releaseDate,
        title: resolvedTitle,
        highlights: resolvedHighlights,
        categories,
      },
      ...releases,
    ];

const versionPayload = {
  appName: changelogData.appName || '幻想大陆',
  packageId: changelogData.packageId || 'com.zhoyi.fantasycontinent',
  repository: repo,
  releasesApi: 'https://api.github.com/repos/Zhoyi011/fantasy-continent/releases',
  version: cleanVersion,
  tag,
  releaseDate,
  title: resolvedTitle,
  highlights: resolvedHighlights,
  categories,
  notes: flatNotes,
  downloads: {
    windowsSetup: `${latestBase}/fantasy-continent-windows-setup.exe`,
    windowsPortable: `${latestBase}/fantasy-continent-windows-portable.exe`,
    androidApk: `${latestBase}/fantasy-continent-android.apk`,
    linuxAppImage: `${latestBase}/fantasy-continent-linux.AppImage`,
    linuxDeb: `${latestBase}/fantasy-continent-linux.deb`,
  },
  history,
};

const serialized = `${JSON.stringify(versionPayload, null, 2)}\n`;

const publicDir = path.join(rootDir, 'public');
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'version.json'), serialized, 'utf-8');

const distDir = path.join(rootDir, 'dist');
if (fs.existsSync(distDir)) {
  fs.writeFileSync(path.join(distDir, 'version.json'), serialized, 'utf-8');
}

const outPath = parseArg('--out');
if (outPath) {
  const resolvedOut = path.resolve(rootDir, outPath);
  fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
  fs.writeFileSync(resolvedOut, serialized, 'utf-8');
}

console.log(`[generate-version-json] Generated version.json for ${tag} (${releaseDate})`);
