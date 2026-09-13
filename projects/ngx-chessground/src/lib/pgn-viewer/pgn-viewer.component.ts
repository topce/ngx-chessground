import {
	booleanAttribute,
	Component,
	computed,
	type ElementRef,
	effect,
	inject,
	input,
	linkedSignal,
	model,
	type OnDestroy,
	output,
	signal,
	viewChild,
} from '@angular/core';
import { Chess, type Move, type Piece, type Square } from 'chess.js';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import { Key } from 'chessground/types';
import { parsePgn } from 'chessops/pgn';
import { decompress as decompressZst } from 'fzstd';
import { loadAsync as loadZipAsync } from 'jszip';

import { PromotionService } from '../promotion-dialog/promotion.service';
import { BoardDisplayComponent } from './board/board-display.component';
import { isDesktopRuntime } from './desktop-runtime';
import { ECO_MOVES } from './eco-moves';
import { GameFilterPanelComponent } from './filter/game-filter-panel.component';
import {
	lichessBroadcastUrl,
	resolveBroadcastUrl,
} from './lichess-broadcast-url'; // Sub-components
import { LoadCachePanelComponent } from './load-cache/load-cache-panel.component';
import { MoveListComponent } from './moves/move-list.component';
import { PgnCacheService, type PgnSourceCacheEntry } from './pgn-cache.service';
import type {
	FilterCriteria,
	GameMetadata,
	WorkerResponse,
} from './pgn-processor.worker';
import type {
	BestMoveInfo,
	LoadOptions,
	PgnSource,
	PgnViewerError,
	PgnViewerErrorCode,
	PracticeMove,
	StopOnErrorSide,
} from './pgn-viewer.types';
import { PgnViewerEngineService } from './pgn-viewer-engine.service';
import {
	PGN_VIEWER_NOTIFIER,
	type PgnViewerNoticeLevel,
} from './pgn-viewer-notifier';
import {
	type PersistedFilterState,
	type PersistedViewerState,
	PGN_VIEWER_STATE_VERSION,
	PgnViewerSettingsService,
} from './pgn-viewer-settings.service';
import { PracticePanelComponent } from './practice/practice-panel.component';
import { ReplayPanelComponent } from './replay/replay-panel.component';
import { highlightMatch, type TextSegment } from './text-highlight';

/**
 * Container for the full-featured PGN viewer application.
 *
 * Owns all state signals and business logic, delegating rendering to
 * focused presentational sub-components:
 * - {@link GameFilterPanelComponent} — left sidebar filters
 * - {@link BoardDisplayComponent} — center board area
 * - {@link MoveListComponent} — right panel move list
 * - {@link ReplayPanelComponent} — right panel replay controls
 * - {@link LoadCachePanelComponent} — right panel load & cache
 *
 * @example
 * ```html
 * <ngx-pgn-viewer [pgn]="pgnString" [highlightLastMove]="true" />
 * ```
 */
@Component({
	selector: 'ngx-pgn-viewer',
	imports: [
		GameFilterPanelComponent,
		BoardDisplayComponent,
		MoveListComponent,
		ReplayPanelComponent,
		LoadCachePanelComponent,
		PracticePanelComponent,
	],
	templateUrl: './pgn-viewer.component.html',
	styleUrl: './pgn-viewer.component.css',
})
export class NgxPgnViewerComponent implements OnDestroy {
	/** Owns the PGN worker and the Stockfish worker. */
	private readonly pgnViewerEngine = inject(PgnViewerEngineService);
	/** Sink for user-facing messages; defaults to the console. */
	private readonly notifier = inject(PGN_VIEWER_NOTIFIER);
	/** Parsed-game cache and URL → hash bookmarks. */
	private readonly pgnCacheService = inject(PgnCacheService);
	/** Opens the pawn-promotion dialog during interactive play. */
	private readonly promotionService = inject(PromotionService);
	/** Persists and restores the filter selection and data source. */
	private readonly pgnViewerSettings = inject(PgnViewerSettingsService);

	// ======================================================================
	// Inputs
	// ======================================================================

	/** PGN text to load. Changing it (non-empty) starts a load. */
	pgn = input<string>('');
	/** Whether to highlight the origin and destination of the last move. */
	highlightLastMove = input(true, { transform: booleanAttribute });
	/** Board orientation; `true` puts Black at the bottom (two-way). */
	flipped = model<boolean>(false);
	/** Whether to render 3D Staunton pieces (two-way). */
	in3d = model<boolean>(false);
	/** Width of the left filter panel in pixels (two-way). */
	leftPanelWidth = model<number>(340);
	/** Width of the right panel in pixels (two-way). */
	rightPanelWidth = model<number>(340);
	/** Whether the move-list panel is expanded (two-way). */
	movesExpanded = model<boolean>(true);

	// ======================================================================
	// Outputs
	// ======================================================================

	/**
	 * Emitted once when durable state has been restored.
	 *
	 * Hosts that need to read `urlInput`/`restoredStateFromStorage` at startup
	 * can `await whenStateReady()` instead; this output exists for hosts that
	 * prefer the reactive form.
	 */
	readonly stateRestored = output<void>();

	/**
	 * Emitted when a load starts, carrying the initial status text.
	 *
	 * Load progress afterwards is reported through `loadProgress`.
	 */
	readonly loadStarted = output<{ status: string }>();

	/** Emitted whenever load progress advances. */
	readonly loadProgress = output<{
		percent: number;
		status: string;
	}>();

	/**
	 * Emitted for every load failure, in addition to the user-facing notice.
	 *
	 * This is the single place a host needs to handle to surface load errors
	 * programmatically (telemetry, retry UI, a custom banner).
	 */
	readonly loadFailed = output<PgnViewerError>();

	// ======================================================================
	// State Signals
	// ======================================================================

	/** Parsed metadata for every game in the loaded collection. */
	gamesMetadata = signal<GameMetadata[]>([]);
	/** Index of the game currently loaded into the board. */
	currentGameIndex = signal<number>(0);
	/** SAN moves of the loaded game. */
	moves = signal<string[]>([]);
	/** Zero-based index of the displayed move; `-1` is the start position. */
	currentMoveIndex = signal<number>(-1);
	/** FEN of the position currently displayed on the board. */
	currentFen = signal<string>(
		'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
	);
	/** Whether a load or parse is in progress. */
	isLoading = signal<boolean>(false);
	/** Load progress, 0-100. */
	loadingProgress = signal<number>(0);
	/** Human-readable description of the current load step. */
	loadingStatus = signal<string>('');
	/** Content hash of the PGN being loaded, used for cache bookkeeping. */
	lastPgnHash: string | null = null;
	/** Indices of the games selected for batch operations. */
	selectedGames = signal<Set<number>>(new Set());

	// ---- Filter Signals ----
	/** White-player name filter. */
	filterWhite = signal<string>('');
	/** Black-player name filter. */
	filterBlack = signal<string>('');
	/** Selected results; empty means no result filter. */
	filterResult = signal<string[]>([]);
	/** Whether the opening-move prefix filter is active. */
	filterMoves = signal<boolean>(false);
	/** Whether player names match either colour. */
	ignoreColor = signal<boolean>(false);
	/** Whether upset filtering is enabled. */
	filterUpsetEnabled = signal<boolean>(false);
	/** Include upsets won by the lower-rated player. */
	filterUpsetWin = signal<boolean>(false);
	/** Include upsets drawn by the lower-rated player. */
	filterUpsetDraw = signal<boolean>(false);
	/** Minimum Elo gap between players for a game to count as an upset. */
	filterUpsetMinDiff = signal<string>('300');
	/** Whether rating-range filtering is enabled. */
	filterRatingEnabled = signal<boolean>(false);
	/** Lower bound of the White rating range, as entered. */
	filterWhiteRating = signal<string>('2000');
	/** Lower bound of the Black rating range, as entered. */
	filterBlackRating = signal<string>('2000');
	/** Upper bound of the White rating range, as entered. */
	filterWhiteRatingMax = signal<string>('2900');
	/** Upper bound of the Black rating range, as entered. */
	filterBlackRatingMax = signal<string>('2900');
	/** Selected ECO code, or `''`. */
	filterEco = signal<string>('');
	/** Selected time-control keys; empty means no filter. */
	filterTimeControl = signal<string[]>([]);
	/** Selected event name, or `''`. */
	filterEvent = signal<string>('');
	/** Selected broadcast name, or `''`. */
	filterBroadcastName = signal<string>('');
	/** Target position for FEN filtering. */
	filterFen = signal<string>('');
	/** Whether position (FEN) filtering is active. */
	filterByFenEnabled = signal<boolean>(false);
	/**
	 * Whether to build a starting-position FEN index.
	 *
	 * Defaults to `true` in the packaged desktop app, which has the resources
	 * to index every game, and `false` on the web unless the user opts in.
	 */
	indexStartPositions = signal<boolean>(isDesktopRuntime());
	/** Max half-moves replayed per game when building the FEN index. */
	maxFenPlies = signal<number>(30);
	/** Whether the game list is sorted oldest-first. */
	sortAscending = signal<boolean>(false);

	/** Distinct White player names in the loaded collection. */
	uniqueWhitePlayers = signal<string[]>([]);
	/** Distinct Black player names in the loaded collection. */
	uniqueBlackPlayers = signal<string[]>([]);
	/** ECO code → game count, for the ECO dropdown. */
	uniqueEcoCodes = signal<Map<string, number>>(new Map());
	/** Time-control key → game count and original time-control strings. */
	uniqueTimeControls = signal<
		Map<string, { count: number; originals: Map<string, number> }>
	>(new Map());
	/** Event name → game count. */
	uniqueEvents = signal<Map<string, number>>(new Map());
	/** Broadcast name → game count. */
	uniqueBroadcastNames = signal<Map<string, number>>(new Map());

	/** Indices of the games matching the active filters. */
	filteredGamesIndices = signal<number[]>([]);
	/** Whether a filter request is in flight. */
	isFiltering = signal<boolean>(false);
	/** Whether the full filtered list is shown instead of the limited page. */
	showAllGames = signal<boolean>(false);

	/** ECO codes with counts, most frequent first. */
	sortedEcoCodes = computed(() =>
		Array.from(this.uniqueEcoCodes().entries())
			.sort((a, b) => b[1] - a[1])
			.map(([code, count]) => ({ code, count })),
	);

	/** Time controls with counts and display labels, most frequent first. */
	sortedTimeControls = computed(() =>
		Array.from(this.uniqueTimeControls().entries())
			.sort((a, b) => b[1].count - a[1].count)
			.map(([key, data]) => ({
				key,
				count: data.count,
				label: this.formatTimeControlKey(key),
				originalsSummary: this.formatOriginalsSummary(data.originals),
			})),
	);

	/** Event names with counts, most frequent first. */
	sortedEvents = computed(() =>
		Array.from(this.uniqueEvents().entries())
			.sort((a, b) => b[1] - a[1])
			.map(([event, count]) => ({ event, count })),
	);

	/** Broadcast names with counts, most frequent first. */
	sortedBroadcastNames = computed(() =>
		Array.from(this.uniqueBroadcastNames().entries())
			.sort((a, b) => b[1] - a[1])
			.map(([broadcastName, count]) => ({ broadcastName, count })),
	);

	/**
	 * Metadata rows the filter panel's game list should show.
	 *
	 * While games are explicitly selected the list collapses to the current
	 * game only, so the selection stays stable; otherwise it shows the first
	 * match, or every match once `showAllGames` is set.
	 */
	filteredGameInfos = computed(() => {
		const metadata = this.gamesMetadata();
		const allIndices = this.filteredGamesIndices();
		if (this.selectedGamesCount() > 0) {
			const currentIdx = this.currentGameIndex();
			if (currentIdx >= 0 && currentIdx < metadata.length) {
				return [metadata[currentIdx]];
			}
			return [];
		}
		const limit = this.showAllGames() ? allIndices.length : 1;
		return allIndices.slice(0, limit).map((i) => metadata[i]);
	});

	/** Number of games matching the active filters. */
	totalFilteredCount = computed(() => this.filteredGamesIndices().length);
	/** Number of games explicitly selected. */
	selectedGamesCount = computed(() => this.selectedGames().size);
	/** Whether batch replay should be offered: several games, some selected. */
	canShowReplayAll = computed(
		() => this.gamesMetadata().length > 1 && this.selectedGamesCount() > 0,
	);

	/** Position of the loaded game within the collection, e.g. `"Game 2 of 40"`. */
	currentGameInfo = computed(
		() =>
			`Game ${this.currentGameIndex() + 1} of ${this.gamesMetadata().length} `,
	);

	/** White player of the loaded game, or `'Unknown'` when unavailable. */
	currentWhitePlayer = computed(() => {
		const metadata = this.gamesMetadata();
		const i = this.currentGameIndex();
		return metadata.length > 0 && i >= 0 && i < metadata.length
			? metadata[i].white
			: 'Unknown';
	});

