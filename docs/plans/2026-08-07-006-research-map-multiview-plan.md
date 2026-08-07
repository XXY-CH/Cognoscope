---
title: Phase 006 Research Map - Execution Plan
type: feature/design
phase: 006
date: 2026-08-07
status: ready
design_contract: docs/plans/2026-08-07-006-research-map-multiview-UI-SPEC.md
---

# Phase 006 - 多视图研究地图执行计划

## Goal

把现有“论文/关键词全局力导图”收敛为一套可解释、可扩展的研究地图：
资料地图负责发现，论证视图负责关系解释，证据矩阵负责核验，判断时间线
负责记录研究判断变化；局部探索模式保留 Obsidian 式直接操作。

## Scope

- 图谱关系投影适配器和最小语义合同；
- `资料`、`论证`、`比较`、`演化`、`探索` 五个图谱内部视图；
- 统一导引栏、视图切换、检查器和响应式呈现；
- 证据锚点、矩阵行、来源失效和 Reader 回读的状态传播；
- 纯投影测试与浏览器验收计划。

## Non-goals

- 外部检索、下载或自动综述写作；
- 把 AI 关系直接升级为科学事实；
- 重写 IndexedDB 全部图谱数据；
- 新增 UI/动画依赖；
- 把摄像头或阅读行为写入科学关系；
- 在图谱页复制证据矩阵编辑器。

## Execution DAG

```text
RM-00 设计契约与视图决策 (done)
  |
  v
RM-01 关系语义与投影适配器
  |
  +--> RM-02 论证视图
  +--> RM-03 资料分层视图
  +--> RM-04 比较/演化视图
              |
              v
        RM-05 局部探索与性能上限
              |
              v
        RM-06 浏览器/数据/无障碍 QA
```

RM-02、RM-03、RM-04 在 RM-01 完成后可并行；RM-05 需要至少一个稳定投影；
RM-06 等待所有视图收敛。浏览器门与静态门必须分开记录。

## Work packages

### RM-01 - 关系语义与投影适配器

**Ownership:** `src/types/index.ts`, `src/utils/graphEvidence.ts`,
`src/features/knowledge-graph/graphFilters.ts`, focused DB selectors/tests.

**Deliverables:**

- 定义 `relationType`、`status`、`origin`、`evidenceAnchorIds`、`evidenceRowIds`；
- 旧 `GraphEdge` / `KeywordEdge` 映射到 `relates`、`mentions` 或 `unknown`；
- 保持图谱与证据矩阵各自的事实源，使用稳定 ID 引用；
- 统一来源失效、定位不可回读和待核对状态。

**Acceptance:**

- 同一关系可以被资料图、论证图和检查器投影而不复制文本；
- 旧记录可读且显示 `来源未记录`；
- 没有 locator 的关系不能进入 citation-ready 输出。

### RM-02 - 论证视图

**Ownership:** `src/features/knowledge-graph/KnowledgeGraphPage.tsx`,
new pure selectors and small view components, `GraphInspector` styles.

**Deliverables:**

- 研究问题选择器、主张泳道、支持/反驳/条件/局限关系；
- 选中主张后的局部证据锚点列表；
- “查看证据”“回读来源”“加入证据矩阵”动作。

**Acceptance:**

- 默认只呈现当前研究问题的有限主张和证据；
- 每条关系在选中或检查器中显示类型、理由、来源和状态；
- AI 候选关系与已核验证据视觉上明确分离。

### RM-03 - 资料分层视图

**Ownership:** `GraphCanvas.tsx`, graph projection selectors and graph CSS.

**Deliverables:**

- 研究范围、主题簇、论文、方法/数据集的稳定层级布局；
- 簇折叠、局部展开、搜索和 scope 保留；
- 大范围超过节点上限时转为簇/列表，不放大整个画布。

**Acceptance:**

- 默认不会渲染无限全局力导图；
- 论文与主题的关系仍可双向高亮并回到阅读；
- 拖拽只改变展示位置，不改变科学关系。

### RM-04 - 比较与演化视图

**Ownership:** graph-to-matrix bridge, research-state selectors, timeline view.

**Deliverables:**

- 主张 × 论文的矩阵摘要，链接到 `/evidence-matrix`；
- 草案 -> 有证据 -> 条件化 -> 反例 -> 当前判断 -> 待审视时间线；
- 每个变化点保留触发论文、证据 ID 和回读入口。

**Acceptance:**

- 图谱页不出现第二套矩阵编辑逻辑；
- 判断版本变化可追溯到证据，而不是 Git/commit；
- 来源失效会让相关判断回退到待审视/待核对。

### RM-05 - 局部探索与性能上限

**Ownership:** local force explorer, interaction and motion probes.

**Deliverables:**

- 选中节点一到两跳的局部力导向图；
- 30 节点目标上限、缩放边界、拖拽持久化和减少动效降级；
- 线索/核验图例和可访问列表替代。

### RM-06 - QA 与集成

**Ownership:** static probes, browser QA, integration evidence and docs state.

**Required gates:**

- build, lint, diff check, pure projection tests;
- 390/768/1280 视口、键盘焦点、主题、离线、来源失效；
- 真实 PDF/EPUB 的 graph -> evidence -> reader 回读；
- `AG-QA.static` 与 `AG-QA.browser` 分别记录，浏览器不可用时不宣称完成。

## Rollback

- RM-01 失败：保留旧图谱记录，仅显示导航线索和 `来源未记录`；
- 任一新视图失败：隐藏该视图入口，保留 `资料` 视图和矩阵路由；
- 证据桥失败：禁用复制/回读动作，不删除已有证据或图谱记录；
- 性能超限：退回簇/列表投影，不提高全局画布节点上限。

## Definition of done

Phase 006 只有在 RM-01 到 RM-06 的 acceptance、静态门和浏览器门都满足后，
才能从 `design` 进入 `implemented`。设计文档完成本身只关闭 RM-00，不关闭
任何运行时 QA 节点。
