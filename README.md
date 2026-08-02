# 学森

基于浏览器的**学术文献阅读助手**：本地优先管理 PDF / EPUB，划词批注与书签、阅读器内摄像头指示、个人仪表盘、论文与关键词知识图谱、跨论文证据矩阵、回收站软删除。

| 文档 | 用途 |
|---|---|
| [`UI_spec.md`](./UI_spec.md) | 产品与视觉规范（权威；部分产品迭代见下） |
| [`PROGRESS.md`](./PROGRESS.md) | 进度、待办、技术债、变更记录 |
| [`HANDOFF.md`](./HANDOFF.md) | **仪表盘 / 知识图谱**接手：文件位置、数据接口、接入顺序 |
| [`docs/agent-run-state.json`](./docs/agent-run-state.json) | Agent 跨轮次 checkpoint：当前目标、活跃节点、finding 和下一跳 |
| [`docs/GRAPH_ENGINEERING.md`](./docs/GRAPH_ENGINEERING.md) | Codex 可直接调用的项目 Graph Engineering 迭代图 |
| [`.cursorrules`](./.cursorrules) | Agent / 工程约束 |

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | React 18 + Vite 6 + TypeScript（`strict`） |
| 路由 | React Router v6 **Data Router**（`createBrowserRouter`） |
| 状态 | Zustand |
| 样式 | 纯 CSS + Design Tokens（`src/styles/tokens.css`），双主题 `data-theme` |
| 存储 | IndexedDB（`idb`）v9：文件 / blob / 会话 / 批注 / 书签 / 证据矩阵 / 研究分析 |
| 阅读 | PDF.js（`pdfjs-dist`，worker 经 Vite `?url` 本地化）；epub.js |
| 摄像头 | Python `monitor/` 本机开摄像头并推理；阅读页经 HTTP 启停（无浏览器 getUserMedia） |
| 图谱画布 | 使用 **`react-force-graph-2d`**；禁止伞包 `react-force-graph`（会拉 aframe） |

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

- **当前研究状态**（`/`）：回到最近阅读、继续打开本地文献、查看证据待审阅数量、图谱规模和研究轨迹；不以原始文件列表作为首页
- **文件目录**（`/library`）：导入 / 搜索 / 筛选 / 文件夹；多选表头批量（取消 / 移动到 / 删除）；行操作含新建副本；移动目标含文件夹树与回收站
- **回收站**：还原 / 移动到新路径 / 彻底删除 / 清空；多选「恢复」；30 天清理说明
- **PDF / EPUB 阅读**：分页与连续滚动、键盘翻页（含上下键）、缩放与**适应宽度切换**、文内搜索、真全屏（Esc 退出）
- **划词**：高亮 / 批注 / 提问 / 复制 / **书签（可选色）** / 搜索本文；书签可在 Toc 重命名与换色，正文有丝带与着色
- **仪表盘**（`/dashboard`）：专注时长 / 阅读行数 → 近 1 年热力图 → 按时间升序的专注会话表；数据来自本地 IndexedDB 会话
- **知识图谱**（`/knowledge-graph`）：论文关系图 + 关键词图双画布；支持按论文标题/关键词搜索、类型筛选、双向高亮、关系来源/理由查看，以及从节点详情直接回到论文阅读或用当前三至五篇论文簇创建证据矩阵
- **证据矩阵**（`/evidence-matrix`）：从三至五篇本地论文的批注、摘要和有限文字稿生成可审核的结论/证据行；支持争议与待核对状态、回读来源、离线编辑和复制引用材料。图谱关系仅用于选文，不能替代原文证据
- **研究分析**：在矩阵行被用户确认后，按“研究结论与证据 / 局限与矛盾 / 研究空白与机会”生成可审核草稿；每项回指矩阵行，确认后才能复制
- **离线**：`navigator.onLine`；顶栏离线条 + Sidebar 胶囊；QA 离线禁用
- **UI Phase 002**：按 Apple Design 交互约束优化共享外壳；`899px` 以下侧栏改为可关闭的 overlay 抽屉，顶栏与文件工具栏在窄屏重排，保留键盘焦点、Escape 关闭和离线本地能力。
- **知识图谱 Phase 003（首轮实现）**：将图谱拆为“研究空间 → 文献来源 → 语义概念 → 证据锚点 → 综合判断”五级数据层；当前已提供来源图例、搜索筛选、节点检查器和移动 Sheet，图谱关系继续只作导航线索，证据矩阵仍是可引用材料的权威入口。
- **系统 UI Phase 004（首轮实现）**：统一资料库、研究工作台、专注进展和沉浸阅读四个产品层级；已落地分组侧栏、动效 token、路由连续过渡、移动文件列表和阅读器 Sheet，后续继续重排矩阵检查器与真实文档数据验收。
- **AI 时代科研环境 Phase 005（垂直切片）**：根路径改为“当前研究状态”，资料库迁到 `/library`；首页从本地会话、文件、图谱和证据矩阵派生下一步，不伪造 AI 进度，导入动作可从首页无缝进入真实资料库对话框。
- **AI 时代科研环境 Phase 005（会话后整理）**：IndexedDB v10 新增会话整理、研究信号和待审阅线索；离开阅读后按原文摘录/定位门槛保存用户批注，缺定位或无法匹配的材料明确进入待审阅，首页可回读来源并查看整理正文。

