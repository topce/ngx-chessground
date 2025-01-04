import { Chessground } from "chessground";
import type { DrawShape } from "chessground/draw";
import type { Unit } from "./unit";

/**
 * Represents a unit test case for preset user shapes in Chessground.
 * This unit initializes a Chessground instance with predefined drawable shapes.
 *
 * @type {Unit}
 * @property {string} name - The name of the unit test case
 * @property {(el: HTMLElement) => Api} run - Function that initializes Chessground with preset shapes
 */
export const presetUserShapes: Unit = {
	name: "Preset user shapes",
	run: (el) => Chessground(el, { drawable: { shapes: shapeSet1 } }),
};

/**
 * Unit test for automatically changing shapes with high difference between states
 * Creates a Chessground instance that cycles through different shape sets at regular intervals
 *
 * @property {string} name - The name of the unit test
 * @property {function} run - Function that executes the shape changing logic
 * @param {HTMLElement} el - The DOM element where Chessground will be mounted
 * @returns {Api} The Chessground API instance
 *
 * @remarks
 * The function cycles through three predefined shape sets (shapeSet1, shapeSet2, shapeSet3)
 * with a delay of 1000ms between changes. The cycling continues until the board
 * is no longer in the DOM (checked via offsetParent).
 */
export const changingShapesHigh: Unit = {
	name: "Automatically changing shapes (high diff)",
	run(el) {
		const cg = Chessground(el, { drawable: { shapes: shapeSet1 } });
		const delay = 1000;
		const sets = [shapeSet1, shapeSet2, shapeSet3];
		let i = 0;
		function run() {
			if (!cg.state.dom.elements.board.offsetParent) {
				return;
			}
			cg.setShapes(sets[++i % sets.length]);
			setTimeout(run, delay);
		}
		setTimeout(run, delay);
		return cg;
	},
};

/**
 * Represents a unit that automatically changes shapes with a low difficulty level.
 *
 * @constant
 * @type {Unit}
 * @name changingShapesLow
 *
 * @property {string} name - The name of the unit.
 * @property {function} run - The function that initializes the Chessground instance and starts the automatic shape changing.
 *
 * @param {HTMLElement} el - The HTML element where the Chessground instance will be initialized.
 *
 * @returns {Chessground} The initialized Chessground instance.
 */
export const changingShapesLow: Unit = {
	name: "Automatically changing shapes (low diff)",
	run(el) {
		const cg = Chessground(el, { drawable: { shapes: shapeSet1 } });
		const delay = 1000;
		const sets = [shapeSet1, shapeSet1b, shapeSet1c];
		let i = 0;
		function run() {
			if (!cg.state.dom.elements.board.offsetParent) {
				return;
			}
			cg.setShapes(sets[++i % sets.length]);
			setTimeout(run, delay);
		}
		setTimeout(run, delay);
		return cg;
	},
};

/**
 * Represents a unit that applies brush modifiers to drawable shapes on a chessboard.
 *
 * @constant
 * @type {Unit}
 * @name brushModifiers
 *
 * @property {string} name - The name of the unit.
 * @property {Function} run - The function that initializes the brush modifiers on the given element.
 *
 * @param {HTMLElement} el - The HTML element to which the brush modifiers will be applied.
 *
 * @returns {Chessground} - The Chessground instance with the applied brush modifiers.
 *
 * The `run` function:
 * - Generates sets of drawable shapes with random brush modifiers.
 * - Initializes a Chessground instance with the first set of shapes.
 * - Continuously updates the shapes on the chessboard at a specified interval.
 */
export const brushModifiers: Unit = {
	name: "Brush modifiers",
	run(el) {
		function sets() {
			return [shapeSet1, shapeSet1b, shapeSet1c].map((set: DrawShape[]) =>
				set.map((shape: DrawShape) => {
					shape.modifiers = Math.round(Math.random())
						? undefined
						: {
								lineWidth: 2 + Math.round(Math.random() * 3) * 4,
							};
					return shape;
				}),
			);
		}
		const cg = Chessground(el, { drawable: { shapes: sets()[0] } });
		const delay = 1000;
		let i = 0;
		function run() {
			if (!cg.state.dom.elements.board.offsetParent) {
				return;
			}
			cg.setShapes(sets()[++i % sets().length]);
			setTimeout(run, delay);
		}
		setTimeout(run, delay);
		return cg;
	},
};

/**
 * Represents a unit that automatically generates and sets shapes on a chessboard.
 *
 * @constant
 * @type {Unit}
 * @name autoShapes
 *
 * @property {string} name - The name of the unit.
 * @property {function} run - The function that initializes and runs the auto shape generation.
 *
 * @param {HTMLElement} el - The HTML element where the chessboard will be rendered.
 *
 * @returns {Chessground} - The Chessground instance with auto shapes functionality.
 */
export const autoShapes: Unit = {
	name: "Autoshapes",
	run(el) {
		function sets() {
			return [shapeSet1, shapeSet1b, shapeSet1c].map((set: DrawShape[]) =>
				set.map((shape: DrawShape) => {
					shape.modifiers = Math.round(Math.random())
						? undefined
						: {
								lineWidth: 2 + Math.round(Math.random() * 3) * 4,
							};
					return shape;
				}),
			);
		}
		const cg = Chessground(el);
		const delay = 1000;
		let i = 0;
		function run() {
			if (!cg.state.dom.elements.board.offsetParent) {
				return;
			}
			cg.setAutoShapes(sets()[++i % sets().length]);
			setTimeout(run, delay);
		}
		setTimeout(run, delay);
		return cg;
	},
};

