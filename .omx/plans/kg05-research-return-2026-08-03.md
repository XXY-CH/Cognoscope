# KG-05 Research Return Iteration Plan

## Run

- `runId`: `run_2026-08-03_kg05_research-return`
- Objective: close the graph node -> evidence anchor -> Reader return loop without
  promoting graph edges to evidence.
- Scope: `KG-05` only; no `KG-06` stale propagation, `READ-04` highlight
  rendering, new project/workspace entity, external search, or new dependency.
- Complexity: MEDIUM; one implementation slice after four parallel contract
  reviews.
- Existing fact: matrix -> Reader locator handoff already works through
  `matrixId`, `rowId`, and `readerStore.pendingLocator`.

## DAG

### KG05-ARCH — route and boundary contract

- Owner: `AG-ARCH`
- Depends on: `AG-PLAN`
- Reads:
  - `docs/GRAPH_ENGINEERING.md`
  - `docs/graph-engineering.json` (`KG-05`, `R1`, `C4`, `C5`)
  - `.omx/specs/deep-interview-frontend-research-environment.md`
  - `.omx/plans/ai-era-research-environment-frontend.md`
  - `src/App.tsx`
  - `src/features/reader/ReaderPage.tsx`
  - `src/features/reader/ReaderTopBar.tsx`
  - `src/stores/readerStore.ts`
- Writes: `.omx/plans/kg05-arch-contract.md`
- Contract decisions required:
  - Reuse `/read/:fileId`; graph-origin context is an allowlisted query
    contract, e.g. `returnTo=knowledge-graph`, `returnNodeId`, and
    `returnNodeKind`; preserve existing `matrixId`/`rowId` when an anchor comes
    from a matrix row.
  - Reader back navigation returns to the graph with the selected node restored;
    malformed or absent context falls back to the current `/` behavior.
  - No new persisted store, route, DB migration, or open redirect.
- Acceptance:
  - URL/query shape, selection restoration, direct refresh behavior, and fallback
    behavior are explicit and backward-compatible.
  - The contract states that graph edges remain read-only navigation clues.
- Verification: review against Data Router routes, reader handoff behavior, and
  no-new-migration constraint.

### KG05-UX — inspector and accessibility contract

- Owner: `AG-UX`
- Depends on: `AG-PLAN`
- Reads:
  - `docs/plans/2026-08-02-003-knowledge-graph-UI-SPEC.md`
  - `docs/plans/2026-08-02-003-knowledge-graph-plan.md`
  - `/Users/xiexingyu/.agents/skills/apple-design/SKILL.md`
  - `src/features/knowledge-graph/GraphInspector.tsx`
  - `src/features/knowledge-graph/GraphInspector.module.css`
  - existing reader sheet/focus patterns
- Writes: `.omx/plans/kg05-ux-contract.md`
- Contract decisions required:
  - Inspector order stays identity -> relation origin/reason/status -> source
    preview -> evidence anchors -> actions.
  - Each anchor exposes quoted text, annotation context when present, locator
    kind/value, match method, verification state, and source availability.
  - `回读来源`/`打开阅读` are explicit labels; unresolved or unavailable
    sources render a reason and disabled action, never color-only state.
  - Desktop/tablet/mobile layout, `Escape` close then focus return, 44px touch
    targets, and `prefers-reduced-motion`, `prefers-reduced-transparency`, and
    `prefers-contrast: more` fallbacks are specified.
- Acceptance:
  - A browser scenario matrix covers 390/768/1280, loading/empty/error/stale,
    keyboard, and reduced-preference states.
  - Motion is limited to source-anchored/interruption-safe panel behavior; no
    decorative animation or new motion dependency.
- Verification: contract review against UI-SPEC and Apple Design guidance.

### KG05-DATA — evidence anchor and source-state projection

- Owner: `AG-DATA`
- Depends on: `AG-PLAN`
- Reads:
  - `src/types/index.ts`
  - `src/db/evidenceRows.ts`
  - `src/db/evidenceMatrices.ts`
  - `src/db/annotations.ts`
  - `src/utils/evidenceMatch.ts`
  - `src/utils/evidenceCitation.ts`
  - `src/stores/evidenceMatrixStore.ts`
  - `src/stores/fileStore.ts`
- Writes: `.omx/plans/kg05-data-contract.md`
- Contract decisions required:
  - Define a non-persisted graph evidence view model joining selected graph
    `fileId`s to existing `EvidenceRow`/`EvidenceItem` data (and annotation
    snapshot where present). Keep `matrixId`, `rowId`, `quotedText`, `locator`,
    `match`, `verification`, and source file identity.
  - Prefer a read-only helper in `src/db/evidenceRows.ts` that filters existing
    rows; do not add an IndexedDB index or migration for KG-05.
  - Source labels distinguish resolved, unresolved locator, missing/soft-deleted
    file, and verification state. Only resolved locator + available source is
    navigable; no graph relation or unresolved item is copyable/citation-ready.
  - Selected paper uses its file; selected keyword uses related paper file IDs;
    cap and deduplicate anchors for the inspector (target 20).
