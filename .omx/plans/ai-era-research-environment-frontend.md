# AI 时代科研环境前端重构：共识实施计划

## 元数据

- 状态：初始共识计划（供 Architect/Critic 复核与执行阶段拆分）
- 需求权威：`.omx/specs/deep-interview-frontend-research-environment.md`
- 上下文：`.omx/context/frontend-research-environment-20260802T040505Z.md`
- 相关设计权威：`UI_spec.md`、`HANDOFF.md`、
  `docs/plans/2026-08-02-003-knowledge-graph-UI-SPEC.md`、
  `docs/plans/2026-08-02-004-ui-system-UI-SPEC.md`
- 计划范围：brownfield React 18/Vite 6 前端体验与本地研究工作流；本计划不改源码。

## 目标叙事

学森的第一屏和主要动线要表达“研究正在这里推进”，而不是把文件目录、图谱、矩阵和仪表盘并排展示成工具集合。研究者负责搜索/导入后的阅读与批注；环境在阅读结束后承担整理、跨论文比较、图谱维护、证据登记与反思提示。

```text
当前研究状态 → 打开/继续论文 → 安静阅读 + 批注
      → 会话结束后的 AI 整理 → 个人分层图谱 + 跨论文证据矩阵
      → 审阅冲突/回读原文 → 下一项研究决策
```

本阶段的两个主产物是：

1. 分层的个人研究图谱：同时容纳用户主动记录的研究立场，以及明确标记为“系统推断”的兴趣/盲点。
2. 跨论文综述与证据矩阵：每个可复用结论都保留原文定位、匹配方式和核验状态。

## 需求与硬边界

### 必须交付

- `/` 变为“当前研究状态”入口：活跃/最近阅读、待审阅证据、最近一次会话整理结果、偏向冲突线索和下一步动作。
- 阅读期间不弹出持续 AI 分析；离开阅读会话后生成可回读的整理摘要。
- 摘要把用户立场、系统推断、原文证据、直接保存项和待审阅线索分开呈现，不能只靠颜色区分。
- 单篇自动保存门槛是可解释的证据门槛：有可解析 locator、规范化主张能回到原文、有批注时无未解决冲突、状态可说明；不以隐藏概率替代规则。
- 跨论文共识至少覆盖 3 篇论文，并检查反例、研究方法差异和数据集独立性；出现反例即降级为“待审核/有争议”。
- 用户立场与系统推断冲突时，在会话结束后生成“偏向冲突 / 待审视”线索，保留冲突两侧和来源。
- 图谱是导航线索，不是引用数据库；证据矩阵仍是可引用材料的唯一核验入口。图谱边不可直接复制成引用。
- 图谱、证据矩阵、阅读器之间有“回读来源”和返回路径，缺失或过期 locator 显式显示为不可用。
- 本地优先、离线阅读/本地审阅、摄像头隐私、IndexedDB 持久化和现有 URL/ID 合同保持可用。
- 桌面、平板、390px 手机、键盘、触摸、`prefers-reduced-motion`、`prefers-reduced-transparency`、`prefers-contrast: more` 均保留层级和可读性。

### 明确非目标

- 外部论文检索、出版社集成、自动下载。
- TeX 上传分析、目标期刊格式检查、引用扫描/纠错、写作编辑器。
- 用图谱边替代证据矩阵，或把 AI 关系当作已验证事实。
- 阅读过程中的实时弹窗或持续分析。
- 本阶段新增持久化 `Project/Workspace` 实体；当前研究状态由已有文件、会话、批注、图谱和矩阵派生。未来是否需要项目模型以真实工作流验证后再决定。
- 未经单独决策的新组件库或动画依赖迁移。

## 现状证据与关键触点

