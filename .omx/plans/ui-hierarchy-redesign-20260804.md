# UI Hierarchy Redesign — execution contract

## Objective

把学森从“AI 工具集合 / Dashboard”收敛为安静、精确、阅读优先的学术研究
工作台。保留现有 URL、稳定 ID、Zustand、IndexedDB、PDF/EPUB locator 和
证据核验规则；只重做信息架构、页面组合、图谱/矩阵表达与视觉语义。

## Design authority

- `docs/plans/2026-08-04-005-research-environment-UI-EVIDENCE-SPEC.md`
- `docs/plans/2026-08-02-003-knowledge-graph-UI-SPEC.md`
- `docs/plans/2026-08-02-004-ui-system-UI-SPEC.md`
- Luna read-only audit, 2026-08-04

## Frozen decisions

1. Primary research workspaces are `阅读 / 证据 / 图谱 / 成果`.
2. `研究现场` remains the `/` landing/context overview, not a fifth dashboard
   workspace. It shows current question, next action, review leads, recent
   reading and a progress timeline; equal metric cards are not the main layout.
3. `/library`, `/trash`, and `/dashboard` remain backward-compatible utility or
   feedback routes and are not removed or migrated in this pass.
4. The graph becomes one canvas with `概览 / 论文 / 主题 / 证据` views. It uses
   stable scholarly hierarchy and a bounded source-aware inspector; no relation
   becomes citation-ready without a resolvable locator and matrix verification.
5. The evidence surface becomes `主张列表 | 主张×论文矩阵 | 来源检查器` on
   desktop. Mobile/tablet use a claim-first list and a source sheet without page
   overflow.
6. Visual hierarchy uses canvas / section / inspector / floating / modal surfaces.
   Remove AI-like glow/spark language and nested card composition; retain token
   aliases only where existing feature code still needs compatibility.
7. No new persisted workspace entity, graph truth model, external search, TeX
   workflow, or live reading interruption is introduced.

## Agent Graph nodes

### IA-01 — route and navigation convergence

- Depends on: current `AG-STATE` checkpoint.
- Owner: shell/research-state surfaces.
- Touchpoints: `src/App.tsx`, `src/components/layout/Sidebar.*`, route handles,
  `src/features/research-state/**`.
- Acceptance: no more than four primary research links; utility links remain
  reachable; `/` reads as a focused research scene with one dominant next action;
  existing route URLs continue to resolve.
- Verification: build/lint; keyboard route traversal; 390/768/1280 screenshots;
  no page-level horizontal overflow.
- Rollback: restore navigation labels/composition without changing route paths or
  persistent state.

### GRAPH-02 — single canvas and provenance inspector

- Depends on: IA-01.
- Owner: graph page/canvas/inspector only; no evidence schema migration.
- Touchpoints: `src/features/knowledge-graph/**`, graph selectors/projection
  helpers, `src/types/index.ts` only if a backward-compatible view type is needed.
- Acceptance: four explicit views, stable layout, paper/concept hierarchy,
  origin + evidence status shown separately, source-return actions guarded by
  locator availability, graph caps and accessible list fallback.
- Verification: static graph probe; browser 390/768/1280, keyboard selection,
  offline/stale relation state, reduced motion.
- Rollback: retain existing graph records and fall back to the current view
  projection without deleting nodes/edges.

### EVID-03 — claim × paper matrix and source inspector

- Depends on: IA-01; parallel with GRAPH-02 after IA contract.
- Owner: evidence matrix composition and projection helpers.
- Touchpoints: `src/features/evidence-matrix/**`, `src/utils/evidence*`, existing
  evidence types/stores only; no silent schema rewrite.
- Acceptance: claim column + paper columns + bounded source inspector; statuses
  are textual/iconographic, not color-only; source inspector exposes excerpt,
  locator, verification and return-to-reader; copy gate stays intact.
- Verification: evidence/static probes; browser desktop/tablet/mobile; stale and
  unavailable locator paths; keyboard source selection.
- Rollback: keep row editor and existing matrix route/records available behind a
  compatible projection.

### TOKEN-04 — academic surface language

- Depends on: IA-01; can land incrementally after graph/matrix contracts.
- Owner: shared tokens and affected CSS only.
- Touchpoints: `src/styles/tokens.css`, page CSS modules, shared controls.
- Acceptance: restrained semantic palette, no new glow/spark ornament, card
  nesting at most one layer, section/divider hierarchy, reduced motion/transparency
  and high contrast remain functional.
- Verification: color/token scan, build/lint, browser themes and accessibility.

### OUTPUT-05 — results center projection

- Depends on: EVID-03.
- Owner: results/outcome surface; do not add new writing editor.
- Touchpoints: existing research artifacts/results components and route wiring.
- Acceptance: conclusions, limitations, gaps, review state and citation-ready
  blocks preserve `claim -> evidence -> paper -> locator` chain.

### QA-06 — cross-surface verification

- Depends on: GRAPH-02, EVID-03, TOKEN-04, OUTPUT-05.
- Owner: independent QA/integration/release gates.
- Acceptance: build, lint, static probes, real PDF/EPUB source return, 390/768/1280,
  keyboard, light/dark, reduced motion/transparency, offline/stale paths, no
  unresolved high-severity review findings.

## Explicit non-goals

- Do not infer scientific relevance from graph distance or AI weight.
- Do not turn monitor/CV events into research evidence.
- Do not add external paper search/download, citation manager replacement, TeX
  checking, or a persistent project/workspace model.
- Do not delete old records or change route URLs merely to simplify navigation.
