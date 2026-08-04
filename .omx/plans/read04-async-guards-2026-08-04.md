# READ-04 Async Guards — 2026-08-04

## Scope

- `EpubRenderer.tsx`: prevent stale EPUB display promises from clearing newer
  annotation-jump or locator-handoff requests.
- `readerStore.ts`: add a conditional annotation-jump clear action while
  retaining the existing unconditional action and optional pending-locator
  clear API.
- `AnnotationPanel.tsx`: preserve authored annotations and visibly disable
  structurally unavailable locators.
- `probe-read04.mjs`: add static markers for both stale-response guards.

## Implementation

- Capture the requested annotation `fileId` and `annotationId`; clear only
  when the store still matches both values.
- Pass the captured `ReaderLocatorHandoff` into `clearPendingLocator`; the
  store compares the complete handoff identity before clearing.
- Do not delete or rewrite authored annotations when a locator is unavailable.

## Verification

- [ ] `npm run build` — blocked by four existing `string | null` type
  errors in the disallowed `src/features/reader/canvas/PdfPageAnnotations.tsx`
  (lines 221, 271, 281, and 300).
- [x] `npm run lint` — passed with three pre-existing warnings outside this
  micro-node.
- [x] `git diff --check`
- [x] `node scripts/probe-read04.mjs`
- Browser QA intentionally not run.
