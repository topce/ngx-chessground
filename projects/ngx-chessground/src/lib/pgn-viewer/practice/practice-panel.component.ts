import {
	booleanAttribute,
	Component,
	computed,
	input,
	model,
	output,
} from '@angular/core';
import type { BestMoveInfo, PracticeMove } from '../pgn-viewer.types';

/**
 * Practice mode panel for the PGN viewer — shown under the board.
 *
 * Displays live Stockfish analysis of the current practice position
 * (evaluation, best move and principal variation), the session move list
 * with per-move evaluations, and export controls (FEN, moves, PGN).
 *
 * All state is owned by the parent container and passed via inputs.
 * The component emits events for user interactions.
 */
@Component({
	selector: 'practice-panel',
	templateUrl: './practice-panel.component.html',
	styleUrl: './practice-panel.component.css',
})
export class PracticePanelComponent {
	// ---- Engine state ----
	/** Whether Stockfish is currently analyzing the position. */
	readonly isAnalyzing = input(false, { transform: booleanAttribute });
	/** Stockfish evaluation of the current position (White's perspective). */
	readonly evaluation = input<string | null>(null);
	/** Engine best move and principal variation. */
	readonly bestMoveInfo = input<BestMoveInfo | null>(null);
	/** Stockfish search depth. */
	readonly depth = model<number>(18);

	// ---- Session state ----
	/** Moves played during the practice session. */
	readonly moves = input<PracticeMove[]>([]);
	/** FEN of the current practice position. */
	readonly fen = input<string>('');
	/** Game result ('1-0', '0-1', '1/2-1/2') or null while ongoing. */
	readonly result = input<string | null>(null);

	// ---- Events ----
	/** The user asked to leave practice mode. */
	readonly exit = output<void>();
	/** The user asked to take back the last practice move. */
	readonly undoMove = output<void>();
	/** The user asked to restart the session from its start position. */
	readonly restart = output<void>();
	/** The user asked to re-run Stockfish on the current position. */
	readonly reanalyze = output<void>();
	/** The user asked to copy the current FEN. */
	readonly copyFen = output<void>();
	/** The user asked to copy the move list. */
	readonly copyMoves = output<void>();
	/** The user asked to copy the session PGN. */
	readonly copyPgn = output<void>();
	/** The user asked to download the session as a PGN file. */
	readonly downloadPgn = output<void>();

	// ---- Computed ----
	/** Whether the session has at least one move, i.e. undo/export are meaningful. */
	readonly hasMoves = computed(() => this.moves().length > 0);

	/** Moves grouped into full-move pairs for display: `1. e4 e5`. */
	readonly movePairs = computed(() => {
		const pairs: {
			number: number;
			white: PracticeMove;
			black: PracticeMove | null;
		}[] = [];
		const moves = this.moves();
		for (let i = 0; i < moves.length; i += 2) {
			pairs.push({
				number: i / 2 + 1,
				white: moves[i],
				black: i + 1 < moves.length ? moves[i + 1] : null,
			});
		}
		return pairs;
	});

	// ---- Handlers ----
	/** Applies the Stockfish depth chosen in the number input. */
	onDepthChange(event: Event): void {
		const value = Number((event.target as HTMLInputElement).value);
		this.depth.set(Number.isFinite(value) ? value : 1);
	}

	/** Select the whole FEN when the readonly input is focused for easy copying. */
	selectFen(event: FocusEvent): void {
		(event.target as HTMLInputElement).select();
	}
}
