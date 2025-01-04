import { Chessground } from "chessground";
import type { Key } from "chessground/types.d";
import type { Unit } from "./unit";

/**
 * Represents a unit for the Crazyhouse variant where the last move is a drop.
 * This unit runs a sequence of configurations on a chessboard, each with a specific FEN and last move.
 * The configurations are cycled through with a delay between each change.
 *
 * @constant
 * @type {Unit}
 * @name lastMoveDrop
 *
 * @property {string} name - The name of the unit.
 * @property {function} run - The function that runs the unit.
 * @param {HTMLElement} cont - The container element where the chessboard will be rendered.
 * @returns {Chessground} - The Chessground instance.
 */
export const lastMoveDrop: Unit = {
	name: "Crazyhouse: lastMove = drop",
	run(cont) {
		const configs: Array<() => { fen: string; lastMove: Key[] }> = [
			() => ({
				fen: "Bn2kb1r/p1p2ppp/4q3/2Pp4/3p1NP1/2B2n2/PPP2P1P/R2KqB1R/RNpp w k - 42 22",
				lastMove: ["e5", "d4"],
			}),
			() => ({
				fen: "Bn2kb1r/p1p2ppp/4q3/2Pp4/3p1NP1/2B2n2/PPP2P1P/R2KqB1R/RNpp w k - 42 22",
				lastMove: ["f4"],
			}),
			() => ({
				fen: "Bn2kb1r/p1p2ppp/4q3/2Pp4/3p1NP1/2B2n2/PPP2P1P/R2KqB1R/RNpp w k - 42 22",
				lastMove: ["e1"],
			}),
		];
		const cg = Chessground(cont, configs[0]());
		const delay = 2000;
		let it = 0;
		function run() {
			if (!cg.state.dom.elements.board.offsetParent) {
				return;
			}
			const config = configs[++it % configs.length];
			//console.log(config);
			cg.set(config());
			setTimeout(run, delay);
		}
		setTimeout(run, delay);
		return cg;
	},
};
