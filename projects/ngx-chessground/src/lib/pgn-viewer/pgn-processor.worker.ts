/// <reference lib="webworker" />

import { Chess } from 'chess.js';
import { parsePgn } from 'chessops/pgn';

/**
 * Discriminated union of messages sent from the main thread to the PGN processor worker.
 *
 * Each message includes an `id` correlation field echoed back in the response
 * so callers can match requests with responses.
 */
export type WorkerMessage =
	/** Load raw PGN text for parsing. */
	| { type: 'load'; payload: string; id: number }
	/** Filter the currently loaded games by {@link FilterCriteria}. */
	| { type: 'filter'; payload: FilterCriteria; id: number }
	/** Load the full move data for a game at the given index. */
	| { type: 'loadGame'; payload: number; id: number };

/**
 * Criteria for filtering a parsed game collection in the PGN processor worker.
 *
 * All string fields are matched case-insensitively as substrings.
 * Rating fields default to 0 (no lower bound) or Infinity (no upper bound) when unset.
 *
 * @example
 * ```typescript
 * const criteria: FilterCriteria = {
 *   white: 'carlsen',
 *   black: '',
 *   result: '1-0',
 *   moves: true,
 *   ignoreColor: false,
 *   targetMoves: ['e4', 'e5', 'Nf3'],
 *   minWhiteRating: 2500,
 *   minBlackRating: 2400,
 *   maxWhiteRating: Infinity,
 *   maxBlackRating: Infinity,
 *   eco: 'B33',
 *   timeControl: '180+2',
 *   event: '',
 *   filterByFen: false,
 *   targetFen: '',
 * };
 * ```
 */
export interface FilterCriteria {
	/** Filter by white player name (case-insensitive substring match). */
	white: string;
	/** Filter by black player name (case-insensitive substring match). */
	black: string;
	/** Comma-separated result strings: `"1-0"`, `"0-1"`, `"draw"`, or `"*"` for unfinished. */
	result: string;
	/** When `true`, filter games by the {@link targetMoves} opening sequence. */
	moves: boolean;
	/** When `true`, treat {@link white} and {@link black} fields as matching either color. */
	ignoreColor: boolean;
	/** SAN move sequence the game must be prefixed with (only used when {@link moves} is `true`). */
	targetMoves: string[];
	/** When `true`, filter games by the {@link targetFen} position.
	 * Games that reach the target board position at any point are included. */
	filterByFen: boolean;
	/** Target FEN string (piece placement + active color + castling +
	 * en passant) for position-based filtering. Only used when
	 * {@link filterByFen} is `true`. */
	targetFen: string;
	/** Minimum white Elo rating (inclusive). Default 0. */
	minWhiteRating: number;
	/** Minimum black Elo rating (inclusive). Default 0. */
	minBlackRating: number;
	/** Maximum white Elo rating (inclusive). Use `Infinity` for no upper bound. */
	maxWhiteRating: number;
	/** Maximum black Elo rating (inclusive). Use `Infinity` for no upper bound. */
	maxBlackRating: number;
	/** ECO code filter (case-insensitive substring, e.g. `"B33"`). */
	eco: string;
	/** Time control filter (case-insensitive substring, e.g. `"180+2"`). */
	timeControl: string;
	/** Event/tournament name filter (case-insensitive substring). */
	event: string;
}

/**
 * Discriminated union of responses sent from the PGN processor worker to the main thread.
 *
 * The `id` field matches the correlation ID from the originating {@link WorkerMessage}.
 */
export type WorkerResponse =
	/** Response to a `'load'` message with game count and metadata. */
	| {
			type: 'load';
			payload: { count: number; metadata: GameMetadata[] };
			id: number;
	  }
	/** Response to a `'filter'` message with matching game indices. */
	| { type: 'filter'; payload: number[]; id: number }
	/** Response to a `'loadGame'` message with moves, cleaned PGN, evaluations, and optional error. */
	| {
			type: 'loadGame';
			payload: {
				moves: string[];
				pgn: string;
				evaluations: (string | null)[];
				error?: string;
			};
			id: number;
	  }
	/** Progress update during long-running operations (load, filter). */
	| {
			type: 'progress';
			payload: { percent: number; status: string };
			id: number;
	  }
	/** Error response for any message type. */
	| { type: 'error'; payload: string; id: number };

