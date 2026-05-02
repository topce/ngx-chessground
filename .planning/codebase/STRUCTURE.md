# Codebase Structure

**Analysis Date:** 2026-05-02

## Directory Layout

```
ngx-chessground/
├── .planning/                      # Planning artifacts (GSD system)
├── angular.json                    # Angular CLI workspace configuration
├── biome.json                      # Biome linter/formatter configuration
├── package.json                    # Root workspace package manifest
├── tsconfig.json                   # Root TypeScript configuration (path aliases, strict mode)
├── projects/
│   ├── ngx-chessground/            # 📦 LIBRARY — the publishable Angular library
│   │   ├── assets/                 # Static assets shipped with the library
│   │   │   ├── chessground.css     # Chessground base styles
│   │   │   ├── theme.css           # Chessground theme styles
│   │   │   ├── 3d.css              # 3D board theme styles
│   │   │   ├── images/             # Board/piece sprite images
│   │   │   │   ├── board/          # Board texture images
│   │   │   │   └── pieces/         # Piece sprite images
│   │   │   └── stockfish/          # Stockfish JS engine (Web Worker)
│   │   ├── src/
│   │   │   ├── public-api.ts       # Library entry point — exports all components, services, units
│   │   │   ├── test-providers.ts   # Angular test providers (zoneless config)
│   │   │   ├── lib/                # Core library code
│   │   │   │   ├── ngx-chessground/               # 🎯 Core chessboard component
│   │   │   │   │   ├── ngx-chessground.component.ts
│   │   │   │   │   ├── ngx-chessground.component.html
│   │   │   │   │   └── ngx-chessground.component.scss
│   │   │   │   ├── ngx-chessground.service.ts     # Snabbdom rendering service
│   │   │   │   ├── ngx-chessground-table/          # Higher-level table component
│   │   │   │   │   ├── ngx-chessground-table.component.ts
│   │   │   │   │   ├── ngx-chessground-table.component.html
│   │   │   │   │   └── ngx-chessground-table.component.scss
│   │   │   │   ├── pgn-viewer/                      # PGN viewer component with analysis
│   │   │   │   │   ├── pgn-viewer.component.ts
│   │   │   │   │   ├── pgn-viewer.component.html
│   │   │   │   │   ├── pgn-viewer.component.css
│   │   │   │   │   ├── pgn-viewer-engine.service.ts        # Worker management service
│   │   │   │   │   ├── pgn-viewer-engine.service.spec.ts
│   │   │   │   │   ├── pgn-processor.worker.ts            # PGN processing Web Worker
│   │   │   │   │   └── eco-moves.ts                       # ECO opening moves lookup
│   │   │   │   └── promotion-dialog/               # Pawn promotion dialog
│   │   │   │       ├── promotion-dialog.component.ts
│   │   │   │       ├── promotion-dialog.component.spec.ts
│   │   │   │       ├── promotion.service.ts
│   │   │   │       └── promotion.service.spec.ts
│   │   │   └── units/                # Demo/examples — chessboard configuration modules
│   │   │       ├── unit.ts           # Unit interface definition
│   │   │       ├── util.ts           # Shared utilities (toDests, toColor, aiPlay, playOtherSide)
│   │   │       ├── anim.ts           # Animation examples
│   │   │       ├── basics.ts         # Basic board configurations
│   │   │       ├── enhanced-play.ts  # Enhanced play with promotion dialog (factory)
│   │   │       ├── enhanced-util.ts  # Enhanced utilities (dialog versions of playOtherSide, aiPlay)
│   │   │       ├── fen.ts            # FEN switching examples
│   │   │       ├── in3d.ts           # 3D theme examples
│   │   │       ├── perf.ts           # Performance test examples
│   │   │       ├── pgn.ts            # PGN replay example (embedded game)
│   │   │       ├── play.ts           # Play legal moves examples
│   │   │       ├── svg.ts            # SVG shape drawing examples
│   │   │       ├── viewOnly.ts       # View-only board examples
│   │   │       └── zh.ts             # Crazyhouse variant examples
│   │   ├── ng-package.json           # ng-packagr build configuration
│   │   ├── tsconfig.lib.json         # Library TypeScript config
│   │   ├── tsconfig.lib.prod.json    # Production build TypeScript config
│   │   ├── tsconfig.spec.json        # Test TypeScript config
│   │   ├── tsconfig.doc.json         # Compodoc documentation config
│   │   ├── vitest.config.ts          # Vitest runner config (coverage thresholds)
│   │   ├── package.json              # Library-specific dependencies
│   │   └── .eslintrc.json            # ESLint configuration
│   │
│   └── ngx-chessground-example/      # 🖥️ EXAMPLE APP — demo application
│       ├── src/
│       │   ├── index.html            # HTML entry point
│       │   ├── main.ts               # Bootstrap (zoneless, router, animations, service worker)
│       │   ├── styles.scss           # Global styles
│       │   ├── favicon.ico
│       │   ├── assets/               # App-specific assets
│       │   ├── environments/         # Environment configurations (prod/dev)
│       │   └── app/
│       │       ├── app.component.ts        # Root component (toolbar + router outlet)
│       │       ├── app.component.html
│       │       ├── app.component.scss
│       │       ├── app.routes.ts           # Route definitions (lazy-loaded pgn-viewer)
│       │       ├── home-page/              # Home page component
│       │       │   ├── home-page.component.ts
│       │       │   ├── home-page.component.html
│       │       │   └── home-page.component.scss
│       │       ├── pgn-viewer/             # PGN viewer demo wrapper
│       │       │   ├── pgn-viewer.component.ts
│       │       │   ├── pgn-viewer.component.html
│       │       │   ├── pgn-viewer.component.css
│       │       │   └── sponsor-dialog.component.ts
│       │       ├── play-like-goat/         # Interactive gameplay demo
│       │       │   ├── play-like-goat.component.ts
│       │       │   ├── play-like-goat.component.html
│       │       │   └── play-like-goat.component.scss
│       │       ├── goat/                   # Chessboard examples demo
│       │       │   ├── goat.component.ts
│       │       │   ├── goat.component.html
│       │       │   └── goat.component.scss
│       │       └── me/                     # Additional demo component
│       │           ├── me.component.ts
│       │           ├── me.component.html
│       │           └── me.component.scss
│       ├── public/                  # Public static files for the app
│       ├── tsconfig.app.json         # App TypeScript config
│       ├── ngsw-config.json          # Angular Service Worker config
│       └── .eslintrc.json            # ESLint configuration
│
├── scripts/
│   └── download-lichess.js           # Script to download Lichess monthly PGN databases
├── public/
│   └── (shared public assets)
├── documentation/                    # Additional documentation
└── dist/                             # Build output (not committed)
    ├── ngx-chessground/              # Library distribution
    └── ngx-chessground-example/      # App distribution
```

