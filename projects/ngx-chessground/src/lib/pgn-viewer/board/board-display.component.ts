import { Component, computed, input, model, output } from '@angular/core';
import type { Api } from 'chessground/api';
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
	/** Chessground run function for rendering the board. */
	readonly runFunction = input.required<
		((el: HTMLElement) => Api) | undefined
	>();
	/** Whether the board is flipped (black at bottom). */
	readonly flipped = model<boolean>(false);
	/** Whether to render 3D Staunton pieces. */
	readonly in3d = model<boolean>(false);

	// ---- Player Info ----
	readonly topPlayerName = input<string>('Unknown');
	readonly bottomPlayerName = input<string>('Unknown');
	readonly topPlayerTurnClass = input<string>('');
	readonly bottomPlayerTurnClass = input<string>('');
	readonly activeColor = input<string>('w');
	readonly topPlayerActiveColor = input<string>('b');
	readonly bottomPlayerActiveColor = input<string>('w');
	readonly topPlayerTitle = input<string>('');
	readonly bottomPlayerTitle = input<string>('');

	// ---- Clocks ----
	readonly topTimeRemaining = input<string>('');
	readonly bottomTimeRemaining = input<string>('');

	// ---- Game Result ----
	readonly gameResult = input<string>('*');

	// ---- Evaluation ----
	readonly evaluation = input<string | null>(null);

	// ---- Move Navigation ----
	readonly currentMoveIndex = input<number>(-1);
	readonly movesCount = input<number>(0);

	readonly canGoFirst = computed(() => this.currentMoveIndex() >= 0);
	readonly canGoPrev = computed(() => this.currentMoveIndex() >= 0);
	readonly canGoNext = computed(
		() => this.currentMoveIndex() < this.movesCount() - 1,
	);
	readonly canGoLast = computed(
		() => this.currentMoveIndex() < this.movesCount() - 1,
	);

	// ---- Stockfish Analysis ----
	readonly isAnalyzing = input<boolean>(false);
	readonly bestMoveInfo = input<BestMoveInfo | null>(null);
	readonly analysisVisible = input<boolean>(false);
	readonly showBetterMoveBtn = input<boolean>(false);
	readonly stockfishDepth = model<number>(18);

	// ---- Events ----
	readonly flipBoard = output<void>();
	readonly toggle3d = output<void>();
	readonly start = output<void>();
	readonly prev = output<void>();
	readonly next = output<void>();
	readonly end = output<void>();
	readonly analyzePosition = output<string>();
	readonly autoplayBestLine = output<void>();
	readonly previewPvMove = output<string>();
	readonly toggleAnalysis = output<void>();

	// ---- Depth change handler ----
	onStockfishDepthChange(event: Event): void {
		const value = Number((event.target as HTMLInputElement).value);
		this.stockfishDepth.set(Number.isFinite(value) ? value : 1);
	}

	onAnalyzePosition(fen: string): void {
		this.analyzePosition.emit(fen);
	}
}
