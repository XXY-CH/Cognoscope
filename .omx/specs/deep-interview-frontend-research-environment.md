# Execution Spec — AI-era research environment frontend

## Metadata

- Source: `.omx/interviews/frontend-research-environment-20260802T052117Z.md`
- Context: `.omx/context/frontend-research-environment-20260802T040505Z.md`
- Status: ready for architecture/planning review
- Final ambiguity: 9% (standard threshold: 20%)
- Phase type: brownfield frontend/product experience refactor

## Intent

Transform the product from a set of academic tools into a coherent AI-era
research environment. The researcher should primarily read and annotate papers;
the environment should absorb organizing, cross-paper comparison, graph
maintenance, evidence bookkeeping, and reflective synthesis. The result must
feel like a place where research progresses, not a dashboard that links to
separate utilities.

## Desired outcome

Deliver a reading-first local workflow:

```text
current research state → open/continue paper → read + annotate
       → post-reading AI整理 → personal graph + evidence matrix
       → review conflicts / return to source → next research decision
```

The primary persistent outputs are:

1. A layered personal research graph containing authored positions and clearly
   labelled system-inferred interests/blind spots.
2. A cross-paper evidence matrix and literature-review material whose claims
   retain source locators and verification status.

## In scope

- Redesign the global frontend narrative and information hierarchy around
  current research state rather than the raw file list.
- Make the reader the primary human activity and connect reader, post-session
  summary, graph, and evidence matrix into one returnable workflow.
- Add a calm post-reading summary surface for AI organization and
  “偏向冲突 / 待审视” leads; it must not interrupt active reading.
- Make explicit user-authored stance and system-inferred signals visually and
  semantically distinct, editable where appropriate, and source-aware.
- Make graph and evidence-matrix provenance, conflict, review, and return-to-
  source paths first-class UI states.
- Define and implement persistence/review affordances for:
  - direct-save unambiguous source/annotation-derived items;
  - direct-save cross-paper consensus only after the consensus gate;
  - review queues for ambiguity, contradiction, counterexample, or stale source.
- Apply Apple Design principles: immediate response, interruptible motion,
  source-anchored sheets, restrained materials, clear hierarchy, keyboard and
  touch reachability, reduced motion/transparency/high-contrast modes.
- Preserve local-first storage, local camera privacy, existing evidence truth
  rules, and backward-compatible route/data contracts unless a plan explicitly
  proves a migration is necessary.

## Out of scope / non-goals

- External paper search, publisher integrations, or automatic paper download.
- TeX upload analysis, target-journal format checking, citation scan/correction,
  or a writing editor. These are follow-up phases after the local reading loop.
- Replacing the evidence matrix with graph edges or treating AI graph relations
  as verified facts.
- Live AI popups or continuous analysis that interrupts reading.
- A new persisted project/workspace entity in this phase. Derive current state
  from existing files, reading sessions, annotations, graph data, and matrices;
  revisit a project model after the workflow prototype proves its need.
- New component-library or animation-dependency migration without a separate
  decision record.

## Decision boundaries

### AI and persistence

- The system may directly persist a single-paper item only when it has a
  resolvable source locator, a normalized claim supported by the source text,
  no unresolved source/annotation contradiction, and an explainable status.
  The exact threshold language is a planning decision, but it must never be a
  hidden probability presented as fact.
- Cross-paper consensus requires at least three papers and checks for
  counterexamples, method differences, and dataset independence. Any
  counterexample downgrades the output to “待审核 / 有争议”.
- AI-inferred interests or blind spots are never silently promoted to authored
  stance or verified conclusion.
- A conflict between authored stance and inferred signal becomes a
  “偏向冲突 / 待审视” lead after the reading session ends.
- Review items preserve both sides, their sources, and a clear user action;
  accepting or rejecting a lead is explicit and reversible where possible.

### Information architecture

- `/` becomes the current-research-state entry in the new experience; the
  existing library remains reachable as a supporting source-management route.
- The fullscreen reader remains a focused context mode, but its exits and
  post-session transition return to the current research state or the originating
  graph/matrix context.
