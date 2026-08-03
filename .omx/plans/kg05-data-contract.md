# KG-05 Data Contract

- `EvidenceRow` and nested `EvidenceItem` remain the sole persisted evidence
  source. `listEvidenceRowsByFileIds` is read-only and scans the existing store;
  no IndexedDB schema change is needed.
- The graph view model keeps `matrixId`, `rowId`, `fileId`, `quotedText`,
  `annotationBody`, `locator`, `match`, and verification fields without writing
  them into graph nodes or edges.
- A source is `available` only when its FileNode exists, is not soft-deleted,
  and its locator is a valid PDF page or EPUB CFI/location. Otherwise it is
  explicitly `missing` or `unresolved` with a reason.
- Selected papers use their file ID; selected keywords resolve their attached
  graph nodes to file IDs. Anchors are deduplicated and capped at 20.
- Navigation is allowed only for `available` anchors. Verification is inherited
  from the matrix row/item and is never inferred from graph weight.

Fixture cases: PDF page, EPUB CFI, unresolved locator, missing/soft-deleted
file, disputed row, and empty selection.
