import { Component, input, model, output } from '@angular/core';
import type { ReplayMode } from '../pgn-viewer.types';

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
	readonly replayMode = model<ReplayMode>('fixed');
	readonly proportionalDuration = model<number>(1);
	readonly minSecondsBetweenMoves = model<number>(1);
	readonly fixedTime = model<number>(1);
	readonly fastTime = model<number>(0.3);
	readonly stopOnError = model<boolean>(false);
	readonly stopOnErrorThreshold = model<number>(1.0);

	readonly isReplaying = input<boolean>(false);
	readonly canContinueReplay = input<boolean>(false);
	readonly canShowReplayAll = input<boolean>(false);
	readonly selectedGamesCount = input<number>(0);

	// ---- Events ----
	readonly replayGame = output<void>();
	readonly continueReplay = output<void>();
	readonly stopSequence = output<void>();
	readonly replayAllSelectedGames = output<void>();
	readonly toggleSection = output<string>();

	// ---- Collapsible ----
	readonly expanded = model<boolean>(true);

	// ---- Handlers ----
	onProportionalDurationChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.proportionalDuration.set(parseFloat(value) || 1);
	}

	onMinSecondsChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.minSecondsBetweenMoves.set(parseFloat(value) || 0.1);
	}

	onFixedTimeChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.fixedTime.set(parseFloat(value) || 1);
	}

	onFastTimeChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.fastTime.set(parseFloat(value) || 0.3);
	}

	onStopOnErrorChange(event: Event): void {
		const checked = (event.target as HTMLInputElement).checked;
		this.stopOnError.set(checked);
	}

	onStopOnErrorThresholdChange(event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		this.stopOnErrorThreshold.set(parseFloat(value) || 1.0);
	}

	toggleExpanded(): void {
		this.expanded.update((v) => !v);
	}
}
