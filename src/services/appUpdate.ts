import changelogBundle from '../../changelog.json';
import { getAppVersion, isNativeClientShell } from './platform';

export const GITHUB_REPO_URL = 'https://github.com/Zhoyi011/fantasy-continent';
export const GITHUB_RELEASES_API =
  'https://api.github.com/repos/Zhoyi011/fantasy-continent/releases?per_page=15';
export const REMOTE_VERSION_JSON_URL =
  'https://github.com/Zhoyi011/fantasy-continent/releases/latest/download/version.json';

export interface ChangelogCategories {
  features: string[];
  improvements: string[];
  fixes: string[];
}

export interface ReleaseHistoryItem {
  version: string;
  tag: string;
  releaseDate: string;
  title: string;
  highlights?: string;
  categories: ChangelogCategories;
  htmlUrl?: string;
  source: 'github' | 'bundled';
}

export interface ClientDownloadLinks {
  windowsSetup: string;
  windowsPortable: string;
  androidApk: string;
  linuxAppImage: string;
  linuxDeb: string;
}

export interface VersionManifest {
  appName: string;
  packageId: string;
  repository: string;
  version: string;
  tag: string;
  releaseDate: string;
  title: string;
  highlights: string;
  categories: ChangelogCategories;
  notes: string[];
  downloads: ClientDownloadLinks;
  history: ReleaseHistoryItem[];
}

export const DEFAULT_DOWNLOAD_LINKS: ClientDownloadLinks = {
  windowsSetup: `${GITHUB_REPO_URL}/releases/latest/download/fantasy-continent-windows-setup.exe`,
  windowsPortable: `${GITHUB_REPO_URL}/releases/latest/download/fantasy-continent-windows-portable.exe`,
  androidApk: `${GITHUB_REPO_URL}/releases/latest/download/fantasy-continent-android.apk`,
  linuxAppImage: `${GITHUB_REPO_URL}/releases/latest/download/fantasy-continent-linux.AppImage`,
  linuxDeb: `${GITHUB_REPO_URL}/releases/latest/download/fantasy-continent-linux.deb`,
};

export function compareSemver(a: string, b: string): number {
  const pa = String(a)
    .replace(/^v/i, '')
    .split(/[-.+]/)
    .slice(0, 3)
    .map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b)
    .replace(/^v/i, '')
    .split(/[-.+]/)
    .slice(0, 3)
    .map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export function getBundledReleaseHistory(): ReleaseHistoryItem[] {
  const raw = Array.isArray(changelogBundle.releases) ? changelogBundle.releases : [];
  return raw.map((item) => ({
    version: String(item.version).replace(/^v/i, ''),
    tag: String(item.tag || `v${item.version}`),
    releaseDate: String(item.releaseDate || ''),
    title: String(item.title || `《幻想大陆》v${item.version}`),
    highlights: item.highlights ? String(item.highlights) : undefined,
    categories: {
      features: Array.isArray(item.categories?.features) ? item.categories.features : [],
      improvements: Array.isArray(item.categories?.improvements) ? item.categories.improvements : [],
      fixes: Array.isArray(item.categories?.fixes) ? item.categories.fixes : [],
    },
    htmlUrl: `${GITHUB_REPO_URL}/releases/tag/${item.tag || `v${item.version}`}`,
    source: 'bundled',
  }));
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 4500): Promise<T | null> {
  if (typeof fetch !== 'function') return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;

  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function normalizeManifest(raw: Partial<VersionManifest>): VersionManifest | null {
  if (!raw || !raw.version) return null;
  const ver = String(raw.version).replace(/^v/i, '').trim();
  if (!ver) return null;
  const fallbackHistory = getBundledReleaseHistory();
  const cats: ChangelogCategories = {
    features: Array.isArray(raw.categories?.features) ? raw.categories.features : [],
    improvements: Array.isArray(raw.categories?.improvements) ? raw.categories.improvements : [],
    fixes: Array.isArray(raw.categories?.fixes) ? raw.categories.fixes : [],
  };
  return {
    appName: raw.appName || '幻想大陆',
    packageId: raw.packageId || 'com.zhoyi.fantasycontinent',
    repository: raw.repository || GITHUB_REPO_URL,
    version: ver,
    tag: raw.tag || `v${ver}`,
    releaseDate: raw.releaseDate || '',
    title: raw.title || `《幻想大陆》v${ver}`,
    highlights: raw.highlights || '发现新版本客户端更新。',
    categories: cats,
    notes: Array.isArray(raw.notes) ? raw.notes : [],
    downloads: {
      windowsSetup: raw.downloads?.windowsSetup || DEFAULT_DOWNLOAD_LINKS.windowsSetup,
      windowsPortable: raw.downloads?.windowsPortable || DEFAULT_DOWNLOAD_LINKS.windowsPortable,
      androidApk: raw.downloads?.androidApk || DEFAULT_DOWNLOAD_LINKS.androidApk,
      linuxAppImage: raw.downloads?.linuxAppImage || DEFAULT_DOWNLOAD_LINKS.linuxAppImage,
      linuxDeb: raw.downloads?.linuxDeb || DEFAULT_DOWNLOAD_LINKS.linuxDeb,
    },
    history:
      Array.isArray(raw.history) && raw.history.length > 0
        ? (raw.history as ReleaseHistoryItem[]).map((h) => ({ ...h, source: 'bundled' as const }))
        : fallbackHistory,
  };
}

/**
 * 仅限原生客户端外壳（Windows / Linux / Android）触发版本检查；
 * 普通浏览器网页端直接返回 null，绝不弹出客户端安装包更新弹窗。
 */
export async function checkForNativeClientUpdate(): Promise<VersionManifest | null> {
  if (!isNativeClientShell()) {
    return null;
  }

  const currentVersion = getAppVersion();
  const stamp = Date.now();
  const candidates = [`${REMOTE_VERSION_JSON_URL}?t=${stamp}`, `/version.json?t=${stamp}`];

  for (const url of candidates) {
    const raw = await fetchJsonWithTimeout<Partial<VersionManifest>>(url, 4500);
    const manifest = raw ? normalizeManifest(raw) : null;
    if (manifest && compareSemver(manifest.version, currentVersion) > 0) {
      return manifest;
    }
    if (manifest) {
      return null;
    }
  }

  return null;
}

function parseReleaseBodyToCategories(body: string): ChangelogCategories {
  const result: ChangelogCategories = {
    features: [],
    improvements: [],
    fixes: [],
  };
  let section: keyof ChangelogCategories = 'features';

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#{1,4}\s*.*(新增|功能|feature)/i.test(line)) {
      section = 'features';
      continue;
    }
    if (/^#{1,4}\s*.*(优化|体验|调整|improv)/i.test(line)) {
      section = 'improvements';
      continue;
    }
    if (/^#{1,4}\s*.*(修复|fix)/i.test(line)) {
      section = 'fixes';
      continue;
    }
    if (/^#{1,4}\s+/.test(line) || /^[-*_]{3,}$/.test(line)) {
      continue;
    }
    const bullet = line.replace(/^[-*•]\s+/, '').trim();
    if (bullet && !bullet.startsWith('http') && !bullet.includes('SHA256')) {
      result[section].push(bullet);
    }
  }

  return result;
}

