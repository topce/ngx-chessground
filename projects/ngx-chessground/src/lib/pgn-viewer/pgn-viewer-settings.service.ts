import { Injectable, inject } from '@angular/core';
import { PgnViewerStoreService } from './pgn-viewer-store.service';

/**
 * Filter selections persisted across application sessions.
 *
 * Mirrors the filter state owned by `NgxPgnViewerComponent`. Every field is
 * serialized as plain JSON so the stored blob stays human-readable and can be
 * migrated in future versions.
 */
export interface PersistedFilterState {
	white: string;
	black: string;
	result: string[];
	moves: boolean;
	ignoreColor: boolean;
	upsetEnabled: boolean;
	upsetWin: boolean;
	upsetDraw: boolean;
	upsetMinDiff: string;
	ratingEnabled: boolean;
	whiteRating: string;
	blackRating: string;
	whiteRatingMax: string;
	blackRatingMax: string;
	eco: string;
	timeControl: string[];
	event: string;
	broadcastName: string;
	fen: string;
	byFenEnabled: boolean;
	sortAscending: boolean;
}

/**
 * Complete PGN viewer state persisted to `localStorage`.
 *
 * Besides the filters this keeps the data source the user last worked with —
 * the URL and the Lichess year/month picker — so a fresh session can reload
 * the same database and re-apply the same filter selection.
 */
export interface PersistedViewerState {
	/** Schema version, used to discard incompatible payloads. */
	version: number;
	/** Last PGN URL (Lichess broadcast archive or custom URL). */
	url: string;
	/** Last selected Lichess archive year. */
	lichessYear: number;
	/** Last selected Lichess archive month (1-12). */
	lichessMonth: number;
	filters: PersistedFilterState;
}

/** Current persisted schema version. */
export const PGN_VIEWER_STATE_VERSION = 1;

/** `localStorage` key holding the serialized {@link PersistedViewerState}. */
export const PGN_VIEWER_STATE_STORAGE_KEY = 'ngx-chessground-pgn-viewer-state';

/** Filter defaults, used both for a fresh session and to fill gaps. */
export const DEFAULT_PERSISTED_FILTER_STATE: PersistedFilterState = {
	white: '',
	black: '',
	result: [],
	moves: false,
	ignoreColor: false,
	upsetEnabled: false,
	upsetWin: false,
	upsetDraw: false,
	upsetMinDiff: '300',
	ratingEnabled: false,
	whiteRating: '2000',
	blackRating: '2000',
	whiteRatingMax: '2900',
	blackRatingMax: '2900',
	eco: '',
	timeControl: [],
	event: '',
	broadcastName: '',
	fen: '',
	byFenEnabled: false,
	sortAscending: false,
};

function asString(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string')
		: [...fallback];
}

function asRecord(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object'
		? (value as Record<string, unknown>)
		: {};
}

/**
 * Persists the PGN viewer's filter selection and data-source picker so they
 * survive an application restart.
 *
 * Storage is delegated to {@link PgnViewerStoreService}: `localStorage` in the
 * browser, the desktop server's on-disk store inside the packaged app (where
 * the webview origin changes on every launch and web storage is not durable).
 *
 * Stored values are validated and merged with {@link DEFAULT_PERSISTED_FILTER_STATE}
 * on load, so a corrupt, partial or older payload degrades gracefully instead
 * of throwing.
 *
 * Provided at root level so the viewer component and its host share one
 * instance and one storage key.
 */
@Injectable({ providedIn: 'root' })
export class PgnViewerSettingsService {
	private readonly store = inject(PgnViewerStoreService);

	/**
	 * Reads the persisted viewer state.
	 *
	 * @returns The normalized state, or `null` when nothing valid is stored.
	 */
	load(): PersistedViewerState | null {
		const stored = this.store.get<unknown>(PGN_VIEWER_STATE_STORAGE_KEY);
		return stored === null ? null : this.normalize(stored);
	}

	/**
	 * Writes the viewer state, overwriting any previously stored payload.
	 *
	 * @param state — Complete state snapshot to persist.
	 */
	save(state: PersistedViewerState): void {
		this.store.set(PGN_VIEWER_STATE_STORAGE_KEY, state);
	}

	/** Removes the persisted viewer state. */
	clear(): void {
		this.store.remove(PGN_VIEWER_STATE_STORAGE_KEY);
	}

	/**
	 * Fills the desktop snapshot from disk.
	 *
	 * A no-op in the browser (localStorage is synchronous). Hosts should await
	 * this before reading {@link load} at startup on desktop.
	 */
	hydrate(): Promise<void> {
		return this.store.hydrate([PGN_VIEWER_STATE_STORAGE_KEY]);
	}

	/**
	 * Validates an arbitrary parsed payload and fills missing fields with
	 * defaults. Returns `null` for payloads that are not objects or carry an
	 * incompatible schema version.
	 */
	private normalize(value: unknown): PersistedViewerState | null {
		if (value === null || typeof value !== 'object') return null;
		const record = asRecord(value);
		if (asNumber(record.version, -1) !== PGN_VIEWER_STATE_VERSION) {
			return null;
		}

		const rawFilters = asRecord(record.filters);
		const defaults = DEFAULT_PERSISTED_FILTER_STATE;
		const filters: PersistedFilterState = {
			white: asString(rawFilters.white, defaults.white),
			black: asString(rawFilters.black, defaults.black),
			result: asStringArray(rawFilters.result, defaults.result),
			moves: asBoolean(rawFilters.moves, defaults.moves),
			ignoreColor: asBoolean(rawFilters.ignoreColor, defaults.ignoreColor),
			upsetEnabled: asBoolean(rawFilters.upsetEnabled, defaults.upsetEnabled),
			upsetWin: asBoolean(rawFilters.upsetWin, defaults.upsetWin),
			upsetDraw: asBoolean(rawFilters.upsetDraw, defaults.upsetDraw),
			upsetMinDiff: asString(rawFilters.upsetMinDiff, defaults.upsetMinDiff),
			ratingEnabled: asBoolean(
				rawFilters.ratingEnabled,
				defaults.ratingEnabled,
			),
			whiteRating: asString(rawFilters.whiteRating, defaults.whiteRating),
			blackRating: asString(rawFilters.blackRating, defaults.blackRating),
			whiteRatingMax: asString(
				rawFilters.whiteRatingMax,
				defaults.whiteRatingMax,
			),
			blackRatingMax: asString(
				rawFilters.blackRatingMax,
				defaults.blackRatingMax,
			),
			eco: asString(rawFilters.eco, defaults.eco),
			timeControl: asStringArray(rawFilters.timeControl, defaults.timeControl),
			event: asString(rawFilters.event, defaults.event),
			broadcastName: asString(rawFilters.broadcastName, defaults.broadcastName),
			fen: asString(rawFilters.fen, defaults.fen),
			byFenEnabled: asBoolean(rawFilters.byFenEnabled, defaults.byFenEnabled),
			sortAscending: asBoolean(
				rawFilters.sortAscending,
				defaults.sortAscending,
			),
		};

		return {
			version: PGN_VIEWER_STATE_VERSION,
			url: asString(record.url, ''),
			lichessYear: asNumber(record.lichessYear, 0),
			lichessMonth: asNumber(record.lichessMonth, 0),
			filters,
		};
	}
}
