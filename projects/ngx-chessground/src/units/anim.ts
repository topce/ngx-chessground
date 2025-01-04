import { Chessground } from "chessground";
import type { Unit } from "./unit";

/**
 * Represents a unit of animation for a chess conflict scenario.
 *
 * @constant
 * @type {Unit}
 * @name conflictingAnim
 *
 * @property {string} name - The name of the animation unit.
 * @property {Function} run - The function to execute the animation.
 * @param {HTMLElement} el - The HTML element to attach the Chessground instance to.
 * @returns {Chessground} The Chessground instance with the specified configuration.
 *
 * The animation runs with the following configuration:
 * - Duration: 500ms
 * - Initial FEN: "8/8/5p2/4P3/4K3/8/8/8"
 * - Turn color: Black
 * - Movable color: White
 * - Movable pieces are not free to move initially
 *
 * After 2 seconds, the black pawn on f6 moves to e5, and the turn color changes to white.
 * The white king on e4 can then move to e5, d5, or f5.
 */
export const conflictingAnim: Unit = {
	name: "Animation: conflict",
	run(el) {
		const cg = Chessground(el, {
			animation: {
				duration: 500,
			},
			fen: "8/8/5p2/4P3/4K3/8/8/8",
			turnColor: "black",
			movable: {
				color: "white",
				free: false,
			},
		});
		setTimeout(() => {
			cg.move("f6", "e5");
			cg.set({
				turnColor: "white",
				movable: {
					dests: new Map([["e4", ["e5", "d5", "f5"]]]),
				},
			});
			cg.playPremove();
		}, 2000);
		return cg;
	},
};

/**
 * Represents a unit test for animating chess moves with the same role.
 *
 * This unit test initializes a Chessground instance with a specific FEN position
 * and animates two moves sequentially with a delay between them.
 *
 * @constant
 * @type {Unit}
 * @name withSameRole
 * @property {string} name - The name of the unit test.
 * @property {function} run - The function that runs the unit test.
 * @param {HTMLElement} el - The HTML element to initialize the Chessground instance on.
 * @returns {Chessground} The initialized Chessground instance.
 */
export const withSameRole: Unit = {
	name: "Animation: same role",
	run(el) {
		const cg = Chessground(el, {
			animation: {
				duration: 2000,
			},
			highlight: {
				lastMove: false,
			},
			fen: "8/8/4p3/5p2/4B3/8/8/8",
			turnColor: "white",
		});
		setTimeout(() => {
			cg.move("e4", "f5");
			setTimeout(() => {
				cg.move("e6", "f5");
			}, 500);
		}, 200);
		return cg;
	},
};

/**
 * Represents a unit test for an animation where pieces of different roles are moved.
 *
 * @constant
 * @type {Unit}
 * @name notSameRole
 * @property {string} name - The name of the unit test.
 * @property {function} run - The function that runs the unit test.
 * @param {HTMLElement} el - The HTML element where the Chessground instance will be initialized.
 * @returns {Chessground} - The Chessground instance after performing the moves.
 *
 * The test initializes a Chessground instance with a specific FEN position and turn color.
 * It then performs a sequence of moves with a delay to test the animation of pieces with different roles.
 */
export const notSameRole: Unit = {
	name: "Animation: different role",
	run(el) {
		const cg = Chessground(el, {
			animation: {
				duration: 2000,
			},
			highlight: {
				lastMove: false,
			},
			fen: "8/8/4n3/5p2/4P3/8/8/8",
			turnColor: "white",
		});
		setTimeout(() => {
			cg.move("e4", "f5");
			setTimeout(() => {
				cg.move("e6", "f5");
			}, 500);
		}, 200);
		return cg;
	},
};

/**
 * Represents a unit that performs an animation while holding a piece on a chessboard.
 *
 * @constant
 * @type {Unit}
 * @name whileHolding
 *
 * @property {string} name - The name of the unit.
 * @property {Function} run - The function that executes the animation.
 *
 * @param {HTMLElement} el - The HTML element where the chessboard will be rendered.
 *
 * @returns {Chessground} - The Chessground instance with the specified configuration.
 *
 * The `run` function initializes a Chessground instance with a specific FEN position and configuration.
 * It sets the turn color to black and specifies an animation duration of 5000 milliseconds.
 * After a timeout of 3000 milliseconds, it moves a piece from f6 to e5, changes the turn color to white,
 * and sets the movable destinations for the white piece on e4. Finally, it plays any premoves.
 */
export const whileHolding: Unit = {
	name: "Animation: while holding",

	run(el) {
		const cg = Chessground(el, {
			fen: "8/8/5p2/4P3/4K3/8/8/8",
			turnColor: "black",
			animation: {
				duration: 5000,
			},
			movable: {
				color: "white",
				free: false,
				showDests: false,
			},
		});
		setTimeout(() => {
			cg.move("f6", "e5");
			cg.set({
				turnColor: "white",
				movable: {
					dests: new Map([["e4", ["e5", "d5", "f5"]]]),
				},
			});
			cg.playPremove();
		}, 3000);
		return cg;
	},
};
