# 学森

基于浏览器的**学术文献阅读助手**：本地优先管理 PDF / EPUB，划词批注与书签、阅读器内摄像头指示、个人仪表盘（占位数据）、知识图谱（占位）、回收站软删除。

| 文档 | 用途 |
|---|---|
| [`UI_spec.md`](./UI_spec.md) | 产品与视觉规范（权威；部分产品迭代见下） |
| [`PROGRESS.md`](./PROGRESS.md) | 进度、待办、技术债、变更记录 |
| [`HANDOFF.md`](./HANDOFF.md) | **仪表盘 / 知识图谱**接手：文件位置、数据接口、接入顺序 |
| [`.cursorrules`](./.cursorrules) | Agent / 工程约束 |

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | React 18 + Vite 6 + TypeScript（`strict`） |
| 路由 | React Router v6 **Data Router**（`createBrowserRouter`） |
| 状态 | Zustand |
| 样式 | 纯 CSS + Design Tokens（`src/styles/tokens.css`），双主题 `data-theme` |
| 存储 | IndexedDB（`idb`）v4：文件 / blob / 会话 / 批注 / **书签** |
| 阅读 | PDF.js（`pdfjs-dist`，worker 经 Vite `?url` 本地化）；epub.js |
| 摄像头 | Python `monitor/` 本机开摄像头并推理；阅读页经 HTTP 启停（无浏览器 getUserMedia） |
| 图谱（重做时） | 安装 **`react-force-graph-2d`**；禁止伞包 `react-force-graph`（会拉 aframe） |

> `recharts` 仍在依赖中，但精简后的仪表盘已不再引用折线组件。

## 快速开始

```bash
# 若 Node 未在 PATH（Windows 便携版示例）：
# $env:PATH = "$env:LOCALAPPDATA\nodejs\node-v22.17.1-win-x64;$env:PATH"

npm install
npm run dev
```

浏览器打开终端提示的地址（默认 [http://localhost:5173/](http://localhost:5173/)）。

| 脚本 | 说明 |
|---|---|
| `npm run dev` | 开发服务器（HMR） |
| `npm run build` | `tsc -b` + 生产构建 |
| `npm run preview` | 预览构建产物 |
| `npm run lint` | Oxlint |

## 功能概览（当前）

- **文件目录**：导入 / 搜索 / 筛选 / 文件夹；多选表头批量（取消 / 移动到 / 删除）；行操作含新建副本；移动目标含文件夹树与回收站
- **回收站**：还原 / 移动到新路径 / 彻底删除 / 清空；多选「恢复」；30 天清理说明
- **PDF / EPUB 阅读**：分页与连续滚动、键盘翻页（含上下键）、缩放与**适应宽度切换**、文内搜索、真全屏（Esc 退出）
- **划词**：高亮 / 批注 / 提问 / 复制 / **书签（可选色）** / 搜索本文；书签可在 Toc 重命名与换色，正文有丝带与着色
- **仪表盘**（`/dashboard`）：专注时长 / 阅读行数 → 近 30 天热力图 → 按时间升序的六维专注会话表；**数值均为 `dashboardPlaceholders` 假数据**（未接 IndexedDB 会话）
- **知识图谱**（`/knowledge-graph`）：侧栏与路由保留，页面 EmptyState；画布实现已清空（见 [`HANDOFF.md`](./HANDOFF.md)）
- **离线**：`navigator.onLine`；顶栏离线条 + Sidebar 胶囊；QA 离线禁用

尚未完成：仪表盘/图谱接真数据、真实 AI 问答与整理习得、批注原文高亮层（§8.8）、Toc 真实大纲、Settings 表单等（详见 `PROGRESS.md`）。

## 目录结构（摘要）

```
src/
  components/     # 通用组件 + layout（AppShell / Sidebar / OfflineBanner）
  features/
    file-directory/ trash/ reader/
    dashboard/          # MetricCards + ReadingHeatmap + FocusSessionList
    knowledge-graph/    # EmptyState 占位页
  hooks/          # useCamera / useNetworkStatus / usePdfDocument …
  stores/         # Zustand（fileStore / sessionStore / bookmarkStore / readerStore …）
  db/             # IndexedDB（files / sessions / annotations / bookmarks）
  utils/          # dashboardPlaceholders.ts 等
  styles/         # tokens.css
  types/          # 对齐 UI_spec §9（含 GraphNode / GraphEdge；六维占位尚未入 types）
```

## 开发约定

- UI / 数据模型以 **`UI_spec.md`** 为准；**仪表盘精简布局、知识图谱占位**以产品迭代 + [`HANDOFF.md`](./HANDOFF.md) 为准，与 §5 / §6 全文冲突时先对齐再改代码。
- 颜色、间距、字号只用 CSS 变量（禁止硬编码色值与随意内联 style）。
- 单文件建议 &lt; 300 行；注释说明「为什么」而非仅复述代码。
- 路由元信息用 route `handle`（需 Data Router，勿改回裸 `BrowserRouter` + `useMatches`）。

## 排障备忘

| 现象 | 常见原因 |
|---|---|
| 整页全黑、`#root` 为空 | 曾用 `BrowserRouter` + `useMatches` 抛错；现已用 Data Router |
| `AFRAME is not defined` | 误装伞包 `react-force-graph`；重做图谱请用 `react-force-graph-2d` |
| `Maximum update depth exceeded`（文件目录） | 派生数组 selector 未 `useShallow` |
| 取消多选后行按钮仍在 | 已改为 JS 悬停态；若仍异常请硬刷新 |
| 仪表盘数字与阅读无关 | 预期行为：当前为占位常量，见 `dashboardPlaceholders.ts` |

黑屏或依赖异常时：停掉 dev → 删除 `node_modules/.vite` → `npm run dev` → 浏览器硬刷新。
