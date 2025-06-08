import { Chess } from "chess.js";
import { Chessground } from "chessground";
import type { Key, Piece } from "chessground/types";
import type { PromotionService } from "../lib/promotion-dialog/promotion.service";
import type { Unit } from "./unit";
import {
	aiPlay,
	playOtherSide,
	playOtherSideWithDialog,
	toColor,
	toDests,
} from "./util";

/**
 * Factory function to create units that use dialog-based promotion.
 * This allows the components to pass in the PromotionService dependency.
 */
export function createPlayUnitsWithDialog(promotionService?: PromotionService) {
	// If no promotion service is provided, fall back to the legacy prompt-based units
	if (!promotionService) {
		return {
			initial,
			castling,
			playVsRandom,
			playFullRandom,
			slowAnim,
			conflictingHold,
		};
	}

	// Return enhanced units that use the promotion dialog
	return {
		initial: {
			...initial,
			name: "Play legal moves from initial position (with promotion dialog)",
			run(el: HTMLElement) {
				const chess = new Chess();
				const cg = Chessground(el, {
					movable: {
						color: "white",
						free: false,
						dests: toDests(chess),
					},
					draggable: {
						showGhost: true,
					},
					events: {
						move: (_orig: Key, _dest: Key, _capturedPiece?: Piece) => {
							console.log(_orig);
							console.log(_dest);
							console.log(_capturedPiece);
						},
					},
				});
				cg.set({
					movable: {
						events: {
							after: playOtherSideWithDialog(cg, chess, promotionService),
						},
					},
				});
				return cg;
			},
		},
		castling: {
			...castling,
			name: "Castling (with promotion dialog)",
			run(el: HTMLElement) {
				const fen =
					"rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

				const chess = new Chess(fen);
				const cg = Chessground(el, {
					fen,
					turnColor: toColor(chess),
					movable: {
						color: "white",
						free: false,
						dests: toDests(chess),
					},
				});
				cg.set({
					movable: {
						events: {
							after: playOtherSideWithDialog(cg, chess, promotionService),
						},
					},
				});
				return cg;
			},
		},
		playVsRandom, // AI vs player doesn't need dialog as AI handles promotion automatically
		playFullRandom, // AI vs AI doesn't need dialog
		slowAnim, // AI vs player doesn't need dialog as AI handles promotion automatically
		conflictingHold,
	};
}

// Export the existing units for backward compatibility

/**
 * The `initial` constant represents a unit that sets up a chessboard with the initial position
 * and allows playing legal moves from that position.
 *
 * @constant
 * @type {Unit}
 *
 * @property {string} name - The name of the unit.
 * @property {Function} run - The function that initializes the chessboard and sets up the game.
 * @param {HTMLElement} el - The HTML element where the chessboard will be rendered.
 * @returns {Chessground} - The initialized Chessground instance.
 *
 * The `run` function performs the following tasks:
 * - Creates a new instance of the Chess game.
 * - Initializes the Chessground with the given HTML element and configuration options.
 * - Sets up the chessboard to allow only legal moves for the white player.
 * - Enables draggable pieces with ghost images.
 * - Defines an event handler for the move event.
 * - Updates the Chessground configuration to handle moves for the other side after a move is made.
 */
export const initial: Unit = {
	name: "Play legal moves from initial position",
	run(el) {
		const chess = new Chess();
		const cg = Chessground(el, {
			movable: {
				color: "white",
				free: false,
				dests: toDests(chess),
			},
			draggable: {
				showGhost: true,
			},
			events: {
				move: (_orig: Key, _dest: Key, _capturedPiece?: Piece) => {
					console.log(_orig);
					console.log(_dest);
					console.log(_capturedPiece);
				},
			},
		});
		cg.set({
			movable: { events: { after: playOtherSide(cg, chess) } },
		});
		return cg;
	},
};

