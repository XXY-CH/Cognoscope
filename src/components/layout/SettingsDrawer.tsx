/**
 * SettingsDrawer - 设置抽屉（产品决定：左侧滑入；无账户；数据管理替代检测与隐私）
 * 所属页面：A–D 共用 AppShell
 * 规范参考：UI_spec.md §2.4（方向以产品为准：左侧）
 */
import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from '../common';
import {
  useUiStore,
  type AiSettingsDraft,
} from '../../stores/uiStore';
import { AppearancePanel } from './settings/AppearancePanel';
import { AiPanel } from './settings/AiPanel';
import { DataPanel } from './settings/DataPanel';
import { ReadingPanel } from './settings/ReadingPanel';
import { ShortcutsPanel } from './settings/ShortcutsPanel';
import './SettingsDrawer.css';

const SETTINGS_TABS = [
  { id: 'appearance', label: '外观' },
  { id: 'reading', label: '阅读' },
  { id: 'data', label: '数据管理' },
  { id: 'ai', label: 'AI' },
  { id: 'shortcuts', label: '快捷键' },
] as const;

type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

/**
 * SettingsDrawer - 无外部 props；开关状态来自 uiStore
 */
export function SettingsDrawer() {
  const open = useUiStore((s) => s.settingsOpen);
  const closeSettings = useUiStore((s) => s.closeSettings);
  const aiSettings = useUiStore((s) => s.aiSettings);
  const setAiSettings = useUiStore((s) => s.setAiSettings);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<SettingsTabId>('appearance');
  const [aiDraft, setAiDraft] = useState<AiSettingsDraft>(aiSettings);

  useEffect(() => {
    if (open) setAiDraft({ ...useUiStore.getState().aiSettings });
  }, [open]);

  useEffect(() => {
    const root = panelRef.current?.parentElement;
    if (!root) return;
    if (open) {
      root.removeAttribute('inert');
    } else {
      root.setAttribute('inert', '');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
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

  const handleSave = () => {
    // 本地配置是阅读和离线 AI 链路的事实源；后端同步放到后台，不阻塞保存。
    // 每次保存都尝试同步完整配置，覆盖后端重启或本机已有配置尚未同步的情况。
    const shouldSyncBackend = Boolean(aiDraft.apiKey && aiDraft.baseUrl);

    setAiSettings(aiDraft);
    closeSettings();
    toast.show('已保存');

    if (shouldSyncBackend) {
      void (async () => {
        try {
          const { updateAiConfig } = await import('../../services/aiConfigApi');
          await updateAiConfig({
            base_url: aiDraft.baseUrl,
            api_key: aiDraft.apiKey,
            model: aiDraft.model,
          });
        } catch {
          toast.warning('已保存到本机；后端暂不可用，启动后端后可再次同步。');
        }
      })();
    }
  };

  const patchAiDraft = (patch: Partial<AiSettingsDraft>) => {
    setAiDraft((prev) => ({ ...prev, ...patch }));
  };

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
            {activeTab === 'appearance' ? <AppearancePanel /> : null}
            {activeTab === 'reading' ? <ReadingPanel /> : null}
            {activeTab === 'data' ? <DataPanel /> : null}
            {activeTab === 'ai' ? (
              <AiPanel draft={aiDraft} onChange={patchAiDraft} />
            ) : null}
            {activeTab === 'shortcuts' ? <ShortcutsPanel /> : null}
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
            onClick={handleSave}
          >
            保存
          </button>
        </footer>
      </div>
    </div>
  );
}
