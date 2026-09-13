/**
 * Lichess broadcast archive URL helpers.
 *
 * Extracted from the viewer component so the derivation rule is unit-testable
 * on its own — it is the one piece of non-obvious behaviour behind the URL
 * field (generated URLs follow the picker, hand-entered ones do not).
 */

/** Matches a URL produced by {@link lichessBroadcastUrl}. */
const BROADCAST_URL_PATTERN =
	/^lichess\/broadcast\/lichess_db_broadcast_\d{4}-\d{2}\.pgn\.zst$/;

/**
 * Path of the Lichess monthly broadcast archive for a year/month pair.
 *
 * @param year — Four-digit year.
 * @param month — Month number (1-12); zero-padded to two digits.
 */
export function lichessBroadcastUrl(year: number, month: number): string {
	const m = month.toString().padStart(2, '0');
	return `lichess/broadcast/lichess_db_broadcast_${year}-${m}.pgn.zst`;
}

/**
 * Whether `url` is a URL this library generated from the year/month picker,
 * as opposed to one the user typed or restored from a previous session.
 */
export function isLichessBroadcastUrl(url: string): boolean {
	return BROADCAST_URL_PATTERN.test(url);
}

/**
 * Resolves the PGN source URL shown in the load panel.
 *
 * The URL follows the Lichess year/month picker, but a value the user chose —
 * a hand-entered URL, or one restored from storage that is unrelated to the
 * picker — is preserved across later picker changes.
 *
 * @param next — The year/month the picker currently shows.
 * @param previousUrl — The URL currently in the field, if any.
 * @returns The URL the field should show.
 */
export function resolveBroadcastUrl(
	next: { year: number; month: number },
	previousUrl: string | undefined,
): string {
	// A value we did not generate is the user's; never overwrite it.
	if (previousUrl !== undefined && !isLichessBroadcastUrl(previousUrl)) {
		return previousUrl;
	}
	// An unset picker must not produce a nonsense URL such as `_0-00`.
	if (!next.year || !next.month) return previousUrl ?? '';
	return lichessBroadcastUrl(next.year, next.month);
}
