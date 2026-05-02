# Coding Conventions

**Analysis Date:** 2026-05-02

## Naming Patterns

**Files:**
- kebab-case for all TypeScript, HTML, and SCSS files
- Component files: `{name}.component.ts|html|scss` — e.g., `ngx-chessground.component.ts`
- Service files: `{name}.service.ts` — e.g., `pgn-viewer-engine.service.ts`
- Test files: `{name}.spec.ts` (co-located) — e.g., `promotion.service.spec.ts`
- Worker files: `{name}.worker.ts` — e.g., `pgn-processor.worker.ts`
- Utility/data files: descriptive kebab-case — e.g., `eco-moves.ts`, `enhanced-util.ts`

**Directories:**
- kebab-case — e.g., `ngx-chessground/`, `pgn-viewer/`, `promotion-dialog/`
- `units/` directory holds reusable chessboard unit configurations (not "unit tests")

**Classes:**
- PascalCase, suffixed by type — e.g., `NgxChessgroundComponent`, `PgnViewerEngineService`, `PromotionService`, `MockWorker`

**Functions/Methods:**
- camelCase — e.g., `loadGame()`, `jumpToMove()`, `playOtherSide()`, `showPromotionDialog()`
- Factory functions prefixed with `create` — e.g., `createPlayUnitsWithDialog()`, `createEnhancedPlayUnits()`
- Private methods use camelCase — e.g., `private redraw()`, `private handleWorkerMessage()`

**Variables:**
- camelCase for instances — e.g., `chess`, `currentGameIndex`, `filterWhite`
- Private class fields use `private readonly` if immutable — e.g., `private readonly dialog = inject(MatDialog)`
- Unused parameters prefixed with `_` — e.g., `(_ignore?: VNode)`, `(_orig: Key, _dest: Key)`

**Constants (module-level):**
- camelCase for exported unit objects — e.g., `initial`, `castling`, `playVsRandom`
- UPPER_SNAKE_CASE for data constants — e.g., `ECO_MOVES` (in `eco-moves.ts`)

**Interfaces & Types:**
- PascalCase — e.g., `Unit`, `PgnViewerEngineCallbacks`, `PromotionDialogData`, `FilterCriteria`
- `type` keyword for unions/literal types — e.g., `type PromotionPiece = 'q' | 'r' | 'b' | 'n'`
- `interface` keyword for object shapes — e.g., `interface GameMetadata`, `interface WorkerResponse`

**Angular Selectors:**
- Consistent `ngx-` prefix — e.g., `ngx-chessground`, `ngx-chessground-table`, `ngx-pgn-viewer`, `ngx-promotion-dialog`

**Angular Decorator Properties:**
- `templateUrl` for external templates — e.g., `templateUrl: './ngx-chessground.component.html'`
- `styleUrls` for external styles — e.g., `styleUrls: ['./ngx-chessground.component.scss']`
- Inline styles/templates used in `PromotionDialogComponent` (rare, for simpler dialogs)

## Code Style

**Formatting:**
- **Tool:** Biome (`@biomejs/biome` 2.4.6) — config at `biome.json`
- **Indentation:** Tabs (`indentStyle: "tab"`)
- **Quotes:** Single quotes (`quoteStyle: "single"` in Biome; `quote_type = single` in `.editorconfig`)
- **Semicolons:** Required (TypeScript default)
- **Trailing commas:** ES5-style where applicable
- **EditorConfig:** 2-space indent override for most file types in `.editorconfig`, but Biome's tab setting takes precedence for TS files
- **Max line length:** Not enforced (`.editorconfig` sets `max_line_length = off` for `.md`)

**Linting:**
- **ESLint** (`eslint` 10.0.2 + `angular-eslint` + `typescript-eslint` 8.56.1)
  - Config per-project: `projects/ngx-chessground/.eslintrc.json` and `projects/ngx-chessground-example/.eslintrc.json`
  - Extends: `plugin:@angular-eslint/recommended`, `eslint:recommended`, `plugin:@typescript-eslint/recommended`
  - Key rules:
    - `eqeqeq: ["error", "always"]` — strict equality required
    - `@typescript-eslint/no-unused-vars: error` — unused vars forbidden (except `_`-prefixed)
    - `no-console: ["error", { "allow": ["error"] }]` — only `console.error` allowed; `console.log`/`console.warn` forbidden
    - `@typescript-eslint/ban-types: off` — allows use of `object`, `Function`, etc.
    - `@typescript-eslint/explicit-module-boundary-types: off` — return types not required for exported functions
    - `@typescript-eslint/no-empty-object-type: off`
    - `no-useless-escape: off`
  - HTML rules: `@angular-eslint/template/recommended` + `accessibility`, with a few rules relaxed (`click-events-have-key-events: off`, `alt-text: off`)
- **Biome linter:** In addition to formatting, Biome provides lint rules (`recommended: true`) with `useImportType: off`

## Import Organization

**Order (observed in source):**
1. Angular core (`@angular/core`)
2. Angular framework modules (`@angular/common`, `@angular/material/*`)
3. Third-party libraries (`chess.js`, `chessground`, `chessops`, `snabbdom`, `fzstd`, `jszip`)
4. Library-local relative imports (`../`, `./`)

