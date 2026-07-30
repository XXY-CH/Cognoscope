/**
 * useSystemThemeListener - 监听系统配色变化
 * 所属：全局主题；仅在 themePreference === 'system' 时驱动 data-theme 更新
 * 规范参考：UI_spec.md §2.1 主题三态
 */
import { useEffect } from 'react';
import { useUiStore } from '../stores/uiStore';

/**
 * 订阅 prefers-color-scheme 的 change 事件，并在偏好为 system 时同步 DOM
 */
export function useSystemThemeListener(): void {
  const themePreference = useUiStore((s) => s.themePreference);
  const syncResolvedTheme = useUiStore((s) => s.syncResolvedTheme);

  useEffect(() => {
    // 非跟随系统时无需监听，避免无意义回调
    if (themePreference !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      syncResolvedTheme();
    };

    // 现代浏览器用 addEventListener；兼容旧 Safari 的 addListener
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, [themePreference, syncResolvedTheme]);
}
