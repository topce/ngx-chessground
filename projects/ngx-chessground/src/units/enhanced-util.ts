import * as ChessJS from "chess.js";
import type { Chess as ChessInstance, Move, Square } from "chess.js";
import type { Api } from "chessground/api";
import type { Key } from "chessground/types";
import type { PromotionService } from "../lib/promotion-dialog/promotion.service";

/**
 * Converts chess.js promotion character to chessground piece role.
 *
 * @param promotion - The chess.js promotion character ('q', 'r', 'b', 'n')
 * @returns The corresponding chessground piece role ('queen', 'rook', 'bishop', 'knight')
 */
function promotionToRole(
	promotion: string,
): "queen" | "rook" | "bishop" | "knight" {
	switch (promotion) {
		case "q":
			return "queen";
		case "r":
			return "rook";
		case "b":
			return "bishop";
		case "n":
			return "knight";
		default:
			return "queen"; // Default to queen
	}
}

/**
 * Creates a function that makes a move on the chessboard and updates the state of the chess game.
 * This enhanced version uses a nice dialog for piece promotion instead of window.prompt().
 * The function handles async promotion dialog by using Promises internally while maintaining
 * synchronous event handler compatibility with chessground.
 *
 * @param cg - The chessground API instance.
 * @param chess - The chess.js instance representing the current state of the chess game.
 * @param promotionService - The service to handle promotion dialogs.
 * @returns A function that takes the origin and destination squares of a move, makes the move on the chessboard,
 *          and updates the turn color and movable destinations in the chessground instance.
 */
export function playOtherSideWithDialog(
	cg: Api,
	chess: ChessInstance,
	promotionService: PromotionService,
) {
	return (orig: Key, dest: Key) => {
		// Check if this is a pawn promotion move (pawn reaching the first or eighth row)
		const piece = chess.get(orig as Square);
		const isPawn = piece && piece.type === "p";
		const isPromotionMove =
			isPawn && (dest.charAt(1) === "8" || dest.charAt(1) === "1");

		if (isPromotionMove) {
			// Show promotion dialog asynchronously but don't return a Promise
			const color = piece.color === "w" ? "white" : "black";

			// Temporarily disable the board while waiting for promotion choice
			cg.set({
				movable: {
					color: undefined,
					dests: new Map(),
				},
			});

			promotionService
				.showPromotionDialog(color)
				.then((promotion) => {
					// Make the move with promotion
					const moveResult = chess.move({
						from: orig,
						to: dest,
						promotion: promotion as "q" | "r" | "n" | "b",
					});

					// For promotion moves, we need to manually update the board to show the promoted piece
					if (moveResult) {
						// First move the pawn on the board
						cg.move(orig, dest);

						// Then update the piece on the destination square with the promoted piece
						const pieceColor = piece.color === "w" ? "white" : "black";

						// Map promotion letters to chessground piece roles using our helper function
						const pieceRole = promotionToRole(promotion);

						// Update the piece on the board with the proper promoted piece
						cg.setPieces(
							new Map([[dest, { role: pieceRole, color: pieceColor }]]),
						);
					}

					// Update the board state (turn, movable pieces)
					cg.set({
						turnColor: chess.turn() === "w" ? "white" : "black",
						movable: {
							color: chess.turn() === "w" ? "white" : "black",
							dests: toDests(chess),
						},
					});
				})
				.catch((error) => {
					console.error("Promotion dialog error:", error);
					// Fallback to queen promotion if dialog fails
					const promotion = "q";
					const moveResult = chess.move({
						from: orig,
						to: dest,
						promotion: promotion,
					});

					if (moveResult) {
						cg.move(orig, dest);
						const pieceColor = piece.color === "w" ? "white" : "black";
						const pieceRole = promotionToRole(promotion);
						cg.setPieces(
							new Map([[dest, { role: pieceRole, color: pieceColor }]]),
						);
					}

					cg.set({
						turnColor: chess.turn() === "w" ? "white" : "black",
						movable: {
							color: chess.turn() === "w" ? "white" : "black",
							dests: toDests(chess),
						},
					});
				});
		} else {
			// Regular move
			chess.move({ from: orig as Square, to: dest as Square });
			// For regular moves, just perform the move on the board
			cg.move(orig, dest);

			// Update the board state (turn, movable pieces)
			cg.set({
				turnColor: chess.turn() === "w" ? "white" : "black",
				movable: {
					color: chess.turn() === "w" ? "white" : "black",
					dests: toDests(chess),
				},
			});
		}
	};
}

