# READ-04 PDF anchor plan — 2026-08-04

## Objective

Replace empty PDF selection anchors and first-occurrence replay with a small,
serializable normalized text-layer offset anchor while preserving EPUB CFI
anchors and legacy quoted-text replay.

## Scope

- `src/features/reader/canvas/SelectionToolbar.tsx`
- `src/features/reader/canvas/PdfPageAnnotations.tsx`
- `scripts/probe-read04.mjs`
- `.omx/plans/read04-pdf-anchor-2026-08-04.md`

## Acceptance criteria

- PDF selections inside one PDF.js `.textLayer` save
  `pdf-text-offset:<start>:<end>`.
- Offsets are calculated against the normalized page text used by replay.
- PDF replay uses exact span-range overlap for valid, in-bounds offset anchors.
- Missing, malformed, or unusable anchors fall back to the legacy first
  `quotedText` match.
- EPUB selections continue saving their existing CFI anchor.
- The static probe checks the new contract and exercises the pure offset parser.

## Verification

Required commands:

```text
npm run build
npm run lint
git diff --check
node scripts/probe-read04.mjs
```

Browser QA is intentionally not claimed for this micro-node.

## Status

Implemented and statically verified on 2026-08-04.

Verification results:

- `npm run build` — passed.
- `npm run lint` — passed with pre-existing repository warnings.
- `git diff --check` — passed.
- `node scripts/probe-read04.mjs` — passed.
- Browser QA — not run and not claimed.
