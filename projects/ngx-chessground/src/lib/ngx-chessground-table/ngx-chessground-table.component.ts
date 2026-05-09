import {
	type AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	inject,
	viewChild,
} from '@angular/core';
import * as play from '../../units/play';
import { NgxChessgroundComponent } from '../ngx-chessground/ngx-chessground.component';
import { PromotionService } from '../promotion-dialog/promotion.service';

/**
 * A table-style chessboard demo component.
 *
 * Displays a single chessboard initialized with the "Play legal moves from initial position"
 * unit preset, enhanced with dialog-based pawn promotion via {@link PromotionService}.
 *
 * Implements {@link AfterViewInit} to set the run function on the child
 * {@link NgxChessgroundComponent} once the view is ready.
 *
 * @example
 * ```html
 * <ngx-chessground-table />
 * ```
 */
@Component({
	selector: 'ngx-chessground-table',
	templateUrl: './ngx-chessground-table.component.html',
	styleUrls: ['./ngx-chessground-table.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NgxChessgroundComponent],
})
export class NgxChessgroundTableComponent implements AfterViewInit {
	/**
	 * Signal-based view query for the child chessboard component.
	 *
	 * References the `NgxChessgroundComponent` with template variable `#chess`.
	 * Used in {@link ngAfterViewInit} to set the initial board configuration.
	 */
	readonly ngxChessgroundComponent =
		viewChild.required<NgxChessgroundComponent>('chess');

	/** Injected promotion dialog service for pawn promotion UX. */
	private readonly promotionService = inject(PromotionService);

	/**
	 * Initializes the chessboard after the view is rendered.
	 *
	 * Creates unit presets enhanced with dialog-based promotion and assigns
	 * the "initial" unit's run function to the child chessground component.
	 */
	ngAfterViewInit(): void {
		const enhancedUnits = play.createPlayUnitsWithDialog(this.promotionService);
		this.ngxChessgroundComponent().runFunction.set(enhancedUnits.initial.run);
	}
}
