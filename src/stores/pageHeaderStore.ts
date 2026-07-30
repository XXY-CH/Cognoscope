/**
 * pageHeaderStore - PageHeader 动态插槽（操作区 / 面包屑覆盖）
 * 所属：全局布局；供文件目录等页面注入右侧操作与动态面包屑
 * 规范参考：UI_spec.md §2.2 / §4.1
 */
import type { ReactNode } from 'react';
import { create } from 'zustand';

interface PageHeaderState {
  /** 覆盖路由默认面包屑；null 表示使用 route handle */
  breadcrumb: ReactNode | null;
  /** PageHeader 右侧操作区 */
  actions: ReactNode | null;
  setBreadcrumb: (node: ReactNode | null) => void;
  setActions: (node: ReactNode | null) => void;
  /** 离开页面时清空插槽，避免泄漏到其它路由 */
  reset: () => void;
}

export const usePageHeaderStore = create<PageHeaderState>((set) => ({
  breadcrumb: null,
  actions: null,
  setBreadcrumb: (breadcrumb) => set({ breadcrumb }),
  setActions: (actions) => set({ actions }),
  reset: () => set({ breadcrumb: null, actions: null }),
}));
