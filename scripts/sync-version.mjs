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

function normalizeCandidate(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^refs\/tags\//i, '')
    .replace(/^v(?=\d)/i, '')
    .trim();
}

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const cliVersion = normalizeCandidate(parseArg('--version'));
const inputEnvVersion = normalizeCandidate(process.env.INPUT_VERSION);
const releaseEnvVersion = normalizeCandidate(process.env.RELEASE_VERSION);

// 仅当分支/标签名符合语义化版本格式时才采用，防止 workflow_dispatch 在 main/develop 等分支上误用分支名
const rawGitRef = normalizeCandidate(process.env.GITHUB_REF_NAME);
const refTagVersion = SEMVER_RE.test(rawGitRef) ? rawGitRef : '';

// 若用户手动传入非空版本号但不合法，立即给出明确错误提示
const explicitRaw = cliVersion || inputEnvVersion || releaseEnvVersion;
if (explicitRaw && !SEMVER_RE.test(explicitRaw)) {
  console.error(
    `[sync-version] 版本号格式无效: "${explicitRaw}"。请传入语义化版本号（如 1.0.1 或 v1.0.1）。`
  );
  process.exit(1);
}

const cleanVersion = explicitRaw || refTagVersion || normalizeCandidate(pkg.version) || '1.0.0';
if (!SEMVER_RE.test(cleanVersion)) {
  console.error(`[sync-version] 无法解析有效的语义化版本号: "${cleanVersion}"`);
  process.exit(1);
}

const coreMatch = cleanVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
const major = Number(coreMatch?.[1] ?? 1);
const minor = Number(coreMatch?.[2] ?? 0);
const patch = Number(coreMatch?.[3] ?? 0);
const androidVersionCode = Math.max(1, Math.min(2100000000, major * 10000 + minor * 100 + patch));
const tag = `v${cleanVersion}`;
const releaseDate =
  normalizeCandidate(process.env.RELEASE_DATE) || new Date().toISOString().slice(0, 10);

// 1. 同步 package.json
pkg.version = cleanVersion;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');

// 2. 同步并校验 src-tauri/tauri.conf.json（确保包标识与 Linux .deb 小写 ASCII 包名不被破坏）
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
if (fs.existsSync(tauriConfPath)) {
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
  tauriConf.version = cleanVersion;

  if (tauriConf.identifier !== 'com.zhoyi.fantasycontinent') {
    console.error(
      `[sync-version] Tauri identifier 异常: "${tauriConf.identifier}"，应为 "com.zhoyi.fantasycontinent"`
    );
    process.exit(1);
  }
  if (!/^[a-z0-9][a-z0-9+.-]+$/.test(String(tauriConf.productName || ''))) {
    console.error(
      `[sync-version] src-tauri/tauri.conf.json 的 productName "${tauriConf.productName}" 必须为纯小写 ASCII（如 fantasy-continent），否则 Linux dpkg-deb 会校验失败。`
    );
    process.exit(1);
  }

  fs.writeFileSync(tauriConfPath, `${JSON.stringify(tauriConf, null, 2)}\n`, 'utf-8');
}

// 3. 同步 src-tauri/Cargo.toml（仅替换 [package] 段中的 version）
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
if (fs.existsSync(cargoTomlPath)) {
  const cargoRaw = fs.readFileSync(cargoTomlPath, 'utf-8');
  const nextCargo = cargoRaw.replace(
    /(^\[package\][\s\S]*?^version\s*=\s*)"[^"]*"/m,
    `$1"${cleanVersion}"`
  );
  fs.writeFileSync(cargoTomlPath, nextCargo, 'utf-8');
}

// 4. 输出到 GitHub Actions Outputs / Env
if (process.env.GITHUB_OUTPUT) {
  const outputLines = [
    `version=${cleanVersion}`,
    `tag=${tag}`,
    `android_version_code=${androidVersionCode}`,
    `release_date=${releaseDate}`,
  ];
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${outputLines.join('\n')}\n`, 'utf-8');
}

if (process.env.GITHUB_ENV) {
  const envLines = [
    `RELEASE_VERSION=${cleanVersion}`,
    `RELEASE_DATE=${releaseDate}`,
    `ANDROID_VERSION_CODE=${androidVersionCode}`,
  ];
  fs.appendFileSync(process.env.GITHUB_ENV, `${envLines.join('\n')}\n`, 'utf-8');
}

console.log(
  `[sync-version] Synced version=${cleanVersion}, tag=${tag}, androidVersionCode=${androidVersionCode}, releaseDate=${releaseDate}`
);
