# Repository Guidelines

## Project Overview

**学森** — a browser-based academic literature reading assistant. Local-first management of PDF and EPUB files with text-selection annotation, bookmarks, in-reader camera presence indicator, personal dashboard (placeholder data), knowledge graph (placeholder), and recycle bin with soft-delete.

Key constraint: all camera inference runs locally; no server upload for face/presence data.

Project Graph Engineering has a tracked project context layer and an optional
Codex-local Agent execution overlay. The tracked layer is
[`docs/GRAPH_ENGINEERING.md`](docs/GRAPH_ENGINEERING.md) and
[`docs/graph-engineering.json`](docs/graph-engineering.json); when the local
overlay files `docs/AGENT_DEPENDENCY_GRAPH.md` and
`docs/agent-dependency-graph.json` are present, restore them together with
[`docs/agent-run-state.json`](docs/agent-run-state.json). When the user asks to
continue, iterate, or use Graph Engineering, start only unblocked Agent nodes,
preserve ownership/contracts, and update the local overlay and tracked project
graph after review, QA, and integration verification.

---

## Architecture & Data Flow

```
Component / Hook
    │
    ├─ useXxxStore(selector) ──→ Zustand Store (in-memory)
    │       │                      │
    │       │                      ├─ async actions → db/*.ts
    │       │                      │       │
    │       │                      │       └─ getDb() → idb (IndexedDB)
    │       │                      │
    │       │                      └─ selectors (pure functions on state)
    │       │
    │       └─ useShallow() for array selectors
    │
    └─ useXxxStore.getState() ──→ imperative cross-store access
```

### Routing (React Router v6 Data Router)

AppShell wraps pages A–D (`/`, `/dashboard`, `/knowledge-graph`, `/trash`).  
Reader page (`/read/:fileId`) is a standalone fullscreen route outside AppShell.  
Catch-all redirects to `/`.

Route metadata via `handle` (not `useMatches` with `BrowserRouter` — that causes black screen).

**Lazy loading**: Dashboard, KnowledgeGraph, Reader use `React.lazy()` + `Suspense` with a `RouteFallback` skeleton.

### State Management (Zustand)

9 stores, all plain `create()` — **no middleware** (no persist, immer, devtools):

| Store | Domain | Persistence |
| ------- | -------- | ------------- |
| `fileStore` | File tree CRUD, import, sort, multi-select, trash | IndexedDB |
| `readerStore` | Reader layout, zoom, page mode, find-in-document | localStorage (manual) |
| `bookmarkStore` | Per-file bookmarks | IndexedDB |
| `annotationStore` | Per-file annotations | IndexedDB |
| `sessionStore` | Reading sessions for dashboard | IndexedDB (auto-seeds demo data) |
| `uiStore` | Theme, sidebar, settings drawer, online status | localStorage (manual) |
| `cameraStore` | Camera stream ref, status | — (logic in `useCamera` hook) |
| `pageHeaderStore` | Slot-based breadcrumb + action injection | — |
| `toastStore` | Toast queue + imperative `toast` command API | — |

**Store patterns to follow**:

- State is flat — no nested sub-stores.
- Cross-store access: `useOtherStore.getState()` at call site. No store imports another.
- Selector exports: `selectVisibleFiles(state)` free functions usable with `useStore(selector)` or `getState()`.
- Stale-response guard in per-file stores: `if (get().fileId !== fileId) return` after `await`.
- Nonce counters in `readerStore`: components trigger imperative effects by watching `findNonce`, `fitWidthNonce`, etc.
- Imperative toast: `toast.show()` / `toast.error()` calls `useToastStore.getState().push()` — usable outside React.

### IndexedDB Layer (`src/db/`)

Database `xuesen` v4, 5 object stores via `idb`:

| Store | Key | Indexes |
| ------- | ----- | --------- |
| `files` | id | by-parent (parentId), by-deleted (deletedAt) |
| `fileBlobs` | id | — |
| `sessions` | id | by-started (startedAt), by-file (fileId) |
| `annotations` | id | by-file (fileId), by-created (createdAt) |
| `bookmarks` | id | by-file (fileId) |

Singleton `getDb()` (promise cache). Multi-store writes use explicit `db.transaction(...)` + `Promise.all` + `await tx.done`. Batch writes use the same pattern.

---

## Key Directories

