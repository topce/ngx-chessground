# NgxChessground

[![npm version](https://badge.fury.io/js/ngx-chessground.svg)](https://badge.fury.io/js/ngx-chessground)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](https://opensource.org/licenses/GPL-3.0)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-%23EA4AAA.svg?logo=github&logoColor=white)](https://github.com/sponsors/topce)

Angular wrapper for [ornicar/chessground](https://github.com/ornicar/chessground), the premier open-source chess UI library used by lichess.org.

---

## Table of Contents

- [Demo](#demo)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Components](#components)
  - [NgxChessgroundComponent](#ngxchessgroundcomponent)
  - [NgxChessgroundTableComponent](#ngxchessgroundtablecomponent)
  - [NgxPgnViewerComponent](#ngxpgnviewercomponent)
  - [PromotionDialogComponent](#promotiondialogcomponent)
- [Services](#services)
  - [NgxChessgroundService](#ngxchessgroundservice)
  - [PgnViewerEngineService](#pgnviewerengineservice)
  - [PromotionService](#promotionservice)
- [Unit Presets](#unit-presets)
- [Utility Functions](#utility-functions)
- [Version Compatibility](#version-compatibility)
- [Contributing](#contributing)
- [License](#license)

---

## Demo

Live demo with a full PGN viewer: [https://topce.github.io/ngx-chessground/](https://topce.github.io/ngx-chessground/)

---

## Installation

```bash
npm install ngx-chessground chess.js chessground snabbdom
```

**Peer dependencies** (must be installed alongside):

| Package | Version |
|---------|---------|
| `@angular/common` | `^21.0.0` |
| `@angular/core` | `^21.0.0` |
| `chess.js` | `1.4.0` |
| `chessground` | `9.2.1` |
| `snabbdom` | `3.6.3` |
| `fzstd` | `^0.1.1` |
| `jszip` | `^3.10.1` |

> **Note**: `fzstd` and `jszip` are only required when using the `NgxPgnViewerComponent` (for compressed PGN/ZIP support).

---

## Quick Start

All components are **standalone**. Import them directly into your standalone component or NgModule `imports` array.

```typescript
import { Component, signal } from '@angular/core';
import { NgxChessgroundComponent } from 'ngx-chessground';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [NgxChessgroundComponent],
  template: `<ngx-chessground [runFunction]="myFn()" />`
})
export class BoardComponent {
  groundApi = signal<Api | null>(null);

  myFn = signal<(el: HTMLElement) => Api>((el) => {
    const api = Chessground(el, {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      orientation: 'white',
      movable: { free: true, color: 'both' }
    });
    this.groundApi.set(api);
    return api;
  });
}
```

The `runFunction` input is the **core mechanism** of the library. It receives the mounted DOM element and must return a `chessground` `Api` instance. This design gives you full control over the chessground configuration while the component manages the lifecycle.

---

## Components

### NgxChessgroundComponent

**Selector**: `<ngx-chessground>`

The fundamental chessboard component. It manages the DOM element and delegates chessground instantiation to the provided `runFunction`.

#### Inputs

| Input | Type | Description |
|-------|------|-------------|
| `runFunction` | `(el: HTMLElement) => Api` | **Required (signal-based model).** Function called with the board container element. Must create a chessground instance and return its `Api`. |

#### Properties / Methods

| Member | Type | Description |
|--------|------|-------------|
| `toggleOrientation()` | `() => void` | Flips the board orientation (white ↔ black). |
| `elementView` | `Signal<ElementRef>` | Signal-based view query for the board container element. |

#### Usage Pattern

The component uses Angular's `effect()` to watch `runFunction` changes — whenever it changes, the board redraws. This means you can dynamically switch board configurations by updating the signal.

---

### NgxChessgroundTableComponent

**Selector**: `<ngx-chessground-table>`

A pre-configured chessboard with the "Play vs yourself" or "Play from initial position" preset. It wraps `NgxChessgroundComponent` and auto-initializes it with interactive play units that support a promotion dialog.

This component is standalone and self-contained — just drop it into your template:

```html
<ngx-chessground-table />
```

When a pawn reaches the promotion rank, a Material dialog appears offering Queen, Rook, Bishop, or Knight choices.

---

### NgxPgnViewerComponent

**Selector**: `<ngx-pgn-viewer>`

A full-featured PGN viewer with replay controls, filtering, Stockfish analysis, and more. The most complex component in the library.

#### Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `pgn` | `string` | `''` | PGN string to load and display. |
| `highlightLastMove` | `boolean` | `true` | Whether to highlight the last played move on the board. |

#### Public Signals (accessible for template binding)

| Signal | Type | Description |
|--------|------|-------------|
| `currentMoveIndex` | `Signal<number>` | Zero-based index of the current move. |
| `moves` | `Signal<string[]>` | Array of SAN move strings for the loaded game. |
| `currentFen` | `Signal<string>` | Current board FEN string. |
| `activeColor` | `Signal<'white' \| 'black'>` | Current turn color (computed from FEN). |
| `isReplaying` | `Signal<boolean>` | Whether auto-replay is active. |
| `replayMode` | `Signal<'fixed' \| 'realtime' \| 'proportional'>` | Replay timing mode. |
| `minSeconds` | `Signal<number>` | Minimum seconds between moves (default: 2). |
| `replaySpeed` | `Signal<number>` | Scaled speed factor for proportional replay. |
| `stopOnError` | `Signal<boolean>` | When true, auto-replay halts on significant evaluation drops. |
| `stopOnErrorThreshold` | `Signal<number>` | Evaluation drop threshold (in pawns) for stop-on-error. |
| `showBetterMoveBtn` | `Signal<boolean>` | Whether to show a "better move" button after stop-on-error triggers. |
| `bestMoveInfo` | `Signal<{ move: string; pv: { san: string; fen: string }[] } \| null>` | Stockfish best-move and PV lines, or null. |
| `isAnalyzing` | `Signal<boolean>` | Whether Stockfish is currently analyzing a position. |
| `analysisVisible` | `Signal<boolean>` | Whether the analysis panel is visible. |
| `stockfishDepth` | `Signal<number>` | Stockfish search depth (default: 18). |
| `evaluations` | `Signal<(string \| null)[]>` | Array of evaluation strings per move. |
| `currentEvaluation` | `Signal<string \| null>` | Evaluation at the current move (computed). |
| `evaluationBarHeight` | `Signal<number>` | Evaluation bar height as percentage (computed). |
| `currentGameIndex` | `Signal<number>` | Index of the currently loaded game in a multi-game PGN. |
| `gamesMetadata` | `Signal<GameMetadata[]>` | Parsed game metadata list from the loaded PGN. |
| `filteredGamesIndices` | `Signal<number[]>` | Indices of games matching current filters. |
| `filteredGameInfos` | `Signal<GameMetadata[]>` | Game metadata for filtered results (computed). |
| `isFiltering` | `Signal<boolean>` | Whether a filter operation is in progress. |
| `isLoading` | `Signal<boolean>` | Whether a PGN is being loaded/parsed. |
| `loadingProgress` | `Signal<number>` | Loading progress percentage (0–100). |
| `loadingStatus` | `Signal<string>` | Loading status message. |
| `filterWhite` / `filterBlack` | `Signal<string>` | Player name filter strings. |
| `filterEco` | `Signal<string>` | ECO code filter string. |
| `includeDraws` | `Signal<boolean>` | Whether to include drawn games in filtered results (default: `true`). |
| `filterMoves` | `Signal<boolean>` | Whether opening-move filtering is active. |
| `selectedGames` | `Signal<Set<number>>` | Set of selected game indices for batch operations. |

#### Methods

| Method | Description |
|--------|-------------|
| `next()` | Advance to the next move. |
| `prev()` | Go back one move. |
| `start()` | Jump to the start position of the current game. |
| `end()` | Jump to the end of the current game. |
| `replayGame()` | Begin auto-replay from the start using the current `replayMode`. |
| `continueReplay()` | Resume replay from the current position. |
| `stopReplay(resolvePromise = true)` | Stop the active replay. |
| `stopSequence()` | Stop batch replay across multiple games. |
| `loadGame(index: number)` | Load a specific game by index from the parsed game list. |

#### Replay Modes

- **`fixed`** — Each move is played at `minSeconds` intervals.
- **`realtime`** — Replays at the original game time (requires clock data in the PGN).
- **`proportional`** — Scales the game duration to fit a target speed, respecting relative move timings.

#### Stockfish Integration ("Stop on Error")

When `stopOnError` is enabled, the viewer spawns a Stockfish web worker. During auto-replay, it compares successive position evaluations. If the evaluation drops more than `stopOnErrorThreshold` pawns (default: 1.0), the replay halts and the UI displays Stockfish's suggested best move and principal variation.

**Requirements**: Stockfish 18 single-threaded from [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js) (`stockfish-18-single.js` + `stockfish-18-single.wasm`) must be served at `assets/stockfish/stockfish.js` and `assets/stockfish/stockfish.wasm`. The library ships these files (renamed) in its assets directory.

**Credits**: Stockfish © T. Romstad, M. Costalba, J. Kiiski, G. Linscott & contributors. JS/WASM build by [nmrugg](https://github.com/nmrugg/stockfish.js) (© Chess.com, LLC). Licensed under GPLv3.

#### Multi-Game PGN Support

The viewer can parse PGN files containing multiple games. Use `games` to inspect metadata (players, ECO, result), `selectedGameIndex` to navigate, and `filterWhite`/`filterBlack`/`filterEco` to filter the game list.

**Supported formats**: Plain PGN, GZ-compressed PGN (`.pgn.gz` via `fzstd`), and ZIP archives containing PGN files (`.zip` via `jszip`).

#### Opening-Move Filtering

Enable "Filter by Starting Moves" in the UI, play moves on the board, and the viewer filters the game list to only those that begin with those exact moves.

---

### PromotionDialogComponent

**Selector**: `<ngx-promotion-dialog>`

A Material dialog for pawn promotion selection. Typically invoked automatically by `NgxChessgroundTableComponent` or when using `createPlayUnitsWithDialog()`.

#### Interface

```typescript
interface PromotionDialogData {
  color: 'white' | 'black';
}

type PromotionPiece = 'q' | 'r' | 'b' | 'n';
```

The dialog presents four buttons (Queen, Rook, Bishop, Knight). On selection, the dialog closes with the chosen `PromotionPiece` string. If dismissed without selection, defaults to `'q'` (Queen).

---

## Services

### NgxChessgroundService

Provided at the component level by `NgxChessgroundComponent`. Manages the chessground instance lifecycle.

| Method | Description |
|--------|-------------|
| `redraw(element: HTMLElement, runFn: (el: HTMLElement) => Api)` | Re-initializes chessground on the given element with the provided factory function. |
| `toggleOrientation()` | Flips the board orientation. |

---

### PgnViewerEngineService

Provided at root level (`providedIn: 'root'`). Manages Web Workers for background PGN processing and Stockfish analysis.

| Method | Description |
|--------|-------------|
| `initialize(callbacks)` | Creates the PGN processor worker and Stockfish worker. Returns `false` if Web Workers are unsupported. |
| `loadPgn(pgn, id)` | Sends raw PGN to the worker for parsing. |
| `filterGames(criteria, id)` | Filters parsed games by player name, ECO, draw status, or opening moves. |
| `loadGame(index, id)` | Loads a specific game by index from the parsed list. |
| `analyzePosition(fen, depth)` | Sends a FEN position to Stockfish for analysis. Returns `false` if the worker is unavailable. |
| `dispose()` | Terminates all workers and cleans up resources. |

#### Callbacks Interface

```typescript
interface PgnViewerEngineCallbacks {
  onPgnMessage: (data: WorkerResponse) => void;
  onStockfishMessage: (event: MessageEvent) => void;
  onError?: (message: string, error?: unknown) => void;
}
```

---

### PromotionService

Provided at root level (`providedIn: 'root'`). Opens a Material dialog for pawn promotion selection.

| Method | Description |
|--------|-------------|
| `showPromotionDialog(color: 'white' \| 'black'): Promise<PromotionPiece>` | Opens the promotion dialog and returns the user's choice. Defaults to `'q'` (Queen) if cancelled. |

---

## Unit Presets

The library exports a collection of pre-built `Unit` configurations that encapsulate common chessboard setups. Each `Unit` conforms to this interface:

```typescript
interface Unit {
  name: string;
  run: (el: HTMLElement) => Api;
}
```

All units are exported from `ngx-chessground`:

| Export | Name | Description |
|--------|------|-------------|
| `initial` | Play legal moves from initial position | Standard board setup. Only legal moves allowed. Uses `window.prompt` for promotions. |
| `castling` | Castling | Position set up to demonstrate castling from both sides. |
| `playVsRandom` | Play vs random AI | Play as white against a randomly-moving AI opponent. 1-second AI delay. |
| `playFullRandom` | Watch 2 random AIs | Both sides play random moves with 700ms intervals and animation. |
| `slowAnim` | Play vs random AI; slow animations | Same as `playVsRandom` but with 5-second piece animation duration. |
| `conflictingHold` | Conflicting hold/premove | Demonstrates the premove conflict resolution mechanics. |

#### Enhanced Units with Promotion Dialog

For a better UX, use `createPlayUnitsWithDialog()` to get unit presets that use a Material dialog for promotions instead of `window.prompt`:

```typescript
import { createPlayUnitsWithDialog, PromotionService } from 'ngx-chessground';

// In your component:
const promotionService = inject(PromotionService);
const enhancedUnits = createPlayUnitsWithDialog(promotionService);

// enhancedUnits.initial.run(el) — uses dialog for promotions
// enhancedUnits.castling.run(el) — uses dialog for promotions
```

The factory returns an object with keys: `initial`, `castling`, `playVsRandom`, `playFullRandom`, `slowAnim`, `conflictingHold`. If no `PromotionService` is provided, it falls back to the legacy `window.prompt` units.

---

## Utility Functions

All utilities are exported from `ngx-chessground`:

### `toDests(chess: ChessInstance): Map<Key, Key[]>`

Computes a map of legal destination squares for each piece on the board. Used to configure chessground's `movable.dests`.

```typescript
import { Chess } from 'chess.js';
import { toDests } from 'ngx-chessground';

const chess = new Chess();
const dests = toDests(chess);
// Map { 'e2' => ['e3', 'e4'], 'd2' => ['d3', 'd4'], ... }
```

### `toColor(chess: ChessInstance): Color`

Returns `'white'` or `'black'` based on the current turn in a chess.js instance.

```typescript
const color = toColor(chess); // 'white' or 'black'
```

### `playOtherSide(cg: Api, chess: ChessInstance): (orig: Key, dest: Key) => void`

Creates a move handler that makes the move on both chess.js and chessground, then updates the board for the opponent's turn. Uses `window.prompt` for pawn promotion.

```typescript
cg.set({
  movable: {
    events: {
      after: playOtherSide(cg, chess)
    }
  }
});
```

### `playOtherSideWithDialog(cg: Api, chess: ChessInstance, promotionService: PromotionService): (orig: Key, dest: Key) => Promise<void>`

Same as `playOtherSide` but uses a Material dialog (via `PromotionService`) for promotion selection instead of `window.prompt`. Async — returns a Promise.

### `aiPlay(cg: Api, chess: ChessInstance, delay: number, firstMove: boolean): (orig: Key, dest: Key) => void`

Creates a move handler where after the human plays, an AI opponent responds after `delay` milliseconds. The AI picks a random legal move (or the first legal move if `firstMove` is true).

```typescript
cg.set({
  movable: {
    events: {
      after: aiPlay(cg, chess, 1000, false)
    }
  }
});
```

### `createPlayUnitsWithDialog(promotionService?: PromotionService)`

Factory that returns unit presets enhanced with dialog-based promotion. If no service is provided, falls back to the `window.prompt` versions.

---

## Version Compatibility

| NgxChessground | Angular |
|----------------|---------|
| **21.x** | 21.x |
| **20.x** | 20.x |
| **19.x** | 19.x |
| **18.x** | 18.x |
| **17.x** | 17.x |
| **16.x** | 16.x |
| **15.x** | 15.x |

---

## Contributing

```bash
git clone https://github.com/topce/ngx-chessground.git
cd ngx-chessground
npm install
npm start
```

### Generate API Documentation

```bash
npm run compodoc
```

This builds [Compodoc](https://compodoc.app/) documentation from the JSDoc annotations in the source, served at `http://localhost:9090`.

### Build

```bash
npm run build:lib:prod    # Build the library
npm run build:app:prod    # Build the demo app
```

### Publish

```bash
npm run publish:lib
```

---

## License

GPL-3.0 or later. See [LICENSE](../../LICENSE).
