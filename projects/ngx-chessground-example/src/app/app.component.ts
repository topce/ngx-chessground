import { Component } from '@angular/core';
import { Api } from 'chessground/api';
import { AfterViewInit } from '@angular/core';
import { ViewChild } from '@angular/core';
import { ChangeDetectionStrategy } from '@angular/core';
import {
  autoShapes,
  autoSwitch,
  brushModifiers,
  castling,
  changingShapesHigh,
  changingShapesLow,
  checkHighlight,
  ChessTableComponent,
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
  NgxChessgroundComponent,
  notSameRole,
  playFullRandom,
  playVsRandom,
  presetUserShapes,
  select,
  slowAnim,
  Unit,
  viewOnlyFullRandom,
  visibleFalse,
  vsRandom,
  whileHolding,
  withSameRole,
} from 'ngx-chessground';
import { in3dDefaults } from '../../../ngx-chessground/src/units/in3d';
import { ShortMove } from 'chess.js';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements AfterViewInit {
  @ViewChild('chess') ngxChessgroundComponent!: NgxChessgroundComponent;
  @ViewChild('chess1') chessTableComponent!: ChessTableComponent;
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

  title = 'ngx-chessground-example';
  ngAfterViewInit(): void {
    this.ngxChessgroundComponent.runFn = loadPgnProportionalTime.run;
    // this.chessTableComponent.move({ from: 'e2', to: 'e4' });
    // this.chessTableComponent.move({ from: 'c7', to: 'c5' });
    // this.chessTableComponent.cancelMove();
  }
  public onClick(name: string, runFn: (el: HTMLElement) => Api) {
    this.ngxChessgroundComponent.runFn = runFn;
  }

  public toggleOrientation() {
    this.chessTableComponent.toggleOrientation();
  }
  public onMove(moveValue: { color: string; move: ShortMove }) {
    console.log(moveValue);
    // play against yourself
    this.toggleOrientation();
    // play sicilian
    // this.chessTableComponent.move({ from: 'c7', to: 'c5' });
  }
}
