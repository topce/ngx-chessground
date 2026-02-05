import { Chessground } from 'chessground';
import type { Unit } from './unit';

/**
 * Represents a unit test for the performance of a piece move in a chess game.
 *
 * @constant
 * @type {Unit}
 * @name move
 *
 * @property {string} name - The name of the performance test.
 * @property {function} run - The function that runs the performance test.
 *
 * @param {HTMLElement} cont - The container element where the chessboard will be rendered.
 *
 * @returns {Chessground} - The Chessground instance used for the performance test.
 *
 * The `run` function initializes a Chessground instance with a specified animation duration.
 * It then defines a recursive function `run` that moves a piece from "e2" to "a8" and back
 * to "e2" with a delay between moves. The recursive function continues to run as long as
 * the chessboard is visible.
 */
export const move: Unit = {
	name: 'Perf: piece move',
	run(cont) {
		const cg = Chessground(cont, {
			animation: { duration: 500 },
		});
		const delay = 400;
		function run() {
			if (!cg.state.dom.elements.board.offsetParent) {
				return;
			}
			cg.move('e2', 'a8');
			setTimeout(() => {
				cg.move('a8', 'e2');
				setTimeout(run, delay);
			}, delay);
		}
		setTimeout(run, delay);
		return cg;
	},
};
/**
 * Represents a unit test for the performance of square selection in a chessboard.
 *
 * @constant
 * @type {Unit}
 * @name select
 * @property {string} name - The name of the performance test.
 * @property {function} run - The function that runs the performance test.
 * @param {HTMLElement} cont - The container element for the chessboard.
 * @returns {Chessground} - The Chessground instance.
 *
 * The `run` function initializes a Chessground instance with specific movable
 * destinations for the square "e2". It then repeatedly selects the square "e2"
 * and "d4" with a delay of 500 milliseconds between each selection.
 */
export const select: Unit = {
	name: 'Perf: square select',
	run(cont) {
		const cg = Chessground(cont, {
			movable: {
				free: false,
				dests: new Map([['e2', ['e3', 'e4', 'd3', 'f3']]]),
			},
		});
		const delay = 500;
		function run() {
			if (!cg.state.dom.elements.board.offsetParent) {
				return;
			}
			cg.selectSquare('e2');
			setTimeout(() => {
				cg.selectSquare('d4');
				setTimeout(run, delay);
			}, delay);
		}
		setTimeout(run, delay);
		return cg;
	},
};
