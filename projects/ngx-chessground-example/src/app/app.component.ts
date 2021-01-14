import { Component } from '@angular/core';
import { Api } from 'chessground/api';

import * as basics from './units/basics';
import * as play from './units/play';
import * as perf from './units/perf';
import * as zh from './units/zh';
import * as anim from './units/anim';
import * as svg from './units/svg';
import * as in3d from './units/in3d';
import * as fen from './units/fen';
import * as viewOnly from './units/viewOnly';
import * as pgn from './units/pgn';
import { Unit } from './units/unit';
import { AfterViewInit } from '@angular/core';

import { ViewChild } from '@angular/core';
import { ChangeDetectionStrategy } from '@angular/core';
import { NgxChessgroundComponent } from 'ngx-chessground';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements AfterViewInit {
  list: Unit[] = [
    basics.defaults,
    basics.fromFen,
    basics.lastMoveCrazyhouse,
    basics.checkHighlight,
    play.initial,
    play.castling,
    play.vsRandom,
    play.fullRandom,
    play.slowAnim,
    play.conflictingHold,
    perf.move,
    perf.select,
    anim.conflictingAnim,
    anim.withSameRole,
    anim.notSameRole,
    anim.whileHolding,
    zh.lastMoveDrop,
    svg.presetUserShapes,
    svg.changingShapesHigh,
    svg.changingShapesLow,
    svg.brushModifiers,
    svg.autoShapes,
    svg.visibleFalse,
    svg.enabledFalse,
    in3d.defaults,
    in3d.vsRandom,
    in3d.fullRandom,
    fen.autoSwitch,
    viewOnly.fullRandom,
  ];
  newList: Unit[] = [
    pgn.loadPgnRealTime,
    pgn.loadPgnOneSecondPerMove,
    pgn.loadPgnProportionalTime,
  ];

  title = 'ngx-chessground-example';
  @ViewChild('chess') ngxChessgroundComponent!: NgxChessgroundComponent;
  ngAfterViewInit(): void {
    this.ngxChessgroundComponent.runFn = pgn.loadPgnProportionalTime.run;
  }
  public onClick(name: string, runFn: (el: HTMLElement) => Api) {
    this.ngxChessgroundComponent.runFn = runFn;
  }
}