- Acceptance:
  - The projection has deterministic source-state labels and cannot mark an
    unresolved/missing source as verified or navigable.
  - Existing matrix lifecycle remains authoritative; no second evidence truth
    system is introduced.
- Verification: fixture-level checks for PDF page, EPUB CFI, unresolved, missing
  file, disputed/unresolved row, and empty anchor sets.

### KG05-RESEARCH — research-quality rubric

- Owner: `AG-RESEARCH`
- Depends on: `AG-PLAN`
- Reads:
  - `.omx/specs/deep-interview-frontend-research-environment.md`
  - `.omx/plans/ai-era-research-environment-frontend.md`
  - `docs/plans/2026-08-02-003-knowledge-graph-UI-SPEC.md`
  - `src/types/index.ts`
  - `src/features/evidence-matrix/EvidenceRowEditor.tsx`
  - `src/utils/evidenceCitation.ts`
- Writes: `.omx/plans/kg05-research-rubric.md`
- Contract decisions required:
  - Graph relations display as `线索` with origin/reason; edge weight is not a
    confidence score or evidence strength.
  - Anchor verification, match method, and source availability remain separate
    fields; `verified` is only inherited from the matrix row and never inferred
    from graph position or edge weight.
  - Counterexample/controversial/unresolved material remains visible as review
    material and cannot become citation-ready through the graph.
- Acceptance:
  - Rubric has pass/fail examples for direct source return, unresolved source,
    stale/missing source, and graph-only relation.
  - It explicitly checks that the implementation helps a researcher decide what
    to inspect next without making a claim on their behalf.
- Verification: adversarial review of labels, action gating, and fixture
  scenarios before implementation.

### KG05-EXEC — implementation slice

- Owner: `AG-EXEC`
- Depends on: `KG05-ARCH`, `KG05-UX`, `KG05-DATA`, `KG05-RESEARCH`
- Reads:
  - all four upstream artifacts above
  - `src/features/knowledge-graph/KnowledgeGraphPage.tsx`
  - `src/features/knowledge-graph/GraphInspector.tsx`
  - `src/features/knowledge-graph/GraphInspector.module.css`
  - `src/features/reader/ReaderPage.tsx`
  - `src/features/reader/ReaderTopBar.tsx`
  - `src/stores/readerStore.ts`
- Writes (owned files only):
  - `src/db/evidenceRows.ts` (read-only anchor query/helper, if approved)
  - `src/features/knowledge-graph/GraphInspector.tsx`
  - `src/features/knowledge-graph/GraphInspector.module.css`
  - `src/features/knowledge-graph/KnowledgeGraphPage.tsx`
  - `src/features/reader/ReaderTopBar.tsx`
  - `src/features/reader/ReaderPage.tsx` only if context restoration requires it
  - `src/types/index.ts` only for an approved additive view-contract type
- Implementation requirements:
  - Load anchors for selected paper/keyword from existing matrix rows; show
    conclusion, excerpt, annotation snapshot, locator, match method, and
    verification/source-state labels.
  - Keep graph relation lists and origin/reason explanation. Do not add edge
    mutation or citation copy.
  - Gate `回读来源` on available file plus resolved `pdf-page`/`epub-cfi`;
    unresolved/missing sources stay visible with disabled jump/copy and reason.
  - For resolved matrix anchors, set the existing `pendingLocator` and navigate
    with `matrixId`, `rowId`, and graph-origin context. For direct paper open,
    include graph-origin context without fabricating a locator.
  - Reader back action consumes only the allowlisted graph context and returns
    to `/knowledge-graph` with selected node query; graph page restores selection
    after graph data loads. Preserve current root fallback for all other opens.
  - Remove or relabel bare edge percentages so they cannot read as confidence;
    keep relation strength explanatory if shown.
  - Reuse tokenized CSS and existing mobile sheet/focus behavior; no hardcoded
    values or new dependency.
- Acceptance:
  - Resolved PDF and EPUB anchors complete graph -> inspector -> Reader locator
    navigation and return with selected context restored.
  - Keyword selection shows bounded anchors from related papers; no anchor list
    duplicates persistence or creates global L3/L4 graph nodes.
  - Missing, unresolved, disputed, and empty cases are explicit and safe.
  - Existing matrix -> Reader flow and three-to-five-paper matrix entry remain
    unchanged.

### KG05-REVIEW — adversarial review

