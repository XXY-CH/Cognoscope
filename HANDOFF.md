# 学森 · 模块交接说明（个人仪表盘 / 知识图谱）

> 更新时间：2026-07-29  
> 读者：后继前端 / 全栈开发者  
> 设计权威：[`UI_spec.md`](./UI_spec.md)  
> 工程约束：[`.cursorrules`](./.cursorrules) · 进度：[`PROGRESS.md`](./PROGRESS.md)

本文档说明两个**当前为占位/精简态**的模块：如何接手、数据从哪来、类型怎么定、文件在哪、接真数据时该改什么。

---

## 目录

1. [第一部分 · 个人仪表盘](#第一部分--个人仪表盘)
2. [第二部分 · 知识图谱](#第二部分--知识图谱)
3. [共用约定](#共用约定)

---

# 第一部分 · 个人仪表盘

## 1.1 现状简介

| 项 | 说明 |
|---|---|
| 路由 | `/dashboard`（`src/App.tsx` lazy 加载） |
| 侧栏 | `Sidebar` →「个人仪表盘」 |
| 状态 | **精简占位 UI 已落地**：两指标卡 + 热力图 + 专注会话六维表；**数值全部为假数据** |
| 与规范 | 产品迭代已偏离 `UI_spec.md` §5 全文（已去掉摄像头条、折线、分心轴、四指标中的分心/疲劳卡等）；**以当前页面结构为准**，接真数据时再决定是否回补 §5 其余块 |

页面自上而下：

1. **专注时长** / **阅读行数**（两列指标卡）  
2. **近 30 天阅读热力图**  
3. **专注会话表**（时间升序）：注视中心占比、分心事件密度、头部姿态方差、眼睑闭合百分比、眨眼频率、综合评分  

## 1.2 文件位置

```
src/features/dashboard/
  DashboardPage.tsx              # 页面组装（仅三块）
  DashboardPage.module.css
  MetricCards.tsx                # 专注时长 / 阅读行数
  MetricCards.module.css
  ReadingHeatmap.tsx             # 热力图格子
  ReadingHeatmap.module.css
  FocusSessionList.tsx           # 六维会话表
  FocusSessionList.module.css

src/utils/dashboardPlaceholders.ts   # ★ 当前唯一数据源（固定占位）
src/utils/dashboardMetrics.ts        # 旧聚合工具（会话筛选等）；仪表盘页暂未用
src/utils/seedSessions.ts            # IndexedDB 演示会话种子（sessionStore 仍可能写入）

src/stores/sessionStore.ts           # 阅读会话 Zustand（阅读器写会话；仪表盘暂未读）
src/db/sessions.ts                   # sessions CRUD
src/hooks/useCamera.ts               # 摄像头（阅读器底栏等仍用；仪表盘页已卸）
src/types/index.ts                   # ReadingSession / MetricSample / …
```

已从仪表盘目录删除（勿误以为还在）：`CameraStatusBar`、`FocusFatigueChart`、`DistractionTimeline`、`DashboardToolbar`。

## 1.3 当前数据接口（占位层）

占位全部集中在 `src/utils/dashboardPlaceholders.ts`。接真数据时：**优先替换此文件的导出，或改为从 store/API 注入同名形状**，尽量少改展示组件。

### 指标卡

| 导出常量 | 类型 | 用途 | 当前示例 |
|---|---|---|---|
| `PLACEHOLDER_FOCUS_DURATION` | `string` | 专注时长主值 | `"01:24:36"` |
| `PLACEHOLDER_FOCUS_DELTA` | `string` | 副文案 | `"较上次 +18 分钟 ↑"` |
| `PLACEHOLDER_LINES_READ` | `string` | 阅读行数（已含千分位） | `"12,480"` |
| `PLACEHOLDER_LINES_DELTA` | `string` | 副文案 | `"较上次 +1,260 行"` |
| `PLACEHOLDER_SPARK_FOCUS` | `number[]` | 近 7 次趋势条高度 | 长度 7 |
| `PLACEHOLDER_SPARK_LINES` | `number[]` | 同上 | 长度 7 |

### 热力图

| 导出 | 类型 | 约定 |
|---|---|---|
| `PLACEHOLDER_HEAT_MINUTES` | `number[]` | 长度 **30**；下标 0 = 最旧一天，末项 = 今天；单位「阅读分钟」；`0` = 无阅读 |

`ReadingHeatmap` 用「今天」向前推算 `dateKey`（`YYYY-MM-DD`），再按分钟算 `data-level` 0–4。

### 专注会话六维表

```ts
/** 定义见 dashboardPlaceholders.ts */
export interface FocusSessionPlaceholder {
  timeRange: string;           // 展示用时间段，如 "2026-07-22 09:15 – 10:02"
  dateKey: string;             // YYYY-MM-DD，排序/分组
  gazeCenterRatio: string;     // 注视中心占比，如 "72.4%"
  distractionDensity: string;  // 分心事件密度，如 "0.38 /min"
  headPoseVariance: string;    // 头部姿态方差，如 "0.086"
  eyelidClosure: string;       // 眼睑闭合百分比，如 "12.3%"
  blinkRate: string;           // 眨眼频率，如 "16.2 /min"
  overallScore: string;        // 综合评分 0–100 字符串，如 "78"
}

export const PLACEHOLDER_FOCUS_SESSIONS: FocusSessionPlaceholder[];
// 按时间升序（早 → 晚）
```

> **注意**：六维字段目前是 **展示用字符串**，尚未写入 `src/types/index.ts` / `UI_spec.md §9`。接入推理管线时应新增正式类型（建议数值型 + 格式化层），并与产品确认字段语义与单位。

## 1.4 规范中已有、可复用的会话模型（§9）

阅读器已写入 IndexedDB 的会话结构（与六维占位**不同域**，勿混用字段名）：

```ts
// src/types/index.ts — 对齐 UI_spec §9
interface ReadingSession {
  id: string;
  fileId: string;
  startedAt: string;          // ISO 8601
  endedAt: string | null;
  durationSec: number;
  linesRead: number;          // 行数计量（§13 决策1）
  focusSamples: MetricSample[];   // { atSec, value 0–100 }
  fatigueSamples: MetricSample[];
  distractions: DistractionEvent[];
}
```

| 存储 | 路径 |
|---|---|
| IndexedDB object store | `sessions`（`src/db/sessions.ts`） |
| Zustand | `src/stores/sessionStore.ts`（`loadSessions` / `range` / …） |
| 聚合工具 | `src/utils/dashboardMetrics.ts`（`summarizeMetrics`、`buildHeatmap`、`filterSessionsByRange`） |

接真数据时建议映射关系（示意）：

| UI 区块 | 建议来源 |
|---|---|
| 专注时长 | `ReadingSession.durationSec` 聚合（或「有效专注」另算） |
| 阅读行数 | `ReadingSession.linesRead` 聚合 |
| 热力图 | 按日汇总 `durationSec` → 分钟（可用现成 `buildHeatmap`） |
| 六维表 | **新接口**：摄像头本地推理输出；需扩展类型与 DB（可能升 IndexedDB 版本） |

摄像头相关：`CameraState` / `useCamera`（画面与推理仅本地，§13 决策7）。仪表盘若恢复状态条，复用该 Hook，勿上传画面。

## 1.5 建议接入顺序

1. 定稿六维指标的正式 TypeScript 接口（写入 `types` + 必要时更新 `UI_spec.md §9`）。  
2. 推理侧产出数值 → 写入会话或独立 store → 替换 `dashboardPlaceholders`。  
3. 指标卡 / 热力图改读 `sessionStore` + `dashboardMetrics`。  
4. 再评估是否恢复 §5 摄像头条、折线等（与产品对齐）。  
5. 四态加载（idle / loading / empty / error，见 §9 加载约定）。

---

# 第二部分 · 知识图谱

## 2.1 现状简介

| 项 | 说明 |
|---|---|
| 路由 | `/knowledge-graph` |
| 侧栏 | 「知识图谱」 |
| 状态 | **仅 EmptyState 占位**；画布与交互实现已全部删除 |
| 规范 | 完整 UI 仍以 `UI_spec.md` **§6** 为准；类型以 **§9** + **§13 决策4** 为准 |

请勿在未读 §6 的情况下把旧演示启发式边原样抄回并标为「完成」。

## 2.2 文件位置

### 已保留

| 项 | 路径 | 说明 |
|---|---|---|
| 路由 + lazy | `src/App.tsx` | `path: 'knowledge-graph'`，`handle.title = '知识图谱'` |
| 侧栏 | `src/components/layout/Sidebar.tsx` | `to: '/knowledge-graph'` |
| 页面壳 | `src/features/knowledge-graph/KnowledgeGraphPage.tsx` | EmptyState；在此目录重建 |
| 样式壳 | `KnowledgeGraphPage.module.css` | 占位居中布局 |
| 类型 | `src/types/index.ts` | `GraphNodeKind` / `GraphNode` / `GraphEdge` |

### 已删除（需按 §6 重做）

```
src/features/knowledge-graph/
  GraphCanvas.tsx (+ .module.css)      # react-force-graph-2d
  GraphToolbar.tsx (+ .module.css)     # 搜索 / 布局 / 适应视图
  NodeDetailPanel.tsx (+ .module.css)  # 左侧详情 ~280px
  GraphBuildBanner.tsx (+ .module.css) # AI 建边进度条

src/stores/graphStore.ts
src/utils/seedGraph.ts                 # 演示节点 + 启发式边
src/utils/graphColors.ts               # Canvas 读 CSS 变量取色
```

依赖：`react-force-graph-2d` 已从 `package.json` 移除。重做时：

```bash
npm install react-force-graph-2d
```

**禁止**安装伞包 `react-force-graph`（会拉 aframe → `AFRAME is not defined`）。见 `PROGRESS.md` 黑屏备忘。

## 2.3 数据接口（规范类型）

权威定义：`UI_spec.md §9` / `src/types/index.ts`。

```ts
type GraphNodeKind = 'file' | 'folder' | 'tag';

interface GraphNode {
  id: string;
  fileId: string | null;   // 标签节点为 null
  label: string;
  kind: GraphNodeKind;
  fileType?: FileType;     // 仅 kind === 'file'
  x: number | null;        // 手动拖拽后持久化；未拖过为 null（力导向算）
  y: number | null;
}

interface GraphEdge {
  source: string;          // GraphNode.id
  target: string;
  weight: number;          // 0–1 → 线粗与不透明度
}
```

### 数据职责边界

| 数据 | 谁产生 | 前端职责 |
|---|---|---|
| `GraphEdge` | AI / 后端（内容相似度等） | **只读**：展示、搜索、过滤；**禁止**手动建边/删边（§13 决策4） |
| `GraphNode` | 可由文件树派生 + 标签节点 | 展示；拖拽后可写回 `x`/`y`（是否开放拖拽需产品确认） |
| 建边进度 | AI 任务状态 | 画布顶 32px 条（`--bg-active`），完成隐藏（§6.4） |

### 建议的运行时状态（重建 `graphStore` 时）

| 字段 | 含义 |
|---|---|
| `nodes` / `edges` | 当前图数据 |
| `selectedNodeId` | 左侧详情联动 |
| `searchQuery` | 顶栏搜索 |
| `layoutMode` | 力导向 / 树形 / 时间线（§6.1） |
| `buildProgress` | `number \| null`（0–1；`null` 表示无进度条） |
| `hydrated` | 是否已从文件/远端灌入 |

持久化：若落节点坐标，可升 IndexedDB 版本新增 store（当前 DB 无独立 graph store）。离线时展示已有关联、不重新计算（§14）。

## 2.4 产品与交互约束（§6 摘要）

1. 布局：全屏 Canvas（可抵消 AppShell Content padding）+ 左详情约 280px + 顶栏操作。  
2. 交互：滚轮缩放、拖空白平移、单击选中、双击打开文件；右键菜单见 §6.2。  
3. 节点规格：直径/配色/选中光环见 §6.3；连线粗细与选中高亮见 §6.4。  
4. 样式：仅 CSS 变量；Canvas 用 `getComputedStyle` 读 token，禁止硬编码色值。  
5. 单文件建议 &lt; 300 行；组件拆分为 Canvas / Toolbar / Detail / Banner。

## 2.5 建议实现顺序

1. 通读 `UI_spec.md §6`、§9 图谱类型、§13 决策4。  
2. 安装 `react-force-graph-2d`。  
3. 实现 `graphStore` + 真实边数据通道（勿用启发式 demo 边冒充完成）。  
4. 重建 `GraphCanvas` / `GraphToolbar` / `NodeDetailPanel` / `GraphBuildBanner`。  
5. 确认拖拽坐标是否持久化 → 再动 IndexedDB。  
6. 双主题 + a11y（画布 `aria-label`、顶栏可键盘）走查。

---

# 共用约定

- **冲突处理**：本交接所述「当前产品结构」若与 `UI_spec.md` 冲突，改代码前先与产品确认以哪边为准，并回写规范或本文。  
- **本地优先**：文件 / 会话 / 批注等走 IndexedDB；AI 依赖网络时需离线降级文案（§14）。  
- **排错**：同一 bug 两次未修好 → 启动 `.cursorrules`「系统二」：假设 + 至少两方案，勿盲改。  
- **文档同步**：模块从占位变为可用后，更新本文状态栏、`PROGRESS.md`、`README.md`。

## 相关链接

| 文档 | 用途 |
|---|---|
| [`UI_spec.md`](./UI_spec.md) §5 / §6 / §9 / §13 / §14 | 视觉与数据权威 |
| [`PROGRESS.md`](./PROGRESS.md) | 总进度与已知债 |
| [`README.md`](./README.md) | 启动与排障 |
| [`.cursorrules`](./.cursorrules) | Agent / 工程习惯 |