- Existing routes may be reorganized visually, but route URLs and persisted IDs
  stay backward-compatible unless a migration is planned and verified.

### Visual and interaction language

- The desired mood is calm, precise, evidence-aware, and spatially continuous;
  Apple Design is a behavioral and craft reference, not a license for decorative
  glass, excessive bounce, or marketing hero layouts.
- Motion must explain state and preserve agency. Use springs/Pointer Events for
  gesture-driven sheets or panels, compositor-friendly transforms/opacity, and
  cross-fades/static equivalents for reduced motion.

## Technical context findings

- Brownfield React 18 + Vite 6 + TypeScript; React Router Data Router;
  Zustand stores; CSS modules plus tokenized shell CSS; no component library.
- Existing reader, annotation/bookmark stores, session tracking, graph stores,
  evidence-matrix store/DB, AI settings, and local monitor integration provide
  the implementation substrate.
- Existing graph and matrix provenance rules are authoritative: graph relations
  are navigation clues, while user-confirmed matrix evidence is copyable.
- Likely implementation surfaces include `src/App.tsx`, `src/components/layout`,
  `src/features/reader`, `dashboard`, `knowledge-graph`,
  `evidence-matrix`, `src/stores`, `src/types/index.ts`, and token/global CSS.

## Testable acceptance criteria

1. A returning user sees current research state first: active/recent reading,
   pending evidence review, latest post-reading AI results, and clear next
   actions; the raw library is not the only or dominant first signal.
2. A user can move from current state into a paper, read/annotate without live
   analysis interruptions, end the session, and receive a post-reading summary.
3. The summary distinguishes authored stance, inferred signal, source evidence,
   direct-save item, and review lead without relying on color alone.
4. Any “偏向冲突 / 待审视” item contains both conflicting signals and can be
   opened for review without losing the original paper context.
5. Direct-save and review-gate behavior follows the stated evidence rules;
   counterexamples and unresolved contradictions cannot silently become verified
   graph/matrix content.
6. Every persisted claim or evidence row exposes a resolvable source locator or
   an explicit unavailable/stale status; graph edges alone are never copyable
   as citation material.
7. The graph and evidence matrix form a continuous workflow with clear
   “回读来源” and return paths; no route traps the user in an inspector/sheet.
8. Desktop, tablet, mobile, keyboard navigation, reduced motion, reduced
   transparency, and high contrast preserve hierarchy and readable content;
   touch targets remain at least 44px.
9. Existing local-first privacy behavior, IndexedDB persistence, and route/data
   contracts remain intact; offline use still supports reading and local review.
10. No external search/download or TeX/journal checking is required to pass this
    phase; those capabilities are explicitly represented as future entry points
    rather than half-built controls.

## Assumptions exposed and resolved

- **Assumption:** A graph alone can express research progress. **Resolution:**
  Pair graph navigation with the evidence matrix and source locators; graph
  relations do not become evidence automatically.
- **Assumption:** Personalization should optimize toward the user's inferred
  interests. **Resolution:** Keep inferred signals separate and expose conflicts
  as review leads so the system can reveal blind spots.
- **Assumption:** AI needs to interrupt to be useful. **Resolution:** Use the
  reading-session boundary for synthesis; keep active reading quiet.
- **Assumption:** A new project model is required for a research environment.
  **Resolution for this phase:** derive current state from existing data and
  defer persisted project/workspace modeling until workflow validation.
- **Assumption:** A numerical confidence score is enough for auto-save.
  **Resolution:** use explainable source/annotation/method/data checks and
  human-readable statuses; do not present a hidden probability as truth.

## Handoff recommendation

Use `$ralplan` next with this spec as the requirements source of truth. Planning
should split the work into an information-architecture/current-state home lane,
a reader/post-session synthesis lane, a graph/evidence provenance lane, and a
shared Apple Design system/motion lane, followed by browser verification across
desktop/tablet/mobile. Do not reopen the intent interview unless a plan needs
to add a new persisted project model, external search, or TeX workflow.

