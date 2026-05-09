import {
	type AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	type ElementRef,
	effect,
	model,
	viewChild,
	inject,
} from '@angular/core';
import type { Api } from 'chessground/api';
import { NgxChessgroundService } from '../ngx-chessground.service';

/**
 * Core chessboard component wrapping the chessground library via snabbdom.
 *
 * Accepts a `runFunction` signal-model input that receives the mounted DOM element
 * and must return a chessground `Api` instance. The component manages lifecycle:
 * - Uses an Angular `effect()` to watch `runFunction` changes and redraw the board.
 * - Calls `redraw()` on `ngAfterViewInit` so the board appears as soon as the view is ready.
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
	styleUrls: ['./ngx-chessground.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	providers: [NgxChessgroundService],
})
export class NgxChessgroundComponent implements AfterViewInit {
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
	 * Sets up a reactive effect that redraws the board whenever {@link runFunction} changes.
	 *
	 * This is the wiring that makes dynamic board configuration (switching FEN, orientation, etc.)
	 * work seamlessly — just update the signal and the board reacts.
	 */
	constructor() {
		effect(() => {
			this.redraw();
		});
	}

	/**
	 * Redraws the board once the view is initialized.
	 *
	 * Ensures the board is rendered on first load. Subsequent redraws
	 * are handled by the `effect()` watching `runFunction`.
	 */
	ngAfterViewInit() {
		this.redraw();
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
