# READ-04 cleanup plan — 2026-08-04

## Objective

Reduce obvious duplication in the recently changed EPUB renderer without
changing locator replay, stale-request invalidation, or highlight behavior.
This is a bounded cleanup pass; it does not attempt the larger renderer split
while browser QA is unavailable.

## Behavior lock

Baseline evidence before editing:

- `npm run build`
- `npm run lint`
- `git diff --check`
- `node scripts/probe-read04.mjs`

The existing READ-04 probe remains the regression contract for locator parsing,
TOC projection, and async guard markers. No new dependency or schema change is
allowed.

## Smell inventory and order

1. **Dead/needless parameter:** remove the unused
   `_requiresCurrentRequest` argument from the pure EPUB display guard.
2. **Duplicate lifecycle helper:** merge `finishEpubDisplay` and
   `cancelEpubDisplayIfCurrent`, whose bodies have identical generation,
   abort, and cleanup semantics, into one `closeEpubDisplay` callback.
3. **Contract probe update:** assert the single lifecycle helper and rerun the
   baseline commands.

## Explicitly deferred

- Splitting `EpubRenderer.tsx` into hooks/modules: high behavioral risk without
  real PDF/EPUB browser fixtures.
- Reworking `TocPanel.tsx` structure: requires visual and keyboard evidence.
- New abstractions, dependencies, schema changes, or unrelated formatting.

## Exit criteria

- No behavior change in the guarded display paths.
- Build, lint, diff check, and READ-04 probe pass.
- Q2 remains explicitly blocked; this cleanup cannot unlock Integration or
  Release.

## Cleanup report

Pass 1 (dead/needless parameter): complete. The unused display-guard argument
was removed.

Pass 2 (duplicate lifecycle logic): complete. `finishEpubDisplay` remains the
single implementation and effect cleanup aliases it instead of duplicating
the same generation check, abort, and ref reset.

Pass 3 (contract reinforcement): complete. `probe-read04.mjs` now checks the
shared lifecycle helper marker.

Quality gates: build PASS; lint PASS with the same three pre-existing warnings;
diff check PASS; READ-04 probe PASS. Browser QA remains blocked.
