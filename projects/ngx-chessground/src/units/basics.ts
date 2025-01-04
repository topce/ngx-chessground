import { Chessground } from "chessground";
import type { Unit } from "./unit";

/**
 * Default configuration for a unit.
 *
 * @constant
 * @type {Unit}
 * @property {string} name - The name of the configuration.
 * @property {function} run - Function to initialize Chessground with the given element.
 * @param {HTMLElement} el - The HTML element to initialize Chessground on.
 * @returns {Chessground} - The initialized Chessground instance.
 */
export const defaults: Unit = {
	name: "Default configuration",
	run(el) {
		return Chessground(el);
	},
};

/**
 * Represents a unit that initializes a chessboard from a FEN string with the black player's perspective.
 *
 * @constant
 * @type {Unit}
 * @name fromFen
 *
 * @property {string} name - The name of the unit.
 * @property {function} run - The function that initializes the chessboard.
 * @param {HTMLElement} el - The HTML element where the chessboard will be rendered.
 * @returns {Chessground} - The initialized Chessground instance.
 */
export const fromFen: Unit = {
	name: "From FEN, from black POV",
	run(el) {
		return Chessground(el, {
			fen: "2r3k1/pp2Qpbp/4b1p1/3p4/3n1PP1/2N4P/Pq6/R2K1B1R w -",
			orientation: "black",
		});
	},
};

/**
 * Represents a unit that simulates the last move in a Crazyhouse chess game.
 *
 * @constant
 * @type {Unit}
 * @name lastMoveCrazyhouse
 *
 * @property {string} name - The name of the unit.
 * @property {Function} run - The function that initializes the Chessground instance and sets the last moves.
 * @param {HTMLElement} el - The HTML element to initialize the Chessground on.
 * @returns {Chessground} The initialized Chessground instance with the last moves set.
 */
export const lastMoveCrazyhouse: Unit = {
	name: "Last move: crazyhouse",
	run(el) {
		const cg = Chessground(el);
		setTimeout(() => {
			cg.set({ lastMove: ["e2", "e4"] });
			setTimeout(() => cg.set({ lastMove: ["g6"] }), 1000);
			setTimeout(() => cg.set({ lastMove: ["e1"] }), 2000);
		});
		return cg;
	},
};

/**
 * Represents a unit that highlights the king in check on a chessboard.
 *
 * @constant
 * @type {Unit}
 * @name checkHighlight
 *
 * @property {string} name - The name of the unit.
 * @property {Function} run - The function that initializes the chessboard with the specified FEN and highlights the king in check.
 * @param {HTMLElement} el - The HTML element where the chessboard will be rendered.
 * @returns {Chessground} - The initialized Chessground instance with the king in check highlighted.
 */
export const checkHighlight: Unit = {
	name: "Highlight king in check",
	run(el) {
		const fen = "r1bqkbnr/1ppppBpp/p1n5/8/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 0 1";
		const cg = Chessground(el, {
			fen,
			turnColor: "black",
			highlight: {
				check: true,
			},
		});
		cg.set({
			check: true,
		});
		return cg;
	},
};
