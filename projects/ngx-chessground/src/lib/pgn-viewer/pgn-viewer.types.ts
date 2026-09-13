/**
 * Types for the PGN viewer component and its sub-components.
 */

import type { Key } from 'chessground/types';
import type { TextSegment } from './text-highlight';

/** Collapsible section identifier for the left panel. */
export type LeftPanelSection =
	| 'players'
	| 'gameDetails'
	| 'upsets'
	| 'rating'
	| 'position';

/** Collapsible section identifier for the right panel. */
export type RightPanelSection = 'moves' | 'replay' | 'loadCache';

/** Replay timing mode. */
export type ReplayMode = 'realtime' | 'proportional' | 'fixed' | 'fast';

/** Which side's errors should trigger "stop on error" during replay. */
export type StopOnErrorSide = 'both' | 'white' | 'black';

/** Player name with optional selection state for typeahead. */
export interface PlayerSuggestion {
	/** Display name of the player. */
	name: string;
	/** Whether this suggestion is the highlighted one in the dropdown. */
	active: boolean;
}

/** A single evaluation change representing a "stop on error" event. */
export interface EvaluationChange {
	/** Zero-based index of the move that caused the change. */
	moveIndex: number;
	/** Size of the evaluation swing, in pawns. */
	diff: number;
	/** The configured `stopOnErrorThreshold` this `diff` exceeded. */
	threshold: number;
	/** Side whose move caused the evaluation change. */
	side: 'white' | 'black';
}

/** Clock state at a given half-move. */
export interface ClockState {
	/** Remaining time for White, in seconds. */
	white: number;
	/** Remaining time for Black, in seconds. */
	black: number;
}

/** Stockfish analysis result. */
export interface BestMoveInfo {
	/** Best move found, in SAN. */
	move: string;
	/** Principal variation, as SAN plus the FEN reached after each move. */
	pv: { san: string; fen: string }[];
	/**
	 * Engine evaluation of the position, from White's perspective
	 * (e.g. `'+0.32'`, `'#-2'`).
	 */
	score?: string;
}

/** A single move played during practice mode. */
export interface PracticeMove {
	/** Move in standard algebraic notation (SAN). */
	san: string;
	/**
	 * Stockfish evaluation of the position after this move, from White's
	 * perspective (e.g. `'+0.32'`, `'#-2'`), or null while pending/unknown.
	 */
	evaluation: string | null;
}

/** Complete export payload for a practice session. */
export interface PracticeExport {
	/** FEN of the position where the practice session started. */
	startFen: string;
	/** FEN of the current practice position. */
	fen: string;
	/** SAN moves played during the practice session. */
	moves: string[];
	/** Formatted move text (e.g. `"1. e4 e5 2. Nf3"`). */
	moveText: string;
	/** Full PGN of the practice session, including evaluation comments. */
	pgn: string;
}

/** Game metadata for the filter panel's game list. */
export interface FilterGameInfo {
	/** One-based game number as shown in the list. */
	number: number;
	/** Player with the white pieces. */
	white: string;
	/** Player with the black pieces. */
	black: string;
	/** Result string: `'1-0'`, `'0-1'`, `'1/2-1/2'` or `'*'`. */
	result: string;
}

/** Typeahead keyboard navigation handler. */
export interface TypeaheadKeyboardEvent {
	/** The `KeyboardEvent.key` value that was pressed. */
	key: string;
	/** Suppresses the browser's default handling of the key. */
	preventDefault(): void;
}

/** Input/output contract for the player typeahead component. */
export interface PlayerTypeaheadState {
	/** Current text in the typeahead field. */
	value: string;
	/** Player names matching the current query. */
	suggestions: string[];
	/** Whether the suggestion dropdown is showing. */
	isOpen: boolean;
	/** Index of the highlighted suggestion, or `-1` when none is highlighted. */
	activeIndex: number;
}

/**
 * A PGN data source the viewer can load.
 *
 * A discriminated union rather than a set of boolean flags, so an invalid
 * combination ("load a URL and also this file") is unrepresentable.
 */
export type PgnSource =
	/** A remote archive or PGN file. `.zst` is decompressed automatically. */
	| {
			readonly kind: 'url';
			/** Absolute or app-relative URL. */
			readonly url: string;
			/**
			 * Remember this URL alongside the content hash so a later session
			 * can restore it from cache without downloading. Defaults to the
			 * URL itself, or `false` to opt out of bookmarking.
			 */
			readonly cacheAs?: string | false;
	  }
	/** Raw PGN text already held by the host. */
	| {
			readonly kind: 'pgn';
			readonly text: string;
			/** Optional origin, used for cache bookmarking. */
			readonly sourceUrl?: string;
	  }
	/** A `File` from an `<input type="file">` or drag & drop. */
	| {
			readonly kind: 'file';
			readonly file: File;
	  };

/** Optional per-call overrides for {@link PgnSource} loading. */
export interface LoadOptions {
	/**
	 * Build a position index for the loaded games. Defaults to the viewer's
	 * current `indexStartPositions` setting.
	 */
	readonly indexStartPositions?: boolean;
	/** Max half-moves replayed per game when indexing. Defaults to `maxFenPlies`. */
	readonly maxFenPlies?: number;
}

/** Machine-readable failure categories reported through `loadFailed`. */
export type PgnViewerErrorCode =
	/** The source could not be fetched (network, HTTP status, CORS). */
	| 'DOWNLOAD_FAILED'
	/** The archive or PGN text could not be parsed into games. */
	| 'PARSE_FAILED'
	/** The local cache could not be read or written. */
	| 'CACHE_FAILED'
	/** The Stockfish worker could not be started. */
	| 'ENGINE_FAILED'
	/** The source was rejected before any work started (missing/empty input). */
	| 'INVALID_SOURCE';

/**
 * A failure the host can observe and react to.
 *
 * Every load path reports exactly one of these on failure, so a host needs a
 * single handler rather than sniffing console output.
 */
export interface PgnViewerError {
	/** Stable category for programmatic branching. */
	readonly code: PgnViewerErrorCode;
	/** Human-readable description, safe to display. */
	readonly message: string;
	/** The originating error, when there was one. */
	readonly cause?: unknown;
}

export type { Key, TextSegment };
