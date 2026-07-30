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
  Moon,
  Monitor,
  Settings,
  Share2,
  Sun,
  Trash2,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { Tooltip } from '../common';
import {
  themePreferenceLabel,
  useUiStore,
} from '../../stores/uiStore';
import './Sidebar.css';

/** 主导航项配置（回收站单独放底部区） */
const PRIMARY_NAV = [
  { to: '/', label: '文件目录', icon: Folder, end: true },
  { to: '/dashboard', label: '个人仪表盘', icon: BarChart3, end: false },
  {
    to: '/knowledge-graph',
    label: '知识图谱',
    icon: Share2,
    end: false,
  },
] as const;

/**
 * SidebarProps - 侧栏无外部 props，状态来自 uiStore
 */
export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const themePreference = useUiStore((s) => s.themePreference);
  const isOnline = useUiStore((s) => s.isOnline);
  const toggleSidebarCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);
  const cycleTheme = useUiStore((s) => s.cycleTheme);
  const openSettings = useUiStore((s) => s.openSettings);

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
      className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}
      aria-label="全局导航"
    >
      {/* 品牌区：头像 + 系统名；设置齿轮打开抽屉 */}
      <div className="sidebar__user">
        <div className="sidebar__avatar" aria-hidden="true">
          学
        </div>
        {!collapsed && (
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
      </div>

      {/* 主导航：文件目录 / 仪表盘 / 知识图谱 */}
      <nav className="sidebar__nav" aria-label="主导航">
        <ul className="sidebar__nav-list">
          {PRIMARY_NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `sidebar__nav-item${isActive ? ' sidebar__nav-item--active' : ''}`
                }
                title={collapsed ? label : undefined}
                aria-label={label}
              >
                <Icon
                  className="sidebar__nav-icon"
                  size={20}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                {!collapsed && (
                  <span className="sidebar__nav-label">{label}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar__spacer" aria-hidden="true" />

      {/* 底部区：回收站 + 折叠 + 主题 + 离线胶囊（§14.1） */}
      <div className="sidebar__footer">
        <NavLink
          to="/trash"
          className={({ isActive }) =>
            `sidebar__nav-item sidebar__nav-item--muted${isActive ? ' sidebar__nav-item--active' : ''}`
          }
          title={collapsed ? '回收站' : undefined}
          aria-label="回收站"
        >
          <Trash2
            className="sidebar__nav-icon"
            size={20}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          {!collapsed && <span className="sidebar__nav-label">回收站</span>}
        </NavLink>

        <button
          type="button"
          className="sidebar__nav-item sidebar__nav-item--muted"
          aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
          title={collapsed ? '展开侧栏' : '折叠侧栏'}
          onClick={toggleSidebarCollapsed}
        >
          <ChevronLeft
            className={`sidebar__chevron${collapsed ? ' sidebar__chevron--collapsed' : ''}`}
            size={20}
            strokeWidth={1.5}
            aria-hidden="true"
          />
          {!collapsed && <span className="sidebar__nav-label">折叠侧栏</span>}
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
            {!collapsed && (
              <span className="sidebar__nav-label">{themeLabel}</span>
            )}
          </button>

          {!isOnline ? (
            <Tooltip
              content="已离线，本地功能可正常使用"
              aria-label="离线状态说明"
            >
              <span
                className={`sidebar__offline${collapsed ? ' sidebar__offline--icon' : ''}`}
                role="status"
                aria-label="离线"
              >
                <CloudOff size={16} strokeWidth={1.5} aria-hidden="true" />
                {!collapsed && <span>离线</span>}
              </span>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