| 领域 | 现状证据 | 计划影响 |
|---|---|---|
| 路由/外壳 | `src/App.tsx:1-111` 以 Data Router 组织 `/`、`/dashboard`、`/knowledge-graph`、`/trash`、`/evidence-matrix` 和 `/read/:fileId`；`src/components/layout/AppShell.tsx:1-91` 负责全局外壳 | 重排入口与页面叙事时保留现有 URL，增加支持性 `/library`，让 `/` 明确显示当前研究状态 |
| 文件与会话 | `src/types/index.ts:15-34` 的 `FileNode`；`src/types/index.ts:87-106` 的 `ReadingSession`；`src/hooks/useReadingSession.ts:20-114` 在挂载/卸载时创建和结束会话 | 用 `sessionId` 作为会话后整理的锚点，不在阅读期间启动新分析层 |
| 批注/定位 | `src/types/index.ts:185-204` 的 `Annotation`；`src/types/index.ts:207-256` 的 `EvidenceLocator`/`EvidenceItem` 已区分 PDF、EPUB 和 unresolved | 所有摘要候选和回读动作复用 locator，不允许无定位的“引用”状态 |
| 证据矩阵 | `src/types/index.ts:258-309` 的矩阵、行和分析模型；`src/stores/evidenceMatrixStore.ts:85-123` 已有可核验门槛、争议/未解析状态和 stale analysis 处理 | 直接保存/待审阅规则应接入既有 verification 生命周期，不另造“可信度分数” |
| 图谱 | `src/types/index.ts:341-443` 的 Graph/Keyword 记录；`src/stores/graphStore.ts:67-282` 和 `keywordGraphStore.ts:56-294` 使用 IndexedDB、本地共现和 AI 建边 | 加分层视图和证据桥接；旧记录缺少 `origin/reason` 时显示“来源未记录” |
| 阅读整理 | `src/utils/runDigest.ts:12-59` 目前输出非结构化 Markdown；`src/stores/qaStore.ts:1-176` 问答仍是内存态 | 扩展为结构化、可验证的会话后提议；保留 Markdown 导出作为辅产物 |
| 设计系统 | `src/styles/tokens.css:10-230` 已有颜色、间距、动效、触控和阅读尺寸 token；`src/index.css:12-83` 固定根滚动与焦点样式 | 复用 token，优先改语义和状态，不引入重型 UI/动画依赖 |
| 数据库 | `src/db/index.ts:138-223` 当前 v9，已有 files/sessions/annotations/bookmarks/graph/evidence stores | 只做 additive v10 迁移（研究信号/审阅线索），旧记录默认显式 unknown/unresolved |

## RALPLAN-DR

### Principles（原则）

1. **阅读优先且安静**：阅读时只有直接回应阅读动作的控件；整理和反思发生在会话边界，不抢占注意力。
2. **证据先于自动化**：可持久化的主张必须能回到原文；图谱关系是线索，证据矩阵核验后才可引用。
3. **研究者拥有最终判断权**：用户立场与系统推断语义分离；冲突进入可解释、可撤销的审阅队列，不能静默覆盖。
4. **本地优先与降级可用**：离线仍能阅读、批注、回看本地结果；AI 不可用时禁用新分析但不抹掉既有结果。
5. **空间连续的 Apple Design**：反馈即时，拖拽/Sheet 可中断，动效表达状态而非装饰；所有面板均可用键盘、触摸和减弱动效模式完成。

### Decision Drivers（决策驱动）

1. **可信度与可引用性**：必须保住已有 `EvidenceLocator`、verification 和 stale invalidation 契约。
2. **工作流连续性**：从当前状态进入论文，再回到摘要、图谱、矩阵和原文，不能靠用户记住不同工具的上下文。
3. **brownfield 风险与交付速度**：利用现有 Zustand/IndexedDB/路由/Token，避免大规模数据迁移或依赖升级导致的回归。

### Viable Options（可行方案）

#### A. 现有路由上的研究状态编排层（推荐）

在现有外壳和数据合同上增加当前研究状态首页、会话后整理和审阅线索；图谱/矩阵维持独立 URL，但用上下文参数/状态导航互相连接。新增研究信号与审阅线索为 additive 持久化记录，不创建项目实体。

- 优点：最大限度复用现有代码和数据；URL/ID 稳定；可按阶段交付并在真实阅读后验证。
- 代价：需要处理旧 `/` 入口语义变化，以及跨页面上下文传递；视觉连续性靠共享选择器和导航适配器实现。

#### B. 单一沉浸式工作台替换所有路由

把文件、阅读、图谱、矩阵和进展改成一个多栏工作台，路由只保留一个 shell。

- 优点：叙事最统一，跨模块切换最快。
- 代价：与当前 fullscreen reader、移动 Sheet、Data Router 和既有深链接冲突；大 diff、迁移风险和无障碍测试量高；容易把证据/阅读混在一起。当前阶段不选。

#### C. 引入持久化 Project/ResearchQuestion 模型后再重构

先建立项目/问题实体，让首页围绕项目工作区聚合所有资料。

- 优点：长期多项目隔离、研究问题和红/蓝海分析有清晰容器。
- 代价：用户明确把项目模型留到工作流验证后；需新增 IDB 迁移、导入/删除/权限边界，拖慢阅读到证据闭环。作为后续 ADR 议题，不进入本阶段。

**选择依据**：A 是唯一同时满足 `/` 当前研究状态、保留本地合同、避免新项目模型和分阶段验收的方案。B/C 不是不可行，而是违反当前范围/风险驱动，因此明确延后而非悄悄实施。

## 目标架构

### 数据与状态边界

