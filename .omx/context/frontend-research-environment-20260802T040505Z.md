# Deep Interview Context: AI-era research environment frontend refactor

## Task statement

Completely rethink the frontend so the product is narrated and experienced as
an AI-era research workspace/environment: the researcher should primarily read
papers while AI and the environment handle the repetitive work around reading.
Use the Apple Design skill for visual language, direct manipulation, materials,
motion, typography, and accessibility. Clarify unresolved decisions through a
Deep Interview before implementation.

## Desired outcome

Move the product from a collection of useful research tools to a coherent
research environment with a legible end-to-end workflow, strong reading-first
focus, AI assistance that is visible but accountable, and an interface that
feels calm, spatially continuous, and ready for real daily use.

## Stated solution direction

- Completely redesign the frontend, including page hierarchy, narrative,
  navigation, motion, and interaction patterns.
- Preserve the user's attention on paper reading; delegate clerical work to AI
  and the environment.
- Apply Apple Design principles rather than adding decorative animation.
- Ask focused clarification questions where the desired environment is not yet
  explicit.

## Probable intent hypothesis

The current implementation exposes capabilities as separate routes (library,
graph, matrix, dashboard, reader). The user wants the product to communicate a
continuous research practice and make its automation/AI value obvious during
the reading flow, so it can be used as a complete working environment rather
than compared with a standalone utility or an AI search box.

## Known codebase facts / evidence

- Brownfield React 18 + Vite 6 + TypeScript application with React Router Data
  Router, Zustand, CSS tokens, and no component library.
- Routes include `/`, `/trash`, `/dashboard`, `/knowledge-graph`,
  `/evidence-matrix`, `/evidence-matrix/:matrixId`, and fullscreen
  `/read/:fileId`.
- Existing domain surfaces: local PDF/EPUB reading, annotations, bookmarks,
  selection toolbar, per-file QA shell, digest placeholder, knowledge graph,
  cross-paper evidence matrix, research analysis, session dashboard, and trash.
- Persistence is local-first IndexedDB plus localStorage; the monitor service
  is local HTTP and camera inference stays local.
- AI configuration exists in settings (`baseUrl`, `apiKey`, `model`, language,
  citation preference), but several AI workflows remain incomplete or shell-only.
- Current docs explicitly position the graph as navigation clues and the matrix
  as the source of citable, user-confirmed material.
- A previous UI phase established four product groups: library, research
  workspace, progress, and immersive reading, but the user now judges that
  narrative as still tool-oriented.
- Current global tokens are mostly fixed pixel values, with CSS motion tokens,
  light/dark themes, and reduced-motion support already present.
- Current branch is `codex/ui-system-redesign`; worktree was clean before this
  interview began.

## Constraints

- Do not silently weaken provenance, citation, or evidence verification rules.
- Keep the local-first and local camera privacy boundaries.
- Avoid introducing a new component library or animation dependency without a
  justified decision; reuse existing patterns where possible.
- Preserve backward-compatible route/data contracts unless the interview
  explicitly approves a change.
- New UI must support desktop, tablet, mobile, keyboard, reduced motion,
  reduced transparency, and high contrast.
- The frontend must remain useful when AI is unavailable or offline; AI output
  must be distinguishable from verified source evidence.

## Unknowns / open questions

- Which repetitive research tasks are in scope for autonomous assistance?
- Is the core unit a paper, a research question, a project, or a reading
  session?
- What should the first screen do and show for a returning researcher?
- How proactive may AI be, and what requires user confirmation?
- Should the product include project/workspace concepts beyond the current
  route structure?
- What does “完全交付使用的环境” mean operationally: writing handoff,
  research memory, project coordination, or only reading-to-evidence?
- Which existing features are non-negotiable, and which may be demoted or
  removed from the primary path?

## Decision-boundary unknowns

- Whether adding a project/research-question layer is allowed.
- Whether the reader remains a standalone route or becomes the primary shell.
- Whether AI may create or update persistent research artifacts automatically.
- Whether external search, writing export, or citation-manager integration is
  part of this redesign or explicitly out of scope.
- Whether visual identity should remain restrained/neutral or introduce a new
  product brand and stronger editorial tone.

## Likely codebase touchpoints

- `src/App.tsx`, `src/components/layout/*`, `src/features/reader/*`
- `src/features/file-directory/*`, `knowledge-graph/*`,
  `evidence-matrix/*`, `dashboard/*`
- `src/stores/*`, `src/types/index.ts`, `src/styles/tokens.css`, `src/index.css`
- `UI_spec.md`, `HANDOFF.md`, `PROGRESS.md`, and new design/implementation
  planning artifacts under `docs/plans/`

## Interview progress

### Round 1 — core scenario