```
src/
  components/
    common/        # Shared UI primitives (Button, Dialog, Table, Toast, etc.)
    layout/        # AppShell, Sidebar, PageHeader, SettingsDrawer, OfflineBanner
  features/
    file-directory/ # File listing, import, search, batch operations, move/delete
    reader/         # PDF/EPUB renderer, selection toolbar, side panels
      canvas/       # PdfRenderer, EpubRenderer, PdfPage, SelectionToolbar
      panels/       # SidePanel, TocPanel, QAPanel, AnnotationPanel
    dashboard/      # MetricCards, ReadingHeatmap, FocusSessionList (placeholder data)
    knowledge-graph/ # EmptyState placeholder (implementation removed)
    trash/          # Trash listing, restore, purge, empty
  hooks/           # useCamera, usePdfDocument, useFocusTrap, usePanelResize, etc.
  stores/          # Zustand stores (one per domain)
  db/              # IndexedDB helpers (one file per table + index.ts bootstrap)
  utils/           # Pure functions, PDF.js config, dashboard metrics, demo data
  styles/
    tokens.css     # ~145 CSS custom properties — THE design token source of truth
  types/
    index.ts       # Single barrel — all TypeScript interfaces and unions
```

---

## Development Commands

| Command | What it does |
| --------- | ------------- |
| `npm run dev` | Vite dev server with HMR (default `localhost:5173`) |
| `npm run build` | `tsc -b` type-check THEN `vite build` production bundle |
| `npm run lint` | Oxlint (react + typescript + oxc plugins) |
| `npm run preview` | Preview production build |

Black screen troubleshooting: stop dev → delete `node_modules/.vite` → `npm run dev` → hard refresh browser.

> **Running headless smoke test**: `node scripts/probe-blank.mjs` (uses Puppeteer + Edge to check console errors and `#root` content).

---

## Code Conventions & Common Patterns

### Exports & Imports

- **Named exports only** — no `export default` anywhere.
- **Relative imports only** — no `@/` path aliases (none configured in Vite).
- `import type` for type-only imports (enforced by `verbatimModuleSyntax`).

### Component Structure

- **Named exports**: `export function Button({ ... }: ButtonProps) { ... }`
- **Props interface** defined in same file (not in `types/`).
- **CSS Modules** co-located: `Button.tsx` + `Button.module.css`. Class names use `camelCase`.
- **Plain CSS** for layout shell only: `Sidebar.css`, `AppShell.css`, `PageHeader.css`, `SettingsDrawer.css` — BEM-ish naming (`.sidebar`, `.sidebar--collapsed`, `.sidebar__user`).
- **Every interactive component has mandatory `aria-label`** in its props.
- **File size**: target &lt; 300 lines per file; extract sub-components or hooks when exceeded.

### CSS Discipline (Mandatory)

- **ZERO hardcoded values** in component CSS. Every color, spacing, duration, radius, shadow, z-index uses `var(--token)`.
- Design tokens defined in `src/styles/tokens.css` (aligned to `UI_spec.md` §1).
- **Theming**: `:root` = light; `[data-theme="dark"]` overrides colors only. Apply via `uiStore.applyDataTheme()` setting `data-theme` on `<html>`.
- **`prefers-reduced-motion: reduce`** zeros all `--dur-*` tokens.
- **No inline `style={{...}}`** — use CSS Modules or class toggles.
- Dark theme override example: only `--bg-*`, `--text-*`, `--accent*`, `--shadow-*` change; sizing/spacing/z-index tokens are shared.

### Zustand Store Patterns

```ts
// Standard store shape
export const useXxxStore = create<XxxState>((set, get) => ({
  // state fields
  items: [],
  status: 'idle' as 'idle' | 'loading' | 'error',
  errorMessage: null as string | null,

  // actions — async wrappers around db helpers
  loadItems: async () => {
    set({ status: 'loading' });
    try {
      const items = await xxxDb.listItems();
      set({ items, status: 'idle' });
    } catch (e) {
      set({ status: 'error', errorMessage: (e as Error).message });
    }
  },
}));

// Component consumption — useShallow for array selectors
const files = useFileStore(useShallow(s => s.files));

// Cross-store access — imperative, at call site
const toast = useToastStore.getState();
const file = useFileStore.getState().files.find(...);
```

### Type System

