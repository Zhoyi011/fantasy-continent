import { Download, Gamepad2, History, Music, RefreshCw, Volume2, VolumeX, X } from 'lucide-react';
import type { GameSettings } from '../game/types';
import type { TouchControlMode } from '../hooks/useMobileControls';
import {
  detectRuntimePlatform,
  getAppVersion,
  getPlatformLabel,
  isNativeClientShell,
} from '../services/platform';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsModalProps {
  settings: GameSettings;
  touchMode: TouchControlMode;
  onTouchModeChange: (mode: TouchControlMode) => void;
  onChange: (next: GameSettings) => void;
  onOpenDownload?: () => void;
  onOpenChangelog?: () => void;
  onCheckUpdate?: () => void;
  checkingUpdate?: boolean;
  updateCheckFeedback?: string | null;
  onClose: () => void;
}

export function SettingsModal({
  settings,
  touchMode,
  onTouchModeChange,
  onChange,
  onOpenDownload,
  onOpenChangelog,
  onCheckUpdate,
  checkingUpdate = false,
  updateCheckFeedback = null,
  onClose,
}: SettingsModalProps) {
  const platform = detectRuntimePlatform();
  const isNative = isNativeClientShell();
  const currentVersion = getAppVersion();

  return (
    <div
      className="modal-backdrop bg-slate-950/75"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="modal-shell modal-panel-animate max-w-lg max-h-[92dvh] rounded-xl border-2 border-slate-500/45 bg-[#0c1422]/96 shadow-[0_24px_80px_rgba(0,0,0,0.92)]">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-800 shrink-0">
          <h2 id="settings-modal-title" className="text-lg font-bold text-slate-100">
            游戏设置与冒险指南
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置"
            className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto game-scroll px-4 pb-5 sm:px-6">
        {/* Audio & Touch Controls */}
        <div className="mt-4 space-y-3.5">
          <div className="flex items-center justify-between rounded-lg bg-slate-900/75 border border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-200">
              {settings.muted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-sky-300" />
              )}
              <span>全局静音</span>
            </div>
            <button
              type="button"
              onClick={() => onChange({ ...settings, muted: !settings.muted })}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-md text-xs font-bold cursor-pointer ${
                settings.muted
                  ? 'bg-rose-600 text-white'
                  : 'bg-emerald-500 text-slate-950'
              }`}
            >
              {settings.muted ? '已静音' : '开启中'}
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-900/75 border border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-200">
              <Music className="w-4 h-4 text-amber-300" />
              <span>幻想背景音乐 (BGM)</span>
            </div>
            <button
              type="button"
              onClick={() => onChange({ ...settings, bgmEnabled: !settings.bgmEnabled })}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-md text-xs font-bold cursor-pointer ${
                settings.bgmEnabled
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-700 text-slate-300'
              }`}
            >
              {settings.bgmEnabled ? '开启中' : '已关闭'}
            </button>
          </div>

          <div className="rounded-lg bg-slate-900/75 border border-slate-800 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Gamepad2 className="w-4 h-4 text-sky-300" />
                <span>虚拟摇杆与触控按键</span>
              </div>
              <span className="text-[10px] text-emerald-300 font-semibold">
                竖屏 / 横屏自适应
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 bg-slate-950/70 p-1 rounded-lg border border-slate-800">
              {(
                [
                  { id: 'auto', label: '自动检测' },
                  { id: 'always', label: '始终开启' },
                  { id: 'off', label: '仅键鼠' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onTouchModeChange(opt.id)}
                  className={`min-h-[38px] py-1.5 px-2 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                    touchMode === opt.id
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-slate-900/75 border border-slate-800 px-4 py-3 space-y-3">
            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1 tabular-nums">
                <span>战斗音效音量</span>
                <span>{Math.round(settings.sfxVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.sfxVolume * 100)}
                onChange={(e) =>
                  onChange({ ...settings, sfxVolume: Number(e.target.value) / 100 })
                }
                aria-label="战斗音效音量"
                className="w-full accent-sky-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1 tabular-nums">
                <span>背景音乐音量</span>
                <span>{Math.round(settings.bgmVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.bgmVolume * 100)}
                onChange={(e) =>
                  onChange({ ...settings, bgmVolume: Number(e.target.value) / 100 })
                }
                aria-label="背景音乐音量"
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Control Guide */}
        <div className="mt-5 pt-4 border-t border-slate-800">
          <h3 className="text-xs font-bold text-amber-300 mb-2">操作指南（PC 快捷键 & 移动端触控）</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 text-xs text-slate-300">
            <div><strong className="text-slate-100">WASD / 方向键 / 左摇杆：</strong>360° 移动</div>
            <div><strong className="text-slate-100">J / 鼠标左键 / 普攻钮：</strong>自动索敌普攻</div>
            <div><strong className="text-slate-100">Q / 1：</strong>职业技能 1</div>
            <div><strong className="text-slate-100">E / 2：</strong>职业技能 2</div>
            <div><strong className="text-slate-100">C / 3：</strong>职业技能 3</div>
            <div><strong className="text-slate-100">V / 4：</strong>职业技能 4</div>
            <div><strong className="text-slate-100">Space / Shift：</strong>冲刺闪避无敌帧</div>
            <div><strong className="text-slate-100">R / 药水钮：</strong>使用治疗药水</div>
            <div><strong className="text-slate-100">F / 互动提示：</strong>NPC / 传送门 / 觉醒</div>
            <div><strong className="text-slate-100">B / T：</strong>背包与技能书 / 试炼之塔</div>
            <div><strong className="text-slate-100">P / N(Tab)：</strong>联机房间组队 / 全境地图</div>
            <div><strong className="text-slate-100">M / ESC：</strong>开关静音 / 暂停菜单</div>
          </div>
        </div>

        {/* Client, Version & Offline PWA */}
        <div className="mt-5 pt-4 border-t border-slate-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-sky-300">客户端与版本信息</h3>
            <span className="text-[11px] text-slate-400 tabular-nums">
              {getPlatformLabel(platform)} · v{currentVersion}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenChangelog && (
              <button
                type="button"
                onClick={onOpenChangelog}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-amber-400/40 bg-amber-950/25 hover:bg-amber-950/45 text-xs font-bold text-amber-300 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <History className="w-3.5 h-3.5 shrink-0" />
                版本更新历史
              </button>
            )}

            {onOpenDownload && (
              <button
                type="button"
                onClick={onOpenDownload}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-sky-400/40 bg-sky-950/25 hover:bg-sky-950/45 text-xs font-bold text-sky-300 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                全端客户端下载
              </button>
            )}

            {isNative && onCheckUpdate && (
              <button
                type="button"
                onClick={onCheckUpdate}
                disabled={checkingUpdate}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-emerald-400/45 bg-emerald-950/25 hover:bg-emerald-950/45 disabled:opacity-50 text-xs font-bold text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${checkingUpdate ? 'animate-spin' : ''}`} />
                {checkingUpdate ? '正在检查...' : '检查客户端更新'}
              </button>
            )}

            <PWAInstallButton compact />
          </div>

          {updateCheckFeedback && (
            <p className="text-xs text-emerald-300">{updateCheckFeedback}</p>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
