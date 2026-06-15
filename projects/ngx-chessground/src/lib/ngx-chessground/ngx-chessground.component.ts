import {
	Component,
	type ElementRef,
	effect,
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
 * - Uses an Angular `effect()` (in zoneless mode) to watch both `runFunction` changes
 *   and `viewChild` population, redrawing the board whenever either is ready.
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
	 * Used by {@link redraw} to pass the native element to chessground.
	 */
	readonly elementView = viewChild.required<ElementRef>('chessboard');

	/**
	 * Signal-model function that constructs the chessground instance on a given element.
	 *
	 * This is the primary input mechanism of the component. Changes to this signal
	 * trigger a board redraw via the internal `effect()`.
	 *
	 * @param el — The board container `HTMLElement` mounted in the DOM.
	 * @returns A chessground `Api` instance configured as desired.
	 */
	runFunction = model<(el: HTMLElement) => Api>();

	/** Service managing the chessground instance and snabbdom patching lifecycle. */
	private readonly ngxChessgroundService = inject(NgxChessgroundService);

	/**
	 * Sets up a reactive effect that redraws the board whenever {@link runFunction}
	 * or the underlying DOM element changes.
	 *
	 * The effect handles both initial render (once the view is created and the
	 * signal-based {@link elementView} is populated) and subsequent updates when
	 * a parent writes a new function to the {@link runFunction} model signal.
	 *
	 * In zoneless mode, `viewChild` signals populate when the view template is
	 * rendered; the effect is scheduled after change detection, so both the
	 * element reference and the run function are guaranteed to be available.
	 */
	constructor() {
		effect(() => {
			this.redraw();
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

	/**
	 * Re-renders the chessboard via the snabbdom patching service.
	 *
	 * Retrieves the board element and current run function, then delegates
	 * to {@link NgxChessgroundService.redraw}.
	 */
	private redraw() {
		const elementView = this.elementView();
		const fn = this.runFunction();
		if (elementView.nativeElement && fn) {
			this.ngxChessgroundService.redraw(elementView.nativeElement, fn);
		}
	}
}