- 现有 `FileNode`、`ReadingSession`、`Annotation`、`Evidence*`、`Graph*` 继续作为事实/源数据。
- 新增可选的 `ResearchSignal`（用户立场或系统推断）和 `ResearchLead`（偏向冲突、矛盾、反例、失效来源）类型；它们只引用文件/会话/批注/矩阵行 ID，不复制原文作为新的“事实源”。
- 研究信号与线索在 IndexedDB v10 以独立 object store 持久化；旧数据加载时默认为 `unknown`/`unresolved`，不迁移成已确认。
- 以 `src/utils/currentResearchState.ts` 一组纯函数组合 `FileNode[]`、`ReadingSession[]`、矩阵/行/分析和 `ResearchLead[]`，供首页和测试使用；不让一个 Zustand store 导入其他 store。页面按现有 selector 读取各 store，再调用纯组合器。
- 会话结束的整理请求生成结构化候选，先经过本地 locator/match/反例/冲突检查，再分为 `direct-save` 或 `review`；没有 AI/网络时不生成伪结果。
- 证据行被编辑后复用 `evidenceMatrixStore` 现有 stale-analysis 逻辑，并使引用它的研究线索降级为待核对。

### 信息架构与路由

- `/`：`CurrentResearchStatePage`，第一屏显示“现在研究到哪里、下一步做什么”。
- `/library`：`FileDirectoryPage`，支持导入、排序、搜索、批量入图和回收站入口；保留 `/trash`。
- `/dashboard`：降级为“专注进展/会话历史”支持页，不再承担当前研究首页叙事。
- `/knowledge-graph`：四个显式视图（概览/论文/主题/证据局部），保留现有图谱存储与三至五篇论文进入矩阵的动作。
- `/evidence-matrix` 与 `/evidence-matrix/:matrixId`：证据矩阵及 `研究结论与证据`、`局限与矛盾`、`研究空白与机会` 分析；保留可复制引用门槛。
- `/read/:fileId`：继续 fullscreen；可选 `matrixId/rowId` locator 查询和 `returnTo` 上下文，用于回读后返回原检查位置。阅读结束后导航到 `/`，并聚焦本次 `sessionId` 的整理卡片。
- 不改现有持久化 ID，不将旧 URL 重写成项目实体；`/` 语义变更是本 spec 的明确产品决策，原文件目录通过 `/library` 保留。

## 实施阶段

### Phase 0 — 研究环境契约与兼容层

**目的**：先锁定可信边界和状态形状，避免 UI 先做出会把 AI 猜测显示成事实的路径。

**触点**：`src/types/index.ts`；`src/db/index.ts`；新建 `src/db/researchSignals.ts`、`src/db/researchLeads.ts`；新建纯函数 `src/utils/currentResearchState.ts`、`src/utils/researchArtifactGate.ts`；必要时扩展 `src/utils/evidenceMatch.ts`、`src/utils/evidenceCitation.ts`。

**工作**：

1. 定义 `ResearchSignal`/`ResearchLead` 字段、provenance、source references、可编辑性和 `pending/accepted/dismissed/stale` 生命周期；定义 `DirectSaveReason`，以规则文字记录“locator、源文支持、无冲突、共识检查”。
2. 将 DB 版本从 v9 additive 升到 v10，创建研究信号和审阅线索 stores；不重写既有 records，旧图谱 `origin/reason` 缺失时返回显式 unknown。
3. 建立纯的单篇自动保存门槛与三论文共识门槛：检查反例、方法差异、数据集独立性；任一反例/未解决矛盾输出 review 状态。
4. 设计 `CurrentResearchStateSnapshot`（active reading、recent sessions、pending evidence、latest synthesis、leads、next actions）和失效来源归一化规则。

**验收**：

- TypeScript 类型能表达用户立场、系统推断、证据来源、冲突双方和可回读 locator；没有使用未解释的 probability 作为事实标签。
- v9 数据可打开；新 store 失败不阻塞阅读/矩阵加载；locator 不可解析的对象无法进入 verified/citation-ready。
- 纯函数测试覆盖单篇无歧义直存、批注/原文冲突、三篇共识、反例降级、方法/数据集不独立、来源删除/失效。

### Phase 1 — 当前研究状态首页与全局叙事

**目的**：把产品首屏从原始文件列表改成“回到研究”的工作入口，同时保留资料管理支持路径。

**触点**：`src/App.tsx`；`src/components/layout/AppShell.tsx`、`AppShellLayout.tsx`、`Sidebar.tsx`、`PageHeader.tsx`；新建 `src/features/research-state/CurrentResearchStatePage.tsx` 及 CSS/小组件；`src/features/file-directory/*`；`src/styles/tokens.css`、`src/index.css`。

**工作**：

1. 将 index route 指向当前研究状态页，新增 `/library` 指向现有文件目录；更新导航分组为“现在/资料/研究/进展”，不删除回收站和旧深链接。
2. 用 Phase 0 的纯 snapshot 组装“继续阅读”“最近读完”“待审阅证据”“最新整理”“偏向冲突/待审视”“下一步”六类内容。每项都标明来源类型和状态，并提供明确 primary action。
3. 让状态页在数据加载、空状态、AI 离线、矩阵失败、来源失效时局部降级；不要用整页 spinner 或占位营销 copy 取代已有内容。
4. 保留 PageHeader slot/shortcut/settings/offline banner 合同；导航切换后焦点回到页面标题或主动作，移动端只用现有 drawer/focus trap 模式。

