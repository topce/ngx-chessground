# Changelog

## [Unreleased]

### Added
- Practice mode ("Analyze Practice") in the PGN viewer: free play for both sides starting from the currently displayed position, with continuous Stockfish analysis after every move, per-move evaluations, undo/restart controls, and export of the analysis (copy FEN, copy SAN moves, copy/download PGN with `[%eval]` comments). Practice mode and the stop-on-error "Show Better Move" panel are mutually exclusive
- Optional `config` input on `NgxChessgroundComponent`: applies a partial Chessground config to the live instance in place via `Api.set()`

### Changed
- Board position updates (navigation, replay, practice moves, PV previews) now reconfigure the existing Chessground instance in place instead of recreating it — preserving move animations and reducing per-update cost
- Practice mode is now **free play**: either side may be moved at any time (legal moves only), so flipping the board no longer locks out one side
- Practice mode is now **turn-based**: only the side to move may move (legal moves only) — the other side's pieces cannot be moved

### Fixed
- Chessground instance leak: every board update created a new Chessground instance without destroying the previous one, accumulating document drag & drop listeners and causing stuck piece dragging (most visible in practice mode). Old instances are now destroyed before recreation and on component teardown
- Practice mode silently rejected moves for the side that was not to move — with the board flipped (black at bottom) White's moves appeared broken. Destination squares now include legal moves for both sides and moves apply to whichever side is dragged

## [22.5.0] - 2026-09-05

### Added
- The app now boots into the **newest available Lichess monthly broadcast** instead
  of a bundled demo game: it probes the most recent archive (the month before the
  current one), falls back to the previous month when the newest isn't available
  yet, and only shows the demo game when no archive exists at all
- Practice mode in the PGN viewer ("Analyze Practice"): free/turn-based play from
  any position with continuous Stockfish analysis, undo/restart controls, and
  export of the session (copy FEN, copy SAN moves, copy/download PGN with
  `[%eval]` comments)
- Optional `config` input on `NgxChessgroundComponent`: applies a partial
  Chessground config to the live instance in place via `Api.set()`
- Desktop release automation: `scripts/release-desktop.sh` builds, packages and
  publishes macOS/Linux/Windows bundles and installers to GitHub Releases in one
  command (`npm run release:desktop -- <version>`)

### Changed
- Board position updates (navigation, replay, practice moves, PV previews) now
  reconfigure the existing Chessground instance in place instead of recreating
  it — preserving move animations and reducing per-update cost
- Practice mode is now **turn-based**: only the side to move may move (legal moves
  only), so flipping the board no longer locks out one side

### Fixed
- Chessground instance leak: every board update created a new Chessground
  instance without destroying the previous one, accumulating drag & drop
  listeners and causing stuck piece dragging (most visible in practice mode).
  Old instances are now destroyed before recreation and on component teardown

## [22.4.0] - 2026-08-14

### Added
- Upset game filter in the PGN viewer: keep only games where the weaker-rated player (by Elo) beats or draws the stronger-rated player, with configurable outcome flags (win/draw) and minimum Elo gap (default 300). When enabled, results sort by upset size (largest gap first by default)
- `stopOnErrorSide` signal on the PGN viewer (`'both' | 'white' | 'black'`) — stop-on-error replay now halts only on errors made by the configured side

### Changed
- Stop-on-error now attributes evaluation drops to the player who just moved (previously any absolute swing beyond the threshold triggered a stop, including moves that *gained* evaluation)

### Fixed
- `isUpsetGame` no longer counts equal-rating games as upsets when the minimum Elo gap is 0

## [22.3.0] - 2026-08-03

### Changed
- Updated Angular to 22.1 (core 22.1.0, CLI 22.1.2) across library and example app
- Library peer dependencies now declare `@angular/core`/`@angular/common` ^22.0.0 (previously ^21.0.0), matching the Angular version the library is built with

### Fixed
- Removed unused `RouterLink` import in privacy policy component

## [22.2.0] - 2026-07-05

### Added
- Privacy Policy page (Angular route + footer link) for Windows Store compliance
- Native MSI installer with proper `ngx-chessground.exe` launcher (no .bat wrapper)

### Changed
- Updated Deno to 2.9.1 canary (laufey v0.5.0) — fixes WebView2 runtime detection on Windows
- Windows portable build now uses `ngx-chessground.exe` entry point

### Fixed
- MSI installer no longer fails with "Failed to find the app exe path" WebView2 error
- Windows Store submission requirements met (privacy policy, x64 architecture, MSI installer)

### Removed
- Broken GitHub Actions cross-compile release workflow

## [22.1.0] - 2026-07-05

### Added
- Desktop app support via Deno Desktop (Linux x64, Linux ARM64, Windows x64, macOS)
- Fast replay mode with configurable time controls
- Meta tags for SEO with route-based title and description handling
- End-of-replay animations and visual enhancements

### Changed
- Refactored heading elements for consistency and improved accessibility
- Upgraded to Angular 22 dependencies
- Refactored PGN viewer and mini player components for accessibility and performance
- Enhanced board display styles and timeout handling in PGN viewer
- Improved scroll handling in HomePageComponent

### Fixed
- Improved DOM rendering and lifecycle management in NgxChessgroundComponent
- Optimized resize handling in PGN viewer with debounced logic

---

## [22.0.0] - Initial Angular 22 release
