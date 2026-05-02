# Codebase Concerns

**Analysis Date:** 2026-05-02

## Tech Debt

### Duplicated Promotion Logic Across Three Files
- Issue: The same pawn promotion handling logic (making the move, updating the board, adjusting turn color/dests) is duplicated across `util.ts`, `enhanced-util.ts`, and reproduced again in `pgn-viewer.component.ts`. The `util.ts` version uses `window.prompt()`, while `enhanced-util.ts` uses `PromotionService` dialog — yet the board update code (cg.move, cg.setPieces, cg.set for turn/dests) is nearly identical in all three.
- Files: `projects/ngx-chessground/src/units/util.ts`, `projects/ngx-chessground/src/units/enhanced-util.ts`, `projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer.component.ts`
- Impact: Bug fixes to promotion behavior must be applied in 3+ places. Already visible divergence: `util.ts` uses synchronous chess.move + cg.move, `enhanced-util.ts` uses async dialog with deferred board update, and the PGN viewer component has its own `handleBoardMove` implementation.
- Fix approach: Extract a shared `executePromotionMove(cg, chess, orig, dest, promotion)` utility function used by all three. Deprecate the `window.prompt()` path and consolidate on the dialog-based approach.

### Duplicate Unit Definitions (play.ts vs enhanced-play.ts)
- Issue: `play.ts` exports Unit objects using `window.prompt()`-based promotion. `enhanced-play.ts` exports the same Unit objects (initial, castling, playVsRandom, slowAnim, playFullRandom, conflictingHold) but with dialog-based promotion via `PromotionService`. `play.ts` also contains a `createPlayUnitsWithDialog` factory that reconstructs the same units internally. Three copies of the same board setup logic.
- Files: `projects/ngx-chessground/src/units/play.ts`, `projects/ngx-chessground/src/units/enhanced-play.ts`
- Impact: Adding a new chess unit or updating board setup means updating all copies. Three subtly different event handler chains.
- Fix approach: Consolidate into a single factory that accepts an optional `PromotionService`. If provided, use dialog; otherwise fall back to `window.prompt` (or remove `window.prompt` entirely). Export only `createPlayUnits(promotionService?)`.

### Redundant Linting Toolchain
- Issue: Two linters configured — Biome (`biome.json`) for formatting/linting and ESLint/angular-eslint (`angular.json` lint builders). Both run on the same files. `package.json` scripts include both `check`/`fix` (Biome) and `eslint`/`eslint:fix` (ESLint).
- Files: `biome.json`, `angular.json` (lines 25-33, 152-160), `package.json` (lines 17-22)
- Impact: Maintenance burden of two rule sets. Potential for conflicting rules. Slower CI due to redundant linting passes.
- Fix approach: Pick one tool. Biome is faster and has native formatting, making ESLint redundant. Remove the `@angular-eslint` dependencies and angular.json lint builders.

### Commented-out Console Statements
- Issue: Multiple files contain commented-out `console.log` calls and active `console.error` calls that should use structured logging.
- Files: `projects/ngx-chessground/src/units/play.ts` (lines 49-51, 136-138), `projects/ngx-chessground/src/units/enhanced-play.ts` (lines 33-35), `projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer.component.ts` (lines 1421, 1426, 1492, 1500), `projects/ngx-chessground/src/lib/pgn-viewer/pgn-processor.worker.ts` (lines 410, 445), `projects/ngx-chessground/src/units/zh.ts` (line 44)
- Impact: Dead code clutter. Active `console.error` calls in production will pollute user consoles.
- Fix approach: Remove commented-out debug statements. Replace active `console.error` calls with a proper logging service or suppress in production builds.

### TODO: Incomplete Zoneless Migration of PromotionDialogComponent
- Issue: `PromotionDialogComponent` still uses `ChangeDetectionStrategy.Default` with a TODO comment stating it needs migration to `OnPush` after testing.
- Files: `projects/ngx-chessground/src/lib/promotion-dialog/promotion-dialog.component.ts` (lines 20-22)
- Impact: Running with `Default` strategy means unnecessary change detection cycles. The library uses `provideZonelessChangeDetection()` in tests (`test-providers.ts`) and has zoneless-compatible API (signals), but this component is a holdout.
- Fix approach: Verify dialog behavior after migration, then switch to `ChangeDetectionStrategy.OnPush`.

### TODO: Unimplemented Reset Functionality in Template Playground
- Issue: `template-playground.component.ts` has a TODO for reset functionality that was never implemented.
- Files: `documentation/template-playground/template-playground.component.ts` (line 557)
- Impact: The documentation template-playground is incomplete. Users cannot reset their template editing session.
- Fix approach: Implement reset to restore default template state. Alternatively, deprecate/remove the template-playground if it is no longer maintained.

