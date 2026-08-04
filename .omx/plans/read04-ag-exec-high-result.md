## AG-EXEC report

Implemented and verified the READ-04 remediation without committing.

**Changed files**
- `EpubRenderer.tsx`
- `PdfPageAnnotations.tsx`
- `epubToc.ts`
- `TocPanel.tsx`
- `TocPanel.module.css`
- `scripts/probe-read04.mjs`
- `.omx/plans/read04-ag-exec-2026-08-04.md`

**Fixes**
- Registered EPUB relocation before initial/pending display and guarded bottom-page replay.
- Added normalized quoted-text fallback for malformed PDF offsets.
- Preserved arbitrary EPUB TOC depth with omitted-container placeholders and tokenized indentation.
- Capped tooltip previews at 60 characters.

**Verification**
- `npm run build` — pass.
- `npm run lint` — pass; 3 pre-existing warnings.
- `git diff --check` — pass.
- `node scripts/probe-read04.mjs` — pass.
- `node scripts/probe-blank.mjs` — blocked/skipped: no Chromium-compatible runtime.

**Unresolved risks**
- Browser/real-document QA remains blocked, including visual EPUB/PDF replay and TOC interaction verification.
- Existing lint warnings and large-chunk build warning remain.