/**
 * Metadata extracted from a single PGN game header.
 *
 * Used for displaying game lists, filtering, and sorting without parsing full move data.
 * The `timeControlNormalized` field converts human-readable time controls
 * (e.g. `"90+30"`, `"3:0"`) into a uniform `"baseSeconds+incrementSeconds"` format.
 */
export interface GameMetadata {
	/** 1-based game number within the loaded PGN collection. */
	number: number;
	/** White player display name (includes title and Elo if present, e.g. `"GM Carlsen (2850)"`). */
	white: string;
	/** Black player display name (includes title and Elo if present). */
	black: string;
	/** Normalized result: `"1-0"`, `"0-1"`, `"½-½"`, or `"*"`. */
	result: string;
	/** White player Elo rating (0 if missing). */
	whiteElo: number;
	/** Black player Elo rating (0 if missing). */
	blackElo: number;
	/** ECO (Encyclopedia of Chess Openings) code (e.g. `"B33"`). */
	eco?: string;
	/** Raw time control string from the PGN header. */
	timeControl?: string;
	/** Normalized time control in `"seconds+increment"` format, or `undefined` if unparseable. */
	timeControlNormalized?: string;
	/** Event/tournament name from the PGN header. */
	event?: string;
}

// --- Worker State ---

/** Raw PGN text for each game, split by `[Event "..."` headers. */
let games: string[] = [];
/** Parsed metadata for each game (header tags only, no move data). */
let gameMetadata: GameMetadata[] = [];
/** LRU-like cache of parsed move arrays keyed by game index, cleared on re-filter. */
const gameMovesCache = new Map<number, string[]>();
/**
 * Cache of normalized FEN positions for each game, pre-computed during load.
 * Maps game index to a Set of normalized FEN strings (first N plies only).
 * Populated eagerly in handleLoad so FEN filtering is a single Set lookup.
 */
const gameFenCache = new Map<number, Set<string>>();
/** Maximum number of plies to replay per game when building the FEN cache. */
const MAX_FEN_PLIES = 20;

addEventListener('message', ({ data }: { data: WorkerMessage }) => {
	try {
		switch (data.type) {
			case 'load':
				handleLoad(data.payload, data.id);
				break;
			case 'filter':
				handleFilter(data.payload, data.id);
				break;
			case 'loadGame':
				handleLoadGame(data.payload, data.id);
				break;
		}
	} catch (e) {
		postMessage({ type: 'error', payload: String(e), id: data.id });
	}
});

/**
 * Posts a progress update to the main thread during long-running operations.
 *
 * @param percent — Progress percentage (0–100).
 * @param status — Human-readable status message.
 * @param id — Correlation ID echoed in the response.
 */
function postProgress(percent: number, status: string, id: number) {
	postMessage({
		type: 'progress',
		payload: { percent, status },
		id,
	});
}

/**
 * Loads raw PGN text: splits into individual games, filters out non-Standard variants,
 * extracts metadata, builds FEN position cache, and posts a `'load'` response
 * with game count and metadata. Progress updates are posted during the process.
 *
 * @param pgn — Raw PGN string potentially containing multiple games.
 * @param id — Correlation ID echoed in the response.
 */
