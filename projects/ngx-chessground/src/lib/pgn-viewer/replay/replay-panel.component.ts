import {
	booleanAttribute,
	Component,
	input,
	model,
	output,
} from '@angular/core';
import type { ReplayMode, StopOnErrorSide } from '../pgn-viewer.types';

/**
 * Replay control panel for the PGN viewer.
 *
 * Provides timing mode selection (realtime, proportional, fixed),
 * replay options (stop on error with threshold), and action buttons
 * (replay, continue, stop, replay selected games).
 *
 * @example
 * ```html
 * <replay-panel
 *   [replayMode]="replayMode()"
 *   [isReplaying]="isReplaying()"
 *   [canContinueReplay]="canContinueReplay()"
 *   [canShowReplayAll]="canShowReplayAll()"
 *   [selectedGamesCount]="selectedGamesCount()"
 *   (replayGame)="replayGame()"
 *   (continueReplay)="continueReplay()"
 *   (stopSequence)="stopSequence()"
 * />
 * ```
 */
@Component({
	selector: 'replay-panel',
	templateUrl: './replay-panel.component.html',
	styleUrl: './replay-panel.component.css',
})
export class ReplayPanelComponent {
	// ---- Replay State ----
	/** Active replay timing mode (two-way). */
	readonly replayMode = model<ReplayMode>('fixed');
	/** Target duration in seconds for `proportional` mode (two-way). */
	readonly proportionalDuration = model<number>(1);
	/** Minimum seconds between moves in `realtime` mode (two-way). */
	readonly minSecondsBetweenMoves = model<number>(1);
	/** Seconds per move in `fixed` mode (two-way). */
	readonly fixedTime = model<number>(1);
	/** Seconds per move in `fast` mode (two-way). */
	readonly fastTime = model<number>(0.3);
	/** Whether replay halts on a significant evaluation drop (two-way). */
	readonly stopOnError = model<boolean>(false);
	/** Evaluation drop, in pawns, that counts as an error (two-way). */
	readonly stopOnErrorThreshold = model<number>(1.0);
	/** Which side's errors should trigger the stop: 'both' | 'white' | 'black'. */
	readonly stopOnErrorSide = model<StopOnErrorSide>('both');

	/** Whether an auto-replay is currently running. */
	readonly isReplaying = input(false, { transform: booleanAttribute });
	/** Whether a paused replay can be resumed. */
	readonly canContinueReplay = input(false, { transform: booleanAttribute });
	/** Whether the "replay all selected games" action should be offered. */
	readonly canShowReplayAll = input(false, { transform: booleanAttribute });
	/** How many games are selected for batch replay. */
	readonly selectedGamesCount = input<number>(0);

	// ---- Events ----
	/** Start replaying the loaded game from the beginning. */
	readonly replayGame = output<void>();
	/** Resume the paused replay. */
	readonly continueReplay = output<void>();
	/** Stop a batch replay across multiple games. */
	readonly stopSequence = output<void>();
	/** Replay every selected game in turn. */
	readonly replayAllSelectedGames = output<void>();
	/** A collapsible section was toggled; emits the section id. */
	readonly toggleSection = output<string>();

	// ---- Collapsible ----
	/** Whether the replay panel is expanded (two-way). */
	readonly expanded = model<boolean>(true);

	// ---- Handlers ----
	/** Applies the proportional-replay target duration. */
	onProportionalDurationChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.proportionalDuration.set(parseFloat(value) || 1);
	}

	/** Applies the minimum seconds between moves. */
	onMinSecondsChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.minSecondsBetweenMoves.set(parseFloat(value) || 0.1);
	}

	/** Applies the fixed per-move duration. */
	onFixedTimeChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.fixedTime.set(parseFloat(value) || 1);
	}

	/** Applies the fast-mode per-move duration. */
	onFastTimeChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.fastTime.set(parseFloat(value) || 0.3);
	}

	/** Toggles stop-on-error. */
	onStopOnErrorChange(event: Event): void {
		const checked = (event.target as HTMLInputElement).checked;
		this.stopOnError.set(checked);
	}

	/** Applies the evaluation-drop threshold for stop-on-error. */
	onStopOnErrorThresholdChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.stopOnErrorThreshold.set(parseFloat(value) || 1.0);
	}

	/** Applies the side whose errors trigger stop-on-error. */
	onStopOnErrorSideChange(event: Event): void {
		const value = (event.target as HTMLSelectElement).value as StopOnErrorSide;
		this.stopOnErrorSide.set(value);
	}

	/** Expands or collapses the replay panel. */
	toggleExpanded(): void {
		this.expanded.update((v) => !v);
	}
}
