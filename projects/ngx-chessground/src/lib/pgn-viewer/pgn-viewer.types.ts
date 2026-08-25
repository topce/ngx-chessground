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
	name: string;
	active: boolean;
}

/** A single evaluation change representing a "stop on error" event. */
export interface EvaluationChange {
	moveIndex: number;
	diff: number;
	threshold: number;
	/** Side whose move caused the evaluation change. */
	side: 'white' | 'black';
}

/** Clock state at a given half-move. */
export interface ClockState {
	white: number;
	black: number;
}

/** Stockfish analysis result. */
export interface BestMoveInfo {
	move: string;
	pv: { san: string; fen: string }[];
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
	number: number;
	white: string;
	black: string;
	result: string;
}

/** Typeahead keyboard navigation handler. */
export interface TypeaheadKeyboardEvent {
	key: string;
	preventDefault(): void;
}

/** Input/output contract for the player typeahead component. */
export interface PlayerTypeaheadState {
	value: string;
	suggestions: string[];
	isOpen: boolean;
	activeIndex: number;
}

export type { Key, TextSegment };
