/**
 * Sidebar - 全局导航侧栏
 * 所属页面：A–D 共用 AppShell
 * 规范参考：UI_spec.md §2.1
 */
import {
  BarChart3,
  ChevronLeft,
  CloudOff,
  Folder,
  GitCompareArrows,
  Moon,
  Monitor,
  Settings,
  Share2,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Tooltip } from '../common';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import {
  themePreferenceLabel,
  useUiStore,
} from '../../stores/uiStore';
import './Sidebar.css';

/** 产品层级导航：资料库 → 研究 → 进展；回收站仍属于资料库。 */
const NAV_GROUPS = [
  {
    id: 'library',
    label: '资料库',
    items: [
      { to: '/', label: '文件目录', icon: Folder, end: true },
      { to: '/trash', label: '回收站', icon: Trash2, end: false },
    ],
  },
  {
    id: 'research',
    label: '研究',
    items: [
      { to: '/knowledge-graph', label: '知识图谱', icon: Share2, end: false },
      {
        to: '/evidence-matrix',
        label: '证据矩阵',
        icon: GitCompareArrows,
        end: false,
      },
    ],
  },
  {
    id: 'progress',
    label: '进展',
    items: [
      { to: '/dashboard', label: '个人仪表盘', icon: BarChart3, end: false },
    ],
  },
] as const;

/**
 * SidebarProps - 侧栏无外部 props，状态来自 uiStore
 */
export interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({
  mobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const themePreference = useUiStore((s) => s.themePreference);
  const isOnline = useUiStore((s) => s.isOnline);
  const toggleSidebarCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);
  const cycleTheme = useUiStore((s) => s.cycleTheme);
  const openSettings = useUiStore((s) => s.openSettings);
  const sidebarRef = useRef<HTMLElement>(null);
  const visuallyCollapsed = collapsed && !mobileOpen;
  const [compactViewport, setCompactViewport] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)');
    const update = () => setCompactViewport(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    sidebarRef.current?.toggleAttribute('inert', compactViewport && !mobileOpen);
  }, [compactViewport, mobileOpen]);

  useFocusTrap(sidebarRef, mobileOpen, onCloseMobile);

  const themeLabel = themePreferenceLabel(themePreference);

  // 按当前偏好选择图标，便于用户一眼识别下一跳/当前态
  const ThemeIcon =
    themePreference === 'system'
      ? Monitor
      : themePreference === 'light'
        ? Sun
        : Moon;

  return (
    <aside
      ref={sidebarRef}
      id="main-navigation-drawer"
      className={`sidebar${visuallyCollapsed ? ' sidebar--collapsed' : ''}${mobileOpen ? ' sidebar--mobile-open' : ''}`}
      aria-label="全局导航"
      aria-hidden={compactViewport && !mobileOpen}
    >
      {/* 品牌区：头像 + 系统名；设置齿轮打开抽屉 */}
      <div className="sidebar__user">
        <div className="sidebar__avatar" aria-hidden="true">
          学
        </div>
        {!visuallyCollapsed && (
          <div className="sidebar__user-meta">
            <span className="sidebar__user-name">学森</span>
          </div>
        )}
        <button
          type="button"
          className="sidebar__icon-btn"
          aria-label="打开设置"
          title="设置"
          onClick={openSettings}
        >
          <Settings size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="sidebar__icon-btn sidebar__mobile-close"
          aria-label="关闭主导航"
          data-autofocus
          onClick={onCloseMobile}
        >
          <X size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      {/* 主导航：按资料库 / 研究 / 进展分组，保持研究流程可见 */}
      <nav className="sidebar__nav" aria-label="主导航">
        <div className="sidebar__groups">
          {NAV_GROUPS.map((group) => (
            <section className="sidebar__group" key={group.id} aria-label={group.label}>
              <h2 className="sidebar__group-label">{group.label}</h2>
              <ul className="sidebar__nav-list">
                {group.items.map(({ to, label, icon: Icon, end }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      className={({ isActive }) =>
                        `sidebar__nav-item${isActive ? ' sidebar__nav-item--active' : ''}`
                      }
                      title={visuallyCollapsed ? label : undefined}
                      aria-label={label}
                      onClick={onCloseMobile}
                    >
                      <Icon
                        className="sidebar__nav-icon"
                        size={20}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      {!visuallyCollapsed && (
                        <span className="sidebar__nav-label">{label}</span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </nav>

      <div className="sidebar__spacer" aria-hidden="true" />

      {/* 底部区：折叠 + 主题 + 离线胶囊（§14.1） */}
      <div className="sidebar__footer">
        <button
          type="button"
          className="sidebar__nav-item sidebar__nav-item--muted"
          aria-label={visuallyCollapsed ? '展开侧栏' : '折叠侧栏'}
          title={visuallyCollapsed ? '展开侧栏' : '折叠侧栏'}
          onClick={() => {
            if (mobileOpen) onCloseMobile?.();
            else toggleSidebarCollapsed();
          }}
        >
          <ChevronLeft
            className={`sidebar__chevron${visuallyCollapsed ? ' sidebar__chevron--collapsed' : ''}`}
            size={20}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          {!visuallyCollapsed && <span className="sidebar__nav-label">折叠侧栏</span>}
        </button>

        <div className="sidebar__footer-row">
          <button
            type="button"
            className="sidebar__nav-item sidebar__nav-item--muted sidebar__theme-btn"
            aria-label={`主题：${themeLabel}`}
            title={themeLabel}
            onClick={cycleTheme}
          >
            <ThemeIcon
              className="sidebar__nav-icon"
              size={20}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            {!visuallyCollapsed && (
              <span className="sidebar__nav-label">{themeLabel}</span>
            )}
          </button>

          {!isOnline ? (
            <Tooltip
              content="已离线，本地功能可正常使用"
              aria-label="离线状态说明"
            >
              <span
                className={`sidebar__offline${visuallyCollapsed ? ' sidebar__offline--icon' : ''}`}
                role="status"
                aria-label="离线"
              >
                <CloudOff size={16} strokeWidth={1.5} aria-hidden="true" />
                {!visuallyCollapsed && <span>离线</span>}
              </span>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
