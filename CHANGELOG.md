# Changelog

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
