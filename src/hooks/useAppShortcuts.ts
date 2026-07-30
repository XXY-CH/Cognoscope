/**
 * useAppShortcuts - 注册全局/阅读快捷键
 * 所属：AppShell / ReaderPage
 * 绑定来自 shortcutStore；输入框内不触发（带修饰键的除外）
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useShortcutStore } from '../stores/shortcutStore';
import { useUiStore } from '../stores/uiStore';
import { useReaderStore } from '../stores/readerStore';
import {
  isEditableTarget,
  matchBinding,
  type ShortcutActionId,
} from '../utils/shortcuts';

const READER_ONLY: ReadonlySet<ShortcutActionId> = new Set([
  'readerFind',
  'readerZoomIn',
  'readerZoomOut',
  'readerFitWidth',
]);

/**
 * 在 AppShell 与 Reader 挂载；根据当前是否在阅读路由分发动作
 */
export function useAppShortcuts(): void {
  const location = useLocation();
  const bindings = useShortcutStore((s) => s.bindings);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const editable = isEditableTarget(e.target);
      const inReader = location.pathname.startsWith('/read/');

      const tryAction = (id: ShortcutActionId): boolean => {
        const b = bindings[id];
        if (!b || !matchBinding(e, b)) return false;
        // 阅读专属快捷键在其他页不拦截（避免抢走浏览器 Ctrl+F 等）
        if (READER_ONLY.has(id) && !inReader) return false;
        // 阅读页无全局侧栏，不吞掉 Ctrl+B
        if (id === 'toggleSidebar' && inReader) return false;
        // 无修饰键的绑定在输入框内忽略
        if (editable && !b.ctrlOrMeta && !b.alt) return false;

        e.preventDefault();
        e.stopPropagation();

        if (id === 'openSettings') {
          useUiStore.getState().openSettings();
          return true;
        }
        if (id === 'toggleSidebar') {
          useUiStore.getState().toggleSidebarCollapsed();
          return true;
        }
        if (id === 'cycleTheme') {
          useUiStore.getState().cycleTheme();
          return true;
        }

        const reader = useReaderStore.getState();
        if (id === 'readerFind') {
          useReaderStore.setState({
            findFocusNonce: reader.findFocusNonce + 1,
          });
          return true;
        }
        if (id === 'readerZoomIn') {
          reader.bumpZoom(10);
          return true;
        }
        if (id === 'readerZoomOut') {
          reader.bumpZoom(-10);
          return true;
        }
        if (id === 'readerFitWidth') {
          reader.requestFitWidth();
          return true;
        }
        return true;
      };

      const order: ShortcutActionId[] = [
        'openSettings',
        'toggleSidebar',
        'cycleTheme',
        'readerFind',
        'readerZoomIn',
        'readerZoomOut',
        'readerFitWidth',
      ];
      for (const id of order) {
        if (tryAction(id)) break;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [bindings, location.pathname]);
}
