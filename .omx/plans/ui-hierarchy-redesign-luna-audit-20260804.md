# Luna audit — UI hierarchy redesign

Date: 2026-08-04
Mode: read-only review; no source files changed

## Findings

### IA and surface hierarchy

- `Sidebar.tsx` exposes six equal destinations across four groups, while
  Phase 005 defines four primary research workspaces: 阅读、证据、图谱、成果.
- `CurrentResearchStatePage` currently stacks intro actions, current focus,
  next-step queue, four metrics, post-reading summary, lead review, recent
  sessions, and a status strip. It reads as a dashboard rather than a focused
  research landing surface.
- `KnowledgeGraphPage` renders equal paper and keyword force canvases. This
  hides the paper -> concept -> evidence hierarchy and makes two navigation
  surfaces compete.
- `EvidenceMatrixPage` renders nested row editor cards and an analysis panel;
  it does not expose claim x paper geometry or a bounded source inspector.

### Academic semantics

- AI vocabulary has more visual salience than scholarly states: Sparkles,
  “生成证据提议”, “AI 原始提议”, “研究分析草稿”, and “AI 语义”. The UI should
  lead with 支持、反驳、条件化、未涉及、待核对 and keep provenance secondary.
- Graph `weight` is currently presented as 强/中/弱关系线索. It is lead
  strength only and must never read as evidence confidence or probability.
- Graph types remain `file | folder | tag`; edge records have weight/origin/
  reason but no source status or locator. Keep legacy data readable and project
  L0-L2 on the canvas; keep L3 evidence anchors and L4 synthesis in the
  inspector/matrix until a deliberate model migration is approved.
- Evidence items already carry file, excerpt, locator, provenance, match, and
  verification. The matrix UI should project those fields rather than create a
  second fact source.

### Target acceptance

- Primary navigation has no more than four research workspaces plus separated
  utility links. Each primary route has one dominant surface and action.
- Graph uses one canvas with `概览 / 论文 / 主题 / 证据`, stable positions, caps
  of about 80 nodes / 160 edges (20 local evidence anchors), explicit origin and
  evidence state, and guarded source-return actions.
- Matrix at desktop shows a fixed claim column, paper columns, and source
  inspector. Mobile/tablet keeps claim identity visible and uses a source sheet;
  no page-level horizontal overflow.
- Status is conveyed by text/icon/shape in addition to color. Card nesting is at
  most one layer; no decorative gradients, glow, Sparkles ornament, or ambient
  motion. Reduced motion preserves feedback while removing travel.
- Copy remains `主张 -> 原文摘录 -> 论文 -> 页码/定位`; stale or unavailable
  locators demote the material to review and disable citation-ready output.

## Recommended node order

```text
IA-01 -> GRAPH-02
      -> MATRIX-03
      -> TOKEN-04
MATRIX-03 -> OUTPUT-05
GRAPH-02 + MATRIX-03 + TOKEN-04 + OUTPUT-05 -> QA-06
```

No external search/download, TeX checking, persistent project entity, monitor
evidence, or route deletion is in scope.