## Directory Purposes

**`projects/ngx-chessground/src/lib/`:**
- Purpose: Core library source — all publishable components, services, and Web Workers
- Contains: Standalone Angular components (.ts, .html, .scss/.css), injectable services, Web Worker files
- Key files: `public-api.ts` (entry point), `ngx-chessground.service.ts` (rendering engine), `pgn-processor.worker.ts` (offloaded parsing)

**`projects/ngx-chessground/src/units/`:**
- Purpose: Reusable chessboard configuration factories (demos, examples, building blocks for consumers)
- Contains: TypeScript modules exporting `Unit` objects or factory functions
- Key files: `unit.ts` (interface), `util.ts` (shared helpers), `play.ts` (gameplay units with/without dialog)

**`projects/ngx-chessground/assets/`:**
- Purpose: Static assets shipped with the npm package (CSS themes, piece images, Stockfish engine)
- Contains: CSS files for board themes, sprite images for pieces and boards, Stockfish.js Web Worker
- Built into the library distribution (declared in `ng-package.json` `assets` array)

**`projects/ngx-chessground-example/src/app/`:**
- Purpose: Demo application that exercises all library features
- Contains: Standalone Angular components demonstrating each library feature with routing
- Key files: `app.routes.ts` (route definitions), `pgn-viewer/pgn-viewer.component.ts` (demonstrates NgxPgnViewerComponent)

**`projects/ngx-chessground-example/src/app/pgn-viewer/`:**
- Purpose: Wraps the library's `NgxPgnViewerComponent` in a full demo with embedded sample games (Fischer's Evergreen Game, topce's sample game)
- Contains: PGN viewer wrapper component, sponsor dialog component

## Key File Locations

**Entry Points:**
- `projects/ngx-chessground/src/public-api.ts`: Library barrel export
- `projects/ngx-chessground-example/src/main.ts`: App bootstrap with `bootstrapApplication()`
- `projects/ngx-chessground-example/src/index.html`: HTML entry point for the example app

**Configuration:**
- `angular.json`: Workspace-level Angular CLI config (library + app build targets, test config)
- `biome.json`: Linter and formatter configuration (tab indentation, single quotes, recommended rules)
- `tsconfig.json`: Root TypeScript config with path alias `"ngx-chessground"` → library public-api
- `projects/ngx-chessground/ng-package.json`: ng-packagr config (entry file, output dir, included assets)
- `projects/ngx-chessground/vitest.config.ts`: Vitest config with coverage thresholds (90% branches/lines, 75% functions)
- `projects/ngx-chessground-example/ngsw-config.json`: Service Worker configuration for PWA offline support

