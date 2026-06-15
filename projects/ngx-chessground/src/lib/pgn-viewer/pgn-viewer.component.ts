import {
	Component,
	computed,
	type ElementRef,
	effect,
	inject,
	input,
	model,
	type OnDestroy,
	signal,
	viewChild,
} from '@angular/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Chess, Move } from 'chess.js';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import { Key } from 'chessground/types';
import { parsePgn } from 'chessops/pgn';
import { decompress as decompressZst } from 'fzstd';
import { loadAsync as loadZipAsync } from 'jszip';

import { BoardDisplayComponent } from './board/board-display.component';
import { ECO_MOVES } from './eco-moves';
// Sub-components
import { GameFilterPanelComponent } from './filter/game-filter-panel.component';
import { LoadCachePanelComponent } from './load-cache/load-cache-panel.component';
import { MoveListComponent } from './moves/move-list.component';
import { PgnCacheService } from './pgn-cache.service';
import type {
	FilterCriteria,
	GameMetadata,
	WorkerResponse,
} from './pgn-processor.worker';
import { PgnViewerEngineService } from './pgn-viewer-engine.service';
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
		MatSnackBarModule,
		GameFilterPanelComponent,
		BoardDisplayComponent,
		MoveListComponent,
		ReplayPanelComponent,
		LoadCachePanelComponent,
	],
	templateUrl: './pgn-viewer.component.html',
	styleUrl: './pgn-viewer.component.css',
})
export class NgxPgnViewerComponent implements OnDestroy {
	private readonly pgnViewerEngine = inject(PgnViewerEngineService);
	private readonly snackBar = inject(MatSnackBar);
	private readonly pgnCacheService = inject(PgnCacheService);

	// ======================================================================
	// Inputs
	// ======================================================================

	pgn = input<string>('');
	highlightLastMove = input<boolean>(true);
	flipped = model<boolean>(false);
	in3d = model<boolean>(false);
	leftPanelWidth = model<number>(340);
	rightPanelWidth = model<number>(340);
	movesExpanded = model<boolean>(true);

	// ======================================================================
	// State Signals
	// ======================================================================

	gamesMetadata = signal<GameMetadata[]>([]);
	currentGameIndex = signal<number>(0);
	moves = signal<string[]>([]);
	currentMoveIndex = signal<number>(-1);
	currentFen = signal<string>(
		'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
	);
	isLoading = signal<boolean>(false);
	loadingProgress = signal<number>(0);
	loadingStatus = signal<string>('');
	lastPgnHash: string | null = null;
	selectedGames = signal<Set<number>>(new Set());

	// ---- Filter Signals ----
	filterWhite = signal<string>('');
	filterBlack = signal<string>('');
	filterResult = signal<string[]>([]);
	filterMoves = signal<boolean>(false);
	ignoreColor = signal<boolean>(false);
	filterRatingEnabled = signal<boolean>(false);
	filterWhiteRating = signal<string>('2000');
	filterBlackRating = signal<string>('2000');
	filterWhiteRatingMax = signal<string>('2900');
	filterBlackRatingMax = signal<string>('2900');
	filterEco = signal<string>('');
	filterTimeControl = signal<string>('');
	filterEvent = signal<string>('');
	filterBroadcastName = signal<string>('');
	filterFen = signal<string>('');
	filterByFenEnabled = signal<boolean>(false);
	indexStartPositions = signal<boolean>(false);
	maxFenPlies = signal<number>(30);
	sortAscending = signal<boolean>(false);

	uniqueWhitePlayers = signal<string[]>([]);
	uniqueBlackPlayers = signal<string[]>([]);
	uniqueEcoCodes = signal<Map<string, number>>(new Map());
	uniqueTimeControls = signal<
		Map<string, { count: number; originals: Map<string, number> }>
	>(new Map());
	uniqueEvents = signal<Map<string, number>>(new Map());
	uniqueBroadcastNames = signal<Map<string, number>>(new Map());

	filteredGamesIndices = signal<number[]>([]);
	isFiltering = signal<boolean>(false);
	showAllGames = signal<boolean>(false);

	sortedEcoCodes = computed(() =>
		Array.from(this.uniqueEcoCodes().entries())
			.sort((a, b) => b[1] - a[1])
			.map(([code, count]) => ({ code, count })),
	);

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

