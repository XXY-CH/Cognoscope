/**
 * PageHeader - 页面顶栏（标题/面包屑 + 操作区）
 * 所属页面：A–D 共用 AppShell
 * 规范参考：UI_spec.md §2.2 / §2.3
 */
import { Menu } from 'lucide-react';
import type { ReactNode } from 'react';
import './PageHeader.css';

/**
 * PageHeaderProps
 * @param title - 页面主标题（无面包屑时使用）
 * @param breadcrumb - 可选面包屑节点；传入时优先于 title 展示在左侧
 * @param actions - 右侧操作区（按钮组等）
 */
export interface PageHeaderProps {
  title: string;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  mobileNavOpen?: boolean;
  onOpenMobileNav?: () => void;
}

export function PageHeader({
  title,
  breadcrumb,
  actions,
  mobileNavOpen = false,
  onOpenMobileNav,
}: PageHeaderProps) {
  return (
    <header className={`page-header${actions ? ' page-header--with-actions' : ''}`}>
      <button
        type="button"
        className="page-header__menu"
        aria-label="打开主导航"
        aria-expanded={mobileNavOpen}
        aria-controls="main-navigation-drawer"
        onClick={onOpenMobileNav}
      >
        <Menu size={20} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <div className="page-header__left">
        {breadcrumb ?? <h1 className="page-header__title">{title}</h1>}
      </div>
      {actions ? (
        <div className="page-header__actions">{actions}</div>
      ) : null}
    </header>
  );
}
