# UI Hierarchy Redesign Review Checkpoint

Date: 2026-08-04
Run: `run_2026-08-04_ui-hierarchy-redesign`

## Review

- Results source actions now carry `EvidenceItem.id`, so repeated locators in one paper do not collapse to the first source.
- Limitations and gaps show matrix row, paper, locator, excerpt, and guarded reader return actions.
- Paper/topic and topic/paper inspectors show relation origin and a separate evidence status.
- Graph relation candidates remain `待核对` or `证据不足`; candidate matrix rows are explicitly not direct edge evidence.
- Graph evidence filtering is wired to canvas edges and local evidence anchors.

## Static QA

- `npm run build` passed.
- `npm run lint` passed with three pre-existing warnings.
- `git diff --check` passed.
- `node scripts/probe-ui-contract.mjs` passed after the current-question and 6/3/1 timeline contract update.
- `node scripts/probe-read04.mjs` passed.
- `node scripts/probe-evidence-matrix.mjs` passed.
- esbuild-bundled source invalidation and monitor-session probes passed.

## Luna Max static follow-up

- Responsive UI probe assertions are scoped to `.focusGrid` and `.timelineList`
  media-query blocks, avoiding generic selector false positives.
- Removed unreachable `.keywordRow`, `.keyword`, `.nextSurface`, `.actionList`,
  and `.statusStripIcon` CSS rules after confirming no source references remain.
- Re-ran build, lint, diff check, UI probe, and the esbuild-bundled monitor probe;
  all passed, with only the three existing lint warnings.

## Browser Gate

Blocked: no Chromium-compatible executable is available in this environment. Keep the browser gate blocked for 390/768/1280, real PDF/EPUB return, keyboard, theme, reduced motion, and stale source interaction. Static results do not unlock integration or release.