	sortedEvents = computed(() =>
		Array.from(this.uniqueEvents().entries())
			.sort((a, b) => b[1] - a[1])
			.map(([event, count]) => ({ event, count })),
	);

	sortedBroadcastNames = computed(() =>
		Array.from(this.uniqueBroadcastNames().entries())
			.sort((a, b) => b[1] - a[1])
			.map(([broadcastName, count]) => ({ broadcastName, count })),
	);

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

	totalFilteredCount = computed(() => this.filteredGamesIndices().length);
	selectedGamesCount = computed(() => this.selectedGames().size);
	canShowReplayAll = computed(
		() => this.gamesMetadata().length > 1 && this.selectedGamesCount() > 0,
	);

	currentGameInfo = computed(
		() =>
			`Game ${this.currentGameIndex() + 1} of ${this.gamesMetadata().length} `,
	);

	currentWhitePlayer = computed(() => {
		const metadata = this.gamesMetadata();
		const i = this.currentGameIndex();
		return metadata.length > 0 && i >= 0 && i < metadata.length
			? metadata[i].white
			: 'Unknown';
	});

	currentBlackPlayer = computed(() => {
		const metadata = this.gamesMetadata();
		const i = this.currentGameIndex();
		return metadata.length > 0 && i >= 0 && i < metadata.length
			? metadata[i].black
			: 'Unknown';
	});

	currentGameResult = computed(() => {
		const metadata = this.gamesMetadata();
		const i = this.currentGameIndex();
		return metadata.length > 0 && i >= 0 && i < metadata.length
			? metadata[i].result
			: '*';
	});

	// ---- Flipped board helpers ----
	topPlayerName = computed(() =>
		this.flipped() ? this.currentWhitePlayer() : this.currentBlackPlayer(),
	);
	bottomPlayerName = computed(() =>
		this.flipped() ? this.currentBlackPlayer() : this.currentWhitePlayer(),
	);
	topPlayerTurnClass = computed(() =>
		this.flipped() ? 'white-turn' : 'black-turn',
	);
	bottomPlayerTurnClass = computed(() =>
		this.flipped() ? 'black-turn' : 'white-turn',
	);
	topPlayerActiveColor = computed(() => (this.flipped() ? 'w' : 'b'));
	bottomPlayerActiveColor = computed(() => (this.flipped() ? 'b' : 'w'));
	topPlayerTitle = computed(() =>
		this.flipped() ? 'White to move' : 'Black to move',
	);
	bottomPlayerTitle = computed(() =>
		this.flipped() ? 'Black to move' : 'White to move',
	);
	topTimeRemaining = computed(() =>
		this.flipped() ? this.whiteTimeRemaining() : this.blackTimeRemaining(),
	);
	bottomTimeRemaining = computed(() =>
		this.flipped() ? this.blackTimeRemaining() : this.whiteTimeRemaining(),
	);

	lastMoveSquares = computed<[Key, Key] | undefined>(() => {
		if (!this.highlightLastMove()) return undefined;
		this.currentMoveIndex();
		this.currentFen();
		const history = this.chess.history({ verbose: true });
		if (history.length === 0) return undefined;
		const lastMove = history[history.length - 1];
		return [lastMove.from as Key, lastMove.to as Key];
	});

	activeColor = computed(() => {
		const parts = this.currentFen().split(' ');
		return parts.length > 1 ? parts[1] : 'w';
	});

	// ---- Replay signals ----
	replayMode = signal<'realtime' | 'proportional' | 'fixed' | 'fast'>('fixed');
	proportionalDuration = signal<number>(1);
	minSecondsBetweenMoves = signal<number>(1);
	fixedTime = signal<number>(1);
	fastTime = signal<number>(0.3);
	stopOnError = signal<boolean>(false);
	stopOnErrorThreshold = signal<number>(1.0);
	isReplaying = signal<boolean>(false);
	canContinueReplay = computed(
		() =>
			!this.isReplaying() && this.currentMoveIndex() < this.moves().length - 1,
	);
	isEndOfReplay = computed(
		() =>
			this.isReplaying() &&
			this.currentMoveIndex() >= 0 &&
			this.moves().length > 0 &&
			this.currentMoveIndex() >= this.moves().length - 1,
	);

	// ---- Clock signals ----
	whiteTimeRemaining = signal<string>('');
	blackTimeRemaining = signal<string>('');
	moveClocks = signal<string[]>([]);
	showClocks = computed(
		() => this.whiteTimeRemaining() !== '' || this.blackTimeRemaining() !== '',
	);