- Single barrel file: `src/types/index.ts` (~260 lines). No sub-modules.
- Entity interfaces: `FileNode`, `ReadingSession`, `Bookmark`, `Annotation`, `QaMessage`, `GraphNode`, `GraphEdge`, `CameraState`, `MetricSample`, `DistractionEvent`.
- Union types (string literals only): `FileType`, `DistractionKind`, `AnnotationColor`, `QaRole`, `QaMessageStatus`, `GraphNodeKind`, `CameraStatus`.
- Soft-delete pattern: `deletedAt: string | null` (nullable timestamp, not boolean flag).
- All aligned to `UI_spec.md` §9 — don't invent new field names.

### Error Handling

- Stores set `status: 'error'` + `errorMessage` string; components reactively render error UI.
- DB helpers let errors propagate — stores catch and surface.
- Per-file stores (bookmark, annotation) guard against stale responses after fast file-switching: `if (get().fileId !== fileId) return`.

### Comment Style

- File top: 2–4 line JSDoc describing responsibility.
- Components: JSDoc with `@param` for props.
- Business logic: Chinese inline comments explaining **why**, not what (the code shows what).
- CSS tokens: inline comment with semantic meaning.

### ID Generation

`createId('prefix')` → `"prefix_<uuid>"` using `crypto.randomUUID()` with `Date + Math.random` fallback.

---

## Important Files

| File | Role |
| ------ | ------ |
| `src/main.tsx` | App entry — mounts React root, loads tokens + index.css |
| `src/App.tsx` | Data Router definition, lazy route config, ToastViewport |
| `src/types/index.ts` | All TypeScript types — source of truth for data shapes |
| `src/styles/tokens.css` | All CSS custom properties — design token source of truth |
| `src/db/index.ts` | IndexedDB bootstrap, schema v4, singleton `getDb()` |
| `src/stores/fileStore.ts` | Largest store (~675 lines) — file tree, import, batch ops |
| `src/stores/readerStore.ts` | Reader UI state — layout, zoom, find, panel widths |
| `src/components/layout/AppShell.tsx` | Global layout: Sidebar + header + content + settings |
| `src/features/reader/ReaderPage.tsx` | Reader fullscreen page — orchestrates TopBar, canvas, panels |
| `src/utils/pdfjs.ts` | PDF.js worker config (`?url` import for offline), document loading |
| `src/utils/linesReadStore.ts` | Module-level Set-based read-line tracker (pub/sub, not Zustand) |
| `UI_spec.md` | Design specification authority (~855 lines) |
| `PROGRESS.md` | Progress tracker, TODOs, tech debt, change log |
| `HANDOFF.md` | Dashboard & knowledge graph handoff — data interfaces, integration order |

---

## Runtime/Tooling Preferences

| Concern | Choice |
| --------- | -------- |
| Runtime | Node 22+ (not enforced in engines, but development standard) |
| Package manager | npm (lockfile v3, `package-lock.json`) |
| Module system | ES modules (`"type": "module"`) |
| Bundler | Vite 6 |
| TypeScript | 5.8, `strict: true`, bundler module resolution, `react-jsx` |
| Linter | Oxlint (react + typescript + oxc plugins) |
| Icons | `lucide-react` — use `<IconName size={16} />` |
| Force graph | `react-force-graph-2d` (NOT umbrella `react-force-graph` — pulls aframe) |

### TS Strictness Flags in Use

`strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUncheckedSideEffectImports`.

---

## Testing & QA

No formal test framework is configured. Current QA approach:

- **Manual smoke test**: `npm run dev` + browser interaction.
- **Automated probe**: `scripts/probe-blank.mjs` launches headless Edge, connects to dev server, dumps console errors and `#root` content to `probe-blank-result.json`.
- **Type checking during build**: `tsc -b` runs before `vite build`.

When adding tests, prefer Vitest (Vite-native, same config as dev).

## Reading Monitor Integration

The `monitor/` directory contains the Python behaviour-detection engine. It runs as an HTTP API server; the browser calls it to start/stop detection and retrieve session data.

### Architecture