### Stale/Experimental Documentation Code
- Issue: `documentation/template-playground/` is a standalone Angular module (`template-playground.module.ts`) with its own `main.ts` entry point and services. It does not appear in `angular.json` as a buildable project. It uses class-based dependency injection (`Injectable`, `NgModule`) not aligned with the main library's signal-based patterns.
- Files: `documentation/template-playground/` (all 7 files)
- Impact: Unused code that may break during Angular upgrades. Confuses new contributors about project structure.
- Fix approach: Either integrate into the example app as a proper route module, or remove it entirely.

## Known Bugs

### Replay After Load PGN May Parse Twice Inconsistently
- Symptoms: When `loadPgnString` is called followed by explicit `loadGame(0)` (as done in `loadFromUrl`, `onPgnFileSelected`, etc.), the game is sent to the worker twice — once during metadata extraction and once for move parsing. If the PGN is malformed, the metadata extraction and move parsing paths may handle errors differently.
- Files: `projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer.component.ts` (lines 940-951, 1075-1157)
- Trigger: Loading a PGN from URL, file, or clipboard where the PGN has parsing edge cases.
- Workaround: The worker's multi-layer fallback parsing generally produces a usable result, but evaluation data may be lost on the fallback paths.

## Security Considerations

### Stockfish WASM Binary Without Integrity Verification
- Risk: The Stockfish engine (`stockfish.js` + `stockfish.wasm`) is loaded from `assets/stockfish/` as a Web Worker. If the build assets were compromised, malicious code could execute in a Worker context with access to `postMessage` communication.
- Files: `projects/ngx-chessground/assets/stockfish/stockfish.js`, `projects/ngx-chessground/assets/stockfish/stockfish.wasm`, `projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer-engine.service.ts` (line 34)
- Current mitigation: None. No subresource integrity hash, no content verification.
- Recommendations: Add Subresource Integrity (SRI) hash verification for the stockfish.js file. Pin the `stockfish.js` npm package to an exact version (currently `^10.0.2`).

### Proxy Debug Logging in Configuration
- Risk: `proxy.conf.json` has `"logLevel": "debug"` for the `/lichess` proxy. If this proxy config is accidentally used in production builds, it would leak request details.
- Files: `proxy.conf.json` (line 9)
- Current mitigation: Angular dev-server proxy config is typically only used in development. No production deployment via this proxy.
- Recommendations: Add a comment noting this is dev-only. Remove or change logLevel to `"info"` for safety.

### window.prompt() for User Input in Play Units
- Risk: `playOtherSide()` in `util.ts` uses `window.prompt()` for pawn promotion piece selection. While not a security vulnerability per se, `window.prompt()` blocks the main thread and is generally considered a poor UX pattern.
- Files: `projects/ngx-chessground/src/units/util.ts` (lines 81-90)
- Current mitigation: `enhanced-util.ts` provides a dialog-based alternative. The prompt-based path is still exported and available to consumers.
- Recommendations: Deprecate and eventually remove the prompt-based units. Gate with a deprecation notice in the public API.

## Performance Bottlenecks

### pgn-viewer.component.ts: 1916-Line Monolithic Component
- Problem: The PGN viewer component handles PGN loading, URL fetching, ZIP extraction, Zstandard decompression, game filtering, move navigation, replay scheduling (3 modes), Stockfish analysis, clock display, evaluation charting, clipboard I/O, Lichess database integration, and game selection — all in a single file.
- Files: `projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer.component.ts` (1916 lines)
- Cause: Feature creep over time. No clear service/module boundary extraction.
- Improvement path: Decompose into focused services: `PgnLoaderService` (URL/ZIP/file loading + decompression), `ReplayService` (scheduling + clock parsing), `AnalysisService` (Stockfish + evaluation), `FilterService` (works with worker). Keep the component as a thin orchestration layer.

### Full Metadata Array Sent via postMessage
- Problem: After loading a PGN file, the worker sends the complete `GameMetadata[]` array back via `postMessage`. For large PGN databases (e.g., Lichess monthly files with 100k+ games), this is a large structured clone operation that blocks both the worker and main thread.
- Files: `projects/ngx-chessground/src/lib/pgn-viewer/pgn-processor.worker.ts` (lines 102-109)
- Cause: All metadata is extracted upfront and sent in one message.
- Improvement path: Stream metadata in chunks using `Transferable` objects, or send only summary statistics first and lazily load metadata on demand.

