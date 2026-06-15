import { Component, effect, inject, viewChild } from '@angular/core';
import * as play from '../../units/play';
import { NgxChessgroundComponent } from '../ngx-chessground/ngx-chessground.component';
import { PromotionService } from '../promotion-dialog/promotion.service';

/**
 * A table-style chessboard demo component.
 *
 * Displays a single chessboard initialized with the "Play legal moves from initial position"
 * unit preset, enhanced with dialog-based pawn promotion via {@link PromotionService}.
 *
 * Uses a reactive `effect()` to set the run function on the child
 * {@link NgxChessgroundComponent} once the view child is available.
 *
 * @example
 * ```html
 * <ngx-chessground-table />
 * ```
 */
@Component({
	selector: 'ngx-chessground-table',
	templateUrl: './ngx-chessground-table.component.html',
	styleUrl: './ngx-chessground-table.component.scss',

	imports: [NgxChessgroundComponent],
})
export class NgxChessgroundTableComponent {
	/**
	 * Signal-based view query for the child chessboard component.
	 *
	 * References the `NgxChessgroundComponent` with template variable `#chess`.
	 * Used by the constructor effect to set the initial board configuration.
	 */
	readonly ngxChessgroundComponent =
		viewChild.required<NgxChessgroundComponent>('chess');

	/** Injected promotion dialog service for pawn promotion UX. */
	private readonly promotionService = inject(PromotionService);

	/** Tracks whether the run function has been initialized. */
	private initialized = false;

	constructor() {
		/**
		 * Reactively initializes the chessboard when the view child is available.
		 *
		 * Creates unit presets enhanced with dialog-based promotion and assigns
		 * the "initial" unit's run function to the child chessground component.
		 * Uses a guard to run only once, since the run function is a stable reference
		 * that doesn't need re-setting on every change detection.
		 */
		effect(() => {
			const chessComponent = this.ngxChessgroundComponent();
			if (chessComponent && !this.initialized) {
				this.initialized = true;
				const enhancedUnits = play.createPlayUnitsWithDialog(
					this.promotionService,
				);
				chessComponent.runFunction.set(enhancedUnits.initial.run);
			}
		});
	}
}