- Owner: `AG-REVIEW`
- Depends on: `KG05-EXEC`
- Reads: implementation diff, all contracts, `docs/graph-engineering.json`
- Writes: severity-ranked review findings
- Acceptance:
  - No high-severity provenance, route, privacy, accessibility, or regression
    findings remain; medium findings are dispositioned.
  - Specifically probe open-redirect query handling, stale async selection,
    duplicate anchors, graph-edge citation leakage, and unresolved action gating.
- Verification: static diff review plus targeted route/data inspection.

### KG05-QA — build and browser verification

- Owner: `AG-QA`
- Depends on: `KG05-REVIEW` with no blocking findings
- Reads: UX scenario matrix, research rubric, implementation diff
- Writes: QA evidence and verdict
- Verification:
  - `npm run build`
  - `npm run lint`
  - `git diff --check`
  - In-app browser: resolved PDF, resolved EPUB, unresolved locator, missing
    source, keyword anchor, and existing matrix return flow.
  - Viewports `390x844`, `768x1024`, `1280x800`; keyboard `Escape`/focus return;
    light/dark, offline existing-data reading, reduced motion/transparency,
    high contrast.
- Acceptance:
  - No page-level horizontal overflow; source state and disabled actions remain
    legible; reader lands on the expected page/CFI when resolvable.

### KG05-INTEGRATION — workflow gate and checkpoint

- Owner: `AG-INTEGRATION` then `AG-RELEASE`
- Depends on: `KG05-QA`
- Reads: QA evidence, graph/data/route contracts, project graph
- Writes: integration report, updated `docs/agent-run-state.json`,
  `docs/graph-engineering.json`, and relevant progress/change log.
- Acceptance:
  - End-to-end flow is coherent:
    graph selection -> anchor inspection -> Reader return -> graph selection;
    matrix truth and local-first boundaries remain intact.
  - Only after all KG-05 acceptance and verification pass, mark `KG-05` done;
    otherwise keep `C5`/`R1` in progress and record the exact blocker.
- Rollback:
  - Revert only the KG-05 implementation slice; retain all graph, evidence,
    annotation, and matrix records.
  - If anchor projection or return context fails, retain existing relation
    inspector and direct reader open with explicit `待核对`/`来源未记录`;
    never delete or rewrite source records.
  - No destructive IndexedDB reset, migration rollback, or graph-edge purge.

## Risk Register

| Risk | Owner | Mitigation / exit condition |
|---|---|---|
| `evidenceRows` has no `by-file` index, so anchor lookup can become expensive as local matrices grow. | `AG-DATA` | Use a bounded read-only scan/filter for this slice; cap/dedupe inspector anchors. Escalate to `AG-ARCH` instead of adding a migration if the scan is not acceptable. |
| Reader context query could become an open redirect or lose selection after refresh. | `AG-ARCH` | Allowlist `returnTo=knowledge-graph`, validate node kind/id, preserve existing matrix params, and fall back to `/` for malformed context. |
| Async anchor loading can show evidence for a prior selected node. | `AG-EXEC` | Cancel/ignore stale requests using the selected node/file identity; clear anchors on selection changes and verify rapid selection in review. |
| Unresolved locator or soft-deleted source could appear navigable or citation-ready. | `AG-DATA` + `AG-RESEARCH` | Derive source state from file availability and locator kind; disable jump/copy and retain explicit reason; never mutate graph edges into evidence. |
| Existing mobile inspector motion/focus behavior regresses while adding anchor content. | `AG-UX` | Reuse the current sheet/scrim/focus contract, cap internal list height, and verify `Escape`, focus return, 390px layout, and reduced preferences before release. |
| Removing the bare edge percentage changes researcher interpretation or creates a visual regression. | `AG-RESEARCH` + `AG-UX` | Replace it with an explicitly named relation-strength label or omit it; do not present a percentage as confidence. Keep the change isolated to the inspector. |

## Parallel upstream handoff

After `AG-PLAN` publishes this DAG, launch these four independent reviews in
parallel because their write scopes and questions are distinct:

| Agent | Must settle before `AG-EXEC` |
|---|---|
| `AG-ARCH` | Allowlisted `returnTo`/node query contract, Reader fallback, no new route/store/migration, and context preservation across refresh. |
| `AG-UX` | Inspector information order, source-state/disabled-action copy, responsive sheet/focus/Escape behavior, Apple reduced-preference rules. |
| `AG-DATA` | Existing `EvidenceRow`/`EvidenceItem` projection, locator and source-state mapping, selected paper/keyword anchor query, no-copy/no-jump invariant. |
| `AG-RESEARCH` | Graph-edge-as-clue rubric, verification/match/source separation, disputed/unresolved treatment, and research-decision usefulness. |

`AG-EXEC` must not start until all four artifacts pass. Then enforce the
non-skippable `REVIEW -> QA -> INTEGRATION` gates from
`docs/AGENT_DEPENDENCY_GRAPH.md`.
