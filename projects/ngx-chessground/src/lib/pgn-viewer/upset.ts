/**
 * Pure helpers for "upset" game detection — a weaker-rated player
 * beating or drawing a stronger-rated opponent.
 */

import type { GameMetadata } from './pgn-processor.worker';

/**
 * Determines whether a game counts as an upset against the rating gap.
 *
 * An upset requires:
 * - both players to have a known (non-zero) Elo rating,
 * - the rating gap to be at least {@link minEloDiff},
 * - the weaker player (lower Elo) to either win the game (upsetWin)
 *   or hold a draw (upsetDraw), per the enabled outcome flags.
 *
 * @param info — Metadata for the game being tested.
 * @param upsetWin — Whether a weaker-player win counts as an upset.
 * @param upsetDraw — Whether a weaker-player draw counts as an upset.
 * @param minEloDiff — Minimum absolute Elo gap required.
 * @returns `true` if the game is an upset under the given settings.
 */
export function isUpsetGame(
	info: GameMetadata,
	upsetWin: boolean,
	upsetDraw: boolean,
	minEloDiff: number,
): boolean {
	if (!upsetWin && !upsetDraw) return false;
	const { whiteElo, blackElo } = info;
	if (whiteElo <= 0 || blackElo <= 0) return false;
	const gap = Math.abs(whiteElo - blackElo);
	// Equal ratings mean there is no weaker player, so never an upset —
	// even when the minimum gap is 0.
	if (gap <= 0 || gap < minEloDiff) return false;

	const weakerIsWhite = whiteElo < blackElo;
	const normalizedResult = normalizeResult(info.result);

	if (upsetWin) {
		if (weakerIsWhite && normalizedResult === '1-0') return true;
		if (!weakerIsWhite && normalizedResult === '0-1') return true;
	}
	if (upsetDraw && normalizedResult === 'draw') return true;
	return false;
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
