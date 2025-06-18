import type { AfterViewInit } from "@angular/core";
import {
	ChangeDetectionStrategy,
	Component,
	inject,
	model,
	viewChild,
} from "@angular/core";
import {
	MatButtonToggle,
	MatButtonToggleGroup,
} from "@angular/material/button-toggle";
import type { Api } from "chessground/api";
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
} from "ngx-chessground";
import { in3dDefaults } from "../../../../ngx-chessground/src/units/in3d";

@Component({
	selector: "app-home-page",
	imports: [MatButtonToggleGroup, MatButtonToggle, NgxChessgroundComponent],
	templateUrl: "./home-page.component.html",
	styleUrl: "./home-page.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
})
export class HomePageComponent implements AfterViewInit {
	readonly ngxChessgroundComponent =
		viewChild.required<NgxChessgroundComponent>("chess");

	lefMenu = viewChild.required<MatButtonToggleGroup>("leftMenu");
	rightMenu = viewChild.required<MatButtonToggleGroup>("rightMenu");

	private readonly promotionService = inject(PromotionService);

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
	title = "Chessground Examples";

	ngAfterViewInit(): void {
		this.ngxChessgroundComponent().runFunction.set(loadPgnProportionalTime.run);
		this.rightMenu().value = loadPgnProportionalTime.name;
	}

	public onClick(name: string, runFn: (el: HTMLElement) => Api) {
		// scroll to top
		window.scrollTo(0, 0);

		if (this.rightList.findIndex((unit) => unit.name === name) !== -1) {
			this.leftValue.set(null);
		} else {
			this.rightValue.set(null);
		}
		this.ngxChessgroundComponent().runFunction.set(runFn);
	}
}
