# Changelog

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
