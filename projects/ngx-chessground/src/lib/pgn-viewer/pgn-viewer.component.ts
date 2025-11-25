import { CommonModule } from "@angular/common";
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	input,
	signal,
} from "@angular/core";
import { Chess, Move } from "chess.js";
import { Chessground } from "chessground";
import { Api } from "chessground/api";
import { parsePgn } from 'chessops/pgn';
import { loadAsync as loadZipAsync } from "jszip";
import { decompress as decompressZst } from "fzstd";
import { NgxChessgroundComponent } from "../ngx-chessground/ngx-chessground.component";

interface GameMetadata {
	number: number;
	white: string;
	black: string;
	result: string;
}

@Component({
	selector: "ngx-pgn-viewer",
	standalone: true,
	imports: [CommonModule, NgxChessgroundComponent],
	templateUrl: "./pgn-viewer.component.html",
	styleUrls: ["./pgn-viewer.component.css"],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgxPgnViewerComponent {
	// Inputs
	pgn = input<string>("");

	// State Signals
	// games = signal<string[]>([]);
	gamesMetadata = signal<GameMetadata[]>([]);
	currentGameIndex = signal<number>(0);
	moves = signal<string[]>([]);
	currentMoveIndex = signal<number>(-1); // -1 means start position
	currentFen = signal<string>(
		"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
	);
	isLoading = signal<boolean>(false);
	selectedGames = signal<Set<number>>(new Set());

	// Filter Signals
	filterWhite = signal<string>("");
	filterBlack = signal<string>("");
	filterResult = signal<string>("");
	filterMoves = signal<boolean>(false);
	ignoreColor = signal<boolean>(false);

	// Autocomplete Signals
	uniqueWhitePlayers = signal<Set<string>>(new Set());
	uniqueBlackPlayers = signal<Set<string>>(new Set());

	// Filtering State
	filteredGamesIndices = signal<number[]>([]);
	isFiltering = signal<boolean>(false);
	private filterTimeout: any = null;
	private currentFilterId = 0;
	// private gameMovesCache = new Map<number, string[]>(); // Moved to worker
	private autoSelectOnFinish = false;
	private worker: Worker | null = null;
	private activeFilterMoves: string[] = [];

	// Computed values for better reactivity
	selectedGamesCount = computed(() => this.selectedGames().size);
	canShowReplayAll = computed(() => this.gamesMetadata().length > 1 && this.selectedGamesCount() > 0);
	currentGameInfo = computed(() => `Game ${this.currentGameIndex() + 1} of ${this.gamesMetadata().length}`);

	// Current game player info
	currentWhitePlayer = computed(() => {
		const metadata = this.gamesMetadata();
		const currentIndex = this.currentGameIndex();
		if (metadata.length === 0 || currentIndex < 0 || currentIndex >= metadata.length) return 'Unknown';
		return metadata[currentIndex].white;
	});

	currentBlackPlayer = computed(() => {
		const metadata = this.gamesMetadata();
		const currentIndex = this.currentGameIndex();
		if (metadata.length === 0 || currentIndex < 0 || currentIndex >= metadata.length) return 'Unknown';
		return metadata[currentIndex].black;
	});

	currentGameResult = computed(() => {
		const metadata = this.gamesMetadata();
		const currentIndex = this.currentGameIndex();
		if (metadata.length === 0 || currentIndex < 0 || currentIndex >= metadata.length) return '*';
		return metadata[currentIndex].result;
	});

	// Game information for display (filtered)
	filteredGameInfos = computed(() => {
		const metadata = this.gamesMetadata();
		const indices = this.filteredGamesIndices();
		return indices.map(i => metadata[i]);
	});

	// Replay State
	replayMode = signal<"realtime" | "proportional" | "fixed">("fixed");
	proportionalDuration = signal<number>(1); // minutes
	fixedTime = signal<number>(1); // seconds

	// Clock State
	whiteTimeRemaining = signal<string>("");
	blackTimeRemaining = signal<string>("");
	showClocks = computed(() => this.whiteTimeRemaining() !== "" || this.blackTimeRemaining() !== "");

	// UI State
	pgnInput = signal<string>("");
	urlInput = signal<string>("");

	// Lichess Database Date Picker State
	lichessYear = signal<number>(0);
	lichessMonth = signal<number>(0);

	// Internal Objects
	private chess = new Chess();
	// biome-ignore lint/suspicious/noExplicitAny: Timeout type differs between envs
	private replayTimeouts: any[] = [];
	private replayResolve: (() => void) | null = null;
	private isReplayingSequence = false;

	// Computed
	runFunction = computed<(el: HTMLElement) => Api>(() => {
		const fen = this.currentFen();
		return (el: HTMLElement) => {
			return Chessground(el, {
				fen: fen,
				viewOnly: true,
				// events: {
				// 	move: (orig, dest) => {
				// 		// Handle moves if interactive mode is added later
				// 	},
				// },
			});
		};
	});


	constructor() {
		if (typeof Worker !== 'undefined') {
			this.worker = new Worker(new URL('./pgn-processor.worker', import.meta.url));
			this.worker.onmessage = ({ data }) => this.handleWorkerMessage(data);
		} else {
			console.error('Web Workers are not supported in this environment.');
		}

		// Initialize Lichess database date picker with previous month
		const now = new Date();
		const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		const year = prevMonth.getFullYear();
		const month = prevMonth.getMonth() + 1; // getMonth() is 0-indexed, we want 1-indexed
		this.lichessYear.set(year);
		this.lichessMonth.set(month);

		// Set default URL to previous month's file
		const monthStr = month.toString().padStart(2, '0');
		// Use relative path so it respects the base href
		this.urlInput.set(`lichess/broadcast/lichess_db_broadcast_${year}-${monthStr}.pgn.zst`);

		// Effect to load initial PGN if provided
		effect(() => {
			const pgn = this.pgn();
			if (pgn) {
				this.loadPgnString(pgn);
				// Loading is now async via worker, so we don't loadGame(0) here immediately
				// It will be handled in handleWorkerMessage
			}
		});
	}

	private handleWorkerMessage(data: any) {
		const { type, payload, id } = data;
		if (type === 'load') {
			this.gamesMetadata.set(payload.metadata);
			this.isLoading.set(false);

			// Populate unique players
			const whitePlayers = new Set<string>();
			const blackPlayers = new Set<string>();
			for (const meta of payload.metadata) {
				if (meta.white && meta.white !== 'Unknown') whitePlayers.add(meta.white);
				if (meta.black && meta.black !== 'Unknown') blackPlayers.add(meta.black);
			}
			this.uniqueWhitePlayers.set(whitePlayers);
			this.uniqueBlackPlayers.set(blackPlayers);

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
			}
		} else if (type === 'loadGame') {
			const { moves, pgn, error } = payload;

			if (error) {
				console.error("Worker failed to parse game:", error);
				this.pgnInput.set(`Error parsing game: ${error}\n\nRaw PGN:\n${pgn}`);
				this.moves.set([]);
			} else {
				this.moves.set(moves);
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
		const currentMoves = this.moves().slice(0, this.currentMoveIndex() + 1);
		this.activeFilterMoves = currentMoves;

		this.autoSelectOnFinish = true;
		this.runFilterLogic(fWhite, fBlack, fResult, fMoves, fIgnoreColor, currentMoves);
	}

	clearFilters() {
		this.filterWhite.set("");
		this.filterBlack.set("");
		this.filterResult.set("");
		this.filterMoves.set(false);
		this.ignoreColor.set(false);
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
		targetMoves: string[]
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
					targetMoves: targetMoves
				}
			});
		}
	}


	// --- PGN Loading Logic ---

	loadPgnString(pgn: string) {
		// Reset state to ensure UI updates
		this.moves.set([]);
		this.currentMoveIndex.set(-1);
		this.currentGameIndex.set(-1); // Force change detection when setting to 0 later
		this.currentFen.set("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");

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
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const buffer = await response.arrayBuffer();
			let content: string;

			// Check for ZST magic bytes (0xFD2FB528) or extension
			const isZst = url.toLowerCase().endsWith('.zst');

			if (isZst) {
				const decompressed = decompressZst(new Uint8Array(buffer));
				content = new TextDecoder().decode(decompressed);
			} else {
				content = new TextDecoder().decode(buffer);
			}

			// Use setTimeout to ensure change detection runs properly
			setTimeout(() => {
				this.loadPgnString(content);
				this.loadGame(0);
				this.isLoading.set(false);
			}, 0);

		} catch (e) {
			console.error("Error loading from URL:", e);
			alert(`Error loading from URL: ${e}`);
			this.isLoading.set(false);
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
				f.name.endsWith(".pgn"),
			);

			if (pgnFile) {
				const content = await pgnFile.async("string");
				// Use setTimeout to ensure change detection runs properly
				setTimeout(() => {
					this.loadPgnString(content);
					this.loadGame(0);
					this.isLoading.set(false);
				}, 0);
			} else {
				alert("No PGN file found in the zip archive.");
				this.isLoading.set(false);
			}
		} catch (e) {
			console.error("Error loading zip file:", e);
			alert("Error loading zip file.");
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
			alert("Error reading file.");
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
			this.pgnInput.set("Loading...");
			this.isLoading.set(true);

			// Offload parsing to worker
			if (this.worker) {
				this.worker.postMessage({ type: 'loadGame', payload: index, id: Date.now() });
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

	updateFilterWhite(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.filterWhite.set(value);
	}

	updateFilterBlack(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.filterBlack.set(value);
	}

	updateFilterResult(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.filterResult.set(value);
	}

	toggleFilterMoves(event: Event) {
		const checked = (event.target as HTMLInputElement).checked;
		this.filterMoves.set(checked);
	}

	toggleIgnoreColor(event: Event) {
		const checked = (event.target as HTMLInputElement).checked;
		this.ignoreColor.set(checked);
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

		// Use the currently loaded PGN from the input area
		const gamePgn = this.pgnInput();

		try {
			const tempChess = new Chess();
			tempChess.loadPgn(gamePgn);
			const history = tempChess.history({ verbose: true });

			const timeOuts = this.calculateReplayTimeouts(history);
			this.scheduleReplay(timeOuts, history.length);
		} catch (e) {
			console.warn("Replay PGN parsing failed with chess.js, trying chessops", e);
			try {
				const timeOuts = this.calculateReplayTimeoutsChessops(gamePgn);
				this.scheduleReplay(timeOuts, timeOuts.length);
			} catch (e2) {
				console.warn("Replay PGN parsing failed with chessops, falling back to simple replay", e2);
				// Fallback: use moves list length and fixed time
				const moveCount = this.moves().length;
				const timeOuts = Array(moveCount).fill(0).map((_, i) => (i + 1) * this.fixedTime());
				this.scheduleReplay(timeOuts, moveCount);
			}
		}
	}

	async replayAllSelectedGames() {
		this.stopReplay();
		this.isReplayingSequence = true;
		const selected = Array.from(this.selectedGames()).sort((a, b) => a - b);

		if (selected.length === 0) {
			alert("No games selected. Please select games to replay.");
			return;
		}

		for (let i = 0; i < selected.length; i++) {
			if (!this.isReplayingSequence) break;
			const gameIndex = selected[i];
			this.loadGame(gameIndex);

			// Wait for the game to load
			await new Promise(resolve => setTimeout(resolve, 100));

			// Replay the current game
			await this.replayGameAsync();

			// Wait a bit between games (2 seconds)
			if (i < selected.length - 1) {
				await new Promise(resolve => setTimeout(resolve, 2000));
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
			} catch (e) {
				console.warn("Replay PGN parsing failed with chess.js, trying chessops", e);
				try {
					const timeOuts = this.calculateReplayTimeoutsChessops(gamePgn);
					this.scheduleReplay(timeOuts, timeOuts.length, () => {
						resolve();
						this.replayResolve = null;
					});
				} catch (e2) {
					console.warn("Replay PGN parsing failed with chessops, falling back to simple replay", e2);
					// Fallback
					const moveCount = this.moves().length;
					const timeOuts = Array(moveCount).fill(0).map((_, i) => (i + 1) * this.fixedTime());

					this.scheduleReplay(timeOuts, moveCount, () => {
						resolve();
						this.replayResolve = null;
					});
				}
			}
		});
	}

	stopReplay() {
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
		if (games.length === 0) throw new Error("No games found by chessops");

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
			if (child.data && child.data.comments) {
				for (const comment of child.data.comments) {
					const clkMatch = comment.match(/%clk\s+(?:(\d+):)?(\d+):(\d+)/);
					if (clkMatch) {
						hasClockComment = true;
						let h = 0, m = 0, s = 0;
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
		if (this.replayMode() === "fixed") {
			return thinkTimes.map((_, i) => (i + 1) * this.fixedTime());
		}

		if (this.replayMode() === "realtime") {
			let totalTime = 0;
			for (let i = 0; i < thinkTimes.length; i++) {
				totalTime += thinkTimes[i];
				timeOuts.push(totalTime);
			}
			return timeOuts;
		}

		if (this.replayMode() === "proportional") {
			const totalGameDuration = thinkTimes.reduce((a, b) => a + b, 0);
			const targetDurationSeconds = this.proportionalDuration() * 60;
			const scaleFactor = totalGameDuration > 0 ? targetDurationSeconds / totalGameDuration : 1;

			let currentScaledTime = 0;
			for (let i = 0; i < thinkTimes.length; i++) {
				currentScaledTime += thinkTimes[i] * scaleFactor;
				timeOuts.push(currentScaledTime);
			}
			return timeOuts;
		}

		return thinkTimes.map((_, i) => (i + 1) * 1);
	}

	// Store clock history for replay: index 0 is start, index 1 is after move 1, etc.
	private clockHistory: { white: number; black: number }[] = [];

	private calculateReplayTimeouts(
		history: Move[],
	): number[] {
		const timeOuts: number[] = [];
		this.clockHistory = [];

		// Get comments and header to parse clocks
		const comments = this.chess.getComments();
		const header = this.chess.header();

		// Try to parse time control
		let timeControlSeconds = 0;
		if (header['TimeControl']) {
			const tc = header['TimeControl'].split('+');
			timeControlSeconds = parseInt(tc[0], 10);
		}

		// Initialize clocks
		let whiteTime = timeControlSeconds;
		let blackTime = timeControlSeconds;

		// If we have clock comments, use them as source of truth
		// Check first few moves for clock comments
		let hasClockComments = false;
		for (let i = 0; i < Math.min(history.length, 10); i++) {
			const comment = comments.find(c => c.fen === history[i].after || c.fen === history[i].before); // Approximate check
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
		moveComments.forEach(c => fenToComment.set(c.fen, c.comment));

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
					let h = 0, m = 0, s = 0;

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
			this.whiteTimeRemaining.set("");
			this.blackTimeRemaining.set("");
		} else {
			// Set initial clocks for display
			if (this.clockHistory.length > 0) {
				this.whiteTimeRemaining.set(this.formatTime(this.clockHistory[0].white));
				this.blackTimeRemaining.set(this.formatTime(this.clockHistory[0].black));
			}
		}

		if (this.replayMode() === "fixed") {
			for (let i = 0; i < history.length; i++) {
				timeOuts.push((i + 1) * this.fixedTime());
			}
			return timeOuts;
		}

		if (this.replayMode() === "realtime") {
			let totalTime = 0;
			for (let i = 0; i < thinkTimes.length; i++) {
				totalTime += thinkTimes[i];
				timeOuts.push(totalTime);
			}
			return timeOuts;
		}

		if (this.replayMode() === "proportional") {
			// Calculate total game duration
			const totalGameDuration = thinkTimes.reduce((a, b) => a + b, 0);
			const targetDurationSeconds = this.proportionalDuration() * 60;
			const scaleFactor = totalGameDuration > 0 ? targetDurationSeconds / totalGameDuration : 1;

			let currentScaledTime = 0;
			for (let i = 0; i < thinkTimes.length; i++) {
				currentScaledTime += thinkTimes[i] * scaleFactor;
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
			return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
		}
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	private scheduleReplay(timeOuts: number[], totalMoves: number, onComplete?: () => void) {
		const totalGameTime = timeOuts[timeOuts.length - 1] || 1;

		if (totalMoves === 0 && onComplete) {
			onComplete();
			return;
		}

		for (let i = 0; i < totalMoves; i++) {
			let delay = 0;
			if (this.replayMode() === "fixed") {
				delay = timeOuts[i] * 1000;
			} else if (this.replayMode() === "realtime") {
				delay = timeOuts[i] * 1000;
			} else if (this.replayMode() === "proportional") {
				// Proportional timeouts are already calculated in seconds in calculateReplayTimeouts
				// Just convert to ms
				delay = timeOuts[i] * 1000;
			}

			const isLast = i === totalMoves - 1;
			const timeoutId = setTimeout(() => {
				this.next();
				if (isLast && onComplete) {
					// Give a small buffer for the last animation
					setTimeout(onComplete, 500);
				}
			}, delay);
			this.replayTimeouts.push(timeoutId);
		}
	}
}
