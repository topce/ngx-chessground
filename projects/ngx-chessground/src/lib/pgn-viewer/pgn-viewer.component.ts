import { CommonModule } from '@angular/common';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	type ElementRef,
	inject,
	input,
	model,
	type OnDestroy,
	signal,
	viewChild,
} from '@angular/core';
import { Chess, Move } from 'chess.js';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import { Key } from 'chessground/types';
import { parsePgn } from 'chessops/pgn';
import { loadAsync as loadZipAsync } from 'jszip';
import { decompress as decompressZst } from 'fzstd';
import { NgxChessgroundComponent } from '../ngx-chessground/ngx-chessground.component';
import type {
	FilterCriteria,
	GameMetadata,
	WorkerResponse,
} from './pgn-processor.worker';
import { ECO_MOVES } from './eco-moves';
import { PgnViewerEngineService } from './pgn-viewer-engine.service';

/**
 * A full-featured PGN viewer component for Angular applications.
 *
 * Supports loading single or multi-game PGN files, navigating moves, auto-replay
 * with configurable timing modes, Stockfish-powered position analysis ("stop on error"),
 * filtering by player/ECO/opening moves, and batch replay across multiple games.
 *
 * All components used are standalone. Import this component directly:
 * ```typescript
 * imports: [NgxPgnViewerComponent]
 * ```
 *
 * @example Basic usage
 * ```html
 * <ngx-pgn-viewer [pgn]="pgnString" [highlightLastMove]="true" />
 * ```
 */
