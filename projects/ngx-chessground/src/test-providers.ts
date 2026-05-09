import {
	provideZonelessChangeDetection,
	type EnvironmentProviders,
} from '@angular/core';

/**
 * Default test providers for ngx-chessground test environments.
 *
 * Configures zoneless change detection (via {@link provideZonelessChangeDetection})
 * to match the library's production behavior. Import this array in your TestBed
 * `providers` configuration:
 *
 * ```typescript
 * import testProviders from 'ngx-chessground/test-providers';
 *
 * TestBed.configureTestingModule({
 *   providers: [...testProviders],
 * });
 * ```
 */
const testProviders: EnvironmentProviders[] = [
	provideZonelessChangeDetection(),
];

export default testProviders;