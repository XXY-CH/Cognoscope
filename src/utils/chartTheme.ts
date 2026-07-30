/**
 * chartTheme.ts - 从 CSS 变量读取图表色（跟随主题切换）
 * 所属：B · 个人仪表盘
 * 规范参考：UI_spec.md §1.1 --chart-*
 */
import { useSyncExternalStore } from 'react';

const CHART_VARS = [
  '--chart-focus',
  '--chart-fatigue',
  '--chart-distraction',
  '--chart-reading',
  '--chart-bg-grid',
  '--chart-axis',
  '--event-drink',
  '--event-talk',
  '--event-away',
  '--event-phone',
  '--event-yawn',
  '--event-gaze-off',
  '--success',
  '--warning',
  '--bg-base',
  '--bg-surface',
  '--text-primary',
] as const;

export type ChartTokenName = (typeof CHART_VARS)[number];

export type ChartTokens = Record<ChartTokenName, string>;

function readTokens(): ChartTokens {
  const styles = getComputedStyle(document.documentElement);
  const tokens = {} as ChartTokens;
  for (const name of CHART_VARS) {
    tokens[name] = styles.getPropertyValue(name).trim();
  }
  return tokens;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: ChartTokens | null = null;
let observer: MutationObserver | null = null;

function ensureObserver(): void {
  if (observer || typeof document === 'undefined') return;
  observer = new MutationObserver(() => {
    cache = null;
    listeners.forEach((l) => l());
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class', 'style'],
  });
}

function subscribe(listener: Listener): () => void {
  ensureObserver();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ChartTokens {
  if (!cache) cache = readTokens();
  return cache;
}

/**
 * 订阅主题变化，返回当前 --chart-* 等计算后的色值
 */
export function useChartTokens(): ChartTokens {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
