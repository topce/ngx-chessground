
import { CommonModule } from "@angular/common";
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
} from "@angular/core";
import { Chess, Move } from "chess.js";
import { Chessground } from "chessground";
import { Api } from "chessground/api";
import { parsePgn } from 'chessops/pgn';
import { loadAsync as loadZipAsync } from "jszip";
import { decompress as decompressZst } from "fzstd";
import { NgxChessgroundComponent } from "../ngx-chessground/ngx-chessground.component";
import { WorkerResponse } from "./pgn-processor.worker";
import { ECO_MOVES } from "./eco-moves";

interface GameMetadata {
	number: number;
	white: string;
	black: string;
	result: string;
	eco?: string; // eco is optional in worker message
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

	getOpeningMoves(code: string): string {
		return ECO_MOVES[code] || "";
	}


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
	loadingProgress = signal<number>(0);
	loadingStatus = signal<string>("");
	selectedGames = signal<Set<number>>(new Set());

	// Filter Signals
	filterWhite = signal<string>("");
	filterBlack = signal<string>("");
	filterResult = signal<string>("");
	filterMoves = signal<boolean>(false);
	ignoreColor = signal<boolean>(false);
	filterWhiteRating = signal<string>("2000");
	filterBlackRating = signal<string>("2000");
	filterWhiteRatingMax = signal<string>("3000");
	filterBlackRatingMax = signal<string>("3000");
	filterEco = signal<string>("");

	// Autocomplete Signals
	uniqueWhitePlayers = signal<Set<string>>(new Set());
	uniqueBlackPlayers = signal<Set<string>>(new Set());
	uniqueEcoCodes = signal<Map<string, number>>(new Map());

