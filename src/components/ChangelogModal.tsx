import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, History, RefreshCw, Sparkles, Wrench, X, Zap } from 'lucide-react';
import {
  fetchReleaseHistory,
  getBundledReleaseHistory,
  GITHUB_REPO_URL,
  type ReleaseHistoryItem,
} from '../services/appUpdate';
import { getAppVersion, openExternalDownloadUrl } from '../services/platform';

interface ChangelogModalProps {
  onClose: () => void;
}

export function ChangelogModal({ onClose }: ChangelogModalProps) {
  const currentVersion = getAppVersion();
  const [items, setItems] = useState<ReleaseHistoryItem[]>(() => getBundledReleaseHistory());
  const [loading, setLoading] = useState(true);
  const [fromNetwork, setFromNetwork] = useState(false);

  const loadHistory = async (activeCheck?: () => boolean) => {
    setLoading(true);
    const res = await fetchReleaseHistory();
    if (activeCheck && !activeCheck()) return;
    setItems(res.items);
    setFromNetwork(res.fromNetwork);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void loadHistory(() => active);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="modal-backdrop bg-slate-950/80 z-[65]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-modal-title"
    >
      <div className="modal-shell modal-panel-animate max-w-2xl max-h-[92dvh] rounded-xl border-2 border-amber-400/40 bg-[#0c1422]/98 shadow-[0_24px_80px_rgba(0,0,0,0.92)]">
        {/* 固定头部 */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-800 shrink-0">
          <div className="min-w-0">
            <h2
              id="changelog-modal-title"
              className="text-base sm:text-lg font-black text-amber-300 flex items-center gap-2 truncate"
            >
              <History className="w-5 h-5 shrink-0" />
              版本更新历史
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
              当前版本：v{currentVersion} ·{' '}
              {loading
                ? '正在同步最新 Release 记录...'
                : fromNetwork
                ? '已同步 GitHub Releases 最新日志'
                : '离线兜底本地更新日志'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void loadHistory()}
              disabled={loading}
              aria-label="刷新更新历史"
              className="w-10 h-10 rounded-lg bg-slate-800/90 hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center text-sky-300 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭版本更新历史"
              className="w-10 h-10 rounded-lg bg-slate-800/90 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 内部唯一可滚动区域 */}
        <div className="flex-1 min-h-0 overflow-y-auto game-scroll px-4 py-3.5 sm:px-6 space-y-3.5">
          {items.map((rel, idx) => (
            <section
              key={rel.tag + idx}
              className={`rounded-xl border p-3.5 sm:p-4 space-y-2.5 ${
                idx === 0
                  ? 'border-amber-400/45 bg-amber-950/15'
                  : 'border-slate-700/75 bg-slate-900/60'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-black tabular-nums ${
                      idx === 0
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-800 text-sky-300 border border-slate-600'
                    }`}
                  >
                    {rel.tag}
                  </span>
                  <h3 className="text-sm sm:text-base font-bold text-slate-100 truncate">
                    {rel.title}
                  </h3>
                </div>
                {rel.releaseDate && (
                  <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                    {rel.releaseDate}
                  </span>
                )}
              </div>

              {rel.highlights && (
                <p className="text-xs text-slate-300 leading-relaxed">{rel.highlights}</p>
              )}

              {rel.categories.features.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    新增功能
                  </div>
                  <ul className="space-y-1 pl-4 text-xs text-slate-200 list-disc leading-relaxed">
                    {rel.categories.features.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {rel.categories.improvements.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 shrink-0" />
                    优化体验
                  </div>
                  <ul className="space-y-1 pl-4 text-xs text-slate-200 list-disc leading-relaxed">
                    {rel.categories.improvements.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {rel.categories.fixes.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 shrink-0" />
                    问题修复
                  </div>
                  <ul className="space-y-1 pl-4 text-xs text-slate-200 list-disc leading-relaxed">
                    {rel.categories.fixes.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
        </div>

        {/* 固定底部操作栏 */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 sm:px-6 border-t border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => void openExternalDownloadUrl(`${GITHUB_REPO_URL}/releases`)}
            className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-600 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-sky-300 inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            前往 GitHub Releases 查看全部
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-sm font-black cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
