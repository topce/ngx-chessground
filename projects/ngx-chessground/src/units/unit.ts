import type { Api } from 'chessground/api';

/**
 * Represents a unit with a name and a run method.
 */
export interface Unit {
	/**
	 * The name of the unit.
	 */
	name: string;

	/**
	 * Executes the unit's functionality.
	 *
	 * @param el - The HTML element to run the unit on.
	 * @returns An instance of Api.
	 */
	run: (el: HTMLElement) => Api;
}