	// Computed for sorted ECO codes by popularity
	sortedEcoCodes = computed(() => {
		const ecoMap = this.uniqueEcoCodes();
		return Array.from(ecoMap.entries())
			.sort((a, b) => b[1] - a[1]) // Sort by count descending
			.map(([code, count]) => ({ code, count }));
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

	// Computed values for better reactivity
	selectedGamesCount = computed(() => this.selectedGames().size);
	canShowReplayAll = computed(() => this.gamesMetadata().length > 1 && this.selectedGamesCount() > 0);
	currentGameInfo = computed(() => `Game ${this.currentGameIndex() + 1} of ${this.gamesMetadata().length} `);

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
	minSecondsBetweenMoves = signal<number>(1); // seconds
	fixedTime = signal<number>(1); // seconds
	stopOnError = signal<boolean>(false);
	stopOnErrorThreshold = signal<number>(1.00);

	// Clock State
	whiteTimeRemaining = signal<string>("");
	blackTimeRemaining = signal<string>("");
	showClocks = computed(() => this.whiteTimeRemaining() !== "" || this.blackTimeRemaining() !== "");

	// Computed for replay status
	isReplaying = signal<boolean>(false);
	canContinueReplay = computed(() => !this.isReplaying() && this.currentMoveIndex() < this.moves().length - 1);

	// Stockfish State
	stockfishWorker: Worker | null = null;
	isAnalyzing = signal<boolean>(false);
	bestMoveInfo = signal<{ move: string; pv: string; score?: string } | null>(null);
	showBetterMoveBtn = signal<boolean>(false);
	analysisVisible = signal<boolean>(false);


	// UI State
	pgnInput = signal<string>("");
	urlInput = signal<string>("");

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
			if (mateIn < 0) return 0;   // Black mates
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

	// ECO Code to Opening Name Mapping (based on Wikipedia)
	private static readonly ECO_NAMES: Record<string, string> = {
		// A00-A39: Flank Openings
		'A00': 'Irregular Openings',
		'A01': 'Nimzowitsch-Larsen Attack',
		'A02': "Bird's Opening",
		'A03': "Bird's Opening",
		'A04': 'Zukertort Opening',
		'A05': 'Zukertort Opening',
		'A06': 'Zukertort Opening',
		'A07': 'Réti Opening',
		'A08': 'Réti Opening',
		'A09': 'Réti Opening',
		'A10': 'English Opening',
		'A11': 'English Opening',
		'A12': 'English Opening',
		'A13': 'English Opening',
		'A14': 'English Opening',
		'A15': 'English Opening',
		'A16': 'English Opening',
		'A17': 'English Opening',
		'A18': 'English Opening',
		'A19': 'English Opening',
		'A20': 'English Opening',
		'A21': 'English Opening',
		'A22': 'English Opening',
		'A23': 'English Opening',
		'A24': 'English Opening',
		'A25': 'English Opening',
		'A26': 'English Opening',
		'A27': 'English Opening',
		'A28': 'English Opening',
		'A29': 'English Opening',
		'A30': 'English Opening',
		'A31': 'English Opening',
		'A32': 'English Opening',
		'A33': 'English Opening',
		'A34': 'English Opening',
		'A35': 'English Opening',
		'A36': 'English Opening',
		'A37': 'English Opening',
		'A38': 'English Opening',
		'A39': 'English Opening',
		// A40-A44: Queen's Pawn
		'A40': "Queen's Pawn Game",
		'A41': "Queen's Pawn Game",
		'A42': "Queen's Pawn Game",
		'A43': 'Old Benoni Defense',
		'A44': 'Old Benoni Defense',
		// A45-A49: Indian Systems
		'A45': 'Indian Defense',
		'A46': "Queen's Pawn Game",
		'A47': "Queen's Indian Defense",
		'A48': "Queen's Indian Defense",
		'A49': "Queen's Indian Defense",
		// A50-A79: Indian Defenses
		'A50': 'Indian Defense',
		'A51': 'Budapest Gambit',
		'A52': 'Budapest Gambit',
		'A53': 'Old Indian Defense',
		'A54': 'Old Indian Defense',
		'A55': 'Old Indian Defense',
		'A56': 'Benoni Defense',
		'A57': 'Benko Gambit',
		'A58': 'Benko Gambit',
		'A59': 'Benko Gambit',
		'A60': 'Benoni Defense',
		'A61': 'Benoni Defense',
		'A62': 'Benoni Defense',
		'A63': 'Benoni Defense',
		'A64': 'Benoni Defense',
		'A65': 'Benoni Defense',
		'A66': 'Benoni Defense',
		'A67': 'Benoni Defense',
		'A68': 'Benoni Defense',
		'A69': 'Benoni Defense',
		'A70': 'Benoni Defense',
		'A71': 'Benoni Defense',
		'A72': 'Benoni Defense',
		'A73': 'Benoni Defense',
		'A74': 'Benoni Defense',
		'A75': 'Benoni Defense',
		'A76': 'Benoni Defense',
		'A77': 'Benoni Defense',
		'A78': 'Benoni Defense',
		'A79': 'Benoni Defense',
		// A80-A99: Dutch Defense
		'A80': 'Dutch Defense',
		'A81': 'Dutch Defense',
		'A82': 'Dutch Defense',
		'A83': 'Dutch Defense',
		'A84': 'Dutch Defense',
		'A85': 'Dutch Defense',
		'A86': 'Dutch Defense',
		'A87': 'Dutch Defense',
		'A88': 'Dutch Defense',
		'A89': 'Dutch Defense',
		'A90': 'Dutch Defense',
		'A91': 'Dutch Defense',
		'A92': 'Dutch Defense',
		'A93': 'Dutch Defense',
		'A94': 'Dutch Defense',
		'A95': 'Dutch Defense',
		'A96': 'Dutch Defense',
		'A97': 'Dutch Defense',
		'A98': 'Dutch Defense',
		'A99': 'Dutch Defense',
		// B00-B09: Semi-Open Games
		'B00': 'Uncommon King Pawn Opening',
		'B01': 'Scandinavian Defense',
		'B02': "Alekhine's Defense",
		'B03': "Alekhine's Defense",
		'B04': "Alekhine's Defense",
		'B05': "Alekhine's Defense",
		'B06': 'Modern Defense',
		'B07': 'Pirc Defense',
		'B08': 'Pirc Defense',
		'B09': 'Pirc Defense',
		// B10-B19: Caro-Kann
		'B10': 'Caro-Kann Defense',
		'B11': 'Caro-Kann Defense',
		'B12': 'Caro-Kann Defense',
		'B13': 'Caro-Kann Defense',
		'B14': 'Caro-Kann Defense',
		'B15': 'Caro-Kann Defense',
		'B16': 'Caro-Kann Defense',
		'B17': 'Caro-Kann Defense',
		'B18': 'Caro-Kann Defense',
		'B19': 'Caro-Kann Defense',
		// B20-B99: Sicilian Defense
		'B20': 'Sicilian Defense',
		'B21': 'Sicilian Defense',
		'B22': 'Sicilian Defense',
		'B23': 'Sicilian Defense',
		'B24': 'Sicilian Defense',
		'B25': 'Sicilian Defense',
		'B26': 'Sicilian Defense',
		'B27': 'Sicilian Defense',
		'B28': 'Sicilian Defense',
		'B29': 'Sicilian Defense',
		'B30': 'Sicilian Defense',
		'B31': 'Sicilian Defense',
		'B32': 'Sicilian Defense',
		'B33': 'Sicilian Defense',
		'B34': 'Sicilian Defense',
		'B35': 'Sicilian Defense',
		'B36': 'Sicilian Defense',
		'B37': 'Sicilian Defense',
		'B38': 'Sicilian Defense',
		'B39': 'Sicilian Defense',
		'B40': 'Sicilian Defense',
		'B41': 'Sicilian Defense',
		'B42': 'Sicilian Defense',
		'B43': 'Sicilian Defense',
		'B44': 'Sicilian Defense',
		'B45': 'Sicilian Defense',
		'B46': 'Sicilian Defense',
		'B47': 'Sicilian Defense',
		'B48': 'Sicilian Defense',
		'B49': 'Sicilian Defense',
		'B50': 'Sicilian Defense',
		'B51': 'Sicilian Defense',
		'B52': 'Sicilian Defense',
		'B53': 'Sicilian Defense',
		'B54': 'Sicilian Defense',
		'B55': 'Sicilian Defense',
		'B56': 'Sicilian Defense',
		'B57': 'Sicilian Defense',
		'B58': 'Sicilian Defense',
		'B59': 'Sicilian Defense',
		'B60': 'Sicilian Defense',
		'B61': 'Sicilian Defense',
		'B62': 'Sicilian Defense',
		'B63': 'Sicilian Defense',
		'B64': 'Sicilian Defense',
		'B65': 'Sicilian Defense',
		'B66': 'Sicilian Defense',
		'B67': 'Sicilian Defense',
		'B68': 'Sicilian Defense',
		'B69': 'Sicilian Defense',
		'B70': 'Sicilian Defense',
		'B71': 'Sicilian Defense',
		'B72': 'Sicilian Defense',
		'B73': 'Sicilian Defense',
		'B74': 'Sicilian Defense',
		'B75': 'Sicilian Defense',
		'B76': 'Sicilian Defense',
		'B77': 'Sicilian Defense',
		'B78': 'Sicilian Defense',
		'B79': 'Sicilian Defense',
		'B80': 'Sicilian Defense',
		'B81': 'Sicilian Defense',
		'B82': 'Sicilian Defense',
		'B83': 'Sicilian Defense',
		'B84': 'Sicilian Defense',
		'B85': 'Sicilian Defense',
		'B86': 'Sicilian Defense',
		'B87': 'Sicilian Defense',
		'B88': 'Sicilian Defense',
		'B89': 'Sicilian Defense',
		'B90': 'Sicilian Defense',
		'B91': 'Sicilian Defense',
		'B92': 'Sicilian Defense',
		'B93': 'Sicilian Defense',
		'B94': 'Sicilian Defense',
		'B95': 'Sicilian Defense',
		'B96': 'Sicilian Defense',
		'B97': 'Sicilian Defense',
		'B98': 'Sicilian Defense',
		'B99': 'Sicilian Defense',
		// C00-C19: French Defense and others
		'C00': 'French Defense',
		'C01': 'French Defense',
		'C02': 'French Defense',
		'C03': 'French Defense',
		'C04': 'French Defense',
		'C05': 'French Defense',
		'C06': 'French Defense',
		'C07': 'French Defense',
		'C08': 'French Defense',
		'C09': 'French Defense',
		'C10': 'French Defense',
		'C11': 'French Defense',
		'C12': 'French Defense',
		'C13': 'French Defense',
		'C14': 'French Defense',
		'C15': 'French Defense',
		'C16': 'French Defense',
		'C17': 'French Defense',
		'C18': 'French Defense',
		'C19': 'French Defense',
		// C20-C99: Open Games
		'C20': 'Open Game',
		'C21': 'Center Game',
		'C22': 'Center Game',
		'C23': "Bishop's Opening",
		'C24': "Bishop's Opening",
		'C25': 'Vienna Game',
		'C26': 'Vienna Game',
		'C27': 'Vienna Game',
		'C28': 'Vienna Game',
		'C29': 'Vienna Game',
		'C30': "King's Gambit",
		'C31': "King's Gambit",
		'C32': "King's Gambit",
		'C33': "King's Gambit",
		'C34': "King's Gambit",
		'C35': "King's Gambit",
		'C36': "King's Gambit",
		'C37': "King's Gambit",
		'C38': "King's Gambit",
		'C39': "King's Gambit",
		'C40': "King's Knight Opening",
		'C41': 'Philidor Defense',
		'C42': 'Petrov Defense',
		'C43': 'Petrov Defense',
		'C44': 'Scotch Game',
		'C45': 'Scotch Game',
		'C46': 'Three Knights Game',
		'C47': 'Four Knights Game',
		'C48': 'Four Knights Game',
		'C49': 'Four Knights Game',
		'C50': 'Italian Game',
		'C51': 'Italian Game',
		'C52': 'Italian Game',
		'C53': 'Italian Game',
		'C54': 'Italian Game',
		'C55': 'Two Knights Defense',
		'C56': 'Two Knights Defense',
		'C57': 'Two Knights Defense',
		'C58': 'Two Knights Defense',
		'C59': 'Two Knights Defense',
		'C60': 'Ruy Lopez',
		'C61': 'Ruy Lopez',
		'C62': 'Ruy Lopez',
		'C63': 'Ruy Lopez',
		'C64': 'Ruy Lopez',
		'C65': 'Ruy Lopez',
		'C66': 'Ruy Lopez',
		'C67': 'Ruy Lopez',
		'C68': 'Ruy Lopez',
		'C69': 'Ruy Lopez',
		'C70': 'Ruy Lopez',
		'C71': 'Ruy Lopez',
		'C72': 'Ruy Lopez',
		'C73': 'Ruy Lopez',
		'C74': 'Ruy Lopez',
		'C75': 'Ruy Lopez',
		'C76': 'Ruy Lopez',
		'C77': 'Ruy Lopez',
		'C78': 'Ruy Lopez',
		'C79': 'Ruy Lopez',
		'C80': 'Ruy Lopez',
		'C81': 'Ruy Lopez',
		'C82': 'Ruy Lopez',
		'C83': 'Ruy Lopez',
		'C84': 'Ruy Lopez',
		'C85': 'Ruy Lopez',
		'C86': 'Ruy Lopez',
		'C87': 'Ruy Lopez',
		'C88': 'Ruy Lopez',
		'C89': 'Ruy Lopez',
		'C90': 'Ruy Lopez',
		'C91': 'Ruy Lopez',
		'C92': 'Ruy Lopez',
		'C93': 'Ruy Lopez',
		'C94': 'Ruy Lopez',
		'C95': 'Ruy Lopez',
		'C96': 'Ruy Lopez',
		'C97': 'Ruy Lopez',
		'C98': 'Ruy Lopez',
		'C99': 'Ruy Lopez',
		// D00-D99: Closed Games and Queen's Gambit
		'D00': "Queen's Pawn Game",
		'D01': 'Richter-Veresov Attack',
		'D02': "Queen's Pawn Game",
		'D03': 'Torre Attack',
		'D04': "Queen's Pawn Game",
		'D05': "Queen's Pawn Game",
		'D06': "Queen's Gambit",
		'D07': "Queen's Gambit",
		'D08': "Queen's Gambit",
		'D09': "Queen's Gambit",
		'D10': "Queen's Gambit Declined",
		'D11': "Queen's Gambit Declined",
		'D12': "Queen's Gambit Declined",
		'D13': "Queen's Gambit Declined",
		'D14': "Queen's Gambit Declined",
		'D15': "Queen's Gambit Declined Slav",
		'D16': "Queen's Gambit Declined Slav",
		'D17': "Queen's Gambit Declined Slav",
		'D18': "Queen's Gambit Declined Slav",
		'D19': "Queen's Gambit Declined Slav",
		'D20': "Queen's Gambit Accepted",
		'D21': "Queen's Gambit Accepted",
		'D22': "Queen's Gambit Accepted",
		'D23': "Queen's Gambit Accepted",
		'D24': "Queen's Gambit Accepted",
		'D25': "Queen's Gambit Accepted",
		'D26': "Queen's Gambit Accepted",
		'D27': "Queen's Gambit Accepted",
		'D28': "Queen's Gambit Accepted",
		'D29': "Queen's Gambit Accepted",
		'D30': "Queen's Gambit Declined",
		'D31': "Queen's Gambit Declined",
		'D32': "Queen's Gambit Declined",
		'D33': "Queen's Gambit Declined",
		'D34': "Queen's Gambit Declined",
		'D35': "Queen's Gambit Declined",
		'D36': "Queen's Gambit Declined",
		'D37': "Queen's Gambit Declined",
		'D38': "Queen's Gambit Declined",
		'D39': "Queen's Gambit Declined",
		'D40': "Queen's Gambit Declined",
		'D41': "Queen's Gambit Declined",
		'D42': "Queen's Gambit Declined",
		'D43': "Queen's Gambit Declined Semi-Slav",
		'D44': "Queen's Gambit Declined Semi-Slav",
		'D45': "Queen's Gambit Declined Semi-Slav",
		'D46': "Queen's Gambit Declined Semi-Slav",
		'D47': "Queen's Gambit Declined Semi-Slav",
		'D48': "Queen's Gambit Declined Semi-Slav",
		'D49': "Queen's Gambit Declined Semi-Slav",
		'D50': "Queen's Gambit Declined",
		'D51': "Queen's Gambit Declined",
		'D52': "Queen's Gambit Declined",
		'D53': "Queen's Gambit Declined",
		'D54': "Queen's Gambit Declined",
		'D55': "Queen's Gambit Declined",
		'D56': "Queen's Gambit Declined",
		'D57': "Queen's Gambit Declined",
		'D58': "Queen's Gambit Declined",
		'D59': "Queen's Gambit Declined",
		'D60': "Queen's Gambit Declined",
		'D61': "Queen's Gambit Declined",
		'D62': "Queen's Gambit Declined",
		'D63': "Queen's Gambit Declined",
		'D64': "Queen's Gambit Declined",
		'D65': "Queen's Gambit Declined",
		'D66': "Queen's Gambit Declined",
		'D67': "Queen's Gambit Declined",
		'D68': "Queen's Gambit Declined",
		'D69': "Queen's Gambit Declined",
		'D70': 'Grünfeld Defense',
		'D71': 'Grünfeld Defense',
		'D72': 'Grünfeld Defense',
		'D73': 'Grünfeld Defense',
		'D74': 'Grünfeld Defense',
		'D75': 'Grünfeld Defense',
		'D76': 'Grünfeld Defense',
		'D77': 'Grünfeld Defense',
		'D78': 'Grünfeld Defense',
		'D79': 'Grünfeld Defense',
		'D80': 'Grünfeld Defense',
		'D81': 'Grünfeld Defense',
		'D82': 'Grünfeld Defense',
		'D83': 'Grünfeld Defense',
		'D84': 'Grünfeld Defense',
		'D85': 'Grünfeld Defense',
		'D86': 'Grünfeld Defense',
		'D87': 'Grünfeld Defense',
		'D88': 'Grünfeld Defense',
		'D89': 'Grünfeld Defense',
		'D90': 'Grünfeld Defense',
		'D91': 'Grünfeld Defense',
		'D92': 'Grünfeld Defense',
		'D93': 'Grünfeld Defense',
		'D94': 'Grünfeld Defense',
		'D95': 'Grünfeld Defense',
		'D96': 'Grünfeld Defense',
		'D97': 'Grünfeld Defense',
		'D98': 'Grünfeld Defense',
		'D99': 'Grünfeld Defense',
		// E00-E99: Indian Defenses
		'E00': 'Catalan Opening',
		'E01': 'Catalan Opening',
		'E02': 'Catalan Opening',
		'E03': 'Catalan Opening',
		'E04': 'Catalan Opening',
		'E05': 'Catalan Opening',
		'E06': 'Catalan Opening',
		'E07': 'Catalan Opening',
		'E08': 'Catalan Opening',
		'E09': 'Catalan Opening',
		'E10': "Queen's Pawn Game",
		'E11': 'Bogo-Indian Defense',
		'E12': "Queen's Indian Defense",
		'E13': "Queen's Indian Defense",
		'E14': "Queen's Indian Defense",
		'E15': "Queen's Indian Defense",
		'E16': "Queen's Indian Defense",
		'E17': "Queen's Indian Defense",
		'E18': "Queen's Indian Defense",
		'E19': "Queen's Indian Defense",
		'E20': 'Nimzo-Indian Defense',
		'E21': 'Nimzo-Indian Defense',
		'E22': 'Nimzo-Indian Defense',
		'E23': 'Nimzo-Indian Defense',
		'E24': 'Nimzo-Indian Defense',
		'E25': 'Nimzo-Indian Defense',
		'E26': 'Nimzo-Indian Defense',
		'E27': 'Nimzo-Indian Defense',
		'E28': 'Nimzo-Indian Defense',
		'E29': 'Nimzo-Indian Defense',
		'E30': 'Nimzo-Indian Defense',
		'E31': 'Nimzo-Indian Defense',
		'E32': 'Nimzo-Indian Defense',
		'E33': 'Nimzo-Indian Defense',
		'E34': 'Nimzo-Indian Defense',
		'E35': 'Nimzo-Indian Defense',
		'E36': 'Nimzo-Indian Defense',
		'E37': 'Nimzo-Indian Defense',
		'E38': 'Nimzo-Indian Defense',
		'E39': 'Nimzo-Indian Defense',
		'E40': 'Nimzo-Indian Defense',
		'E41': 'Nimzo-Indian Defense',
		'E42': 'Nimzo-Indian Defense',
		'E43': 'Nimzo-Indian Defense',
		'E44': 'Nimzo-Indian Defense',
		'E45': 'Nimzo-Indian Defense',
		'E46': 'Nimzo-Indian Defense',
		'E47': 'Nimzo-Indian Defense',
		'E48': 'Nimzo-Indian Defense',
		'E49': 'Nimzo-Indian Defense',
		'E50': 'Nimzo-Indian Defense',
		'E51': 'Nimzo-Indian Defense',
		'E52': 'Nimzo-Indian Defense',
		'E53': 'Nimzo-Indian Defense',
		'E54': 'Nimzo-Indian Defense',
		'E55': 'Nimzo-Indian Defense',
		'E56': 'Nimzo-Indian Defense',
		'E57': 'Nimzo-Indian Defense',
		'E58': 'Nimzo-Indian Defense',
		'E59': 'Nimzo-Indian Defense',
		'E60': "King's Indian Defense",
		'E61': "King's Indian Defense",
		'E62': "King's Indian Defense",
		'E63': "King's Indian Defense",
		'E64': "King's Indian Defense",
		'E65': "King's Indian Defense",
		'E66': "King's Indian Defense",
		'E67': "King's Indian Defense",
		'E68': "King's Indian Defense",
		'E69': "King's Indian Defense",
		'E70': "King's Indian Defense",
		'E71': "King's Indian Defense",
		'E72': "King's Indian Defense",
		'E73': "King's Indian Defense",
		'E74': "King's Indian Defense",
		'E75': "King's Indian Defense",
		'E76': "King's Indian Defense",
		'E77': "King's Indian Defense",
		'E78': "King's Indian Defense",
		'E79': "King's Indian Defense",
		'E80': "King's Indian Defense",
		'E81': "King's Indian Defense",
		'E82': "King's Indian Defense",
		'E83': "King's Indian Defense",
		'E84': "King's Indian Defense",
		'E85': "King's Indian Defense",
		'E86': "King's Indian Defense",
		'E87': "King's Indian Defense",
		'E88': "King's Indian Defense",
		'E89': "King's Indian Defense",
		'E90': "King's Indian Defense",
		'E91': "King's Indian Defense",
		'E92': "King's Indian Defense",
		'E93': "King's Indian Defense",
		'E94': "King's Indian Defense",
		'E95': "King's Indian Defense",
		'E96': "King's Indian Defense",
		'E97': "King's Indian Defense",
		'E98': "King's Indian Defense",
		'E99': "King's Indian Defense"
	};

	// Internal Objects
	private chess = new Chess();
	private replayTimeouts: ReturnType<typeof setTimeout>[] = [];
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

			// Initialize Stockfish Worker
			try {
				this.stockfishWorker = new Worker('assets/stockfish/stockfish.js');
				this.stockfishWorker.onmessage = (e) => this.handleStockfishMessage(e);
				this.stockfishWorker.postMessage('uci');
			} catch (e) {
				console.error("Failed to load Stockfish worker:", e);
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
		effect(() => {
			const year = this.lichessYear();
			const month = this.lichessMonth();
			if (year && month) {
				const monthStr = month.toString().padStart(2, '0');
				// Use relative path so it respects the base href
				this.urlInput.set(`lichess/broadcast/lichess_db_broadcast_${year}-${monthStr}.pgn.zst`);
			}
		}, { allowSignalWrites: true });

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
				if (mateMatch) {
					scoreText = `#${mateMatch[1]}`;
				} else if (cpMatch) {
					const cp = parseInt(cpMatch[1], 10);
					scoreText = (cp / 100).toFixed(2);
				}

				this.bestMoveInfo.set({ move: bestMove, pv: pvString, score: scoreText });
			}
		}
	}