**验收**：

- 新用户无数据时知道下一步是导入/打开本地文献；回访用户第一屏能看到 active/recent reading、待审阅数量和最近整理结果，文件列表不再是唯一/主信号。
- 点击“继续阅读”保留 reader route，点击矩阵/图谱项能带上 matrix/lead context；从 `/library` 原有导入、批量操作、回收站入口可用。
- 390/768/1280 视口无页面级横向溢出；键盘可访问所有 action，状态信息不用颜色单独表达。

### Phase 2 — 阅读边界与会话结束整理

**目的**：阅读时保持专注，结束后让环境自动接管整理并把结果落入可审阅工作流。

**触点**：`src/features/reader/ReaderPage.tsx`、`ReaderTopBar.tsx`、`DigestDialog.tsx`、`panels/AnnotationPanel.tsx`、`panels/QAPanel.tsx`；`src/hooks/useReadingSession.ts`；`src/utils/runDigest.ts`、`digestPrompt.ts`、`loadDocumentTranscript.ts`、`aiChat.ts`；新建 `src/features/research-state/PostReadingSummary.tsx`；`src/stores/researchLeadStore.ts`（或等价独立 store）。

**工作**：

1. 保留 `/read/:fileId` fullscreen 和选词/批注/书签体验；把会话结束钩子接到已有 `useReadingSession` cleanup，使用真实 `sessionId`，而不是在阅读期间定时弹出总结。
2. 将 `runDigest` 从“只返回 Markdown”扩展为结构化提议（原文主张、引用 locator、用户批注关联、研究信号、跨论文候选、冲突/反例标记），保留 Markdown 作为导出视图。解析失败时保留原摘要为未结构化草稿，不自动直存。
3. AI 提议先经过 `researchArtifactGate`：满足 locator + 源文支持 + 无未解决矛盾的单篇项目可直存；跨论文必须 3 篇且完成反例/方法/数据集检查；否则写入 `ResearchLead` review queue。
4. 会话结束后导航 `/` 并聚焦本次 summary；用户可在状态页稍后查看、回读原文、接受/拒绝/编辑线索。AI 不可用时显示“等待整理/离线”，不生成占位结论。
5. 把 authored stance 与 inferred signal 用语义标签、图例和结构化字段区分；冲突默认生成“偏向冲突 / 待审视”，接受/拒绝可撤销且不会覆盖原信号。

**验收**：

- 进行阅读和批注时不存在 live AI popup；离开阅读后出现与 `sessionId/fileId` 对应的 summary，刷新后仍可从当前状态页返回。
- 一条有定位、源文匹配、无冲突的单篇提议可显示“已保存”；缺定位、批注与原文冲突、跨论文少于三篇或含反例的提议显示“待审阅/有争议”，并列出原因。
- 偏向冲突条目同时展示 authored/inferred 两侧及来源，并可分别打开原文；AI 推断不能变成 authored/verified 而不经显式操作。
- AI 离线或配置缺失时既有批注和已保存矩阵仍可阅读；仅新分析动作禁用并给出可理解状态。

### Phase 3 — 图谱分层与证据桥接

**目的**：把图谱从并列双画布升级为可解释导航，并将选中节点连续桥接到证据矩阵和原文。

**触点**：`src/features/knowledge-graph/KnowledgeGraphPage.tsx`、`GraphCanvas.tsx`、`GraphToolbar.tsx`、`GraphInspector.tsx` 及 CSS；`graphFilters.ts`；`src/stores/graphStore.ts`、`keywordGraphStore.ts`；`src/db/graph.ts`、`keywordGraph.ts`；`src/features/evidence-matrix/*`；reader locator adapter。

**工作**：

1. 以既有记录投影出 L0 研究范围、L1 文献、L2 概念、L3 证据锚点、L4 综合判断；L3/L4 不进入全局力导图，只在 inspector/矩阵显示局部链接。
2. 提供 `概览/论文/主题/证据` 视图和范围/层级/来源/状态过滤；搜索只作用于当前投影，切换视图保留范围和 selected node。
3. inspector 固定顺序为 identity → relation origin/reason/status → metadata preview → evidence anchors → `打开阅读`/`回读来源`/`加入证据矩阵`；旧记录显示 `来源未记录`，失效 locator 禁用 copy/jump。
4. 复用现有 `GraphNode`/`GraphEdge`/`KeywordNode`/`KeywordEdge` 和坐标持久化；边仍只读，禁止手动建边/删边。图谱进入矩阵只传三至五个 file IDs，不把关系当作已确认证据。
5. 在移动端将 inspector 变为 focus-managed Sheet；`Escape` 先关 inspector，再清 selection；返回动作恢复触发节点或矩阵行上下文。

**验收**：