	/** Black player of the loaded game, or `'Unknown'` when unavailable. */
	currentBlackPlayer = computed(() => {
		const metadata = this.gamesMetadata();
		const i = this.currentGameIndex();
		return metadata.length > 0 && i >= 0 && i < metadata.length
			? metadata[i].black
			: 'Unknown';
	});

	/** Result of the loaded game, or `'*'` when unavailable. */
	currentGameResult = computed(() => {
		const metadata = this.gamesMetadata();
		const i = this.currentGameIndex();
		return metadata.length > 0 && i >= 0 && i < metadata.length
			? metadata[i].result
			: '*';
	});

	// ---- Flipped board helpers ----
	/** Player name for the row above the board, honouring orientation. */
	topPlayerName = computed(() =>
		this.flipped() ? this.currentWhitePlayer() : this.currentBlackPlayer(),
	);
	/** Player name for the row below the board, honouring orientation. */
	bottomPlayerName = computed(() =>
		this.flipped() ? this.currentBlackPlayer() : this.currentWhitePlayer(),
	);
	/** Turn-indicator CSS class for the top row. */
	topPlayerTurnClass = computed(() =>
		this.flipped() ? 'white-turn' : 'black-turn',
	);
	/** Turn-indicator CSS class for the bottom row. */
	bottomPlayerTurnClass = computed(() =>
		this.flipped() ? 'black-turn' : 'white-turn',
	);
	/** Piece colour for the top row, honouring orientation. */
	topPlayerActiveColor = computed(() => (this.flipped() ? 'w' : 'b'));
	/** Piece colour for the bottom row, honouring orientation. */
	bottomPlayerActiveColor = computed(() => (this.flipped() ? 'b' : 'w'));
	/** Tooltip for the top row, naming the side that moves next. */
	topPlayerTitle = computed(() =>
		this.flipped() ? 'White to move' : 'Black to move',
	);
	/** Tooltip for the bottom row, naming the side that moves next. */
	bottomPlayerTitle = computed(() =>
		this.flipped() ? 'Black to move' : 'White to move',
	);
	/** Remaining time shown beside the top player. */
	topTimeRemaining = computed(() =>
		this.flipped() ? this.whiteTimeRemaining() : this.blackTimeRemaining(),
	);
	/** Remaining time shown beside the bottom player. */
	bottomTimeRemaining = computed(() =>
		this.flipped() ? this.blackTimeRemaining() : this.whiteTimeRemaining(),
	);

	/**
	 * Origin and destination of the move to highlight, or `undefined`.
	 *
	 * Reads `currentMoveIndex`/`currentFen` so the highlight is recomputed on
	 * every position change even though it is derived from chess.js history.
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

	/** Side to move, parsed from the displayed FEN. */
	activeColor = computed(() => {
		const parts = this.currentFen().split(' ');
		return parts.length > 1 ? parts[1] : 'w';
	});

	// ---- Replay signals ----
	/** Active replay timing mode. */
	replayMode = signal<'realtime' | 'proportional' | 'fixed' | 'fast'>('fixed');
	/** Target duration in seconds for `proportional` replay. */
	proportionalDuration = signal<number>(1);
	/** Minimum seconds between moves in `realtime` replay. */
	minSecondsBetweenMoves = signal<number>(1);
	/** Seconds per move in `fixed` replay. */
	fixedTime = signal<number>(1);
	/** Seconds per move in `fast` replay. */
	fastTime = signal<number>(0.3);
	/** Whether replay halts on a significant evaluation drop. */
	stopOnError = signal<boolean>(false);
	/** Evaluation drop, in pawns, that counts as an error. */
	stopOnErrorThreshold = signal<number>(1.0);
	/** Which side's errors trigger "stop on error": 'both' | 'white' | 'black'. */
	stopOnErrorSide = signal<StopOnErrorSide>('both');
	/** Whether an auto-replay is currently running. */
	isReplaying = signal<boolean>(false);
	/** Whether a paused replay can be resumed from the current position. */
	canContinueReplay = computed(
		() =>
			!this.isReplaying() && this.currentMoveIndex() < this.moves().length - 1,
	);
	/** Whether the replay has reached the final move of the game. */
	isEndOfReplay = computed(
		() =>
			this.isReplaying() &&
			this.currentMoveIndex() >= 0 &&
			this.moves().length > 0 &&
			this.currentMoveIndex() >= this.moves().length - 1,
	);

	// ---- Clock signals ----
	/** Formatted remaining time for White, or `''` when the PGN has no clocks. */
	whiteTimeRemaining = signal<string>('');
	/** Formatted remaining time for Black, or `''` when the PGN has no clocks. */
	blackTimeRemaining = signal<string>('');
	/** Clock string per half-move, aligned with `moves`. */
	moveClocks = signal<string[]>([]);
	/** Whether the PGN carried clock data, so clock UI should be shown. */
	showClocks = computed(
		() => this.whiteTimeRemaining() !== '' || this.blackTimeRemaining() !== '',
	);

	// ---- Stockfish signals ----
	/** Whether Stockfish is analyzing the displayed position. */
	isAnalyzing = signal<boolean>(false);
	/** All PV lines collected from the current analysis (sorted by MultiPV rank). */
	allAlternatives = signal<BestMoveInfo[]>([]);
	/** Index into allAlternatives indicating which line is currently displayed. */
	currentAlternativeIndex = signal<number>(0);
	/** Computed: currently displayed best move info (cycles through alternatives). */
	readonly bestMoveInfo = computed<BestMoveInfo | null>(() => {
		const alts = this.allAlternatives();
		const idx = this.currentAlternativeIndex();
		return idx >= 0 && idx < alts.length ? alts[idx] : null;
	});
	/** Whether the "show better move" button should be offered. */
	showBetterMoveBtn = signal<boolean>(false);
	/** Whether the analysis panel is expanded. */
	analysisVisible = signal<boolean>(false);
	/** Stockfish search depth requested for the next analysis. */
	stockfishDepth = signal<number>(18);
	/** True after autoplayBestLine completes — enables the re-evaluate button. */
	autoplayCompleted = signal<boolean>(false);

	// ---- Practice mode signals ----
	/** Whether practice mode (turn-based play + continuous analysis) is active. */
	practiceMode = signal<boolean>(false);
	/** FEN of the position where the current practice session started. */
	practiceStartFen = signal<string>('');
	/** Moves played during the practice session, with engine evaluations. */
	practiceMoves = signal<PracticeMove[]>([]);
	/** Stockfish evaluation of the current practice position (White's perspective). */
	practiceEvaluation = signal<string | null>(null);
	/** FEN currently being analyzed by Stockfish in practice mode (guards stale results). */
	private practiceAnalysisFen: string | null = null;
	/**
	 * Live chessground API of the mounted board, captured by {@link runFunction}.
	 * Used to push the committed position (FEN + legal move destinations) to the
	 * board synchronously after a user move, so drag & drop stays responsive
	 * even while Angular change detection has not flushed yet.
	 */
	private boardApi: Api | null = null;
	/**
	 * Incremented whenever the board must be force-synchronized to the internal
	 * chess.js position, even when the FEN string itself did not change (e.g.
	 * after a rejected move that chessground already rendered). Tracked by
	 * {@link boardConfig} to guarantee a fresh config is always pushed.
	 */
	private boardSyncTick = signal(0);

	/** Whether the "Analyze practice" button should be offered (game not replaying). */
	practiceAvailable = computed(() => !this.isReplaying());
	/** Evaluation shown on the evaluation bar: practice eval while practicing. */
	boardEvaluation = computed(() =>
		this.practiceMode() ? this.practiceEvaluation() : this.currentEvaluation(),
	);
	/** Game result of the current practice position, or null while ongoing. */
	practiceResult = computed<string | null>(() => {
		if (!this.practiceMode()) return null;
		try {
			const c = new Chess(this.currentFen());
			if (c.isCheckmate()) return c.turn() === 'w' ? '0-1' : '1-0';
			if (c.isStalemate() || c.isDraw()) return '1/2-1/2';
		} catch {
			/* ignore invalid positions */
		}
		return null;
	});
	/** Game result displayed under the board (practice result while practicing). */
	displayGameResult = computed(() =>
		this.practiceMode()
			? (this.practiceResult() ?? '*')
			: this.currentGameResult(),
	);

	/** Evaluation string per half-move, aligned with `moves`; `null` when unknown. */
	evaluations = signal<(string | null)[]>([]);
	/** Evaluation of the displayed move, or `null` before the first move. */
	currentEvaluation = computed(() => {
		const evals = this.evaluations();
		const index = this.currentMoveIndex();
		return index >= 0 && index < evals.length ? evals[index] : null;
	});

	/** Cached-entry count and estimated size, or `null` while unknown. */
	cacheInfo = signal<{ count: number; estimatedBytes: number } | null>(null);
	/** PGN text shown in the load panel's textarea. */
	pgnInput = signal<string>('');
	/** Lichess archive year selected in the load panel (two-way). */
	lichessYear = model<number>(new Date().getFullYear());
	/** Lichess archive month selected in the load panel (two-way). */
	lichessMonth = model<number>(1);
	/**
	 * PGN source URL shown in the load panel.
	 *
	 * Derived from the Lichess year/month picker, but writable so a user can
	 * type or restore a custom URL — which is then preserved across later
	 * picker changes. A `linkedSignal` (rather than an `effect` + flag) keeps
	 * the derivation declarative and drops the mutable "already synced"
	 * bookkeeping.
	 */
	urlInput = linkedSignal<{ year: number; month: number }, string>({
		source: () => ({ year: this.lichessYear(), month: this.lichessMonth() }),
		computation: (next, previous) => resolveBroadcastUrl(next, previous?.value),
	});

	// Panel resize state
	/** Panel currently being dragged, or `null` when no drag is in progress. */
	private resizing: 'left' | 'right' | null = null;
	/** Pending animation frame for a panel drag, so moves are coalesced. */
	private resizeRafId: number | null = null;
	/** The element that establishes the panel widths; used to clamp resizing. */
	private readonly mainContentRef =
		viewChild<ElementRef<HTMLElement>>('mainContent');

	// ---- Internal state ----
	/** Authoritative game state; the board is rendered from this instance. */
	private chess = new Chess();
	/** Timers scheduled for the current replay sequence, cleared on stop. */
	private replayTimeouts: ReturnType<typeof setTimeout>[] = [];
	/** Resolver of the promise a batch replay is awaiting, or `null`. */
	private replayResolve: (() => void) | null = null;
	/** Whether a multi-game (batch) replay is in progress. */
	private isReplayingSequence = false;
	/** Correlation id of the newest filter request; stale replies are dropped. */
	private currentFilterId = 0;
	/** Correlation id of the newest `loadGame` request; stale replies are dropped. */
	private currentLoadGameId = 0;
	/** Whether the next filter result should replace the game selection. */
	private autoSelectOnFinish = false;
	/** Move prefix the active filter was applied with, replayed after a load. */
	private activeFilterMoves: string[] = [];
	/** Move index to restore when a position filter is cleared, or `null`. */
	private savedGameMoveIndex: number | null = null;
	/** Moves the user played on the board while composing a position filter. */
	private interactiveMoves = signal<string[]>([]);
	/** Pending request to turn off the opening-move filter after a load. */
	private shouldUncheckFilterMoves = false;
	/** Clock readings parsed from the PGN, one entry per half-move. */
	private clockHistory: { white: number; black: number }[] = [];
	/** Every timer this component owns, drained on destroy. */
	private readonly pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
	/**
	 * Handle of an in-flight `requestIdleCallback` (filter-list aggregation),
	 * cancelled on destroy so it cannot write to signals of a dead component.
	 */
	private pendingIdleCallback: number | null = null;

	// ---- Persisted state ----
	/** State restored from a previous session, or `null` for a fresh session. */
	private persistedState: PersistedViewerState | null = null;
	/**
	 * `false` until the durable state has been read. While it is `false` the
	 * persist effect stays quiet, so the defaults cannot overwrite the saved
	 * state before the desktop store has been hydrated.
	 */
	private readonly stateHydrated = signal(false);
	/** Resolves once the durable state has been loaded. */
	private stateReady: Promise<void> = Promise.resolve();

	/**
	 * Resolves once the persisted filter selection, Lichess source and cache
	 * bookmarks are available.
	 *
	 * In the browser this is already the case when the component is created.
	 * In the packaged desktop app the state is fetched from the local server,
	 * so hosts should await this before loading data — otherwise the restored
	 * archive URL is not known yet.
	 */
	whenStateReady(): Promise<void> {
		return this.stateReady;
	}

