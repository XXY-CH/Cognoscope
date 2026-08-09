# Congnoscope 文档索引

Congnoscope 的产品目标是一个阅读优先、证据可回读、图谱可解释的本地研究工作台。当前文档按“权威契约 → 执行图 → 阶段计划 → 历史归档”组织。

## 当前权威

| 文档 | 用途 |
|---|---|
| [`../UI_spec.md`](../UI_spec.md) | 组件、字段、快捷键和基础交互规范 |
| [`plans/2026-08-04-005-research-environment-UI-EVIDENCE-SPEC.md`](plans/2026-08-04-005-research-environment-UI-EVIDENCE-SPEC.md) | 研究环境、证据边界和产品叙事总契约 |
| [`plans/2026-08-07-006-research-map-multiview-UI-SPEC.md`](plans/2026-08-07-006-research-map-multiview-UI-SPEC.md) | 资料、论证、比较、演化、探索五种地图视图的呈现权威 |
| [`GRAPH_ENGINEERING.md`](GRAPH_ENGINEERING.md) | 当前工程图、状态和验证门 |
| [`graph-engineering.json`](graph-engineering.json) | 机器可读的工程节点、依赖和证据 |
| [`agent-run-state.json`](agent-run-state.json) | 本轮 Agent Graph checkpoint；当前仅保留 MON-02 摄像头运行时阻塞 |

## 阶段计划

- `plans/2026-08-01-*`：证据矩阵和早期 UI 基础阶段，作为历史设计依据。
- `plans/2026-08-02-*`：知识图谱与系统 UI 首轮契约，图谱呈现部分由 Phase 006 取代。
- `plans/2026-08-04-*`：研究环境与依据总契约。
- `plans/2026-08-07-*`：多视图研究地图实现与验收计划。

## 归档

- [`archive/HANDOFF.md`](archive/HANDOFF.md)：2026-08-03 的 AI/图谱交接记录，只用于追溯，不作为当前状态依据。
- [`archive/AI_FEATURES_CHECKLIST.md`](archive/AI_FEATURES_CHECKLIST.md)：旧 AI 链路清单，只用于追溯；当前能力和缺口以 `PROGRESS.md`、源码与探针为准。

## 命名约定

产品展示名统一为 `Congnoscope`。`xuesen` 保留在启动脚本、npm package、IndexedDB/runtime 兼容路径中；`cognoscope` 保留为后端 Python 包名。这些是工程标识，不应再作为界面或当前文档标题中的产品名。

## 状态规则

静态 QA 通过不等于浏览器 QA 通过。涉及图谱、Reader、真实 PDF/EPUB、键盘、主题或响应式的节点，在没有 Chromium-compatible runtime 时必须标为 `blocked`，不得进入完整集成或 release；当前 RM-06、KG-06 和 P4 的真实浏览器门已通过。
