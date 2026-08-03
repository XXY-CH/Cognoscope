/**
 * uiStore - 全局 UI 状态（主题、强调色、侧栏、设置抽屉、AI 连接配置）
 * 所属：全局布局 AppShell
 * 规范参考：UI_spec.md §2；强调色与书签色板对齐（无大红色）
 */
import { create } from 'zustand';

/** 主题偏好三态：跟随系统 / 强制浅色 / 强制深色 */
export type ThemePreference = 'system' | 'light' | 'dark';

/** 解析后实际生效的主题（写入 data-theme） */
export type ResolvedTheme = 'light' | 'dark';

/**
 * 界面强调色风格（与书签 AnnotationColor 同色板，不含警告红）
 */
export type AccentStyle = 'blue' | 'green' | 'yellow' | 'pink';

/** AI 回答语言偏好（§2.4） */
export type AiAnswerLanguage = 'zh' | 'en' | 'auto';

export interface AiSettingsDraft {
  apiKey: string;
  /** OpenAI 兼容接口根地址，如 https://api.openai.com/v1 */
  baseUrl: string;
  /** 模型名，如 gpt-4o-mini */
  model: string;
  /** 采样温度 0–2 */
  temperature: number;
  /** 单次回答最大 token */
  maxTokens: number;
  /** 回答语言 */
  answerLanguage: AiAnswerLanguage;
  /** 是否在回答中自动引用原文 */
  autoCite: boolean;
}

const THEME_STORAGE_KEY = 'xuesen-theme';
const SIDEBAR_STORAGE_KEY = 'xuesen-sidebar-collapsed';
const ACCENT_STORAGE_KEY = 'xuesen-accent-style';
const AI_API_KEY_STORAGE = 'xuesen-ai-api-key';
const AI_BASE_URL_STORAGE = 'xuesen-ai-base-url';
const AI_MODEL_STORAGE = 'xuesen-ai-model';
const AI_TEMPERATURE_STORAGE = 'xuesen-ai-temperature';
const AI_MAX_TOKENS_STORAGE = 'xuesen-ai-max-tokens';
const AI_ANSWER_LANG_STORAGE = 'xuesen-ai-answer-language';
const AI_AUTO_CITE_STORAGE = 'xuesen-ai-auto-cite';

const DEFAULT_AI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_AI_MODEL = 'gpt-4o-mini';
const DEFAULT_AI_TEMPERATURE = 0.7;
const DEFAULT_AI_MAX_TOKENS = 2048;

function readThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'system' || raw === 'light' || raw === 'dark') return raw;
  } catch {
    /* ignore */
  }
  return 'system';
}

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function readAccentStyle(): AccentStyle {
  try {
    const raw = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (
      raw === 'blue' ||
      raw === 'green' ||
      raw === 'yellow' ||
      raw === 'pink'
    ) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return 'blue';
}

function readStorage(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function readNumberStorage(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function readAnswerLanguage(): AiAnswerLanguage {
  try {
    const raw = localStorage.getItem(AI_ANSWER_LANG_STORAGE);
    if (raw === 'zh' || raw === 'en' || raw === 'auto') return raw;
  } catch {
    /* ignore */
  }
  return 'zh';
}

function readAutoCite(): boolean {
  try {
    const raw = localStorage.getItem(AI_AUTO_CITE_STORAGE);
    if (raw == null) return true;
    return raw === '1';
  } catch {
    return true;
  }
}

function clampTemperature(n: number): number {
  return Math.min(2, Math.max(0, Math.round(n * 100) / 100));
}

function clampMaxTokens(n: number): number {
  return Math.min(128000, Math.max(256, Math.round(n)));
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return preference;
}

export function nextThemePreference(
  current: ThemePreference,
): ThemePreference {
  if (current === 'system') return 'light';
  if (current === 'light') return 'dark';
  return 'system';
}

export function themePreferenceLabel(preference: ThemePreference): string {
  if (preference === 'system') return '跟随系统';
  if (preference === 'light') return '浅色';
  return '深色';
}

export function accentStyleLabel(style: AccentStyle): string {
  if (style === 'blue') return '蓝';
  if (style === 'green') return '绿';
  if (style === 'yellow') return '黄';
  return '粉';
}

function applyDataTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', resolved);
}

function applyDataAccent(style: AccentStyle): void {
  document.documentElement.setAttribute('data-accent', style);
}

interface UiState {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  accentStyle: AccentStyle;
  sidebarCollapsed: boolean;
  settingsOpen: boolean;
  isOnline: boolean;
  /** @deprecated 使用 aiSettings.apiKey；保留兼容 */
  aiApiKey: string;
  aiSettings: AiSettingsDraft;
  setThemePreference: (preference: ThemePreference) => void;
  cycleTheme: () => void;
  syncResolvedTheme: () => void;
  setAccentStyle: (style: AccentStyle) => void;
  toggleSidebarCollapsed: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  setOnline: (online: boolean) => void;
  setAiApiKey: (key: string) => void;
  setAiSettings: (partial: Partial<AiSettingsDraft>) => void;
  /** 清除本机 AI 连接配置；问答历史由 DataPanel 另行清除。 */
  clearAiSettings: () => void;
}

const initialPreference = readThemePreference();
const initialResolved = resolveTheme(initialPreference);
const initialAccent = readAccentStyle();
const initialAi: AiSettingsDraft = {
  apiKey: readStorage(AI_API_KEY_STORAGE),
  baseUrl: readStorage(AI_BASE_URL_STORAGE, DEFAULT_AI_BASE_URL),
  model: readStorage(AI_MODEL_STORAGE, DEFAULT_AI_MODEL),
  temperature: clampTemperature(
    readNumberStorage(AI_TEMPERATURE_STORAGE, DEFAULT_AI_TEMPERATURE),
  ),
  maxTokens: clampMaxTokens(
    readNumberStorage(AI_MAX_TOKENS_STORAGE, DEFAULT_AI_MAX_TOKENS),
  ),
  answerLanguage: readAnswerLanguage(),
  autoCite: readAutoCite(),
};

if (typeof document !== 'undefined') {
  applyDataTheme(initialResolved);
  applyDataAccent(initialAccent);
}

export const useUiStore = create<UiState>((set, get) => ({
  themePreference: initialPreference,
  resolvedTheme: initialResolved,
  accentStyle: initialAccent,
  sidebarCollapsed: readSidebarCollapsed(),
  settingsOpen: false,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  aiApiKey: initialAi.apiKey,
  aiSettings: initialAi,

  setThemePreference: (preference) => {
    const resolved = resolveTheme(preference);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      /* ignore */
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
    if (themePreference !== 'system') return;
    const resolved = resolveTheme('system');
    applyDataTheme(resolved);
    set({ resolvedTheme: resolved });
  },

  setAccentStyle: (style) => {
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, style);
    } catch {
      /* ignore */
    }
    applyDataAccent(style);
    set({ accentStyle: style });
  },

  toggleSidebarCollapsed: () => {
    const next = !get().sidebarCollapsed;
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ sidebarCollapsed: next });
  },

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  setOnline: (isOnline) => {
    if (get().isOnline === isOnline) return;
    set({ isOnline });
  },

  setAiApiKey: (key) => {
    get().setAiSettings({ apiKey: key });
  },

  setAiSettings: (partial) => {
    const prev = get().aiSettings;
    const next: AiSettingsDraft = {
      apiKey: partial.apiKey !== undefined ? partial.apiKey.trim() : prev.apiKey,
      baseUrl:
        partial.baseUrl !== undefined
          ? partial.baseUrl.trim() || DEFAULT_AI_BASE_URL
          : prev.baseUrl,
      model:
        partial.model !== undefined
          ? partial.model.trim() || DEFAULT_AI_MODEL
          : prev.model,
      temperature:
        partial.temperature !== undefined
          ? clampTemperature(partial.temperature)
          : prev.temperature,
      maxTokens:
        partial.maxTokens !== undefined
          ? clampMaxTokens(partial.maxTokens)
          : prev.maxTokens,
      answerLanguage:
        partial.answerLanguage !== undefined
          ? partial.answerLanguage
          : prev.answerLanguage,
      autoCite:
        partial.autoCite !== undefined ? partial.autoCite : prev.autoCite,
    };
    writeStorage(AI_API_KEY_STORAGE, next.apiKey);
    writeStorage(AI_BASE_URL_STORAGE, next.baseUrl);
    writeStorage(AI_MODEL_STORAGE, next.model);
    try {
      localStorage.setItem(AI_TEMPERATURE_STORAGE, String(next.temperature));
      localStorage.setItem(AI_MAX_TOKENS_STORAGE, String(next.maxTokens));
      localStorage.setItem(AI_ANSWER_LANG_STORAGE, next.answerLanguage);
      localStorage.setItem(AI_AUTO_CITE_STORAGE, next.autoCite ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ aiSettings: next, aiApiKey: next.apiKey });
  },

  clearAiSettings: () => {
    writeStorage(AI_API_KEY_STORAGE, '');
    writeStorage(AI_BASE_URL_STORAGE, '');
    writeStorage(AI_MODEL_STORAGE, '');
    try {
      localStorage.removeItem(AI_TEMPERATURE_STORAGE);
      localStorage.removeItem(AI_MAX_TOKENS_STORAGE);
      localStorage.removeItem(AI_ANSWER_LANG_STORAGE);
      localStorage.removeItem(AI_AUTO_CITE_STORAGE);
    } catch {
      /* ignore */
    }
    const cleared: AiSettingsDraft = {
      apiKey: '',
      baseUrl: DEFAULT_AI_BASE_URL,
      model: DEFAULT_AI_MODEL,
      temperature: DEFAULT_AI_TEMPERATURE,
      maxTokens: DEFAULT_AI_MAX_TOKENS,
      answerLanguage: 'zh',
      autoCite: true,
    };
    set({ aiSettings: cleared, aiApiKey: '' });
  },
}));
