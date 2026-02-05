import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import type { Unit } from './unit';

/**
 * Represents a unit configuration for a chessboard that is view-only and
 * features two random AIs making moves.
 *
 * @constant
 * @type {Unit}
 * @name viewOnlyFullRandom
 *
 * @property {string} name - The name of the unit.
 * @property {Function} run - The function that initializes the chessboard
 * and starts the random AI moves.
 *
 * @param {HTMLElement} el - The HTML element where the chessboard will be rendered.
 *
 * @returns {Chessground} - The initialized Chessground instance.
 */
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
