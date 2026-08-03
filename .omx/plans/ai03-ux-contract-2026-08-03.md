# AI-03 UX Contract

- The reader remains quiet: no live analysis or popup is introduced.
- QAPanel states are distinct: loading history, empty, streaming, cancelable, offline, missing key, and error. Existing messages stay readable in offline mode.
- Pointer-down feedback stays immediate; cancel is an icon action with a tooltip/aria-label and a minimum 44px hit target. Content status uses `aria-live` without layout jumps.
- Transitions use existing motion tokens and compositor-friendly opacity/transform. Reduced motion removes spinner animation and uses static/cross-fade feedback; reduced transparency uses solid surfaces.
- Structured digest sections are scannable, while Markdown remains available for copy/download. Provenance and verification wording stays explicit.