/**
 * A unit configuration for creating a Chessground instance with shapes not visible.
 *
 * @constant
 * @type {Unit}
 * @name visibleFalse
 *
 * @property {string} name - The name of the unit.
 * @property {Function} run - A function that initializes a Chessground instance with the specified element.
 * @param {HTMLElement} el - The HTML element to initialize the Chessground instance on.
 *
 * @example
 * // Usage example:
 * visibleFalse.run(document.getElementById('chessboard'));
 */
export const visibleFalse: Unit = {
	name: "Shapes not visible",
	run: (el) =>
		Chessground(el, {
			drawable: {
				visible: false,
				shapes: shapeSet1,
			},
		}),
};

/**
 * A unit configuration object for a chessboard with shapes that are not enabled but still visible.
 *
 * @constant
 * @type {Unit}
 * @property {string} name - The name of the unit.
 * @property {function} run - A function that initializes a Chessground instance with the given element.
 * @param {HTMLElement} el - The HTML element to initialize the Chessground instance on.
 * @returns {void}
 */
export const enabledFalse: Unit = {
	name: "Shapes not enabled, but visible",
	run: (el) =>
		Chessground(el, {
			drawable: {
				enabled: false,
				shapes: shapeSet1,
			},
		}),
};

/**
 * A predefined set of drawing shapes for a chessboard.
 * Each shape can represent a square highlight, an arrow, or a piece on the board.
 *
 * @type {DrawShape[]}
 *
 * @property {string} orig - The origin square of the shape.
 * @property {string} [dest] - The destination square of the shape (for arrows).
 * @property {string} brush - The color of the shape.
 * @property {Object} [piece] - The piece to be drawn on the board.
 * @property {string} piece.color - The color of the piece (e.g., "white" or "black").
 * @property {string} piece.role - The role of the piece (e.g., "knight", "queen").
 * @property {number} [piece.scale] - The scale of the piece (optional).
 */
const shapeSet1: DrawShape[] = [
	{ orig: "a3", brush: "green" },
	{ orig: "a4", brush: "blue" },
	{ orig: "a5", brush: "yellow" },
	{ orig: "a6", brush: "red" },
	{ orig: "e2", dest: "e4", brush: "green" },
	{ orig: "a6", dest: "c8", brush: "blue" },
	{ orig: "f8", dest: "f4", brush: "yellow" },
	{
		orig: "h5",
		brush: "green",
		piece: {
			color: "white",
			role: "knight",
		},
	},
	{
		orig: "h6",
		brush: "red",
		piece: {
			color: "black",
			role: "queen",
			scale: 0.6,
		},
	},
];

/**
 * A set of drawing shapes used for rendering on a chessboard.
 * Each shape can represent a square highlight or an arrow between two squares.
 *
 * @type {DrawShape[]}
 *
 * @property {string} orig - The origin square of the shape.
 * @property {string} [dest] - The destination square of the shape (for arrows).
 * @property {string} brush - The color of the shape.
 * @property {Object} [piece] - The piece to be drawn on the origin square.
 * @property {string} piece.color - The color of the piece (e.g., "black" or "white").
 * @property {string} piece.role - The role of the piece (e.g., "bishop", "knight").
 */
const shapeSet2: DrawShape[] = [
	{ orig: "c1", brush: "green" },
	{ orig: "d1", brush: "blue" },
	{ orig: "e1", brush: "yellow" },
	{ orig: "e2", dest: "e4", brush: "green" },
	{ orig: "h6", dest: "h8", brush: "blue" },
	{ orig: "b3", dest: "d6", brush: "red" },
	{ orig: "a1", dest: "e1", brush: "red" },
	{
		orig: "f5",
		brush: "green",
		piece: {
			color: "black",
			role: "bishop",
		},
	},
];

/**
 * A constant array of DrawShape objects representing shapes to be drawn on a chessboard.
 *
 * @constant
 * @type {DrawShape[]}
 * @default
 * @property {string} orig - The origin square of the shape on the chessboard.
 * @property {string} brush - The color of the shape.
 *
 * Example usage:
 * ```
 * const shapeSet3: DrawShape[] = [{ orig: "e5", brush: "blue" }];
 * ```
 */
const shapeSet3: DrawShape[] = [{ orig: "e5", brush: "blue" }];

/**
 * A set of drawing shapes for a chessboard.
 * Each shape can represent a square highlight or an arrow between two squares.
 * Shapes can also include a piece with specific attributes.
 *
 * @type {DrawShape[]}
 * @property {string} orig - The origin square of the shape.
 * @property {string} [dest] - The destination square of the shape (for arrows).
 * @property {string} brush - The color of the shape.
 * @property {Object} [piece] - The piece to be drawn on the square.
 * @property {string} piece.color - The color of the piece (e.g., "white" or "black").
 * @property {string} piece.role - The role of the piece (e.g., "knight", "queen").
 * @property {number} [piece.scale] - The scale of the piece (optional).
 */
