# Deep Interview Context — Research environment hierarchy redesign

## Task statement

Rework the frontend hierarchy and visual language so the product feels like a
calm, precise academic workbench rather than an AI-styled dashboard. Reduce
visible layers, make the Apple Design reference behavioral and restrained, and
upgrade the graph and evidence matrix so they express scholarly relevance and
provenance.

## Desired outcome

A reading-first research environment with a small number of clear top-level
surfaces. The researcher can move from current research state to a paper,
capture source-anchored evidence, compare claims across papers, inspect
relationships, and return to the source without losing context.

## Known facts / evidence

- Phase 005 is authoritative for reading -> evidence workbench -> research
  graph -> outcomes.
- The current sidebar exposes six user-facing destinations across four groups.
- The current graph uses a force-directed canvas and file/folder/tag entities;
  the Phase 005 contract requires stable scholarly layers and provenance-aware
  entities.
- The evidence matrix is persisted and source-aware, but its page currently
  combines setup, extraction, editing, analysis, and citation actions in one
  long surface.
- Existing route URLs, stores, IndexedDB records, and reader locator contracts
  must remain compatible unless a migration is explicitly planned.

## Constraints

- Preserve local-first storage and local camera privacy.
- Graph relationships remain navigation clues; the evidence matrix and source
  locators remain authoritative for citation-ready material.
- No live AI interruption inside reading.
- No external search/download, TeX QA, or new workspace entity in this phase.
- Browser verification is required for graph, matrix, responsive, keyboard,
  reduced-motion, theme, and source-return behavior.

## Unknowns / decision boundaries

- Whether current research, graph, and matrix should remain separate routes or
  become one research workspace with contextual views.
- Which scholarly entity types and relation semantics are first-class in the
  graph UI.
- Whether the matrix should optimize for claim-first review, paper-first
  comparison, or a split workbench with a source inspector.
- Which status/visual tokens are necessary after removing AI-like decoration.

## Likely touchpoints

`src/App.tsx`, `src/components/layout/Sidebar.tsx`,
`src/features/research-state`, `src/features/knowledge-graph`,
`src/features/evidence-matrix`, `src/styles/tokens.css`, related stores/types,
and the Agent Dependency Graph state/docs.