**Core Logic:**
- `projects/ngx-chessground/src/lib/ngx-chessground/ngx-chessground.component.ts`: Central chessboard component
- `projects/ngx-chessground/src/lib/ngx-chessground.service.ts`: Snabbdom rendering service
- `projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer.component.ts`: PGN viewer (largest component at ~2000+ lines)
- `projects/ngx-chessground/src/lib/pgn-viewer/pgn-processor.worker.ts`: PGN processing worker (688 lines)
- `projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer-engine.service.ts`: Worker lifecycle management

**Testing:**
- `projects/ngx-chessground/src/test-providers.ts`: Shared test providers (zoneless)
- `projects/ngx-chessground/src/lib/promotion-dialog/promotion-dialog.component.spec.ts`
- `projects/ngx-chessground/src/lib/promotion-dialog/promotion.service.spec.ts`
- `projects/ngx-chessground/src/lib/pgn-viewer/pgn-viewer-engine.service.spec.ts`

## Naming Conventions

**Files:**
- Angular components: `kebab-case.component.ts` → `ngx-chessground.component.ts`, `pgn-viewer.component.ts`, `play-like-goat.component.ts`
- Services: `kebab-case.service.ts` → `ngx-chessground.service.ts`, `promotion.service.ts`, `pgn-viewer-engine.service.ts`
- Workers: `kebab-case.worker.ts` → `pgn-processor.worker.ts`
- Units/utilities: `camelCase.ts` → `unit.ts`, `util.ts`, `anim.ts`, `basics.ts`
- Spec files: `*.component.spec.ts`, `*.service.spec.ts`
- Styles: Match component name → `.component.scss`, `.component.css`

**Directories:**
- Library components: `kebab-case` directory matching component name → `ngx-chessground/`, `pgn-viewer/`, `promotion-dialog/`
- Example app components: `kebab-case` → `play-like-goat/`, `home-page/`, `pgn-viewer/`

**Selectors:**
- Library components: `ngx-` prefix → `ngx-chessground`, `ngx-chessground-table`, `ngx-pgn-viewer`, `ngx-promotion-dialog`
- Example app components: `app-` prefix → `app-root`, `app-pgn-viewer`

## Where to Add New Code

**New Feature (library):**
- Primary code: `projects/ngx-chessground/src/lib/{new-feature}/` — create a new standalone component
- Service (if stateful): `projects/ngx-chessground/src/lib/{new-feature}/{new-feature}.service.ts`
- Export: Add to `projects/ngx-chessground/src/public-api.ts`
- Tests: `projects/ngx-chessground/src/lib/{new-feature}/{component-or-service}.spec.ts`
- Demo units (if applicable): `projects/ngx-chessground/src/units/{new-unit}.ts`

**New Component (example app):**
- Implementation: `projects/ngx-chessground-example/src/app/{component-name}/` — standalone component with `.ts`, `.html`, `.scss`
- Register route: `projects/ngx-chessground-example/src/app/app.routes.ts`

**Utilities:**
- Shared helpers used by multiple units: `projects/ngx-chessground/src/units/util.ts`
- Domain-specific helpers: New file in `projects/ngx-chessground/src/units/`

**Web Worker:**
- Worker implementation: `projects/ngx-chessground/src/lib/{feature}/{worker-name}.worker.ts`
- Worker manager service: `projects/ngx-chessground/src/lib/{feature}/{feature}-engine.service.ts`

**Static Assets (library):**
- Add files to `projects/ngx-chessground/assets/`
- CSS themes: `projects/ngx-chessground/assets/{theme}.css`
- Images: `projects/ngx-chessground/assets/images/{category}/`
- Configuration: Ensure `ng-package.json` `"assets"` includes the file pattern

## Special Directories

**`projects/ngx-chessground/assets/stockfish/`:**
- Purpose: Contains the stockfish.js Web Worker engine for chess position analysis
- Generated: No (pre-bundled third-party asset)
- Committed: Yes
- Note: Excluded from Biome linting via `biome.json` `"!!**/projects/ngx-chessground/assets/stockfish/stockfish.js"`

**`dist/`:**
- Purpose: Build output directory for both library and example app
- Generated: Yes (by `ng build`)
- Committed: No (in `.gitignore`)

**`coverage/`:**
- Purpose: Test coverage reports
- Generated: Yes (by vitest with `--coverage`)
- Committed: No (in `.gitignore`)

**`projects/ngx-chessground-example/public/`:**
- Purpose: Public static files for the example app (lichess broadcast PGN files)
- Generated: Partial (some downloaded by `scripts/download-lichess.js`)
- Committed: Yes (cached PGN files for offline demo)

**`.planning/`:**
- Purpose: GSD planning artifacts (implementation plans, codebase maps)
- Generated: Yes (by GSD commands)
- Committed: Yes

---

*Structure analysis: 2026-05-02*