function handleLoad(pgn: string, id: number) {
	// Reset state
	games = [];
	gameMetadata = [];
	gameMovesCache.clear();

	// Split PGN
	const allGames = splitPgn(pgn);

	postProgress(2, `Splitting PGN (${allGames.length} games found)...`, id);

	// Filter out non-standard variants (keep Standard or if Variant tag is missing)
	games = allGames.filter((g) => {
		const variantMatch = g.match(/\[Variant\s+"([^"]+)"\]/);
		if (!variantMatch) return true; // Default is Standard
		return variantMatch[1] === 'Standard';
	});

	postProgress(5, `Parsing metadata for ${games.length} games...`, id);

	// Extract metadata
	gameMetadata = games.map((game, index) => extractGameInfo(game, index));

	// Pre-compute FEN position cache for all games (first N plies only).
	// This moves the expensive chess.js replay from filter-time to load-time,
	// so FEN filter is a single Set lookup per game instead of O(plies).
	gameFenCache.clear();
	const total = games.length;
	// Phase: metadata extraction = 5-15%, FEN cache = 15-100%
	const fenStartPct = 15;
	const fenEndPct = 100;
	const fenRange = fenEndPct - fenStartPct;
	// Report progress every ~10% of games (at most 20 batches)
	const batchInterval = Math.max(1, Math.floor(total / 20));

	postProgress(fenStartPct, `Indexing FEN positions (0/${total})...`, id);

	for (let i = 0; i < total; i++) {
		const gamePgn = games[i];
		const moves = extractMovesFast(gamePgn);
		if (!moves || moves.length === 0) {
			gameFenCache.set(i, new Set());
		} else {
			const fenSet = new Set<string>();
			const chess = new Chess();

			// Handle non-standard starting positions
			const fenMatch = gamePgn.match(/\[FEN\s+"([^"]+)"\]/);
			if (fenMatch) {
				try { chess.load(fenMatch[1]); } catch (_e) {}
			}

			fenSet.add(normalizeFen(chess.fen()));

			const replayLimit = Math.min(moves.length, MAX_FEN_PLIES);
			for (let k = 0; k < replayLimit; k++) {
				try {
					chess.move(moves[k]);
					fenSet.add(normalizeFen(chess.fen()));
				} catch (_e) {
					break;
				}
			}
			gameFenCache.set(i, fenSet);
		}

		// Report progress at batch boundaries and on the last game
		if (
			total > 0 &&
			((i + 1) % batchInterval === 0 || i === total - 1)
		) {
			const pct = fenStartPct + Math.round(((i + 1) / total) * fenRange);
			postProgress(
				pct,
				`Indexing FEN positions (${i + 1}/${total})...`,
				id,
			);
		}
	}

	postMessage({
		type: 'load',
		id,
		payload: {
			count: games.length,
			metadata: gameMetadata,
		},
	});
}

/**
 * Normalizes PGN result strings into a canonical form.
 *
 * - `"1-0"` → `"1-0"` (white win)
 * - `"0-1"` → `"0-1"` (black win)
 * - `"½-½"`, `"1/2-1/2"` → `"draw"`
 * - Unknown/unparseable → lowercased as-is
 *
 * @param result — Raw result string from a PGN `[Result "..."]` header.
 * @returns Canonical result string.
 */
function normalizeResult(result: string): string {
	const lower = result.toLowerCase();
	// Normalize draw results - convert both ½-½ and 1/2-1/2 to "draw"
	if (lower.includes('½') || lower.includes('1/2')) {
		return 'draw';
	}
	// Normalize white wins
	if (lower.includes('1-0')) {
		return '1-0';
	}
	// Normalize black wins
	if (lower.includes('0-1')) {
		return '0-1';
	}
	// Return as-is for other cases (e.g., "*")
	return lower;
}

/**
 * Normalizes a FEN string for comparison by stripping move counters.
 *
 * Keeps only the first 4 fields: piece placement, active color, castling rights,
 * and en passant target square. This ensures that positions differing only in
 * move clocks are treated as equivalent.
 *
 * @example
 * normalizeFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
 * // => 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'
 *
 * @param fen — Full FEN string.
 * @returns Normalized FEN with only board-relevant fields.
 */
function normalizeFen(fen: string): string {
	const parts = fen.split(' ');
	// Keep only piece placement, active color, castling, en passant
	return parts.slice(0, 4).join(' ');
}

/**
 * Filters the currently loaded game collection by the given criteria.
 *
 * Matches are case-insensitive substring comparisons. When `moves` is `true`,
 * tests whether each game's opening sequence starts with `targetMoves`.
 * When `filterByFen` is `true`, tests whether each game ever reaches the
 * target FEN position.
 * Posts a `'filter'` response with an array of matching game indices.
 *
 * @param criteria — Filter parameters (player names, ECO, result, ratings, opening moves, FEN).
 * @param id — Correlation ID echoed in the response.
 */
