/**
 * App - 应用根组件：Data Router 路由表
 * 所属：全局入口
 * 规范参考：UI_spec.md §2（A–D 共用 AppShell；E 阅读界面独立全屏）
 *
 * 使用 createBrowserRouter，使 AppShellLayout 的 useMatches / handle 生效
 * （BrowserRouter 下 useMatches 会抛错导致整页黑屏）
 */
import { lazy, Suspense, type ReactNode } from 'react';
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom';
import { ToastViewport } from './components/common/Toast';
import {
  AppShellLayout,
  type AppRouteHandle,
} from './components/layout/AppShellLayout';
import { FileDirectoryPage } from './features/file-directory/FileDirectoryPage';
import { TrashPage } from './features/trash/TrashPage';

const DashboardPage = lazy(() =>
  import('./features/dashboard/DashboardPage').then((m) => ({
    default: m.DashboardPage,
  })),
);
const KnowledgeGraphPage = lazy(() =>
  import('./features/knowledge-graph/KnowledgeGraphPage').then((m) => ({
    default: m.KnowledgeGraphPage,
  })),
);
const ReaderPage = lazy(() =>
  import('./features/reader/ReaderPage').then((m) => ({
    default: m.ReaderPage,
  })),
);

const fileDirectoryHandle = {
  title: '文件目录',
} satisfies AppRouteHandle;

const dashboardHandle = {
  title: '个人仪表盘',
} satisfies AppRouteHandle;

const knowledgeGraphHandle = {
  title: '知识图谱',
} satisfies AppRouteHandle;

const trashHandle = {
  title: '回收站',
} satisfies AppRouteHandle;

/** 路由懒加载占位：避免空白闪屏 */
function RouteFallback() {
  return (
    <p className="page-placeholder" role="status" aria-live="polite">
      加载中…
    </p>
  );
}

/** 包裹 lazy 页面，避免单页加载时整树无反馈 */
function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShellLayout />,
    children: [
      {
        index: true,
        element: <FileDirectoryPage />,
        handle: fileDirectoryHandle,
      },
      {
        path: 'dashboard',
        element: (
          <LazyPage>
            <DashboardPage />
          </LazyPage>
        ),
        handle: dashboardHandle,
      },
      {
        path: 'knowledge-graph',
        element: (
          <LazyPage>
            <KnowledgeGraphPage />
          </LazyPage>
        ),
        handle: knowledgeGraphHandle,
      },
      {
        path: 'trash',
        element: <TrashPage />,
        handle: trashHandle,
      },
    ],
  },
  // E · 阅读界面：独立全屏，不含全局 Sidebar
  {
    path: '/read/:fileId',
    element: (
      <LazyPage>
        <ReaderPage />
      </LazyPage>
    ),
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ToastViewport aria-label="全局提示" />
    </>
  );
}

export default App;
