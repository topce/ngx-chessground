import {
	booleanAttribute,
	Component,
	computed,
	input,
	model,
	output,
} from '@angular/core';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import { NgxChessgroundComponent } from '../../ngx-chessground/ngx-chessground.component';
import type { BestMoveInfo } from '../pgn-viewer.types';
import { EvaluationBarComponent } from './evaluation-bar.component';

/**
 * Board display panel for the PGN viewer — center panel.
 *
 * Shows the chessboard with player names, clocks, turn indicators,
 * evaluation bar, board control buttons (flip, 3D toggle),
 * Stockfish analysis controls, and move navigation buttons.
 *
 * All state is owned by the parent container and passed via inputs.
 * The component emits events for user interactions.
 */
@Component({
	selector: 'board-display',
	imports: [NgxChessgroundComponent, EvaluationBarComponent],
	templateUrl: './board-display.component.html',
	styleUrl: './board-display.component.css',
})
export class BoardDisplayComponent {
	// ---- Board State ----
	/**
	 * Chessground run function for rendering the board.
	 *
	 * Required and never `undefined`: the wrapper's `runFunction` input is
	 * required, so a missing factory is a compile-time error rather than a
	 * silently empty board.
	 */
	readonly runFunction = input.required<(el: HTMLElement) => Api>();
	/**
	 * Partial Chessground config applied to the live board instance via
	 * `Api.set()` on every change (position, orientation, movable pieces).
	 */
	readonly config = input<Partial<Config> | null>(null);
	/** Whether the board is flipped (black at bottom). */
	readonly flipped = model<boolean>(false);
	/** Whether to render 3D Staunton pieces. */
	readonly in3d = model<boolean>(false);

	// ---- Player Info ----
	/** Player shown above the board (Black when unflipped). */
	readonly topPlayerName = input<string>('Unknown');
	/** Player shown below the board (White when unflipped). */
	readonly bottomPlayerName = input<string>('Unknown');
	/** Extra CSS class for the top player row, e.g. a turn indicator. */
	readonly topPlayerTurnClass = input<string>('');
	/** Extra CSS class for the bottom player row, e.g. a turn indicator. */
	readonly bottomPlayerTurnClass = input<string>('');
	/** Side to move, as used by chessground's piece theming. */
	readonly activeColor = input<string>('w');
	/** Colour of the top player's piece icon. */
	readonly topPlayerActiveColor = input<string>('b');
	/** Colour of the bottom player's piece icon. */
	readonly bottomPlayerActiveColor = input<string>('w');
	/** Title (GM/IM/…) prefix for the top player, or `''`. */
	readonly topPlayerTitle = input<string>('');
	/** Title (GM/IM/…) prefix for the bottom player, or `''`. */
	readonly bottomPlayerTitle = input<string>('');

	// ---- Clocks ----
	/** Formatted remaining time for the top player, or `''` when unknown. */
	readonly topTimeRemaining = input<string>('');
	/** Formatted remaining time for the bottom player, or `''` when unknown. */
	readonly bottomTimeRemaining = input<string>('');

	// ---- Game Result ----
	/** Result of the loaded game: `'1-0'`, `'0-1'`, `'1/2-1/2'` or `'*'`. */
	readonly gameResult = input<string>('*');
	/** Whether the board shows the final position of the game. */
	readonly isEndOfReplay = input(false, { transform: booleanAttribute });

	// ---- Evaluation ----
	/** Evaluation to display, in the viewer's display format, or `null`. */
	readonly evaluation = input<string | null>(null);

	// ---- Move Navigation ----
	/** Zero-based index of the displayed move; `-1` is the start position. */
	readonly currentMoveIndex = input<number>(-1);
	/** Total number of moves in the loaded game. */
	readonly movesCount = input<number>(0);

	/** Whether the "jump to start" control is enabled. */
	readonly canGoFirst = computed(
		() => !this.practiceActive() && this.currentMoveIndex() >= 0,
	);
	/** Whether the "previous move" control is enabled. */
	readonly canGoPrev = computed(
		() => !this.practiceActive() && this.currentMoveIndex() >= 0,
	);
	/** Whether the "next move" control is enabled. */
	readonly canGoNext = computed(
		() =>
			!this.practiceActive() && this.currentMoveIndex() < this.movesCount() - 1,
	);
	/** Whether the "jump to end" control is enabled. */
	readonly canGoLast = computed(
		() =>
			!this.practiceActive() && this.currentMoveIndex() < this.movesCount() - 1,
	);

	// ---- Stockfish Analysis ----
	/** Whether Stockfish is analyzing the displayed position. */
	readonly isAnalyzing = input(false, { transform: booleanAttribute });
	/** Engine best move and principal variation, or `null`. */
	readonly bestMoveInfo = input<BestMoveInfo | null>(null);
	/** Whether the analysis panel is expanded. */
	readonly analysisVisible = input(false, { transform: booleanAttribute });
	/** Whether the "show better move" button should be offered. */
	readonly showBetterMoveBtn = input(false, { transform: booleanAttribute });
	/** Stockfish search depth (two-way). */
	readonly stockfishDepth = model<number>(18);
	/** Whether there is a next alternative move to cycle to. */
	readonly hasNextAlternative = input(false, { transform: booleanAttribute });
	/** Whether there is a previous alternative to cycle back to. */
	readonly hasPrevAlternative = input(false, { transform: booleanAttribute });
	/** Label showing current alternative position (e.g. "2/3"). */
	readonly alternativeLabel = input<string>('');
	/** Whether autoplay of the best line has completed (enables re-evaluate). */
	readonly autoplayCompleted = input(false, { transform: booleanAttribute });

	// ---- Practice Mode ----
	/** Whether the "Analyze practice" button should be offered (game not replaying). */
	readonly practiceAvailable = input(false, { transform: booleanAttribute });
	/** Whether practice mode is currently active. */
	readonly practiceActive = input(false, { transform: booleanAttribute });

	// ---- Events ----
	/** The user asked to flip the board orientation. */
	readonly flipBoard = output<void>();
	/** The user asked to toggle 3D pieces. */
	readonly toggle3d = output<void>();
	/** The user asked to jump to the start of the game. */
	readonly goToStart = output<void>();
	/** The user asked to step back one move. */
	readonly prev = output<void>();
	/** The user asked to step forward one move. */
	readonly next = output<void>();
	/** The user asked to jump to the end of the game. */
	readonly end = output<void>();
	/** The user asked to analyze a position; emits its FEN. */
	readonly analyzePosition = output<string>();
	/** The user asked to autoplay the engine's best line. */
	readonly autoplayBestLine = output<void>();
	/** The user asked to preview a principal-variation move; emits its FEN. */
	readonly previewPvMove = output<string>();
	/** The user asked to show or hide the analysis panel. */
	readonly toggleAnalysis = output<void>();
	/** Cycle to the next-best engine move. */
	readonly nextBestMove = output<void>();
	/** Cycle to the previous engine move. */
	readonly prevBestMove = output<void>();
	/** Re-evaluate the position currently displayed on the board. */
	readonly reevaluate = output<void>();
	/** Start practice mode from the current board position. */
	readonly startPractice = output<void>();

	// ---- Depth change handler ----
	/** Applies the Stockfish depth chosen in the number input. */
	onStockfishDepthChange(event: Event): void {
		const value = Number((event.target as HTMLInputElement).value);
		this.stockfishDepth.set(Number.isFinite(value) ? value : 1);
	}

	/** Forwards an analyze request for the given position. */
	onAnalyzePosition(fen: string): void {
		this.analyzePosition.emit(fen);
	}
}