	// ---- Stockfish signals ----
	isAnalyzing = signal<boolean>(false);
	bestMoveInfo = signal<{
		move: string;
		pv: { san: string; fen: string }[];
		score?: string;
	} | null>(null);
	showBetterMoveBtn = signal<boolean>(false);
	analysisVisible = signal<boolean>(false);
	stockfishDepth = signal<number>(18);
	analysisVisibleChanged = signal<boolean>(false);

	evaluations = signal<(string | null)[]>([]);
	currentEvaluation = computed(() => {
		const evals = this.evaluations();
		const index = this.currentMoveIndex();
		return index >= 0 && index < evals.length ? evals[index] : null;
	});

	cacheInfo = signal<{ count: number; estimatedBytes: number } | null>(null);
	pgnInput = signal<string>('');
	urlInput = signal<string>('');
	lichessYear = model<number>(new Date().getFullYear());
	lichessMonth = model<number>(1);

	// Panel resize state
	private resizing: 'left' | 'right' | null = null;
	private resizeRafId: number | null = null;
	private readonly mainContentRef =
		viewChild<ElementRef<HTMLElement>>('mainContent');
	readonly moveList = viewChild<ElementRef<HTMLElement>>('moveList');

	// ---- Internal state ----
	private chess = new Chess();
	private replayTimeouts: ReturnType<typeof setTimeout>[] = [];
	private replayResolve: (() => void) | null = null;
	private isReplayingSequence = false;
	private currentFilterId = 0;
	private currentLoadGameId = 0;
	private autoSelectOnFinish = false;
	private activeFilterMoves: string[] = [];
	private savedGameMoveIndex: number | null = null;
	private interactiveMoves = signal<string[]>([]);
	private shouldUncheckFilterMoves = false;
	private clockHistory: { white: number; black: number }[] = [];
	private readonly pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();

	// ======================================================================
	// Computed — Run function for chessground
	// ======================================================================

	runFunction = computed<(el: HTMLElement) => Api>(() => {
		const fen = this.currentFen();
		const isEditable = this.filterMoves();
		const lastMove = this.lastMoveSquares();
		const orientation = this.flipped() ? 'black' : 'white';
		const is3d = this.in3d();
		return (el: HTMLElement) =>
			Chessground(el, {
				addPieceZIndex: is3d,
				fen,
				orientation,
				viewOnly: !isEditable,
				lastMove,
				movable: {
					free: false,
					color: isEditable ? 'both' : undefined,
					dests: isEditable ? this.getMovableDests() : undefined,
					events: {
						after: (orig, dest) => {
							if (isEditable) this.handleBoardMove(orig, dest);
						},
					},
				},
			});
	});

	// ======================================================================
	// Construction
	// ======================================================================

	constructor() {
		this.pgnViewerEngine.initialize({
			onPgnMessage: (data) => this.handleWorkerMessage(data),
			onStockfishMessage: (event) => this.handleStockfishMessage(event),
			onError: (message, error) => console.error(message, error),
		});

		const now = new Date();
		const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		this.lichessYear.set(prevMonth.getFullYear());
		this.lichessMonth.set(prevMonth.getMonth() + 1);

		effect(() => {
			const year = this.lichessYear();
			const month = this.lichessMonth();
			if (year && month) {
				const m = month.toString().padStart(2, '0');
				this.urlInput.set(
					`lichess/broadcast/lichess_db_broadcast_${year}-${m}.pgn.zst`,
				);
			}
		});

		effect(() => {
			const pgn = this.pgn();
			if (pgn) this.loadPgnString(pgn);
		});

		effect(() => {
			this.currentMoveIndex();
			this.setDeferredTimeout(() => this.scrollToActiveMove());
		});
	}

	ngOnDestroy(): void {
		this.stopReplay();
		this.stopResize();
		this.pgnViewerEngine.dispose();
		for (const t of this.pendingTimeouts) clearTimeout(t);
		this.pendingTimeouts.clear();
	}

	// ======================================================================
	// Public methods used by template
	// ======================================================================