/**
 * Represents the castling unit in a chess game.
 *
 * @constant
 * @type {Unit}
 * @name castling
 *
 * @property {string} name - The name of the unit.
 * @property {Function} run - The function to execute the castling logic.
 *
 * @param {HTMLElement} el - The HTML element where the chessboard will be rendered.
 * @returns {Chessground} - The Chessground instance with the castling configuration.
 *
 * The `run` function initializes a chessboard with a given FEN string representing the board state.
 * It sets up the Chessground instance with the appropriate configuration for castling moves.
 * The function also sets up an event to handle moves after the current move.
 */
export const castling: Unit = {
	name: "Castling",
	run(el) {
		const fen =
			"rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

		const chess = new Chess(fen);
		const cg = Chessground(el, {
			fen,
			turnColor: toColor(chess),
			movable: {
				color: "white",
				free: false,
				dests: toDests(chess),
			},
		});
		cg.set({
			movable: { events: { after: playOtherSide(cg, chess) } },
		});
		return cg;
	},
};

/**
 * Represents a unit that allows playing against a random AI.
 *
 * @constant
 * @type {Unit}
 * @name playVsRandom
 *
 * @property {string} name - The name of the unit.
 * @property {Function} run - The function to initialize the chess game against the random AI.
 * @param {HTMLElement} el - The HTML element where the chessboard will be rendered.
 * @returns {Chessground} - The initialized Chessground instance.
 */
export const playVsRandom: Unit = {
	name: "Play vs random AI",
	run(el) {
		const chess = new Chess();
		const cg = Chessground(el, {
			movable: {
				color: "white",
				free: false,
				dests: toDests(chess),
			},
		});
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
 * Represents a unit that simulates a chess game between two random AIs.
 * The game is displayed on a Chessground board with animations.
 *
 * @constant
 * @type {Unit}
 * @name playFullRandom
 *
 * @property {string} name - The name of the unit.
 * @property {Function} run - The function that initializes and runs the unit.
 * @param {HTMLElement} el - The HTML element where the Chessground board will be rendered.
 * @returns {Chessground} - The Chessground instance displaying the game.
 */
export const playFullRandom: Unit = {
	name: "Watch 2 random AIs",
	run(el) {
		const chess = new Chess();
		const cg = Chessground(el, {
			animation: {
				duration: 1000,
			},
			movable: {
				free: false,
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

/**
 * Represents a unit configuration for playing against a random AI with slow animations.
 *
 * @constant
 * @type {Unit}
 * @name slowAnim
 *
 * @property {string} name - The name of the unit configuration.
 * @property {Function} run - The function to execute the unit configuration.
 *
 * @param {HTMLElement} el - The HTML element to initialize the chessground on.
 *
 * @returns {Chessground} - The initialized chessground instance.
 */
export const slowAnim: Unit = {
	name: "Play vs random AI; slow animations",
	run(el) {
		const chess = new Chess();
		const cg = Chessground(el, {
			animation: {
				duration: 5000,
			},
			movable: {
				color: "white",
				free: false,
				dests: toDests(chess),
			},
		});
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
 * Represents a unit that demonstrates a conflicting hold/premove scenario in a chess game.
 *
 * This unit sets up a chessboard with a specific FEN position and simulates a move conflict
 * where a black pawn moves to a square that a white pawn is attempting to move to.
 *
 * @constant
 * @type {Unit}
 * @property {string} name - The name of the unit.
 * @property {Function} run - The function that initializes the chessboard and runs the scenario.
 * @param {HTMLElement} el - The HTML element where the chessboard will be rendered.
 * @returns {Chessground} The Chessground instance representing the chessboard.
 */
export const conflictingHold: Unit = {
	name: "Conflicting hold/premove",
	run(el) {
		const cg = Chessground(el, {
			fen: "8/8/5p2/4P3/8/8/8/8",
			turnColor: "black",
			movable: {
				color: "white",
				free: false,
				dests: new Map([["e5", ["f6"]]]),
			},
		});
		setTimeout(() => {
			cg.move("f6", "e5");
			cg.playPremove();
			cg.set({
				turnColor: "white",
				movable: {
					dests: undefined,
				},
			});
		}, 1000);
		return cg;
	},
};
