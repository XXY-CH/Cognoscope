---
title: Phase 004 System UI Redesign - Execution Plan
type: ui
phase: 004
date: 2026-08-02
status: in_progress
design_contract: docs/plans/2026-08-02-004-ui-system-UI-SPEC.md
---

# Phase 004 - System UI Redesign

## Goal

Make the entire Congnoscope interface feel like one research workbench. The redesign
must unify page hierarchy, navigation, surfaces, states, responsive behavior, and
animation while preserving the current local-first data and research contracts.

## Scope

- Global shell: Sidebar, PageHeader, OfflineBanner, SettingsDrawer, dialogs,
  menus, toast and route fallback.
- Files: file directory, import, file table/list, selection and batch actions.
- Research: dashboard, knowledge graph, evidence matrix, trash.
- Reader: top bar, bottom bar, canvas/panel relationship, source-return context,
  selection toolbar and mobile sheets.
- Design tokens, motion aliases, reduced-motion/transparency/contrast behavior,
  and browser verification.

## Non-goals

- No route removal or URL rewrite.
- No new component framework or animation dependency.
- No change to IndexedDB schema, AI prompt semantics, evidence verification, or
  monitor privacy behavior unless a UI state cannot be represented otherwise.
- No external search, citation-manager replacement, or paper-writing editor.

## Work packages

### UI-1 - Foundation and token audit

Files: `src/styles/tokens.css`, `src/styles/index.css`, common component CSS.

1. Audit every hardcoded color, spacing, duration, radius, shadow, and z-index.
2. Add semantic motion aliases only where existing tokens do not express the
   intended role; keep old aliases during migration.
3. Add global reduced-transparency and increased-contrast fallbacks.
4. Standardize focus, press, disabled, loading, and error states across common
   controls.

Acceptance: all redesigned CSS reads from tokens; `npm run lint` reports no new
diagnostics; common controls look and behave consistently in both themes.

### UI-2 - Shell and navigation hierarchy

Files: `src/components/layout/AppShell.tsx`, `AppShell.css`, `Sidebar.tsx`,
`Sidebar.css`, `PageHeader.tsx`, `PageHeader.css`, `OfflineBanner.*`,
`SettingsDrawer.*`, `src/App.tsx` route handles.

1. Render the three navigation groups and preserve active route semantics.
2. Make PageHeader the single source of page identity and action order.
3. Standardize mobile drawer, settings sheet, focus return, Escape, and outside
   click behavior.
4. Add route content crossfade/continuity without blank flashes.
5. Make route fallback and offline status follow the global state contract.

Acceptance: every route answers where/what/exit, no page-level horizontal scroll,
mobile navigation and settings are keyboard-safe, and route changes close only
transient layers.

### UI-3 - Library, trash, and dashboard surfaces

Files: `src/features/file-directory/**`, `src/features/trash/**`,
`src/features/dashboard/**`.

1. Recompose file management around one dominant table/list work surface.
2. Move import/search/filter/batch actions into a predictable toolbar hierarchy.
3. Recompose dashboard into metric strip, reading rhythm, and session evidence
   bands, reducing nested-card appearance.
4. Keep trash visually quieter and make restore the common path.
5. Add empty/loading/error/offline states and purposeful enter/layout feedback.

Acceptance: file rows remain dense and readable; dashboard data freshness and
monitor availability are clear; mobile list and tables do not require a hidden
hover-only action.

### UI-4 - Research workbench surfaces

Files: `src/features/knowledge-graph/**`, `src/features/evidence-matrix/**`.

1. Apply the Phase 003 graph hierarchy within the system-level shell contract.
2. Align the evidence matrix setup, rows, analysis, and source actions to the
   P2/P3 hierarchy and verification states.
3. Keep graph-to-matrix and matrix-to-reader return paths visible.
4. Use one inspector/sheet behavior across graph and evidence surfaces.

Acceptance: graph and matrix feel related but not visually identical; evidence
status remains more authoritative than graph styling; source jumps are obvious.

### UI-5 - Reader and motion implementation

Files: `src/features/reader/**`, `src/hooks/useFocusTrap.ts`, any focused motion
utility under `src/utils/` if needed.

1. Rebuild ReaderTopBar, ReaderBottomBar, TOC, SidePanel, and selection toolbar
   around the immersive-source hierarchy.
2. Implement edge-aware sheets, direct resizer tracking, and source-return
   continuity. Disable transitions while pointer dragging.
3. Replace decorative or indefinite motion with status-linked feedback.
4. Add reduced-motion and reduced-transparency fallbacks for every sheet and
   reader transition.

Acceptance: opening/closing a panel is spatially symmetric and interruptible;
reader canvas remains usable at 390px; source locator context survives route
changes; no reader control is lost behind an overlay.

### UI-6 - Verification and visual review

1. Run `npm run build`, `npm run lint`, `git diff --check`, and the existing
   evidence probe.
2. Use the Codex in-app browser for all routes at 390/768/1280 widths.
3. Verify light/dark themes, accent variants, keyboard-only navigation, touch
   parity, offline saved data, reduced motion/transparency, and focus return.
4. Capture screenshots and inspect for overlap, clipped text, page-level overflow,
   visual hierarchy failures, and animation direction mistakes.
5. Only after the visual pass, split any overlong component files.

## Dependency order

```text
UI-1 tokens/common controls
        |
        v
UI-2 shell/navigation
   |             |
   v             v
UI-3 library    UI-4 graph/matrix
   \             /
    v           v
      UI-5 reader/motion
              |
              v
          UI-6 review
```

UI-1 and UI-2 are prerequisites for page-level work. Do not tune individual page
animations before the shared motion aliases and source-edge behavior are fixed.

## Rollback strategy

- Keep each work package in its own reviewable diff.
- Preserve existing route handles, selectors, store actions, and CSS module
  contracts while changing composition.
- If a route-specific redesign causes data or navigation regressions, restore its
  page composition while retaining the shared token and shell fixes.
- Do not revert unrelated user changes in the dirty worktree.