	// ---- Cached-source fast path ----
	/**
	 * Source URL whose `loadFromCache` request is in flight. When the worker
	 * answers `'cacheMiss'`, the download is started for this URL.
	 */
	private pendingCacheSourceUrl: string | null = null;
	/** Correlation id of the in-flight `loadFromCache` request. */
	private currentCacheLoadId = 0;

	/**
	 * `true` when a previous session's viewer state was restored on startup.
	 * Hosts can use this to reload the same data source before the persisted
	 * filters are applied.
	 */
	get restoredStateFromStorage(): boolean {
		return this.persistedState !== null;
	}

	// ======================================================================
	// Computed — Run function for chessground
	// ======================================================================

	/**
	 * Stable board factory: created once and never re-created afterwards, so the
	 * Chessground instance is never torn down on position changes. All state
	 * updates (fen, orientation, movable pieces, highlights) flow through the
	 * {@link boardConfig} input instead, which reconfigures the live instance
	 * in place — keeping drag & drop responsive and animations intact.
	 */
	runFunction = computed<(el: HTMLElement) => Api>(() => {
		// Signal reads inside the returned closure are untracked by this
		// computed (they execute when the function is invoked), so the closure
		// identity stays stable across every position change.
		return (el: HTMLElement) => {
			const api = Chessground(el, {
				fen: this.currentFen(),
				orientation: this.flipped() ? 'black' : 'white',
			});
			// Stash the live API so practice moves can push the committed
			// position synchronously (see pushBoardNow) without waiting for
			// Angular's change-detection round trip.
			this.boardApi = api;
			return api;
		};
	});

	/**
	 * Complete board state passed to the board component and applied to the
	 * live Chessground instance via `Api.set()` on every change.
	 */
	boardConfig = computed<Partial<Config>>(() => {
		// Force-sync requests: tracking this signal guarantees a fresh config
		// object is pushed to the board even when the FEN is unchanged, so the
		// board can always be snapped back to the chess.js position.
		this.boardSyncTick();
		const fen = this.currentFen();
		const practice = this.practiceMode();
		const isEditable = this.filterMoves() || practice;
		// Keep chessground's turnColor in sync with the FEN so check
		// highlighting and turn-dependent behavior (only the side to move is
		// draggable while filtering or practicing) follow the actual position.
		const fenParts = fen.split(' ');
		const turnColor = (fenParts[1] === 'w' ? 'white' : 'black') as
			| 'white'
			| 'black';
		// In practice mode the game ends at checkmate/stalemate: dragging and
		// click-moves are disabled so pieces cannot be picked up and dropped
		// back uselessly.
		const practiceOver = this.practiceMode() && this.practiceResult() !== null;
		// Derive check from the displayed FEN (the internal chess instance can
		// lag behind during PV previews / auto-played lines).
		let check = false;
		try {
			check = new Chess(fen).inCheck();
		} catch {
			/* ignore invalid positions */
		}
		return {
			fen,
			turnColor,
			orientation: this.flipped() ? 'black' : 'white',
			// NOTE: never set `viewOnly`. Chessground (re)binds its drag
			// listeners only inside `redrawAll()` — which an orientation flip
			// triggers — honoring the viewOnly value at that moment. Flipping
			// the board while in replay mode (viewOnly) would therefore drop
			// the listeners, and entering practice mode afterwards reconfigures
			// in place without re-binding them, leaving drag & drop dead until
			// the next flip. Gate interactivity through movable/draggable/
			// selectable instead, which are re-applied on every config push.
			lastMove: this.lastMoveSquares(),
			check,
			addPieceZIndex: this.in3d(),
			premovable: { enabled: false },
			draggable: { showGhost: true, enabled: isEditable && !practiceOver },
			selectable: { enabled: isEditable && !practiceOver },
			movable: {
				free: false,
				color: practice ? turnColor : isEditable ? 'both' : undefined,
				dests: isEditable ? this.getMovableDests() : undefined,
				showDests: isEditable,
				events: {
					after: (orig, dest) => {
						if (isEditable) this.handleBoardMove(orig, dest);
					},
				},
			},
		};
	});

	// ======================================================================
	// Construction
	// ======================================================================

	/**
	 * Wires the engine callbacks, restores the persisted session, and keeps the
	 * URL field and durable state in sync with the filters.
	 */
	constructor() {
		this.pgnViewerEngine.initialize({
			onPgnMessage: (data) => this.handleWorkerMessage(data),
			onStockfishMessage: (event) => this.handleStockfishMessage(event),
			onError: (message, error) =>
				this.reportLoadFailure('ENGINE_FAILED', message, error),
		});

		// Restore the previous session (filter selection + Lichess data source)
		// before defaults are applied, so a restart resumes where the user left off.
		// In the browser this is synchronous (localStorage); in the desktop app the
		// durable state lives on disk behind the local server, so `stateReady`
		// resolves once the snapshot has been fetched.
		const defaults = this.previousMonthDefaults();
		const persisted = this.pgnViewerSettings.load();
		if (persisted) {
			this.persistedState = persisted;
			this.applyPersistedState(persisted, defaults);
		} else {
			this.lichessYear.set(defaults.year);
			this.lichessMonth.set(defaults.month);
		}
		this.stateReady = this.hydratePersistedState(defaults);

		effect(() => {
			// Persist the selection on every change so exiting the application
			// never loses the applied filters or the loaded database. On desktop
			// the durable store is fetched asynchronously, so wait for hydration
			// first — otherwise the defaults would overwrite the saved state.
			const state = this.buildPersistedState();
			if (!this.stateHydrated()) return;
			this.pgnViewerSettings.save(state);
		});

		effect(() => {
			const pgn = this.pgn();
			if (pgn) this.loadPgnString(pgn);
		});
	}

	/** Releases timers, workers and DOM state owned by the viewer. */
	ngOnDestroy(): void {
		this.stopReplay();
		this.stopResize();
		this.pgnViewerEngine.dispose();
		for (const t of this.pendingTimeouts) clearTimeout(t);
		this.pendingTimeouts.clear();
		if (this.pendingIdleCallback !== null) {
			cancelIdleCallback(this.pendingIdleCallback);
			this.pendingIdleCallback = null;
		}
	}

	// ======================================================================
	// Public methods used by template
	// ======================================================================

	/** Flips the board orientation. */
	protected flipBoard(): void {
		this.flipped.update((v) => !v);
	}
	/** Toggles between flat SVG pieces and 3D Staunton pieces. */
	protected toggle3d(): void {
		this.in3d.update((v) => !v);
	}
	/** Begins a panel drag, locking the cursor for its duration. */
	protected startResize(side: 'left' | 'right', event: MouseEvent): void {
		event.preventDefault();
		this.resizing = side;
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
	}
	/** Applies a panel drag, clamped to 200px minimum and 45% of the container. */
	protected onResizeMove(event: MouseEvent): void {
		if (!this.resizing || this.resizeRafId !== null) return;
		const container = this.mainContentRef()?.nativeElement;
		if (!container) return;
		this.resizeRafId = requestAnimationFrame(() => {
			this.resizeRafId = null;
			const rect = container.getBoundingClientRect();
			const minW = 200;
			const maxW = Math.floor(rect.width * 0.45);
			if (this.resizing === 'left') {
				const w = Math.min(
					maxW,
					Math.max(minW, Math.round(event.clientX - rect.left)),
				);
				this.leftPanelWidth.set(w);
			} else {
				const w = Math.min(
					maxW,
					Math.max(minW, Math.round(rect.right - event.clientX)),
				);
				this.rightPanelWidth.set(w);
			}
		});
	}
	/** Ends a panel drag and restores the cursor and text selection. */
	protected stopResize(): void {
		this.resizing = null;
		if (this.resizeRafId !== null) {
			cancelAnimationFrame(this.resizeRafId);
			this.resizeRafId = null;
		}
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
	}

	// ---- Game navigation ----
	/** Requests the full move data for the game at `index` from the worker. */
	protected loadGame(index: number): void {
		const count = this.gamesMetadata().length;
		if (index >= 0 && index < count) {
			this.clearPracticeState();
			this.currentGameIndex.set(index);
			this.moves.set([]);
			this.evaluations.set([]);
			this.moveClocks.set([]);
			this.pgnInput.set('Loading...');
			this.isLoading.set(true);
			this.currentLoadGameId++;
			this.pgnViewerEngine.loadGame(index, this.currentLoadGameId);
		}
	}
	/** Moves to the next game in the current navigation order. */
	protected nextGame(): void {
		const nav = this.navigationIndices();
		const pos = nav.indexOf(this.currentGameIndex());
		if (pos >= 0 && pos < nav.length - 1) this.loadGame(nav[pos + 1]);
	}
	/** Moves to the previous game in the current navigation order. */
	protected prevGame(): void {
		const nav = this.navigationIndices();
		const pos = nav.indexOf(this.currentGameIndex());
		if (pos > 0) this.loadGame(nav[pos - 1]);
	}
	/** Game indices the prev/next controls step through (selection-aware). */
	private navigationIndices = computed(() => {
		const indices = this.filteredGamesIndices();
		const selected = this.selectedGames();
		return selected.size > 0 ? indices.filter((i) => selected.has(i)) : indices;
	});
	/** Whether a previous game exists in the current navigation order. */
	canGoPrev = computed(() => {
		const nav = this.navigationIndices();
		const pos = nav.indexOf(this.currentGameIndex());
		return pos > 0;
	});
	/** Whether a next game exists in the current navigation order. */
	canGoNext = computed(() => {
		const nav = this.navigationIndices();
		const pos = nav.indexOf(this.currentGameIndex());
		return pos >= 0 && pos < nav.length - 1;
	});

	// ---- Move navigation ----
	/** Replays the game from the start up to `index`; `-1` is the start position. */
	protected jumpToMove(index: number): void {
		this.exitPractice();
		const moves = this.moves();
		if (index >= -1 && index < moves.length) {
			this.chess.reset();
			for (let i = 0; i <= index; i++) this.chess.move(moves[i]);
			this.currentMoveIndex.set(index);
			this.currentFen.set(this.chess.fen());
			const clockIndex = index + 1;
			if (clockIndex >= 0 && clockIndex < this.clockHistory.length) {
				const c = this.clockHistory[clockIndex];
				this.whiteTimeRemaining.set(this.formatTime(c.white));
				this.blackTimeRemaining.set(this.formatTime(c.black));
			}
		}
	}
	/** Advances one move, no-op in practice mode. */
	protected next(): void {
		if (this.practiceMode()) return;
		const moves = this.moves();
		const idx = this.currentMoveIndex();
		if (idx < moves.length - 1) {
			const next = moves[idx + 1];
			this.chess.move(next);
			this.currentMoveIndex.set(idx + 1);
			this.currentFen.set(this.chess.fen());
			const ci = idx + 2;
			if (ci < this.clockHistory.length) {
				const c = this.clockHistory[ci];
				this.whiteTimeRemaining.set(this.formatTime(c.white));
				this.blackTimeRemaining.set(this.formatTime(c.black));
			}
		}
	}
	/** Steps back one move, no-op in practice mode. */
	protected prev(): void {
		if (this.practiceMode()) return;
		if (this.currentMoveIndex() >= 0) {
			this.chess.undo();
			this.currentMoveIndex.update((i) => i - 1);
			this.currentFen.set(this.chess.fen());
			const ci = this.currentMoveIndex() + 1;
			if (ci >= 0 && ci < this.clockHistory.length) {
				const c = this.clockHistory[ci];
				this.whiteTimeRemaining.set(this.formatTime(c.white));
				this.blackTimeRemaining.set(this.formatTime(c.black));
			}
		}
	}
	/** Jumps to the start position of the loaded game. */
	protected start(): void {
		if (this.practiceMode()) return;
		this.chess.reset();
		this.currentMoveIndex.set(-1);
		this.currentFen.set(this.chess.fen());
		if (this.clockHistory.length > 0) {
			const c = this.clockHistory[0];
			this.whiteTimeRemaining.set(this.formatTime(c.white));
			this.blackTimeRemaining.set(this.formatTime(c.black));
		}
	}
	/** Jumps to the final position of the loaded game. */
	protected end(): void {
		if (this.practiceMode()) return;
		this.chess.reset();
		for (const m of this.moves()) this.chess.move(m);
		this.currentMoveIndex.set(this.moves().length - 1);
		this.currentFen.set(this.chess.fen());
		if (this.clockHistory.length > 0) {
			const c = this.clockHistory[this.clockHistory.length - 1];
			this.whiteTimeRemaining.set(this.formatTime(c.white));
			this.blackTimeRemaining.set(this.formatTime(c.black));
		}
	}

