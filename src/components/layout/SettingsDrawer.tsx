/**
 * SettingsDrawer - 设置抽屉（右侧滑入）
 * 所属页面：A–D 共用 AppShell
 * 规范参考：UI_spec.md §2.4
 */
import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import './SettingsDrawer.css';

/** 左侧竖向分组 Tab（§2.4）；表单项后续步骤再填全 */
const SETTINGS_TABS = [
  { id: 'appearance', label: '外观' },
  { id: 'reading', label: '阅读' },
  { id: 'privacy', label: '检测与隐私' },
  { id: 'ai', label: 'AI' },
  { id: 'shortcuts', label: '快捷键' },
  { id: 'account', label: '账户' },
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

/**
 * SettingsDrawer - 无外部 props；开关状态来自 uiStore
 */
export function SettingsDrawer() {
  const open = useUiStore((s) => s.settingsOpen);
  const closeSettings = useUiStore((s) => s.closeSettings);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<SettingsTabId>('appearance');

  // 关闭时用 inert 移出可访问性树，避免 Tab 仍能聚焦到抽屉内控件
  useEffect(() => {
    const root = panelRef.current?.parentElement;
    if (!root) return;
    if (open) {
      root.removeAttribute('inert');
    } else {
      root.setAttribute('inert', '');
    }
  }, [open]);

  // 打开时把焦点移入抽屉，便于键盘用户；Esc 关闭
  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // 优先聚焦关闭按钮，符合对话框惯例
    panel
      ?.querySelector<HTMLElement>('.settings-drawer__close')
      ?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSettings();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, closeSettings]);

  // 关闭时不卸载 DOM，用 inert + 隐藏，保留进入/退出过渡
  return (
    <div
      className={`settings-drawer${open ? ' settings-drawer--open' : ''}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className="settings-drawer__backdrop"
        aria-label="关闭设置"
        tabIndex={open ? 0 : -1}
        onClick={closeSettings}
      />

      <div
        ref={panelRef}
        className="settings-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="settings-drawer__header">
          <h2 id={titleId} className="settings-drawer__title">
            设置
          </h2>
          <button
            type="button"
            className="settings-drawer__close"
            aria-label="关闭设置"
            onClick={closeSettings}
          >
            <X size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </header>

        <div className="settings-drawer__body">
          <nav className="settings-drawer__tabs" aria-label="设置分组">
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`settings-drawer__tab${activeTab === tab.id ? ' settings-drawer__tab--active' : ''}`}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="settings-drawer__content" role="tabpanel">
            {activeTab === 'privacy' ? (
              <p className="settings-drawer__privacy-note">
                画面与推理特征完全在本地处理，不出设备
              </p>
            ) : (
              <p className="settings-drawer__placeholder">
                「{SETTINGS_TABS.find((t) => t.id === activeTab)?.label}」设置项将在后续步骤补充。
              </p>
            )}
          </div>
        </div>

        <footer className="settings-drawer__footer">
          <button
            type="button"
            className="settings-drawer__btn settings-drawer__btn--ghost"
            onClick={closeSettings}
          >
            取消
          </button>
          <button
            type="button"
            className="settings-drawer__btn settings-drawer__btn--primary"
            onClick={closeSettings}
          >
            保存
          </button>
        </footer>
      </div>
    </div>
  );
}
