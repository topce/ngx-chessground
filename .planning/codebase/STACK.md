# Technology Stack

**Analysis Date:** 2026-05-02

## Languages

**Primary:**
- TypeScript 5.9.3 - All library and application code (`src/**/*.ts`)
- HTML - Angular component templates
- SCSS/CSS - Stylesheets for components and chessboard themes

**Secondary:**
- JavaScript (Node.js) - Build scripts: `scripts/download-lichess.js`, `publish.sh`, `publish.ps1`

## Runtime

**Environment:**
- Node.js (Angular CLI build toolchain, specified via `@types/node` 25.3.5)
- Browser (all runtime code is client-side; Web Workers for PGN processing and Stockfish engine)

**Package Manager:**
- npm (primary, `package-lock.json` present)
- Yarn is also present in the library sub-project (`projects/ngx-chessground/yarn.lock`)
- Lockfile: `package-lock.json` (present), `projects/ngx-chessground/package-lock.json` (present)

## Frameworks

**Core:**
- Angular 21.2.1 - Component framework, application shell, and library packaging
  - `@angular/core`, `@angular/common`, `@angular/compiler`
  - `@angular/router` - Client-side routing
  - `@angular/animations` - Animation support
  - `@angular/forms` - Form handling (used in example app filters)
  - `@angular/cdk` 21.2.1 - Component Dev Kit
  - `@angular/material` 21.2.1 - Material Design UI (snackbar, dialog, select, button components)
  - `@angular/service-worker` 21.2.1 - PWA/offline support
- chessground 9.2.1 - Core chessboard rendering engine (ornicar/chessground) via `snabbdom` virtual DOM
- chess.js 1.4.0 - Chess rules engine (legal moves, PGN parsing, FEN)
- chessops 0.15.0 - PGN parsing library for large PGN databases
- snabbdom 3.6.3 - Virtual DOM library used by chessground
- stockfish.js 10.0.2 - Web Worker-based chess engine for position analysis

**Testing:**
- Vitest 4.0.18 - Test runner (configured via `vitest.config.ts`)
- @vitest/coverage-v8 4.0.18 - Code coverage (reports: text, html)
- jsdom 28.1.0 - DOM environment for tests

**Build/Dev:**
- Angular CLI 21.2.1 - Build, serve, lint orchestration
- @angular-devkit/build-angular 21.2.1 - Build builder for the example app
- @angular/build 21.2.1 - Build builder for the library (ng-packagr integration)
- ng-packagr 21.2.0 - Angular library packaging tool
- @compodoc/compodoc 1.2.1 - Documentation generation
- angular-cli-ghpages 3.0.2 - GitHub Pages deployment

**Linting/Formatting:**
- Biome 2.4.6 - Primary linter and formatter (tab indentation, single quotes)
- ESLint 10.0.2 with @angular-eslint 21.3.0 - Additional TypeScript/HTML linting
- typescript-eslint 8.56.1 - TypeScript ESLint plugin

## Key Dependencies

**Critical (peer dependencies of the library):**
- `chessground` 9.2.1 - The core board rendering engine wrapped by this library
- `chess.js` 1.4.0 - Chess rule validation and PGN parsing
- `snabbdom` 3.6.3 - Required by chessground for virtual DOM diffing
- `fzstd` 0.1.1 - Zstandard decompression for Lichess .zst PGN files
- `jszip` 3.10.1 - ZIP file extraction (allowed as non-peer dependency in ng-package.json)
- `tslib` 2.8.1 - TypeScript runtime helpers

**Infrastructure:**
- `stockfish.js` 10.0.2 - Chess engine bundled as asset (`projects/ngx-chessground/assets/stockfish/stockfish.js` + `stockfish.wasm`)
- `chessops` 0.15.0 - Fast PGN parsing for large database files

## Configuration

**Environment:**
- Environment files: `projects/ngx-chessground-example/src/environments/environment.ts` (dev) and `environment.prod.ts` (production) — single boolean flag `production: true/false`
- No `.env` files detected

**Build:**
- `angular.json` - Angular workspace configuration (2 projects: library + example app)
- `tsconfig.json` - Root TypeScript config: target ES2022, module es2020, strict mode enabled
- `projects/ngx-chessground/tsconfig.lib.json` - Library TypeScript config (extends root)
- `projects/ngx-chessground/tsconfig.lib.prod.json` - Library production config
- `projects/ngx-chessground/tsconfig.spec.json` - Test TypeScript config
- `projects/ngx-chessground-example/tsconfig.app.json` - Example app config
- `projects/ngx-chessground/ng-package.json` - ng-packagr config: entry point `src/public-api.ts`, output to `dist/ngx-chessground`
- `projects/ngx-chessground/vitest.config.ts` - Vitest config with coverage thresholds (90% branches, 75% functions, 90% lines/statements)
- `biome.json` - Biome config: tab indentation, single quotes, Angular decorator support enabled
- `proxy.conf.json` - Dev server proxy for Lichess database (proxies `/lichess` → `https://database.lichess.org`)

**Runtime Config:**
- `projects/ngx-chessground-example/ngsw-config.json` - Angular Service Worker config: prefetch app files, lazy-load assets

## Platform Requirements

**Development:**
- Node.js with npm (no version pinning file detected like `.nvmrc`)
- Angular CLI: `@angular/cli` 21.2.1
- Run with `npm start` (launches dev server with `ng serve -o`)

**Production:**
- GitHub Pages deployment target (via `angular-cli-ghpages`, base-href `/ngx-chessground/`)
- npm registry for library distribution (`npm publish` from `dist/ngx-chessground/`)
- PWA support via @angular/service-worker (offline-capable with asset caching)
- Example app build output: `dist/ngx-chessground-example`
- Library build output: `dist/ngx-chessground`

---

*Stack analysis: 2026-05-02*