- 旧 graph records 无迁移错误，缺 origin/reason 时可见 `来源未记录`；切换四个视图不复制/重载持久化记录。
- 图谱节点 → evidence anchor → `/read/:fileId?matrixId=&rowId=` 可完成回读；来源失效时关系保留但不可复制/跳转。
- 选择三至五篇论文进入矩阵时，矩阵仍使用现有核验生命周期；图谱边永远不是 citation-ready。
- 390/768/1280 视口、键盘 Escape/焦点恢复、loading/analyzing/empty/no-match/offline/error/stale selection 状态均可用。

### Phase 4 — 证据矩阵与研究状态闭环

**目的**：让矩阵和研究状态成为可以反复回访的研究记忆，而不是一次性 AI 结果页。

**触点**：`src/features/evidence-matrix/EvidenceMatrixPage.tsx`、`EvidenceRowEditor.tsx`、`EvidenceAnalysisPanel.tsx` 及 CSS；`src/stores/evidenceMatrixStore.ts`；`src/utils/evidenceParse.ts`、`evidenceAnalysisParse.ts`、`evidenceCitation.ts`、`evidenceAnalysisCitation.ts`；`src/features/research-state/*`。

**工作**：

1. 明确三类矩阵分析 `研究结论与证据`、`局限与矛盾`、`研究空白与机会` 的来源 row IDs、核验状态和回读动作；不复制图谱边为证据。
2. 把 row/analysis 编辑、证据替换、来源删除、locator 失效统一接入 stale invalidation；依赖行发生变化时研究状态页显示“需要重新核对”。
3. 提供从状态页/图谱进入矩阵和从矩阵回到原文/图谱的双向路径；保留 copy citation 仅对 verified 且 locator 可解析的项目开放。
4. 为没有矩阵/没有 AI/没有本地源的状态提供局部 empty state 和未来入口文案，但不渲染外部检索/TeX 半成品控件。

**验收**：

- 研究状态页能展示最新矩阵分析和 pending/disputed/stale 数量；编辑/删除一条证据后，依赖分析和线索被降级，刷新后仍一致。
- verified row/analysis 的引用可复制并带 locator；proposed/disputed/unresolved、图谱 relation、失效源均不可冒充 citation-ready。
- 用户从任意矩阵行可回读 PDF 页/EPUB CFI，并能返回原矩阵行；缺 locator 有明确原因和替代查看路径。

### Phase 5 — Apple Design 统一与验证闸门

**目的**：把行为、材料、排版和可访问性统一到同一环境语言，随后用浏览器验证真实工作流。

**触点**：`src/styles/tokens.css`、`src/index.css`、`src/components/common/*`、`src/components/layout/*`、所有 Phase 1-4 新/改 CSS Modules；现有 `scripts/probe-evidence-matrix.mjs`、浏览器探针或新建跨路由 probe。

**工作**：

1. 复用现有 token；仅补充语义 token（research state、provenance、review、source stale）和尺寸，不在组件 CSS 写硬编码颜色/间距/时长。
2. 交互按 Apple Design：pointer-down 反馈、拖拽 1:1/pointer capture、Sheet 从触发源进入并可中断、只对惯性手势使用轻微 bounce；页面切换用 compositor transform/opacity，禁止把动画当装饰。
3. 对 translucent toolbar/sheet 设置层级、`prefers-reduced-transparency` 实心降级；`prefers-reduced-motion` 用 cross-fade/static；高对比模式提高背景/边框对比；按钮和节点 touch target ≥44px。
4. 浏览器验证：真实或最小本地 PDF fixture 走“状态 → 阅读/批注 → 离开 → 摘要 → 图谱 → 矩阵 → 回读”全链路；桌面 1280×800、平板 768×1024、手机 390×844，浅/深色、离线、空/加载/错误/失效状态。
5. 运行 `npm run lint`、`npm run build`、`git diff --check`、`node scripts/probe-evidence-matrix.mjs`；修复本次新增诊断。若 `probe-blank.mjs` 仍写死 Windows Edge，改为跨平台可配置探针，或记录为明确遗留风险。

**验收**：

- 所有主路径可通过键盘和触摸完成；焦点不陷入隐藏 Sheet，Escape/返回焦点稳定。
- reduced motion/transparency/high contrast 下仍能辨识状态、来源和下一步；没有页面级横向滚动或文本遮挡。
- lint/build/diff/probe 全部通过（允许并记录既有 warning）；浏览器记录每个 acceptance criterion 的证据，才可进入提交/远端推送。

## 依赖与并行安排

```text
Phase 0 契约/门槛
       ├──> Phase 1 当前状态首页
       └──> Phase 2 会话后整理
                └──> Phase 3 图谱证据桥接
Phase 3 ────────> Phase 4 矩阵闭环
Phase 1-4 ──────> Phase 5 统一动效/浏览器验证
```

