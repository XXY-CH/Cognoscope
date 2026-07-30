/**
 * shortcuts.ts - 快捷键绑定类型、默认值与匹配
 * 所属：全局 / 设置 · 快捷键
 * 规范参考：UI_spec.md §10；主题默认改为 Ctrl/Cmd+Alt+T 避免与浏览器冲突
 */

export type ShortcutActionId =
  | 'openSettings'
  | 'toggleSidebar'
  | 'cycleTheme'
  | 'readerFind'
  | 'readerZoomIn'
  | 'readerZoomOut'
  | 'readerFitWidth';

export interface KeyBinding {
  /** KeyboardEvent.key（字母存小写） */
  key: string;
  ctrlOrMeta: boolean;
  shift: boolean;
  alt: boolean;
}

export const SHORTCUT_LABELS: Record<ShortcutActionId, string> = {
  openSettings: '打开设置',
  toggleSidebar: '折叠/展开侧栏',
  cycleTheme: '循环切换主题',
  readerFind: '文档内搜索',
  readerZoomIn: '放大',
  readerZoomOut: '缩小',
  readerFitWidth: '适应页宽',
};

export const SHORTCUT_GROUPS: {
  title: string;
  ids: ShortcutActionId[];
}[] = [
  {
    title: '全局',
    ids: ['openSettings', 'toggleSidebar', 'cycleTheme'],
  },
  {
    title: '阅读界面',
    ids: ['readerFind', 'readerZoomIn', 'readerZoomOut', 'readerFitWidth'],
  },
];

/** 默认绑定；主题不用 Ctrl+Shift+L（易与浏览器快捷键冲突） */
export const DEFAULT_SHORTCUTS: Record<ShortcutActionId, KeyBinding> = {
  openSettings: { key: ',', ctrlOrMeta: true, shift: false, alt: false },
  toggleSidebar: { key: 'b', ctrlOrMeta: true, shift: false, alt: false },
  cycleTheme: { key: 't', ctrlOrMeta: true, shift: false, alt: true },
  readerFind: { key: 'f', ctrlOrMeta: true, shift: false, alt: false },
  readerZoomIn: { key: '=', ctrlOrMeta: true, shift: false, alt: false },
  readerZoomOut: { key: '-', ctrlOrMeta: true, shift: false, alt: false },
  readerFitWidth: { key: '0', ctrlOrMeta: true, shift: false, alt: false },
};

export function normalizeKey(key: string): string {
  if (key === ' ') return 'space';
  if (key.length === 1) return key.toLowerCase();
  return key;
}

export function formatBinding(b: KeyBinding): string {
  const parts: string[] = [];
  if (b.ctrlOrMeta) parts.push('Ctrl/Cmd');
  if (b.alt) parts.push('Alt');
  if (b.shift) parts.push('Shift');
  const k =
    b.key === ' ' || b.key === 'space'
      ? 'Space'
      : b.key.length === 1
        ? b.key.toUpperCase()
        : b.key;
  parts.push(k);
  return parts.join(' + ');
}

export function bindingFromEvent(e: KeyboardEvent): KeyBinding | null {
  // 单独修饰键不构成绑定
  if (
    e.key === 'Control' ||
    e.key === 'Meta' ||
    e.key === 'Shift' ||
    e.key === 'Alt'
  ) {
    return null;
  }
  return {
    key: normalizeKey(e.key),
    ctrlOrMeta: e.ctrlKey || e.metaKey,
    shift: e.shiftKey,
    alt: e.altKey,
  };
}

export function matchBinding(e: KeyboardEvent, b: KeyBinding): boolean {
  const key = normalizeKey(e.key);
  // = 与 + 在部分键盘上同键；ZoomIn 同时认两者
  const keyOk =
    key === b.key ||
    (b.key === '=' && (key === '=' || key === '+')) ||
    (b.key === '+' && (key === '+' || key === '='));
  if (!keyOk) return false;
  if (b.ctrlOrMeta !== (e.ctrlKey || e.metaKey)) return false;
  if (b.shift !== e.shiftKey) return false;
  if (b.alt !== e.altKey) return false;
  return true;
}

export function bindingsEqual(a: KeyBinding, b: KeyBinding): boolean {
  return (
    a.key === b.key &&
    a.ctrlOrMeta === b.ctrlOrMeta &&
    a.shift === b.shift &&
    a.alt === b.alt
  );
}

/** 是否在可编辑焦点内（此时忽略应用快捷键） */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}