### Sequential Replay of All Selected Games
- Problem: `replayAllSelectedGames()` loads and replays games one at a time with only 100ms between load and replay. Each game load triggers a worker round-trip. No preloading or pipelining.
- Files: `projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer.component.ts` (lines 1437-1468)
- Cause: Simple sequential implementation without prefetch optimization.
- Improvement path: Preload the next game in the background while the current game is replaying. Use the worker's `gameMovesCache` to pre-parse upcoming games.

## Fragile Areas

### PGN Parsing Chain with 3-Layer Fallback
- Files: `projects/ngx-chessground/src/lib/pgn-viewer/pgn-processor.worker.ts` (lines 329-461)
- Why fragile: The `handleLoadGame` function tries: (1) chess.js strict parse → (2) cleaned PGN with chess.js → (3) chessops fallback → (4) stripped-comments chess.js. Each fallback loses progressively more data (evaluations, clock comments, variations). The regex cleaning is fragile and may silently corrupt unusual PGN notations. If all 4 layers fail, the game shows an error.
- Test coverage: None. Zero tests for the worker module despite being 688 lines and handling critical PGN parsing.
- Safe modification: When changing PGN cleaning regexes, test against a corpus of real Lichess PGN files with edge cases (null moves, recursive variations, unusual time controls, non-ASCII player names).
- Improvement: Replace the layered fallback with a single robust parser (chessops has full PGN spec support). Only fall back to chess.js for evaluation extraction if needed.

### Duplicated Replay Logic (Sync vs Async)
- Files: `projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer.component.ts` — `runReplayLogic()` (lines 1409-1435) and `replayGameAsync()` (lines 1471-1514)
- Why fragile: Both methods contain the same 3-layer PGN parsing + chessops fallback chain. `replayGameAsync` wraps it in a Promise for the "replay all" feature but otherwise duplicates the implementation. Any bug fix in replay parsing must be applied to both methods.
- Safe modification: Extract the "parse PGN and calculate timeouts" logic into a single private method used by both.
- Test coverage: Zero.

### Stockfish Message Parsing
- Files: `projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer.component.ts` — `handleStockfishMessage()` (lines 322-389)
- Why fragile: Directly parses UCI protocol strings (`info`, `bestmove`, `score cp`, `score mate`) with regex. No structured protocol handling. If Stockfish changes its output format (unlikely but possible with version updates), the parsing silently breaks.
- Safe modification: Add tests against known UCI output strings. Consider using a Stockfish protocol wrapper library.
- Test coverage: Zero.

### Clock Parsing in Replay
- Files: `projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer.component.ts` — `calculateReplayTimeouts()` (lines 1635-1792) and `calculateReplayTimeoutsChessops()` (lines 1530-1630)
- Why fragile: Clock extraction from PGN comments uses regex for `%clk` patterns with three time formats (`h:mm:ss`, `mm:ss`, `m:ss`). Inconsistent time control headers in real PGN data cause fallback to fixed-time replay.
- Test coverage: Zero.

## Scaling Limits

### In-Memory Game Storage in Worker
- Current capacity: All PGN strings, metadata arrays, and move caches live in Web Worker memory. A Lichess monthly file (~500 MB compressed → several GB decompressed) will cause the worker to consume gigabytes of memory.
- Limit: Browser tab OOM at roughly 1-2 million games depending on game length. Already observable with 3+ months of Lichess data loaded simultaneously.
- Scaling path: Implement pagination — load only metadata initially, load game moves on demand with LRU eviction from the cache. Use streaming PGN parsing instead of loading the full file into memory.

### UI Thread Blocking During Filter Operations
- Current capacity: Filter operations run in the worker but the postMessage of filter results (sorted index arrays) can be up to 100k elements. The main thread processes these in a single signal update, causing DOM thrash.
- Limit: ~100k filtered games causes noticeable UI freeze during rendering of filter results.
- Scaling path: Virtual scrolling for the game list. Chunked rendering of filter results.

## Dependencies at Risk

### stockfish.js ^10.0.2
- Risk: This npm package bundles the Stockfish engine. The `stockfish.js` npm package has not been updated since 2023 and may bundle an outdated Stockfish version. The actual Stockfish engine (the WASM) is a separate binary at `projects/ngx-chessground/assets/stockfish/stockfish.wasm`.
- Impact: Outdated analysis quality. The assets directory file may be from a different version than the npm package expects.
- Migration plan: Clarify which Stockfish version is actually used (npm package vs assets binary). If using the assets binary directly, the npm dependency may be unnecessary. If using the npm package, verify the assets binary matches.

