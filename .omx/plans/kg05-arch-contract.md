# KG-05 Architecture Contract

- Reader route remains `/read/:fileId`; no new route, store, DB index, or
  migration is introduced.
- Graph-origin navigation uses the allowlisted query values
  `returnTo=knowledge-graph`, `returnNodeId`, and `returnNodeKind` (`paper` or
  `keyword`). The Reader accepts no arbitrary return URL.
- Evidence anchors additionally carry the existing `matrixId` and `rowId`, so
  the current `readerStore.pendingLocator` and direct-refresh restoration stay
  authoritative.
- Malformed graph context returns to `/knowledge-graph`; absent graph context
  keeps the existing matrix or current-research fallback.
- Graph edges remain read-only navigation clues and are never citation-ready.

Verified against `src/App.tsx`, `ReaderPage.tsx`, `ReaderTopBar.tsx`, and
`readerStore.ts`.
