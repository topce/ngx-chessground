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
 * Loads raw PGN text: splits into individual games, filters out non-Standard variants,
 * extracts metadata, and posts a `'load'` response with game count and metadata.
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

	// Filter out non-standard variants (keep Standard or if Variant tag is missing)
	games = allGames.filter((g) => {
		const variantMatch = g.match(/\[Variant\s+"([^"]+)"\]/);
		if (!variantMatch) return true; // Default is Standard
		return variantMatch[1] === 'Standard';
	});

	// Extract metadata
	gameMetadata = games.map((game, index) => extractGameInfo(game, index));

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
 * Filters the currently loaded game collection by the given criteria.
 *
 * Matches are case-insensitive substring comparisons. When `moves` is `true`,
 * tests whether each game's opening sequence starts with `targetMoves`.
 * Posts a `'filter'` response with an array of matching game indices.
 *
 * @param criteria — Filter parameters (player names, ECO, result, ratings, opening moves).
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

	// Clear cache when filtering by moves to ensure fresh parsing with updated logic
	if (moves && targetMoves.length > 0) {
		gameMovesCache.clear();
	}

	const matches: number[] = [];

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

		matches.push(i);
	}

	// Sort matches by sum of Elo ratings (descending)
	matches.sort((a, b) => {
		const sumA = gameMetadata[a].whiteElo + gameMetadata[a].blackElo;
		const sumB = gameMetadata[b].whiteElo + gameMetadata[b].blackElo;
		return sumB - sumA;
	});

	postMessage({
		type: 'filter',
		id,
		payload: matches,
	});
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

		// We need to extract evaluations BEFORE cleaning the PGN too aggressively,
		// because some cleaning steps might remove comments or mess up the mapping.
		// However, standard chess.js loadPgn parses comments.
		// Let's try to parse with chess.js first on the original PGN (or slightly cleaned).

		// If we use the "cleanPgn" logic from before, we might lose comments if we strip them.
		// But the previous logic had a fallback that stripped comments.
		// Let's try to parse the original PGN first to get comments.

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
			// If strict parsing fails, we fall back to the cleaning logic,
			// but we might lose evaluations if the cleaning strips comments.
			// For now, let's proceed with the cleaning logic for moves,
			// and accept that we might not get evaluations in broken PGNs.

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

			// 5. Remove "1..." style move numbering (Black's move indicators)
			cleanPgn = cleanPgn.replace(/\d+\.\.\./g, ' ');

			// 6. Remove numeric annotation glyphs like $1, $2... (standard PGN but chess.js might fail)
			cleanPgn = cleanPgn.replace(/\$\d+/g, '');

			try {
				tempChess.loadPgn(cleanPgn);
				moves = tempChess.history();
				// Try to get comments again from the cleaned PGN
				const comments = tempChess.getComments();
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
			} catch (_e1) {
				// console.warn('Strict parsing failed, trying chessops fallback', e1);

				try {
					// Fallback: Try chessops
					const games = parsePgn(cleanPgn);
					if (games.length > 0) {
						const game = games[0];
						moves = [];
						evaluations = []; // Chessops might have comments in the node tree
						let node = game.moves;
						while (node.children.length > 0) {
							const child = node.children[0]; // Main line
							if (child.data?.san) {
								moves.push(child.data.san);
								// Extract eval from comments if present
								let evalVal = null;
								if (child.data.comments) {
									for (const comment of child.data.comments) {
										const match = comment.match(/\[%eval\s+([^\]]+)\]/);
										if (match) {
											evalVal = match[1];
											break;
										}
									}
								}
								evaluations.push(evalVal);
							}
							node = child;
						}
						// If we successfully parsed moves, clear the error
						errorMsg = undefined;
					} else {
						throw new Error('Chessops found no games');
					}
				} catch (_e2) {
					// console.warn('Chessops parsing failed, retrying with stripped comments', e2);

					// Fallback 2: Strip all comments and recursive variations
					// Remove { ... } comments
					cleanPgn = cleanPgn.replace(/\{[^}]*\}/g, '');
					// Remove ( ... ) variations
					cleanPgn = cleanPgn.replace(/\([^)]*\)/g, '');
					// Clean up double spaces created by removals
					cleanPgn = cleanPgn.replace(/\s+/g, ' ');

					tempChess.loadPgn(cleanPgn);
					moves = tempChess.history();
					evaluations = []; // No comments, no evals
					errorMsg = undefined;
				}
			}
		}

		// We can update the cache with the high-quality moves if we want,
		// but for now let's just return them.
		gameMovesCache.set(index, moves);
	} catch (e) {
		console.error('Error parsing game moves', e);
		errorMsg = String(e);
		moves = [];
		evaluations = [];
	}

	postMessage({
		type: 'loadGame',
		id,
		payload: { moves, pgn: cleanPgn, evaluations, error: errorMsg },
	});
}