function handleFilter(criteria: FilterCriteria, id: number) {
	const {
		white,
		black,
		result,
		moves,
		ignoreColor,
		targetMoves,
		minWhiteRating,
		minBlackRating,
		maxWhiteRating,
		maxBlackRating,
		eco,
		timeControl,
		event,
		filterByFen,
		targetFen,
	} = criteria;
	const fWhiteLower = white.toLowerCase();
	const fBlackLower = black.toLowerCase();
	// Split comma-separated results into array, filter out empty strings
	const fResultArray = result
		.split(',')
		.map((r) => r.trim().toLowerCase())
		.filter((r) => r.length > 0);
	const fEcoLower = eco.toLowerCase();
	const fTimeControl = timeControl;
	const fEventLower = event.toLowerCase();

	// Clear cache when filtering by moves or FEN to ensure fresh parsing
	if ((moves && targetMoves.length > 0) || (filterByFen && targetFen.length > 0)) {
		gameMovesCache.clear();
	}

	const matches: number[] = [];

	// Normalize target FEN once if position filtering is enabled
	const normalizedTargetFen = filterByFen && targetFen ? normalizeFen(targetFen) : '';

	for (let i = 0; i < games.length; i++) {
		const info = gameMetadata[i];
		const whiteName = info.white.toLowerCase();
		const blackName = info.black.toLowerCase();

		let matchWhite = true;
		let matchBlack = true;

		if (ignoreColor) {
			if (
				fWhiteLower &&
				!(whiteName.includes(fWhiteLower) || blackName.includes(fWhiteLower))
			)
				matchWhite = false;
			if (
				fBlackLower &&
				!(whiteName.includes(fBlackLower) || blackName.includes(fBlackLower))
			)
				matchBlack = false;
		} else {
			if (fWhiteLower && !whiteName.includes(fWhiteLower)) matchWhite = false;
			if (fBlackLower && !blackName.includes(fBlackLower)) matchBlack = false;
		}

		if (!matchWhite || !matchBlack) continue;
		// Result filtering - check if game result matches any of the selected results
		if (fResultArray.length > 0) {
			const normalizedGameResult = normalizeResult(info.result);
			let resultMatch = false;
			for (const selectedResult of fResultArray) {
				if (normalizedGameResult.includes(normalizeResult(selectedResult))) {
					resultMatch = true;
					break;
				}
			}
			if (!resultMatch) continue;
		}

		// ECO filtering
		if (fEcoLower && (!info.eco || !info.eco.toLowerCase().includes(fEcoLower)))
			continue;

		// TimeControl filtering
		if (fTimeControl && info.timeControlNormalized !== fTimeControl) continue;

		// Event filtering
		if (
			fEventLower &&
			(!info.event || !info.event.toLowerCase().includes(fEventLower))
		)
			continue;

		// Rating filtering
		if (ignoreColor) {
			// "search games where both players get higher rating that min of inupt of fields"
			// If one field is empty (0), we should probably ignore it or treat it as 0.
			// Assuming 0 means "no filter".
			// If both are provided, we take the minimum of the two inputs.
			// If only one is provided, we use that one.
			// If neither, we skip rating check.

			// Min Rating Logic
			let minThreshold = 0;
			if (minWhiteRating > 0 && minBlackRating > 0) {
				minThreshold = Math.min(minWhiteRating, minBlackRating);
			} else if (minWhiteRating > 0) {
				minThreshold = minWhiteRating;
			} else if (minBlackRating > 0) {
				minThreshold = minBlackRating;
			}

			if (minThreshold > 0) {
				if (info.whiteElo < minThreshold || info.blackElo < minThreshold)
					continue;
			}

			// Max Rating Logic
			// Similar logic: if ignoreColor is on, we want to filter games where players are "smaller" than the max.
			// If we follow the "both players" logic from min:
			// "search games where both players get lower rating than max of input fields"
			let maxThreshold = 0;
			if (maxWhiteRating > 0 && maxBlackRating > 0) {
				maxThreshold = Math.max(maxWhiteRating, maxBlackRating);
			} else if (maxWhiteRating > 0) {
				maxThreshold = maxWhiteRating;
			} else if (maxBlackRating > 0) {
				maxThreshold = maxBlackRating;
			}

			if (maxThreshold > 0) {
				if (info.whiteElo > maxThreshold || info.blackElo > maxThreshold)
					continue;
			}
		} else {
			if (minWhiteRating > 0 && info.whiteElo < minWhiteRating) continue;
			if (minBlackRating > 0 && info.blackElo < minBlackRating) continue;

			if (maxWhiteRating > 0 && info.whiteElo > maxWhiteRating) continue;
			if (maxBlackRating > 0 && info.blackElo > maxBlackRating) continue;
		}

		// Move filtering
		if (moves && targetMoves.length > 0) {
			const pgn = games[i];

			// 1. Fast String Pre-check
			if (!pgn.includes(targetMoves[0])) {
				continue;
			}

			let gameMoves = gameMovesCache.get(i);
			if (!gameMoves) {
				// 2. Lightweight Parse
				gameMoves = extractMovesFast(pgn);
				gameMovesCache.set(i, gameMoves);
			}

			if (!gameMoves) {
				continue;
			}

			let moveMatch = true;
			if (targetMoves.length > gameMoves.length) {
				moveMatch = false;
			} else {
				for (let j = 0; j < targetMoves.length; j++) {
					if (gameMoves[j] !== targetMoves[j]) {
						moveMatch = false;
						break;
					}
				}
			}
			if (!moveMatch) {
				continue;
			}
		}

		// FEN / position filtering — uses cache pre-computed during handleLoad
		if (filterByFen && normalizedTargetFen) {
			const cachedFens = gameFenCache.get(i);
			if (cachedFens && !cachedFens.has(normalizedTargetFen)) continue;
			if (!cachedFens) continue;
		}

		matches.push(i);
	}

	// Sort matches by sum of Elo ratings (descending), with game index as tiebreaker
	// to ensure deterministic ordering when Elo sums are equal.
	matches.sort((a, b) => {
		const sumA = gameMetadata[a].whiteElo + gameMetadata[a].blackElo;
		const sumB = gameMetadata[b].whiteElo + gameMetadata[b].blackElo;
		if (sumB !== sumA) return sumB - sumA;
		return a - b;
	});

	postMessage({
		type: 'filter',
		id,
		payload: matches,
	});
}

