import { Component, input, model, output } from '@angular/core';
import type { FilterGameInfo } from '../pgn-viewer.types';
import { PlayerTypeaheadComponent } from './player-typeahead.component';

/**
 * Filter panel for the PGN viewer — left sidebar.
 *
 * Contains collapsible sections for:
 * - Player name typeahead filters (white/black)
 * - Game details (result, ECO, time control, event)
 * - Rating range filters with presets
 * - Position/FEN and opening-move filters
 *
 * All state is managed by the parent container and passed via inputs/outputs.
 * This component is purely presentational.
 */
@Component({
	selector: 'game-filter-panel',
	imports: [PlayerTypeaheadComponent],
	templateUrl: './game-filter-panel.component.html',
	styleUrl: './game-filter-panel.component.css',
})
export class GameFilterPanelComponent {
	// ---- Player Filters ----
	readonly filterWhite = model<string>('');
	readonly filterBlack = model<string>('');
	readonly ignoreColor = model<boolean>(false);
	readonly uniqueWhitePlayers = input<string[]>([]);
	readonly uniqueBlackPlayers = input<string[]>([]);
	readonly filteredWhiteSuggestions = input<string[]>([]);
	readonly filteredBlackSuggestions = input<string[]>([]);

	// ---- Game Detail Filters ----
	readonly filterResult = model<string[]>([]);
	readonly filterEco = model<string>('');
	readonly filterTimeControl = model<string>('');
	readonly filterEvent = model<string>('');
	readonly sortedEcoCodes = input<{ code: string; count: number }[]>([]);
	readonly sortedTimeControls = input<
		{ key: string; count: number; label: string; originalsSummary: string }[]
	>([]);
	readonly sortedEvents = input<{ event: string; count: number }[]>([]);

	// ---- Rating Filters ----
	readonly filterRatingEnabled = model<boolean>(false);
	readonly filterWhiteRating = model<string>('2000');
	readonly filterBlackRating = model<string>('2000');
	readonly filterWhiteRatingMax = model<string>('2900');
	readonly filterBlackRatingMax = model<string>('2900');

	// ---- Position Filters ----
	readonly filterMoves = model<boolean>(false);
	readonly filterByFenEnabled = model<boolean>(false);
	readonly filterFen = model<string>('');

	// ---- Sort ----
	readonly sortAscending = model<boolean>(false);

	// ---- Collapsible Sections ----
	readonly leftPanelSections = model<Record<string, boolean>>({
		players: true,
		gameDetails: true,
		rating: false,
		position: false,
	});

	// ---- Game List ----
	readonly gamesMetadata = input<unknown[]>([]);
	readonly filteredGameInfos = input<FilterGameInfo[]>([]);
	readonly totalFilteredCount = input<number>(0);
	readonly isFiltering = input<boolean>(false);
	readonly currentGameIndex = input<number>(0);
	readonly selectedGamesCount = input<number>(0);
	readonly canGoPrev = input<boolean>(false);
	readonly canGoNext = input<boolean>(false);
	readonly currentWhitePlayer = input<string>('Unknown');
	readonly currentBlackPlayer = input<string>('Unknown');
	readonly currentGameResult = input<string>('*');

	// ---- Events ----
	readonly applyFilter = output<void>();
	readonly clearFilters = output<void>();
	readonly loadGame = output<number>();
	readonly toggleGameSelection = output<number>();
	readonly prevGame = output<void>();
	readonly nextGame = output<void>();
	readonly toggleSortDirection = output<void>();
	readonly toggleLeftSection = output<string>();
	readonly showAllFilteredGames = output<void>();
	readonly showLimitedGames = output<void>();
	readonly snapshotCurrentPosition = output<void>();

	// ---- Opening helper ----
	readonly getOpeningMoves = input<(code: string) => string>();

	/** Safe wrapper for invoking getOpeningMoves in templates. */
	getOpeningMovesSafe(code: string): string {
		const fn = this.getOpeningMoves();
		return fn ? fn(code) : '';
	}

	// ---- Lichess date picker ----
	readonly lichessYear = model<number>(new Date().getFullYear());
	readonly lichessMonth = model<number>(1);
	readonly getLichessYears = input<() => number[]>();
	readonly getLichessMonths = input<() => number[]>();

	// ---- Methods ----

	toggleSection(section: string): void {
		this.leftPanelSections.update((s) => ({
			...s,
			[section]: !s[section],
		}));
	}

	updateFilterEco(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		this.filterEco.set(value);
	}

	updateFilterTimeControl(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		this.filterTimeControl.set(value);
	}

	updateFilterEvent(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		this.filterEvent.set(value);
	}

	applyRatingPreset(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		if (!value) return;

		this.filterRatingEnabled.set(true);

		const rangeMatch = value.match(/^(\d+)-(\d+)$/);
		if (rangeMatch) {
			const min = rangeMatch[1];
			const max = rangeMatch[2];
			this.filterWhiteRating.set(min);
			this.filterBlackRating.set(min);
			this.filterWhiteRatingMax.set(max);
			this.filterBlackRatingMax.set(max);
		} else {
			const min = value;
			const max = value === '3000' ? '4000' : '3000';
			this.filterWhiteRating.set(min);
			this.filterBlackRating.set(min);
			this.filterWhiteRatingMax.set(max);
			this.filterBlackRatingMax.set(max);
		}
	}

	toggleResult(value: string, event: Event): void {
		const checked = (event.target as HTMLInputElement).checked;
		this.filterResult.update((current) => {
			if (checked) {
				return current.includes(value) ? current : [...current, value];
			}
			return current.filter((v) => v !== value);
		});
	}

	updateFilterFen(value: string): void {
		this.filterFen.set(value);
	}

	updateWhiteRating(value: string): void {
		this.filterWhiteRating.set(value);
	}

	updateWhiteRatingMax(value: string): void {
		this.filterWhiteRatingMax.set(value);
	}

	updateBlackRating(value: string): void {
		this.filterBlackRating.set(value);
	}

	updateBlackRatingMax(value: string): void {
		this.filterBlackRatingMax.set(value);
	}

	onGameClick(index: number): void {
		this.loadGame.emit(index);
	}

	onPrevGame(): void {
		this.prevGame.emit();
	}

	onNextGame(): void {
		this.nextGame.emit();
	}
}
