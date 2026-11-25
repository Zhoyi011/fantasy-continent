import { useEffect, useState } from 'react';

export type TouchControlMode = 'auto' | 'always' | 'off';

const TOUCH_MODE_KEY = 'fantasy_rpg_touch_mode_v1';

function readStoredTouchMode(): TouchControlMode {
  try {
    const val = localStorage.getItem(TOUCH_MODE_KEY);
    if (val === 'auto' || val === 'always' || val === 'off') return val;
  } catch {
    // Ignore storage read errors
  }
  return 'auto';
}

function detectTouchCapable(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    window.matchMedia('(pointer: coarse)').matches
  );
}

export interface MobileControlsState {
  isTouchDevice: boolean;
  isCompactViewport: boolean;
  isPortrait: boolean;
  viewportW: number;
  viewportH: number;
  touchMode: TouchControlMode;
  setTouchMode: (mode: TouchControlMode) => void;
  showTouchControls: boolean;
}

export function useMobileControls(): MobileControlsState {
  const [touchMode, setTouchModeState] = useState<TouchControlMode>(() =>
    readStoredTouchMode()
  );

  const [metrics, setMetrics] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const h = typeof window !== 'undefined' ? window.innerHeight : 900;
    return {
      isTouchDevice: detectTouchCapable(),
      viewportW: w,
      viewportH: h,
    };
  });

  useEffect(() => {
    const update = () => {
      setMetrics({
        isTouchDevice: detectTouchCapable(),
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
      });
    };
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    const mq = window.matchMedia('(pointer: coarse)');
    mq.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
      mq.removeEventListener?.('change', update);
    };
  }, []);

  const setTouchMode = (mode: TouchControlMode) => {
    setTouchModeState(mode);
    try {
      localStorage.setItem(TOUCH_MODE_KEY, mode);
    } catch {
      // Ignore storage write errors
    }
  };

  const isCompactViewport = metrics.viewportW <= 1024 || metrics.viewportH <= 640;
  const isSmallTouchViewport = metrics.viewportW < 768 || metrics.viewportH < 520;
  const isPortrait =
    metrics.viewportH > metrics.viewportW && metrics.viewportW <= 900;

  const showTouchControls =
    touchMode === 'always'
      ? true
      : touchMode === 'off'
      ? false
      : metrics.isTouchDevice || isSmallTouchViewport;

  return {
    isTouchDevice: metrics.isTouchDevice,
    isCompactViewport,
    isPortrait,
    viewportW: metrics.viewportW,
    viewportH: metrics.viewportH,
    touchMode,
    setTouchMode,
    showTouchControls,
  };
}
