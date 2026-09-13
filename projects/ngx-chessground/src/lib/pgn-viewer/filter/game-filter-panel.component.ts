import {
	booleanAttribute,
	Component,
	input,
	model,
	output,
} from '@angular/core';
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
	/** White-player name filter (two-way). */
	readonly filterWhite = model<string>('');
	/** Black-player name filter (two-way). */
	readonly filterBlack = model<string>('');
	/** When `true`, a name matches either colour instead of its own field only (two-way). */
	readonly ignoreColor = model<boolean>(false);
	/** All distinct White player names, for the typeahead. */
	readonly uniqueWhitePlayers = input<string[]>([]);
	/** All distinct Black player names, for the typeahead. */
	readonly uniqueBlackPlayers = input<string[]>([]);

	// ---- Game Detail Filters ----
	/** Selected results; an empty array means "no result filter" (two-way). */
	readonly filterResult = model<string[]>([]);
	/** Selected ECO code, or `''` for none (two-way). */
	readonly filterEco = model<string>('');
	/** Selected time-control keys, e.g. `['180+2']` (two-way). */
	readonly filterTimeControl = model<string[]>([]);
	/** Selected event name, or `''` for none (two-way). */
	readonly filterEvent = model<string>('');
	/** Selected broadcast name, or `''` for none (two-way). */
	readonly filterBroadcastName = model<string>('');
	/** Distinct ECO codes with game counts, for the dropdown. */
	readonly sortedEcoCodes = input<{ code: string; count: number }[]>([]);
	/** Distinct time controls with counts and a human-readable label/originals summary. */
	readonly sortedTimeControls = input<
		{ key: string; count: number; label: string; originalsSummary: string }[]
	>([]);
	/** Distinct event names with game counts, for the dropdown. */
	readonly sortedEvents = input<{ event: string; count: number }[]>([]);
	/** Distinct broadcast names with game counts, for the dropdown. */
	readonly sortedBroadcastNames = input<
		{ broadcastName: string; count: number }[]
	>([]);

	// ---- Upset Filters ----
	/** Whether upset filtering is enabled (two-way). */
	readonly filterUpsetEnabled = model<boolean>(false);
	/** Include upsets won by the lower-rated player (two-way). */
	readonly filterUpsetWin = model<boolean>(false);
	/** Include upsets drawn by the lower-rated player (two-way). */
	readonly filterUpsetDraw = model<boolean>(false);
	/** Minimum Elo gap between players for a game to count as an upset. */
	readonly filterUpsetMinDiff = model<string>('300');

	// ---- Rating Filters ----
	/** Whether rating-range filtering is enabled (two-way). */
	readonly filterRatingEnabled = model<boolean>(false);
	/** Lower bound of the White rating range, as entered (two-way). */
	readonly filterWhiteRating = model<string>('2000');
	/** Lower bound of the Black rating range, as entered (two-way). */
	readonly filterBlackRating = model<string>('2000');
	/** Upper bound of the White rating range, as entered (two-way). */
	readonly filterWhiteRatingMax = model<string>('2900');
	/** Upper bound of the Black rating range, as entered (two-way). */
	readonly filterBlackRatingMax = model<string>('2900');

	// ---- Position Filters ----
	/** Whether the opening-move prefix filter is active (two-way). */
	readonly filterMoves = model<boolean>(false);
	/** Whether position (FEN) filtering is active (two-way). */
	readonly filterByFenEnabled = model<boolean>(false);
	/** Target position for FEN filtering, as entered (two-way). */
	readonly filterFen = model<string>('');

	// ---- Sort ----
	/** Whether the game list is sorted oldest-first (two-way). */
	readonly sortAscending = model<boolean>(false);

	// ---- Collapsible Sections ----
	/** Which left-panel sections are expanded, keyed by section id. */
	readonly leftPanelSections = model<Record<string, boolean>>({
		players: true,
		gameDetails: true,
		upsets: false,
		rating: false,
		position: false,
	});

	// ---- Game List ----
	/** Parsed metadata for every game; drives the game-list navigator. */
	readonly gamesMetadata = input<unknown[]>([]);
	/** Metadata of the games matching the active filters. */
	readonly filteredGameInfos = input<FilterGameInfo[]>([]);
	/** Number of games matching the active filters. */
	readonly totalFilteredCount = input<number>(0);
	/** Whether a filter request is in flight. */
	readonly isFiltering = input(false, { transform: booleanAttribute });
	/** Index of the game currently loaded in the board. */
	readonly currentGameIndex = input<number>(0);
	/** How many games are selected for batch operations. */
	readonly selectedGamesCount = input<number>(0);
	/** Whether a previous game exists in the current navigation order. */
	readonly canGoPrev = input(false, { transform: booleanAttribute });
	/** Whether a next game exists in the current navigation order. */
	readonly canGoNext = input(false, { transform: booleanAttribute });
	/** White player of the loaded game, for the game-list header. */
	readonly currentWhitePlayer = input<string>('Unknown');
	/** Black player of the loaded game, for the game-list header. */
	readonly currentBlackPlayer = input<string>('Unknown');
	/** Result of the loaded game, for the game-list header. */
	readonly currentGameResult = input<string>('*');

	// ---- Events ----
	/** The user asked to apply the current filter selection. */
	readonly applyFilter = output<void>();
	/** The user asked to reset all filters. */
	readonly clearFilters = output<void>();
	/** A game was picked from the list; emits its index. */
	readonly loadGame = output<number>();
	/** A game's selection checkbox was toggled; emits its index. */
	readonly toggleGameSelection = output<number>();
	/** Navigate to the previous game in the filtered order. */
	readonly prevGame = output<void>();
	/** Navigate to the next game in the filtered order. */
	readonly nextGame = output<void>();
	/** Reverse the game-list sort direction. */
	readonly toggleSortDirection = output<void>();
	/** A collapsible section was toggled; emits the section id. */
	readonly toggleLeftSection = output<string>();
	/** Show every filtered game instead of the limited page. */
	readonly showAllFilteredGames = output<void>();
	/** Return to the limited game page. */
	readonly showLimitedGames = output<void>();
	/** Capture the board's current position as the FEN filter value. */
	readonly snapshotCurrentPosition = output<void>();

	// ---- Opening helper ----
	/** Resolves an ECO code to its opening move sequence, supplied by the container. */
	readonly getOpeningMoves = input<(code: string) => string>();

	/** Safe wrapper for invoking getOpeningMoves in templates. */
	getOpeningMovesSafe(code: string): string {
		const fn = this.getOpeningMoves();
		return fn ? fn(code) : '';
	}

	// ---- Lichess date picker ----
	/** Selected Lichess archive year (two-way). */
	readonly lichessYear = model<number>(new Date().getFullYear());
	/** Selected Lichess archive month, 1-12 (two-way). */
	readonly lichessMonth = model<number>(1);
	/** Supplies the selectable years; provided by the container. */
	readonly getLichessYears = input<() => number[]>();
	/** Supplies the selectable months; provided by the container. */
	readonly getLichessMonths = input<() => number[]>();

	// ---- Methods ----

	/** Expands or collapses one left-panel section. */
	toggleSection(section: string): void {
		this.leftPanelSections.update((s) => ({
			...s,
			[section]: !s[section],
		}));
	}

	/** Applies the ECO code chosen in the dropdown. */
	updateFilterEco(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		this.filterEco.set(value);
	}

	/** Adds or removes one time-control key from the selection. */
	toggleTimeControl(value: string, event: Event): void {
		const checked = (event.target as HTMLInputElement).checked;
		this.filterTimeControl.update((current) => {
			if (checked) {
				return current.includes(value) ? current : [...current, value];
			}
			return current.filter((v) => v !== value);
		});
	}

	/** Selects every time control present in the loaded collection. */
	selectAllTimeControls(): void {
		this.filterTimeControl.set(this.sortedTimeControls().map((tc) => tc.key));
	}

	/** Clears the time-control selection. */
	clearTimeControls(): void {
		this.filterTimeControl.set([]);
	}

	/** Applies the event chosen in the dropdown. */
	updateFilterEvent(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		this.filterEvent.set(value);
	}

	/** Applies the broadcast chosen in the dropdown. */
	updateFilterBroadcastName(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		this.filterBroadcastName.set(value);
	}

	/**
	 * Applies a rating-range preset.
	 *
	 * Accepts either an explicit `min-max` value or a single lower bound
	 * (`'3000'` opens the range to `4000`, anything else up to `3000`).
	 */
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

	/** Toggles inclusion of upsets won by the lower-rated player. */
	toggleUpsetWin(event: Event): void {
		this.filterUpsetWin.set((event.target as HTMLInputElement).checked);
	}

	/** Toggles inclusion of upsets drawn by the lower-rated player. */
	toggleUpsetDraw(event: Event): void {
		this.filterUpsetDraw.set((event.target as HTMLInputElement).checked);
	}

	/** Applies the minimum Elo gap for the upset filter. */
	updateUpsetMinDiff(value: string): void {
		this.filterUpsetMinDiff.set(value);
	}

	/** Adds or removes one result from the result filter. */
	toggleResult(value: string, event: Event): void {
		const checked = (event.target as HTMLInputElement).checked;
		this.filterResult.update((current) => {
			if (checked) {
				return current.includes(value) ? current : [...current, value];
			}
			return current.filter((v) => v !== value);
		});
	}

	/** Applies the FEN typed into the position filter. */
	updateFilterFen(value: string): void {
		this.filterFen.set(value);
	}

	/** Applies the lower bound of the White rating range. */
	updateWhiteRating(value: string): void {
		this.filterWhiteRating.set(value);
	}

	/** Applies the upper bound of the White rating range. */
	updateWhiteRatingMax(value: string): void {
		this.filterWhiteRatingMax.set(value);
	}

	/** Applies the lower bound of the Black rating range. */
	updateBlackRating(value: string): void {
		this.filterBlackRating.set(value);
	}

	/** Applies the upper bound of the Black rating range. */
	updateBlackRatingMax(value: string): void {
		this.filterBlackRatingMax.set(value);
	}

	/** Requests loading of the game at `index`. */
	onGameClick(index: number): void {
		this.loadGame.emit(index);
	}

	/** Requests navigation to the previous game. */
	onPrevGame(): void {
		this.prevGame.emit();
	}

	/** Requests navigation to the next game. */
	onNextGame(): void {
		this.nextGame.emit();
	}
}
