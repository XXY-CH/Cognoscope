/**
 * shortcutStore - 可自定义快捷键绑定（localStorage）
 * 所属：设置 · 快捷键 / 全局热键
 */
import { create } from 'zustand';
import {
  DEFAULT_SHORTCUTS,
  bindingsEqual,
  type KeyBinding,
  type ShortcutActionId,
} from '../utils/shortcuts';

const STORAGE_KEY = 'xuesen-shortcuts-v1';

function readBindings(): Record<ShortcutActionId, KeyBinding> {
  const base = { ...DEFAULT_SHORTCUTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<
      Record<ShortcutActionId, KeyBinding>
    >;
    for (const id of Object.keys(DEFAULT_SHORTCUTS) as ShortcutActionId[]) {
      const b = parsed[id];
      if (
        b &&
        typeof b.key === 'string' &&
        typeof b.ctrlOrMeta === 'boolean' &&
        typeof b.shift === 'boolean' &&
        typeof b.alt === 'boolean'
      ) {
        // 迁移：旧默认 Ctrl+Shift+L → 新默认 Ctrl+Alt+T
        if (
          id === 'cycleTheme' &&
          b.key.toLowerCase() === 'l' &&
          b.ctrlOrMeta &&
          b.shift &&
          !b.alt
        ) {
          base[id] = DEFAULT_SHORTCUTS.cycleTheme;
        } else {
          base[id] = {
            key: b.key.length === 1 ? b.key.toLowerCase() : b.key,
            ctrlOrMeta: b.ctrlOrMeta,
            shift: b.shift,
            alt: b.alt,
          };
        }
      }
    }
  } catch {
    /* ignore */
  }
  return base;
}

function persist(bindings: Record<ShortcutActionId, KeyBinding>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    /* ignore */
  }
}

interface ShortcutState {
  bindings: Record<ShortcutActionId, KeyBinding>;
  setBinding: (id: ShortcutActionId, binding: KeyBinding) => void;
  resetBinding: (id: ShortcutActionId) => void;
  resetAll: () => void;
  /** 若与其他动作冲突，返回冲突的 action id */
  findConflict: (
    id: ShortcutActionId,
    binding: KeyBinding,
  ) => ShortcutActionId | null;
}

export const useShortcutStore = create<ShortcutState>((set, get) => ({
  bindings: readBindings(),

  setBinding: (id, binding) => {
    const next = { ...get().bindings, [id]: binding };
    persist(next);
    set({ bindings: next });
  },

  resetBinding: (id) => {
    const next = { ...get().bindings, [id]: DEFAULT_SHORTCUTS[id] };
    persist(next);
    set({ bindings: next });
  },

  resetAll: () => {
    const next = { ...DEFAULT_SHORTCUTS };
    persist(next);
    set({ bindings: next });
  },

  findConflict: (id, binding) => {
    const { bindings } = get();
    for (const other of Object.keys(bindings) as ShortcutActionId[]) {
      if (other === id) continue;
      if (bindingsEqual(bindings[other], binding)) return other;
    }
    return null;
  },
}));
