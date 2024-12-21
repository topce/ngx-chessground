import { Component, viewChild } from "@angular/core";
import type { AfterViewInit } from "@angular/core";
import type { Api } from "chessground/api";

import { NgFor } from "@angular/common";
import { ChangeDetectionStrategy } from "@angular/core";
import { MatCardModule } from "@angular/material/card";
import { MatListModule } from "@angular/material/list";
import type { ShortMove } from "chess.js";
import {
	ChessTableComponent,
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
	styleUrls: ["./app.component.css"],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		NgFor,
		MatListModule,
		MatCardModule,
		NgxChessgroundComponent,
		ChessTableComponent,
	],
})
export class AppComponent implements AfterViewInit {
	readonly ngxChessgroundComponent =
		viewChild.required<NgxChessgroundComponent>("chess");
	readonly chessTableComponent =
		viewChild.required<ChessTableComponent>("chess1");
	list: Unit[] = [
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
	newList: Unit[] = [
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

	title = "ngx-chessground-example";
	ngAfterViewInit(): void {
		this.ngxChessgroundComponent().runFunction.set(loadPgnProportionalTime.run);
		// this.chessTableComponent.move({ from: 'e2', to: 'e4' });
		// this.chessTableComponent.move({ from: 'c7', to: 'c5' });
		// this.chessTableComponent.cancelMove();
	}
	public onClick(_name: string, runFn: (el: HTMLElement) => Api) {
		this.ngxChessgroundComponent().runFunction.set(runFn);
	}

	public toggleOrientation() {
		this.chessTableComponent().toggleOrientation();
	}
	public onMove(_moveValue: { color: string; move: ShortMove }) {
		//console.log(moveValue);
		// play against yourself
		this.toggleOrientation();
		// play sicilian
		// this.chessTableComponent.move({ from: 'c7', to: 'c5' });
	}
}
