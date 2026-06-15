/**
 * A single segment of highlighted text — either a matching portion or
 * non-matching surrounding text.
 */
export interface TextSegment {
	/** The substring of the original text. */
	text: string;
	/** Whether this segment matched the search query. */
	match: boolean;
}

/**
 * Splits `text` into match / non-match segments for typeahead highlighting.
 *
 * Performs a case-insensitive substring match of `query` within `text`.
 * Returns an array of {@link TextSegment} objects that can be rendered
 * with conditional styling (e.g. bold for matching segments).
 *
 * @param text  — Full text to segment (e.g. a player name).
 * @param query — Search query string to match against.
 * @returns Array of `{ text, match }` objects for template rendering.
 *
 * @example
 * ```typescript
 * const segments = highlightMatch('GM Magnus Carlsen (2850)', 'carl');
 * // [
 * //   { text: 'GM Magnus ', match: false },
 * //   { text: 'Carl', match: true },
 * //   { text: 'sen (2850)', match: false },
 * // ]
 * ```
 */
export function highlightMatch(text: string, query: string): TextSegment[] {
	const q = query.toLowerCase().trim();
	if (!q) {
		return [{ text, match: false }];
	}
	const idx = text.toLowerCase().indexOf(q);
	if (idx === -1) {
		return [{ text, match: false }];
	}
	const segments: TextSegment[] = [];
	if (idx > 0) {
		segments.push({ text: text.substring(0, idx), match: false });
	}
	segments.push({
		text: text.substring(idx, idx + q.length),
		match: true,
	});
	if (idx + q.length < text.length) {
		segments.push({ text: text.substring(idx + q.length), match: false });
	}
	return segments;
}