	// ---- Filter actions ----
	/** Sends the current filter selection to the worker. */
	protected applyFilter(): void {
		this.stopReplay();
		this.exitPractice();
		this.isReplayingSequence = false;
		this.showAllGames.set(false);
		this.showBetterMoveBtn.set(false);
		this.analysisVisible.set(false);

		const fMoves = this.filterMoves();
		const currentMoves = fMoves
			? this.interactiveMoves()
			: this.moves().slice(0, this.currentMoveIndex() + 1);
		this.activeFilterMoves = currentMoves;
		this.autoSelectOnFinish = true;

		this.currentFilterId++;
		const id = this.currentFilterId;
		this.isFiltering.set(true);

		const fc: FilterCriteria = {
			white: this.filterWhite(),
			black: this.filterBlack(),
			result: this.filterResult().join(','),
			moves: fMoves,
			ignoreColor: this.ignoreColor(),
			minWhiteRating: this.filterRatingEnabled()
				? parseInt(this.filterWhiteRating(), 10) || 0
				: 0,
			minBlackRating: this.filterRatingEnabled()
				? parseInt(this.filterBlackRating(), 10) || 0
				: 0,
			maxWhiteRating: this.filterRatingEnabled()
				? parseInt(this.filterWhiteRatingMax(), 10) || 0
				: 0,
			maxBlackRating: this.filterRatingEnabled()
				? parseInt(this.filterBlackRatingMax(), 10) || 0
				: 0,
			eco: this.filterEco(),
			timeControl: this.filterTimeControl(),
			event: this.filterEvent(),
			broadcastName: this.filterBroadcastName(),
			targetMoves: currentMoves,
			filterByFen: this.filterByFenEnabled(),
			targetFen: this.filterFen(),
			sortAscending: this.sortAscending(),
			upsetEnabled: this.filterUpsetEnabled(),
			upsetWin: this.filterUpsetWin(),
			upsetDraw: this.filterUpsetDraw(),
			minUpsetEloDiff: this.filterUpsetEnabled()
				? parseInt(this.filterUpsetMinDiff(), 10) || 0
				: 0,
		};
		this.pgnViewerEngine.filterGames(fc, id);

		if (fMoves) this.shouldUncheckFilterMoves = true;
	}

	/** Resets every filter to its default and re-applies them. */
	protected clearFilters(): void {
		this.stopReplay();
		this.isReplayingSequence = false;
		this.showBetterMoveBtn.set(false);
		this.analysisVisible.set(false);
		this.showAllGames.set(false);

		const hadFilterMoves = this.filterMoves();
		this.filterWhite.set('');
		this.filterBlack.set('');
		this.filterResult.set([]);
		this.filterMoves.set(false);
		this.ignoreColor.set(false);
		this.filterUpsetEnabled.set(false);
		this.filterUpsetWin.set(false);
		this.filterUpsetDraw.set(false);
		this.filterUpsetMinDiff.set('300');
		this.filterRatingEnabled.set(false);
		this.filterWhiteRating.set('2000');
		this.filterBlackRating.set('2000');
		this.filterWhiteRatingMax.set('4000');
		this.filterBlackRatingMax.set('4000');
		this.filterEco.set('');
		this.filterTimeControl.set([]);
		this.filterEvent.set('');
		this.filterBroadcastName.set('');
		this.filterFen.set('');
		this.filterByFenEnabled.set(false);
		this.interactiveMoves.set([]);
		this.activeFilterMoves = [];
		if (hadFilterMoves && this.savedGameMoveIndex !== null) {
			this.jumpToMove(this.savedGameMoveIndex);
			this.savedGameMoveIndex = null;
		}
		this.applyFilter();
	}

	/** Reverses the game-list sort direction. */
	protected toggleSortDirection(): void {
		this.sortAscending.update((v) => !v);
	}
	/** Adds or removes one game from the batch-operation selection. */
	protected toggleGameSelection(index: number): void {
		const s = new Set(this.selectedGames());
		if (s.has(index)) {
			s.delete(index);
		} else {
			s.add(index);
		}
		this.selectedGames.set(s);
	}

