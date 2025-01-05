import { Component, model, viewChild } from "@angular/core";
import type { AfterViewInit } from "@angular/core";
import type { Api } from "chessground/api";

import { ChangeDetectionStrategy } from "@angular/core";
import {
	MatButtonToggle,
	MatButtonToggleGroup,
} from "@angular/material/button-toggle";
import { MatCardTitle } from "@angular/material/card";
import {
	NgxChessgroundComponent,
	type Unit,
	autoShapes,
	autoSwitch,
	brushModifiers,
	castling,
	changingShapesHigh,
	changingShapesLow,
	checkHighlight,
	conflictingAnim,
	conflictingHold,
	defaults,
	enabledFalse,
	fromFen,
	fullRandom,
	initial,
	lastMoveCrazyhouse,
	lastMoveDrop,
	loadPgnOneSecondPerMove,
	loadPgnProportionalTime,
	loadPgnRealTime,
	move,
	notSameRole,
	playFullRandom,
	playVsRandom,
	presetUserShapes,
	select,
	slowAnim,
	viewOnlyFullRandom,
	visibleFalse,
	vsRandom,
	whileHolding,
	withSameRole,
} from "ngx-chessground";
import { in3dDefaults } from "../../../ngx-chessground/src/units/in3d";

@Component({
	selector: "app-root",
	templateUrl: "./app.component.html",
	styleUrls: ["./app.component.scss"],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		MatCardTitle,
		MatButtonToggleGroup,
		MatButtonToggle,
		NgxChessgroundComponent,
	],
})
export class AppComponent implements AfterViewInit {
	readonly ngxChessgroundComponent =
		viewChild.required<NgxChessgroundComponent>("chess");

	lefMenu = viewChild.required<MatButtonToggleGroup>("leftMenu");
	rightMenu = viewChild.required<MatButtonToggleGroup>("rightMenu");

	leftList: Unit[] = [
		defaults,
		fromFen,
		lastMoveCrazyhouse,
		checkHighlight,
		initial,
		castling,
		playVsRandom,
		playFullRandom,
		slowAnim,
		conflictingHold,
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
	title = "ngx-chessground-example";
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
