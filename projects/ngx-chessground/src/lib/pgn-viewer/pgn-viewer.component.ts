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

	// Game information for display
	gameInfos = computed(() => {
		return this.games().map((pgn, index) => this.extractGameInfo(pgn, index));
	});

	// Replay State
	replayMode = signal<"realtime" | "proportional" | "fixed">("fixed");
	proportionalDuration = signal<number>(1); // minutes
	fixedTime = signal<number>(1); // seconds

	// UI State
	pgnInput = signal<string>("");

	// Internal Objects
	private chess = new Chess();
	// biome-ignore lint/suspicious/noExplicitAny: Timeout type differs between envs
	private replayTimeouts: any[] = [];

	// Computed
	runFunction = computed<(el: HTMLElement) => Api>(() => {
		const fen = this.currentFen();
		return (el: HTMLElement) => {
			return Chessground(el, {
				fen: fen,
				viewOnly: true,
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

	// --- PGN Loading Logic ---

	loadPgnString(pgn: string) {
		try {
			const games = this.splitPgn(pgn);
			if (games.length > 0) {
				this.games.set(games);
			} else {
				// Fallback for single game or empty
				this.games.set([pgn]);
			}
		} catch (e) {
			console.error("Invalid PGN", e);
			alert("Invalid PGN");
		}
	}

	loadPgnFromInput() {
		const pgn = this.pgnInput();
		this.loadPgnString(pgn);
		this.loadGame(0);
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
		const games = this.games();
		const selected = new Set<number>();
		for (let i = 0; i < games.length; i++) {
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

		const white = whiteMatch ? whiteMatch[1] : 'Unknown';
		const black = blackMatch ? blackMatch[1] : 'Unknown';
		const result = resultMatch ? resultMatch[1] : '*'; // * means unknown result

		// Format result for display
		let formattedResult = result;
		if (result === '1-0') formattedResult = '1-0 (White)';
		else if (result === '0-1') formattedResult = '0-1 (Black)';
		else if (result === '1/2-1/2') formattedResult = '½-½ (Draw)';

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

	next() {
		const moves = this.moves();
		const currentIdx = this.currentMoveIndex();
		if (currentIdx < moves.length - 1) {
			const nextMove = moves[currentIdx + 1];
			this.chess.move(nextMove);
			this.currentMoveIndex.set(currentIdx + 1);
			this.currentFen.set(this.chess.fen());
		}
	}

	prev() {
		if (this.currentMoveIndex() >= 0) {
			this.chess.undo();
			this.currentMoveIndex.update((i) => i - 1);
			this.currentFen.set(this.chess.fen());
		}
	}

	start() {
		this.chess.reset();
		this.currentMoveIndex.set(-1);
		this.currentFen.set(this.chess.fen());
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
		const selected = Array.from(this.selectedGames()).sort((a, b) => a - b);

		if (selected.length === 0) {
			alert("No games selected. Please select games to replay.");
			return;
		}

		for (let i = 0; i < selected.length; i++) {
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
			this.start();

			const gamePgn = this.games()[this.currentGameIndex()];
			const tempChess = new Chess();
			tempChess.loadPgn(gamePgn);
			const history = tempChess.history({ verbose: true });

			const timeOuts = this.calculateReplayTimeouts(history);

			// Actually schedule the replay
			this.scheduleReplay(timeOuts, history.length);

			// Calculate total replay time including delays
			const totalTime = timeOuts[timeOuts.length - 1] || 0;
			let delay = 0;

			if (this.replayMode() === "fixed") {
				delay = totalTime * 1000;
			} else if (this.replayMode() === "realtime") {
				delay = totalTime * 1000;
			} else if (this.replayMode() === "proportional") {
				const targetDurationSeconds = this.proportionalDuration() * 60;
				delay = targetDurationSeconds * 1000;
			}

			// Schedule the resolve after the game replay completes
			setTimeout(() => {
				resolve();
			}, delay + 500); // Add small buffer
		});
	}

	stopReplay() {
		this.replayTimeouts.forEach((t) => {
			clearTimeout(t);
		});
		this.replayTimeouts = [];
	}

	private calculateReplayTimeouts(
		history: Move[],
	): number[] {
		const timeOuts: number[] = [];

		if (this.replayMode() === "fixed") {
			for (let i = 0; i < history.length; i++) {
				timeOuts.push((i + 1) * this.fixedTime());
			}
			return timeOuts;
		}

		// Simplified proportional timing - use 1 second per move as default
		for (let i = 0; i < history.length; i++) {
			timeOuts.push((i + 1) * 1); // 1 sec default
		}

		return timeOuts;
	}

	private scheduleReplay(timeOuts: number[], totalMoves: number) {
		const totalGameTime = timeOuts[timeOuts.length - 1] || 1;

		for (let i = 0; i < totalMoves; i++) {
			let delay = 0;
			if (this.replayMode() === "fixed") {
				delay = timeOuts[i] * 1000;
			} else if (this.replayMode() === "realtime") {
				delay = timeOuts[i] * 1000;
			} else if (this.replayMode() === "proportional") {
				const targetDurationSeconds = this.proportionalDuration() * 60;
				delay = (timeOuts[i] / totalGameTime) * targetDurationSeconds * 1000;
			}

			const timeoutId = setTimeout(() => {
				this.next();
			}, delay);
			this.replayTimeouts.push(timeoutId);
		}
	}
}