- Phase 0 必须先完成；它决定所有 UI 的状态文案和直存/审阅边界。
- Phase 1 与 Phase 2 可由两个执行 lane 并行，但共享 `types/index.ts` 和 route contracts 时由契约 owner 先落地并在合并时复核。
- Phase 3 依赖 Phase 0 的 source references；Phase 4 依赖 Phase 3 的返回/回读适配器。
- Phase 5 不应提前替换组件库或动画依赖；它是所有功能路径稳定后的统一 craft/QA pass。

## 风险与缓解

| 风险 | 影响 | 缓解/退出条件 |
|---|---|---|
| AI 输出结构化解析失败或模型不遵循 schema | 错误主张进入持久化 | schema parse 失败只保存草稿；所有直存由本地 gate 决定；保留原始提议供审阅 |
| locator 在 PDF/EPUB 间不可互换或源被删除 | 引用链断裂 | `EvidenceLocator` 显式 kind/unresolved；删除源先降级依赖项；禁用 copy/jump 而不隐藏关系 |
| `/` 入口变化破坏用户习惯/旧深链接 | 回归与迷路 | 新增 `/library`；保留所有既有 route/ID；reader invalid file 回到 `/` 状态页并有资料库入口 |
| 新研究信号/线索 store 与 v9 IDB 不兼容 | 数据丢失/黑屏 | v10 只创建新 stores；旧记录 optional/default unknown；迁移失败不阻塞文件/reader 读取 |
| 通过“研究状态”增加过多卡片和仪表盘感 | 叙事仍像工具集合 | 首页只显示有限 next actions、来源和状态；用列表/时间线而非装饰卡片堆；真实阅读路径作为首要测试 |
| 跨论文共识误把相似方法当共识 | 研究判断失真 | 最少三篇 + counterexample/method/dataset gates；任一反例进入 disputed；展示检查原因 |
| 视觉重构造成交互/无障碍回归 | 移动/键盘不可用 | 先保持 common primitives；每阶段跑 390/768/1280、focus trap、Escape、reduced modes；无新增依赖 |
| 现有 AI 配置/离线状态与新入口不同步 | 用户以为环境坏了 | 复用 `uiStore` AI config/online 状态；显示“既有结果可读，新分析需连接 AI” |
| 多 store 并发请求产生 stale summary | 旧结果覆盖新结果 | 使用 sessionId/request nonce/AbortController；结束后只接受当前 file/session；复用 evidence store 的 epoch/queue 模式 |

## 验证计划

### 纯单元/函数验证

- `currentResearchState`：active/recent/pending/latest/lead/next action 的排序和空状态。
- `researchArtifactGate`：单篇 locator、源文匹配、批注冲突；三篇、反例、方法差异、数据独立性；来源失效。
- 旧 Graph records 的 unknown defaults、分层 projection、过滤、节点/anchor 上限。
- `ResearchSignal`/`ResearchLead` 状态转换：accept/reject/edit/dismiss 可逆，不能越权改变 authored/inferred provenance。

### 集成验证

- v9 IndexedDB fixture 打开新版本；新增 stores 可读写；reader、matrix、graph 在 AI/offline 下仍可用。
- 会话 cleanup → structured summary → direct-save/review store → current state reload。
- matrix row 更新/删除 → analysis/lead stale；reader locator 跳转和返回上下文。

### 浏览器 E2E / 手工验收

1. 首次空库：`/` → `/library` 导入 fixture → 状态页显示可继续阅读动作。
2. 阅读 PDF：打开 → 选词批注 → 离开 → summary 显示 evidence/stance/inference → 回到原文。
3. 三篇比较：生成候选 → 无反例且证据可定位才直存；含反例显示 disputed review → 矩阵核验后可复制引用。
4. 图谱：概览/论文/主题/证据视图 → inspector → `回读来源` → 返回原选择；来源删除显示 stale 且不能复制。
5. 视口/主题/状态矩阵：390×844、768×1024、1280×800；light/dark；loading/empty/no-match/offline/error/stale；keyboard focus/Escape。

### 质量闸门

```text
npm run lint
npm run build
git diff --check
node scripts/probe-evidence-matrix.mjs
```

`probe-blank.mjs` 当前写死 Windows Edge 路径（已有项目风险）；在 Phase 5 改为可配置浏览器路径或用 Codex 内置浏览器替代，并把结果写入验证记录。

## 交付与回滚策略

- 每个 phase 一个小而可回退的提交；先提交契约/纯函数，再提交页面，最后提交视觉和探针。
- 新 route 和新 object store 都 additive；若某阶段失败，回滚该阶段页面接线仍保留旧 reader/graph/matrix stores。
- 不执行 destructive DB reset；fixture 仅使用明确的临时文件/浏览器 profile。
- UI 先以旧页面作为 fallback，在 `CurrentResearchStatePage` 数据失败时提供 `/library`、`/dashboard` 和既有矩阵链接。