The user described the intended flow as: search for papers, download them,
personally read and annotate, then let the environment organize the material,
build an intelligent layered graph, synthesize the literature, and surface
research bias and research gaps. Desired outputs include a personalized,
layered research graph, red/blue-ocean analysis, and eventually local TeX
analysis for target-journal formatting, citations, and error scanning.

### Round 1 scoring (provisional)

| Dimension | Clarity | Gap |
|---|---:|---|
| Intent | 0.85 | The attention shift from clerical work to reading is explicit. |
| Outcome | 0.70 | Several valuable outcomes are named, but no primary artifact yet. |
| Scope | 0.30 | Search, download, reading, synthesis, graphing, strategy analysis, and TeX QA span multiple phases. |
| Constraints | 0.40 | Local TeX analysis is requested; trust, privacy, and external-service boundaries remain open. |
| Success criteria | 0.25 | No observable threshold for “useful” research outputs yet. |
| Context | 0.90 | Existing route, reader, graph, matrix, and local persistence facts are grounded. |

Provisional brownfield ambiguity: 41%. The next question must force a primary
artifact and a scope tradeoff before implementation planning.

### Round 2 — primary artifact

The user prioritized the layered personal research graph and cross-paper
literature review/evidence matrix because they strengthen the citation/evidence
chain and reasoning chain, and make it easier to build a personal research
direction/bias profile.

### Round 2 scoring (provisional)

| Dimension | Clarity | Gap |
|---|---:|---|
| Intent | 0.90 | The desired value is tied to evidence and reasoning continuity. |
| Outcome | 0.85 | Two primary artifacts are explicit. |
| Scope | 0.45 | The graph/matrix relationship is prioritized, but surrounding capabilities remain broad. |
| Constraints | 0.50 | Provenance is implied as essential; automation and trust boundaries are not explicit. |
| Success criteria | 0.45 | Evidence-chain usefulness is named, but acceptance signals are not measurable. |
| Context | 0.90 | Brownfield touchpoints remain well grounded. |

Provisional brownfield ambiguity: 31%. Non-goals and decision boundaries remain
open; the next round is a contrarian probe of the meaning and safety of
personalization.

### Round 3 — two kinds of personal bias

The user wants both explicit personal research positions/preferences and
system-inferred interests/blind spots represented in the environment.

The distinction between user-authored stance and system inference is therefore
mandatory, but the conflict-resolution rule, confidence language, editability,
and evidence requirements are still unresolved.

### Round 3 scoring (provisional)

| Dimension | Clarity | Gap |
|---|---:|---|
| Intent | 0.90 | Both reflective and inferred personalization are desired. |
| Outcome | 0.85 | A graph that can hold both kinds of research direction is clear. |
| Scope | 0.50 | The model now needs provenance/status UX in addition to graph and matrix. |
| Constraints | 0.55 | Separation is required; conflict and automation rules are open. |
| Success criteria | 0.45 | No test for whether a user can distinguish, correct, or challenge an inference. |
| Context | 0.90 | Existing graph and evidence provenance constraints remain applicable. |

Provisional brownfield ambiguity: 28%. The next question targets the unresolved
decision boundary when explicit stance and inferred preference disagree.

### Round 4 — conflict as a review lead

When explicit stance and system inference disagree, the default result should
be an automatically generated “偏向冲突 / 待审视” research lead rather than a
silent overwrite or a forced system verdict.

This establishes a product principle: personalization should expose tension for
researcher review, not conceal it behind a confidence score.

### Round 4 scoring (provisional)

| Dimension | Clarity | Gap |
|---|---:|---|
| Intent | 0.92 | The environment should support reflection without deciding for the researcher. |
| Outcome | 0.88 | Conflict leads are a concrete graph/research artifact. |
| Scope | 0.55 | Timing and presentation of the lead are still open. |
| Constraints | 0.62 | No silent overwrite; provenance/status must remain visible. |
| Success criteria | 0.50 | Need a measurable rule for useful, non-disruptive review leads. |
| Context | 0.90 | Existing graph/matrix provenance model supports this direction. |

Provisional brownfield ambiguity: 25%. The next question applies the simplifier
mode to protect the reading-first experience.

### Round 5 — timing of conflict review

The user chose to generate the “偏向冲突 / 待审视” summary automatically when
the reading session ends. The reading surface should therefore remain quiet,
while the environment performs reflective synthesis at a natural transition.

### Round 5 scoring (provisional)

| Dimension | Clarity | Gap |
|---|---:|---|
| Intent | 0.94 | Reading concentration is explicitly protected. |
| Outcome | 0.90 | A post-reading reflective summary is a concrete handoff artifact. |
| Scope | 0.58 | Post-session synthesis is bounded, but artifact persistence is open. |
| Constraints | 0.68 | Non-disruption is clear; provenance and confirmation gates remain. |
| Success criteria | 0.56 | Need a criterion for a useful summary and acceptable interruption cost. |
| Context | 0.90 | Existing reader/session stores and graph/matrix surfaces are relevant. |