interface GitHubReleaseApiItem {
  tag_name?: string;
  name?: string;
  body?: string;
  published_at?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
}

export async function fetchReleaseHistory(): Promise<{
  items: ReleaseHistoryItem[];
  fromNetwork: boolean;
}> {
  const bundled = getBundledReleaseHistory();
  const remoteList = await fetchJsonWithTimeout<GitHubReleaseApiItem[]>(GITHUB_RELEASES_API, 5000);
  if (!Array.isArray(remoteList) || remoteList.length === 0) {
    return { items: bundled, fromNetwork: false };
  }

  const bundledByVer = new Map<string, ReleaseHistoryItem>(
    bundled.map((b) => [b.version.replace(/^v/i, ''), b])
  );

  const parsed: ReleaseHistoryItem[] = [];
  for (const rel of remoteList) {
    if (rel.draft) continue;
    const tag = String(rel.tag_name || '').trim();
    const version = tag.replace(/^v/i, '');
    if (!version) continue;

    const bundledMatch = bundledByVer.get(version);
    const bodyCats = rel.body ? parseReleaseBodyToCategories(rel.body) : null;
    const hasBodyCats = Boolean(
      bodyCats &&
        (bodyCats.features.length > 0 ||
          bodyCats.improvements.length > 0 ||
          bodyCats.fixes.length > 0)
    );

    parsed.push({
      version,
      tag: tag || `v${version}`,
      releaseDate: rel.published_at ? String(rel.published_at).slice(0, 10) : bundledMatch?.releaseDate || '',
      title: String(rel.name || bundledMatch?.title || `《幻想大陆》${tag}`).trim(),
      highlights: bundledMatch?.highlights,
      categories: hasBodyCats ? bodyCats! : bundledMatch?.categories || { features: ['查看 GitHub Release 详情了解完整更新日志。'], improvements: [], fixes: [] },
      htmlUrl: rel.html_url || `${GITHUB_REPO_URL}/releases/tag/${tag}`,
      source: 'github',
    });
  }

  // Merge any bundled entries missing on GitHub
  const seen = new Set(parsed.map((p) => p.version));
  for (const b of bundled) {
    if (!seen.has(b.version)) {
      parsed.push(b);
    }
  }

  parsed.sort((a, b) => compareSemver(b.version, a.version));
  return { items: parsed, fromNetwork: true };
}