// --- Helpers ---

/**
 * Splits a multi-game PGN string into individual game strings.
 *
 * Splits on `[Event "..."` tag boundaries, which marks the start of each game.
 * Handles concatenated games where the tag may appear anywhere in the text.
 *
 * @param pgn — Raw PGN string containing one or more games.
 * @returns Array of individual game PGN strings.
 */
function splitPgn(pgn: string): string[] {
	// Split by [Event " tag, allowing for it to be anywhere (not just start of line)
	// This handles cases where games are concatenated on the same line.
	const parts = pgn.split(/(?=\[Event\s+")/);
	const result: string[] = [];
	for (const part of parts) {
		const trimmed = part.trim();
		if (trimmed.length > 0 && /^\[Event\s+"/.test(trimmed)) {
			result.push(trimmed);
		}
	}
	return result;
}

/**
 * Extracts metadata from a single game's PGN header tags.
 *
 * Parses White, Black, Result, WhiteElo, BlackElo, WhiteTitle, BlackTitle,
 * ECO, TimeControl, and Event tags. Formats player names with title+Elo
 * (e.g. `"GM Carlsen (2850)"`). Normalizes the time control field.
 *
 * @param pgn — Raw PGN string for a single game.
 * @param index — Zero-based game index (result's `number` will be `index + 1`).
 * @returns Populated {@link GameMetadata} object.
 */
function extractGameInfo(pgn: string, index: number): GameMetadata {
	const whiteMatch = pgn.match(/\[White\s+"([^"]+)"\]/);
	const blackMatch = pgn.match(/\[Black\s+"([^"]+)"\]/);
	const resultMatch = pgn.match(/\[Result\s+"([^"]+)"\]/);

	const whiteEloMatch = pgn.match(/\[WhiteElo\s+"([^"]+)"\]/);
	const blackEloMatch = pgn.match(/\[BlackElo\s+"([^"]+)"\]/);
	const whiteTitleMatch = pgn.match(/\[WhiteTitle\s+"([^"]+)"\]/);
	const blackTitleMatch = pgn.match(/\[BlackTitle\s+"([^"]+)"\]/);
	const ecoMatch = pgn.match(/\[ECO\s+"([^"]+)"\]/);
	const timeControlMatch = pgn.match(/\[TimeControl\s+"([^"]+)"\]/);
	const eventMatch = pgn.match(/\[Event\s+"([^"]+)"\]/);

	let white = whiteMatch ? whiteMatch[1] : 'Unknown';
	let black = blackMatch ? blackMatch[1] : 'Unknown';
	const result = resultMatch ? resultMatch[1] : '*';

	if (whiteTitleMatch) white = `${whiteTitleMatch[1]} ${white}`;
	if (whiteEloMatch) white = `${white} (${whiteEloMatch[1]})`;

	if (blackTitleMatch) black = `${blackTitleMatch[1]} ${black}`;
	if (blackEloMatch) black = `${black} (${blackEloMatch[1]})`;

	let formattedResult = result;
	if (result === '1-0') formattedResult = '1-0';
	else if (result === '0-1') formattedResult = '0-1';
	else if (result === '1/2-1/2') formattedResult = '½-½';

	const whiteElo = whiteEloMatch ? parseInt(whiteEloMatch[1], 10) || 0 : 0;
	const blackElo = blackEloMatch ? parseInt(blackEloMatch[1], 10) || 0 : 0;
	const eco = ecoMatch ? ecoMatch[1] : undefined;
	const timeControl = timeControlMatch ? timeControlMatch[1] : undefined;
	const timeControlNormalized = normalizeTimeControl(timeControl);
	const event = eventMatch ? eventMatch[1] : undefined;

	return {
		number: index + 1,
		white,
		black,
		result: formattedResult,
		whiteElo,
		blackElo,
		eco,
		timeControl,
		timeControlNormalized,
		event,
	};
}

/**
 * Normalizes a PGN `[TimeControl "..."]` value into a uniform `"baseSeconds+incrementSeconds"` format.
 *
 * Handles formats including:
 * - `"h:m:s"` (e.g. `"1:30:0"` → `"5400+0"`)
 * - `"m:s"` (e.g. `"90+30"` → `"5400+30"`)
 * - `"base+inc"` (e.g. `"180+2"` → `"180+2"`)
 * - Textual: `"90 min + 30 sec"`, `"3'"`, `"3 min"`, etc.
 *
 * Heuristic: base values ≤ 180 are treated as minutes unless a `min`/`mins`/`'` suffix is present.
 *
 * @param raw — Raw time control string from the PGN header, or `undefined`.
 * @returns Normalized string like `"5400+30"`, or `undefined` if unparseable.
 */
function normalizeTimeControl(raw?: string): string | undefined {
	if (!raw) return undefined;
	const trimmed = raw.trim();
	if (!trimmed || trimmed === '?' || trimmed === '-') return undefined;
	const lower = trimmed.toLowerCase();

	// Strip leading tokens like "g:" or "g "
	const cleaned = lower.replace(/^g\s*:\s*/i, '').replace(/^g\s+/i, '');

	// Handle colon formats: h:m:s -> base = h:m, increment = s
	let match = cleaned.match(/^(\d+):(\d+):(\d+)$/);
	if (match) {
		const hours = parseInt(match[1], 10);
		const minutes = parseInt(match[2], 10);
		const incSeconds = parseInt(match[3], 10);
		if (
			!Number.isNaN(hours) &&
			!Number.isNaN(minutes) &&
			!Number.isNaN(incSeconds)
		) {
			const baseSeconds = hours * 3600 + minutes * 60;
			return `${baseSeconds}+${incSeconds}`;
		}
	}

	// Handle colon formats: m:s -> base minutes, increment seconds
	match = cleaned.match(/^(\d+):(\d+)$/);
	if (match) {
		const baseMinutes = parseInt(match[1], 10);
		const incSeconds = parseInt(match[2], 10);
		if (!Number.isNaN(baseMinutes) && !Number.isNaN(incSeconds)) {
			const baseSeconds = baseMinutes * 60;
			return `${baseSeconds}+${incSeconds}`;
		}
	}

	// Handle common base+increment formats
	match = cleaned.match(
		/(\d+)\s*(?:min|m|')?\s*\+\s*(\d+)\s*(?:sec|s|''|"|\b)?/,
	);
	if (match) {
		const baseVal = parseInt(match[1], 10);
		const incVal = parseInt(match[2], 10);
		if (!Number.isNaN(baseVal) && !Number.isNaN(incVal)) {
			const baseHasMinutes = /\bmin\b|\bmins\b|\bminutes\b|\bminute\b|'/i.test(
				cleaned,
			);
			const baseIsMinutes = baseHasMinutes || baseVal <= 180;
			const baseSeconds = baseIsMinutes ? baseVal * 60 : baseVal;

			const incHasMinutes =
				/\binc\b.*\bmin\b|\bmin\b.*\binc\b|\bminutes\b.*\binc\b/i.test(cleaned);
			const incSeconds = incHasMinutes ? incVal * 60 : incVal;
			return `${baseSeconds}+${incSeconds}`;
		}
	}

	// Textual formats: try extracting minutes and seconds
	const baseMinMatch = cleaned.match(/(\d+)\s*(?:min|mins|minutes|')/i);
	const incSecMatch = cleaned.match(/(\d+)\s*(?:sec|secs|seconds|''|s)\b/i);
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