	// ---- Replay ----
	/** Starts auto-replay of the loaded game from its first move. */
	protected replayGame(): void {
		this.exitPractice();
		this.stopReplay();
		this.start();
		this.runReplayLogic();
	}
	/** Resumes a paused replay from the displayed position. */
	protected continueReplay(): void {
		this.exitPractice();
		this.stopReplay(false);
		this.runReplayLogic();
	}
	/** Cancels a batch replay across multiple games. */
	protected stopSequence(): void {
		this.isReplayingSequence = false;
		this.stopReplay();
	}
	/**
	 * Stops the active replay and cancels its pending move timers.
	 *
	 * @param resolvePromise — When `true`, resolves the promise a caller may be
	 *   awaiting from `replayAllSelectedGames`.
	 */
	stopReplay(resolvePromise = true): void {
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
	/** Replays each selected game in turn, stopping early if the user cancels. */
	async replayAllSelectedGames(): Promise<void> {
		this.stopReplay();
		this.isReplayingSequence = true;
		const selectedSet = this.selectedGames();
		const selected = this.filteredGamesIndices().filter((i) =>
			selectedSet.has(i),
		);
		if (selected.length === 0) {
			this.showMessage('No games selected. Please select games to replay.');
			return;
		}
		for (let i = 0; i < selected.length; i++) {
			if (!this.isReplayingSequence) break;
			this.loadGame(selected[i]);
			await new Promise((r) => setTimeout(r, 100));
			await this.replayGameAsync();
			if (i < selected.length - 1)
				await new Promise((r) => setTimeout(r, 2000));
		}
	}

	// ---- Stockfish analysis ----
	/** Sends `fen` to Stockfish at the configured depth. */
	protected analyzePosition(fen: string): void {
		if (!this.pgnViewerEngine.analyzePosition(fen, this.stockfishDepth()))
			return;
		this.isAnalyzing.set(true);
		this.allAlternatives.set([]);
		this.currentAlternativeIndex.set(0);
		// Discard any PV lines still buffered from a previous (possibly
		// aborted) search so they cannot be published with the new result.
		this.pendingAlternatives.clear();
		this.autoplayCompleted.set(false);
		this.analysisVisible.set(true);
	}
	/** Plays out the engine's principal variation on the board. */
	protected autoplayBestLine(): void {
		const info = this.bestMoveInfo();
		if (!info?.pv?.length) return;
		this.autoplayCompleted.set(false);
		(async () => {
			for (const move of info.pv) {
				this.currentFen.set(move.fen);
				await new Promise((r) => setTimeout(r, 1000));
			}
			this.autoplayCompleted.set(true);
		})();
	}
	/** Cycle to the next-best engine move in the current analysis. */
	protected nextBestMove(): void {
		const alts = this.allAlternatives();
		const idx = this.currentAlternativeIndex();
		if (idx < alts.length - 1) {
			this.currentAlternativeIndex.set(idx + 1);
		}
	}
	/** Cycle to the previous engine move in the current analysis. */
	protected prevBestMove(): void {
		const idx = this.currentAlternativeIndex();
		if (idx > 0) this.currentAlternativeIndex.set(idx - 1);
	}
	/** Re-analyze the board position currently displayed. */
	protected reevaluatePosition(): void {
		this.analyzedFen = this.currentFen();
		this.analyzePosition(this.currentFen());
	}
	/** Shows a principal-variation position without committing a move. */
	protected previewPvMove(fen: string): void {
		this.currentFen.set(fen);
	}
	/** Shows or hides the analysis panel, starting analysis on first open. */
	protected toggleAnalysis(): void {
		// "Show Better Move" is exclusive with practice mode: opening it shows
		// the better-move panel and closes the practice panel.
		this.exitPractice();
		const wasVisible = this.analysisVisible();
		this.analysisVisible.update((v) => !v);
		// Start Stockfish analysis when the analysis panel is being opened
		if (!wasVisible && this.analyzedFen) {
			this.analyzePosition(this.analyzedFen);
		}
	}

	// ---- Practice mode ----
	/**
	 * Enters practice mode: turn-based play starting from the currently
	 * displayed position, with continuous Stockfish analysis.
	 */
	protected startPractice(): void {
		if (this.practiceMode() || this.isReplaying()) return;
		// Practice mode is exclusive with the "Show Better Move" analysis panel.
		this.showBetterMoveBtn.set(false);
		this.analysisVisible.set(false);
		// Rebuild the internal chess instance from the displayed position so
		// PV previews / auto-played lines are reflected in the game state.
		try {
			this.chess = new Chess(this.currentFen());
		} catch {
			this.chess = new Chess();
		}
		this.practiceMode.set(true);
		this.practiceStartFen.set(this.chess.fen());
		this.practiceMoves.set([]);
		this.practiceEvaluation.set(null);
		this.currentFen.set(this.chess.fen());
		this.analyzePracticePosition();
	}

	/** Leaves practice mode and restores the loaded game position. */
	protected exitPractice(): void {
		if (!this.practiceMode()) return;
		this.clearPracticeState();
		this.restoreGamePosition();
	}

	/** Takes back the last practice move and re-analyzes the resulting position. */
	protected undoPracticeMove(): void {
		if (!this.practiceMode()) return;
		if (!this.chess.undo()) return;
		this.practiceMoves.update((moves) => moves.slice(0, -1));
		this.practiceEvaluation.set(null);
		this.currentFen.set(this.chess.fen());
		this.analyzePracticePosition();
	}

	/** Restarts the practice session from the position where it started. */
	protected restartPractice(): void {
		if (!this.practiceMode()) return;
		try {
			this.chess = new Chess(this.practiceStartFen());
		} catch {
			this.chess = new Chess();
		}
		this.practiceMoves.set([]);
		this.practiceEvaluation.set(null);
		this.currentFen.set(this.chess.fen());
		this.analyzePracticePosition();
	}

	/** Re-analyzes the current practice position (e.g. after a depth change). */
	protected reanalyzePracticePosition(): void {
		if (this.practiceMode()) this.analyzePracticePosition();
	}

	// ---- Practice export ----
	/** Copies the current practice position as a FEN string. */
	async copyPracticeFen(): Promise<void> {
		await this.copyTextToClipboard(
			this.currentFen(),
			'FEN copied to clipboard.',
		);
	}
	/** Copies the practice move list as SAN text. */
	async copyPracticeMoves(): Promise<void> {
		await this.copyTextToClipboard(
			this.buildPracticeMoveText(),
			'Moves copied to clipboard.',
		);
	}
	/** Copies the practice session as PGN, including evaluation comments. */
	async copyPracticePgn(): Promise<void> {
		await this.copyTextToClipboard(
			this.buildPracticePgn(),
			'PGN copied to clipboard.',
		);
	}
	/** Downloads the practice session as a PGN file. */
	protected downloadPracticePgn(): void {
		const pgn = this.buildPracticePgn();
		const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `practice-analysis-${this.formatPgnDate()}.pgn`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	// ---- Load & Cache ----
	/**
	 * Parses raw PGN text in the worker.
	 *
	 * @param pgn — Raw PGN text.
	 * @param sourceUrl — When the text came from a URL, the URL is remembered
	 * alongside the content hash so the next session can restore it from
	 * IndexedDB without downloading and decompressing it again.
	 */
	async loadPgnString(pgn: string, sourceUrl?: string): Promise<void> {
		this.beginLoad('Starting PGN parser...');
		try {
			this.lastPgnHash = await this.pgnCacheService.hashPgn(pgn);
		} catch {
			/* ignore */
		}
		if (sourceUrl && this.lastPgnHash) {
			this.pgnCacheService.setSourceEntry(sourceUrl, {
				pgnHash: this.lastPgnHash,
				indexed: this.indexStartPositions(),
				maxFenPlies: this.maxFenPlies(),
				createdAt: Date.now(),
			});
		}
		this.pgnViewerEngine.loadPgn(
			pgn,
			Date.now(),
			this.lastPgnHash ?? undefined,
			this.indexStartPositions(),
			this.maxFenPlies(),
		);
	}

	/** Resets per-collection state and marks a new load as in progress. */
	private beginLoad(status: string): void {
		this.moves.set([]);
		this.interactiveMoves.set([]);
		this.currentMoveIndex.set(-1);
		this.currentGameIndex.set(-1);
		this.showAllGames.set(false);
		this.currentFen.set(
			'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
		);
		this.isLoading.set(true);
		this.loadingProgress.set(0);
		this.loadingStatus.set(status);
		this.lastPgnHash = null;
		this.loadStarted.emit({ status });
	}
	/** Loads PGN text from the system clipboard. */
	async loadFromClipboard(): Promise<void> {
		try {
			const text = await navigator.clipboard.readText();
			if (text) {
				this.pgnInput.set(text);
				this.loadPgnString(text);
			}
		} catch {
			this.showMessage('Failed to read clipboard.', 5000, 'error');
		}
	}
	/** Copies the PGN text currently in the load panel. */
	async copyToClipboard(): Promise<void> {
		try {
			await navigator.clipboard.writeText(this.pgnInput());
		} catch {
			this.showMessage('Failed to copy to clipboard.', 5000, 'error');
		}
	}
	/** Loads the Lichess broadcast archive for the selected year and month. */
	async loadFromLichess(): Promise<void> {
		const year = this.lichessYear();
		const month = this.lichessMonth();
		if (!year || !month) {
			this.showMessage('Please select a valid year and month.');
			return;
		}
		this.urlInput.set(lichessBroadcastUrl(year, month));
		await this.loadFromUrl();
	}

	/**
	 * Loads a PGN source into the viewer.
	 *
	 * The single entry point for getting data in — it replaces the pattern of
	 * writing to `urlInput`/`pgnInput` and then calling a no-argument loader.
	 * The source is explicit at the call site, so a misconfigured load is a
	 * type error rather than a silently ignored click.
	 *
	 * Awaits durable-state hydration internally, so hosts do not need to
	 * sequence `whenStateReady()` before their first load. Failures are
	 * reported through {@link loadFailed} and a user-facing notice; this method
	 * does not reject.
	 *
	 * @example
	 * ```typescript
	 * await viewer.load({ kind: 'url', url: 'lichess/broadcast/…pgn.zst' });
	 * await viewer.load({ kind: 'pgn', text: pgnString });
	 * await viewer.load({ kind: 'file', file: input.files[0] });
	 * ```
	 */
	async load(source: PgnSource, options?: LoadOptions): Promise<void> {
		// A load issued before hydration finishes would apply the persisted
		// filters to the wrong collection; wait for the state first.
		await this.stateReady;

		// Apply the per-call overrides to the indexing signals up front. They
		// are read by every downstream path (cache usability, the worker
		// payload and the cache bookmark), so resolving them in one place both
		// honours the override and keeps the UI in sync with what was loaded.
		if (options?.indexStartPositions !== undefined) {
			this.indexStartPositions.set(options.indexStartPositions);
		}
		if (options?.maxFenPlies !== undefined) {
			this.maxFenPlies.set(options.maxFenPlies);
		}

		switch (source.kind) {
			case 'url': {
				if (!source.url) {
					this.reportLoadFailure('INVALID_SOURCE', 'No URL provided.');
					return;
				}
				this.urlInput.set(source.url);
				await this.loadFromUrl();
				return;
			}
			case 'pgn': {
				if (!source.text) {
					this.reportLoadFailure('INVALID_SOURCE', 'No PGN text provided.');
					return;
				}
				this.pgnInput.set(source.text);
				await this.loadPgnString(source.text, source.sourceUrl);
				return;
			}
			case 'file': {
				await this.loadFile(source.file);
				return;
			}
		}
	}

	/**
	 * Whether a PGN source can be restored from the IndexedDB cache with the
	 * current indexing options, without downloading it.
	 *
	 * Hosts can use this to skip network probes at startup before calling
	 * {@link load}.
	 */
	canLoadFromCache(url: string): boolean {
		const entry = this.pgnCacheService.getSourceEntry(url);
		return entry !== null && this.isSourceCacheUsable(entry);
	}

	/**
	 * Loads the URL currently in the URL field, preferring the parsed-game
	 * cache over a fresh download. Prefer {@link load} at call sites.
	 */
	async loadFromUrl(): Promise<void> {
		const url = this.urlInput();
		if (!url) return;

		// Fast path: a previous session already parsed this source. Ask the
		// worker to restore it straight from IndexedDB, so no download,
		// decompression or hashing is needed. A miss falls back to the normal
		// download path via the 'cacheMiss' worker response.
		const cached = this.pgnCacheService.getSourceEntry(url);
		if (cached && this.isSourceCacheUsable(cached)) {
			this.beginLoad('Loading from cache...');
			this.pendingCacheSourceUrl = url;
			this.currentCacheLoadId++;
			this.pgnViewerEngine.loadFromCache(
				cached.pgnHash,
				this.currentCacheLoadId,
				this.indexStartPositions(),
				this.maxFenPlies(),
			);
			return;
		}

		await this.downloadFromUrl(url);
	}

	/**
	 * Whether a remembered source entry can satisfy the current indexing
	 * options. A caller that needs a FEN index cannot use an entry cached
	 * without one (or with a shorter replay window).
	 */
	private isSourceCacheUsable(entry: PgnSourceCacheEntry): boolean {
		if (!this.indexStartPositions()) return true;
		return entry.indexed && entry.maxFenPlies >= this.maxFenPlies();
	}

	/** Downloads, decompresses and parses a PGN archive from a URL. */
	private async downloadFromUrl(url: string): Promise<void> {
		this.isLoading.set(true);
		this.loadingProgress.set(0);
		this.loadingStatus.set('Starting download...');
		try {
			const response = await fetch(url);
			if (!response.ok)
				throw new Error(`HTTP error! status: ${response.status} `);
			const total = parseInt(response.headers.get('content-length') || '0', 10);
			if (!response.body) throw new Error('Response body is null');
			const reader = response.body.getReader();
			const chunks: Uint8Array[] = [];
			let received = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
				received += value.length;
				if (total > 0) {
					this.loadingProgress.set(Math.round((received / total) * 100));
					this.loadingStatus.set(
						`Downloading: ${(received / 1024 / 1024).toFixed(2)} MB / ${(total / 1024 / 1024).toFixed(2)} MB`,
					);
				} else {
					this.loadingStatus.set(
						`Downloading: ${(received / 1024 / 1024).toFixed(2)} MB`,
					);
				}
			}
			const buffer = new Uint8Array(received);
			let pos = 0;
			for (const chunk of chunks) {
				buffer.set(chunk, pos);
				pos += chunk.length;
			}
			this.loadingStatus.set('Decompressing...');
			const content = url.toLowerCase().endsWith('.zst')
				? new TextDecoder().decode(decompressZst(buffer))
				: new TextDecoder().decode(buffer);
			this.loadingStatus.set('Processing games...');
			this.setDeferredTimeout(() => {
				this.loadPgnString(content, url);
			});
		} catch (e) {
			this.reportLoadFailure(
				'DOWNLOAD_FAILED',
				`Error loading from URL: ${String(e)}`,
				e,
			);
		}
	}
	/** Clears the worker's parsed-game cache and the URL bookmarks. */
	protected clearPgnCache(): void {
		this.pgnViewerEngine.clearCache(Date.now());
		this.pgnCacheService.clearSourceEntries();
		this.lastPgnHash = null;
		this.cacheInfo.set(null);
		this.showMessage('PGN cache cleared.');
	}
	/** Refreshes the cached-entry count and size shown in the load panel. */
	async refreshCacheInfo(): Promise<void> {
		this.cacheInfo.set(await this.pgnCacheService.getCacheInfo());
	}
	/** Surfaces a file-read failure reported by the load panel. */
	protected onFileLoadFailed(message: string): void {
		this.reportLoadFailure('PARSE_FAILED', message);
	}
	/** Handles a `.zip` chosen in the file picker. */
	protected onPgnZipSelected(event: Event): void {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		void this.loadFile(file);
	}

	/**
	 * Parses a user-selected `.pgn` or `.zip` file into the viewer.
	 *
	 * Shared by the file inputs and by {@link load}, so both paths report
	 * failures identically instead of one of them silently resetting the
	 * spinner.
	 */
	async loadFile(file: File): Promise<void> {
		this.isLoading.set(true);
		try {
			const content = file.name.toLowerCase().endsWith('.zip')
				? await this.readPgnFromZip(file)
				: await file.text();
			if (!content) {
				this.reportLoadFailure(
					'PARSE_FAILED',
					`No PGN content found in "${file.name}".`,
				);
				return;
			}
			await this.loadPgnString(content);
		} catch (error) {
			this.reportLoadFailure(
				'PARSE_FAILED',
				`Could not read "${file.name}".`,
				error,
			);
		}
	}

	/** Extracts the first `.pgn` entry from a zip archive, if any. */
	private async readPgnFromZip(file: File): Promise<string | null> {
		const zip = await loadZipAsync(file);
		const pgnFile = Object.values(zip.files).find((f) =>
			f.name.toLowerCase().endsWith('.pgn'),
		);
		return pgnFile ? pgnFile.async('string') : null;
	}

	/** Handles a `.pgn` chosen in the file picker. */
	protected onPgnFileSelected(event: Event): void {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		void this.loadFile(file);
	}

	// ---- Snapshot position ----
	/** Copies the displayed position into the FEN filter and enables it. */
	protected snapshotCurrentPosition(): void {
		this.filterFen.set(this.currentFen());
		this.filterByFenEnabled.set(true);
	}

	/** Safe text highlighting for typeahead. */
	protected highlightText(text: string, query: string): TextSegment[] {
		return highlightMatch(text, query);
	}

	/** Lookup ECO opening moves from the ECO_MOVES map. */
	protected getOpeningMoves(code: string): string {
		return ECO_MOVES[code] || '';
	}

	// ======================================================================
	// Private methods
	// ======================================================================

	/** Year/month of the most recent Lichess archive that may already exist. */
	private previousMonthDefaults(): { year: number; month: number } {
		const now = new Date();
		const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		return { year: prevMonth.getFullYear(), month: prevMonth.getMonth() + 1 };
	}

	/**
	 * Loads the durable state and applies it.
	 *
	 * In the browser this only marks the state as hydrated (localStorage was
	 * already read synchronously in the constructor). On desktop it waits for
	 * the local server snapshot, then restores the saved source and filters.
	 */
	private async hydratePersistedState(defaults: {
		year: number;
		month: number;
	}): Promise<void> {
		try {
			await this.pgnViewerSettings.hydrate();
			await this.pgnCacheService.hydrateSourceEntries();
			const state = this.pgnViewerSettings.load();
			if (state) {
				this.persistedState = state;
				this.applyPersistedState(state, defaults);
			}
		} catch {
			// Storage unavailable — continue with the defaults.
		} finally {
			this.stateHydrated.set(true);
			this.stateRestored.emit();
		}
	}

	/** Applies a state restored from storage to the filter and source signals. */
	private applyPersistedState(
		state: PersistedViewerState,
		defaults: { year: number; month: number },
	): void {
		const f = state.filters;
		this.filterWhite.set(f.white);
		this.filterBlack.set(f.black);
		this.filterResult.set(f.result);
		this.filterMoves.set(f.moves);
		this.ignoreColor.set(f.ignoreColor);
		this.filterUpsetEnabled.set(f.upsetEnabled);
		this.filterUpsetWin.set(f.upsetWin);
		this.filterUpsetDraw.set(f.upsetDraw);
		this.filterUpsetMinDiff.set(f.upsetMinDiff);
		this.filterRatingEnabled.set(f.ratingEnabled);
		this.filterWhiteRating.set(f.whiteRating);
		this.filterBlackRating.set(f.blackRating);
		this.filterWhiteRatingMax.set(f.whiteRatingMax);
		this.filterBlackRatingMax.set(f.blackRatingMax);
		this.filterEco.set(f.eco);
		this.filterTimeControl.set(f.timeControl);
		this.filterEvent.set(f.event);
		this.filterBroadcastName.set(f.broadcastName);
		this.filterFen.set(f.fen);
		this.filterByFenEnabled.set(f.byFenEnabled);
		this.sortAscending.set(f.sortAscending);

		this.lichessYear.set(
			state.lichessYear > 0 ? state.lichessYear : defaults.year,
		);
		this.lichessMonth.set(
			state.lichessMonth >= 1 && state.lichessMonth <= 12
				? state.lichessMonth
				: defaults.month,
		);
		if (state.url) this.urlInput.set(state.url);
	}

	/** Snapshots the current filter selection and data source for persistence. */
	private buildPersistedState(): PersistedViewerState {
		const filters: PersistedFilterState = {
			white: this.filterWhite(),
			black: this.filterBlack(),
			result: this.filterResult(),
			moves: this.filterMoves(),
			ignoreColor: this.ignoreColor(),
			upsetEnabled: this.filterUpsetEnabled(),
			upsetWin: this.filterUpsetWin(),
			upsetDraw: this.filterUpsetDraw(),
			upsetMinDiff: this.filterUpsetMinDiff(),
			ratingEnabled: this.filterRatingEnabled(),
			whiteRating: this.filterWhiteRating(),
			blackRating: this.filterBlackRating(),
			whiteRatingMax: this.filterWhiteRatingMax(),
			blackRatingMax: this.filterBlackRatingMax(),
			eco: this.filterEco(),
			timeControl: this.filterTimeControl(),
			event: this.filterEvent(),
			broadcastName: this.filterBroadcastName(),
			fen: this.filterFen(),
			byFenEnabled: this.filterByFenEnabled(),
			sortAscending: this.sortAscending(),
		};
		return {
			version: PGN_VIEWER_STATE_VERSION,
			url: this.urlInput(),
			lichessYear: this.lichessYear(),
			lichessMonth: this.lichessMonth(),
			filters,
		};
	}

	/**
	 * Builds the distinct-value lists behind the filter dropdowns (players,
	 * ECO, events, time controls, broadcasts) from freshly loaded metadata.
	 */
	private buildFilterLists(metadata: GameMetadata[]): void {
		const whitePlayerElos = new Map<string, number>();
		const blackPlayerElos = new Map<string, number>();
		const ecoCodes = new Map<string, number>();
		const timeControls = new Map<
			string,
			{ count: number; originals: Map<string, number> }
		>();
		const events = new Map<string, number>();
		const broadcastNames = new Map<string, number>();

		for (const meta of metadata) {
			if (
				meta.white &&
				meta.white !== 'Unknown' &&
				!meta.white.startsWith('BOT ')
			) {
				whitePlayerElos.set(
					meta.white,
					Math.max(whitePlayerElos.get(meta.white) || 0, meta.whiteElo || 0),
				);
			}
			if (
				meta.black &&
				meta.black !== 'Unknown' &&
				!meta.black.startsWith('BOT ')
			) {
				blackPlayerElos.set(
					meta.black,
					Math.max(blackPlayerElos.get(meta.black) || 0, meta.blackElo || 0),
				);
			}
			if (meta.eco && !meta.eco.includes('?')) {
				ecoCodes.set(meta.eco, (ecoCodes.get(meta.eco) || 0) + 1);
			}
			const normalized = meta.timeControlNormalized;
			const original = meta.timeControl?.trim();
			if (normalized) {
				const existing = timeControls.get(normalized) || {
					count: 0,
					originals: new Map<string, number>(),
				};
				existing.count += 1;
				if (original)
					existing.originals.set(
						original,
						(existing.originals.get(original) || 0) + 1,
					);
				timeControls.set(normalized, existing);
			}
			if (meta.event && !meta.event.includes('?')) {
				events.set(meta.event, (events.get(meta.event) || 0) + 1);
			}
			if (meta.broadcastName && !meta.broadcastName.includes('?')) {
				broadcastNames.set(
					meta.broadcastName,
					(broadcastNames.get(meta.broadcastName) || 0) + 1,
				);
			}
		}
		this.uniqueWhitePlayers.set(
			Array.from(whitePlayerElos.entries())
				.sort((a, b) => b[1] - a[1])
				.map(([n]) => n),
		);
		this.uniqueBlackPlayers.set(
			Array.from(blackPlayerElos.entries())
				.sort((a, b) => b[1] - a[1])
				.map(([n]) => n),
		);
		this.uniqueEcoCodes.set(ecoCodes);
		this.uniqueTimeControls.set(timeControls);
		this.uniqueEvents.set(events);
		this.uniqueBroadcastNames.set(broadcastNames);
	}

	/**
	 * Legal destination map for the board's editable pieces.
	 *
	 * The map contains legal moves for the **side to move** only, so the user
	 * can move whichever color the position dictates and never the other side.
	 */
	private getMovableDests(): Map<Key, Key[]> {
		const dests = new Map<Key, Key[]>();
		for (const move of this.chess.moves({ verbose: true })) {
			const from = move.from as Key;
			if (!dests.has(from)) dests.set(from, []);
			dests.get(from)?.push(move.to as Key);
		}
		return dests;
	}

	/**
	 * Applies a move made on the board while composing a position filter.
	 *
	 * Every path ends either committed or with the board re-synchronized to
	 * chess.js, because chessground renders the drop before the app validates it.
	 */
	private handleBoardMove(orig: string, dest: string): void {
		if (this.practiceMode()) {
			this.handlePracticeMove(orig, dest);
			return;
		}
		try {
			const move = this.chess.move({ from: orig, to: dest });
			if (move) {
				this.currentFen.set(this.chess.fen());
				this.interactiveMoves.update((m) => [...m, move.san]);
				if (this.filterByFenEnabled()) this.filterFen.set(this.chess.fen());
				// Push the committed position + destinations to the board right
				// away so consecutive drag & drop moves never see stale dests.
				this.pushBoardNow();
			} else {
				// The move was rejected: snap the rendered board back to the
				// chess.js position (chessground already drew the drop).
				this.forceBoardSync();
			}
		} catch {
			this.forceBoardSync();
		}
	}

	/**
	 * Applies a move played on the board during practice mode.
	 *
	 * Practice is turn-based: only the side to move may move, and only legal
	 * moves are accepted. The move is applied directly to the internal chess.js
	 * instance, which enforces both legality and turn alternation.
	 *
	 * Every path ends in exactly one of two states: the move is committed
	 * (FEN update + re-analysis + immediate board push), or it is rejected and
	 * the board is force-synchronized back to the chess.js position. The board
	 * can therefore never stay desynchronized from chess.js — a desync makes
	 * subsequent drag & drop moves silently fail.
	 */
	private handlePracticeMove(orig: string, dest: string): void {
		if (!this.practiceMode()) return;
		let piece: Piece | undefined;
		try {
			piece = this.chess.get(orig as Square);
		} catch {
			this.forceBoardSync();
			return;
		}
		if (!piece) {
			// The dropped square holds no piece in chess.js — the rendered
			// board is out of sync; snap it back to the truth.
			this.forceBoardSync();
			return;
		}
		const isPromotion =
			piece.type === 'p' && (dest.endsWith('8') || dest.endsWith('1'));
		if (isPromotion) {
			// The promotion dialog is modal; commit (or re-sync) once it closes.
			void this.promotionService
				.showPromotionDialog(piece.color === 'w' ? 'white' : 'black')
				.then((promotion) => {
					// The user may have exited practice mode while the dialog was open.
					if (!this.practiceMode()) {
						this.forceBoardSync();
						return;
					}
					const move = this.applyPracticeMove(orig, dest, promotion);
					if (move) this.commitPracticeMove(move);
					else this.forceBoardSync();
				})
				.catch(() => {
					// The dialog failed to open/close: revert the rendered drop.
					this.forceBoardSync();
				});
		} else {
			const move = this.applyPracticeMove(orig, dest, undefined);
			if (move) this.commitPracticeMove(move);
			else this.forceBoardSync();
		}
	}

	/**
	 * Commits an applied practice move: updates the FEN, appends the move to
	 * the session list and triggers re-analysis of the new position.
	 */
	private commitPracticeMove(move: Move): void {
		this.currentFen.set(this.chess.fen());
		this.practiceMoves.update((moves) => [
			...moves,
			{ san: move.san, evaluation: null },
		]);
		this.practiceEvaluation.set(null);
		this.analyzePracticePosition();
		// Push the committed position + destinations to the board right away
		// so consecutive drag & drop moves never see stale dests.
		this.pushBoardNow();
	}

	/**
	 * Force-pushes the chess.js position to the board, even when the FEN string
	 * did not change, healing any desync between chessground's rendered state
	 * and chess.js (chessground applies a drop to its own state before the app
	 * validates it — a rejected drop must be explicitly reverted).
	 */
	private forceBoardSync(): void {
		this.currentFen.set(this.chess.fen());
		this.boardSyncTick.update((v) => v + 1);
		// Also synchronize the live instance immediately instead of waiting for
		// Angular's change-detection round trip.
		this.pushBoardNow();
	}

	/**
	 * Synchronously pushes the current chess.js position and legal move
	 * destinations to the live chessground instance.
	 *
	 * chessground clears `movable.dests` after every user drop and only
	 * re-receives them once the `after` callback plus Angular change detection
	 * have run. This immediate push closes that window, so rapid consecutive
	 * drag & drop moves are never rejected.
	 */
	private pushBoardNow(): void {
		if (!this.boardApi) return;
		// Invalidate chessground's cached board bounds: the board may have
		// moved due to a layout shift that fires no scroll/resize event, and
		// stale bounds make every subsequent drag map to the wrong square.
		this.boardApi.state.dom.bounds.clear();
		const fen = this.chess.fen();
		const practice = this.practiceMode();
		const turnColor = fen.split(' ')[1] === 'w' ? 'white' : 'black';
		this.boardApi.set({
			fen,
			turnColor,
			movable: {
				free: false,
				color: practice ? turnColor : 'both',
				dests: this.getMovableDests(),
				showDests: true,
			},
		});
	}

	/**
	 * Applies a practice move for the side to move: rejects moves by the other
	 * side, then lets chess.js validate legality and turn alternation in place.
	 * Returns the made move, or null when the move is not allowed.
	 */
	private applyPracticeMove(
		orig: string,
		dest: string,
		promotion: 'q' | 'r' | 'b' | 'n' | undefined,
	): Move | null {
		try {
			const piece = this.chess.get(orig as Square);
			// Only the side to move may move: reject the other color outright.
			if (!piece || piece.color !== this.chess.turn()) return null;
			return this.chess.move({ from: orig, to: dest, promotion });
		} catch {
			return null;
		}
	}

	/** Starts Stockfish analysis of the current practice position. */
	private analyzePracticePosition(): void {
		if (!this.practiceMode()) return;
		const fen = this.chess.fen();
		// Keep the practice analysis FEN separate from analyzedFen so the
		// "Show Better Move" flow keeps its own position.
		this.practiceAnalysisFen = fen;
		// Drop any pending PV lines so a bestmove flushed by the 'stop' of the
		// previous search cannot be mistaken for the new position's result.
		this.pendingAlternatives.clear();
		this.analyzePosition(fen);
	}

	/** Clears practice state without touching the chess instance. */
	private clearPracticeState(): void {
		this.practiceMode.set(false);
		this.practiceStartFen.set('');
		this.practiceMoves.set([]);
		this.practiceEvaluation.set(null);
		this.practiceAnalysisFen = null;
	}

	/** Rebuilds the chess instance and FEN from the loaded game's current move index. */
	private restoreGamePosition(): void {
		const index = this.currentMoveIndex();
		const moves = this.moves();
		this.chess.reset();
		for (let i = 0; i <= index && i < moves.length; i++) {
			this.chess.move(moves[i]);
		}
		this.currentFen.set(this.chess.fen());
	}

	/**
	 * Publishes a completed Stockfish analysis result to the practice state,
	 * ignoring results that do not belong to the currently displayed position.
	 */
	private applyPracticeAnalysisResult(score: string | null | undefined): void {
		if (!this.practiceMode()) return;
		if (this.practiceAnalysisFen !== this.currentFen()) return;
		this.practiceEvaluation.set(score ?? null);
		this.practiceMoves.update((moves) => {
			if (moves.length === 0) return moves;
			const copy = [...moves];
			const last = copy[copy.length - 1];
			copy[copy.length - 1] = { ...last, evaluation: score ?? null };
			return copy;
		});
	}

	/** Formats practice moves as a single text line, e.g. `"1. e4 e5 2. Nf3"`. */
	private buildPracticeMoveText(): string {
		const moves = this.practiceMoves();
		const parts: string[] = [];
		for (let i = 0; i < moves.length; i += 2) {
			const white = moves[i];
			const black = moves[i + 1];
			parts.push(`${i / 2 + 1}. ${white.san}`);
			if (black) parts.push(black.san);
		}
		return parts.join(' ');
	}

	/**
	 * Builds a full PGN for the practice session, including evaluation
	 * comments for analyzed moves.
	 */
	private buildPracticePgn(): string {
		const result = this.practiceResult() ?? '*';
		const headers = [
			'[Event "Practice analysis"]',
			'[Site "ngx-chessground"]',
			`[Date "${this.formatPgnDate()}"]`,
			'[White "Practice"]',
			'[Black "Practice"]',
		];
		const startFen = this.practiceStartFen();
		const standardFen =
			'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
		if (startFen && startFen !== standardFen) {
			headers.push('[SetUp "1"]');
			headers.push(`[FEN "${startFen}"]`);
		}
		headers.push(`[Result "${result}"]`);
		const moveText = this.practiceMoves()
			.map((move, i) => {
				const number = i % 2 === 0 ? `${i / 2 + 1}. ` : '';
				const comment = move.evaluation
					? ` { [%eval ${move.evaluation.replace(/^\+/, '')}] }`
					: '';
				return `${number}${move.san}${comment}`;
			})
			.join(' ');
		return `${headers.join('\n')}\n\n${moveText} ${result}\n`;
	}

	/** Formats today's date as a PGN header value, e.g. `2026.08.24`. */
	private formatPgnDate(): string {
		return new Date().toISOString().slice(0, 10).replace(/-/g, '.');
	}

	/** Copies text to the clipboard with user feedback. */
	private async copyTextToClipboard(
		text: string,
		message: string,
	): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			this.showMessage(message, 2500);
		} catch {
			this.showMessage('Failed to copy to clipboard.', 5000, 'error');
		}
	}

	/** Routes one PGN-worker response to the matching request handler. */
	private handleWorkerMessage(data: WorkerResponse): void {
		const { type, payload, id } = data;
		if (type === 'load') {
			this.gamesMetadata.set(payload.metadata);
			this.isLoading.set(false);

			// Defer expensive aggregation to idle time so the board renders
			// immediately. The handle is tracked so a pending callback cannot
			// fire after the component is destroyed.
			const meta = payload.metadata;
			if (typeof requestIdleCallback === 'function') {
				this.pendingIdleCallback = requestIdleCallback(
					() => {
						this.pendingIdleCallback = null;
						this.buildFilterLists(meta);
					},
					{ timeout: 2000 },
				);
			} else {
				this.setDeferredTimeout(() => this.buildFilterLists(meta));
			}
			if (payload.count > 0) this.loadGame(0);
			// Apply the filter selection that is currently active — restored
			// from the previous session or chosen by the user during this one —
			// to the freshly loaded game collection. This is what makes the
			// filters that were active when the application was closed show up
			// again once the games finish loading.
			this.applyFilter();
		} else if (type === 'progress') {
			this.loadingProgress.set(payload.percent);
			this.loadingStatus.set(payload.status);
			this.loadProgress.emit({
				percent: payload.percent,
				status: payload.status,
			});
		} else if (type === 'filter') {
			if (id === this.currentFilterId) {
				this.filteredGamesIndices.set(payload);
				this.isFiltering.set(false);
				if (this.autoSelectOnFinish) {
					const selected = new Set<number>();
					for (const i of payload) selected.add(i);
					this.selectedGames.set(selected);
					this.autoSelectOnFinish = false;
				}
				if (payload.length > 0) this.loadGame(payload[0]);
				if (this.shouldUncheckFilterMoves) {
					this.filterMoves.set(false);
					this.shouldUncheckFilterMoves = false;
				}
			}
		} else if (type === 'loadGame') {
			if (id !== this.currentLoadGameId) return;
			const { moves, pgn, evaluations, error } = payload;
			if (error) {
				this.pgnInput.set(
					`Error parsing game: ${error} \n\nRaw PGN: \n${pgn} `,
				);
				this.moves.set([]);
				this.evaluations.set([]);
				this.moveClocks.set([]);
				this.reportLoadFailure(
					'PARSE_FAILED',
					`Error parsing game: ${error}`,
					error,
				);
			} else {
				this.moves.set(moves);
				let evals = evaluations || [];
				const hasEval = evals.some((e) => e !== null);
				if (!hasEval && moves.length > 0 && pgn)
					evals = this.extractEvalsFromPgn(pgn, moves);
				this.evaluations.set(evals);
				this.chess.reset();
				this.currentMoveIndex.set(-1);
				this.currentFen.set(this.chess.fen());
				this.stopReplay();
				this.pgnInput.set(pgn);
				this.extractClockHistory(pgn);
				if (this.clockHistory.length > 0) {
					const start = this.clockHistory[0];
					this.whiteTimeRemaining.set(this.formatTime(start.white));
					this.blackTimeRemaining.set(this.formatTime(start.black));
				} else {
					this.whiteTimeRemaining.set('');
					this.blackTimeRemaining.set('');
				}
				if (
					this.filterMoves() &&
					this.activeFilterMoves.length > 0 &&
					moves.length >= this.activeFilterMoves.length
				) {
					this.jumpToMove(this.activeFilterMoves.length - 1);
				}
				if (this.filterByFenEnabled() && this.filterFen() && moves.length > 0) {
					const fi = this.findMoveIndexForFen(moves, this.filterFen());
					if (fi >= 0) this.jumpToMove(fi);
				}
			}
			this.isLoading.set(false);
		} else if (type === 'cacheMiss') {
			// The remembered source is no longer in IndexedDB (evicted, expired
			// or cleared): fall back to downloading and parsing it.
			if (id === this.currentCacheLoadId) {
				const url = this.pendingCacheSourceUrl;
				this.pendingCacheSourceUrl = null;
				if (url) void this.downloadFromUrl(url);
			}
		} else if (type === 'error') {
			this.reportLoadFailure('PARSE_FAILED', `Worker error: ${payload}`);
		}
	}

	// Temp storage for multi-PV lines during analysis; flushed to allAlternatives on bestmove.
	/** Multi-PV lines buffered until `bestmove` closes the search. */
	private readonly pendingAlternatives = new Map<number, BestMoveInfo>();

	/** Parses UCI output from Stockfish into evaluations and PV lines. */
	private handleStockfishMessage(event: MessageEvent): void {
		const line = event.data;
		if (typeof line !== 'string') return;
		if (line.startsWith('bestmove')) {
			this.isAnalyzing.set(false);
			// Sort multi-PV lines by rank and publish them
			const sorted = Array.from(this.pendingAlternatives.entries())
				.sort(([a], [b]) => a - b)
				.map(([, info]) => info);
			this.allAlternatives.set(sorted);
			this.currentAlternativeIndex.set(0);
			this.pendingAlternatives.clear();
			this.autoplayCompleted.set(false);
			// In practice mode, publish the completed evaluation (empty results
			// come from searches aborted by 'stop' and must not overwrite state).
			if (sorted.length > 0) {
				this.applyPracticeAnalysisResult(sorted[0]?.score);
			}
		} else if (line.startsWith('info') && line.includes(' pv ')) {
			// Extract multi-PV rank (defaults to 1 for single-PV engines)
			const multiPvMatch = line.match(/multipv (\d+)/);
			const rank = multiPvMatch ? parseInt(multiPvMatch[1], 10) : 1;

			const pvIndex = line.indexOf(' pv ');
			const pvString = line.substring(pvIndex + 4);
			const uciMoves = pvString.split(' ');
			if (uciMoves.length > 0) {
				const bestMove = uciMoves[0];
				// The FEN this analysis belongs to: the practice position when in
				// practice mode, otherwise the stop-on-error analysis position.
				const analysisFen = this.practiceMode()
					? this.practiceAnalysisFen
					: this.analyzedFen;
				let scoreText = '';
				const cpMatch = line.match(/score cp (-?\d+)/);
				const mateMatch = line.match(/score mate (-?\d+)/);
				let isBlackToMove = false;
				if (analysisFen) {
					const parts = analysisFen.split(' ');
					if (parts.length > 1 && parts[1] === 'b') isBlackToMove = true;
				}
				if (mateMatch) {
					let mate = parseInt(mateMatch[1], 10);
					if (isBlackToMove) mate = -mate;
					scoreText = `#${mate}`;
				} else if (cpMatch) {
					let cp = parseInt(cpMatch[1], 10);
					if (isBlackToMove) cp = -cp;
					scoreText = (cp / 100).toFixed(2);
					if (cp > 0) scoreText = `+${scoreText}`;
				}
				const sanPv = analysisFen ? this.uciToSan(analysisFen, uciMoves) : [];
				let bestMoveSan = bestMove;
				if (analysisFen) {
					try {
						const temp = new Chess(analysisFen);
						const u = bestMove;
						const m = temp.move({
							from: u.substring(0, 2),
							to: u.substring(2, 4),
							promotion: u.length > 4 ? u.substring(4, 5) : undefined,
						});
						if (m) bestMoveSan = m.san;
					} catch {
						/* ignore */
					}
				}
				this.pendingAlternatives.set(rank, {
					move: bestMoveSan,
					pv: sanPv,
					score: scoreText,
				});
			}
		}
	}

	/** Position the in-flight analysis was started for, used to drop stale results. */
	private analyzedFen: string | null = null;

	/**
	 * Converts a UCI principal variation into SAN plus the FEN after each move.
	 *
	 * @returns One entry per convertible move; returns `[]` for an invalid FEN.
	 */
	private uciToSan(
		fen: string,
		uciMoves: string[],
	): { san: string; fen: string }[] {
		try {
			const temp = new Chess(fen);
			const out: { san: string; fen: string }[] = [];
			for (const uci of uciMoves) {
				const m = temp.move({
					from: uci.substring(0, 2),
					to: uci.substring(2, 4),
					promotion: uci.length > 4 ? uci.substring(4, 5) : undefined,
				});
				if (!m) break;
				out.push({ san: m.san, fen: temp.fen() });
			}
			return out;
		} catch {
			return [];
		}
	}

	// ======================================================================
	// Replay internals
	// ======================================================================

	/** Chooses and runs the replay strategy for the current timing mode. */
	private runReplayLogic(): void {
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
			const temp = new Chess();
			temp.loadPgn(gamePgn);
			const history = temp.history({ verbose: true });
			const timeOuts = this.calculateReplayTimeouts(history);
			this.scheduleReplay(timeOuts, history.length, onComplete);
		} catch {
			try {
				const timeOuts = this.calculateReplayTimeoutsChessops(gamePgn);
				this.scheduleReplay(timeOuts, timeOuts.length, onComplete);
			} catch {
				const len = this.moves().length;
				const timeOuts = Array(len)
					.fill(0)
					.map((_, i) => (i + 1) * this.fixedTime());
				this.scheduleReplay(timeOuts, len, onComplete);
			}
		}
	}

	/** Replays the loaded game move by move, awaiting each scheduled delay. */
	private replayGameAsync(): Promise<void> {
		return new Promise((resolve) => {
			this.stopReplay();
			this.replayResolve = resolve;
			this.start();
			const gamePgn = this.pgnInput();
			try {
				const temp = new Chess();
				temp.loadPgn(gamePgn);
				const history = temp.history({ verbose: true });
				const timeOuts = this.calculateReplayTimeouts(history);
				this.scheduleReplay(timeOuts, history.length, () => {
					resolve();
					this.replayResolve = null;
				});
			} catch {
				try {
					const timeOuts = this.calculateReplayTimeoutsChessops(gamePgn);
					this.scheduleReplay(timeOuts, timeOuts.length, () => {
						resolve();
						this.replayResolve = null;
					});
				} catch {
					const len = this.moves().length;
					const timeOuts = Array(len)
						.fill(0)
						.map((_, i) => (i + 1) * this.fixedTime());
					this.scheduleReplay(timeOuts, len, () => {
						resolve();
						this.replayResolve = null;
					});
				}
			}
		});
	}

	/**
	 * Derives per-move delays from the clock data already parsed by chess.js.
	 *
	 * Used for `realtime` replay; falls back to the fixed interval when the PGN
	 * carries no clock annotations.
	 */
	private calculateReplayTimeouts(history: Move[]): number[] {
		const _timeOuts: number[] = [];
		this.clockHistory = [];
		const tempChess = new Chess();
		tempChess.loadPgn(this.pgnInput());
		const header = tempChess.header();
		const moves = tempChess.history({ verbose: true });
		const moveComments = tempChess.getComments();
		let timeControlSeconds = 0;
		if (header.TimeControl) {
			const tc = header.TimeControl.split('+');
			timeControlSeconds = parseInt(tc[0], 10);
		}
		let whiteTime = timeControlSeconds;
		let blackTime = timeControlSeconds;
		const fenToComment = new Map<string, string>();
		for (const c of moveComments) {
			fenToComment.set(c.fen, c.comment);
		}
		this.clockHistory.push({ white: whiteTime, black: blackTime });
		const thinkTimes: number[] = [];
		let hasClockComments = false;
		for (let i = 0; i < moves.length; i++) {
			const move = moves[i];
			const isWhite = move.color === 'w';
			const comment = fenToComment.get(move.after);
			let moveTime = 0;
			if (comment) {
				const clkMatch = comment.match(/%clk\s+(?:(\d+):)?(\d+):(\d+)/);
				if (clkMatch) {
					hasClockComments = true;
					const h = clkMatch[1] ? parseInt(clkMatch[1], 10) : 0;
					const m = parseInt(clkMatch[2], 10);
					const s = parseInt(clkMatch[3], 10);
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
			moveTime =
				moveTime === 0 && !hasClockComments
					? this.fixedTime()
					: moveTime === 0
						? 1
						: moveTime;
			thinkTimes.push(moveTime);
			this.clockHistory.push({ white: whiteTime, black: blackTime });
		}
		if (!hasClockComments) {
			this.clockHistory = [];
			this.whiteTimeRemaining.set('');
			this.blackTimeRemaining.set('');
		} else if (this.clockHistory.length > 0) {
			this.whiteTimeRemaining.set(this.formatTime(this.clockHistory[0].white));
			this.blackTimeRemaining.set(this.formatTime(this.clockHistory[0].black));
		}
		if (this.replayMode() === 'fixed')
			return history.map((_, i) => (i + 1) * this.fixedTime());
		if (this.replayMode() === 'fast')
			return history.map((_, i) => (i + 1) * this.fastTime());
		if (this.replayMode() === 'realtime') {
			let t = 0;
			return thinkTimes.map((v) => (t += v));
		}
		if (this.replayMode() === 'proportional') {
			const total = thinkTimes.reduce((a, b) => a + b, 0);
			const target = this.proportionalDuration() * 60;
			const scale = total > 0 ? target / total : 1;
			const min = this.minSecondsBetweenMoves();
			let cur = 0;
			return thinkTimes.map((v) => {
				cur += Math.max(v * scale, min);
				return cur;
			});
		}
		return thinkTimes.map((_, i) => (i + 1) * 1);
	}

	/**
	 * Derives per-move delays by parsing clock comments with chessops.
	 *
	 * Fallback for PGNs whose clock data chess.js cannot expose.
	 */
	private calculateReplayTimeoutsChessops(pgn: string): number[] {
		const games = parsePgn(pgn);
		if (games.length === 0) throw new Error('No games found by chessops');
		const game = games[0];
		const _timeOuts: number[] = [];
		this.clockHistory = [];
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
			const child = node.children[0];
			let moveTime = 0;
			let has = false;
			if (child.data?.comments) {
				for (const comment of child.data.comments) {
					const clkMatch = comment.match(/%clk\s+(?:(\d+):)?(\d+):(\d+)/);
					if (clkMatch) {
						has = true;
						const h = clkMatch[1] ? parseInt(clkMatch[1], 10) : 0;
						const m = parseInt(clkMatch[2], 10);
						const s = parseInt(clkMatch[3], 10);
						const timeInSeconds = h * 3600 + m * 60 + s;
						if (isWhite) {
							moveTime = Math.max(0.1, whiteTime - timeInSeconds);
							whiteTime = timeInSeconds;
						} else {
							moveTime = Math.max(0.1, blackTime - timeInSeconds);
							blackTime = timeInSeconds;
						}
						break;
					}
				}
			}
			if (!has) moveTime = this.fixedTime();
			thinkTimes.push(moveTime);
			this.clockHistory.push({ white: whiteTime, black: blackTime });
			node = child;
			isWhite = !isWhite;
		}
		if (this.replayMode() === 'fixed')
			return thinkTimes.map((_, i) => (i + 1) * this.fixedTime());
		if (this.replayMode() === 'fast')
			return thinkTimes.map((_, i) => (i + 1) * this.fastTime());
		if (this.replayMode() === 'realtime') {
			let t = 0;
			return thinkTimes.map((v) => (t += v));
		}
		if (this.replayMode() === 'proportional') {
			const total = thinkTimes.reduce((a, b) => a + b, 0);
			const target = this.proportionalDuration() * 60;
			const scale = total > 0 ? target / total : 1;
			const min = this.minSecondsBetweenMoves();
			let cur = 0;
			return thinkTimes.map((v) => {
				cur += Math.max(v * scale, min);
				return cur;
			});
		}
		return thinkTimes.map((_, i) => (i + 1) * 1);
	}

	/** Queues one replay step, tracking its timer so it can be cancelled. */
	private scheduleReplay(
		timeOuts: number[],
		totalMoves: number,
		onComplete?: () => void,
	): void {
		this.isReplaying.set(true);
		this.showBetterMoveBtn.set(false);
		this.analysisVisible.set(false);
		this.allAlternatives.set([]);
		this.autoplayCompleted.set(false);
		const startIdx = this.currentMoveIndex() + 1;
		if (startIdx >= totalMoves) {
			this.isReplaying.set(false);
			if (onComplete) onComplete();
			return;
		}
		const startTime = startIdx > 0 ? timeOuts[startIdx - 1] : 0;
		for (let i = startIdx; i < totalMoves; i++) {
			const delay = Math.max(0, (timeOuts[i] - startTime) * 1000);
			const isLast = i === totalMoves - 1;
			const tid = this.setDeferredTimeout(() => {
				this.next();
				if (this.stopOnError()) {
					const idx = this.currentMoveIndex();
					const evals = this.evaluations();
					if (idx > 0 && idx < evals.length) {
						const cur = this.parseEval(evals[idx]);
						const prev = this.parseEval(evals[idx - 1]);
						if (cur !== null && prev !== null) {
							const diff = cur - prev; // from White's perspective
							const threshold = this.stopOnErrorThreshold();
							// An "error" is a drop in the mover's own evaluation:
							// White erred when White's eval drops; Black erred when
							// White's eval rises (i.e. Black's eval drops).
							const isWhiteMove = this.isWhiteMove();
							const whiteError = isWhiteMove && diff < -threshold;
							const blackError = !isWhiteMove && diff > threshold;
							const side = this.stopOnErrorSide();
							const triggered =
								side === 'white'
									? whiteError
									: side === 'black'
										? blackError
										: whiteError || blackError;
							if (triggered) {
								this.stopReplay(false);
								this.showBetterMoveBtn.set(true);
								const prevFen = this.getFenBeforeMove(idx);
								if (prevFen) this.analyzedFen = prevFen;
							}
						}
					}
				}
				if (isLast) {
					this.setDeferredTimeout(() => {
						this.isReplaying.set(false);
						onComplete?.();
					}, 500);
				}
			}, delay);
			this.replayTimeouts.push(tid);
		}
	}

	// ======================================================================
	// Helpers
	// ======================================================================

	/** Renders a time-control key such as `'180+2'` as a readable label. */
	private formatTimeControlKey(key: string): string {
		const m = key.match(/^(\d+)\+(\d+)$/);
		if (!m) return key;
		const base = parseInt(m[1], 10);
		const inc = parseInt(m[2], 10);
		if (Number.isNaN(base) || Number.isNaN(inc)) return key;
		return base % 60 === 0 && base / 60 <= 180 ? `${base / 60}+${inc}` : key;
	}

	/** Summarizes the distinct original time-control strings behind a key. */
	private formatOriginalsSummary(
		originals: Map<string, number>,
		maxItems = 6,
	): string {
		const entries = Array.from(originals.entries()).sort((a, b) => b[1] - a[1]);
		const head = entries
			.slice(0, maxItems)
			.map(([v, c]) => `${v} (${c})`)
			.join(', ');
		const rest =
			entries.length > maxItems ? ` +${entries.length - maxItems} more` : '';
		return head ? `Originals: ${head}${rest}` : '';
	}

	/** Formats a duration in seconds as `H:MM:SS` or `M:SS`. */
	private formatTime(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		return h > 0
			? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} `
			: `${m}:${s.toString().padStart(2, '0')} `;
	}

	/** Parses an evaluation string into pawns, from White's perspective. */
	private parseEval(evalStr: string | null): number | null {
		if (!evalStr) return null;
		if (evalStr.startsWith('#')) {
			const val = parseInt(evalStr.substring(1), 10);
			return val > 0 ? 20 + 10 / Math.abs(val) : -(20 + 10 / Math.abs(val));
		}
		return parseFloat(evalStr);
	}

	/**
	 * Whether the move that just played was made by White.
	 *
	 * Uses the FEN of the position AFTER the move: its active color is the
	 * side to move next, so the mover is the opposite color. This stays
	 * correct for games that start from a custom FEN position.
	 */
	private isWhiteMove(): boolean {
		const parts = this.currentFen().split(' ');
		// 'w' to move next means Black just moved; anything else means White did.
		return parts.length < 2 || parts[1] !== 'w';
	}

	/**
	 * Recovers `[%eval …]` annotations from raw PGN when the worker reported none.
	 *
	 * @returns One evaluation per move, `null` where the PGN has no annotation.
	 */
	private extractEvalsFromPgn(
		pgnText: string,
		parsedMoves: string[],
	): (string | null)[] {
		const evals: (string | null)[] = new Array(parsedMoves.length).fill(null);
		const values: string[] = [];
		const re = /\[%eval\s+([^\]]+)\]/g;
		let m: RegExpExecArray | null;
		m = re.exec(pgnText);
		while (m !== null) {
			values.push(m[1]);
			m = re.exec(pgnText);
		}
		if (values.length === 0) return evals;
		const firstEvalIdx = pgnText.search(/\[%eval\s+([^\]]+)\]/);
		const firstMoveIdx = pgnText.search(/\b\d+\.\s+/);
		const offset = firstMoveIdx >= 0 && firstEvalIdx < firstMoveIdx ? 1 : 0;
		for (let i = 0; i < parsedMoves.length; i++) {
			const vi = i + offset;
			if (vi < values.length) evals[i] = values[vi];
		}
		return evals;
	}

	/** Parses `[%clk …]` annotations into {@link clockHistory}. */
	private extractClockHistory(pgn: string): void {
		this.clockHistory = [];
		try {
			const temp = new Chess();
			temp.loadPgn(pgn);
			const moves = temp.history({ verbose: true });
			const comments = temp.getComments();
			const fenToComment = new Map<string, string>();
			for (const c of comments) fenToComment.set(c.fen, c.comment);
			const header = temp.header();
			let tc = 0;
			if (header.TimeControl) {
				const t = header.TimeControl.split('+');
				tc = parseInt(t[0], 10);
			}
			let wt = tc,
				bt = tc;
			this.clockHistory.push({ white: wt, black: bt });
			let has = false;
			for (const move of moves) {
				const isW = move.color === 'w';
				const comment = fenToComment.get(move.after);
				if (comment) {
					const clk = comment.match(/%clk\s+(?:(\d+):)?(\d+):(\d+)/);
					if (clk) {
						has = true;
						const h = clk[1] ? parseInt(clk[1], 10) : 0;
						const m = parseInt(clk[2], 10);
						const s = parseInt(clk[3], 10);
						const tis = h * 3600 + m * 60 + s;
						if (isW) wt = tis;
						else bt = tis;
					}
				}
				this.clockHistory.push({ white: wt, black: bt });
			}
			if (!has) {
				this.clockHistory = [];
				this.moveClocks.set([]);
			} else this.buildMoveClocks(moves);
		} catch {
			this.clockHistory = [];
			this.moveClocks.set([]);
		}
	}

	/** Builds the formatted per-move clock strings from `clockHistory`. */
	private buildMoveClocks(moves: Move[]): void {
		const clocks: string[] = [];
		for (let i = 0; i < moves.length; i++) {
			const hi = i + 1;
			if (hi < this.clockHistory.length) {
				const isW = moves[i].color === 'w';
				const time = isW
					? this.clockHistory[hi].white
					: this.clockHistory[hi].black;
				clocks.push(this.formatTime(time));
			} else clocks.push('');
		}
		this.moveClocks.set(clocks);
	}

	/**
	 * Finds the first move index whose position matches `targetFen`.
	 *
	 * @returns The zero-based index, or `-1` when the position never occurs.
	 */
	private findMoveIndexForFen(moves: string[], targetFen: string): number {
		try {
			const norm = this.normalizeFen(targetFen);
			const temp = new Chess();
			if (this.normalizeFen(temp.fen()) === norm) return -1;
			for (let i = 0; i < moves.length; i++) {
				temp.move(moves[i]);
				if (this.normalizeFen(temp.fen()) === norm) return i;
			}
			return -1;
		} catch {
			return -1;
		}
	}

	/** Trims a FEN to its first four fields for comparison. */
	private normalizeFen(fen: string): string {
		return fen.split(' ').slice(0, 4).join(' ');
	}

	/** FEN of the position immediately before `moveIndex`, or `null`. */
	private getFenBeforeMove(moveIndex: number): string | null {
		try {
			const temp = new Chess();
			temp.loadPgn(this.pgnInput());
			const moves = temp.history();
			temp.reset();
			for (let i = 0; i < moveIndex; i++) temp.move(moves[i]);
			return temp.fen();
		} catch {
			return null;
		}
	}

	/**
	 * Schedules a callback and tracks its timer so `ngOnDestroy` can cancel it.
	 *
	 * @returns The timer handle, for callers that need to cancel it early.
	 */
	private setDeferredTimeout(
		cb: () => void,
		delay = 0,
	): ReturnType<typeof setTimeout> {
		const id = setTimeout(() => {
			this.pendingTimeouts.delete(id);
			cb();
		}, delay);
		this.pendingTimeouts.add(id);
		return id;
	}

	/** Sends a user-facing message to the configured notifier. */
	private showMessage(
		msg: string,
		duration = 4000,
		level: PgnViewerNoticeLevel = 'info',
	): void {
		this.notifier.notify({ message: msg, level, durationMs: duration });
	}

	/**
	 * Reports a load failure on every channel at once.
	 *
	 * The three consumers of a failure — the host (`loadFailed`), the user
	 * (notice) and a developer (console) — are served from one place, so a new
	 * error path cannot accidentally reach only some of them.
	 */
	private reportLoadFailure(
		code: PgnViewerErrorCode,
		message: string,
		cause?: unknown,
	): void {
		const error: PgnViewerError = { code, message, cause };
		this.isLoading.set(false);
		this.loadingProgress.set(0);
		this.loadingStatus.set('');
		this.loadFailed.emit(error);
		this.showMessage(message, 6000, 'error');
		if (cause !== undefined)
			console.error(`[ngx-chessground] ${message}`, cause);
	}
}
