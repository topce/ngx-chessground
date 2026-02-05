import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import type { Key, Piece } from 'chessground/types';
import type { PromotionService } from '../lib/promotion-dialog/promotion.service';
import { aiPlayWithDialog, playOtherSideWithDialog } from './enhanced-util';
import type { Unit } from './unit';
import { toColor, toDests } from './util';

/**
 * Creates enhanced chess units that use promotion dialogs instead of prompts.
 * This factory function requires a PromotionService to be injected.
 */
export function createEnhancedPlayUnits(promotionService: PromotionService) {
	/**
	 * The `initial` constant represents a unit that sets up a chessboard with the initial position
	 * and allows playing legal moves from that position. Uses dialog for piece promotion.
	 */
	const initial: Unit = {
		name: 'Play legal moves from initial position (with promotion dialog)',
		run(el) {
			const chess = new Chess();
			const cg = Chessground(el, {
				movable: {
					color: 'white',
					free: false,
					dests: toDests(chess),
				},
				draggable: {
					showGhost: true,
				},
				events: {
					move: (_orig: Key, _dest: Key, _capturedPiece?: Piece) => {
						// console.log(_orig);
						// console.log(_dest);
						// console.log(_capturedPiece);
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
	};

	/**
	 * Represents the castling unit in a chess game with promotion dialog support.
	 */
	const castling: Unit = {
		name: 'Castling (with promotion dialog)',
		run(el) {
			const fen =
				'rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';

			const chess = new Chess(fen);
			const cg = Chessground(el, {
				fen,
				turnColor: toColor(chess),
				movable: {
					color: 'white',
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
	};

	/**
	 * Represents a unit that allows playing against a random AI with promotion dialog support.
	 */
	const playVsRandom: Unit = {
		name: 'Play vs random AI (with promotion dialog)',
		run(el) {
			const chess = new Chess();
			const cg = Chessground(el, {
				movable: {
					color: 'white',
					free: false,
					dests: toDests(chess),
				},
			});
			cg.set({
				movable: {
					events: {
						after: aiPlayWithDialog(cg, chess, 1000, false, promotionService),
					},
				},
			});
			return cg;
		},
	};

	/**
	 * Represents a unit configuration for playing against a random AI with slow animations and promotion dialog support.
	 */
	const slowAnim: Unit = {
		name: 'Play vs random AI; slow animations (with promotion dialog)',
		run(el) {
			const chess = new Chess();
			const cg = Chessground(el, {
				animation: {
					duration: 5000,
				},
				movable: {
					color: 'white',
					free: false,
					dests: toDests(chess),
				},
			});
			cg.set({
				movable: {
					events: {
						after: aiPlayWithDialog(cg, chess, 1000, false, promotionService),
					},
				},
			});
			return cg;
		},
	};

	/**
	 * Represents a unit that simulates a chess game between two random AIs.
	 * This doesn't need promotion dialog since it's AI vs AI.
	 */
	const playFullRandom: Unit = {
		name: 'Watch 2 random AIs',
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
	 * Represents a unit that demonstrates a conflicting hold/premove scenario in a chess game.
	 */
	const conflictingHold: Unit = {
		name: 'Conflicting hold/premove',
		run(el) {
			const cg = Chessground(el, {
				fen: '8/8/5p2/4P3/8/8/8/8',
				turnColor: 'black',
				movable: {
					color: 'white',
					free: false,
					dests: new Map([['e5', ['f6']]]),
				},
			});
			setTimeout(() => {
				cg.move('f6', 'e5');
				cg.playPremove();
				cg.set({
					turnColor: 'white',
					movable: {
						dests: undefined,
					},
				});
			}, 1000);
			return cg;
		},
	};

	return {
		initial,
		castling,
		playVsRandom,
		slowAnim,
		playFullRandom,
		conflictingHold,
	};
}
