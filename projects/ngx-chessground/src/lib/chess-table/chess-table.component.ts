import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  AfterViewInit,
  ViewChild,
  ElementRef,
  Output,
  EventEmitter,
} from '@angular/core';
import { h } from 'snabbdom';
import { init } from 'snabbdom';

import { VNode } from 'snabbdom';
import { classModule } from 'snabbdom';
import { attributesModule } from 'snabbdom';
import { eventListenersModule } from 'snabbdom';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';

import { Key, Piece } from 'chessground/types';
import { Chess, playOtherSide, toDests } from '../../units/util';
import { Square, ShortMove } from 'chess.js';
@Component({
  selector: 'ngx-chessground-chess-table',
  templateUrl: './chess-table.component.html',
  styleUrls: ['./chess-table.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChessTableComponent implements OnInit, AfterViewInit {
  @ViewChild('chessboard')
  elementView!: ElementRef;
  @Output() moves = new EventEmitter<ShortMove>();

  private patch = init([classModule, attributesModule, eventListenersModule]);
  private vnode!: VNode;
  private cg!: Api;
  private runFn!: (el: HTMLElement) => Api;
  private chess = new Chess();

  constructor() {}

  ngOnInit(): void {
    this.runFn = (el) => {
      this.cg = Chessground(el, {
        movable: {
          color: 'white',
          free: false,
          dests: toDests(this.chess),
        },
        draggable: {
          showGhost: true,
        },
        events: {
          move: (orig: Key, dest: Key, capturedPiece?: Piece) => {
            const playedMove = this.chess.move({
              from: orig as Square,
              to: dest as Square,
            });
            if (playedMove === null) {
              let promotedPiece = window.prompt('Promote to Q,N,R or B', 'Q');
              if (promotedPiece !== null) {
                promotedPiece = promotedPiece.toLowerCase();
              }
              let newPiece: 'b' | 'n' | 'r' | 'q' = 'q';
              if (
                promotedPiece === 'b' ||
                promotedPiece === 'n' ||
                promotedPiece === 'r'
              ) {
                newPiece = promotedPiece;
              }
              this.chess.move({
                from: orig as Square,
                to: dest as Square,
                promotion: newPiece,
              });
              this.moves.emit({
                from: orig as Square,
                to: dest as Square,
                promotion: newPiece,
              });
            } else {
              this.moves.emit({
                from: orig as Square,
                to: dest as Square,
              });
            }
            this.cg.set({ fen: this.chess.fen() });
          },
        },
      });
      this.cg.set({
        movable: { events: { after: playOtherSide(this.cg, this.chess) } },
      });
      return this.cg;
    };
  }

  ngAfterViewInit() {
    this.redraw();
  }
  public move(move: ShortMove) {
    this.chess.move(move);
    this.cg.set({ fen: this.chess.fen() });
    const color = this.chess.history().length % 2 === 1 ? 'black' : 'white';
    this.cg.set({
      movable: {
        color,
        free: false,
        dests: toDests(this.chess),
      },
      draggable: {
        showGhost: true,
      },
    });
  }
  public toggleOrientation() {
    this.cg.toggleOrientation();
  }

  private redraw() {
    if (this.elementView.nativeElement) {
      this.vnode = this.patch(
        this.vnode || this.elementView.nativeElement,
        this.render()
      );
    }
  }

  private render(): VNode {
    return h('div#chessground-examples', [
      h('section.blue.merida', [
        h('div.cg-wrap', {
          hook: {
            insert: this.runUnit,
            postpatch: this.runUnit,
          },
        }),
      ]),
    ]);
  }

  private runUnit = (vnode: VNode) => {
    const el = vnode.elm as HTMLElement;
    el.className = 'cg-wrap';
    // @ts-ignore
    window.cg = this.cg;
    return this.runFn(el);
  };
}