@Component({
	selector: 'ngx-pgn-viewer',
	imports: [CommonModule, MatSnackBarModule, NgxChessgroundComponent],
	templateUrl: './pgn-viewer.component.html',
	styleUrls: ['./pgn-viewer.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgxPgnViewerComponent implements OnDestroy {
	/** Service managing the PGN processor and Stockfish Web Workers. */
	private readonly pgnViewerEngine = inject(PgnViewerEngineService);
	/** Material snackbar service for user notifications. */
	private readonly snackBar = inject(MatSnackBar);

	// ---- Inputs ----

	/**
	 * PGN string to load and display.
	 * Supports plain PGN, multi-game PGN, gzip-compressed (`.pgn.gz`), and ZIP archives.
	 */
	pgn = input<string>('');
	/**
	 * Whether to highlight the last played move on the board with colored squares.
	 * @default true
	 */
	highlightLastMove = input<boolean>(true);

	/**
	 * Updates the white player name filter from an input event.
	 * @param event — Input event from the white filter text field.
	 */
	updateFilterWhite(event: Event) {
		this.filterWhite.set((event.target as HTMLInputElement).value);
	}

	/**
	 * Updates the black player name filter from an input event.
	 * @param event — Input event from the black filter text field.
	 */
	updateFilterBlack(event: Event) {
		this.filterBlack.set((event.target as HTMLInputElement).value);
	}

	// ---- Typeahead Methods ----

	/**
	 * Opens the white player typeahead dropdown and resets the selection index.
	 */
	openWhiteTypeahead() {
		this.whiteTypeaheadOpen.set(true);
		this.whiteTypeaheadIndex.set(0);
	}

	/**
	 * Opens the black player typeahead dropdown and resets the selection index.
	 */
	openBlackTypeahead() {
		this.blackTypeaheadOpen.set(true);
		this.blackTypeaheadIndex.set(0);
	}

	/**
	 * Closes the white player typeahead dropdown after a 200ms delay
	 * (allows mousedown on dropdown items to fire before close).
	 */
	closeWhiteTypeahead() {
		// Cancel any existing close timeout
		if (this.whiteTypeaheadCloseTimeout) {
			clearTimeout(this.whiteTypeaheadCloseTimeout);
			this.pendingTimeouts.delete(this.whiteTypeaheadCloseTimeout);
		}
		// Delay to allow mousedown on dropdown item to fire first
		this.whiteTypeaheadCloseTimeout = this.setDeferredTimeout(() => {
			this.whiteTypeaheadOpen.set(false);
			this.whiteTypeaheadCloseTimeout = null;
		}, 200);
	}

	/**
	 * Closes the black player typeahead dropdown after a 200ms delay
	 * (allows mousedown on dropdown items to fire before close).
	 */
	closeBlackTypeahead() {
		if (this.blackTypeaheadCloseTimeout) {
			clearTimeout(this.blackTypeaheadCloseTimeout);
			this.pendingTimeouts.delete(this.blackTypeaheadCloseTimeout);
		}
		this.blackTypeaheadCloseTimeout = this.setDeferredTimeout(() => {
			this.blackTypeaheadOpen.set(false);
			this.blackTypeaheadCloseTimeout = null;
		}, 200);
	}

	/**
	 * Handles input events on the white player typeahead, updating the filter
	 * and keeping the dropdown open.
	 * @param event — Input event from the white filter typeahead field.
	 */
	onWhiteTypeaheadInput(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.filterWhite.set(value);
		// Cancel pending close when user types
		if (this.whiteTypeaheadCloseTimeout) {
			clearTimeout(this.whiteTypeaheadCloseTimeout);
			this.pendingTimeouts.delete(this.whiteTypeaheadCloseTimeout);
			this.whiteTypeaheadCloseTimeout = null;
		}
		this.whiteTypeaheadOpen.set(true);
		this.whiteTypeaheadIndex.set(0);
	}

	/**
	 * Handles input events on the black player typeahead.
	 * @param event — Input event from the black filter typeahead field.
	 */
	onBlackTypeaheadInput(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.filterBlack.set(value);
		if (this.blackTypeaheadCloseTimeout) {
			clearTimeout(this.blackTypeaheadCloseTimeout);
			this.pendingTimeouts.delete(this.blackTypeaheadCloseTimeout);
			this.blackTypeaheadCloseTimeout = null;
		}
		this.blackTypeaheadOpen.set(true);
		this.blackTypeaheadIndex.set(0);
	}

	/**
	 * Selects a player from the white typeahead dropdown and closes it.
	 * @param player — The selected player name.
	 */
	selectWhiteTypeahead(player: string) {
		// Cancel pending close timeout first
		if (this.whiteTypeaheadCloseTimeout) {
			clearTimeout(this.whiteTypeaheadCloseTimeout);
			this.pendingTimeouts.delete(this.whiteTypeaheadCloseTimeout);
			this.whiteTypeaheadCloseTimeout = null;
		}
		this.filterWhite.set(player);
		this.whiteTypeaheadOpen.set(false);
		this.whiteTypeaheadIndex.set(0);
	}

	/**
	 * Selects a player from the black typeahead dropdown and closes it.
	 * @param player — The selected player name.
	 */
	selectBlackTypeahead(player: string) {
		if (this.blackTypeaheadCloseTimeout) {
			clearTimeout(this.blackTypeaheadCloseTimeout);
			this.pendingTimeouts.delete(this.blackTypeaheadCloseTimeout);
			this.blackTypeaheadCloseTimeout = null;
		}
		this.filterBlack.set(player);
		this.blackTypeaheadOpen.set(false);
		this.blackTypeaheadIndex.set(0);
	}

	/**
	 * Handles keyboard navigation in the white player typeahead dropdown.
	 *
	 * Arrow keys navigate the list, Enter selects, Escape closes.
	 * If the dropdown is closed, ArrowDown/ArrowUp reopen it.
	 *
	 * @param event — Keyboard event from the white typeahead input field.
	 */
	onWhiteTypeaheadKeydown(event: KeyboardEvent) {
		const items = this.filteredWhiteSuggestions();
		if (!this.whiteTypeaheadOpen() || items.length === 0) {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				this.whiteTypeaheadOpen.set(true);
				event.preventDefault();
				return;
			}
			return;
		}

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				this.whiteTypeaheadIndex.update((i) =>
					i < items.length - 1 ? i + 1 : 0,
				);
				break;
			case 'ArrowUp':
				event.preventDefault();
				this.whiteTypeaheadIndex.update((i) =>
					i > 0 ? i - 1 : items.length - 1,
				);
				break;
			case 'Enter':
				event.preventDefault();
				const selected = items[this.whiteTypeaheadIndex()];
				if (selected) {
					this.selectWhiteTypeahead(selected);
				}
				break;
			case 'Escape':
				this.whiteTypeaheadOpen.set(false);
				break;
		}
	}

	/**
	 * Handles keyboard navigation in the black player typeahead dropdown.
	 *
	 * Arrow keys navigate the list, Enter selects, Escape closes.
	 * If the dropdown is closed, ArrowDown/ArrowUp reopen it.
	 *
	 * @param event — Keyboard event from the black typeahead input field.
	 */
	onBlackTypeaheadKeydown(event: KeyboardEvent) {
		const items = this.filteredBlackSuggestions();
		if (!this.blackTypeaheadOpen() || items.length === 0) {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				this.blackTypeaheadOpen.set(true);
				event.preventDefault();
				return;
			}
			return;
		}

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				this.blackTypeaheadIndex.update((i) =>
					i < items.length - 1 ? i + 1 : 0,
				);
				break;
			case 'ArrowUp':
				event.preventDefault();
				this.blackTypeaheadIndex.update((i) =>
					i > 0 ? i - 1 : items.length - 1,
				);
				break;
			case 'Enter':
				event.preventDefault();
				const selected = items[this.blackTypeaheadIndex()];
				if (selected) {
					this.selectBlackTypeahead(selected);
				}
				break;
			case 'Escape':
				this.blackTypeaheadOpen.set(false);
				break;
		}
	}

	/**
	 * Splits text into match/non-match segments for typeahead highlighting.
	 *
	 * Used to render bold matching portions of player names in the typeahead dropdown.
	 *
	 * @param text — Full text to segment (e.g. a player name).
	 * @param query — Search query string to match against.
	 * @returns Array of `{ text, match }` objects for template rendering.
	 */
	highlightText(
		text: string,
		query: string,
	): { text: string; match: boolean }[] {
		const q = query.toLowerCase().trim();
		if (!q) {
			return [{ text, match: false }];
		}
		const idx = text.toLowerCase().indexOf(q);
		if (idx === -1) {
			return [{ text, match: false }];
		}
		const segments: { text: string; match: boolean }[] = [];
		if (idx > 0) {
			segments.push({ text: text.substring(0, idx), match: false });
		}
		segments.push({
			text: text.substring(idx, idx + q.length),
			match: true,
		});
		if (idx + q.length < text.length) {
			segments.push({ text: text.substring(idx + q.length), match: false });
		}
		return segments;
	}

	/**
	 * Updates the result filter from a multi-select dropdown change event.
	 *
	 * @param event — Change event from the result `<select>` element.
	 */
	updateFilterResult(event: Event) {
		const select = event.target as HTMLSelectElement;
		const selectedOptions = Array.from(select.selectedOptions).map(
			(option) => option.value,
		);
		this.filterResult.set(selectedOptions);
	}

	/**
	 * Updates the ECO code filter from a dropdown change event.
	 *
	 * @param event — Change event from the ECO `<select>` element.
	 */
	updateFilterEco(event: Event) {
		this.filterEco.set((event.target as HTMLSelectElement).value);
	}

	/**
	 * Updates the time control filter from a dropdown change event.
	 *
	 * @param event — Change event from the time control `<select>` element.
	 */
	updateFilterTimeControl(event: Event) {
		this.filterTimeControl.set((event.target as HTMLSelectElement).value);
	}

	/**
	 * Updates the minimum white rating filter from an input event.
	 *
	 * @param event — Input event from the white rating `<input>` field.
	 */
	updateFilterWhiteRating(event: Event) {
		this.filterWhiteRating.set((event.target as HTMLInputElement).value);
	}

	/**
	 * Updates the maximum white rating filter from an input event.
	 *
	 * @param event — Input event from the white rating max `<input>` field.
	 */
	updateFilterWhiteRatingMax(event: Event) {
		this.filterWhiteRatingMax.set((event.target as HTMLInputElement).value);
	}

	/**
	 * Updates the minimum black rating filter from an input event.
	 *
	 * @param event — Input event from the black rating `<input>` field.
	 */
	updateFilterBlackRating(event: Event) {
		this.filterBlackRating.set((event.target as HTMLInputElement).value);
	}

	/**
	 * Updates the maximum black rating filter from an input event.
	 *
	 * @param event — Input event from the black rating max `<input>` field.
	 */
	updateFilterBlackRatingMax(event: Event) {
		this.filterBlackRatingMax.set((event.target as HTMLInputElement).value);
	}

	/**
	 * Toggles the "ignore color" checkbox — when enabled, player name filters
	 * match either white or black fields interchangeably.
	 *
	 * @param event — Change event from the ignore-color checkbox.
	 */
	toggleIgnoreColor(event: Event) {
		this.ignoreColor.set((event.target as HTMLInputElement).checked);
	}

	/**
	 * Toggles interactive opening-move filtering mode.
	 *
	 * When enabled, the board becomes editable so the user can play moves
	 * to define an opening sequence filter. The current game position is
	 * saved and restored when the mode is exited.
	 *
	 * @param event — Change event from the filter-moves checkbox.
	 */
	toggleFilterMoves(event: Event) {
		const checked = (event.target as HTMLInputElement).checked;
		this.filterMoves.set(checked);
		this.interactiveMoves.set([]);
		this.activeFilterMoves = [];

		if (checked) {
			this.savedGameMoveIndex = this.currentMoveIndex();
			this.chess.reset();
			this.currentMoveIndex.set(-1);
			this.currentFen.set(this.chess.fen());
		} else if (this.savedGameMoveIndex !== null) {
			this.jumpToMove(this.savedGameMoveIndex);
			this.savedGameMoveIndex = null;
		}
	}

	/**
	 * Looks up the defining move sequence for an ECO opening code.
	 *
	 * @param code — ECO code (e.g. `"B33"`).
	 * @returns Pipe-separated SAN move sequence, or empty string if not found.
	 */
	getOpeningMoves(code: string): string {
		return ECO_MOVES[code] || '';
	}

	// ---- State Signals ----

	/** Parsed game metadata for all games in the loaded PGN. */
	gamesMetadata = signal<GameMetadata[]>([]);
	/** Zero-based index of the currently active game. */
	currentGameIndex = signal<number>(0);
	/** Array of SAN move strings for the loaded game. */
	moves = signal<string[]>([]);
	/** Zero-based index of the current move (-1 means start position, before any move). */
	currentMoveIndex = signal<number>(-1);
	/** Current board position in FEN notation. */
	currentFen = signal<string>(
		'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
	);
	/** Whether PGN data is being loaded/parsed. */
	isLoading = signal<boolean>(false);
	/** Loading progress percentage (0–100). */
	loadingProgress = signal<number>(0);
	/** Human-readable loading status message. */
	loadingStatus = signal<string>('');
	/** Set of selected game indices for batch operations like replay-all. */
	selectedGames = signal<Set<number>>(new Set());

	// ---- Filter Signals ----

	/** Current white player filter text. */
	filterWhite = signal<string>('');
	/** Current black player filter text. */
	filterBlack = signal<string>('');
	/** Selected result filters (e.g. `["1-0", "draw"]`). */
	filterResult = signal<string[]>([]);
	/** Whether opening-move filtering is active. */
	filterMoves = signal<boolean>(false);
	/** Whether to swap white/black when filtering (match either color). */
	ignoreColor = signal<boolean>(false);
	/** Whether Elo rating filter fields are enabled. */
	filterRatingEnabled = signal<boolean>(false);
	/** Minimum white Elo rating filter value (as string for input binding). */
	filterWhiteRating = signal<string>('2000');
	/** Minimum black Elo rating filter value (as string for input binding). */
	filterBlackRating = signal<string>('2000');
	/** Maximum white Elo rating filter value (as string for input binding). */
	filterWhiteRatingMax = signal<string>('2900');
	/** Maximum black Elo rating filter value (as string for input binding). */
	filterBlackRatingMax = signal<string>('2900');
	/** ECO code filter value. */
	filterEco = signal<string>('');
	/** Time control filter value (e.g. `"180+2"`). */
	filterTimeControl = signal<string>('');
	/** Event/tournament name filter value. */
	filterEvent = signal<string>('');

	// ---- Autocomplete Signals ----

	/** Unique white player names from the loaded PGN (for typeahead). */
	uniqueWhitePlayers = signal<string[]>([]);
	/** Unique black player names from the loaded PGN (for typeahead). */
	uniqueBlackPlayers = signal<string[]>([]);

	// ---- Typeahead State ----

	/** Whether the white player typeahead dropdown is open. */
	whiteTypeaheadOpen = signal<boolean>(false);
	/** Whether the black player typeahead dropdown is open. */
	blackTypeaheadOpen = signal<boolean>(false);
	/** Currently highlighted index in the white typeahead dropdown. */
	whiteTypeaheadIndex = signal<number>(0);
	/** Currently highlighted index in the black typeahead dropdown. */
	blackTypeaheadIndex = signal<number>(0);
	/** Timeout handle for delayed closing of the white typeahead dropdown. */
	private whiteTypeaheadCloseTimeout: ReturnType<typeof setTimeout> | null = null;
	/** Timeout handle for delayed closing of the black typeahead dropdown. */
	private blackTypeaheadCloseTimeout: ReturnType<typeof setTimeout> | null = null;

	// ---- Typeahead Filtered Suggestions ----

	/** Filtered white player suggestions based on current filter text. */
	filteredWhiteSuggestions = computed(() => {
		const query = this.filterWhite().toLowerCase().trim();
		if (!query) return this.uniqueWhitePlayers();
		return this.uniqueWhitePlayers().filter((p) =>
			p.toLowerCase().includes(query),
		);
	});

	/** Filtered black player suggestions based on current filter text. */
	filteredBlackSuggestions = computed(() => {
		const query = this.filterBlack().toLowerCase().trim();
		if (!query) return this.uniqueBlackPlayers();
		return this.uniqueBlackPlayers().filter((p) =>
			p.toLowerCase().includes(query),
		);
	});

	/** Unique ECO codes mapped to occurrence counts in the loaded PGN. */
	uniqueEcoCodes = signal<Map<string, number>>(new Map());
	/** Unique time controls mapped to occurrence counts and original format strings. */
	uniqueTimeControls = signal<
		Map<string, { count: number; originals: Map<string, number> }>
	>(new Map());
	/** Unique event/tournament names mapped to occurrence counts. */
	uniqueEvents = signal<Map<string, number>>(new Map());

	/** ECO codes sorted by popularity (most frequent first). */
	sortedEcoCodes = computed(() => {
		const ecoMap = this.uniqueEcoCodes();
		return Array.from(ecoMap.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([code, count]) => ({ code, count }));
	});

	/** Time controls sorted by popularity with human-readable labels and original summaries. */
	sortedTimeControls = computed(() => {
		const tcMap = this.uniqueTimeControls();
		return Array.from(tcMap.entries())
			.sort((a, b) => b[1].count - a[1].count)
			.map(([key, data]) => ({
				key,
				count: data.count,
				label: this.formatTimeControlKey(key),
				originalsSummary: this.formatOriginalsSummary(data.originals),
			}));
	});

	/** Events sorted by popularity (most frequent first). */
	sortedEvents = computed(() => {
		const eventMap = this.uniqueEvents();
		return Array.from(eventMap.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([event, count]) => ({ event, count }));
	});

	// ---- Filtering State ----

	/** Indices of games matching the current filter criteria. */
	filteredGamesIndices = signal<number[]>([]);
	/** Whether a filter operation is in progress. */
	isFiltering = signal<boolean>(false);
	/** Monotonic counter used as correlation ID for filter requests to the worker. */
	private currentFilterId = 0;
	/** When `true`, auto-select the first matching game after filtering completes. */
	private autoSelectOnFinish = false;
	/** View query for the move list scroll container. */
	readonly moveList = viewChild<ElementRef<HTMLElement>>('moveList');
	/** Currently active opening move sequence for interactive mode filtering. */
	private activeFilterMoves: string[] = [];
	/** Saved move index before entering filter-moves mode (restored when exiting). */
	private savedGameMoveIndex: number | null = null;
	/** Active deferred timeout handles that should be cancelled on destroy. */
	private readonly pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();

	/** Moves made by the user during interactive opening-move filtering mode. */
	private interactiveMoves = signal<string[]>([]);

	/** Flag to uncheck the filter-moves toggle after a filter operation completes. */
	private shouldUncheckFilterMoves = false;

	// ---- Computed Values ----

	/** Number of currently selected games for batch operations. */
	selectedGamesCount = computed(() => this.selectedGames().size);
	/** Whether the replay-all button should be visible (multiple games + selection). */
	canShowReplayAll = computed(
		() => this.gamesMetadata().length > 1 && this.selectedGamesCount() > 0,
	);
	/** Display string: "Game X of Y". */
	currentGameInfo = computed(
		() =>
			`Game ${this.currentGameIndex() + 1} of ${this.gamesMetadata().length} `,
	);

	/** Display name of the white player for the current game. */
	currentWhitePlayer = computed(() => {
		const metadata = this.gamesMetadata();
		const currentIndex = this.currentGameIndex();
		if (
			metadata.length === 0 ||
			currentIndex < 0 ||
			currentIndex >= metadata.length
		)
			return 'Unknown';
		return metadata[currentIndex].white;
	});

	/** Display name of the black player for the current game. */
	currentBlackPlayer = computed(() => {
		const metadata = this.gamesMetadata();
		const currentIndex = this.currentGameIndex();
		if (
			metadata.length === 0 ||
			currentIndex < 0 ||
			currentIndex >= metadata.length
		)
			return 'Unknown';
		return metadata[currentIndex].black;
	});

	/** Formatted result string for the current game. */
	currentGameResult = computed(() => {
		const metadata = this.gamesMetadata();
		const currentIndex = this.currentGameIndex();
		if (
			metadata.length === 0 ||
			currentIndex < 0 ||
			currentIndex >= metadata.length
		)
			return '*';
		return metadata[currentIndex].result;
	});

	/**
	 * Computed from-to squares of the last move for board highlighting.
	 * Returns `undefined` when highlighting is disabled or no move has been played.
	 */
	lastMoveSquares = computed<[Key, Key] | undefined>(() => {
		if (!this.highlightLastMove()) return undefined;
		this.currentMoveIndex();
		this.currentFen();
		const history = this.chess.history({ verbose: true });
		if (history.length === 0) return undefined;
		const lastMove = history[history.length - 1];
		return [lastMove.from as Key, lastMove.to as Key];
	});

	/** Filtered game metadata for the current filter results. */
	filteredGameInfos = computed(() => {
		const metadata = this.gamesMetadata();
		const indices = this.filteredGamesIndices();
		return indices.map((i) => metadata[i]);
	});

	// ---- Replay State ----

	/** Replay timing mode: fixed, realtime (clock-based), or proportional scaling. */
	replayMode = signal<'realtime' | 'proportional' | 'fixed'>('fixed');
	/** Total duration in minutes when `replayMode` is `'proportional'`. */
	proportionalDuration = signal<number>(1);
	/** Minimum seconds between moves in `'proportional'` and `'realtime'` modes. */
	minSecondsBetweenMoves = signal<number>(1);
	/** Fixed seconds between moves when `replayMode` is `'fixed'`. */
	fixedTime = signal<number>(1);
	/** Whether to pause replay when a large evaluation change is detected. */
	stopOnError = signal<boolean>(false);
	/** Evaluation change threshold (in pawns) that triggers a stop. */
	stopOnErrorThreshold = signal<number>(1.0);

	// ---- Clock State ----

	/** Display string for white's remaining clock time. */
	whiteTimeRemaining = signal<string>('');
	/** Display string for black's remaining clock time. */
	blackTimeRemaining = signal<string>('');
	/** Whether either clock has been populated (controls clock display visibility). */
	showClocks = computed(
		() => this.whiteTimeRemaining() !== '' || this.blackTimeRemaining() !== '',
	);

	/** Whether a replay is currently in progress. */
	isReplaying = signal<boolean>(false);
	/** Whether the replay can be continued from the current move. */
	canContinueReplay = computed(
		() =>
			!this.isReplaying() && this.currentMoveIndex() < this.moves().length - 1,
	);

	// ---- Stockfish State ----

	/** Whether Stockfish is currently analyzing a position. */
	isAnalyzing = signal<boolean>(false);
	/** Stockfish analysis result: best move, PV line, and optional score. */
	bestMoveInfo = signal<{
		move: string;
		pv: { san: string; fen: string }[];
		score?: string;
	} | null>(null);
	/** Whether to show the "Show Better Move" button after a stop-on-error event. */
	showBetterMoveBtn = signal<boolean>(false);
	/** Whether the Stockfish analysis panel is currently visible. */
	analysisVisible = signal<boolean>(false);

	/**
	 * Converts UCI move strings to SAN notation with resulting FENs.
	 *
	 * Used by Stockfish message handling to convert the engine's UCI PV line
	 * into human-readable SAN for display.
	 *
	 * @param fen — Starting FEN position.
	 * @param uciMoves — Array of UCI move strings (e.g. `["e2e4", "e7e5"]`).
	 * @returns Array of `{ san, fen }` objects, one per successful move.
	 */
	private uciToSan(
		fen: string,
		uciMoves: string[],
	): { san: string; fen: string }[] {
		try {
			const tempChess = new Chess(fen);
			const output: { san: string; fen: string }[] = [];

			for (let i = 0; i < uciMoves.length; i++) {
				const uci = uciMoves[i];
				const from = uci.substring(0, 2);
				const to = uci.substring(2, 4);
				const promotion = uci.length > 4 ? uci.substring(4, 5) : undefined;

				const move = tempChess.move({ from, to, promotion });
				if (!move) break;

				output.push({ san: move.san, fen: tempChess.fen() });
			}
			return output;
		} catch (e) {
			console.error('SAN conversion failed', e);
			return [];
		}
	}

	/**
	 * Handles UCI protocol messages from the Stockfish Web Worker.
	 *
	 * Parses `info ... pv ...` lines to extract the best move, PV line,
	 * and score (centipawns or mate). Updates {@link bestMoveInfo} and
	 * sets {@link isAnalyzing} to `false` on `bestmove`.
	 *
	 * @param event — Message event from the Stockfish worker.
	 */
	private handleStockfishMessage(event: MessageEvent) {
		const line = event.data;
		if (typeof line !== 'string') return;

		if (line.startsWith('bestmove')) {
			this.isAnalyzing.set(false);
		} else if (line.startsWith('info') && line.includes(' pv ')) {
			const pvIndex = line.indexOf(' pv ');
			const pvString = line.substring(pvIndex + 4);
			const moves = pvString.split(' ');
			if (moves.length > 0) {
				const bestMove = moves[0];

				// Optional: Extract score if needed for display
				let scoreText = '';
				const cpMatch = line.match(/score cp (-?\d+)/);
				const mateMatch = line.match(/score mate (-?\d+)/);

				// Determine active color for perspective adjustment
				let isBlackToMove = false;
				if (this.analyzedFen) {
					const parts = this.analyzedFen.split(' ');
					if (parts.length > 1 && parts[1] === 'b') {
						isBlackToMove = true;
					}
				}

				if (mateMatch) {
					let mate = parseInt(mateMatch[1], 10);
					if (isBlackToMove) mate = -mate;
					scoreText = `#${mate}`;
				} else if (cpMatch) {
					let cp = parseInt(cpMatch[1], 10);
					if (isBlackToMove) cp = -cp;
					scoreText = (cp / 100).toFixed(2);
					// Add + sign for positive scores for clarity
					if (cp > 0) scoreText = `+${scoreText}`;
				}

				// Convert PV to SAN objects
				const sanPv = this.analyzedFen
					? this.uciToSan(this.analyzedFen, moves)
					: [];

				let bestMoveSan = bestMove;
				if (this.analyzedFen) {
					try {
						const temp = new Chess(this.analyzedFen);
						const u = bestMove;
						const m = temp.move({
							from: u.substring(0, 2),
							to: u.substring(2, 4),
							promotion: u.length > 4 ? u.substring(4, 5) : undefined,
						});
						if (m) bestMoveSan = m.san;
					} catch (e) {
						console.error(e);
					}
				}

				this.bestMoveInfo.set({
					move: bestMoveSan,
					pv: sanPv,
					score: scoreText,
				});
			}
		}
	}

	/**
	 * Jumps the board display to a given FEN (used for PV preview in analysis).
	 *
	 * @param fen — FEN string to display on the board.
	 */
	previewPvMove(fen: string) {
		this.currentFen.set(fen);
	}

	/** FEN position currently being analyzed by Stockfish. */
	private analyzedFen: string | null = null;

	// ---- Stockfish Analysis Config ----

	/** Stockfish search depth in plies. */
	stockfishDepth = signal<number>(18);

	/**
	 * Sends a FEN position to Stockfish for analysis at the configured depth.
	 *
	 * Stops any in-progress analysis before starting. Sets {@link isAnalyzing}
	 * and clears any previous {@link bestMoveInfo}.
	 *
	 * @param fen — FEN string of the position to analyze.
	 */
	analyzePosition(fen: string) {
		if (!this.pgnViewerEngine.analyzePosition(fen, this.stockfishDepth())) {
			return;
		}

		this.isAnalyzing.set(true);
		this.bestMoveInfo.set(null);
		this.analyzedFen = fen;
	}

	/**
	 * Auto-plays the Stockfish best line on the board with 1-second delays.
	 *
	 * Iterates through the PV (principal variation) moves stored in
	 * {@link bestMoveInfo} and displays each resulting FEN.
	 */
	async autoplayBestLine() {
		const info = this.bestMoveInfo();
		if (!info || !info.pv || info.pv.length === 0) return;

		for (const move of info.pv) {
			this.currentFen.set(move.fen);
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	// ---- UI State ----

	/** Raw PGN text bound to the PGN textarea. */
	pgnInput = signal<string>('');
	/** URL input for fetching remote PGN files. */
	urlInput = signal<string>('');

	// ---- Evaluation State ----

	/** Per-move evaluation strings from `[%eval ...]` PGN comments. */
	evaluations = signal<(string | null)[]>([]);
	/** Evaluation string at the current move index, or `null` at start position. */
	currentEvaluation = computed(() => {
		const evals = this.evaluations();
		const index = this.currentMoveIndex();
		if (index >= 0 && index < evals.length) {
			return evals[index];
		}
		return null;
	});

	/**
	 * Computed height percentage (0–100) for the evaluation bar.
	 *
	 * Maps centipawn scores linearly from -5.0 (0%) to +5.0 (100%).
	 * Mate scores force 0% or 100%.
	 */
	evaluationBarHeight = computed(() => {
		const evalStr = this.currentEvaluation();
		if (!evalStr) return 50;

		if (evalStr.startsWith('#')) {
			const mateIn = parseInt(evalStr.substring(1), 10);
			if (mateIn > 0) return 100;
			if (mateIn < 0) return 0;
			return 50;
		}

		const evalNum = parseFloat(evalStr);
		if (Number.isNaN(evalNum)) return 50;

		const maxEval = 5.0;
		const clampedEval = Math.max(-maxEval, Math.min(maxEval, evalNum));
		const percentage = 50 + (clampedEval / maxEval) * 50;
		return percentage;
	});

	/** Active side to move: `'w'` or `'b'` parsed from the current FEN. */
	activeColor = computed(() => {
		const fen = this.currentFen();
		const parts = fen.split(' ');
		return parts.length > 1 ? parts[1] : 'w';
	});

	// ---- Lichess Database Date Picker State ----

	/** Selected year for Lichess database queries (two-way bound via `model`). */
	lichessYear = model<number>(new Date().getFullYear());
	/** Selected month (1–12) for Lichess database queries (two-way bound via `model`). */
	lichessMonth = model<number>(1);

	// ---- Internal Objects ----

	/** chess.js instance used for move validation and board state management. */
	private chess = new Chess();
	/** Active replay timeout handles (cleared when replay stops). */
	private replayTimeouts: ReturnType<typeof setTimeout>[] = [];
	/** Resolve function for the replay-async Promise (called when replay completes). */
	private replayResolve: (() => void) | null = null;
	/** Whether a batch replay sequence across multiple games is in progress. */
	private isReplayingSequence = false;

	/**
	 * Computed run function for the child {@link NgxChessgroundComponent}.
	 *
	 * Reacts to changes in FEN, filter-moves mode, and last-move squares.
	 * In filter-moves mode the board is editable with legal-move highlighting;
	 * otherwise it is view-only. This is the primary binding between the
	 * PGN viewer state and the chessboard display.
	 */
	runFunction = computed<(el: HTMLElement) => Api>(() => {
		const fen = this.currentFen();
		const isEditable = this.filterMoves();
		const lastMove = this.lastMoveSquares();
		return (el: HTMLElement) => {
			return Chessground(el, {
				fen: fen,
				viewOnly: !isEditable,
				lastMove: lastMove,
				movable: {
					free: false,
					color: isEditable ? 'both' : undefined,
					dests: isEditable ? this.getMovableDests() : undefined,
					events: {
						after: (orig, dest) => {
							if (isEditable) {
								this.handleBoardMove(orig, dest);
							}
						},
					},
				},
			});
		};
	});

	/**
	 * Computes legal move destinations for the current chess.js position.
	 *
	 * Returns a `Map<fromSquare, toSquare[]>` suitable for chessground's
	 * `movable.dests` configuration in interactive filter-moves mode.
	 *
	 * @returns Map of legal destination squares keyed by origin square.
	 */
	private getMovableDests(): Map<Key, Key[]> {
		const dests = new Map<Key, Key[]>();
		const moves = this.chess.moves({ verbose: true });

		for (const move of moves) {
			const from = move.from as Key;
			if (!dests.has(from)) {
				dests.set(from, []);
			}
			const destArray = dests.get(from);
			if (destArray) {
				destArray.push(move.to as Key);
			}
		}

		return dests;
	}

	/**
	 * Processes a move made by the user on the interactive board during filter-moves mode.
	 *
	 * If the move is legal, it's appended to {@link interactiveMoves} and the
	 * board is updated via chess.js. The move is added to {@link activeFilterMoves}
	 * if it belongs to the opening line being filtered.
	 *
	 * @param orig — Origin square (e.g. `"e2"`).
	 * @param dest — Destination square (e.g. `"e4"`).
	 */
	private handleBoardMove(orig: string, dest: string) {
		try {
			// Try to make the move
			const move = this.chess.move({ from: orig, to: dest });

			if (move) {
				// Update the current FEN to reflect the new position
				this.currentFen.set(this.chess.fen());

				// Track the move in SAN notation for filtering
				this.interactiveMoves.update((moves) => [...moves, move.san]);
			}
		} catch (e) {
			console.error('Invalid move:', e);
			// Reset to current position if move was invalid
			this.currentFen.set(this.chess.fen());
		}
	}

	/**
	 * Initializes the PGN viewer engine workers and sets up reactive effects.
	 *
	 * Three effects are registered:
	 * 1. Auto-updates the Lichess URL when year/month selection changes.
	 * 2. Loads the initial PGN from the bound input when provided.
	 * 3. Auto-scrolls the move list when the current move index changes.
	 */
	constructor() {
		this.pgnViewerEngine.initialize({
			onPgnMessage: (data) => this.handleWorkerMessage(data),
			onStockfishMessage: (event) => this.handleStockfishMessage(event),
			onError: (message, error) => console.error(message, error),
		});

		// Initialize Lichess database date picker with previous month
		const now = new Date();
		const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		const year = prevMonth.getFullYear();
		const month = prevMonth.getMonth() + 1; // getMonth() is 0-indexed, we want 1-indexed

		// Set initial values using update
		this.lichessYear.update(() => year);
		this.lichessMonth.update(() => month);

		// Effect to update URL when date selection changes
		effect(
			() => {
				const year = this.lichessYear();
				const month = this.lichessMonth();
				if (year && month) {
					const monthStr = month.toString().padStart(2, '0');
					// Use relative path so it respects the base href
					this.urlInput.set(
						`lichess/broadcast/lichess_db_broadcast_${year}-${monthStr}.pgn.zst`,
					);
				}
			},
			{ allowSignalWrites: true },
		);

		// Effect to load initial PGN if provided
		effect(() => {
			const pgn = this.pgn();
			if (pgn) {
				this.loadPgnString(pgn);
				// Loading is now async via worker, so we don't loadGame(0) here immediately
				// It will be handled in handleWorkerMessage
			}
		});

		// Effect to auto-scroll move list when currentMoveIndex changes
		effect(() => {
			this.currentMoveIndex(); // Depend on currentMoveIndex
			this.setDeferredTimeout(() => {
				this.scrollToActiveMove();
			});
		});
	}

	/**
	 * Cleans up replay timeouts, workers, and all pending deferred timeouts.
	 *
	 * Called automatically by Angular when the component is destroyed.
	 */
	ngOnDestroy(): void {
		this.stopReplay();
		this.pgnViewerEngine.dispose();

		for (const timeoutId of this.pendingTimeouts) {
			clearTimeout(timeoutId);
		}
		this.pendingTimeouts.clear();
	}

	/**
	 * Updates the Stockfish search depth from an input event.
	 *
	 * @param event — Input event from the depth slider/number input.
	 */
	onStockfishDepthChange(event: Event) {
		const value = Number((event.target as HTMLInputElement).value);
		this.stockfishDepth.set(Number.isFinite(value) ? value : 1);
	}

	/**
	 * Creates a tracked `setTimeout` that is automatically cancelled on destroy.
	 *
	 * All timeout handles are stored in {@link pendingTimeouts} and cleared
	 * in {@link ngOnDestroy} to prevent memory leaks.
	 *
	 * @param callback — Function to execute after the delay.
	 * @param delay — Delay in milliseconds (default 0).
	 * @returns The timeout handle.
	 */
	private setDeferredTimeout(
		callback: () => void,
		delay = 0,
	): ReturnType<typeof setTimeout> {
		const timeoutId = setTimeout(() => {
			this.pendingTimeouts.delete(timeoutId);
			callback();
		}, delay);

		this.pendingTimeouts.add(timeoutId);
		return timeoutId;
	}

	/**
	 * Shows a Material snackbar notification to the user.
	 *
	 * @param message — Text to display in the snackbar.
	 * @param duration — Auto-dismiss duration in milliseconds (default 4000).
	 */
	private showMessage(message: string, duration = 4000): void {
		this.snackBar.open(message, 'Dismiss', {
			duration,
			horizontalPosition: 'end',
			verticalPosition: 'top',
		});
	}

	/**
	 * Routes PGN processor worker responses to the appropriate handler logic.
	 *
	 * Handles `'load'` (populate metadata, unique players, ECO codes),
	 * `'filter'` (update filtered indices, auto-select game),
	 * `'loadGame'` (display moves, evaluations, clocks), and `'error'` messages.
	 *
	 * @param data — Response from the PGN processor worker.
	 */
	private handleWorkerMessage(data: WorkerResponse) {
		const { type, payload, id } = data;
		if (type === 'load') {
			this.gamesMetadata.set(payload.metadata);
			this.isLoading.set(false);

			// Populate unique players with ELO sorting
			const whitePlayerElos = new Map<string, number>();
			const blackPlayerElos = new Map<string, number>();
			const ecoCodes = new Map<string, number>();

			for (const meta of payload.metadata) {
				if (
					meta.white &&
					meta.white !== 'Unknown' &&
					!meta.white.startsWith('BOT ')
				) {
					const currentMax = whitePlayerElos.get(meta.white) || 0;
					whitePlayerElos.set(
						meta.white,
						Math.max(currentMax, meta.whiteElo || 0),
					);
				}
				if (
					meta.black &&
					meta.black !== 'Unknown' &&
					!meta.black.startsWith('BOT ')
				) {
					const currentMax = blackPlayerElos.get(meta.black) || 0;
					blackPlayerElos.set(
						meta.black,
						Math.max(currentMax, meta.blackElo || 0),
					);
				}
				// Exclude ECO codes with '?' as they are likely non-standard games
				if (meta.eco && !meta.eco.includes('?')) {
					ecoCodes.set(meta.eco, (ecoCodes.get(meta.eco) || 0) + 1);
				}
			}

			// Count Time Controls (normalized with originals mapping)
			const timeControls = new Map<
				string,
				{ count: number; originals: Map<string, number> }
			>();
			const events = new Map<string, number>();
			for (const meta of payload.metadata) {
				const normalized = meta.timeControlNormalized;
				const original = meta.timeControl?.trim();
				if (normalized) {
					const existing = timeControls.get(normalized) || {
						count: 0,
						originals: new Map<string, number>(),
					};
					existing.count += 1;
					if (original) {
						existing.originals.set(
							original,
							(existing.originals.get(original) || 0) + 1,
						);
					}
					timeControls.set(normalized, existing);
				}
				if (meta.event && !meta.event.includes('?')) {
					events.set(meta.event, (events.get(meta.event) || 0) + 1);
				}
			}

			// Sort players by ELO descending
			const sortedWhitePlayers = Array.from(whitePlayerElos.entries())
				.sort((a, b) => b[1] - a[1])
				.map(([name]) => name);

			const sortedBlackPlayers = Array.from(blackPlayerElos.entries())
				.sort((a, b) => b[1] - a[1])
				.map(([name]) => name);

			this.uniqueWhitePlayers.set(sortedWhitePlayers);
			this.uniqueBlackPlayers.set(sortedBlackPlayers);
			this.uniqueEcoCodes.set(ecoCodes);
			this.uniqueTimeControls.set(timeControls);
			this.uniqueEvents.set(events);

			// Auto-select first game if available
			if (payload.count > 0) {
				this.loadGame(0);
			}

			// Clear filters
			this.clearFilters();
		} else if (type === 'filter') {
			if (id === this.currentFilterId) {
				this.filteredGamesIndices.set(payload);
				this.isFiltering.set(false);
				if (this.autoSelectOnFinish) {
					this.selectAllGames();
					this.autoSelectOnFinish = false;
				}

				// Load first game from filtered results
				if (payload.length > 0) {
					this.loadGame(payload[0]);
				}

				// Uncheck filterMoves after filtering completes if flag is set
				if (this.shouldUncheckFilterMoves) {
					this.filterMoves.set(false);
					this.shouldUncheckFilterMoves = false;
				}
			}
		} else if (type === 'loadGame') {
			const { moves, pgn, evaluations, error } = payload;

			if (error) {
				console.error('Worker failed to parse game:', error);
				this.pgnInput.set(
					`Error parsing game: ${error} \n\nRaw PGN: \n${pgn} `,
				);
				this.moves.set([]);
				this.evaluations.set([]);
			} else {
				this.moves.set(moves);
				this.evaluations.set(evaluations || []);
				this.chess.reset();
				this.currentMoveIndex.set(-1);
				this.currentFen.set(this.chess.fen());
				this.stopReplay();
				this.pgnInput.set(pgn);

				// If filtering by moves is active, jump to the filtered position
				if (this.filterMoves() && this.activeFilterMoves.length > 0) {
					if (moves.length >= this.activeFilterMoves.length) {
						this.jumpToMove(this.activeFilterMoves.length - 1);
					}
				}
			}

			this.isLoading.set(false);
		} else if (type === 'error') {
			console.error('Worker error:', payload);
			this.isLoading.set(false);
		}
	}

	/**
	 * Formats a normalized time control key for display.
	 *
	 * Converts `"seconds+increment"` (e.g. `"5400+30"`) to a human-readable
	 * form using minutes when divisible by 60 and ≤ 180 (e.g. `"90+30"`).
	 *
	 * @param key — Normalized time control string like `"5400+30"`.
	 * @returns Display-friendly time control string.
	 */
	private formatTimeControlKey(key: string): string {
		const match = key.match(/^(\d+)\+(\d+)$/);
		if (!match) return key;
		const baseSeconds = parseInt(match[1], 10);
		const incrementSeconds = parseInt(match[2], 10);
		if (Number.isNaN(baseSeconds) || Number.isNaN(incrementSeconds)) {
			return key;
		}
		if (baseSeconds % 60 === 0) {
			const baseMinutes = baseSeconds / 60;
			if (baseMinutes <= 180) {
				return `${baseMinutes}+${incrementSeconds}`;
			}
		}
		return `${baseSeconds}+${incrementSeconds}`;
	}

	/**
	 * Builds a summary string of the most common original time control formats.
	 *
	 * @param originals — Map of original format strings to occurrence counts.
	 * @param maxItems — Maximum number of entries to include (default 6).
	 * @returns Summary string like `"Originals: 90+30 (500), 180+2 (300) +3 more"`.
	 */
	private formatOriginalsSummary(
		originals: Map<string, number>,
		maxItems = 6,
	): string {
		const entries = Array.from(originals.entries()).sort((a, b) => b[1] - a[1]);
		const head = entries
			.slice(0, maxItems)
			.map(([value, count]) => `${value} (${count})`)
			.join(', ');
		const rest =
			entries.length > maxItems ? ` +${entries.length - maxItems} more` : '';
		return head ? `Originals: ${head}${rest}` : '';
	}

	/**
	 * Applies the current filter criteria and re-runs game filtering.
	 *
	 * Stops any in-progress replay and delegates to {@link runFilterLogic}
	 * with the values from the filter signal state. Auto-selects the first
	 * matching game when filtering completes.
	 */
	applyFilter() {
		// Stop any ongoing replay when filter is applied
		this.stopReplay();
		this.isReplayingSequence = false;

		// const games = this.games(); // REMOVED
		const fWhite = this.filterWhite();
		const fBlack = this.filterBlack();
		const fResult = this.filterResult().join(',');
		const fMoves = this.filterMoves();
		const fIgnoreColor = this.ignoreColor();
		const fRatingEnabled = this.filterRatingEnabled();
		const fWhiteRating = fRatingEnabled
			? parseInt(this.filterWhiteRating(), 10) || 0
			: 0;
		const fBlackRating = fRatingEnabled
			? parseInt(this.filterBlackRating(), 10) || 0
			: 0;
		const fWhiteRatingMax = fRatingEnabled
			? parseInt(this.filterWhiteRatingMax(), 10) || 0
			: 0;
		const fBlackRatingMax = fRatingEnabled
			? parseInt(this.filterBlackRatingMax(), 10) || 0
			: 0;
		const fEco = this.filterEco();
		const fTimeControl = this.filterTimeControl();
		const fEvent = this.filterEvent();

		// Use interactive moves if filtering by moves, otherwise use current game moves
		const currentMoves = fMoves
			? this.interactiveMoves()
			: this.moves().slice(0, this.currentMoveIndex() + 1);
		this.activeFilterMoves = currentMoves;

		this.autoSelectOnFinish = true;
		this.runFilterLogic(
			fWhite,
			fBlack,
			fResult,
			fMoves,
			fIgnoreColor,
			fWhiteRating,
			fBlackRating,
			fWhiteRatingMax,
			fBlackRatingMax,
			fEco,
			fTimeControl,
			fEvent,
			currentMoves,
		);

		// Set flag to uncheck "Filter by Starting Moves" after filtering completes
		if (fMoves) {
			this.shouldUncheckFilterMoves = true;
		}
	}

	/**
	 * Resets all filter fields to their default values and stops any in-progress replay.
	 *
	 * If the filter-moves mode was active, it's exited and the saved position is restored.
	 */
	clearFilters() {
		// Stop any ongoing replay
		this.stopReplay();
		this.isReplayingSequence = false;
		this.showBetterMoveBtn.set(false);
		this.analysisVisible.set(false);
		const hadFilterMoves = this.filterMoves();

		// Clear all filter fields
		this.filterWhite.set('');
		this.filterBlack.set('');
		this.filterResult.set([]);
		this.filterMoves.set(false);
		this.ignoreColor.set(false);
		this.filterRatingEnabled.set(false);
		this.filterWhiteRating.set('2000');
		this.filterBlackRating.set('2000');
		this.filterWhiteRatingMax.set('4000');
		this.filterBlackRatingMax.set('4000');
		this.filterEco.set('');
		this.filterTimeControl.set('');
		this.filterEvent.set('');
		this.autoSelectOnFinish = true; // Explicitly ensure auto-select
		this.interactiveMoves.set([]);
		this.activeFilterMoves = [];
		if (hadFilterMoves && this.savedGameMoveIndex !== null) {
			this.jumpToMove(this.savedGameMoveIndex);
			this.savedGameMoveIndex = null;
		}

		// Apply filter to reset view
		this.applyFilter();
	}

	/**
	 * Sends filter criteria to the PGN processor worker and tracks the request.
	 *
	 * Increments a monotonic filter ID to detect stale responses.
	 * Called by {@link applyFilter} after collecting current signal values.
	 *
	 * @param fWhite — White player filter text.
	 * @param fBlack — Black player filter text.
	 * @param fResult — Comma-separated result filter string.
	 * @param fMoves — Whether opening-move filtering is enabled.
	 * @param fIgnoreColor — Whether to swap white/black matching.
	 * @param fWhiteRating — Minimum white Elo.
	 * @param fBlackRating — Minimum black Elo.
	 * @param fWhiteRatingMax — Maximum white Elo.
	 * @param fBlackRatingMax — Maximum black Elo.
	 * @param fEco — ECO code filter.
	 * @param fTimeControl — Time control filter.
	 * @param fEvent — Event name filter.
	 * @param targetMoves — SAN move sequence to match.
	 */
	private runFilterLogic(
		fWhite: string,
		fBlack: string,
		fResult: string,
		fMoves: boolean,
		fIgnoreColor: boolean,
		fWhiteRating: number,
		fBlackRating: number,
		fWhiteRatingMax: number,
		fBlackRatingMax: number,
		fEco: string,
		fTimeControl: string,
		fEvent: string,
		targetMoves: string[],
	) {
		this.currentFilterId++;
		const myFilterId = this.currentFilterId;
		this.isFiltering.set(true);

		const filterCriteria: FilterCriteria = {
			white: fWhite,
			black: fBlack,
			result: fResult,
			moves: fMoves,
			ignoreColor: fIgnoreColor,
			minWhiteRating: fWhiteRating,
			minBlackRating: fBlackRating,
			maxWhiteRating: fWhiteRatingMax,
			maxBlackRating: fBlackRatingMax,
			eco: fEco,
			timeControl: fTimeControl,
			event: fEvent,
			targetMoves: targetMoves,
		};

		this.pgnViewerEngine.filterGames(filterCriteria, myFilterId);
	}

	// --- PGN Loading Logic ---

	/**
	 * Loads a raw PGN string into the viewer, resetting current game state.
	 *
	 * Delegates to {@link PgnViewerEngineService.loadPgn} for background parsing.
	 * The worker response (via {@link handleWorkerMessage}) populates metadata
	 * and triggers the first game load.
	 *
	 * @param pgn — Raw PGN text (supports multi-game, compressed formats).
	 */
	loadPgnString(pgn: string) {
		// Reset state to ensure UI updates
		this.moves.set([]);
		this.interactiveMoves.set([]);
		this.currentMoveIndex.set(-1);
		this.currentGameIndex.set(-1); // Force change detection when setting to 0 later
		this.currentFen.set(
			'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
		);

		this.pgnViewerEngine.loadPgn(pgn, Date.now());
	}

	/**
	 * Reads PGN text from the system clipboard and loads it into the viewer.
	 *
	 * Uses the Clipboard API. On failure, shows an error snackbar.
	 */
	async loadFromClipboard() {
		try {
			const text = await navigator.clipboard.readText();
			if (text) {
				this.pgnInput.set(text);
				this.loadPgnString(text);
				this.loadGame(0);
			}
		} catch (err) {
			console.error('Failed to read clipboard contents: ', err);
			this.showMessage('Failed to read clipboard.', 5000);
		}
	}

	/**
	 * Copies the current PGN text to the system clipboard.
	 *
	 * Uses the Clipboard API. On failure, shows an error snackbar.
	 */
	async copyToClipboard() {
		try {
			await navigator.clipboard.writeText(this.pgnInput());
			// Optional: You could add a temporary "Copied!" state here if desired
		} catch (err) {
			console.error('Failed to copy to clipboard: ', err);
			this.showMessage('Failed to copy to clipboard.', 5000);
		}
	}

	/**
	 * Updates the proportional replay duration from an input event.
	 *
	 * @param event — Change event from the proportional duration input.
	 */
	onProportionalDurationChange(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.proportionalDuration.set(parseFloat(value) || 1);
	}

	/**
	 * Updates the minimum-seconds-between-moves setting from an input event.
	 *
	 * @param event — Change event from the minimum seconds input.
	 */
	onMinSecondsBetweenMovesChange(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.minSecondsBetweenMoves.set(parseFloat(value) || 0.1);
	}

	/**
	 * Updates the fixed-time replay setting from an input event.
	 *
	 * @param event — Change event from the fixed time input.
	 */
	onFixedTimeChange(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.fixedTime.set(parseFloat(value) || 1);
	}

	/**
	 * Updates the PGN input text from a textarea change event.
	 *
	 * @param event — Change event from the PGN textarea input.
	 */
	onPgnInputChange(event: Event) {
		const value = (event.target as HTMLTextAreaElement).value;
		this.pgnInput.set(value);
	}

	/**
	 * Updates the URL input from a text input change event.
	 *
	 * @param event — Change event from the URL text input.
	 */
	onUrlInputChange(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.urlInput.set(value);
	}

	/**
	 * Updates the event filter from a select element change event.
	 *
	 * @param event — Change event from the event filter `<select>` element.
	 */
	updateFilterEvent(event: Event) {
		const value = (event.target as HTMLSelectElement).value;
		this.filterEvent.set(value);
	}

	/**
	 * Returns the list of years available in the Lichess database picker.
	 *
	 * Years range from 2020 to the current year.
	 *
	 * @returns Array of available year numbers.
	 */
	getLichessYears(): number[] {
		const currentYear = new Date().getFullYear();
		const years: number[] = [];
		for (let year = 2020; year <= currentYear; year++) {
			years.push(year);
		}
		return years;
	}

	/**
	 * Returns the list of months available for the currently selected Lichess year.
	 *
	 * For past years, all 12 months are available. For the current year,
	 * only months up to (current month - 1) are available.
	 *
	 * @returns Array of available month numbers (1–12).
	 */
	getLichessMonths(): number[] {
		const selectedYear = this.lichessYear();
		const now = new Date();
		const currentYear = now.getFullYear();
		const currentMonth = now.getMonth(); // 0-indexed

		if (selectedYear < currentYear) {
			// For past years, all 12 months are available
			return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
		} else if (selectedYear === currentYear) {
			// For current year, only up to current month - 1
			const maxMonth = currentMonth; // currentMonth is already 0-indexed, so this gives us current month - 1 in 1-indexed
			const months: number[] = [];
			for (let m = 1; m <= maxMonth; m++) {
				months.push(m);
			}
			return months;
		} else {
			return [];
		}
	}

	/**
	 * Updates the Lichess year selection and adjusts the month if needed.
	 *
	 * If the currently selected month is not available for the new year,
	 * it falls back to the last available month.
	 *
	 * @param event — Change event from the year `<select>` element.
	 */
	onLichessYearChange(event: Event) {
		const value = (event.target as HTMLSelectElement).value;
		const year = parseInt(value, 10);
		this.lichessYear.set(year);

		// Adjust month if current selection is invalid for new year
		const availableMonths = this.getLichessMonths();
		if (!availableMonths.includes(this.lichessMonth())) {
			this.lichessMonth.set(availableMonths[availableMonths.length - 1] || 1);
		}
	}

	/**
	 * Updates the Lichess month selection from a select element change event.
	 *
	 * @param event — Change event from the month `<select>` element.
	 */
	onLichessMonthChange(event: Event) {
		const value = (event.target as HTMLSelectElement).value;
		const month = parseInt(value, 10);
		this.lichessMonth.set(month);
	}

	/**
	 * Loads a PGN file from the Lichess broadcast database.
	 *
	 * Constructs the URL from the selected year and month
	 * (`lichess_db_broadcast_YYYY-MM.pgn.zst`) and delegates to {@link loadFromUrl}.
	 */
	loadFromLichess() {
		const year = this.lichessYear();
		const month = this.lichessMonth();

		if (!year || !month) {
			this.showMessage('Please select a valid year and month.');
			return;
		}

		// Format: lichess_db_broadcast_YYYY-MM.pgn.zst
		const monthStr = month.toString().padStart(2, '0');
		// Use relative path so it respects the base href (e.g. /ngx-chessground/ on GitHub Pages)
		const url = `lichess/broadcast/lichess_db_broadcast_${year}-${monthStr}.pgn.zst`;

		this.urlInput.set(url);
		this.loadFromUrl();
	}

	/**
	 * Fetches a PGN file from the URL in {@link urlInput} and loads it into the viewer.
	 *
	 * Supports plain `.pgn`, gzip-compressed `.pgn.gz`, and zstd-compressed `.pgn.zst`.
	 * Shows a progress bar during download and delegates decompression/parsing.
	 */
	async loadFromUrl() {
		const url = this.urlInput();
		if (!url) return;

		this.isLoading.set(true);
		this.loadingProgress.set(0);
		this.loadingStatus.set('Starting download...');

		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status} `);
			}

			const contentLength = response.headers.get('content-length');
			const total = contentLength ? parseInt(contentLength, 10) : 0;

			if (!response.body) {
				throw new Error('Response body is null');
			}

			const reader = response.body.getReader();
			const chunks: Uint8Array[] = [];
			let receivedLength = 0;

			while (true) {
				const { done, value } = await reader.read();

				if (done) break;

				chunks.push(value);
				receivedLength += value.length;

				if (total > 0) {
					const progress = Math.round((receivedLength / total) * 100);
					this.loadingProgress.set(progress);
					this.loadingStatus.set(
						`Downloading: ${(receivedLength / 1024 / 1024).toFixed(2)} MB / ${(total / 1024 / 1024).toFixed(2)} MB`,
					);
				} else {
					this.loadingStatus.set(
						`Downloading: ${(receivedLength / 1024 / 1024).toFixed(2)} MB`,
					);
				}
			}

			// Combine chunks into single array
			const buffer = new Uint8Array(receivedLength);
			let position = 0;
			for (const chunk of chunks) {
				buffer.set(chunk, position);
				position += chunk.length;
			}

			this.loadingStatus.set('Decompressing...');
			let content: string;

			// Check for ZST magic bytes (0xFD2FB528) or extension
			const isZst = url.toLowerCase().endsWith('.zst');

			if (isZst) {
				const decompressed = decompressZst(buffer);
				content = new TextDecoder().decode(decompressed);
			} else {
				content = new TextDecoder().decode(buffer);
			}

			this.loadingStatus.set('Processing games...');
			this.setDeferredTimeout(() => {
				this.loadPgnString(content);
				this.loadGame(0);
				this.isLoading.set(false);
				this.loadingProgress.set(0);
				this.loadingStatus.set('');
			});
		} catch (e) {
			console.error('Error loading from URL:', e);
			this.showMessage(`Error loading from URL: ${String(e)}`, 6000);
			this.isLoading.set(false);
			this.loadingProgress.set(0);
			this.loadingStatus.set('');
		}
	}

	/**
	 * Reads a user-selected ZIP file containing PGN files and loads the first
	 * `.pgn` entry found.
	 *
	 * Uses jszip to extract the archive.
	 *
	 * @param event — Change event from the ZIP file `<input>` element.
	 */
	async onPgnZipSelected(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		const file = input.files[0];
		this.isLoading.set(true);

		try {
			const zip = await loadZipAsync(file);
			const pgnFile = Object.values(zip.files).find((f) =>
				f.name.endsWith('.pgn'),
			);

			if (pgnFile) {
				const content = await pgnFile.async('string');
				this.setDeferredTimeout(() => {
					this.loadPgnString(content);
					this.loadGame(0);
					this.isLoading.set(false);
				});
			} else {
				this.showMessage('No PGN file found in the zip archive.');
				this.isLoading.set(false);
			}
		} catch (e) {
			console.error('Error loading zip file:', e);
			this.showMessage('Error loading zip file.', 5000);
			this.isLoading.set(false);
		}
	}

	/**
	 * Reads a user-selected PGN file from a file input and loads it into the viewer.
	 *
	 * Handles `.pgn` and `.pgn.gz` files via the browser's FileReader API.
	 *
	 * @param event — Change event from the file `<input>` element.
	 */
	onPgnFileSelected(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		const file = input.files[0];
		this.isLoading.set(true);

		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result as string;
			if (content) {
				this.setDeferredTimeout(() => {
					this.loadPgnString(content);
					this.loadGame(0);
					this.isLoading.set(false);
				});
			} else {
				this.isLoading.set(false);
			}
		};
		reader.onerror = () => {
			this.isLoading.set(false);
			this.showMessage('Error reading file.', 5000);
		};
		reader.readAsText(file);
	}

	// --- Game Logic ---

	/**
	 * Loads a specific game by its index in the parsed game list.
	 *
	 * Delegates parsing to the PGN processor worker. The response
	 * (via {@link handleWorkerMessage}) updates moves, evaluations, and clocks.
	 *
	 * @param index — Zero-based game index.
	 */
	loadGame(index: number) {
		const count = this.gamesMetadata().length;
		if (index >= 0 && index < count) {
			this.currentGameIndex.set(index);
			this.moves.set([]);
			this.pgnInput.set('Loading...');
			this.isLoading.set(true);
			this.pgnViewerEngine.loadGame(index, Date.now());
		}
	}

	/**
	 * Toggles a game's selection state for batch replay operations.
	 *
	 * @param index — Zero-based game index to toggle.
	 */
	toggleGameSelection(index: number) {
		const selected = new Set(this.selectedGames());
		if (selected.has(index)) {
			selected.delete(index);
		} else {
			selected.add(index);
		}
		this.selectedGames.set(selected);
	}

	/** Selects all games in the current filtered list for batch replay. */
	selectAllGames() {
		const indices = this.filteredGamesIndices();
		const selected = new Set<number>();
		for (const i of indices) {
			selected.add(i);
		}
		this.selectedGames.set(selected);
	}

	/** Clears all game selections. */
	clearSelection() {
		this.selectedGames.set(new Set());
	}

	/** Advances to the next game in the list, if available. */
	nextGame() {
		if (this.currentGameIndex() < this.gamesMetadata().length - 1) {
			this.loadGame(this.currentGameIndex() + 1);
		}
	}

	/** Moves to the previous game in the list, if available. */
	prevGame() {
		if (this.currentGameIndex() > 0) {
			this.loadGame(this.currentGameIndex() - 1);
		}
	}

	// --- Navigation Logic ---

	/**
	 * Jumps the board to a specific move index, replaying all moves up to that point.
	 *
	 * `-1` resets to the starting position before any moves.
	 *
	 * @param index — The target move index (-1 for start position).
	 */
	jumpToMove(index: number) {
		const moves = this.moves();
		if (index >= -1 && index < moves.length) {
			this.chess.reset();
			for (let i = 0; i <= index; i++) {
				this.chess.move(moves[i]);
			}
			this.currentMoveIndex.set(index);
			this.currentFen.set(this.chess.fen());
		}
	}

	/** Scrolls the move list container to keep the active move visible. */
	private scrollToActiveMove() {
		const moveList = this.moveList();
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
	}

	/**
	 * Advances to the next move in the current game.
	 *
	 * Updates the board, move index, and clock display.
	 */
	next() {
		const moves = this.moves();
		const currentIdx = this.currentMoveIndex();
		if (currentIdx < moves.length - 1) {
			const nextMove = moves[currentIdx + 1];
			this.chess.move(nextMove);
			this.currentMoveIndex.set(currentIdx + 1);
			this.currentFen.set(this.chess.fen());

			const nextMoveIdx = currentIdx + 1;
			if (nextMoveIdx + 1 < this.clockHistory.length) {
				const clocks = this.clockHistory[nextMoveIdx + 1];
				this.whiteTimeRemaining.set(this.formatTime(clocks.white));
				this.blackTimeRemaining.set(this.formatTime(clocks.black));
			}
		}
	}

	/**
	 * Goes back one move in the current game.
	 *
	 * Undoes the last move on the board and updates the clock display.
	 */
	prev() {
		if (this.currentMoveIndex() >= 0) {
			this.chess.undo();
			this.currentMoveIndex.update((i) => i - 1);
			this.currentFen.set(this.chess.fen());

			const currentIdx = this.currentMoveIndex();
			if (currentIdx + 1 >= 0 && currentIdx + 1 < this.clockHistory.length) {
				const clocks = this.clockHistory[currentIdx + 1];
				this.whiteTimeRemaining.set(this.formatTime(clocks.white));
				this.blackTimeRemaining.set(this.formatTime(clocks.black));
			}
		}
	}

	/** Stops any in-progress replay sequence and cancels pending timeouts. */
	stopSequence() {
		this.isReplayingSequence = false;
		this.stopReplay();
	}

	/**
	 * Toggles the rating filter enable/disable checkbox.
	 *
	 * @param event — Change event from the rating-filter checkbox.
	 */
	toggleFilterRatingEnabled(event: Event) {
		const checked = (event.target as HTMLInputElement).checked;
		this.filterRatingEnabled.set(checked);
	}

	/**
	 * Applies a rating preset (e.g. "2000+", "2500+", "3000+") from a dropdown.
	 *
	 * Sets the minimum rating to the selected value and the maximum to 3000
	 * (or 4000 for the "3000+" tier).
	 *
	 * @param event — Change event from the rating preset `<select>` element.
	 */
	applyRatingPreset(event: Event) {
		const value = (event.target as HTMLSelectElement).value;
		if (!value) return;

		const min = value;
		const max = value === '3000' ? '4000' : '3000';

		this.filterRatingEnabled.set(true);
		this.filterWhiteRating.set(min);
		this.filterBlackRating.set(min);
		this.filterWhiteRatingMax.set(max);
		this.filterBlackRatingMax.set(max);
	}

	/**
	 * Toggles the "stop on error" replay option.
	 *
	 * @param event — Change event from the stop-on-error checkbox.
	 */
	toggleStopOnError(event: Event) {
		const checked = (event.target as HTMLInputElement).checked;
		this.stopOnError.set(checked);
	}

	/**
	 * Updates the stop-on-error evaluation threshold from an input event.
	 *
	 * @param event — Input event from the threshold number field.
	 */
	updateStopOnErrorThreshold(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.stopOnErrorThreshold.set(parseFloat(value) || 1.0);
	}

	/**
	 * Resets the board to the starting position (before any moves).
	 *
	 * Also restores initial clock times if clock history data is available.
	 */
	start() {
		this.chess.reset();
		this.currentMoveIndex.set(-1);
		this.currentFen.set(this.chess.fen());

		if (this.clockHistory.length > 0) {
			const startClocks = this.clockHistory[0];
			if (startClocks) {
				this.whiteTimeRemaining.set(this.formatTime(startClocks.white));
				this.blackTimeRemaining.set(this.formatTime(startClocks.black));
			}
		}
	}

	/**
	 * Jumps to the final position of the current game.
	 *
	 * Replays all moves from the start to reach the end-of-game position.
	 */
	end() {
		this.chess.reset();
		const moves = this.moves();
		for (const move of moves) {
			this.chess.move(move);
		}
		this.currentMoveIndex.set(moves.length - 1);
		this.currentFen.set(this.chess.fen());
	}

	// --- Replay Logic ---

	/**
	 * Starts an auto-replay of the current game from the beginning.
	 *
	 * Stops any in-progress replay, resets to the start position,
	 * then runs the replay logic with timing based on the selected mode.
	 */
	replayGame() {
		this.stopReplay();
		this.start();
		this.runReplayLogic();
	}

	/**
	 * Continues an auto-replay from the current move position.
	 *
	 * Preserves the replay Promise (doesn't resolve it prematurely)
	 * so batch replay sequences can resume from where they left off.
	 */
	continueReplay() {
		this.stopReplay(false);
		this.runReplayLogic();
	}

	/**
	 * Executes the replay logic for the currently loaded game.
	 *
	 * Parses the game PGN, calculates move timing based on the selected
	 * {@link replayMode}, and schedules the replay via {@link scheduleReplay}.
	 */
	private runReplayLogic() {
		// Use the currently loaded PGN from the input area
		const gamePgn = this.pgnInput();
		const onComplete = this.replayResolve
			? () => {
					if (this.replayResolve) {
						this.replayResolve();
						this.replayResolve = null;
					}
				}
			: undefined;

		try {
			const tempChess = new Chess();
			tempChess.loadPgn(gamePgn);
			const history = tempChess.history({ verbose: true });

			const timeOuts = this.calculateReplayTimeouts(history);
			this.scheduleReplay(timeOuts, history.length, onComplete);
		} catch (_e) {
			// console.warn("Replay PGN parsing failed with chess.js, trying chessops", e);
			try {
				const timeOuts = this.calculateReplayTimeoutsChessops(gamePgn);
				this.scheduleReplay(timeOuts, timeOuts.length, onComplete);
			} catch (_e2) {
				// console.warn("Replay PGN parsing failed with chessops, falling back to simple replay", e2);
				// Fallback: use moves list length and fixed time
				const moveCount = this.moves().length;
				const timeOuts = Array(moveCount)
					.fill(0)
					.map((_, i) => (i + 1) * this.fixedTime());
				this.scheduleReplay(timeOuts, moveCount);
			}
		}
	}

	/**
	 * Sequentially replays all selected games in the filtered game list.
	 *
	 * Each game is loaded, replayed from start to finish, then a 2-second pause
	 * is inserted before the next game. Respects the current filter sort order.
	 */
	async replayAllSelectedGames() {
		this.stopReplay();
		this.isReplayingSequence = true;

		// Use filteredGamesIndices to maintain the sort order (by Elo sum)
		// Filter this list to include only selected games
		const selectedSet = this.selectedGames();
		const selected = this.filteredGamesIndices().filter((idx) =>
			selectedSet.has(idx),
		);

		if (selected.length === 0) {
			this.showMessage('No games selected. Please select games to replay.');
			return;
		}

		for (let i = 0; i < selected.length; i++) {
			if (!this.isReplayingSequence) break;
			const gameIndex = selected[i];
			this.loadGame(gameIndex);

			// Wait for the game to load
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Replay the current game
			await this.replayGameAsync();

			// Wait a bit between games (2 seconds)
			if (i < selected.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		}
	}

	/**
	 * Returns a Promise that resolves when the current game's replay completes.
	 *
	 * Used by batch replay sequences to await each game's auto-play before
	 * moving to the next selected game.
	 *
	 * @returns Promise resolved by {@link scheduleReplay} via {@link replayResolve}.
	 */
	private replayGameAsync(): Promise<void> {
		return new Promise((resolve) => {
			this.stopReplay();
			this.replayResolve = resolve;
			this.start();

			const gamePgn = this.pgnInput();

			try {
				const tempChess = new Chess();
				tempChess.loadPgn(gamePgn);
				const history = tempChess.history({ verbose: true });

				const timeOuts = this.calculateReplayTimeouts(history);

				// Actually schedule the replay
				this.scheduleReplay(timeOuts, history.length, () => {
					resolve();
					this.replayResolve = null;
				});
			} catch (_e) {
				// console.warn("Replay PGN parsing failed with chess.js, trying chessops", e);
				try {
					const timeOuts = this.calculateReplayTimeoutsChessops(gamePgn);
					this.scheduleReplay(timeOuts, timeOuts.length, () => {
						resolve();
						this.replayResolve = null;
					});
				} catch (_e2) {
					// console.warn("Replay PGN parsing failed with chessops, falling back to simple replay", e2);
					// Fallback
					const moveCount = this.moves().length;
					const timeOuts = Array(moveCount)
						.fill(0)
						.map((_, i) => (i + 1) * this.fixedTime());

					this.scheduleReplay(timeOuts, moveCount, () => {
						resolve();
						this.replayResolve = null;
					});
				}
			}
		});
	}

	/**
	 * Stops any in-progress replay, clears scheduled timeouts, and optionally
	 * resolves the replay Promise used by batch replay sequences.
	 *
	 * @param resolvePromise — When `true` (default), resolve any pending replay Promise.
	 */
	stopReplay(resolvePromise = true) {
		this.isReplaying.set(false);
		this.replayTimeouts.forEach((t) => {
			clearTimeout(t);
			this.pendingTimeouts.delete(t);
		});
		this.replayTimeouts = [];

		if (resolvePromise && this.replayResolve) {
			this.replayResolve();
			this.replayResolve = null;
		}
	}

	/**
	 * Calculates replay timeouts by parsing clock comments from the PGN via chessops.
	 *
	 * Fallback used when chess.js parsing fails. Reads `[%clk h:m:s]` comments
	 * to determine think time per move in `'realtime'` and `'proportional'` modes.
	 *
	 * @param pgn — Raw PGN string for the game.
	 * @returns Array of seconds delays, one per move.
	 */
	private calculateReplayTimeoutsChessops(pgn: string): number[] {
		const games = parsePgn(pgn);
		if (games.length === 0) throw new Error('No games found by chessops');

		const game = games[0];
		const timeOuts: number[] = [];
		this.clockHistory = [];

		// Try to parse time control from headers
		let timeControlSeconds = 0;
		if (game.headers.has('TimeControl')) {
			const tc = game.headers.get('TimeControl')?.split('+');
			if (tc) timeControlSeconds = parseInt(tc[0], 10);
		}

		let whiteTime = timeControlSeconds;
		let blackTime = timeControlSeconds;
		this.clockHistory.push({ white: whiteTime, black: blackTime });

		const thinkTimes: number[] = [];
		let node = game.moves;
		let isWhite = true;

		while (node.children.length > 0) {
			const child = node.children[0]; // Main line
			let moveTime = 0;
			let hasClockComment = false;

			// Check comments for clock
			if (child.data?.comments) {
				for (const comment of child.data.comments) {
					const clkMatch = comment.match(/%clk\s+(?:(\d+):)?(\d+):(\d+)/);
					if (clkMatch) {
						hasClockComment = true;
						let h = 0,
							m = 0,
							s = 0;
						if (clkMatch[1]) h = parseInt(clkMatch[1], 10);
						m = parseInt(clkMatch[2], 10);
						s = parseInt(clkMatch[3], 10);

						const timeInSeconds = h * 3600 + m * 60 + s;

						if (isWhite) {
							moveTime = Math.max(0.1, whiteTime - timeInSeconds);
							whiteTime = timeInSeconds;
						} else {
							moveTime = Math.max(0.1, blackTime - timeInSeconds);
							blackTime = timeInSeconds;
						}
						break; // Found clock, stop looking
					}
				}
			}

			if (!hasClockComment) {
				moveTime = this.fixedTime();
			}

			thinkTimes.push(moveTime);
			this.clockHistory.push({ white: whiteTime, black: blackTime });

			node = child;
			isWhite = !isWhite;
		}

		// Calculate timeouts based on mode (reuse logic if possible, or duplicate for now)
		if (this.replayMode() === 'fixed') {
			return thinkTimes.map((_, i) => (i + 1) * this.fixedTime());
		}

		if (this.replayMode() === 'realtime') {
			let totalTime = 0;
			for (let i = 0; i < thinkTimes.length; i++) {
				totalTime += thinkTimes[i];
				timeOuts.push(totalTime);
			}
			return timeOuts;
		}

		if (this.replayMode() === 'proportional') {
			const totalGameDuration = thinkTimes.reduce((a, b) => a + b, 0);
			const targetDurationSeconds = this.proportionalDuration() * 60;
			const scaleFactor =
				totalGameDuration > 0 ? targetDurationSeconds / totalGameDuration : 1;
			const minSeconds = this.minSecondsBetweenMoves();

			let currentScaledTime = 0;
			for (let i = 0; i < thinkTimes.length; i++) {
				let scaledMoveTime = thinkTimes[i] * scaleFactor;
				if (scaledMoveTime < minSeconds) {
					scaledMoveTime = minSeconds;
				}
				currentScaledTime += scaledMoveTime;
				timeOuts.push(currentScaledTime);
			}
			return timeOuts;
		}

		return thinkTimes.map((_, i) => (i + 1) * 1);
	}

	/**
	 * Clock state at each half-move: remaining seconds for white and black.
	 * Index 0 is the initial clock state. Populated by {@link calculateReplayTimeouts}.
	 */
	private clockHistory: { white: number; black: number }[] = [];

	/**
	 * Calculates per-move replay delays from game history and clock comments.
	 *
	 * Parses `[%clk h:m:s]` comments to compute think times. Supports three modes:
	 * `'fixed'` (constant delay), `'realtime'` (actual think time), and
	 * `'proportional'` (scaled to fit {@link proportionalDuration}).
	 *
	 * @param history — Verbose move history from chess.js.
	 * @returns Array of seconds delays, one per move.
	 */
	private calculateReplayTimeouts(history: Move[]): number[] {
		const timeOuts: number[] = [];
		this.clockHistory = [];

		// Get comments and header to parse clocks
		const comments = this.chess.getComments();
		const header = this.chess.header();

		// Try to parse time control
		let timeControlSeconds = 0;
		if (header.TimeControl) {
			const tc = header.TimeControl.split('+');
			timeControlSeconds = parseInt(tc[0], 10);
		}

		// Initialize clocks
		let whiteTime = timeControlSeconds;
		let blackTime = timeControlSeconds;

		// If we have clock comments, use them as source of truth
		// Check first few moves for clock comments
		let hasClockComments = false;
		for (let i = 0; i < Math.min(history.length, 10); i++) {
			const _comment = comments.find(
				(c) => c.fen === history[i].after || c.fen === history[i].before,
			); // Approximate check
			// Actually chess.js getComments returns array of objects with fen and comment.
			// We need to match moves to comments.
			// A simpler way is to iterate moves and get comments for the position.
		}

		// Re-simulate game to extract clocks correctly
		const tempChess = new Chess();
		// Use the raw PGN input to ensure we have comments
		tempChess.loadPgn(this.pgnInput());
		const moves = tempChess.history({ verbose: true });
		const moveComments = tempChess.getComments();

		// Map FEN to comment for easier lookup
		const fenToComment = new Map<string, string>();
		moveComments.forEach((c) => {
			fenToComment.set(c.fen, c.comment);
		});

		// Initial clock state
		this.clockHistory.push({ white: whiteTime, black: blackTime });

		// Calculate think times
		const thinkTimes: number[] = [];

		for (let i = 0; i < moves.length; i++) {
			const move = moves[i];
			const isWhite = move.color === 'w';
			// chess.js attaches comments to the position AFTER the move
			const comment = fenToComment.get(move.after);

			let moveTime = 0;

			if (comment) {
				// Try to parse %clk
				// Matches: [%clk 0:03:02] or [%clk 03:02] or [%clk 3:02]
				const clkMatch = comment.match(/%clk\s+(?:(\d+):)?(\d+):(\d+)/);
				if (clkMatch) {
					hasClockComments = true;
					let h = 0,
						m = 0,
						s = 0;

					if (clkMatch[1]) {
						h = parseInt(clkMatch[1], 10);
					}
					m = parseInt(clkMatch[2], 10);
					s = parseInt(clkMatch[3], 10);

					const timeInSeconds = h * 3600 + m * 60 + s;

					if (isWhite) {
						moveTime = Math.max(0.1, whiteTime - timeInSeconds);
						whiteTime = timeInSeconds;
					} else {
						moveTime = Math.max(0.1, blackTime - timeInSeconds);
						blackTime = timeInSeconds;
					}
				}
			}

			// Fallback if no clock comment or parsing failed
			if (moveTime === 0 && !hasClockComments) {
				moveTime = this.fixedTime(); // Default to fixed time setting
			} else if (moveTime === 0 && hasClockComments) {
				// If we have clock comments generally but missed this one, assume small time
				moveTime = 1;
			}

			thinkTimes.push(moveTime);
			this.clockHistory.push({ white: whiteTime, black: blackTime });
		}

		// If no clock comments found at all, clear clock history so we don't show empty clocks
		if (!hasClockComments) {
			this.clockHistory = [];
			this.whiteTimeRemaining.set('');
			this.blackTimeRemaining.set('');
		} else {
			// Set initial clocks for display
			if (this.clockHistory.length > 0) {
				this.whiteTimeRemaining.set(
					this.formatTime(this.clockHistory[0].white),
				);
				this.blackTimeRemaining.set(
					this.formatTime(this.clockHistory[0].black),
				);
			}
		}

		if (this.replayMode() === 'fixed') {
			for (let i = 0; i < history.length; i++) {
				timeOuts.push((i + 1) * this.fixedTime());
			}
			return timeOuts;
		}

		if (this.replayMode() === 'realtime') {
			let totalTime = 0;
			for (let i = 0; i < thinkTimes.length; i++) {
				totalTime += thinkTimes[i];
				timeOuts.push(totalTime);
			}
			return timeOuts;
		}

		if (this.replayMode() === 'proportional') {
			// Calculate total game duration
			const totalGameDuration = thinkTimes.reduce((a, b) => a + b, 0);
			const targetDurationSeconds = this.proportionalDuration() * 60;
			const scaleFactor =
				totalGameDuration > 0 ? targetDurationSeconds / totalGameDuration : 1;
			const minSeconds = this.minSecondsBetweenMoves();

			let currentScaledTime = 0;
			for (let i = 0; i < thinkTimes.length; i++) {
				let scaledMoveTime = thinkTimes[i] * scaleFactor;
				if (scaledMoveTime < minSeconds) {
					scaledMoveTime = minSeconds;
				}
				currentScaledTime += scaledMoveTime;
				timeOuts.push(currentScaledTime);
			}
			return timeOuts;
		}

		// Fallback
		for (let i = 0; i < history.length; i++) {
			timeOuts.push((i + 1) * 1);
		}

		return timeOuts;
	}

	/**
	 * Formats a duration in seconds as a clock display string.
	 *
	 * @param seconds — Duration in seconds.
	 * @returns Formatted string: `"h:mm:ss"` or `"m:ss"`.
	 */
	private formatTime(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);

		if (h > 0) {
			return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} `;
		}
		return `${m}:${s.toString().padStart(2, '0')} `;
	}

	/**
	 * Parses a `[%eval ...]` PGN comment value into a numeric score.
	 *
	 * Mate scores (`#3`, `#-2`) are converted to large values near ±20.
	 * Centipawn scores are parsed as floats.
	 *
	 * @param evalStr — Raw evaluation string, or `null`.
	 * @returns Numeric evaluation score, or `null` if unparseable.
	 */
	private parseEval(evalStr: string | null): number | null {
		if (!evalStr) return null;
		if (evalStr.startsWith('#')) {
			const val = parseInt(evalStr.substring(1), 10);
			return val > 0 ? 20 + 10 / Math.abs(val) : -(20 + 10 / Math.abs(val));
		}
		return parseFloat(evalStr);
	}

	/**
	 * Schedules timed callbacks to auto-play moves during replay.
	 *
	 * Uses the selected replay mode timing, handles the "stop on error" feature
	 * (pauses when evaluation change exceeds {@link stopOnErrorThreshold}),
	 * and calls the optional `onComplete` callback after the last move.
	 *
	 * @param timeOuts — Per-move delays in seconds.
	 * @param totalMoves — Total number of moves in the game.
	 * @param onComplete — Optional callback when replay finishes.
	 */
	private scheduleReplay(
		timeOuts: number[],
		totalMoves: number,
		onComplete?: () => void,
	) {
		const _totalGameTime = timeOuts[timeOuts.length - 1] || 1;
		this.isReplaying.set(true);
		this.showBetterMoveBtn.set(false);
		this.analysisVisible.set(false);
		this.bestMoveInfo.set(null);

		const startMoveIndex = this.currentMoveIndex() + 1; // Start from next move

		if (startMoveIndex >= totalMoves) {
			this.isReplaying.set(false);
			if (onComplete) onComplete();
			return;
		}

		const startTime = startMoveIndex > 0 ? timeOuts[startMoveIndex - 1] : 0;

		for (let i = startMoveIndex; i < totalMoves; i++) {
			let delay = 0;
			if (
				this.replayMode() === 'fixed' ||
				this.replayMode() === 'realtime' ||
				this.replayMode() === 'proportional'
			) {
				// Calculate relative delay from "now" (which corresponds to startTime in the game)
				delay = (timeOuts[i] - startTime) * 1000;
			} else {
				// Fallback
				delay = (i - startMoveIndex + 1) * 1000;
			}

			// Ensure non-negative delay
			delay = Math.max(0, delay);

			const isLast = i === totalMoves - 1;
			const timeoutId = setTimeout(() => {
				this.next();

				// Stop on Error Check
				if (this.stopOnError()) {
					const currentIdx = this.currentMoveIndex();
					const evals = this.evaluations();
					if (currentIdx > 0 && currentIdx < evals.length) {
						const currentEval = this.parseEval(evals[currentIdx]);
						const prevEval = this.parseEval(evals[currentIdx - 1]);

						if (currentEval !== null && prevEval !== null) {
							// If diff > threshold
							if (
								Math.abs(currentEval - prevEval) > this.stopOnErrorThreshold()
							) {
								this.stopReplay(false);

								const prevFen = this.getFenBeforeMove(currentIdx);
								if (prevFen) {
									this.showBetterMoveBtn.set(true);
									this.analyzePosition(prevFen);
								}
							}
						}
					}
				}

				if (isLast && onComplete && this.isReplaying()) {
					// Give a small buffer for the last animation
					const completionTimeoutId = this.setDeferredTimeout(() => {
						// Only call onComplete if we didn't stop manually (check isReplaying?)
						// stopReplay() sets isReplaying to false.
						// If we stopped on error, we don't proceed to next game in sequence.
						if (onComplete) onComplete();
					}, 500);
					this.replayTimeouts.push(completionTimeoutId);
				}
			}, delay);
			this.replayTimeouts.push(timeoutId);
		}
	}

	/**
	 * Returns the FEN string representing the position before a given move.
	 *
	 * Used by the "stop on error" feature to determine the position where
	 * a large evaluation swing occurred.
	 *
	 * @param moveIndex — The 0-based move index. Returns the FEN before this move.
	 * @returns FEN string, or `null` on error.
	 */
	private getFenBeforeMove(moveIndex: number): string | null {
		try {
			const tempChess = new Chess();
			tempChess.loadPgn(this.pgnInput());
			// Navigate to moveIndex - 1
			// history returns array of moves.
			const moves = tempChess.history();
			tempChess.reset();
			for (let i = 0; i < moveIndex; i++) {
				tempChess.move(moves[i]);
			}
			return tempChess.fen();
		} catch (e) {
			console.error('Error generating previous FEN', e);
			return null;
		}
	}
}