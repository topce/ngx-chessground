import {
	afterRenderEffect,
	Component,
	type ElementRef,
	inject,
	input,
	model,
	viewChild,
} from '@angular/core';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import { NgxChessgroundService } from '../ngx-chessground.service';

/**
 * Core chessboard component wrapping the chessground library via snabbdom.
 *
 * Accepts a `runFunction` signal-model input that receives the mounted DOM element
 * and must return a chessground `Api` instance. The component manages lifecycle:
 * - Uses an Angular `afterRenderEffect()` to watch both `runFunction` changes
 *   and `viewChild` population, redrawing the board after Angular finishes DOM
 *   rendering. This is the recommended approach for third-party library integration.
 * - When the `runFunction` identity changes, the previous Chessground instance
 *   is destroyed before the new one is created.
 * - Provides an optional `config` input: when its identity changes, the config
 *   is applied to the **existing** instance in place via `Api.set()`. This keeps
 *   animations and drag & drop state intact and is far cheaper than recreating
 *   the instance — the preferred way to update positions/moves.
 * - Provides a `toggleOrientation()` method to flip the board.
 *
 * Uses {@link NgxChessgroundService} (provided at component level) for snabbdom patching
 * and chessground instance management.
 *
 * @example
 * ```html
 * <ngx-chessground [runFunction]="myRunFn()" />
 * ```
 *
 * @example
 * ```typescript
 * myRunFn = signal<(el: HTMLElement) => Api>((el) => {
 *   return Chessground(el, { fen: 'start' });
 * });
 * ```
 */
@Component({
	selector: 'ngx-chessground',
	templateUrl: './ngx-chessground.component.html',
	styleUrl: './ngx-chessground.component.scss',

	providers: [NgxChessgroundService],
})
export class NgxChessgroundComponent {
	/**
	 * Signal-based view query for the board container element.
	 *
	 * References the DOM element with template variable `#chessboard`.
	 * Tracked by `afterRenderEffect` to pass the native element to chessground.
	 */
	readonly elementView = viewChild.required<ElementRef>('chessboard');

	/**
	 * Signal-model function that constructs the chessground instance on a given element.
	 *
	 * This is the primary input mechanism of the component. Changes to this signal
	 * trigger a board redraw via `afterRenderEffect()`.
	 *
	 * @param el — The board container `HTMLElement` mounted in the DOM.
	 * @returns A chessground `Api` instance configured as desired.
	 */
	runFunction = model<(el: HTMLElement) => Api>();

	/**
	 * Optional partial Chessground config applied to the live instance via
	 * `Api.set()` whenever its identity changes.
	 *
	 * Prefer updating the board through this input instead of changing
	 * `runFunction`: the instance is reconfigured in place, preserving
	 * animations, drag & drop state and avoiding recreation costs.
	 */
	readonly config = input<Partial<Config> | null>(null);

	/** Service managing the chessground instance and snabbdom patching lifecycle. */
	private readonly ngxChessgroundService = inject(NgxChessgroundService);

	/** Last run function applied, used to skip redundant instance recreation. */
	private lastFn: ((el: HTMLElement) => Api) | undefined;
	/** Last config applied, used to skip redundant set() calls. */
	private lastConfig: Partial<Config> | null | undefined;

	/**
	 * Sets up an `afterRenderEffect` that redraws the chessboard after Angular
	 * finishes rendering the DOM.
	 *
	 * Uses the recommended phase separation:
	 * - **earlyRead** — reads signals to establish reactive tracking
	 * - **write** — performs DOM manipulation (snabbdom patching) with the
	 *   guarantee that Angular's rendering is complete
	 *
	 * `afterRenderEffect` is the correct API for third-party library
	 * integration per Angular's guidance. Standard `effect` runs before
	 * Angular updates the DOM, which can cause timing issues with
	 * `viewChild` signals and DOM-dependent libraries.
	 */
	constructor() {
		afterRenderEffect({
			earlyRead: () => {
				// Read signals to establish reactive tracking
				return {
					el: this.elementView(),
					fn: this.runFunction(),
					config: this.config(),
				};
			},
			write: (data) => {
				// DOM manipulation only — never read the DOM here
				const { el, fn, config } = data();
				if (!el.nativeElement || !fn) return;
				if (fn !== this.lastFn) {
					this.lastFn = fn;
					this.ngxChessgroundService.redraw(el.nativeElement, fn);
					// A freshly created instance only carries the run function's
					// baked-in config — apply the current config input on top.
					if (config) this.ngxChessgroundService.setConfig(config);
				} else if (config && config !== this.lastConfig) {
					this.ngxChessgroundService.setConfig(config);
				}
				this.lastConfig = config;
			},
		});
	}

	/**
	 * Flips the board orientation (white ↔ black).
	 *
	 * Delegates to {@link NgxChessgroundService.toggleOrientation}.
	 */
	public toggleOrientation() {
		this.ngxChessgroundService.toggleOrientation();
	}
}
