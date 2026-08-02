# 学森 · 模块交接说明（AI 能力优先）

> 更新时间：2026-07-30  
> 读者：**接入 AI 问答 / 整理习得 / 知识图谱建边** 的前后端开发者  
> 设计权威：[`UI_spec.md`](./UI_spec.md)（§2.4 设置 · §6 图谱 · §8.6–8.9 阅读侧栏 · §9 模型 · §13–14）  
> 工程约束：[`.cursorrules`](./.cursorrules) · 进度：[`PROGRESS.md`](./PROGRESS.md) · 检测：[`monitor/README.md`](./monitor/README.md)

本文说明：**AI 相关能力已具备哪些 UI/配置、还缺什么、该改哪些文件、类型与产品约束是什么**。当前知识图谱已经从占位进入可用切片：它负责论文获取后的跨论文理解与证据整理，不替代外部检索和写作工具。

---

## 目录

1. [总览：现状与缺口](#1-总览现状与缺口)
2. [AI 设置（已落地）](#2-ai-设置已落地)
3. [AI 提问 / 问答（待接请求）](#3-ai-提问--问答待接请求)
4. [批注与上下文（问答输入）](#4-批注与上下文问答输入)
5. [整理习得 Digest（待接）](#5-整理习得-digest待接)
6. [知识图谱 · 文件/关键词联结（当前可用，证据深化中）](#6-知识图谱--文件关键词联结当前可用证据深化中)
7. [建议实现顺序与 API 约定](#7-建议实现顺序与-api-约定)
8. [附录 A · 个人仪表盘（已接会话）](#附录-a--个人仪表盘已接会话)
9. [附录 B · 知识图谱文件清单](#附录-b--知识图谱文件清单)
10. [共用约定](#共用约定)

---

## 1. 总览：现状与缺口

| 能力 | UI | 配置/类型 | 网络请求 | 持久化 |
|---|---|---|---|---|
| AI 设置 | ✅ 设置抽屉 · AI Tab | ✅ `AiSettingsDraft` + localStorage | — | ✅ 本机 |
| AI 提问 | ✅ QAPanel 壳（引用块/离线禁用） | ✅ `QaMessage` 类型已有 | ❌ 发送为空操作 | ❌ 无 QA store / IDB |
| 划词「提问」 | ✅ 写入 `pendingQaQuote` | — | — | 仅内存草稿 |
| 批注 CRUD | ✅ AnnotationPanel | ✅ `Annotation` + IDB | — | ✅ `annotations` |
| 批注原文高亮层 | ❌（§8.8） | 有 `anchor` 字段 | — | 有数据无图层 |
| 整理习得 | ✅ 按钮（toast 占位） | 无 Digest 类型 | ❌ | ❌ |
| 知识图谱 | ✅ 双画布 / 搜索 / 节点详情 | ✅ `GraphNode` / `GraphEdge` + 来源 | ✅ 本地共现 + AI 建边 | ✅ IndexedDB |
| 离线降级 | ✅ QA 输入禁用文案 | `uiStore.isOnline` | — | — |

产品约束（务必遵守）：

- **§13 决策5**：一文件一问答会话，无多会话切换器。  
- **§13 决策4**：图谱边由 AI 产生，前端**只读**展示/过滤，禁止手动建边删边。  
- **§14**：离线时 AI 问答 / 整理习得禁用；本地模型部署时可再放开。  
- 配置已存 OpenAI **兼容** 接口字段；实现时用 `baseUrl` + `apiKey` + `model`，勿写死官方域名。

---

## 2. AI 设置（已落地）

### 2.1 用户路径

设置齿轮（侧栏 / `Ctrl+,`）→ Tab **「AI」** → 编辑草稿 → 抽屉底部 **保存**（写入 `uiStore`）。  
数据管理 Tab 可 **清除 AI 连接配置**（不含问答历史——历史尚未落库）。

### 2.2 文件

| 路径 | 职责 |
|---|---|
| `src/stores/uiStore.ts` | `AiSettingsDraft`、`aiSettings`、`setAiSettings` / `clearAiSettings`；localStorage 键 |
| `src/components/layout/settings/AiPanel.tsx` | 表单 UI（草稿由抽屉托管） |
| `src/components/layout/SettingsDrawer.tsx` | Tab 切换；打开时同步草稿；保存调用 `setAiSettings` |
| `src/components/layout/settings/DataPanel.tsx` | 「清除 AI 配置」 |

### 2.3 配置形状（勿改字段名，可扩展需同步 UI_spec）

```ts
// src/stores/uiStore.ts
type AiAnswerLanguage = 'zh' | 'en' | 'auto';

interface AiSettingsDraft {
  apiKey: string;
  baseUrl: string;          // 默认 https://api.openai.com/v1
  model: string;            // 默认 gpt-4o-mini
  temperature: number;      // 0–2，默认 0.7
  maxTokens: number;        // 默认 2048
  answerLanguage: AiAnswerLanguage;  // 默认 'zh'
  autoCite: boolean;        // 默认 true：回答尽量带可跳转原文引用
}
```

读取方式（任意模块）：

```ts
const { apiKey, baseUrl, model, temperature, maxTokens, answerLanguage, autoCite } =
  useUiStore.getState().aiSettings;
```

实现请求层时建议：

1. 新建 `src/utils/aiClient.ts`（或 `src/services/ai/`）：封装 `chatCompletions` / `streamChat`，只读 `uiStore`。  
2. 校验：无 `apiKey` 时 toast「请先在设置中配置 API Key」，并可选 `openSettings()`。  
3. `answerLanguage` / `autoCite` 进 system prompt，勿另起一套设置 UI。

---

## 3. AI 提问 / 问答（待接请求）

### 3.1 规范要点（`UI_spec.md` §8.6 / §9）

- 气泡：用户右对齐（`--accent-subtle`），助手左对齐（`--bg-surface`）。  
- 助手消息操作：复制 / 引入批注 / 重新生成。  
- 流式：`status: 'streaming'` 时末尾光标；发送键变「停止生成」。  
- `aria-live="polite"`；完成后可播报「回答完成」（§11）。  
- 划词提问：引用块在气泡顶部；最多约 3 行折叠。

### 3.2 已有 UI 与钩子

| 路径 | 现状 |
|---|---|
| `src/features/reader/panels/QAPanel.tsx` | EmptyState + 输入框 + 发送（清空草稿，**无 API**）；离线禁用 |
| `src/features/reader/panels/SidePanel.tsx` | 上 QA / 下批注；顶栏「整理习得」 |
| `src/stores/readerStore.ts` | `pendingQaQuote`：划词「提问」灌入引用 |
| `src/features/reader/canvas/SelectionToolbar.tsx`（及调用链） | 提问 → `setPendingQaQuote` + 展开侧栏 |

### 3.3 类型（已定义，尚未落库）

```ts
// src/types/index.ts
type QaRole = 'user' | 'assistant';
type QaMessageStatus = 'pending' | 'streaming' | 'done' | 'error';

interface QaMessage {
  id: string;
  fileId: string;              // 一文件一会话
  role: QaRole;
  content: string;
  quotedText: string | null;
  quotedPage: number | null;
  createdAt: string;
  status: QaMessageStatus;
}
```

### 3.4 建议新增

| 项 | 建议 |
|---|---|
| `src/stores/qaStore.ts` | 按 `fileId` 加载/追加消息；`send` / `stop` / `regenerate`；`if (get().fileId !== fileId) return` 防串文件 |
| `src/db/qaMessages.ts` + IndexedDB **升版本** | object store `qaMessages`，index `by-file`；或单 key 存整段会话 JSON |
| `src/utils/aiClient.ts` | OpenAI 兼容 `POST {baseUrl}/chat/completions` + SSE/stream |
| 改 `QAPanel.tsx` | 渲染 `messages`；发送走 store；流式更新同一条 `assistant` 的 `content` |

发送时建议 payload 上下文：

1. system：角色 + `answerLanguage` +（若 `autoCite`）要求标注原文页/句。  
2. 可选：当前页附近正文 / 用户选中 `quotedText`。  
3. 历史：同 `fileId` 的 `QaMessage[]`（截断至 token 预算）。  
4. 批注摘要：见下一节（可选增强）。

**不要**在 `QAPanel` 内硬编码 Key；一律 `uiStore.aiSettings`。

---

## 4. 批注与上下文（问答输入）

### 4.1 已完成

| 路径 | 职责 |
|---|---|
| `src/types/index.ts` → `Annotation` | `quotedText` / `body` / `page` / `anchor` / `color` |
| `src/db/annotations.ts` | 按文件 CRUD、`listAllAnnotations` |
| `src/stores/annotationStore.ts` | 加载/新增划词批注/空白批注/更新/删除 |
| `src/features/reader/panels/AnnotationPanel.tsx` | 列表与编辑 |
| 划词工具条 | 「批注」→ 创建卡片并聚焦 |

### 4.2 与 AI 的联结方式（产品意图）

| 场景 | 建议 |
|---|---|
| 提问带引用 | 已有 `quotedText`；请求里作为 user 消息前置引用块 |
| 回答「引入批注」 | 助手气泡操作 → `annotationStore.addFromQuote({ quotedText: answerSnippet 或原文, body })` |
| 整理习得 | 输入 = 该文件全部 `QaMessage` + `Annotation`（§8.9） |
| 知识图谱 | 节点可来自文件；边可由「批注主题 / 文件相似度 / 共同引用」等由 **AI 离线任务** 产出 `GraphEdge`（前端只读） |
| 批注高亮层 §8.8 | 用 `anchor` 在 PDF Text Layer / EPUB 上着色；点击滚动到 AnnotationPanel（**独立于聊天**，但提升「引用可跳转」体验，建议与 `autoCite` 一起做） |

`listAnnotationsByFile(fileId)` / 未来 `listQaByFile(fileId)` 即 Digest 与建边的本地语料入口。

---

## 5. 整理习得 Digest（待接）

### 5.1 规范（`UI_spec.md` §8.9）

1. SidePanel 顶「整理习得」→ loading「整理中…」。  
2. AI 根据**当前文件**全部问答 + 批注 → 结构化 Markdown。  
3. Dialog 宽 760、高约 80vh，标题「阅读习得：{文件名}」。  
4. 支持复制全文、导出 `.md`；Esc / 右上角关闭。  
5. 离线：按钮 disabled + tooltip「需要连接 AI 服务」。

### 5.2 现状

`SidePanel.tsx` 仅 `toast.show('整理习得将在后续步骤接入')`。

### 5.3 建议实现

| 项 | 说明 |
|---|---|
| `src/features/reader/DigestDialog.tsx` | Dialog + Markdown 渲染（可先用轻量库或预格式化 `<pre>`，再换 react-markdown） |
| `qaStore` 或独立 `digestStore` | `runDigest(fileId)`；读 annotations + qaMessages |
| Prompt | 固定大纲（要点 / 疑问 / 待跟进），语言跟 `answerLanguage` |
| 导出 | `Blob` + `download` 文件名 `习得-{fileName}.md` |

可先做「非流式一次返回」，再与问答共用 `aiClient`。

---

## 6. 知识图谱 · 文件/关键词联结（当前可用，证据深化中）

### 6.1 产品边界

- 论文边由 AI 任务写入；关键词边由本地共现与 AI 语义评分共同写入；前端只展示、搜索、过滤，不提供手动连线（§13 决策4）。
- 节点：文件树派生 + 可选 tag；拖拽后可持久化 `x`/`y`。  
- 建边中：顶栏 32px 进度条（§6.4）。  
- 离线：只展示已有边，不重新计算（§14）。
- 当前详情面板展示摘要、关键词、关联论文、关系来源/理由，并可直接打开阅读器。
- 待深化：把批注、引用句和页码纳入边证据，并提供人工确认状态；在此之前不把关系表述为事实引用。分级结构与新 UI 的设计边界见 [Phase 003 知识图谱设计契约](./docs/plans/2026-08-02-003-knowledge-graph-UI-SPEC.md)。

### 6.2 类型（已有）

```ts
type GraphNodeKind = 'file' | 'folder' | 'tag';

interface GraphNode {
  id: string;
  fileId: string | null;
  label: string;
  kind: GraphNodeKind;
  fileType?: FileType;
  x: number | null;
  y: number | null;
}

interface GraphEdge {
  source: string;  // GraphNode.id
  target: string;
  weight: number;  // 0–1
}
```

### 6.3 AI 建边建议输入

本地可提供给建边任务的语料（均已有或即将有）：

- `FileNode` 元数据（`fileStore` / `db/files`）  
- 每文件 `Annotation[]`（正文 + 引用句）  
- 每文件 `QaMessage[]`（接入后）  
- 可选：文件全文抽取（PDF text layer / EPUB）——注意体积与隐私，默认本地

输出：`GraphEdge[]`（+ 可选 tag 节点）。**禁止**用随机/启发式边冒充「AI 已完成」。

### 6.4 UI 重建入口

见 [附录 B](#附录-b--知识图谱文件清单)。安装 **`react-force-graph-2d`**，禁止伞包 `react-force-graph`。

---

## 7. 建议实现顺序与 API 约定

### 7.1 推荐顺序

1. **`aiClient`** — 用设置里的 Key/URL/模型打通非流式 ping（如 `models` 列表或极短 completion）。  
2. **`qaStore` + IDB** — QAPanel 真发送 + 流式 + 停止；一文件一会话。  
3. **整理习得 Dialog** — 复用 client；依赖批注（已有）+ 问答（上一步）。  
4. **回答 → 批注**、**批注高亮层 §8.8** — 引用可跳转，服务 `autoCite`。  
5. **图谱画布重建** — 节点来自文件；边来自 AI 任务结果写入 store/IDB。  
6. （可选）后台「重新分析关联」触发建边，进度条绑 `buildProgress`。

### 7.2 OpenAI 兼容调用示意

```http
POST {baseUrl}/chat/completions
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "model": "{model}",
  "temperature": {temperature},
  "max_tokens": {maxTokens},
  "stream": true,
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "引用：...\n\n问题：..." }
  ]
}
```

流式解析 SSE `data: {...}`；用户点停止 → `AbortController.abort()`。

### 7.3 错误与空配置

| 情况 | UI |
|---|---|
| 无 apiKey | toast + 引导打开设置 |
| 网络错误 / 4xx/5xx | 该条 `status: 'error'`，可「重新生成」 |
| `!isOnline` | 已有：输入禁用；整理习得按钮一并 disabled |
| 空批注且无问答时点习得 | toast「暂无可整理的批注或问答」 |

---

## 附录 A · 个人仪表盘（已接会话）

> 仪表盘**已不再**依赖 `dashboardPlaceholders` 作为页面主数据源；读 `sessionStore` + `dashboardMetrics`。

| 项 | 路径 |
|---|---|
| 页面 | `src/features/dashboard/DashboardPage.tsx` |
| 指标卡 | `MetricCards.tsx`（当次+累计；色跟 `--accent`） |
| 热力图 | `ReadingHeatmap.tsx`（近 1 年） |
| 会话表 | `FocusSessionList.tsx`（24h / 7 天 / 30 天 / 全部） |
| 聚合 | `src/utils/dashboardMetrics.ts` |
| 会话 | `sessionStore` / `db/sessions.ts` / `ReadingSession` |

与 AI 弱相关：monitor 分心数据合并仍见 `PROGRESS.md` P1/P2；**不阻塞**问答接入。

`dashboardPlaceholders.ts` 可视为遗留，新功能勿再依赖。

---

## 附录 B · 知识图谱文件清单

### 已实现

| 项 | 路径 |
|---|---|
| 路由 lazy | `src/App.tsx` → `/knowledge-graph` |
| 侧栏 | `Sidebar.tsx` |
| 页面 | `src/features/knowledge-graph/KnowledgeGraphPage.tsx` |
| 画布 | `src/features/knowledge-graph/GraphCanvas.tsx` |
| 详情 | `src/features/knowledge-graph/GraphInspector.tsx` |
| 状态/持久化 | `src/stores/graphStore.ts`、`src/stores/keywordGraphStore.ts`、`src/db/graph.ts`、`src/db/keywordGraph.ts` |
| 类型 | `GraphNode` / `GraphEdge` / `KeywordNode` / `KeywordEdge`（`types/index.ts`） |

### 后续深化

```
批注/引用证据适配器、人工确认状态、关系重新分析进度条
```

```bash
npm install react-force-graph-2d
# 禁止：npm install react-force-graph
```

---

## 共用约定

- 与 `UI_spec.md` 冲突时先对齐产品，再改代码并回写规范或本文。  
- 颜色/间距只用 Design Tokens；单文件建议 &lt; 300 行。  
- Store 不互相 import；跨 store 用 `useXxxStore.getState()`。  
- 模块从占位变为可用后：更新本文状态表、`PROGRESS.md`、`README.md`。  
- 同一 bug 两次未修好 → `.cursorrules`「系统二」：假设 + 至少两方案。

## 相关链接

| 文档 | 用途 |
|---|---|
| [`UI_spec.md`](./UI_spec.md) §2.4 / §6 / §8.6–8.9 / §9 / §13 / §14 | 交互与模型权威 |
| [`PROGRESS.md`](./PROGRESS.md) | 总进度、P0 AI 待办 |
| [`docs/plans/2026-08-02-003-knowledge-graph-UI-SPEC.md`](./docs/plans/2026-08-02-003-knowledge-graph-UI-SPEC.md) | 五级数据层、视图与证据边界 |
| [`docs/plans/2026-08-02-003-knowledge-graph-plan.md`](./docs/plans/2026-08-02-003-knowledge-graph-plan.md) | 分阶段实现与验证计划 |
| [`docs/plans/2026-08-02-004-ui-system-UI-SPEC.md`](./docs/plans/2026-08-02-004-ui-system-UI-SPEC.md) | 全系统页面分级、表面层级、状态与动画契约 |
| [`docs/plans/2026-08-02-004-ui-system-plan.md`](./docs/plans/2026-08-02-004-ui-system-plan.md) | 全系统 UI 分阶段实现与验证计划 |
| [`monitor/README.md`](./monitor/README.md) | 行为检测（与聊天无关） |
| [`README.md`](./README.md) | 启动与排障 |
| [`.cursorrules`](./.cursorrules) | Agent / 工程习惯 |
