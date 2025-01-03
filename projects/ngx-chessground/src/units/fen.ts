import { Chessground } from "chessground";
import type { Key } from "chessground/types.d";
import type { Unit } from "./unit";

export const autoSwitch: Unit = {
	name: "FEN: switch (puzzle bug)",
	run(cont) {
		const configs: Array<() => { fen: string; lastMove: Key[] }> = [
			() => ({
				orientation: "black",
				fen: "rnbqkb1r/pp1ppppp/5n2/8/3N1B2/8/PPP1PPPP/RN1QKB1R b KQkq - 0 4",
				lastMove: ["f3", "d4"],
			}),
			() => ({
				orientation: "white",
				fen: "2r2rk1/4bp1p/pp2p1p1/4P3/4bP2/PqN1B2Q/1P3RPP/2R3K1 w - - 1 23",
				lastMove: ["b4", "b3"],
			}),
		];
		const cg = Chessground(cont, configs[0]());
		const delay = 2000;
		let it = 0;
		function run() {
			if (!cg.state.dom.elements.board.offsetParent) {
				return;
			}
			cg.set(configs[++it % configs.length]());
			setTimeout(run, delay);
		}
		setTimeout(run, delay);
		return cg;
	},
};