```
┌─ Browser (xuesen) ─────────────────────────────────────────────┐
│                                                                 │
│  ReaderPage ──→ monitorApi.ts ──→ HTTP POST /api/detect/start  │
│       │                              (fileId in body)           │
│       │                                                         │
│  DashboardPage ←── sessionStore ←── IndexedDB                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
        │                                    ↑
        │  HTTP (localhost:8765)             │ JSONL sessions
        ↓                                    │
┌─ Python (monitor/) ────────────────────────────────────────────┐
│                                                                 │
│  server.py (Flask) ←── ReadingMonitor (main.py)                │
│       │                    │                                    │
│       │                    ├─ YOLOv8 (phone, drink objects)    │
│       │                    ├─ MediaPipe Pose (head down)        │
│       │                    ├─ MediaPipe Face (gaze, talking)    │
│       │                    └─ DAiSEE ONNX (engagement)          │
│       │                                                         │
│       └──→ sessions/*.jsonl                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Quick Start

```bash
# Terminal 1: start Python API server
pip install -r monitor/requirements.txt
python monitor/server.py                    # default port 8765

# Terminal 2: start xuesen dev server
npm run dev
```

### API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/detect/start` | Start detection. Body: `{ fileId?: string }` |
| `POST` | `/api/detect/stop` | Stop detection, return session path |
| `GET` | `/api/detect/status` | Query running state, frame count, current fileId |
| `GET` | `/api/sessions` | List all JSONL sessions with metadata |
| `GET` | `/api/sessions/<id>` | Get full frame data for a session |
| `GET` | `/api/sessions/<id>/analyze` | Get analyzed focus report |
| `GET` | `/api/health` | Health check |

### TypeScript Client (`src/utils/monitorApi.ts`)

```ts
import {
  startDetection,       // (fileId?: string) → { sessionId, status }
  stopDetection,        // () → { sessionId, path, frameCount }
  getDetectionStatus,   // () → { running, sessionId, frameCount, fileId }
  listSessions,         // () → SessionMeta[]
  getSessionFrames,     // (id) → { sessionId, frames }
  getSessionAnalysis,   // (id) → SessionAnalysis
  checkHealth,          // () → boolean
} from '../utils/monitorApi';
```

### Auto-Detection Flow

1. User opens a paper → `ReaderPage` mounts
2. `ReaderPage` calls `startDetection(fileId)` → Python monitor begins recording
3. `useReadingSession` creates an IndexedDB session tracking `fileId`, `linesRead`
4. User closes reader → `ReaderPage` cleanup calls `stopDetection()`
5. `useReadingSession` finalizes the session (endedAt, durationSec)
6. Dashboard reads real sessions from `sessionStore` (no more placeholders)

### Label Mapping

| Monitor label | xuesen DistractionKind | Notes |
| --- | --- | --- |
| `playing_phone` | `phone` | Direct |
| `drinking` | `drink` | Direct |
| `chatting` | `talk` | Direct |
| `head_down` | `away` | Semantic — head down = not focused |
| `gaze_center: false` | `gaze_off` | Lowest priority |

### Current Gaps

- Detection sessions and IndexedDB sessions are separate — need to merge Python session data into IndexedDB via `monitorAdapter`
- No real-time streaming — detection is batch (start→stop→analyze)
- `ReadingSession` type lacks engagement distribution field
- `DistractionKind: 'yawn'` exists in xuesen but not detected by monitor

---

## Common Pitfalls

| Symptom | Likely Cause |
| --------- | ------------- |
| Entire page black, `#root` empty | Used `BrowserRouter` + `useMatches` instead of Data Router |
| `Maximum update depth exceeded` in file directory | Array selector without `useShallow` |
| `AFRAME is not defined` | Installed umbrella `react-force-graph` instead of `react-force-graph-2d` |
| Multi-select cancel leaves action buttons visible | Stale JS hover state — hard refresh |
| Dashboard numbers don't match reading activity | Expected: current data is from `dashboardPlaceholders.ts` |
| EPUB text selection unreliable | Known tech debt — epub.js iframe isolation limits selection |


<claude-mem-context>
# Memory Context

# claude-mem status

This project has no memory yet. The current session will seed it; subsequent sessions will receive auto-injected context for relevant past work.

Memory injection starts on your second session in a project.

`/learn-codebase` is available if the user wants to front-load the entire repo into memory in a single pass (~5 minutes on a typical repo, optional). Otherwise memory builds passively as work happens.

Live activity: http://localhost:37777
How it works: `/how-it-works`

This message disappears once the first observation lands.
</claude-mem-context>
