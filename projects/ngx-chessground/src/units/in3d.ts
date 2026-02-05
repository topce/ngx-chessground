import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import type { Unit } from './unit';
import { aiPlay, toDests } from './util';

/**
 * Default configuration for the 3D theme unit.
 *
 * @constant
 * @type {Unit}
 * @name in3dDefaults
 *
 * @property {string} name - The name of the unit.
 * @property {function} run - The function to initialize and run the 3D theme.
 *
 * @param {HTMLElement} cont - The container element where the chessboard will be rendered.
 * @returns {Chessground} - The initialized Chessground instance with 3D theme settings.
 */
export const in3dDefaults: Unit = {
	name: '3D theme',
	run(cont) {
		const el = wrapped(cont);
		const cg = Chessground(el, {
			addPieceZIndex: true,
		});
		cg.redrawAll();
		return cg;
	},
};

/**
 * Represents a unit for a 3D chess theme where the player plays against a random AI.
 *
 * @constant
 * @type {Unit}
 * @name vsRandom
 *
 * @property {string} name - The name of the unit.
 * @property {Function} run - The function to initialize and run the unit.
 * @param {HTMLElement} cont - The container element where the chessboard will be rendered.
 * @returns {Chessground} - The initialized Chessground instance.
 */
export const vsRandom: Unit = {
	name: '3D theme: play vs random AI',
	run(cont) {
		const el = wrapped(cont);

		const chess = new Chess();
		const cg = Chessground(el, {
			orientation: 'black',
			addPieceZIndex: true,
			movable: {
				color: 'white',
				free: false,
				dests: toDests(chess),
			},
		});
		cg.redrawAll();
		cg.set({
			movable: {
				events: {
					after: aiPlay(cg, chess, 1000, false),
				},
			},
		});
		return cg;
	},
};

/**
 * Represents a 3D theme where two random AIs play against each other.
 *
 * @constant
 * @type {Unit}
 * @name fullRandom
 *
 * @property {string} name - The name of the unit.
 * @property {function} run - The function to execute the unit.
 *
 * @param {HTMLElement} cont - The container element where the chessboard will be rendered.
 * @returns {Chessground} - The Chessground instance.
 *
 * The `run` function initializes a Chessground instance with a 3D theme and sets up a game
 * where two random AIs play against each other. Moves are made at a fixed delay interval.
 */
export const fullRandom: Unit = {
	name: '3D theme: watch 2 random AIs',
	run(cont) {
		const el = wrapped(cont);

		const chess = new Chess();
		const delay = 300;
		const cg = Chessground(el, {
			orientation: 'black',
			addPieceZIndex: true,
			movable: {
				free: false,
			},
		});
		cg.redrawAll();
		function makeMove() {
			if (!cg.state.dom.elements.board.offsetParent) {
				return;
			}
			const moves = chess.moves({ verbose: true });
			const move = moves[Math.floor(Math.random() * moves.length)];
			chess.move(move.san);
			cg.move(move.from, move.to);
			setTimeout(makeMove, delay);
		}
		setTimeout(makeMove, delay);
		return cg;
	},
};

/**
 * Creates a new `div` element, sets the class name of the provided container element to "in3d staunton",
 * clears its inner HTML, and appends the new `div` element to it.
 *
 * @param cont - The container `HTMLElement` to be wrapped.
 * @returns The newly created `div` element.
 */
function wrapped(cont: HTMLElement) {
	const el = document.createElement('div');
	cont.className = 'in3d staunton';
	cont.innerHTML = '';
	cont.appendChild(el);
	return el;
}
