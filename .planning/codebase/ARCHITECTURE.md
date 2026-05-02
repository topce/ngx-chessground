<!-- refreshed: 2026-05-02 -->
# Architecture

**Analysis Date:** 2026-05-02

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                     Example Application Layer                             │
│           `projects/ngx-chessground-example/src/app/`                     │
├─────────────┬────────────────┬───────────────┬──────────────┬────────────┤
│ app.component│  pgn-viewer/   │ play-like-goat│    goat/     │    me/     │
│ (toolbar+    │ (wraps library │    (table,    │ (chessboard  │ (chessboard│
│  router)     │  PGN viewer)   │   promotion)  │   examples)  │  examples) │
└──────┬───────┴───────┬────────┴───────┬───────┴──────┬───────┴──────┬─────┘
       │               │                │              │              │
       ▼               ▼                ▼              ▼              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          ngx-chessground Library                         │
│                 `projects/ngx-chessground/src/lib/`                      │
├───────────────────┬─────────────────┬─────────────────────┬──────────────┤
│ NgxChessground    │ NgxChessground  │ NgxPgnViewer        │ Promotion    │
│ Component         │ Table Component │ Component           │ Dialog       │
│ (core chessboard) │ (table wrapper) │ (PGN analysis/view)│ (piece pick) │
└────────┬──────────┴────────┬────────┴──────────┬──────────┴──────┬───────┘
         │                   │                   │                 │
         ▼                   ▼                   ▼                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        Services / Engine Layer                            │
│  `NgxChessgroundService` (snabbdom rendering)                            │
│  `PgnViewerEngineService` (Web Workers for PGN + Stockfish)              │
│  `PromotionService` (Material Dialog wrapper)                            │
└──────────────────────┬───────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     External Dependencies / Workers                       │
│  `chessground` (board rendering)  |  `chess.js` (game logic)             │
│  `snabbdom` (virtual DOM)         |  `chessops` (PGN parsing)            │
│  `fzstd` (decompression)          |  `stockfish.js` (analysis engine)    │
│  `pgn-processor.worker` (Web Worker PGN processing)                      │
└──────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     Demo Units (Reusable Configs)                         │
│  `projects/ngx-chessground/src/units/`                                   │
│  Pattern: `Unit = { name: string; run: (el: HTMLElement) => Api }`       │
│  Covers: basics, anim, fen, play, pgn, svg, in3d, perf, zh, viewOnly    │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `NgxChessgroundComponent` | Core chessboard rendering; accepts a `runFunction` model that configures and returns a chessground `Api`. Delegates rendering to `NgxChessgroundService`. | `projects/ngx-chessground/src/lib/ngx-chessground/ngx-chessground.component.ts` |
| `NgxChessgroundTableComponent` | Higher-level wrapper around `NgxChessgroundComponent`; wires up predetermined chess unit configurations (e.g., play units with promotion dialog). | `projects/ngx-chessground/src/lib/ngx-chessground-table/ngx-chessground-table.component.ts` |
| `NgxPgnViewerComponent` | Full-featured PGN viewer: loading (clipboard, file, zip, URL, Lichess monthly DB), game navigation, move filtering, game replay with clock support, Stockfish analysis, and evaluation display. | `projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer.component.ts` |
| `PromotionDialogComponent` | Angular Material dialog for pawn promotion piece selection (Queen, Rook, Bishop, Knight). Returns chosen piece via `MatDialogRef.close()`. | `projects/ngx-chessground/src/lib/promotion-dialog/promotion-dialog.component.ts` |
| `NgxChessgroundService` | Manages the `Chessground` instance lifecycle and renders it via `snabbdom` virtual DOM patching. Owns the patch function and vnode. | `projects/ngx-chessground/src/lib/ngx-chessground.service.ts` |
| `PgnViewerEngineService` | Manages two Web Workers: a PGN processor worker for parsing/filtering PGN databases, and a Stockfish worker for position analysis. Provides `initialize`, `loadPgn`, `filterGames`, `loadGame`, `analyzePosition`, and `dispose` APIs. | `projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer-engine.service.ts` |
| `PromotionService` | Opens an Angular Material dialog for pawn promotion; resolves the promise with the chosen piece (`'q'`, `'r'`, `'b'`, `'n'`). Provided in root. | `projects/ngx-chessground/src/lib/promotion-dialog/promotion.service.ts` |

## Pattern Overview

**Overall:** Standalone Component architecture with signal-based reactivity, zoneless change detection, and `Unit` factory pattern for chessboard configurations.

