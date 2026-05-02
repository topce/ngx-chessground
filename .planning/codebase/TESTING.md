# Testing Patterns

**Analysis Date:** 2026-05-02

## Test Framework

**Runner:**
- **Vitest** 4.0.18
- Config: `projects/ngx-chessground/vitest.config.ts`
- Angular integration: `@angular/build:unit-test` builder configured in `angular.json`

**Assertion Library:**
- Vitest built-in (`expect`)

**Mocking Library:**
- Vitest built-in (`vi`)

**Browser Environment:**
- JSDOM 28.1.0

**Run Commands:**
```bash
ng test ngx-chessground --no-watch                  # Run all tests once
ng test ngx-chessground --no-watch --coverage       # Run tests with coverage
npm run test:lib                                    # Alias for ng test ngx-chessground --no-watch
npm run test:lib:coverage                           # Alias with coverage
```

## Test File Organization

**Location:**
- Co-located with source files — `.spec.ts` files sit alongside the implementation files
- All tests under `projects/ngx-chessground/src/lib/**/`

**Naming:**
- `{filename}.spec.ts` — e.g., `promotion.service.spec.ts`, `promotion-dialog.component.spec.ts`
- In `tsconfig.spec.json`, both `*.spec.ts` and `*.test.ts` patterns are included

**Current Test Files (3 total):**
```
projects/ngx-chessground/src/lib/
├── pgn-viewer/
│   └── pgn-viewer-engine.service.spec.ts       (128 lines)
├── promotion-dialog/
│   ├── promotion-dialog.component.spec.ts       (32 lines)
│   └── promotion.service.spec.ts                (34 lines)
```

**What is NOT tested (coverage gaps):**
- `NgxChessgroundComponent` — no spec
- `NgxChessgroundTableComponent` — no spec
- `NgxPgnViewerComponent` — no spec (1916-line component)
- `NgxChessgroundService` — no spec
- `pgn-processor.worker.ts` — no spec
- All `units/*.ts` files — no specs (14 files)
- `eco-moves.ts` — no spec
- Example app (`projects/ngx-chessground-example/`) — no specs

## Test Structure

**Suite Organization:**
Tests follow a standard Vitest structure with `describe` blocks for grouping and `it` blocks for individual cases.

**Pattern from `promotion.service.spec.ts`:**
```typescript
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PromotionService } from './promotion.service';

describe('PromotionService', () => {
  it('returns the selected promotion piece', async () => {
    const open = vi.fn().mockReturnValue({
      afterClosed: () => of('n'),
    });

    TestBed.configureTestingModule({
      providers: [{ provide: MatDialog, useValue: { open } }],
    });

    const service = TestBed.inject(PromotionService);
    await expect(service.showPromotionDialog('white')).resolves.toBe('n');
    expect(open).toHaveBeenCalledOnce();
  });
});
```

**Patterns:**
- **Setup:** `TestBed.configureTestingModule()` with `providers` array for dependency mocking
- **Component tests:** Include `imports: [ComponentUnderTest]` and call `compileComponents()` before `createComponent()`
- **Teardown:** `afterEach` with `vi.unstubAllGlobals()` when globals are stubbed
- **Async:** `async`/`await` with `expect(...).resolves` for Promises, or `await fixture.whenStable()` for component rendering

**Test Providers:**
- Shared providers configured in `projects/ngx-chessground/src/test-providers.ts`:
```typescript
import { provideZonelessChangeDetection, type EnvironmentProviders } from '@angular/core';
const testProviders: EnvironmentProviders[] = [provideZonelessChangeDetection()];
export default testProviders;
```
- Referenced in `angular.json` via `providersFile: "projects/ngx-chessground/src/test-providers.ts"`

## Mocking

**Framework:** Vitest `vi` object

**Patterns:**

**Service Mocking (value-based):**
```typescript
const open = vi.fn().mockReturnValue({
  afterClosed: () => of('n'),
});

TestBed.configureTestingModule({
  providers: [{ provide: MatDialog, useValue: { open } }],
});
```

