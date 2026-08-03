# KG-05 UX Contract

- Inspector order is identity, relation origin/reason, metadata preview,
  evidence anchors, then actions.
- Each anchor exposes source identity, conclusion, excerpt, annotation snapshot
  when present, locator, deterministic match method, verification, and source
  availability. Text accompanies every state badge.
- `回读来源` is disabled for missing files and unresolved locators; the reason
  remains visible. Graph edges have no copy action.
- Existing tokenized CSS, mobile sheet, close button, and Escape behavior remain
  in place. Anchor actions use the shared touch-target token.
- Reduced motion removes sheet animation; high contrast strengthens borders.
  No new animation or component dependency is introduced.

Browser scenarios: 1280x800, 768x1024, 390x844; loading/empty/unavailable
anchors; keyboard Escape; light/dark and reduced-motion states.
