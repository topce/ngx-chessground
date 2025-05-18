import * as ChessJS from "chess.js";
import type { Chess as ChessInstance, Move, Square } from "chess.js";
import type { Api } from "chessground/api";
import type { Color, Key } from "chessground/types";

/**
 * Generates a map of possible destination squares for each piece on the board.
 *
 * @param chess - An instance of the Chess game.
 * @returns A map where the keys are the squares with pieces that have legal moves,
 * and the values are arrays of destination squares for those pieces.
 */
export function toDests(chess: ChessInstance): Map<Key, Key[]> {
	const dests = new Map();

	for (const s of ChessJS.SQUARES) {
		const ms = chess.moves({ square: s, verbose: true });
		if (ms.length) {
			dests.set(
				s,
				ms.map((m: Move) => m.to),
			);
		}
	}
	return dests;
}

/**
 * Converts the current turn of a chess game to a color string.
 *
 * @param chess - An instance of a chess game.
 * @returns The color string "white" if it's white's turn, otherwise "black".
 */
export function toColor(chess: ChessInstance): Color {
	return chess.turn() === "w" ? "white" : "black";
}

/**
 * Creates a function that makes a move on the chessboard and updates the state of the chess game.
 *
 * @param cg - The chessground API instance.
 * @param chess - The chess.js instance representing the current state of the chess game.
 * @returns A function that takes the origin and destination squares of a move, makes the move on the chessboard,
 *          and updates the turn color and movable destinations in the chessground instance.
 */
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

/**
 * Executes an AI move in a chess game after a specified delay.
 *
 * @param cg - The chessground API instance.
 * @param chess - The chess.js instance.
 * @param delay - The delay in milliseconds before the AI makes a move.
 * @param firstMove - A boolean indicating if this is the first move of the game.
 * @returns A function that takes the origin and destination squares of the player's move.
 */
export function aiPlay(
	cg: Api,
	chess: ChessInstance,
	delay: number,
	firstMove: boolean,
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