/**
 * Extracts per-move [%eval] values from raw PGN text by scanning
 * inline comment annotations in move order.
 *
 * Skips any eval annotation that appears before the first move
 * (i.e. an initial-position eval comment at the start of the PGN).
 *
 * @returns Array aligned with parsedMoves; null where no eval found.
 */
function extractEvalsFromPgn(pgnText: string, parsedMoves: string[]): (string | null)[] {
	const evals: (string | null)[] = new Array(parsedMoves.length).fill(null);

	// Collect all [%eval ...] values in the order they appear
	const values: string[] = [];
	const evalRegex = /\[%eval\s+([^\]]+)\]/g;
	let match;
	while ((match = evalRegex.exec(pgnText)) !== null) {
		values.push(match[1]);
	}
	if (values.length === 0) return evals;

	if (values.length === 1 && parsedMoves.length === 1) {
		// Single eval, single move — no offset ambiguity
		evals[0] = values[0];
		return evals;
	}

	// Determine offset: if the first [%eval] appears before any move number
	// (e.g. an initial-position comment at the very start of the PGN),
	// skip it since it doesn't correspond to a move.
	const firstEvalIndex = pgnText.search(/\[%eval\s+([^\]]+)\]/);
	const firstMoveIndex = pgnText.search(/\b\d+\.\s+/);
	const offset = firstMoveIndex >= 0 && firstEvalIndex < firstMoveIndex ? 1 : 0;

	for (let i = 0; i < parsedMoves.length; i++) {
		const valIdx = i + offset;
		if (valIdx < values.length) {
			evals[i] = values[valIdx];
		}
	}
	return evals;
}

/**
 * Parses the full move data for a single game by index.
 *
 * Uses chess.js for primary parsing with fallback to chessops and stripped-comment parsing.
 * Extracts move evaluations from `[%eval ...]` comment annotations when available.
 * Results are cached in {@link gameMovesCache} to avoid re-parsing.
 * Posts a `'loadGame'` response with moves, cleaned PGN, evaluations, and optional error.
 *
 * @param index — Zero-based game index in the `games` array.
 * @param id — Correlation ID echoed in the response.
 */
