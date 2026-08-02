/**
 * AppShell - A–D 页面全局外壳（Sidebar + Header + Content + Settings）
 * 所属页面：文件目录 / 仪表盘 / 知识图谱 / 回收站
 * 规范参考：UI_spec.md §2 / §14
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useSystemThemeListener } from '../../hooks/useSystemThemeListener';
import { useAppShortcuts } from '../../hooks/useAppShortcuts';
import { OfflineBanner } from './OfflineBanner';
import { PageHeader } from './PageHeader';
import { SettingsDrawer } from './SettingsDrawer';
import { Sidebar } from './Sidebar';
import './AppShell.css';

/**
 * AppShellProps
 * @param title - 当前页标题（传给 PageHeader）
 * @param breadcrumb - 可选面包屑
 * @param actions - PageHeader 右侧操作区
 * @param children - 若传入则渲染 children，否则渲染路由 Outlet
 */
export interface AppShellProps {
  title: string;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function AppShell({
  title,
  breadcrumb,
  actions,
  children,
}: AppShellProps) {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    // 路由切换后收起临时导航层，避免下一页被旧遮罩挡住。
    setMobileNavOpen(false);
  }, [location.pathname]);

  // 跟随系统主题时监听 prefers-color-scheme 变化
  useSystemThemeListener();
  // 网络状态写入 uiStore（§14）
  useNetworkStatus();
  // 全局快捷键
  useAppShortcuts();

  return (
    <div className="app-shell">
      <Sidebar
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      {mobileNavOpen ? (
        <button
          type="button"
          className="app-shell__mobile-backdrop"
          aria-label="关闭主导航"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <div className="app-shell__main">
        <OfflineBanner />
        <PageHeader
          title={title}
          breadcrumb={breadcrumb}
          actions={actions}
          mobileNavOpen={mobileNavOpen}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />

        {/* 唯一纵向滚动容器：Sidebar / PageHeader 保持固定 */}
        <main className="app-shell__content">{children ?? <Outlet />}</main>
      </div>

      <SettingsDrawer />
    </div>
  );
}
