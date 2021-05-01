import { Api } from 'chessground/api';
import { Color, Key } from 'chessground/types';
import * as ChessJS from 'chess.js';
import { ChessInstance, Square } from 'chess.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const Chess = typeof ChessJS === 'function' ? ChessJS : ChessJS.Chess;

export function toDests(chess: ChessInstance): Map<Key, Key[]> {
  const dests = new Map();
  chess.SQUARES.forEach((s) => {
    const ms = chess.moves({ square: s, verbose: true });
    if (ms.length) {
      dests.set(
        s,
        ms.map((m) => m.to)
      );
    }
  });
  return dests;
}

export function toColor(chess: ChessInstance): Color {
  return chess.turn() === 'w' ? 'white' : 'black';
}

export function playOtherSide(cg: Api, chess: ChessInstance) {
  return (orig: Key, dest: Key) => {
    chess.move({ from: orig as Square, to: dest as Square });
    cg.set({
      turnColor: toColor(chess),
      movable: {
        color: toColor(chess),
        dests: toDests(chess),
      },
    });
  };
}

export function aiPlay(
  cg: Api,
  chess: ChessInstance,
  delay: number,
  firstMove: boolean
) {
  return (orig: Key, dest: Key) => {
    chess.move({ from: orig as Square, to: dest as Square });
    setTimeout(() => {
      const moves = chess.moves({ verbose: true });
      const move = firstMove
        ? moves[0]
        : moves[Math.floor(Math.random() * moves.length)];
      chess.move(move.san);
      cg.move(move.from, move.to);
      cg.set({
        turnColor: toColor(chess),
        movable: {
          color: toColor(chess),
          dests: toDests(chess),
        },
      });
      cg.playPremove();
    }, delay);
  };
}