function handleLoadGame(index: number, id: number) {
	if (index < 0 || index >= games.length) {
		throw new Error('Game index out of bounds');
	}

	const pgn = games[index];
	let moves: string[] = [];
	let evaluations: (string | null)[] = [];
	let errorMsg: string | undefined;
	let cleanPgn = pgn;

	try {
		const tempChess = new Chess();

		try {
			// Try parsing the original PGN (maybe with minor cleanup) to get comments
			tempChess.loadPgn(pgn);
			moves = tempChess.history();
			const comments = tempChess.getComments();
			// comments is array of { fen: string, comment: string }
			// We need to map these to moves.
			// The 'moves' array corresponds to the game history.
			// We can replay the game and match FENs.

			const tempChess2 = new Chess();
			evaluations = moves.map((move) => {
				tempChess2.move(move);
				const fen = tempChess2.fen();
				const commentObj = comments.find((c) => c.fen === fen);
				if (commentObj) {
					const match = commentObj.comment.match(/\[%eval\s+([^\]]+)\]/);
					return match ? match[1] : null;
				}
				return null;
			});
		} catch (_e) {
			// Extract [%eval ...] annotations from the original PGN before cleaning
			const rawPgnForEvals = cleanPgn;

			// Clean up PGN:
			// 1. Remove ?! ? ! attached to moves (chess.js might not like them)
			cleanPgn = cleanPgn.replace(/([a-h1-8NBRQK])([?!]+)/g, '$1');

			// 2. Merge adjacent comments } { to } { which chess.js might handle better,
			//    OR actually merge them into one block { ... ... } to avoid parser issues with multiple blocks.
			//    Replacing "} {" with " " effectively merges them.
			cleanPgn = cleanPgn.replace(/\}\s*\{/g, ' ');

			// 3. Normalize headers: ensure each header is on its own line
			cleanPgn = cleanPgn.replace(/\]\s*\[/g, ']\n[');

			// 4. Ensure blank line after the last header and before moves or result
			//    Look for ] followed by something that looks like a move (digit or piece) or result
			cleanPgn = cleanPgn.replace(
				/\]\s*(\d+\.|[a-hNBRQK]|\*|1-0|0-1|1\/2-1\/2)/g,
				']\n\n$1',
			);

			// 5. Remove inline comments that could choke chess.js parser
			cleanPgn = cleanPgn.replace(/\{[^}]*\}/g, '');

			// 6. Remove all check/checkmate symbols for cleaner parsing
			cleanPgn = cleanPgn.replace(/[+#]/g, '');

			// Try parsing the cleaned PGN
			tempChess.loadPgn(cleanPgn);
			moves = tempChess.history();

			// Re-attach evaluations extracted from the raw PGN before comment stripping
			evaluations = extractEvalsFromPgn(rawPgnForEvals, moves);
		}
	} catch (e) {
		// Fallback with chessops if chess.js continues to fail
		try {
			const games = parsePgn(cleanPgn);
			const game = games?.[0];
			if (game) {
				moves = [];
				evaluations = [];
				const chess = new Chess();
				for (const node of game.moves.mainline()) {
					const san = node.san;
					if (san) {
						moves.push(san);
						chess.move(san);
					}
				}
			} else {
				errorMsg = 'Failed to parse PGN with both chess.js and chessops';
			}
		} catch (e2) {
			errorMsg = `Failed to parse PGN: ${String(e)} (fallback: ${String(e2)})`;
		}
	}

	// Safety net: if evaluations are empty but the PGN has [%eval …]
	// annotations, extract them directly from the raw text.
	const hasAnyEval = evaluations.some((e) => e !== null);
	if (!hasAnyEval && moves.length > 0) {
		const fallbackEvals = extractEvalsFromPgn(pgn, moves);
		if (fallbackEvals.some((e) => e !== null)) {
			evaluations = fallbackEvals;
		}
	}

	postMessage({
		type: 'loadGame',
		id,
		payload: {
			moves,
			pgn: cleanPgn,
			evaluations,
			error: errorMsg,
		},
	});
}

/**
 * Extracts game information from a PGN string for a given game index.
 *
 * Parses PGN header tags to extract player names (with title + Elo),
 * result, Elo ratings, ECO code, time control, and event.
 * Player display names include title prefixes (e.g. `"GM"`) and Elo
 * ratings in parentheses.
 *
 * @param pgn — Raw PGN string for a single game.
 * @param index — Zero-based game index used as the display number.
 * @returns Extracted {@link GameMetadata}.
 */
