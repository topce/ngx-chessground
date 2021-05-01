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

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements AfterViewInit {
  @ViewChild('chess') ngxChessgroundComponent!: NgxChessgroundComponent;
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
  ];
  newList: Unit[] = [
    loadPgnRealTime,
    loadPgnOneSecondPerMove,
    loadPgnProportionalTime,
  ];

  title = 'ngx-chessground-example';
  ngAfterViewInit(): void {
    this.ngxChessgroundComponent.runFn = initial.run;
  }
  public onClick(name: string, runFn: (el: HTMLElement) => Api) {
    this.ngxChessgroundComponent.runFn = runFn;
  }
}