### fzstd ^0.1.1
- Risk: Early-stage library (version 0.1.1) for Zstandard decompression. May have bugs or missing features for edge-case PGN compression.
- Impact: PGN decompression failures would prevent loading Lichess database files.
- Migration plan: Monitor for updates. Consider alternative decompression libraries or browser-native DecompressionStream API when widely available.

### npm install --force Pattern
- Risk: The `update:deps` script in `package.json` uses `ncu -u` (update all to latest) followed by `npm install --force`. This bypasses peer dependency conflict resolution and can install incompatible versions.
- Files: `package.json` (line 25)
- Impact: Silent runtime failures from incompatible dependency versions.
- Migration plan: Remove `--force` flag. Run `npm install` normally after `ncu -u` and resolve conflicts explicitly.

### Dual snabbdom Usage Risk
- Risk: `chessground` depends on `snabbdom` internally. The library project also directly imports from `snabbdom` in `NgxChessgroundService`. If chessground upgrades its snabbdom dependency to a different major version, the two snabbdom instances could conflict.
- Files: `projects/ngx-chessground/src/lib/ngx-chessground.service.ts` (lines 4-11)
- Impact: Runtime errors from incompatible VNode types. Board rendering failures.
- Migration plan: Track chessground's snabbdom version and keep the library's version in sync. Consider whether the library should import snabbdom directly or rely on chessground's bundled version.

## Missing Critical Features

### No Error Tracking or Monitoring
- Problem: All error handling uses `console.error()`. No Sentry, LogRocket, or comparable error tracking. Production errors are invisible.
- Blocks: Ability to identify and fix user-reported issues. Debugging production PGN parsing failures.

### No Automated CI/CD Pipeline
- Problem: Only a manual `npm run deploy` and `npm run publish:lib` scripts. No GitHub Actions or other CI configured. The `.github/` directory exists but appears to contain only sponsor configuration.
- Blocks: Enforcing linting, testing, and build before deployment. Automated releases.

## Test Coverage Gaps

### pgn-viewer.component.ts (1916 lines) — Zero Coverage
- What's not tested: Game loading, filtering (9 filter dimensions), replay (3 modes with clock parsing), Stockfish analysis integration, evaluation display, clipboard operations, URL loading, ZIP loading, Lichess database integration, move navigation with undo/redo, game selection.
- Files: `projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer.component.ts`
- Risk: This is the core feature component. Any regression breaks the entire PGN viewer functionality. The component is actively modified (17+ commits in the last 50 commit range touch this file or related filtering/replay logic).
- Priority: High

### pgn-processor.worker.ts (688 lines) — Zero Coverage
- What's not tested: PGN splitting, game metadata extraction, 4-layer PGN move parsing, time control normalization, game filtering (9 criteria), move extraction with SAN validation, evaluation extraction.
- Files: `projects/ngx-chessground/src/lib/pgn-viewer/pgn-processor.worker.ts`
- Risk: PGN parsing is the most fragile part of the system. A single malformed PGN can cascade through 4 fallback paths. The regex-based `extractMovesFast` has no test coverage.
- Priority: High

### All Unit Files — Zero Coverage
- What's not tested: `util.ts` (310 lines), `enhanced-util.ts` (268 lines), `play.ts` (339 lines), `enhanced-play.ts` (201 lines), `basics.ts`, `anim.ts`, `fen.ts`, `in3d.ts`, `perf.ts`, `pgn.ts`, `svg.ts`, `viewOnly.ts`, `zh.ts`
- Files: `projects/ngx-chessground/src/units/*.ts`
- Risk: These are exported in the public API as demo/tutorial units. If they break, the example app's chessboard demos break.
- Priority: Medium

### NgxChessgroundComponent and Service — Zero Coverage
- What's not tested: Virtual DOM rendering, snabbdom patch lifecycle, chessground instance management, board redraw on input changes, orientation toggle.
- Files: `projects/ngx-chessground/src/lib/ngx-chessground/ngx-chessground.component.ts`, `projects/ngx-chessground/src/lib/ngx-chessground.service.ts`
- Risk: These are the core chessboard rendering components. If they break, the entire library is non-functional.
- Priority: High

### vitest.config.ts Coverage Thresholds Are Unrealistic
- Issue: Coverage thresholds set to 90% lines, 90% branches, 75% functions, 90% statements. Current coverage is approximately <5%.
- Files: `projects/ngx-chessground/vitest.config.ts`
- Fix approach: Lower thresholds to match current reality (e.g., 10%) and incrementally raise them as coverage improves. CI will fail if thresholds are checked but never met.

---

*Concerns audit: 2026-05-02*
