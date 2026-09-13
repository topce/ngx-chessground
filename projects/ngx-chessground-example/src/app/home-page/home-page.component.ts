import {
	Component,
	effect,
	inject,
	model,
	signal,
	viewChild,
} from '@angular/core';
import {
	MatButtonToggle,
	MatButtonToggleGroup,
} from '@angular/material/button-toggle';
import type { Api } from 'chessground/api';
import {
	autoShapes,
	autoSwitch,
	brushModifiers,
	changingShapesHigh,
	changingShapesLow,
	checkHighlight,
	conflictingAnim,
	createPlayUnitsWithDialog,
	defaults,
	enabledFalse,
	fromFen,
	fullRandom,
	in3dDefaults,
	lastMoveCrazyhouse,
	lastMoveDrop,
	loadPgnOneSecondPerMove,
	loadPgnProportionalTime,
	loadPgnRealTime,
	move,
	NgxChessgroundComponent,
	notSameRole,
	PromotionService,
	presetUserShapes,
	select,
	type Unit,
	viewOnlyFullRandom,
	visibleFalse,
	vsRandom,
	whileHolding,
	withSameRole,
} from 'ngx-chessground';

@Component({
	selector: 'app-home-page',
	imports: [MatButtonToggleGroup, MatButtonToggle, NgxChessgroundComponent],
	templateUrl: './home-page.component.html',
	styleUrl: './home-page.component.scss',
})
export class HomePageComponent {
	lefMenu = viewChild.required<MatButtonToggleGroup>('leftMenu');
	rightMenu = viewChild.required<MatButtonToggleGroup>('rightMenu');

	private readonly promotionService = inject(PromotionService);

	/**
	 * Board factory currently shown in the centre board.
	 *
	 * Held as a signal and bound through the board's required `runFunction`
	 * input, rather than pushed imperatively into a view-child. Changing it
	 * re-creates the chessground instance — which is exactly what switching
	 * example units means.
	 */
	readonly runFunction = signal<(el: HTMLElement) => Api>(
		loadPgnProportionalTime.run,
	);

	/**
	 * Initialised-once guard for the right-hand menu default.
	 */
	private initialized = false;

	// Create enhanced units with promotion dialog support
	private readonly enhancedUnits = createPlayUnitsWithDialog(
		this.promotionService,
	);

	leftList: Unit[] = [
		defaults,
		fromFen,
		lastMoveCrazyhouse,
		checkHighlight,
		this.enhancedUnits.initial, // Use enhanced version with dialog
		this.enhancedUnits.castling, // Use enhanced version with dialog
		this.enhancedUnits.playVsRandom, // Use enhanced version - AI vs player, AI handles promotions
		this.enhancedUnits.playFullRandom, // Use enhanced version - AI vs AI, no dialog needed
		this.enhancedUnits.slowAnim, // Use enhanced version - AI vs player, AI handles promotions
		this.enhancedUnits.conflictingHold,
		move,
		select,
		conflictingAnim,
		withSameRole,
		notSameRole,
		whileHolding,
	];
	rightList: Unit[] = [
		lastMoveDrop,
		presetUserShapes,
		changingShapesHigh,
		changingShapesLow,
		brushModifiers,
		autoShapes,
		visibleFalse,
		enabledFalse,
		in3dDefaults,
		vsRandom,
		fullRandom,
		autoSwitch,
		viewOnlyFullRandom,
		loadPgnRealTime,
		loadPgnOneSecondPerMove,
		loadPgnProportionalTime,
	];
	leftValue = model<string | null>(null);
	rightValue = model<string | null>(
		this.rightList[this.rightList.length - 1].name,
	);
	title = 'Chessground Examples';

	constructor() {
		// Reflect the initially selected unit in the right-hand menu. The board
		// itself already renders `runFunction` through its template binding.
		effect(() => {
			const menu = this.rightMenu();
			if (menu && !this.initialized) {
				this.initialized = true;
				menu.value = loadPgnProportionalTime.name;
			}
		});
	}

	public onClick(name: string, runFn: (el: HTMLElement) => Api) {
		// Defer scroll to avoid blocking the interaction's next paint
		requestAnimationFrame(() => window.scrollTo(0, 0));

		if (this.rightList.findIndex((unit) => unit.name === name) !== -1) {
			this.leftValue.set(null);
		} else {
			this.rightValue.set(null);
		}
		this.runFunction.set(runFn);
	}
}
