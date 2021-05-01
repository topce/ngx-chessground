import { Chessground } from 'chessground';
import { Unit } from './unit';
import { Chess } from './util';

export const viewOnlyFullRandom: Unit = {
  name: 'View only: 2 random AIs',
  run(el) {
    const chess = new Chess();
    const cg = Chessground(el, {
      viewOnly: true,
      animation: {
        duration: 1000,
      },
      movable: {
        free: false,
      },
      drawable: {
        visible: false,
      },
    });
    function makeMove() {
      if (!cg.state.dom.elements.board.offsetParent) {
        return;
      }
      const moves = chess.moves({ verbose: true });
      const move = moves[Math.floor(Math.random() * moves.length)];
      chess.move(move.san);
      cg.move(move.from, move.to);
      setTimeout(makeMove, 700);
    }
    setTimeout(makeMove, 700);
    return cg;
  },
};