function extractGameInfo(pgn: string, index: number): GameMetadata {
	const white = extractTag(pgn, 'White');
	const black = extractTag(pgn, 'Black');
	const whiteEloRaw = extractTag(pgn, 'WhiteElo');
	const blackEloRaw = extractTag(pgn, 'BlackElo');
	const result = extractTag(pgn, 'Result') || '*';
	const eco = extractTag(pgn, 'ECO') || undefined;
	const timeControl = extractTag(pgn, 'TimeControl') || undefined;
	const event = extractTag(pgn, 'Event') || undefined;
	const whiteTitle = extractTag(pgn, 'WhiteTitle') || undefined;
	const blackTitle = extractTag(pgn, 'BlackTitle') || undefined;

	const whiteElo = parseInt(whiteEloRaw, 10) || 0;
	const blackElo = parseInt(blackEloRaw, 10) || 0;
	const whiteDisplay =
		white + (whiteElo > 0 ? ` (${whiteElo})` : '') + (whiteTitle ? ` [${whiteTitle}]` : '');
	const blackDisplay =
		black + (blackElo > 0 ? ` (${blackElo})` : '') + (blackTitle ? ` [${blackTitle}]` : '');

	let timeControlNormalized: string | undefined;
	if (timeControl) {
		const parts = timeControl.split('+');
		if (parts.length === 2) {
			const base = parseInt(parts[0], 10);
			const inc = parseInt(parts[1], 10);
			if (!Number.isNaN(base) && !Number.isNaN(inc)) {
				timeControlNormalized = `${base}+${inc}`;
			}
		}
	}

	return {
		number: index + 1,
		white: whiteDisplay,
		black: blackDisplay,
		result: result,
		whiteElo,
		blackElo,
		eco,
		timeControl,
		timeControlNormalized,
		event,
	};
}

/**
 * Extracts a tag value from a PGN header by tag name.
 *
 * Supports multi-line tag values where the value spans across lines
 * (e.g., Lichess broadcast PGNs with long event names).
 *
 * @param pgn — Raw PGN string.
 * @param tagName — Case-sensitive tag name (e.g. `"White"`, `"ECO"`).
 * @returns The tag value without surrounding quotes, or an empty string.
 */
function extractTag(pgn: string, tagName: string): string {
	// Simple regex: matches [TagName "value"] on a single line or with value on next line
	const regex = new RegExp(`\\[${tagName}\\s+"((?:[^"\\\\]|\\\\.)*)"`, 'i');
	const match = pgn.match(regex);
	return match ? match[1].trim() : '';
}

/**
 * Splits a multi-game PGN string into individual game strings.
 *
 * Handles both standard PGN format (games separated by blank lines + `[Event ...]`)
 * and the case where there are no blank lines between games (common in compressed exports).
 *
 * @param pgn — Raw PGN string potentially containing multiple games.
 * @returns Array of individual game PGN strings.
 */