## ADR — 采用“现有路由上的研究状态编排层”

### Decision

采用 Option A：保留现有 Data Router、fullscreen reader、Zustand stores、IndexedDB records 和证据矩阵核验边界；新增当前研究状态首页、会话后结构化整理、研究信号/审阅线索的 additive 持久化，以及图谱到证据/原文的连续导航。

### Drivers

- 研究者必须把主要注意力留给阅读和批注。
- 任何可引用结论都必须保留 source locator、match 和 verification。
- 当前版本已拥有可复用的 reader/session/annotation/graph/evidence 基础，项目模型和外部能力明确延后。

### Alternatives considered

- 单一多栏工作台：叙事统一，但破坏 fullscreen reader、移动 Sheet、深链接和局部降级边界，回归面过大。
- 新建 `Project/Workspace` 持久化实体：适合长期多项目，但未被本阶段需求授权；会引入迁移、归属和删除语义，阻塞 reading-to-evidence 闭环。
- 只改视觉、不新增结构化信号/线索：风险低但无法表达 authored/inferred 冲突，也无法让 AI 的脏活落地为可审阅研究资产。

### Why chosen

Option A 是在不弱化证据真实性、不引入项目模型、保留离线能力的前提下，能在本阶段交付完整闭环的最小架构变化。通过独立的研究信号/线索记录承载反思结果，而不是把推断塞进图谱边或 evidence row，可让用户区分“我的判断”“系统提示”和“已核验材料”。

### Consequences

- `/` 的语义从文件目录变为当前研究状态；文件目录移至 `/library`，需更新导航和 reader fallback。
- 新增 v10 object stores 和结构化 gate，但不会迁移/覆盖旧数据。
- 图谱、矩阵、reader 仍是不同 route，连续性由 context 参数、纯 snapshot selectors 和 source adapters 提供，而不是大一统 shell。
- AI 仍可能生成无法解析的草稿；产品必须持续展示“不确定/待审阅”，而不能为了顺滑度自动提升状态。

### Follow-ups

- 在真实阅读闭环验证后，再决定是否引入项目/研究问题层。
- 后续 phase 另行规划外部检索/下载、TeX/期刊检查和写作交付，不在本计划中埋半成品入口。
- 真实模型 schema、单篇专业阈值的领域校准和跨数据集独立性判断需与目标学科样例共同评审。

## 初步架构复核与批评要点

### Architect antithesis

最大的反论是：增加 `ResearchSignal`/`ResearchLead` 记录和 v10 stores 可能过早固化一个尚未由真实用户验证的研究模型；如果实际使用者只需要矩阵，新增模型会增加迁移与维护成本。对此保留 additive、可选、只引用既有 ID 的最小字段，并要求 Phase 0 纯 gate/状态页先用 fixture 验证；若真实会话无法产生可行动线索，Phase 2 可退回 transient draft，不得扩张为项目模型。

### Trade-off tension

“自动替用户整理”与“研究者最终控制”天然冲突：更激进的直存减少脏活，但提高错误主张进入个人图谱的风险。因此本计划把自动化预算放在候选生成、来源定位、冲突检测和排序；持久化 verified/citation-ready 仍由解释性 gate 与用户核验共同决定。

### Critic checklist

- 原则与选项一致：Option A 保留 reader/evidence 边界，没有用视觉连续性掩盖证据弱化。
- 替代方案有明确失效原因，不以“更统一/更快”作为无界理由。
- 每个阶段都有文件触点、输入/输出和可测验收，不以“优化体验”作为唯一标准。
- 风险均有可执行缓解和回滚路径；新增 v10 stores 不会阻塞旧数据加载。
- 验证覆盖纯规则、IDB 兼容、跨路由集成、浏览器状态和可访问性。

### 复核后必须落实的修正

以下修正是架构与质量复核的强制结论，执行阶段不得把它们降级为视觉
偏好：

1. **会话结束必须是显式可测试的编排动作。** `useReadingSession` 当前以
   cleanup 结束会话；若直接在 cleanup 中启动 digest，路由卸载、React
   Strict Mode 和不稳定 callback 可能触发重复请求或拿不到真实 `sessionId`。
   Phase 2 必须提供稳定的 `finishReadingSession`/等价命令，写入结束状态
   后再排队结构化整理；cleanup 只作兜底，且以 session nonce 去重。
2. **可引用直存只允许 resolved locator。** `unresolved` 可以被保存为带
   原因的草稿或待审阅线索，但不得进入 `verified`、`citation-ready` 或
   可复制引用包。来源本身存在但定位适配器暂时失败时，保留内容并显示
   `来源失效/待核对`，不能静默丢弃。
3. **研究线索状态必须包含争议和失效。** `ResearchLead` 至少区分
   `proposed`、`review`、`accepted`、`dismissed`、`disputed`、`stale`；
   `edited` 是内容编辑状态，不应替代证据争议状态。来源删除、证据行
   修改或图谱关系失效都要有明确降级路径。
