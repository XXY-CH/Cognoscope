/**
 * uiStore - 全局 UI 状态（主题偏好、侧栏折叠、设置抽屉）
 * 所属：全局布局 AppShell
 * 规范参考：UI_spec.md §2
 */
import { create } from 'zustand';

/** 主题偏好三态：跟随系统 / 强制浅色 / 强制深色 */
export type ThemePreference = 'system' | 'light' | 'dark';

/** 解析后实际生效的主题（写入 data-theme） */
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'xuesen-theme';
const SIDEBAR_STORAGE_KEY = 'xuesen-sidebar-collapsed';

/**
 * 从 localStorage 读取主题偏好；非法值回退为 system
 */
function readThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'system' || raw === 'light' || raw === 'dark') return raw;
  } catch {
    // 隐私模式等场景下 localStorage 可能不可用，静默回退
  }
  return 'system';
}

/**
 * 从 localStorage 读取侧栏折叠态
 */
function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * 将偏好解析为实际 light/dark
 * system 态依赖 prefers-color-scheme
 */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') {
    // 无 window 时（SSR/测试）默认浅色，避免抛错
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return preference;
}

/** 三态循环：跟随系统 → 浅色 → 深色 → 跟随系统 */
export function nextThemePreference(
  current: ThemePreference,
): ThemePreference {
  if (current === 'system') return 'light';
  if (current === 'light') return 'dark';
  return 'system';
}

/** 主题偏好对应的中文 tooltip 文案 */
export function themePreferenceLabel(preference: ThemePreference): string {
  if (preference === 'system') return '跟随系统';
  if (preference === 'light') return '浅色';
  return '深色';
}

interface UiState {
  /** 用户主题偏好（持久化） */
  themePreference: ThemePreference;
  /** 解析后的生效主题 */
  resolvedTheme: ResolvedTheme;
  /** Sidebar 是否折叠（持久化） */
  sidebarCollapsed: boolean;
  /** 设置抽屉是否打开 */
  settingsOpen: boolean;
  /**
   * 网络是否在线（§14）
   * 由 useNetworkStatus 根据 navigator.onLine + online/offline 事件维护
   */
  isOnline: boolean;
  /** 设置主题偏好并同步 DOM / 存储 */
  setThemePreference: (preference: ThemePreference) => void;
  /** 切换到下一主题态 */
  cycleTheme: () => void;
  /** 根据当前系统偏好重新解析（仅 system 态有意义） */
  syncResolvedTheme: () => void;
  /** 切换侧栏折叠并持久化 */
  toggleSidebarCollapsed: () => void;
  /** 打开设置抽屉 */
  openSettings: () => void;
  /** 关闭设置抽屉 */
  closeSettings: () => void;
  /** 更新网络状态；恢复在线时不弹 toast（§14.1） */
  setOnline: (online: boolean) => void;
}

/**
 * 将解析后的主题写入 <html data-theme>，供 tokens.css 切换
 */
function applyDataTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', resolved);
}

const initialPreference = readThemePreference();
const initialResolved = resolveTheme(initialPreference);

// 首屏即写入，避免闪白/闪黑（在 React 挂载前若有内联脚本更佳，此处为 store 初始化兜底）
if (typeof document !== 'undefined') {
  applyDataTheme(initialResolved);
}

export const useUiStore = create<UiState>((set, get) => ({
  themePreference: initialPreference,
  resolvedTheme: initialResolved,
  sidebarCollapsed: readSidebarCollapsed(),
  settingsOpen: false,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

  setThemePreference: (preference) => {
    const resolved = resolveTheme(preference);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // 忽略持久化失败，内存态仍生效
    }
    applyDataTheme(resolved);
    set({ themePreference: preference, resolvedTheme: resolved });
  },

  cycleTheme: () => {
    const next = nextThemePreference(get().themePreference);
    get().setThemePreference(next);
  },

  syncResolvedTheme: () => {
    const { themePreference } = get();
    // 仅 system 需要跟随系统变化；light/dark 已锁定
    if (themePreference !== 'system') return;
    const resolved = resolveTheme('system');
    applyDataTheme(resolved);
    set({ resolvedTheme: resolved });
  },

  toggleSidebarCollapsed: () => {
    const next = !get().sidebarCollapsed;
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // 忽略
    }
    set({ sidebarCollapsed: next });
  },

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  setOnline: (isOnline) => {
    // 恢复在线时静默更新，不弹 toast（§14.1）
    if (get().isOnline === isOnline) return;
    set({ isOnline });
  },
}));