/**
 * Executes an AI move in a chess game after a specified delay.
 * This enhanced version handles promotion with dialog support for player moves.
 *
 * @param cg - The chessground API instance.
 * @param chess - The chess.js instance.
 * @param delay - The delay in milliseconds before the AI makes a move.
 * @param firstMove - A boolean indicating if this is the first move of the game.
 * @param promotionService - The service to handle promotion dialogs.
 * @returns A function that takes the origin and destination squares of the player's move.
 */
export function aiPlayWithDialog(
	cg: Api,
	chess: ChessInstance,
	delay: number,
	firstMove: boolean,
	promotionService: PromotionService,
) {
	return async (orig: Key, dest: Key) => {
		// Check if this is a pawn promotion move
		const piece = chess.get(orig as Square);
		const isPawn = piece && piece.type === "p";
		const isPromotionMove =
			isPawn && (dest.charAt(1) === "8" || dest.charAt(1) === "1");

		if (isPromotionMove) {
			// For player's move, show promotion dialog
			const color = piece.color === "w" ? "white" : "black";
			const promotion = await promotionService.showPromotionDialog(color);

			chess.move({
				from: orig as Square,
				to: dest as Square,
				promotion: promotion,
			});

			// Get the color of the piece
			const pieceColor = piece.color === "w" ? "white" : "black";

			// Map promotion letters to chessground piece roles using our helper function
			const pieceRole = promotionToRole(promotion);

			// Update the piece on the board with the promoted piece
			cg.setPieces(new Map([[dest, { role: pieceRole, color: pieceColor }]]));
		} else {
			// Regular move
			chess.move({ from: orig as Square, to: dest as Square });
		}

		setTimeout(() => {
			const moves = chess.moves({ verbose: true });
			const move = firstMove
				? moves[0]
				: moves[Math.floor(Math.random() * moves.length)];

			if (move) {
				// Check if this is a promotion move by looking at the destination square and piece type
				const aiMovePiece = chess.get(move.from);
				const isAIPawn = aiMovePiece?.type === "p";
				const isAIPromotionMove =
					isAIPawn && (move.to.charAt(1) === "8" || move.to.charAt(1) === "1");

				// AI always promotes to queen
				if (isAIPromotionMove) {
					const promotion = "q"; // AI always promotes to queen
					chess.move({
						from: move.from,
						to: move.to,
						promotion: promotion,
					});

					// Move piece on board
					cg.move(move.from, move.to);

					// Get piece color
					const pieceColor = chess.turn() === "w" ? "black" : "white"; // The color is opposite of current turn

					// Map promotion letters to chessground piece roles using our helper function
					const pieceRole = promotionToRole(promotion);

					// Update the piece on the board with the promoted piece
					cg.setPieces(
						new Map([[move.to, { role: pieceRole, color: pieceColor }]]),
					);
				} else {
					chess.move(move.san);
					cg.move(move.from, move.to);
				}
				cg.set({
					turnColor: chess.turn() === "w" ? "white" : "black",
					movable: {
						color: chess.turn() === "w" ? "white" : "black",
						dests: toDests(chess),
					},
				});
			}
			cg.playPremove();
		}, delay);
	};
}

/**
 * Generates a map of possible destination squares for each piece on the board.
 *
 * @param chess - An instance of the Chess game.
 * @returns A map where the keys are the squares with pieces that have legal moves,
 * and the values are arrays of destination squares for those pieces.
 */
function toDests(chess: ChessInstance): Map<Key, Key[]> {
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