**Key Characteristics:**
- All components are **standalone** (no `NgModule` declarations — `imports` in component metadata)
- **Zoneless change detection** (`provideZonelessChangeDetection()` in example app; `test-providers.ts` for tests)
- **`OnPush` change detection** on library components
- **Signal-based reactivity**: `input()`, `model()`, `computed()`, `viewChild.required()`, `effect()`, `signal()` used throughout
- **`Unit` pattern**: Chessboard configurations are typed as `{ name: string; run: (el: HTMLElement) => Api }` — these are pure functions that take a DOM element and return a configured `chessground.Api`
- **Web Workers** offload PGN parsing/filtering and Stockfish analysis from the main thread
- **snabbdom** is used as a virtual DOM layer between Angular and chessground (not Angular's built-in renderer)

## Entry Points

**Library entry point:**
- Location: `projects/ngx-chessground/src/public-api.ts`
- Exports: All components (`NgxChessgroundComponent`, `NgxChessgroundTableComponent`, `NgxPgnViewerComponent`, `PromotionDialogComponent`), services (`PgnViewerEngineService`, `PromotionService`), and all unit definitions
- ng-packagr config: `projects/ngx-chessground/ng-package.json` points `entryFile` to this file
- Path alias: `tsconfig.json` maps `"ngx-chessground"` → `"projects/ngx-chessground/src/public-api.ts"`

**Example app entry point:**
- Location: `projects/ngx-chessground-example/src/main.ts`
- Bootstraps `AppComponent` with `provideRouter`, `provideAnimations`, `provideZonelessChangeDetection`, `provideServiceWorker`
- Root component: `projects/ngx-chessground-example/src/app/app.component.ts` (toolbar + router outlet)

**Example app routing:**
- Location: `projects/ngx-chessground-example/src/app/app.routes.ts`
- Routes: `''` → redirects to `pgn-viewer`, `play-like-goat`, `goat`, `me`, `pgn-viewer` (lazy-loaded)
- Fallback: `**` → redirects to `''`

## Layers

**Component Layer:**
- Purpose: Angular components that render DOM and handle user interaction
- Location: `projects/ngx-chessground/src/lib/{ngx-chessground,ngx-chessground-table,pgn-viewer,promotion-dialog}/`
- Contains: `.component.ts`, `.component.html`, `.component.{scss,css}` files
- Depends on: Service layer, external libraries (`chessground`, `chess.js`), Angular core
- Used by: Consumer applications (example app via imports, external apps via npm)

**Service Layer:**
- Purpose: Encapsulate stateful logic (board rendering engine, PGN worker management, dialog service)
- Location: `projects/ngx-chessground/src/lib/{ngx-chessground.service.ts,pgn-viewer/pgn-viewer-engine.service.ts,promotion-dialog/promotion.service.ts}`
- Contains: Injectable classes with `@Injectable()` decorator
- Depends on: External libraries (`chessground`, `snabbdom`, Web Worker API), Angular Material (`MatDialog`)
- Used by: Component layer

**Worker Layer:**
- Purpose: Offload CPU-intensive work from the main thread
- Location: `projects/ngx-chessground/src/lib/pgn-viewer/pgn-processor.worker.ts`
- Contains: Web Worker entry point; communicates via typed `postMessage` protocol (`WorkerMessage`/`WorkerResponse` types)
- Depends on: `chess.js`, `chessops`
- Used by: `PgnViewerEngineService`

**Units Layer:**
- Purpose: Reusable, pure-function chessboard configurations (demos, examples, building blocks)
- Location: `projects/ngx-chessground/src/units/`
- Contains: 14 files exporting `Unit` objects or factory functions
- Depends on: `chessground`, `chess.js`, `Unit` interface (`unit.ts`)
- Used by: Components (`NgxChessgroundTableComponent` imports `units/play`), example app

## Data Flow

### Primary Chessboard Rendering Path

1. Consumer sets `NgxChessgroundComponent.runFunction` model with a `(el: HTMLElement) => Api` function
2. `effect()` detects the change and calls `#redraw()` (`ngx-chessground.component.ts:43`)
3. `redraw()` retrieves the `#chessboard` `ElementRef` via `viewChild` and calls `NgxChessgroundService.redraw()` (`ngx-chessground.component.ts:70-74`)
4. `NgxChessgroundService.redraw()` creates a `Chessground` instance on the element, then patches a snabbdom vnode that invokes `runFn` on insert/postpatch (`ngx-chessground.service.ts:51-55`)
5. The `runUnit` virtual DOM hook extracts the real DOM element from snabbdom's vnode and calls `runFn(el)`, which returns the configured `Api` (`ngx-chessground.service.ts:89-93`)

### PGN Loading Path

1. PGN string enters via `NgxPgnViewerComponent.pgn` input binding → triggers an `effect()` (`pgn-viewer.component.ts:580-587`)
2. `loadPgnString()` resets state and calls `PgnViewerEngineService.loadPgn()` (`pgn-viewer.component.ts:940-951`)
3. Worker posts back a `{ type: 'load', payload: { metadata[], count } }` message
4. `handleWorkerMessage()` processes metadata, populates filter options, auto-loads first game (`pgn-viewer.component.ts:634-776`)
5. Game loading: `loadGame(index)` → worker parses specific game → component receives moves/fen/evaluations → renders board via `runFunction` computed signal

### Move Navigation Path (PGN Viewer)

1. User clicks move button → calls `jumpToMove(index)` or `next()`/`prev()`
2. Navigation methods reset `chess.js` instance and replay moves up to target index
3. `currentFen` and `currentMoveIndex` signals are updated
4. The `runFunction` computed signal recalculates (depends on `currentFen()`, `lastMoveSquares()`, `filterMoves()`)
5. `effect()` in `NgxChessgroundComponent` detects the `runFunction` model change and triggers redraw

### Promotion Dialog Path

1. During gameplay, a pawn reaches the last rank
2. `playOtherSideWithDialog()` (`units/util.ts:141`) detects the promotion condition
3. Calls `PromotionService.showPromotionDialog(color)` which opens `PromotionDialogComponent` via `MatDialog`
4. User clicks a piece button → `dialogRef.close(piece)` resolves the promise
5. The selected piece is applied to both the `chess.js` instance and the chessground board via `cg.setPieces()`

## Key Abstractions

**`Unit` pattern:**
- Purpose: Encapsulates a chessboard configuration as a named, reusable factory function
- Defined in: `projects/ngx-chessground/src/units/unit.ts`
- Shape: `{ name: string; run: (el: HTMLElement) => Api }`
- Examples: `initial`, `castling`, `playVsRandom` (`units/play.ts`), `autoSwitch` (`units/fen.ts`), `presetUserShapes` (`units/svg.ts`)

**`runFunction` model:**
- Purpose: Bridge between Angular's signal reactivity and chessground's imperative API
- Pattern: A `model<(el: HTMLElement) => Api>()` on `NgxChessgroundComponent` that consumers set to configure the board
- When the function changes (due to signal dependencies inside a `computed()`), an `effect()` triggers a full redraw

**`WorkerMessage` / `WorkerResponse` protocol:**
- Purpose: Typed communication between main thread and PGN processor Web Worker
- Messages: `load` (parse all games), `filter` (filter by criteria), `loadGame` (parse single game), `error`
- Defined in: `projects/ngx-chessground/src/lib/pgn-viewer/pgn-processor.worker.ts`

**`FilterCriteria` abstraction:**
- Purpose: Serializable filter specification passed to the worker
- Fields: `white`, `black`, `result`, `moves`, `ignoreColor`, `targetMoves`, rating ranges, `eco`, `timeControl`, `event`

## Architectural Constraints

- **Threading:** Single-threaded Angular event loop on the main thread. CPU-intensive PGN parsing/filtering is offloaded to a dedicated `pgn-processor.worker`. Stockfish engine runs in a separate `stockfish.worker`. Both workers are managed by `PgnViewerEngineService`.
- **Zoneless:** The library and example app use zoneless change detection. All state changes must be signal-based (`signal()`, `computed()`, `model()`, `input()`) or happen inside Angular's `effect()` to trigger re-renders. No `ChangeDetectorRef.markForCheck()`.
- **Global state:** `NgxChessgroundService` holds mutable state (`cg`, `vnode`, `runFn`) that persists across redraws. `PgnViewerEngineService` holds worker references as module-scoped singletons (`providedIn: 'root'`).
- **Circular imports:** Not detected.
- **Standalone only:** This codebase does not use `NgModule`-based components. Everything is standalone.

## Anti-Patterns

### Direct DOM Mutation Outside Angular

**What happens:** `NgxChessgroundService` uses `snabbdom` to directly patch the DOM inside the chessboard container, bypassing Angular's template renderer entirely.
**Why it's correct here:** Chessground requires direct control of the chessboard element. The snabbdom bridge is intentionally scoped to a single container element (`#chessground-examples`) and managed through Angular's lifecycle (`ngAfterViewInit`, `effect()`). This is the accepted pattern for wrapping third-party imperative libraries in Angular.
**Do this instead:** Keep using snabbdom for the board, but ensure all state that feeds into the board rendering passes through Angular signals (as done with `runFunction` model).

### Mixing `Default` and `OnPush` Change Detection

**What happens:** `PromotionDialogComponent` uses `ChangeDetectionStrategy.Default` due to incomplete migration to zoneless, while all other library components use `OnPush`.
**Why it's wrong:** Inconsistent change detection strategies can cause unpredictable rendering in zoneless mode.
**Do this instead:** Migrate `PromotionDialogComponent` to `ChangeDetectionStrategy.OnPush` (a TODO comment already exists at `promotion-dialog.component.ts:20-22`).

## Error Handling

**Strategy:** Catch-and-log with user-facing snackbar notifications.

**Patterns:**
- PGN loading errors: caught in `loadFromUrl()`, `onPgnFileSelected()`, `onPgnZipSelected()` → `showMessage()` via `MatSnackBar`
- Worker errors: `handleWorkerMessage` handles `type: 'error'` messages with `console.error`
- Stockfish errors: `PgnViewerEngineService.initialize()` catches worker creation failures and calls `onError` callback
- Promotion dialog cancellation: caught in `playOtherSideWithDialog()`, defaults to queen promotion
- Move errors: `handleBoardMove()` in PGN viewer catches invalid moves and resets FEN

## Cross-Cutting Concerns

**Logging:** Direct `console.error` / `console.warn` calls. No structured logging framework.

**Validation:** Minimal input validation — FEN strings are validated implicitly by `chessground`/`chess.js`; PGN is validated by `chessops`/`chess.js` parsers.

**Authentication:** Not applicable (client-side only library).

---

*Architecture analysis: 2026-05-02*
