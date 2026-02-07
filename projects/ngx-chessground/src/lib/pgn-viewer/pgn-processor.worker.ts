/// <reference lib="webworker" />

import { Chess } from 'chess.js';
import { parsePgn } from 'chessops/pgn';

// Define types for messages
export type WorkerMessage =
	| { type: 'load'; payload: string; id: number }
	| { type: 'filter'; payload: FilterCriteria; id: number }
	| { type: 'loadGame'; payload: number; id: number };

export interface FilterCriteria {
	white: string;
	black: string;
	result: string;
	moves: boolean;
	ignoreColor: boolean;
	targetMoves: string[];
	minWhiteRating: number;
	minBlackRating: number;
	maxWhiteRating: number;
	maxBlackRating: number;
	eco: string;
	timeControl: string;
	event: string;
}

export type WorkerResponse =
	| {
			type: 'load';
			payload: { count: number; metadata: GameMetadata[] };
			id: number;
	  }
	| { type: 'filter'; payload: number[]; id: number }
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
	| { type: 'error'; payload: string; id: number };

export interface GameMetadata {
	number: number;
	white: string;
	black: string;
	result: string;
	whiteElo: number;
	blackElo: number;
	eco?: string;
	timeControl?: string;
	event?: string;
}

// State
let games: string[] = [];
let gameMetadata: GameMetadata[] = [];
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
		if (fTimeControl && info.timeControl !== fTimeControl) continue;

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
		event,
	};
}

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
