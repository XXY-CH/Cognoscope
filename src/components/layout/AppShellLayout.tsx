/**
 * AppShellLayout - 路由级布局外壳
 * 支持 route.handle 默认标题/面包屑，以及 pageHeaderStore 动态插槽覆盖
 * 规范参考：UI_spec.md §2 / §4.1
 */
import { useMemo } from 'react';
import { Link, Outlet, useMatches } from 'react-router-dom';
import { usePageHeaderStore } from '../../stores/pageHeaderStore';
import { AppShell } from './AppShell';

/** 面包屑单项：末项无 to，表示当前页 */
export interface BreadcrumbItem {
  label: string;
  to?: string;
}

/** 路由 handle 中声明的页面头信息 */
export interface AppRouteHandle {
  title: string;
  breadcrumb?: BreadcrumbItem[];
}

export function AppShellLayout() {
  const matches = useMatches();
  const slotBreadcrumb = usePageHeaderStore((s) => s.breadcrumb);
  const slotActions = usePageHeaderStore((s) => s.actions);

  const handle = useMemo(() => {
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const candidate = matches[i]?.handle as AppRouteHandle | undefined;
      if (candidate?.title) return candidate;
    }
    return { title: '学森' } satisfies AppRouteHandle;
  }, [matches]);

  const routeBreadcrumb = useMemo(() => {
    if (!handle.breadcrumb?.length) return undefined;
    return (
      <ol className="page-header__breadcrumb">
        {handle.breadcrumb.map((item, index) => {
          const isLast = index === handle.breadcrumb!.length - 1;
          return (
            <li
              key={`${item.label}-${index}`}
              className="page-header__breadcrumb-item"
            >
              {index > 0 && (
                <span className="page-header__breadcrumb-sep" aria-hidden="true">
                  /
                </span>
              )}
              {item.to && !isLast ? (
                <Link to={item.to} className="page-header__breadcrumb-link">
                  {item.label}
                </Link>
              ) : (
                <span className="page-header__breadcrumb-current">
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    );
  }, [handle.breadcrumb]);

  // 页面注入的动态面包屑优先于路由静态配置
  const breadcrumb = slotBreadcrumb ?? routeBreadcrumb;

  return (
    <AppShell title={handle.title} breadcrumb={breadcrumb} actions={slotActions}>
      <Outlet />
    </AppShell>
  );
}