	analyzePosition(fen: string) {
		if (!this.stockfishWorker) return;

		this.isAnalyzing.set(true);
		this.bestMoveInfo.set(null);

		this.stockfishWorker.postMessage('stop'); // Stop any previous
		this.stockfishWorker.postMessage(`position fen ${fen}`);
		this.stockfishWorker.postMessage('go depth 18');
	}

	private handleWorkerMessage(data: WorkerResponse) {
		const { type, payload, id } = data;
		if (type === 'load') {
			this.gamesMetadata.set(payload.metadata);
			this.isLoading.set(false);

			// Populate unique players
			const whitePlayers = new Set<string>();
			const blackPlayers = new Set<string>();
			const ecoCodes = new Map<string, number>();
			for (const meta of payload.metadata) {
				if (meta.white && meta.white !== 'Unknown') whitePlayers.add(meta.white);
				if (meta.black && meta.black !== 'Unknown') blackPlayers.add(meta.black);
				// Exclude ECO codes with '?' as they are likely non-standard games
				if (meta.eco && !meta.eco.includes('?')) {
					ecoCodes.set(meta.eco, (ecoCodes.get(meta.eco) || 0) + 1);
				}
			}
			this.uniqueWhitePlayers.set(whitePlayers);
			this.uniqueBlackPlayers.set(blackPlayers);
			this.uniqueEcoCodes.set(ecoCodes);

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
			const { moves, pgn, evaluations, error } = payload;

			if (error) {
				console.error("Worker failed to parse game:", error);
				this.pgnInput.set(`Error parsing game: ${error} \n\nRaw PGN: \n${pgn} `);
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
		const fWhiteRating = parseInt(this.filterWhiteRating(), 10) || 0;
		const fBlackRating = parseInt(this.filterBlackRating(), 10) || 0;
		const fWhiteRatingMax = parseInt(this.filterWhiteRatingMax(), 10) || 0;
		const fBlackRatingMax = parseInt(this.filterBlackRatingMax(), 10) || 0;
		const fEco = this.filterEco();
		const currentMoves = this.moves().slice(0, this.currentMoveIndex() + 1);
		this.activeFilterMoves = currentMoves;

		this.autoSelectOnFinish = true;
		this.runFilterLogic(fWhite, fBlack, fResult, fMoves, fIgnoreColor, fWhiteRating, fBlackRating, fWhiteRatingMax, fBlackRatingMax, fEco, currentMoves);
	}

	clearFilters() {
		this.filterWhite.set("");
		this.filterBlack.set("");
		this.filterResult.set("");
		this.filterMoves.set(false);
		this.ignoreColor.set(false);
		this.filterWhiteRating.set("2000");
		this.filterBlackRating.set("2000");
		this.filterWhiteRatingMax.set("3000");
		this.filterBlackRatingMax.set("3000");
		this.filterEco.set("");
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
					minWhiteRating: fWhiteRating,
					minBlackRating: fBlackRating,
					maxWhiteRating: fWhiteRatingMax,
					maxBlackRating: fBlackRatingMax,
					eco: fEco,
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
		this.loadingStatus.set("Starting download...");

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
					this.loadingStatus.set(`Downloading: ${(receivedLength / 1024 / 1024).toFixed(2)} MB / ${(total / 1024 / 1024).toFixed(2)} MB`);
				} else {
					this.loadingStatus.set(`Downloading: ${(receivedLength / 1024 / 1024).toFixed(2)} MB`);
				}
			}

			// Combine chunks into single array
			const buffer = new Uint8Array(receivedLength);
			let position = 0;
			for (const chunk of chunks) {
				buffer.set(chunk, position);
				position += chunk.length;
			}

			this.loadingStatus.set("Decompressing...");
			let content: string;

			// Check for ZST magic bytes (0xFD2FB528) or extension
			const isZst = url.toLowerCase().endsWith('.zst');

			if (isZst) {
				const decompressed = decompressZst(buffer);
				content = new TextDecoder().decode(decompressed);
			} else {
				content = new TextDecoder().decode(buffer);
			}

			this.loadingStatus.set("Processing games...");
			// Use setTimeout to ensure change detection runs properly
			setTimeout(() => {
				this.loadPgnString(content);
				this.loadGame(0);
				this.isLoading.set(false);
				this.loadingProgress.set(0);
				this.loadingStatus.set("");
			}, 0);

		} catch (e) {
			console.error("Error loading from URL:", e);
			alert(`Error loading from URL: ${e} `);
			this.isLoading.set(false);
			this.loadingProgress.set(0);
			this.loadingStatus.set("");
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

	updateFilterWhiteRating(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.filterWhiteRating.set(value);
	}

	updateFilterBlackRating(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.filterBlackRating.set(value);
	}

	updateFilterWhiteRatingMax(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.filterWhiteRatingMax.set(value);
	}

	updateFilterBlackRatingMax(event: Event) {
		const value = (event.target as HTMLInputElement).value;
		this.filterBlackRatingMax.set(value);
	}

	/**
	 * Get the opening name for a given ECO code
	 */
	getOpeningName(ecoCode: string): string {
		return NgxPgnViewerComponent.ECO_NAMES[ecoCode] || '';
	}

	updateFilterEco(event: Event) {
		const value = (event.target as HTMLSelectElement).value;
		this.filterEco.set(value);
	}

	private scrollToActiveMove() {
		if (!this.moveList) return;
		const container = this.moveList.nativeElement;
		const activeElement = container.querySelector('.move-btn.active') as HTMLElement;
		if (activeElement) {
			activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
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
				const timeOuts = Array(moveCount).fill(0).map((_, i) => (i + 1) * this.fixedTime());
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
		const selected = this.filteredGamesIndices().filter(idx => selectedSet.has(idx));

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
			if (child.data?.comments) {
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
			const _comment = comments.find(c => c.fen === history[i].after || c.fen === history[i].before); // Approximate check
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
		moveComments.forEach(c => { fenToComment.set(c.fen, c.comment); });

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
			return val > 0 ? 20 + (10 / Math.abs(val)) : -(20 + (10 / Math.abs(val)));
		}
		return parseFloat(evalStr);
	}

	private scheduleReplay(timeOuts: number[], totalMoves: number, onComplete?: () => void) {
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
			if (this.replayMode() === "fixed" || this.replayMode() === "realtime" || this.replayMode() === "proportional") {
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
							if (Math.abs(currentEval - prevEval) > this.stopOnErrorThreshold()) {
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
			console.error("Error generating previous FEN", e);
			return null;
		}
	}
}
