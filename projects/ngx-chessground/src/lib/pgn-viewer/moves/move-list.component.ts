import {
	Component,
	type ElementRef,
	effect,
	input,
	model,
	output,
	viewChild,
} from '@angular/core';

/**
 * Displays the move list for the current game as clickable buttons.
 *
 * Each move is rendered in chess notation with move numbers (1., 2., etc.).
 * Active and last-move buttons are highlighted. Move clocks are shown
 * alongside moves when available. The list auto-scrolls to keep the
 * active move visible when the current move index changes.
 *
 * @example
 * ```html
 * <move-list
 *   [moves]="moves()"
 *   [moveClocks]="moveClocks()"
 *   [currentMoveIndex]="currentMoveIndex()"
 *   [highlightLastMove]="highlightLastMove()"
 *   (jumpToMove)="jumpToMove($event)"
 * />
 * ```
 */
@Component({
	selector: 'move-list',
	templateUrl: './move-list.component.html',
	styleUrl: './move-list.component.css',
})
export class MoveListComponent {
	/** SAN move strings for the current game. */
	readonly moves = input.required<string[]>();

	/** Per-move clock strings (empty string if no clock data). */
	readonly moveClocks = input<string[]>([]);

	/** Current zero-based move index (-1 = start position). */
	readonly currentMoveIndex = input<number>(-1);

	/** Whether to highlight the last move in the game. */
	readonly highlightLastMove = input<boolean>(true);

	/** Whether the moves section is expanded/collapsed. */
	readonly expanded = model<boolean>(true);

	/** Emitted when the user clicks a move to jump to it. */
	readonly jumpToMove = output<number>();

	/** View query for the move list container (for auto-scroll). */
	readonly moveListRef = viewChild<ElementRef<HTMLElement>>('moveList');

	constructor() {
		// Auto-scroll to active move when index changes
		effect(() => {
			this.currentMoveIndex(); // Track dependency
			const moveList = this.moveListRef();
			if (!moveList) return;
			const container = moveList.nativeElement;
			const activeElement = container.querySelector(
				'.move-btn.active',
			) as HTMLElement;
			if (activeElement) {
				activeElement.scrollIntoView({
					behavior: 'smooth',
					block: 'nearest',
					inline: 'nearest',
				});
			}
		});
	}

	toggleExpanded(): void {
		this.expanded.update((v) => !v);
	}

	/** Returns the move number for a given half-move index (0-indexed). */
	moveNumber(index: number): number {
		return Math.floor(index / 2) + 1;
	}

	/** Whether a given index starts a new move pair (white's move). */
	isWhiteMove(index: number): boolean {
		return index % 2 === 0;
	}
}