**Type-Only Imports:**
- Use `import type` for type-only imports — e.g., `import type { Api } from 'chessground/api'`

**Path Aliases:**
- `ngx-chessground` maps to `projects/ngx-chessground/src/public-api.ts` (in root `tsconfig.json`)
- No other path aliases configured

## Error Handling

**Patterns:**
- `try`/`catch` blocks for async operations — e.g., `loadFromUrl()`, `loadFromClipboard()`, `onPgnFileSelected()`
- `catch` blocks log via `console.error()` and may show user-facing messages via `MatSnackBar`
- Error callbacks passed as optional parameters — e.g., `onError?: (message: string, error?: unknown) => void`
- Early return guards — e.g., `if (!this.stockfishWorker) { return false; }`
- Nullish coalescing for defaults — e.g., `return result ?? 'q'`
- Optional chaining for null safety — e.g., `this.pgnWorker?.postMessage()`, `callbacks.onError?.()`

**In Angular:**
- Signal inputs and models used for reactive state; errors set loading/status flags
- Web Worker errors communicated via typed messages (`WorkerResponse` with `error` field)

## Logging

**Framework:** `console` (restricted)

**Patterns:**
- Only `console.error()` is permitted by ESLint (`no-console` rule)
- `console.log`/`console.warn` must be removed or comment-disabled
- Errors are logged to console and optionally surfaced to users via `MatSnackBar` snackbar messages
- Debug comments with `// console.log(...)` occasionally left as commented-out code in `units/play.ts`

## Comments

**When to Comment:**
- All exported classes, interfaces, constants, and public methods use **JSDoc** block comments
- JSDoc includes `@param`, `@returns`, `@type`, `@property`, `@constant`, `@class`, `@implements`, `@remarks`, `@example` tags
- Internal logic sometimes has inline `//` comments explaining chess-specific behavior
- TODO comments: only 1 found (`TODO: This component has been partially migrated to be zoneless-compatible.` in `promotion-dialog.component.ts` line 20)

**JSDoc Style:**
```typescript
/**
 * Represents a unit with a name and a run method.
 */
export interface Unit {
  /**
   * The name of the unit.
   */
  name: string;
  /**
   * Executes the unit's functionality.
   * @param el - The HTML element to run the unit on.
   * @returns An instance of Api.
   */
  run: (el: HTMLElement) => Api;
}
```

## Function Design

**Size:** Most functions are under 40 lines. The `pgn-viewer.component.ts` is an exception at ~1916 lines with many methods — this is the most complex component and should be refactored into separate concerns.

**Parameters:**
- Object-based callbacks grouped into interfaces — e.g., `PgnViewerEngineCallbacks` (bundles `onPgnMessage`, `onStockfishMessage`, `onError`)
- Destructuring used sparingly
- Functions accepting many arguments use named object parameters via interfaces (e.g., `FilterCriteria`)

**Return Values:**
- Boolean for success/failure — e.g., `initialize(): boolean`, `analyzePosition(): boolean`
- `void` for commands — e.g., `loadGame(): void`, `dispose(): void`
- Promises for async — e.g., `async showPromotionDialog(): Promise<PromotionPiece>`
- Factory functions return objects with multiple named exports — e.g., `createEnhancedPlayUnits()` returns `{ initial, castling, ... }`

## Module Design

**Exports:**
- Barrel exports via `public-api.ts` — all public symbols re-exported from a single entry point
- Named exports used exclusively; no default exports (except `export default testProviders` in `test-providers.ts`)

**Component Architecture:**
- **Standalone components** (no NgModules) — each component declares its own `imports: [...]` in the `@Component` decorator
- Signal-based reactivity — `signal()`, `computed()`, `input()`, `model()`, `viewChild()` used throughout
- ChangeDetectionStrategy.OnPush on all components (except `PromotionDialogComponent`, which still uses Default with a TODO)
- Dependency injection via `inject()` function (no constructor injection for services)
- Services marked `@Injectable({ providedIn: 'root' })` for singleton services; `@Injectable()` (no `providedIn`) for component-scoped services like `NgxChessgroundService`

## Angular-Specific Conventions

**Lifecycle Hooks:**
- `AfterViewInit` used to initialize chessboard after DOM is ready
- `OnDestroy` used to clean up workers and timeouts
- `effect()` in constructors for reactive side effects

**Zoneless:**
- Test providers use `provideZonelessChangeDetection()`
- Components being migrated to zoneless compatibility (in progress)

**Styling:**
- SCSS used for component styles (`.scss` files)
- Inline styles used in `PromotionDialogComponent` for contained dialog styling
- CSS files also used — e.g., `pgn-viewer.component.css`

**Template:**
- External HTML template files for complex components
- Inline templates for simpler components (e.g., `PromotionDialogComponent`)
- Angular Material components used for UI (`MatDialog`, `MatSnackBar`, `MatButton`, `MatIcon`)
- ARIA labels on interactive elements — e.g., `[attr.aria-label]="'Promote to Queen'"`

---

*Convention analysis: 2026-05-02*
