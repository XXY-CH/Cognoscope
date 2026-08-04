# UX-06 Static Apple Design Audit

## Objective

Keep the current research-state surface balanced at desktop, tablet, and mobile
widths while preserving the Apple Design motion and accessibility contracts.

## Scope

- `src/features/research-state/CurrentResearchStatePage.module.css`
- `scripts/probe-ui-contract.mjs`

The page now renders four metric surfaces, so the grid must be 4 columns on
wide screens, 2 columns on narrow desktop/tablet, and 1 column on mobile.

## Verification

- `node scripts/probe-ui-contract.mjs`
- `npm run build`
- `npm run lint`
- `git diff --check`

The in-app browser was attempted through the browser runtime; discovery returned
an empty list. Screenshot, real document, keyboard, theme, and reduced-preference
interaction checks remain blocked until a browser runtime is available.
