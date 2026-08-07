---
title: Phase 003 Knowledge Graph Hierarchy - Execution Plan
type: feature/design
phase: 003
date: 2026-08-02
status: design
design_contract: docs/plans/2026-08-02-003-knowledge-graph-UI-SPEC.md
---

# Phase 003 - Knowledge Graph Hierarchy

> **Continuation note:** Runtime presentation work now follows
> [`Phase 006 多视图研究地图执行计划`](./2026-08-07-006-research-map-multiview-plan.md)。
> This plan remains the compatibility baseline for existing graph records and
> the graph-to-evidence boundary.

## Goal

Turn the current paper/keyword graph into a layered research navigation tool.
Users should be able to move from a research scope to papers, from papers to
concepts, and from either to a located source excerpt and an evidence matrix,
without mistaking an AI relationship suggestion for a verified conclusion.

## Non-goals

- No external CNKI/search integration.
- No paper-writing editor or replacement for a citation manager.
- No manual global edge authoring/deletion.
- No global force graph containing every annotation, excerpt, conclusion, or
  research-gap item.
- No new dependency or component-library migration.
- No change to the local-only camera/monitor boundary.

## Work packages

### KG-1 - Canonical hierarchy and compatibility types

Files: `src/types/index.ts`, `src/db/index.ts`, `src/db/graph.ts`,
`src/db/keywordGraph.ts`, `src/stores/graphStore.ts`,
`src/stores/keywordGraphStore.ts`.

1. Preserve the current `GraphNode`, `GraphEdge`, `KeywordNode`, and
   `KeywordEdge` records as backwards-compatible input.
2. Add only optional metadata needed to describe concept role, provenance,
   evidence status, relation kind, and source references. Use safe defaults for
   old records (`unknown`, `line`, or `unresolved` as appropriate).
3. Keep L3/L4 records in `annotations` and evidence stores. Link to them by
   IDs; do not copy quoted text into graph nodes.
4. Make source deletion mark dependent evidence links unavailable or unresolved
   before removing graph-only paper/keyword records. Reuse existing cascade
   patterns and do not orphan navigable source actions.

Acceptance:

- Existing graph records load without migration failure.
- An old edge with no `origin`/`reason` renders as `来源未记录`.
- A graph relation can carry zero, one, or many evidence references without
  forcing an evidence row to exist.
- Evidence matrix verification remains the only path to `已确认` reusable
  material.

### KG-2 - View model and bounded graph projections

Files: `src/features/knowledge-graph/KnowledgeGraphPage.tsx`,
`GraphCanvas.tsx`, `GraphToolbar.tsx`, `graphFilters.ts`, new pure selectors
under `src/features/knowledge-graph/` if needed.

1. Replace the implicit two-pane assumption with an explicit view state:
   `overview`, `papers`, `concepts`, and `evidence`.
2. Project the existing records into each view without duplicating persistence.
3. Add caps and grouping for large scopes; keep graph data selection pure and
   testable.
4. Preserve current search, paper/keyword highlighting, node drag persistence,
   refresh, clear, reader jump, and three-to-five-paper matrix entry.

Acceptance:

- Switching views does not reload or duplicate graph records.
- Search and filters apply to the active projection and retain the selected
  scope.
- `证据` shows local anchors for the selected node and falls back to the
  inspector/list when there is no locator.
- A graph cluster can open the evidence matrix without implying verification.

### KG-3 - Three-surface UI composition

Files: `KnowledgeGraphPage.module.css`, `GraphInspector.tsx`,
`GraphInspector.module.css`, `GraphToolbar.tsx`, and any small new view
components.

1. Add the desktop scope rail, central canvas, and bounded inspector described
   in the UI contract.
2. Reuse existing common controls, lucide icons, and token-only CSS.
3. Convert the inspector into an evidence bridge: identity, relation reason,
   source preview, evidence anchors, then actions.
4. Implement tablet/mobile inspector as a focus-managed sheet using the same
   close/escape/return-focus behavior as the Phase 002 sidebar drawer.

Acceptance:

- At 1280px the canvas remains the primary surface and the inspector stays
  readable without horizontal overflow.
- At 768px the scope/view controls and inspector stack or overlay without
  shrinking the canvas below its usable width.
- At 390px the sheet has a visible close action, the full title is accessible,
  and `打开阅读` / `回读来源` never disappear behind the fold.

### KG-4 - Evidence bridge and source-state handling

Files: `GraphInspector.tsx`, `src/utils/` evidence helpers as needed,
`src/stores/evidenceMatrixStore.ts`, and reader navigation adapters.

1. Read `Annotation`/`EvidenceItem` references for the selected paper/concept.
2. Show locator kind, excerpt, annotation context, match method, and
   verification state directly in the inspector.
3. Route `回读来源` to the existing PDF/EPUB reader locator behavior. If the
   locator is unresolved or the file is missing, show the reason and disable the
   jump/copy action.
4. Keep comparison creation bounded to three to five local papers and preserve
   the current matrix setup flow.

Acceptance:

- A user can go graph node -> evidence anchor -> reader source without leaving
  the local app context.
- An unresolved source cannot be copied as verified material.
- Editing a matrix row invalidates dependent synthesis as the existing store
  already requires; graph labels reflect the changed state on reload.

### KG-5 - Verification and browser QA

Files: focused selector tests or pure utility tests, plus browser probes.

1. Add pure tests for hierarchy projections, node/edge caps, legacy metadata
   defaults, and source-state labels.
2. Run build, lint, diff checks, evidence probe, and the Codex in-app browser.
3. Verify light/dark themes, keyboard navigation, reduced motion, offline
   existing-data reading, and the 390/768/1280 viewports.

## Implementation order

```text
KG-1 model compatibility
       |
       v
KG-2 view projections ----> KG-3 responsive surfaces
       |                           |
       +-------------> KG-4 evidence bridge
                                   |
                                   v
                              KG-5 verification
```

Do not start KG-3 by adding more visual nodes. The projection and evidence
boundaries must exist first so the UI cannot accidentally promote L3/L4 content
into a global force graph.

## Rollback and risk controls

- Keep optional fields additive and default old records to explicit unknown or
  unresolved states.
- Keep the existing two graph stores as persistence authority during the first
  slice; do not perform a broad IndexedDB rewrite while the UI projection is
  being validated.
- If the evidence bridge is unavailable, retain the relation and show
  `待核对`/`来源未记录`; never invent a quote or locator.
- If a view projection becomes too large, group or list overflow rather than
  increasing the global canvas workload.

## Verification gates

1. `npm run build`
2. `npm run lint` with no new diagnostics
3. `git diff --check`
4. `node scripts/probe-evidence-matrix.mjs`
5. In-app browser at `390x844`, `768x1024`, and `1280x800` for:
   `/knowledge-graph`, `/evidence-matrix`, `/`, and `/read/:fileId` when a
   fixture is available
6. Keyboard and state checks: loading, empty, no-match, offline, stale source,
   error, selected node, and open/closed inspector sheet

## Open implementation questions

- Which existing reader locator adapter is stable enough to reuse for PDF page
  and EPUB CFI jumps in the first evidence view?
- Should concept role metadata be inferred only from AI output in this phase,
  or should the UI allow a user to classify a concept as method/dataset/outcome?
- What is the smallest realistic fixture set for browser verification of a
  selected graph node with a resolvable evidence anchor?
