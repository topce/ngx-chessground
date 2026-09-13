import { Component, computed, inject } from '@angular/core';
import type { Api } from 'chessground/api';
import * as play from '../../units/play';
import { NgxChessgroundComponent } from '../ngx-chessground/ngx-chessground.component';
import { PromotionService } from '../promotion-dialog/promotion.service';

/**
 * A table-style chessboard demo component.
 *
 * Displays a single chessboard initialized with the "Play legal moves from initial position"
 * unit preset, enhanced with dialog-based pawn promotion via {@link PromotionService}.
 *
 * The run function is exposed as a `computed`, so the child board receives it
 * directly through its required `runFunction` input — no view-child query, no
 * imperative `effect()`, and no `initialized` guard flag.
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
	/** Injected promotion dialog service for pawn promotion UX. */
	private readonly promotionService = inject(PromotionService);

	/**
	 * Board factory for the "play from the initial position" preset, wired to
	 * the promotion dialog.
	 *
	 * The identity is stable: `createPlayUnitsWithDialog` returns fresh unit
	 * objects only when re-evaluated, and a `computed` caches its result until a
	 * dependency changes. The board therefore is not torn down and recreated.
	 */
	protected readonly runFunction = computed<(el: HTMLElement) => Api>(
		() => play.createPlayUnitsWithDialog(this.promotionService).initial.run,
	);
}
