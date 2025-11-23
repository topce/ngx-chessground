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
import * as JSZip from "jszip";
import { NgxChessgroundComponent } from "../ngx-chessground/ngx-chessground.component";

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
	games = signal<string[]>([]);
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
	private gameMovesCache = new Map<number, string[]>();
	private autoSelectOnFinish = false;

	// Computed values for better reactivity
	selectedGamesCount = computed(() => this.selectedGames().size);
	canShowReplayAll = computed(() => this.games().length > 1 && this.selectedGamesCount() > 0);
	currentGameInfo = computed(() => `Game ${this.currentGameIndex() + 1} of ${this.games().length}`);

	// Current game player info
	currentWhitePlayer = computed(() => {
		const games = this.games();
		const currentIndex = this.currentGameIndex();
		console.log('currentWhitePlayer computed:', { gamesLength: games.length, currentIndex });
		if (games.length === 0 || currentIndex < 0 || currentIndex >= games.length) return 'Unknown';
		const gameInfo = this.extractGameInfo(games[currentIndex], currentIndex);
		console.log('White player:', gameInfo.white);
		return gameInfo.white;
	});

	currentBlackPlayer = computed(() => {
		const games = this.games();
		const currentIndex = this.currentGameIndex();
		if (games.length === 0 || currentIndex < 0 || currentIndex >= games.length) return 'Unknown';
		const gameInfo = this.extractGameInfo(games[currentIndex], currentIndex);
		console.log('Black player:', gameInfo.black);
		return gameInfo.black;
	});

	currentGameResult = computed(() => {
		const games = this.games();
		const currentIndex = this.currentGameIndex();
		if (games.length === 0 || currentIndex < 0 || currentIndex >= games.length) return '*';
		const gameInfo = this.extractGameInfo(games[currentIndex], currentIndex);
		console.log('Game result:', gameInfo.result);
		return gameInfo.result;
	});

	// Game information for display (filtered)
	filteredGameInfos = computed(() => {
		const games = this.games();
		const indices = this.filteredGamesIndices();
		return indices.map(i => this.extractGameInfo(games[i], i));
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
		// Effect to load initial PGN if provided
		effect(() => {
			const pgn = this.pgn();
			if (pgn) {
				this.loadPgnString(pgn);
				// Use setTimeout to ensure games signal is set before loading
				setTimeout(() => {
					if (this.games().length > 0) {
						this.loadGame(0);
					}
				}, 0);
			}
		});
	}

	applyFilter() {
		const games = this.games();
		const fWhite = this.filterWhite();
		const fBlack = this.filterBlack();
		const fResult = this.filterResult();
		const fMoves = this.filterMoves();
		const fIgnoreColor = this.ignoreColor();
		const currentMoves = this.moves().slice(0, this.currentMoveIndex() + 1);

		this.autoSelectOnFinish = true;
		this.runFilterLogic(games, fWhite, fBlack, fResult, fMoves, fIgnoreColor, currentMoves);
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

	private lastFilterParams = {
		white: "",
		black: "",
		result: "",
		moves: false,
		ignoreColor: false,
		targetMoves: [] as string[]
	};

	private runFilterLogic(
		games: string[],
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

		const onComplete = (indices: number[]) => {
			this.filteredGamesIndices.set(indices);
			this.isFiltering.set(false);
			this.lastFilterParams = { white: fWhite, black: fBlack, result: fResult, moves: fMoves, ignoreColor: fIgnoreColor, targetMoves };

			if (this.autoSelectOnFinish) {
				this.selectAllGames();
				this.autoSelectOnFinish = false;
			}
		};

		// If no filters, return all indices immediately
		if (!fWhite && !fBlack && !fResult && !fMoves) {
			onComplete(games.map((_, i) => i));
			return;
		}

		const fWhiteLower = fWhite.toLowerCase();
		const fBlackLower = fBlack.toLowerCase();
		const fResultLower = fResult.toLowerCase();

		// Check for iterative filtering opportunity
		let candidateIndices: number[] = [];

		if (
			this.lastFilterParams.white === fWhite &&
			this.lastFilterParams.black === fBlack &&
			this.lastFilterParams.result === fResult &&
			this.lastFilterParams.moves === fMoves &&
			this.lastFilterParams.ignoreColor === fIgnoreColor &&
			fMoves && // Only relevant if move filtering is on
			targetMoves.length > this.lastFilterParams.targetMoves.length &&
			this.arraysEqualPrefix(targetMoves, this.lastFilterParams.targetMoves)
		) {
			// Iterative: use previous results
			candidateIndices = this.filteredGamesIndices();
		} else {
			// Full scan: First pass - Synchronous string filtering
			for (let i = 0; i < games.length; i++) {
				const pgn = games[i];
				const info = this.extractGameInfo(pgn, i);
				const whiteName = info.white.toLowerCase();
				const blackName = info.black.toLowerCase();

				let matchWhite = true;
				let matchBlack = true;

				if (fIgnoreColor) {
					// If ignore color, fWhite must match either white or black player
					if (fWhiteLower && !(whiteName.includes(fWhiteLower) || blackName.includes(fWhiteLower))) matchWhite = false;
					// And fBlack must match either white or black player (if specified)
					if (fBlackLower && !(whiteName.includes(fBlackLower) || blackName.includes(fBlackLower))) matchBlack = false;
				} else {
					if (fWhiteLower && !whiteName.includes(fWhiteLower)) matchWhite = false;
					if (fBlackLower && !blackName.includes(fBlackLower)) matchBlack = false;
				}

				if (!matchWhite || !matchBlack) continue;
				if (fResultLower && !info.result.toLowerCase().includes(fResultLower)) continue;

				candidateIndices.push(i);
			}
		}

		// If moves filter is NOT active, we are done
		if (!fMoves) {
			onComplete(candidateIndices);
			return;
		}

		// Second pass: Async chunked moves filtering (cached)
		const finalIndices: number[] = [];
		const chunkSize = 50;
		let currentIndex = 0;
		const tempChess = new Chess();

		const processChunk = () => {
			// Check cancellation
			if (this.currentFilterId !== myFilterId) {
				return;
			}

			const startTime = performance.now();

			while (currentIndex < candidateIndices.length) {
				// Yield if we've taken too long (e.g., > 15ms)
				if (performance.now() - startTime > 15) {
					setTimeout(processChunk, 0);
					return;
				}

				const gameIndex = candidateIndices[currentIndex];
				const pgn = games[gameIndex];
				currentIndex++;

				try {
					let gameMoves = this.gameMovesCache.get(gameIndex);

					if (!gameMoves) {
						// Not in cache, parse and store
						tempChess.loadPgn(pgn);
						gameMoves = tempChess.history();
						this.gameMovesCache.set(gameIndex, gameMoves);
					}

					// Check if game starts with target moves
					let match = true;
					if (targetMoves.length > gameMoves.length) {
						match = false;
					} else {
						// Optimization: If iterative, we only need to check the NEW moves
						// But checking all is fast enough with arrays.
						for (let i = 0; i < targetMoves.length; i++) {
							if (gameMoves[i] !== targetMoves[i]) {
								match = false;
								break;
							}
						}
					}

					if (match) {
						finalIndices.push(gameIndex);
					}
				} catch (e) {
					// Silent catch
				}
			}

			// Done
			onComplete(finalIndices);
		};

		// Start processing
		processChunk();
	}

	private arraysEqualPrefix(a: string[], prefix: string[]): boolean {
		if (prefix.length > a.length) return false;
		for (let i = 0; i < prefix.length; i++) {
			if (a[i] !== prefix[i]) return false;
		}
		return true;
	}

	// --- PGN Loading Logic ---

	loadPgnString(pgn: string) {
		// Clear cache when loading new PGN
		this.gameMovesCache.clear();
		// Reset state to ensure UI updates
		this.moves.set([]);
		this.currentMoveIndex.set(-1);
		this.currentGameIndex.set(-1); // Force change detection when setting to 0 later
		this.currentFen.set("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");

		try {
			const games = this.splitPgn(pgn);
			if (games.length > 0) {
				this.games.set(games);

				// Populate unique players
				const whitePlayers = new Set<string>();
				const blackPlayers = new Set<string>();

				for (let i = 0; i < games.length; i++) {
					const info = this.extractGameInfo(games[i], i);
					if (info.white && info.white !== 'Unknown') whitePlayers.add(info.white);
					if (info.black && info.black !== 'Unknown') blackPlayers.add(info.black);
				}

				this.uniqueWhitePlayers.set(whitePlayers);
				this.uniqueBlackPlayers.set(blackPlayers);

			} else {
				// Fallback for single game or empty
				this.games.set([pgn]);
				this.uniqueWhitePlayers.set(new Set());
				this.uniqueBlackPlayers.set(new Set());
			}
		} catch (e) {
			console.error("Invalid PGN", e);
			alert("Invalid PGN");
		}

		// Automatically clear filters and select all games
		// Use setTimeout to ensure games are fully loaded and signals propagated
		setTimeout(() => {
			this.clearFilters();
		}, 100);
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

	async onPgnZipSelected(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		const file = input.files[0];
		this.isLoading.set(true);

		try {
			const zip = await JSZip.loadAsync(file);
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

	private splitPgn(pgn: string): string[] {
		// PGN standard: games are separated by blank lines, each starting with [Event "..."]
		// Split before each [Event tag that appears at the start of a line
		const parts = pgn.split(/(?=(?:^|\r?\n)\[Event\s+")/m);
		const games: string[] = [];

		for (const part of parts) {
			const trimmed = part.trim();
			if (trimmed.length === 0) continue;
			// Only add if it starts with a tag pair (valid PGN game)
			if (/^\[Event\s+"/.test(trimmed)) {
				games.push(trimmed);
			}
		}

		return games;
	}

	// --- Sample Loading ---
	// Sample loading methods removed. Use input binding from parent.

	// --- Game Logic ---

	loadGame(index: number) {
		const games = this.games();
		if (index >= 0 && index < games.length) {
			this.currentGameIndex.set(index);
			const gamePgn = games[index];

			try {
				const tempChess = new Chess();
				tempChess.loadPgn(gamePgn);

				const moves = tempChess.history();
				this.moves.set(moves);
				this.chess.reset();
				this.currentMoveIndex.set(-1);
				this.currentFen.set(this.chess.fen());
				this.stopReplay();

				// Update the textarea to show the current game's PGN
				this.pgnInput.set(gamePgn);
			} catch (e) {
				console.error("Error loading game", e);
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

	private extractGameInfo(pgn: string, index: number): { number: number; white: string; black: string; result: string } {
		const whiteMatch = pgn.match(/\[White\s+"([^"]+)"\]/);
		const blackMatch = pgn.match(/\[Black\s+"([^"]+)"\]/);
		const resultMatch = pgn.match(/\[Result\s+"([^"]+)"\]/);

		const whiteEloMatch = pgn.match(/\[WhiteElo\s+"([^"]+)"\]/);
		const blackEloMatch = pgn.match(/\[BlackElo\s+"([^"]+)"\]/);
		const whiteTitleMatch = pgn.match(/\[WhiteTitle\s+"([^"]+)"\]/);
		const blackTitleMatch = pgn.match(/\[BlackTitle\s+"([^"]+)"\]/);

		let white = whiteMatch ? whiteMatch[1] : 'Unknown';
		let black = blackMatch ? blackMatch[1] : 'Unknown';
		const result = resultMatch ? resultMatch[1] : '*'; // * means unknown result

		// Add titles and ratings
		if (whiteTitleMatch) white = `${whiteTitleMatch[1]} ${white}`;
		if (whiteEloMatch) white = `${white} (${whiteEloMatch[1]})`;

		if (blackTitleMatch) black = `${blackTitleMatch[1]} ${black}`;
		if (blackEloMatch) black = `${black} (${blackEloMatch[1]})`;

		// Format result for display
		let formattedResult = result;
		if (result === '1-0') formattedResult = '1-0';
		else if (result === '0-1') formattedResult = '0-1';
		else if (result === '1/2-1/2') formattedResult = '½-½';

		return {
			number: index + 1,
			white,
			black,
			result: formattedResult
		};
	}

	nextGame() {
		if (this.currentGameIndex() < this.games().length - 1) {
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

		const gamePgn = this.games()[this.currentGameIndex()];
		const tempChess = new Chess();
		tempChess.loadPgn(gamePgn);
		const history = tempChess.history({ verbose: true });

		const timeOuts = this.calculateReplayTimeouts(history);
		this.scheduleReplay(timeOuts, history.length);
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

			const gamePgn = this.games()[this.currentGameIndex()];
			const tempChess = new Chess();
			tempChess.loadPgn(gamePgn);
			const history = tempChess.history({ verbose: true });

			const timeOuts = this.calculateReplayTimeouts(history);

			// Actually schedule the replay
			this.scheduleReplay(timeOuts, history.length, () => {
				resolve();
				this.replayResolve = null;
			});
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
		tempChess.loadPgn(this.games()[this.currentGameIndex()]);
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
			const comment = fenToComment.get(move.after);

			let moveTime = 0;

			if (comment) {
				// Try to parse %clk
				const clkMatch = comment.match(/%clk\s+(\d+):(\d+):(\d+)/) || comment.match(/%clk\s+(\d+):(\d+)/);
				if (clkMatch) {
					hasClockComments = true;
					let h = 0, m = 0, s = 0;
					if (clkMatch.length === 4) {
						h = parseInt(clkMatch[1], 10);
						m = parseInt(clkMatch[2], 10);
						s = parseInt(clkMatch[3], 10);
					} else {
						m = parseInt(clkMatch[1], 10);
						s = parseInt(clkMatch[2], 10);
					}

					const timeInSeconds = h * 3600 + m * 60 + s;

					if (isWhite) {
						moveTime = Math.max(0.1, whiteTime - timeInSeconds); // Ensure at least small delay
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