	flipBoard(): void {
		this.flipped.update((v) => !v);
	}
	toggle3d(): void {
		this.in3d.update((v) => !v);
	}
	startResize(side: 'left' | 'right', event: MouseEvent): void {
		event.preventDefault();
		this.resizing = side;
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
	}
	onResizeMove(event: MouseEvent): void {
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
	stopResize(): void {
		this.resizing = null;
		if (this.resizeRafId !== null) {
			cancelAnimationFrame(this.resizeRafId);
			this.resizeRafId = null;
		}
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
	}

	// ---- Game navigation ----
	loadGame(index: number): void {
		const count = this.gamesMetadata().length;
		if (index >= 0 && index < count) {
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
	nextGame(): void {
		const nav = this.navigationIndices();
		const pos = nav.indexOf(this.currentGameIndex());
		if (pos >= 0 && pos < nav.length - 1) this.loadGame(nav[pos + 1]);
	}
	prevGame(): void {
		const nav = this.navigationIndices();
		const pos = nav.indexOf(this.currentGameIndex());
		if (pos > 0) this.loadGame(nav[pos - 1]);
	}
	private navigationIndices = computed(() => {
		const indices = this.filteredGamesIndices();
		const selected = this.selectedGames();
		return selected.size > 0 ? indices.filter((i) => selected.has(i)) : indices;
	});
	canGoPrev = computed(() => {
		const nav = this.navigationIndices();
		const pos = nav.indexOf(this.currentGameIndex());
		return pos > 0;
	});
	canGoNext = computed(() => {
		const nav = this.navigationIndices();
		const pos = nav.indexOf(this.currentGameIndex());
		return pos >= 0 && pos < nav.length - 1;
	});

	// ---- Move navigation ----
	jumpToMove(index: number): void {
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
	next(): void {
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
	prev(): void {
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
	start(): void {
		this.chess.reset();
		this.currentMoveIndex.set(-1);
		this.currentFen.set(this.chess.fen());
		if (this.clockHistory.length > 0) {
			const c = this.clockHistory[0];
			this.whiteTimeRemaining.set(this.formatTime(c.white));
			this.blackTimeRemaining.set(this.formatTime(c.black));
		}
	}
	end(): void {
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
	applyFilter(): void {
		this.stopReplay();
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
		};
		this.pgnViewerEngine.filterGames(fc, id);

		if (fMoves) this.shouldUncheckFilterMoves = true;
	}

	clearFilters(): void {
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
		this.filterRatingEnabled.set(false);
		this.filterWhiteRating.set('2000');
		this.filterBlackRating.set('2000');
		this.filterWhiteRatingMax.set('4000');
		this.filterBlackRatingMax.set('4000');
		this.filterEco.set('');
		this.filterTimeControl.set('');
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

	toggleSortDirection(): void {
		this.sortAscending.update((v) => !v);
	}
	toggleGameSelection(index: number): void {
		const s = new Set(this.selectedGames());
		if (s.has(index)) {
			s.delete(index);
		} else {
			s.add(index);
		}
		this.selectedGames.set(s);
	}

	// ---- Replay ----
	replayGame(): void {
		this.stopReplay();
		this.start();
		this.runReplayLogic();
	}
	continueReplay(): void {
		this.stopReplay(false);
		this.runReplayLogic();
	}
	stopSequence(): void {
		this.isReplayingSequence = false;
		this.stopReplay();
	}
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
	analyzePosition(fen: string): void {
		if (!this.pgnViewerEngine.analyzePosition(fen, this.stockfishDepth()))
			return;
		this.isAnalyzing.set(true);
		this.bestMoveInfo.set(null);
	}
	autoplayBestLine(): void {
		const info = this.bestMoveInfo();
		if (!info?.pv?.length) return;
		(async () => {
			for (const move of info.pv) {
				this.currentFen.set(move.fen);
				await new Promise((r) => setTimeout(r, 1000));
			}
		})();
	}
	previewPvMove(fen: string): void {
		this.currentFen.set(fen);
	}
	toggleAnalysis(): void {
		const wasVisible = this.analysisVisible();
		this.analysisVisible.update((v) => !v);
		// Start Stockfish analysis when the analysis panel is being opened
		if (!wasVisible && this.analyzedFen) {
			this.analyzePosition(this.analyzedFen);
		}
	}

	// ---- Load & Cache ----
	async loadPgnString(pgn: string): Promise<void> {
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
		this.loadingStatus.set('Starting PGN parser...');
		this.lastPgnHash = null;
		try {
			this.lastPgnHash = await this.pgnCacheService.hashPgn(pgn);
		} catch {
			/* ignore */
		}
		this.pgnViewerEngine.loadPgn(
			pgn,
			Date.now(),
			this.lastPgnHash ?? undefined,
			this.indexStartPositions(),
			this.maxFenPlies(),
		);
	}
	async loadFromClipboard(): Promise<void> {
		try {
			const text = await navigator.clipboard.readText();
			if (text) {
				this.pgnInput.set(text);
				this.loadPgnString(text);
			}
		} catch {
			this.showMessage('Failed to read clipboard.', 5000);
		}
	}
	async copyToClipboard(): Promise<void> {
		try {
			await navigator.clipboard.writeText(this.pgnInput());
		} catch {
			this.showMessage('Failed to copy to clipboard.', 5000);
		}
	}
	async loadFromLichess(): Promise<void> {
		const year = this.lichessYear();
		const month = this.lichessMonth();
		if (!year || !month) {
			this.showMessage('Please select a valid year and month.');
			return;
		}
		const m = month.toString().padStart(2, '0');
		this.urlInput.set(
			`lichess/broadcast/lichess_db_broadcast_${year}-${m}.pgn.zst`,
		);
		await this.loadFromUrl();
	}
	async loadFromUrl(): Promise<void> {
		const url = this.urlInput();
		if (!url) return;
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
				this.loadPgnString(content);
			});
		} catch (e) {
			console.error('Error loading from URL:', e);
			this.showMessage(`Error loading from URL: ${String(e)}`, 6000);
			this.isLoading.set(false);
			this.loadingProgress.set(0);
			this.loadingStatus.set('');
		}
	}
	clearPgnCache(): void {
		this.pgnViewerEngine.clearCache(Date.now());
		this.lastPgnHash = null;
		this.cacheInfo.set(null);
		this.showMessage('PGN cache cleared.');
	}
	async refreshCacheInfo(): Promise<void> {
		this.cacheInfo.set(await this.pgnCacheService.getCacheInfo());
	}
	onPgnZipSelected(event: Event): void {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		(async () => {
			try {
				const zip = await loadZipAsync(file);
				const pgnFile = Object.values(zip.files).find((f) =>
					f.name.endsWith('.pgn'),
				);
				if (pgnFile) {
					const content = await pgnFile.async('string');
					this.setDeferredTimeout(() => this.loadPgnString(content));
				} else {
					this.showMessage('No PGN file found in the zip archive.');
					this.isLoading.set(false);
				}
			} catch (e) {
				console.error('Error loading zip file:', e);
				this.showMessage('Error loading zip file.', 5000);
				this.isLoading.set(false);
			}
		})();
	}
	onPgnFileSelected(event: Event): void {
		const input = event.target as HTMLInputElement;
		if (!input.files?.length) return;
		const file = input.files[0];
		this.isLoading.set(true);
		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result as string;
			if (content) this.setDeferredTimeout(() => this.loadPgnString(content));
			else this.isLoading.set(false);
		};
		reader.onerror = () => {
			this.isLoading.set(false);
			this.showMessage('Error reading file.', 5000);
		};
		reader.readAsText(file);
	}

	// ---- Snapshot position ----
	snapshotCurrentPosition(): void {
		this.filterFen.set(this.currentFen());
		this.filterByFenEnabled.set(true);
	}

	/** Safe text highlighting for typeahead. */
	highlightText(text: string, query: string): TextSegment[] {
		return highlightMatch(text, query);
	}

	/** Lookup ECO opening moves from the ECO_MOVES map. */
	getOpeningMoves(code: string): string {
		return ECO_MOVES[code] || '';
	}

	// ======================================================================
	// Private methods
	// ======================================================================

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

	private getMovableDests(): Map<Key, Key[]> {
		const dests = new Map<Key, Key[]>();
		for (const move of this.chess.moves({ verbose: true })) {
			const from = move.from as Key;
			if (!dests.has(from)) dests.set(from, []);
			dests.get(from)?.push(move.to as Key);
		}
		return dests;
	}

	private handleBoardMove(orig: string, dest: string): void {
		try {
			const move = this.chess.move({ from: orig, to: dest });
			if (move) {
				this.currentFen.set(this.chess.fen());
				this.interactiveMoves.update((m) => [...m, move.san]);
				if (this.filterByFenEnabled()) this.filterFen.set(this.chess.fen());
			}
		} catch {
			this.currentFen.set(this.chess.fen());
		}
	}

	private handleWorkerMessage(data: WorkerResponse): void {
		const { type, payload, id } = data;
		if (type === 'load') {
			this.gamesMetadata.set(payload.metadata);
			this.isLoading.set(false);

			// Defer expensive aggregation to idle time so the board renders immediately
			const meta = payload.metadata;
			if ('requestIdleCallback' in window) {
				requestIdleCallback(() => this.buildFilterLists(meta), {
					timeout: 2000,
				});
			} else {
				setTimeout(() => this.buildFilterLists(meta), 0);
			}
			if (payload.count > 0) this.loadGame(0);
			this.clearFilters();
		} else if (type === 'progress') {
			this.loadingProgress.set(payload.percent);
			this.loadingStatus.set(payload.status);
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
				console.error('Worker error:', error);
				this.pgnInput.set(
					`Error parsing game: ${error} \n\nRaw PGN: \n${pgn} `,
				);
				this.moves.set([]);
				this.evaluations.set([]);
				this.moveClocks.set([]);
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
		} else if (type === 'error') {
			console.error('Worker error:', payload);
			this.isLoading.set(false);
		}
	}

	private handleStockfishMessage(event: MessageEvent): void {
		const line = event.data;
		if (typeof line !== 'string') return;
		if (line.startsWith('bestmove')) this.isAnalyzing.set(false);
		else if (line.startsWith('info') && line.includes(' pv ')) {
			const pvIndex = line.indexOf(' pv ');
			const pvString = line.substring(pvIndex + 4);
			const uciMoves = pvString.split(' ');
			if (uciMoves.length > 0) {
				const bestMove = uciMoves[0];
				let scoreText = '';
				const cpMatch = line.match(/score cp (-?\d+)/);
				const mateMatch = line.match(/score mate (-?\d+)/);
				let isBlackToMove = false;
				if (this.analyzedFen) {
					const parts = this.analyzedFen.split(' ');
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
				const sanPv = this.analyzedFen
					? this.uciToSan(this.analyzedFen, uciMoves)
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
					} catch {
						/* ignore */
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

	private analyzedFen: string | null = null;

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

	private scheduleReplay(
		timeOuts: number[],
		totalMoves: number,
		onComplete?: () => void,
	): void {
		this.isReplaying.set(true);
		this.showBetterMoveBtn.set(false);
		this.analysisVisible.set(false);
		this.bestMoveInfo.set(null);
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
						if (
							cur !== null &&
							prev !== null &&
							Math.abs(cur - prev) > this.stopOnErrorThreshold()
						) {
							this.stopReplay(false);
							this.showBetterMoveBtn.set(true);
							const prevFen = this.getFenBeforeMove(idx);
							if (prevFen) this.analyzedFen = prevFen;
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

	private formatTimeControlKey(key: string): string {
		const m = key.match(/^(\d+)\+(\d+)$/);
		if (!m) return key;
		const base = parseInt(m[1], 10);
		const inc = parseInt(m[2], 10);
		if (Number.isNaN(base) || Number.isNaN(inc)) return key;
		return base % 60 === 0 && base / 60 <= 180 ? `${base / 60}+${inc}` : key;
	}

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

	private formatTime(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		return h > 0
			? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} `
			: `${m}:${s.toString().padStart(2, '0')} `;
	}

	private parseEval(evalStr: string | null): number | null {
		if (!evalStr) return null;
		if (evalStr.startsWith('#')) {
			const val = parseInt(evalStr.substring(1), 10);
			return val > 0 ? 20 + 10 / Math.abs(val) : -(20 + 10 / Math.abs(val));
		}
		return parseFloat(evalStr);
	}

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

	private normalizeFen(fen: string): string {
		return fen.split(' ').slice(0, 4).join(' ');
	}

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

	private scrollToActiveMove(): void {
		const el = this.moveList();
		if (!el) return;
		const active = el.nativeElement.querySelector(
			'.move-btn.active',
		) as HTMLElement;
		if (active)
			active.scrollIntoView({
				behavior: 'smooth',
				block: 'nearest',
				inline: 'nearest',
			});
	}

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

	private showMessage(msg: string, duration = 4000): void {
		this.snackBar.open(msg, 'Dismiss', {
			duration,
			horizontalPosition: 'end',
			verticalPosition: 'top',
		});
	}
}
