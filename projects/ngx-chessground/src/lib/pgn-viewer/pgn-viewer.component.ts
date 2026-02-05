import { CommonModule } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	input,
	model,
	signal,
	ViewChild,
	ElementRef,
} from '@angular/core';
import { Chess, Move } from 'chess.js';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import { Key } from 'chessground/types';
import { parsePgn } from 'chessops/pgn';
import { loadAsync as loadZipAsync } from 'jszip';
import { decompress as decompressZst } from 'fzstd';
import { NgxChessgroundComponent } from '../ngx-chessground/ngx-chessground.component';
import { WorkerResponse } from './pgn-processor.worker';
import { ECO_MOVES } from './eco-moves';

interface GameMetadata {
	number: number;
	white: string;
	black: string;
	result: string;
	whiteElo?: number;
	blackElo?: number;
	eco?: string; // eco is optional in worker message
	timeControl?: string;
	event?: string;
}

@Component({
	selector: 'ngx-pgn-viewer',
	standalone: true,
	imports: [CommonModule, NgxChessgroundComponent],
	templateUrl: './pgn-viewer.component.html',
	styleUrls: ['./pgn-viewer.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgxPgnViewerComponent {
	// Inputs
	pgn = input<string>('');
	highlightLastMove = input<boolean>(true);

	updateFilterWhite(event: Event) {
		this.filterWhite.set((event.target as HTMLInputElement).value);
	}

	updateFilterBlack(event: Event) {
		this.filterBlack.set((event.target as HTMLInputElement).value);
	}

	updateFilterResult(event: Event) {
		this.filterResult.set((event.target as HTMLInputElement).value);
	}

	updateFilterEco(event: Event) {
		this.filterEco.set((event.target as HTMLSelectElement).value);
	}

	updateFilterTimeControl(event: Event) {
		this.filterTimeControl.set((event.target as HTMLSelectElement).value);
	}

	updateFilterWhiteRating(event: Event) {
		this.filterWhiteRating.set((event.target as HTMLInputElement).value);
	}

	updateFilterWhiteRatingMax(event: Event) {
		this.filterWhiteRatingMax.set((event.target as HTMLInputElement).value);
	}

	updateFilterBlackRating(event: Event) {
		this.filterBlackRating.set((event.target as HTMLInputElement).value);
	}

	updateFilterBlackRatingMax(event: Event) {
		this.filterBlackRatingMax.set((event.target as HTMLInputElement).value);
	}

	toggleIgnoreColor(event: Event) {
		this.ignoreColor.set((event.target as HTMLInputElement).checked);
	}

	toggleFilterMoves(event: Event) {
		this.filterMoves.set((event.target as HTMLInputElement).checked);
	}

	getOpeningMoves(code: string): string {
		return ECO_MOVES[code] || '';
	}

	// State Signals
	// games = signal<string[]>([]);
	gamesMetadata = signal<GameMetadata[]>([]);
	currentGameIndex = signal<number>(0);
	moves = signal<string[]>([]);
	currentMoveIndex = signal<number>(-1); // -1 means start position
	currentFen = signal<string>(
		'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
	);
	isLoading = signal<boolean>(false);
	loadingProgress = signal<number>(0);
	loadingStatus = signal<string>('');
	selectedGames = signal<Set<number>>(new Set());

	// Filter Signals
	filterWhite = signal<string>('');
	filterBlack = signal<string>('');
	filterResult = signal<string>('');
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

	// Autocomplete Signals
	uniqueWhitePlayers = signal<string[]>([]);
	uniqueBlackPlayers = signal<string[]>([]);
	uniqueEcoCodes = signal<Map<string, number>>(new Map());
	uniqueTimeControls = signal<Map<string, number>>(new Map());
	uniqueEvents = signal<Map<string, number>>(new Map());

	// Computed for sorted ECO codes by popularity
	sortedEcoCodes = computed(() => {
		const ecoMap = this.uniqueEcoCodes();
		return Array.from(ecoMap.entries())
			.sort((a, b) => b[1] - a[1]) // Sort by count descending
			.map(([code, count]) => ({ code, count }));
	});

	sortedTimeControls = computed(() => {
		const tcMap = this.uniqueTimeControls();
		return Array.from(tcMap.entries())
			.sort((a, b) => b[1] - a[1]) // Sort by count descending
			.map(([tc, count]) => ({ tc, count }));
	});

	sortedEvents = computed(() => {
		const eventMap = this.uniqueEvents();
		return Array.from(eventMap.entries())
			.sort((a, b) => b[1] - a[1]) // Sort by count descending
			.map(([event, count]) => ({ event, count }));
	});

	// Filtering State
	filteredGamesIndices = signal<number[]>([]);
	isFiltering = signal<boolean>(false);
	// private filterTimeout: any = null;
	private currentFilterId = 0;
	// private gameMovesCache = new Map<number, string[]>(); // Moved to worker
	private autoSelectOnFinish = false;
	@ViewChild('moveList') moveList!: ElementRef<HTMLElement>;
	private worker: Worker | null = null;
	private activeFilterMoves: string[] = [];

	// Track moves made during interactive mode
	private interactiveMoves = signal<string[]>([]);

	// Flag to uncheck filterMoves after filtering completes
	private shouldUncheckFilterMoves = false;

	// Computed values for better reactivity
	selectedGamesCount = computed(() => this.selectedGames().size);
	canShowReplayAll = computed(
		() => this.gamesMetadata().length > 1 && this.selectedGamesCount() > 0,
	);
	currentGameInfo = computed(
		() =>
			`Game ${this.currentGameIndex() + 1} of ${this.gamesMetadata().length} `,
	);

	// Current game player info
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

	// Last move squares for board highlighting
	lastMoveSquares = computed<[Key, Key] | undefined>(() => {
		if (!this.highlightLastMove()) return undefined;
		// Depend on currentMoveIndex and currentFen to trigger recomputation when position changes
		this.currentMoveIndex();
		this.currentFen();
		const history = this.chess.history({ verbose: true });
		if (history.length === 0) return undefined;
		const lastMove = history[history.length - 1];
		return [lastMove.from as Key, lastMove.to as Key];
	});

	// Game information for display (filtered)
	filteredGameInfos = computed(() => {
		const metadata = this.gamesMetadata();
		const indices = this.filteredGamesIndices();
		return indices.map((i) => metadata[i]);
	});

	// Replay State
	replayMode = signal<'realtime' | 'proportional' | 'fixed'>('fixed');
	proportionalDuration = signal<number>(1); // minutes
	minSecondsBetweenMoves = signal<number>(1); // seconds
	fixedTime = signal<number>(1); // seconds
	stopOnError = signal<boolean>(false);
	stopOnErrorThreshold = signal<number>(1.0);

	// Clock State
	whiteTimeRemaining = signal<string>('');
	blackTimeRemaining = signal<string>('');
	showClocks = computed(
		() => this.whiteTimeRemaining() !== '' || this.blackTimeRemaining() !== '',
	);

	// Computed for replay status
	isReplaying = signal<boolean>(false);
	canContinueReplay = computed(
		() =>
			!this.isReplaying() && this.currentMoveIndex() < this.moves().length - 1,
	);

	// Stockfish State
	// Stockfish State
	stockfishWorker: Worker | null = null;
	isAnalyzing = signal<boolean>(false);
	bestMoveInfo = signal<{
		move: string;
		pv: { san: string; fen: string }[];
		score?: string;
	} | null>(null);
	showBetterMoveBtn = signal<boolean>(false);
	analysisVisible = signal<boolean>(false);

	// ... (keeping other props matching existing file if they were in range, but I'll try to target specific blocks)

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

	previewPvMove(fen: string) {
		this.currentFen.set(fen);
	}

	private analyzedFen: string | null = null;

	// Stockfish Analysis Config
	stockfishDepth = signal<number>(18);

	analyzePosition(fen: string) {
		if (!this.stockfishWorker) return;

		this.isAnalyzing.set(true);
		this.bestMoveInfo.set(null);
		this.analyzedFen = fen;

		this.stockfishWorker.postMessage('stop'); // Stop any previous
		this.stockfishWorker.postMessage(`position fen ${fen}`);
		this.stockfishWorker.postMessage(`go depth ${this.stockfishDepth()}`);
	}

	async autoplayBestLine() {
		const info = this.bestMoveInfo();
		if (!info || !info.pv || info.pv.length === 0) return;

		// Disable interactions or show indicator if needed
		for (const move of info.pv) {
			this.currentFen.set(move.fen);
			// Wait for 1 second
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	// UI State
	pgnInput = signal<string>('');
	urlInput = signal<string>('');

	// Evaluation State
	evaluations = signal<(string | null)[]>([]);
	currentEvaluation = computed(() => {
		const evals = this.evaluations();
		const index = this.currentMoveIndex();
		if (index >= 0 && index < evals.length) {
			return evals[index];
		}
		return null; // Start position or no eval
	});

	evaluationBarHeight = computed(() => {
		const evalStr = this.currentEvaluation();
		if (!evalStr) return 50; // 50% for neutral/unknown

		// Handle mate
		if (evalStr.startsWith('#')) {
			const mateIn = parseInt(evalStr.substring(1), 10);
			if (mateIn > 0) return 100; // White mates
			if (mateIn < 0) return 0; // Black mates
			return 50; // Should not happen for valid mate
		}

		// Handle numeric eval
		const evalNum = parseFloat(evalStr);
		if (Number.isNaN(evalNum)) return 50;

		// Sigmoid-like clamping
		// +5 is winning (near 100%), -5 is losing (near 0%)
		// 0 is 50%
		// Formula: 50 + (eval / 10) * 50, clamped to [5, 95] to always show some color?
		// Or standard sigmoid: 1 / (1 + exp(-k * eval))
		// Let's use a simple linear clamp for now, maxing out at +/- 5.0
		const maxEval = 5.0;
		const clampedEval = Math.max(-maxEval, Math.min(maxEval, evalNum));
		const percentage = 50 + (clampedEval / maxEval) * 50;
		return percentage;
	});

	activeColor = computed(() => {
		const fen = this.currentFen();
		const parts = fen.split(' ');
		return parts.length > 1 ? parts[1] : 'w';
	});

	// Lichess Database Date Picker State - using model for two-way binding
	lichessYear = model<number>(new Date().getFullYear());
	lichessMonth = model<number>(1);

	// Internal Objects
	private chess = new Chess();
	private replayTimeouts: ReturnType<typeof setTimeout>[] = [];
	private replayResolve: (() => void) | null = null;
	private isReplayingSequence = false;

	// Computed
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

	// Helper method to get legal move destinations for the current position
	private getMovableDests(): Map<Key, Key[]> {
		const dests = new Map<Key, Key[]>();
		const moves = this.chess.moves({ verbose: true });

		for (const move of moves) {
			const from = move.from as Key;
			if (!dests.has(from)) {
				dests.set(from, []);
			}
			dests.get(from)!.push(move.to as Key);
		}

		return dests;
	}

	// Helper method to handle moves made on the board
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

	constructor() {
		if (typeof Worker !== 'undefined') {
			this.worker = new Worker(
				new URL('./pgn-processor.worker', import.meta.url),
			);
			this.worker.onmessage = ({ data }) => this.handleWorkerMessage(data);

			// Initialize Stockfish Worker
			try {
				this.stockfishWorker = new Worker('assets/stockfish/stockfish.js');
				this.stockfishWorker.onmessage = (e) => this.handleStockfishMessage(e);
				this.stockfishWorker.postMessage('uci');
			} catch (e) {
				console.error('Failed to load Stockfish worker:', e);
			}
		} else {
			console.error('Web Workers are not supported in this environment.');
		}

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
			// Wait for DOM update
			setTimeout(() => {
				this.scrollToActiveMove();
			}, 0);
		});
	}

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

			// Count Time Controls
			const timeControls = new Map<string, number>();
			const events = new Map<string, number>();
			for (const meta of payload.metadata) {
				if (meta.timeControl) {
					timeControls.set(
						meta.timeControl,
						(timeControls.get(meta.timeControl) || 0) + 1,
					);
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

	applyFilter() {
		// const games = this.games(); // REMOVED
		const fWhite = this.filterWhite();
		const fBlack = this.filterBlack();
		const fResult = this.filterResult();
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

	clearFilters() {
		this.filterWhite.set('');
		this.filterBlack.set('');
		this.filterResult.set('');
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
		this.applyFilter();
	}

	private runFilterLogic(
		// games: string[], // REMOVED
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

		if (this.worker) {
			this.worker.postMessage({
				type: 'filter',
				id: myFilterId,
				payload: {
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
				},
			});
		}
	}

	// --- PGN Loading Logic ---

	loadPgnString(pgn: string) {
		// Reset state to ensure UI updates
		this.moves.set([]);
		this.interactiveMoves.set([]);
		this.currentMoveIndex.set(-1);
		this.currentGameIndex.set(-1); // Force change detection when setting to 0 later
		this.currentFen.set(
			'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
		);

		if (this.worker) {
			this.worker.postMessage({ type: 'load', payload: pgn, id: Date.now() });
		}
	}

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
			alert('Failed to read clipboard');
		}
	}

	async copyToClipboard() {
		try {
			await navigator.clipboard.writeText(this.pgnInput());
			// Optional: You could add a temporary "Copied!" state here if desired
		} catch (err) {
			console.error('Failed to copy to clipboard: ', err);
			alert('Failed to copy to clipboard');
		}
	}

	onProportionalDurationChange(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.proportionalDuration.set(parseFloat(value) || 1);
	}

	onMinSecondsBetweenMovesChange(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.minSecondsBetweenMoves.set(parseFloat(value) || 0.1);
	}

	onFixedTimeChange(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.fixedTime.set(parseFloat(value) || 1);
	}

	onPgnInputChange(event: Event) {
		const value = (event.target as HTMLTextAreaElement).value;
		this.pgnInput.set(value);
	}

	onUrlInputChange(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.urlInput.set(value);
	}

	updateFilterEvent(event: Event) {
		const value = (event.target as HTMLSelectElement).value;
		this.filterEvent.set(value);
	}

	// Lichess Database Date Picker Methods
	getLichessYears(): number[] {
		const currentYear = new Date().getFullYear();
		const years: number[] = [];
		for (let year = 2020; year <= currentYear; year++) {
			years.push(year);
		}
		return years;
	}

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

	onLichessMonthChange(event: Event) {
		const value = (event.target as HTMLSelectElement).value;
		const month = parseInt(value, 10);
		this.lichessMonth.set(month);
	}

	loadFromLichess() {
		const year = this.lichessYear();
		const month = this.lichessMonth();

		if (!year || !month) {
			alert('Please select a valid year and month');
			return;
		}

		// Format: lichess_db_broadcast_YYYY-MM.pgn.zst
		const monthStr = month.toString().padStart(2, '0');
		// Use relative path so it respects the base href (e.g. /ngx-chessground/ on GitHub Pages)
		const url = `lichess/broadcast/lichess_db_broadcast_${year}-${monthStr}.pgn.zst`;

		this.urlInput.set(url);
		this.loadFromUrl();
	}

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
			// Use setTimeout to ensure change detection runs properly
			setTimeout(() => {
				this.loadPgnString(content);
				this.loadGame(0);
				this.isLoading.set(false);
				this.loadingProgress.set(0);
				this.loadingStatus.set('');
			}, 0);
		} catch (e) {
			console.error('Error loading from URL:', e);
			alert(`Error loading from URL: ${e} `);
			this.isLoading.set(false);
			this.loadingProgress.set(0);
			this.loadingStatus.set('');
		}
	}

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
				// Use setTimeout to ensure change detection runs properly
				setTimeout(() => {
					this.loadPgnString(content);
					this.loadGame(0);
					this.isLoading.set(false);
				}, 0);
			} else {
				alert('No PGN file found in the zip archive.');
				this.isLoading.set(false);
			}
		} catch (e) {
			console.error('Error loading zip file:', e);
			alert('Error loading zip file.');
			this.isLoading.set(false);
		}
	}

	onPgnFileSelected(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		const file = input.files[0];
		this.isLoading.set(true);

		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result as string;
			if (content) {
				// Use setTimeout to ensure change detection runs properly
				setTimeout(() => {
					this.loadPgnString(content);
					this.loadGame(0);
					this.isLoading.set(false);
				}, 0);
			} else {
				this.isLoading.set(false);
			}
		};
		reader.onerror = () => {
			this.isLoading.set(false);
			alert('Error reading file.');
		};
		reader.readAsText(file);
	}

	// --- Sample Loading ---
	// Sample loading methods removed. Use input binding from parent.

	// --- Game Logic ---

	loadGame(index: number) {
		const count = this.gamesMetadata().length;
		if (index >= 0 && index < count) {
			this.currentGameIndex.set(index);
			this.moves.set([]); // Clear moves immediately
			this.pgnInput.set('Loading...');
			this.isLoading.set(true);

			// Offload parsing to worker
			if (this.worker) {
				this.worker.postMessage({
					type: 'loadGame',
					payload: index,
					id: Date.now(),
				});
			}
		}
	}

	toggleGameSelection(index: number) {
		const selected = new Set(this.selectedGames());
		if (selected.has(index)) {
			selected.delete(index);
		} else {
			selected.add(index);
		}
		this.selectedGames.set(selected);
	}

	selectAllGames() {
		const indices = this.filteredGamesIndices();
		const selected = new Set<number>();
		for (const i of indices) {
			selected.add(i);
		}
		this.selectedGames.set(selected);
	}

	clearSelection() {
		this.selectedGames.set(new Set());
	}

	nextGame() {
		if (this.currentGameIndex() < this.gamesMetadata().length - 1) {
			this.loadGame(this.currentGameIndex() + 1);
		}
	}

	prevGame() {
		if (this.currentGameIndex() > 0) {
			this.loadGame(this.currentGameIndex() - 1);
		}
	}

	// --- Navigation Logic ---

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

	private scrollToActiveMove() {
		if (!this.moveList) return;
		const container = this.moveList.nativeElement;
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

	next() {
		const moves = this.moves();
		const currentIdx = this.currentMoveIndex();
		if (currentIdx < moves.length - 1) {
			const nextMove = moves[currentIdx + 1];
			this.chess.move(nextMove);
			this.currentMoveIndex.set(currentIdx + 1);
			this.currentFen.set(this.chess.fen());

			// Update clocks
			const nextMoveIdx = currentIdx + 1;
			// clockHistory has initial state at index 0, so move 1 state is at index 1
			if (nextMoveIdx + 1 < this.clockHistory.length) {
				const clocks = this.clockHistory[nextMoveIdx + 1];
				this.whiteTimeRemaining.set(this.formatTime(clocks.white));
				this.blackTimeRemaining.set(this.formatTime(clocks.black));
			}
		}
	}

	prev() {
		if (this.currentMoveIndex() >= 0) {
			this.chess.undo();
			this.currentMoveIndex.update((i) => i - 1);
			this.currentFen.set(this.chess.fen());

			// Update clocks
			const currentIdx = this.currentMoveIndex();
			// clockHistory has initial state at index 0
			if (currentIdx + 1 >= 0 && currentIdx + 1 < this.clockHistory.length) {
				const clocks = this.clockHistory[currentIdx + 1];
				this.whiteTimeRemaining.set(this.formatTime(clocks.white));
				this.blackTimeRemaining.set(this.formatTime(clocks.black));
			}
		}
	}

	stopSequence() {
		this.isReplayingSequence = false;
		this.stopReplay();
	}

	toggleFilterRatingEnabled(event: Event) {
		const checked = (event.target as HTMLInputElement).checked;
		this.filterRatingEnabled.set(checked);
	}

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

	toggleStopOnError(event: Event) {
		const checked = (event.target as HTMLInputElement).checked;
		this.stopOnError.set(checked);
	}

	updateStopOnErrorThreshold(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.stopOnErrorThreshold.set(parseFloat(value) || 1.0);
	}

	start() {
		this.chess.reset();
		this.currentMoveIndex.set(-1);
		this.currentFen.set(this.chess.fen());

		// Reset clocks if we have clock info for the start
		if (this.clockHistory.length > 0) {
			const startClocks = this.clockHistory[0]; // Initial clocks before any move
			if (startClocks) {
				this.whiteTimeRemaining.set(this.formatTime(startClocks.white));
				this.blackTimeRemaining.set(this.formatTime(startClocks.black));
			}
		}
	}

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

	replayGame() {
		this.stopReplay();
		this.start();
		this.runReplayLogic();
	}

	continueReplay() {
		this.stopReplay();
		this.runReplayLogic();
	}

	private runReplayLogic() {
		// Use the currently loaded PGN from the input area
		const gamePgn = this.pgnInput();

		try {
			const tempChess = new Chess();
			tempChess.loadPgn(gamePgn);
			const history = tempChess.history({ verbose: true });

			const timeOuts = this.calculateReplayTimeouts(history);
			this.scheduleReplay(timeOuts, history.length);
		} catch (_e) {
			// console.warn("Replay PGN parsing failed with chess.js, trying chessops", e);
			try {
				const timeOuts = this.calculateReplayTimeoutsChessops(gamePgn);
				this.scheduleReplay(timeOuts, timeOuts.length);
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
			alert('No games selected. Please select games to replay.');
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

	stopReplay() {
		this.isReplaying.set(false);
		this.replayTimeouts.forEach((t) => {
			clearTimeout(t);
		});
		this.replayTimeouts = [];

		if (this.replayResolve) {
			this.replayResolve();
			this.replayResolve = null;
		}
	}

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

	// Store clock history for replay: index 0 is start, index 1 is after move 1, etc.
	private clockHistory: { white: number; black: number }[] = [];

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

	private formatTime(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);

		if (h > 0) {
			return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} `;
		}
		return `${m}:${s.toString().padStart(2, '0')} `;
	}

	private parseEval(evalStr: string | null): number | null {
		if (!evalStr) return null;
		if (evalStr.startsWith('#')) {
			const val = parseInt(evalStr.substring(1), 10);
			// 20.0 is equivalent to 20 pawns. Positive if mate for white (e.g. #3), negative if for black (e.g. #-3)
			return val > 0 ? 20 + 10 / Math.abs(val) : -(20 + 10 / Math.abs(val));
		}
		return parseFloat(evalStr);
	}

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
								this.stopReplay();
								this.isReplayingSequence = false;

								const prevFen = this.getFenBeforeMove(currentIdx);
								if (prevFen) {
									this.showBetterMoveBtn.set(true);
									this.analyzePosition(prevFen);
								}
							}
						}
					}
				}

				if (isLast && onComplete) {
					// Give a small buffer for the last animation
					setTimeout(() => {
						// Only call onComplete if we didn't stop manually (check isReplaying?)
						// stopReplay() sets isReplaying to false.
						// If we stopped on error, we don't proceed to next game in sequence.
						if (onComplete) onComplete();
					}, 500);
				}
			}, delay);
			this.replayTimeouts.push(timeoutId);
		}
	}

	// Helper to get FEN at specific move index
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