4. **推断信号不能只有一个裸置信度。** `ResearchSignal` 需要保存观察
   时间窗、支持它的 session/annotation/source refs、推断原因和可读状态；
   UI 可以显示强弱等级，但不把模型概率呈现成研究事实。
5. **会话首页只使用真实数据。** `CurrentResearchStateSnapshot` 必须过滤
   demo/placeholder session，并把“尚无本地研究数据”和“AI 尚未整理”
   分开；不能复用仪表盘的占位数字制造研究进展感。
6. **共识检查失败时保持保守。** 无法判断方法差异、数据集独立性或反例
   是否存在时，结果进入 `review/disputed`，而不是按“未发现反例”直接
   直存。共识检查原因要进入审阅面板，便于用户追溯和纠正。
7. **引用包必须携带结论本身。** verified 行复制/导出至少包含结论、来源
   身份、resolved locator、原文摘录、可选批注上下文和核验状态；图谱边
   和 unresolved 行不能产生 citation-ready 包。

## 执行 staffing 建议（供后续 `$ralph` / `$team`）

### Available-agent-types roster

- `architect`：Phase 0 数据/路由边界与迁移审查（high）。
- `executor`：Phase 1-4 功能实现（high；按 lane 分文件所有权）。
- `designer`：Phase 1/5 信息架构、Apple Design 材料/动效和 responsive contract（high）。
- `test-engineer`：Phase 0/5 纯函数、IDB 兼容、浏览器验收矩阵（medium/high）。
- `verifier`：每 phase 完成证据与 acceptance trace（high）。
- `code-reviewer`：合并前跨模块 provenance/回归审查（high）。

### Ralph staffing（单 owner 顺序闭环）

1. `executor`（high）按 Phase 0 → 4 顺序执行，每阶段先写测试/selector，再接 UI。
2. `designer`（high）在 Phase 1 和 Phase 5 做契约/视觉复核，不直接改数据层。
3. `test-engineer`（medium）在 Phase 0、2、3、5 运行规则/集成/浏览器验证。
4. `verifier`（high）在每个 phase 结束检查 acceptance trace、旧数据和离线降级。

### Team staffing（并行 lanes）

- Lane A：`executor`（high）负责 Phase 0 `types/db/gates`，拥有共享契约文件。
- Lane B：`executor`（high）负责 Phase 1 `research-state`、`App.tsx`、layout；等待 Lane A 类型完成。
- Lane C：`executor`（high）负责 Phase 2 reader/session/digest/lead UI；与 B 并行但不修改 B 页面文件。
- Lane D：`executor`（high）负责 Phase 3 graph inspector/projection；Phase 0 后开始。
- Lane E：`test-engineer`（medium）维护纯函数 fixture 和 browser probes；在各 lane 接口稳定后接入。
- Lane F：`designer`（high）做 Phase 5 token/motion/accessibility pass；不得引入新依赖。
- `verifier`（high）作为 team-verify owner，按本计划的全链路脚本和 390/768/1280 矩阵验收。

### Launch hints

```text
$team "按 .omx/plans/ai-era-research-environment-frontend.md 执行；先 Lane A 契约，随后并行 B/C/D，最后 F 与 E 验证"
```

在 OMX CLI runtime 中也可用：

```text
omx team --prompt "Execute .omx/plans/ai-era-research-environment-frontend.md with the lane ownership and verification path in the plan"
```

### Team verification path

1. Lane A 证明 v9 fixture 可读、gate 规则和旧 graph defaults 的纯测试通过。
2. Lane B/C/D 分别提供当前状态、会话后整理、图谱回读的 browser evidence；不以截图代替 locator/verification 断言。
3. Lane E 运行 `npm run lint`, `npm run build`, `git diff --check`, evidence probe 和跨视口脚本。
4. `verifier` 合并 acceptance trace 后才关闭 team；若失败，回到所属 lane 修复，不由视觉 lane 绕过证据 gate。
5. Ralph/leader 在 handoff 后复核工作树、远端分支和最终 smoke test，确认无新增 warning/error。

## 改进记录

- 初稿将用户访谈中的“当前研究状态”首屏、阅读结束摘要、偏向冲突线索、三论文共识门槛和 TeX/外部检索非目标写成硬验收。
- 将现有 `EvidenceLocator`、`evidenceMatrixStore` stale invalidation、图谱双 store 和 `useReadingSession` 作为实现锚点，避免重新发明事实源。
- 将潜在的项目模型降为 follow-up，并把结构化研究信号/审阅线索限制为 additive、可回溯记录。
- 复核后补充显式会话结束编排、resolved locator 直存门槛、`disputed/stale`
  线索生命周期、推断信号观察窗口、真实数据过滤、保守共识失败策略和
  包含结论的引用字段，避免实现阶段把副作用或概率误当成事实。
