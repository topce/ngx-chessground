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