Provisional brownfield ambiguity: 21%. The next question targets AI write access
and the explicit decision boundary for persistent research artifacts.

### Round 6 — persistence and review gates

The user approved direct persistence for content that is unambiguous and
supported by the original text plus annotations, and for cross-paper consensus.
Anything with annotation/source conflict or inter-paper conflict must remain a
reviewable draft. The unresolved detail is how the system operationalizes
“unambiguous” and “consensus” without overstating certainty.

### Round 6 scoring (provisional)

| Dimension | Clarity | Gap |
|---|---:|---|
| Intent | 0.94 | AI should remove clerical work while preserving researcher control. |
| Outcome | 0.92 | Persistent graph/matrix artifacts and review queues are defined. |
| Scope | 0.62 | The core workflow is bounded, but search and TeX QA remain adjacent asks. |
| Constraints | 0.76 | Provenance, conflict handling, and confirmation gates are explicit. |
| Success criteria | 0.62 | Evidence thresholds still need operational definitions. |
| Context | 0.90 | Existing evidence rows, locators, and verification statuses can host this. |

Provisional brownfield ambiguity: 19%. The next question pressure-tests the
evidence threshold behind automatic persistence.

### Round 7 — evidence threshold

The user delegated the single-paper professional threshold to the design/AI
planner, with the expectation that it be explicit and explainable. For
cross-paper consensus, at least three papers are required, and the system must
check counterexamples, research methods, and dataset independence. Any
counterexample downgrades the result to “待审核 / 有争议”.

The provisional single-paper rule will require a resolvable source locator,
source text that supports the normalized claim, annotation/context support when
available, and no unresolved contradiction. The exact UI and scoring language
remain to be designed without presenting a probability as truth.

### Round 7 scoring (provisional)

| Dimension | Clarity | Gap |
|---|---:|---|
| Intent | 0.95 | The desired trust model and reading-first purpose are stable. |
| Outcome | 0.93 | Evidence-backed graph/matrix persistence and conflict review are clear. |
| Scope | 0.65 | Core reading-to-evidence loop is bounded; search/download and TeX QA are not. |
| Constraints | 0.80 | Three-paper corroboration and counterexample handling are explicit. |
| Success criteria | 0.70 | Evidence checks are testable; usability and research value metrics remain. |
| Context | 0.90 | Existing source locator and verification models provide implementation anchors. |

Provisional brownfield ambiguity: 17%. Non-goals and decision boundaries are
still incomplete, so the interview continues despite the near-threshold score.

### Round 8 — explicit non-goals for this refactor

The current phase will complete the local-first loop: import local papers,
read/annotate, let AI organize them, and produce the personal graph and
cross-paper evidence matrix. External paper search/download and TeX or target-
journal checks are explicitly deferred to a later phase.

### Round 8 scoring (provisional)

| Dimension | Clarity | Gap |
|---|---:|---|
| Intent | 0.96 | The reading-first environment goal is stable. |
| Outcome | 0.94 | The local reading-to-evidence loop is the concrete delivery target. |
| Scope | 0.80 | In-scope and deferred capabilities are now explicit. |
| Constraints | 0.82 | Local-first, provenance, and AI review gates are known. |
| Success criteria | 0.72 | Functional loop is clear; first-screen wayfinding and qualitative bar remain. |
| Context | 0.90 | Brownfield route/store boundaries are grounded. |

Provisional brownfield ambiguity: 13%. The next question resolves the first
viewport and return-state decision for the redesigned environment.

### Round 9 — return state / first viewport

The default landing view for a returning researcher should be the current
research state, not the raw file list. The state should summarize active work,
recent reading, pending evidence review, and AI-produced research leads, with
the library remaining an available supporting route.

### Final scoring (provisional)

| Dimension | Clarity | Gap |
|---|---:|---|
| Intent | 0.97 | The product is a reading-first research environment that removes clerical work. |
| Outcome | 0.96 | A current-research-state home plus graph/matrix evidence loop is explicit. |
| Scope | 0.84 | This phase is local reading-to-evidence; search/download and TeX QA are deferred. |
| Constraints | 0.86 | Local-first privacy, provenance, conflict review, and non-disruptive reading are explicit. |
| Success criteria | 0.78 | Functional and trust criteria are clear; visual quality requires browser review. |
| Context | 0.92 | Existing routes, stores, reader, graph, and matrix are mapped. |

Final provisional brownfield ambiguity: 9%. Readiness gates are satisfied:
non-goals are explicit, decision boundaries are explicit, and the interview
included contrarian and simplifier pressure passes.