function splitPgn(pgn: string): string[] {
	// If no [Event tag, return as single game
	if (pgn.indexOf('[Event ') === -1) {
		return [pgn];
	}

	// Split on boundaries: newline followed by [Event
	// This handles the common case where games are separated by blank lines.
	const games = pgn.split(/\n\s*(?=\[Event\s+")/);

	return games
		.map((g) => g.trim())
		.filter((g) => g.length > 0 && g.startsWith('['));
}

/**
 * Converts a human-readable time control format to a normalized one.
 *
 * Supports:
 * - `"M+SS"` with optional `+` (e.g. `"5+0"`, `"3:0"`)
 * - `"M+SS"` format with minutes and seconds (e.g. `"5+30"` = 5 min + 30 sec)
 * - `"seconds+increment"` already normalized (e.g. `"300+0"`)
 *
 * @param tc — Raw time control string from the PGN header.
 * @returns Normalized `"baseSeconds+incrementSeconds"` string, or `undefined`.
 */
function normalizeTimeControl(tc: string): string | undefined {
	// Already normalized: "seconds+increment" (e.g. "300+0")
	const standardMatch = tc.match(/^(\d+)\+(\d+)$/);
	if (standardMatch && standardMatch[2] !== undefined) {
		const base = parseInt(standardMatch[1], 10);
		const inc = parseInt(standardMatch[2], 10);
		if (!Number.isNaN(base) && !Number.isNaN(inc)) return tc;
	}

	// Human-readable: "M+SS" or "M:SS" (e.g. "5+0", "3:0")
	// Already parsed in extractGameInfo, this is a fallback.
	const colonMatch = tc.match(/^(\d+):(\d+)$/);
	if (colonMatch) {
		const minutes = parseInt(colonMatch[1], 10);
		const seconds = parseInt(colonMatch[2], 10);
		if (!Number.isNaN(minutes) && !Number.isNaN(seconds)) {
			return `${minutes * 60}+${seconds}`;
		}
	}

	const baseMinMatch = tc.match(/^(\d+)\+(\d+)$/);
	const incSecMatch = tc.match(/^(\d+)\+(\d+)$/);
	if (baseMinMatch && incSecMatch) {
		const baseMinutes = parseInt(baseMinMatch[1], 10);
		const incSeconds = parseInt(incSecMatch[1], 10);
		if (!Number.isNaN(baseMinutes) && !Number.isNaN(incSeconds)) {
			return `${baseMinutes * 60}+${incSeconds}`;
		}
	}

	return undefined;
}

/**
 * Extracts SAN moves from a PGN string without using a full chess engine parser.
 *
 * Used for filtering by opening moves — faster than full chess.js parsing.
 * Steps:
 * 1. Isolates move text after header tags, handling bracket comments like `[%clk ...]`.
 * 2. Strips `{ ... }` and `( ... )` comments and `; ...` line comments.
 * 3. Removes move numbers, result markers, and NAG symbols (`$1`, `$2`).
 * 4. Splits by whitespace, strips `!`/`?` annotations, and validates SAN format.
 *
 * @param pgn — Raw PGN string for a single game (header tags + move text).
 * @returns Array of clean, validated SAN move strings.
 */
function extractMovesFast(pgn: string): string[] {
	// 1. Isolate the move text (after the headers)
	// NOTE: We must NOT use lastIndexOf(']') here because Lichess PGNs often
	// include bracket tags in comments like [%clk ...] / [%eval ...], which
	// appear after the headers and would truncate the move text.
	let moveText = pgn;
	if (pgn.startsWith('[')) {
		// Walk line-by-line until we pass the header tag section.
		// Standard PGN: consecutive tag lines, then a blank line, then movetext.
		let pos = 0;
		let sawTagLine = false;
		while (pos < pgn.length) {
			const nextNl = pgn.indexOf('\n', pos);
			const lineEnd = nextNl === -1 ? pgn.length : nextNl;
			const rawLine = pgn.slice(pos, lineEnd);
			const line = rawLine.replace(/\r$/, '');
			const trimmed = line.trim();

			if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
				sawTagLine = true;
				pos = nextNl === -1 ? pgn.length : nextNl + 1;
				continue;
			}

			// Blank line after headers -> movetext starts after it.
			if (sawTagLine && trimmed.length === 0) {
				moveText = pgn.slice(nextNl === -1 ? pgn.length : nextNl + 1);
				break;
			}

			// First non-tag line: assume movetext begins here.
			moveText = pgn.slice(pos);
			break;
		}
	}

	// 2. Remove comments { ... } and ( ... ) and ; ...
	// This is a simple regex approach. Nested comments might fail but are rare in standard PGNs for display.
	moveText = moveText.replace(/\{[^}]*\}/g, ' '); // Remove {} comments
	moveText = moveText.replace(/\([^)]*\)/g, ' '); // Remove () variations
	moveText = moveText.replace(/;.*$/gm, ' '); // Remove ; comments

	// 3. Remove move numbers (1. or 1...) and result (1-0, 0-1, 1/2-1/2, *)
	moveText = moveText.replace(/\d+\.+/g, ' ');
	moveText = moveText.replace(/(1-0|0-1|1\/2-1\/2|\*)/g, ' ');

	// 4. Remove NAG symbols ($1, $2, etc.)
	moveText = moveText.replace(/\$\d+/g, ' ');

	// 5. Split by whitespace and filter empty
	const rawMoves = moveText
		.trim()
		.split(/\s+/)
		.filter((m) => m.length > 0 && m !== '.');

	// 6. Strip move annotations (!,?,!?,?!) from each move
	const strippedMoves = rawMoves.map((move) => move.replace(/[!?]+$/g, ''));

	// 7. Filter out invalid moves (stray brackets, etc.) - only keep valid SAN notation
	// Valid SAN: starts with piece letter (NBRQK) or pawn move (a-h), or castling (O-O, O-O-O)
	// Can include capture (x), promotion (=), check (+), checkmate (#)
	const filtered = strippedMoves.filter((move) => {
		if (!move) return false;
		// Remove any remaining special characters that aren't part of SAN
		if (/^[{}()\[\]]/.test(move)) return false;
		// Check if it looks like a valid chess move
		// Valid patterns: e4, Nf3, exd5, O-O, O-O-O, e8=Q, Nxf7+, etc.
		return /^([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](=[NBRQ])?|O-O(-O)?)[+#]?$/.test(
			move,
		);
	});
	return filtered;
}
