import {
	Component,
	type ElementRef,
	afterRenderEffect,
	inject,
	model,
	viewChild,
} from '@angular/core';
import type { Api } from 'chessground/api';
import { NgxChessgroundService } from '../ngx-chessground.service';

/**
 * Core chessboard component wrapping the chessground library via snabbdom.
 *
 * Accepts a `runFunction` signal-model input that receives the mounted DOM element
 * and must return a chessground `Api` instance. The component manages lifecycle:
 * - Uses an Angular `afterRenderEffect()` to watch both `runFunction` changes
 *   and `viewChild` population, redrawing the board after Angular finishes DOM
 *   rendering. This is the recommended approach for third-party library integration.
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

	/** Service managing the chessground instance and snabbdom patching lifecycle. */
	private readonly ngxChessgroundService = inject(NgxChessgroundService);

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
				};
			},
			write: (data) => {
			// DOM manipulation only — never read the DOM here
			const { el, fn } = data();
			if (el.nativeElement && fn) {
				this.ngxChessgroundService.redraw(el.nativeElement, fn);
			}
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