**Global Stubbing:**
```typescript
beforeEach(() => {
  vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});
```

**Class Mocking (manual mock class):**
```typescript
class MockWorker {
  static instances: MockWorker[] = [];
  readonly messages: unknown[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  terminated = false;

  constructor(readonly script: unknown) {
    MockWorker.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  static reset(): void {
    MockWorker.instances = [];
  }
}
```

**What to Mock:**
- External Angular services (`MatDialog`, `MatDialogRef`, `MAT_DIALOG_DATA`)
- Browser APIs (`Worker`, `navigator.clipboard`)
- Observables returned by services (via `of()` from `rxjs`)

**What NOT to Mock:**
- The service/component under test itself — always use real instances via `TestBed.inject()` or `TestBed.createComponent()`
- Pure utility functions — test them through the real implementation

## Fixtures and Factories

**Test Data:**
- Test data is defined inline within each test case
- No shared fixture files or test data factories exist
- Simple string/number/object literals used — e.g., `of('n')` for mock dialog result, `{ color: 'black' }` for dialog data

**Filter criteria fixture example (from `pgn-viewer-engine.service.spec.ts`):**
```typescript
const filterCriteria: FilterCriteria = {
  white: 'Carlsen',
  black: '',
  result: '1-0',
  moves: false,
  ignoreColor: false,
  targetMoves: [],
  minWhiteRating: 0,
  minBlackRating: 0,
  maxWhiteRating: 0,
  maxBlackRating: 0,
  eco: '',
  timeControl: '',
  event: '',
};
```

## Coverage

**Thresholds (configured in `vitest.config.ts`):**
```typescript
coverage: {
  thresholds: {
    branches: 90,
    functions: 75,
    lines: 90,
    statements: 90,
  },
},
```

**Provider:** `@vitest/coverage-v8` 4.0.18

**Coverage Reports:** Configured in `angular.json`:
```json
"coverage": true,
"coverageReporters": ["text", "html"]
```

**View Coverage:**
```bash
ng test ngx-chessground --no-watch --coverage    # Generate coverage
# Open coverage/ngx-chessground/index.html        # View HTML report
```

**Current Coverage Reality:** With only 3 spec files covering 3 of ~30 source files, actual coverage is far below the configured thresholds. The thresholds serve as aspirational targets but are not enforced as blocking.

## Test Types

**Unit Tests:**
- Currently the only test type present
- Component tests: Create component via `TestBed.createComponent()`, inspect `fixture.nativeElement`
- Service tests: Inject via `TestBed.inject()`, test methods directly
- Worker tests: Mock `Worker` global, verify message passing

**Integration Tests:**
- Not present in the codebase

**E2E Tests:**
- Not used

## Common Patterns

**Async Testing:**
```typescript
// Service returning a Promise
it('returns the selected promotion piece', async () => {
  const service = TestBed.inject(PromotionService);
  await expect(service.showPromotionDialog('white')).resolves.toBe('n');
});

// Component with async creation
it('renders the injected color', async () => {
  await TestBed.configureTestingModule({
    imports: [PromotionDialogComponent],
    providers: [...]
  }).compileComponents();

  const fixture = TestBed.createComponent(PromotionDialogComponent);
  await fixture.whenStable();
  // ... assertions
});
```

**Error Testing:**
```typescript
// Pattern: verify error is not called in happy path
expect(onError).not.toHaveBeenCalled();

// Pattern: verify error callback receives correct message
expect(onError).toHaveBeenCalledWith(
  'Web Workers are not supported in this environment.',
);
```

**Verification:**
```typescript
expect(vi.fn()).toHaveBeenCalledOnce();          // Called exactly once
expect(vi.fn()).toHaveBeenCalledWith(arg);       // Called with specific args
expect(vi.fn()).toHaveBeenCalledTimes(1);        // Called specific number of times
expect(value).resolves.toBe(expected);           // Promise resolution
expect(element.querySelector('.class')).not.toBeNull();  // DOM presence
```

---

*Testing analysis: 2026-05-02*
