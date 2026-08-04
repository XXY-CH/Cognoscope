# READ-04 AG-EXEC Follow-up — 2026-08-04

## Scope

- Reader source-locator replay and failure reporting.
- EPUB display/navigation stale-request guards.
- EPUB TOC hidden-container hierarchy preservation.
- Static READ-04 contract probe.
- No monitor or knowledge-graph implementation changes.
- No commit created.

## Closed Review Findings

### HIGH-2 — Concurrent EPUB display requests

- Added per-display generation tokens and `AbortController` ownership.
- Wrapped initial display, matrix handoff replay, TOC navigation, annotation
  navigation, bottom-bar paging, and keyboard paging in guarded async paths.
- Stale requests cannot update page/href state, clear newer handoffs, flash
  annotations, set unavailable state, open the side panel, or show a toast.

### HIGH-3 — Matrix/evidence locator failures

- Added reader-level `pendingLocatorUnavailable` state with the complete
  file/matrix/row/locator handoff and a durable reason.
- PDF page bounds and locator kind are validated before the handoff is cleared.
- EPUB CFI/location validation and replay errors are retained as unavailable
  state; successful replay clears only the matching unavailable handoff.
- Reader URL recovery now preserves missing-row/database failures as an
  unresolved handoff and renders a `role="alert"` reason with a retry action.

### MEDIUM-1 — Hidden EPUB TOC container siblings

- EPUB flattening retains hidden container IDs in `parentIds`.
- TocPanel reconstructs structural placeholder branches with stable node keys.
- Probe fixture now covers hidden sibling containers and depth greater than two,
  including distinct parent-path assertions.

## Changed Files

- `src/features/reader/canvas/EpubRenderer.tsx`
- `src/features/reader/canvas/PdfRenderer.tsx`
- `src/features/reader/ReaderPage.tsx`
- `src/features/reader/ReaderPage.module.css`
- `src/stores/readerStore.ts`
- `src/utils/epubToc.ts`
- `src/features/reader/panels/TocPanel.tsx`
- `src/features/reader/panels/TocPanel.module.css`
- `scripts/probe-read04.mjs`

Other READ-04 files remain part of the existing uncommitted worktree and were
not reverted.

## Verification

- `npm run build` — pass; TypeScript and Vite production build completed.
- `npm run lint` — pass with only the three pre-existing warnings in
  `FileTable.tsx`, `TrashDialogs.tsx`, and `pdfFrontMatter.ts`.
- `git diff --check` — pass.
- `node scripts/probe-read04.mjs` — pass; static contracts, PDF offset
  fixtures, and EPUB hidden-sibling/depth fixtures passed.
- `node scripts/probe-blank.mjs` — Q2 blocked because no
  Chromium-compatible executable is available.

## Release State

- Static READ-04 QA: **PASS**.
- Browser/real-document QA (Q2): **BLOCKED**.
- Integration/release completion must remain blocked until a browser runtime is
  available for real PDF/EPUB replay, TOC, focus, theme, viewport, and
  end-to-end matrix-return checks.

## AG-EXEC remediation checkpoint — 2026-08-04

Closed the follow-up review loop without widening READ-04 ownership:

- `PdfPage` exposes a stable text-layer data attribute; `SelectionToolbar`
  uses it instead of a literal CSS-module class.
- Versioned PDF anchors do not silently fall back after drift.
- epub.js `getContents()` is normalized to `Contents[]`; highlight metadata is
  re-applied after view render and TOC fragment matching is exact-first.
- Annotation colors, underline width, and focus duration use shared tokens
  with dark-theme values.

Static verification passed. Q2 remains blocked and is not substituted by the
source probe.