尚未完成：阅读器内真实 QA/整理习得、批注原文高亮层（§8.8）、Toc 真实大纲、图谱边的批注级证据深化等（详见 `PROGRESS.md`）。

## 目录结构（摘要）

```
src/
  components/     # 通用组件 + layout（AppShell / Sidebar / OfflineBanner）
  features/
    file-directory/ trash/ reader/
    dashboard/          # MetricCards + ReadingHeatmap + FocusSessionList
    knowledge-graph/    # 论文 + 关键词双画布、搜索筛选、节点证据详情
  hooks/          # useCamera / useNetworkStatus / usePdfDocument …
  stores/         # Zustand（fileStore / sessionStore / bookmarkStore / readerStore …）
  db/             # IndexedDB（files / sessions / annotations / bookmarks / evidence）
  utils/          # dashboardPlaceholders.ts 等
  styles/         # tokens.css
  types/          # 对齐 UI_spec §9（含 GraphNode / GraphEdge / KeywordNode）
```

## 开发约定

- UI / 数据模型以 **`UI_spec.md`** 为准；图谱当前定位为论文获取之后的跨论文理解与证据整理层，不替代知网等外部检索或 Word/LaTeX 写作工具。
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

黑屏或依赖异常时：停掉 dev → 删除 `node_modules/.vite` → `npm run dev` → 浏览器硬刷新。UI Phase 002 设计契约见 [`docs/plans/2026-08-01-002-ui-UI-SPEC.md`](./docs/plans/2026-08-01-002-ui-UI-SPEC.md)，执行计划见 [`docs/plans/2026-08-01-002-ui-plan.md`](./docs/plans/2026-08-01-002-ui-plan.md)。知识图谱 Phase 003 设计契约见 [`docs/plans/2026-08-02-003-knowledge-graph-UI-SPEC.md`](./docs/plans/2026-08-02-003-knowledge-graph-UI-SPEC.md)，执行计划见 [`docs/plans/2026-08-02-003-knowledge-graph-plan.md`](./docs/plans/2026-08-02-003-knowledge-graph-plan.md)。系统 UI Phase 004 设计契约见 [`docs/plans/2026-08-02-004-ui-system-UI-SPEC.md`](./docs/plans/2026-08-02-004-ui-system-UI-SPEC.md)，执行计划见 [`docs/plans/2026-08-02-004-ui-system-plan.md`](./docs/plans/2026-08-02-004-ui-system-plan.md)。
