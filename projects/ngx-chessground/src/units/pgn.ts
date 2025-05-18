import type { Chess as ChessInstance, Move } from "chess.js";
import { Chessground } from "chessground";
import type { Unit } from "./unit";
import { Chess } from "chess.js";

/**
 * A PGN (Portable Game Notation) string representing a chess game.
 *
 * The PGN includes metadata about the game such as event, site, date, players,
 * their ratings, and the result. It also contains the moves of the game along
 * with timestamps for each move.
 *
 * Example metadata:
 * - Event: Rated Blitz game
 * - Site: https://lichess.org/hvB20kxq
 * - Date: 2018.05.19
 * - White: topce
 * - Black: donateIIo
 * - Result: 1-0
 * - WhiteElo: 2342
 * - BlackElo: 2406
 * - WhiteRatingDiff: +12
 * - BlackRatingDiff: -12
 * - BlackTitle: GM
 * - Variant: Standard
 * - TimeControl: 180+0
 * - ECO: A00
 * - Opening: Anderssen Opening
 * - Termination: Normal
 *
 * Example moves:
 * 1. a3 { [%clk 0:03:00] } a6 { [%clk 0:03:00] }
 * 2. b3 { [%clk 0:02:59] } h6 { [%clk 0:03:00] }
 * 3. c3 { [%clk 0:02:59] } Nf6 { [%clk 0:02:57] }
 * ...
 * 39. Rd7# { [%clk 0:00:55] } 1-0
 */
const pgn = `[Event "Rated Blitz game"]
[Site "https://lichess.org/hvB20kxq"]
[Date "2018.05.19"]
[White "topce"]
[Black "donateIIo"]
[Result "1-0"]
[UTCDate "2018.05.19"]
[UTCTime "09:36:44"]
[WhiteElo "2342"]
[BlackElo "2406"]
[WhiteRatingDiff "+12"]
[BlackRatingDiff "-12"]
[BlackTitle "GM"]
[Variant "Standard"]
[TimeControl "180+0"]
[ECO "A00"]
[Opening "Anderssen Opening"]
[Termination "Normal"]

1. a3 { [%clk 0:03:00] } a6 { [%clk 0:03:00] } 2. b3 { [%clk 0:02:59] } h6 { [%clk 0:03:00] } 3. c3 { [%clk 0:02:59] } Nf6 { [%clk 0:02:57] } 4. d3 { [%clk 0:02:59] } d5 { [%clk 0:02:57] } 5. e3 { [%clk 0:02:59] } e5 { [%clk 0:02:56] } 6. f3 { [%clk 0:02:58] } c5 { [%clk 0:02:55] } 7. g3 { [%clk 0:02:58] } Nc6 { [%clk 0:02:55] } 8. h3 { [%clk 0:02:58] } Be7 { [%clk 0:02:54] } 9. Ra2 { [%clk 0:02:57] } O-O { [%clk 0:02:53] } 10. Rg2 { [%clk 0:02:55] } b5 { [%clk 0:02:52] } 11. g4 { [%clk 0:02:54] } e4 { [%clk 0:02:46] } 12. f4 { [%clk 0:02:49] } d4 { [%clk 0:02:42] } 13. g5 { [%clk 0:02:43] } hxg5 { [%clk 0:02:40] } 14. fxg5 { [%clk 0:02:42] } Nd5 { [%clk 0:02:39] } 15. dxe4 { [%clk 0:02:35] } Nxe3 { [%clk 0:02:36] } 16. Bxe3 { [%clk 0:02:34] } dxe3 { [%clk 0:02:36] } 17. Qxd8 { [%clk 0:02:33] } Rxd8 { [%clk 0:02:34] } 18. h4 { [%clk 0:02:25] } Be6 { [%clk 0:02:31] } 19. h5 { [%clk 0:02:19] } Bxb3 { [%clk 0:02:28] } 20. Be2 { [%clk 0:02:18] } Ne5 { [%clk 0:02:25] } 21. g6 { [%clk 0:02:16] } Nd3+ { [%clk 0:02:18] } 22. Bxd3 { [%clk 0:02:14] } Rxd3 { [%clk 0:02:18] } 23. h6 { [%clk 0:02:06] } Rd1+ { [%clk 0:02:07] } 24. Ke2 { [%clk 0:02:04] } Rxb1 { [%clk 0:02:07] } 25. gxf7+ { [%clk 0:01:59] } Kxf7 { [%clk 0:02:07] } 26. Rxg7+ { [%clk 0:01:53] } Ke6 { [%clk 0:02:06] } 27. h7 { [%clk 0:01:48] } Bc4+ { [%clk 0:01:36] } 28. Kxe3 { [%clk 0:01:46] } Rh8 { [%clk 0:01:07] } 29. Rh6+ { [%clk 0:01:34] } Bf6 { [%clk 0:00:59] } 30. Nf3 { [%clk 0:01:31] } Rf1 { [%clk 0:00:31] } 31. Rgg6 { [%clk 0:01:17] } Ke7 { [%clk 0:00:23] } 32. Rxf6 { [%clk 0:01:13] } Rxh7 { [%clk 0:00:22] } 33. Rxa6 { [%clk 0:01:05] } Rxh6 { [%clk 0:00:21] } 34. Rxh6 { [%clk 0:01:03] } Ra1 { [%clk 0:00:20] } 35. Ne5 { [%clk 0:01:01] } Rxa3 { [%clk 0:00:19] } 36. Kf4 { [%clk 0:01:00] } Rxc3 { [%clk 0:00:18] } 37. Kf5 { [%clk 0:00:58] } b4 { [%clk 0:00:17] } 38. Rh7+ { [%clk 0:00:58] } Kd6 { [%clk 0:00:16] } 39. Rd7# { [%clk 0:00:55] } 1-0


`;
/**
 * Unit to replay a PGN (Portable Game Notation) game in real time.
 *
 * @constant
 * @type {Unit}
 * @name loadPgnRealTime
 * @property {string} name - The name of the unit.
 * @property {Function} run - Function to execute the replay of the PGN game.
 * @param {HTMLElement} el - The HTML element where the chessboard will be rendered.
 * @returns {Chessground} - The Chessground instance used to render the chessboard and replay the game.
 *
 * The function performs the following steps:
 * 1. Initializes a new Chess instance and loads the PGN data.
 * 2. Creates a new Chessground instance with specific animation and movement settings.
 * 3. Retrieves the move history and comments from the PGN.
 * 4. Calculates the time control and think times for each move.
 * 5. Sets timeouts to replay each move on the chessboard in real time.
 */
export const loadPgnRealTime: Unit = {
	name: "replay pgn game in real time",
	run(el) {
		const chess: ChessInstance = new Chess();
		chess.loadPgn(pgn);
		const cg = Chessground(el, {
			animation: {
				duration: 500,
			},
			movable: {
				free: false,
			},
		});
		const history: Move[] = chess.history({ verbose: true });

		const comments: { fen: string; comment: string }[] = chess.getComments();
		const header = chess.header();
		const timeControl = header.TimeControl?.split("+");
		let timeControlInSeconds = 180;
		if (timeControl) {
			const total = Number.parseInt(timeControl[0], 10);
			const increment = Number.parseInt(timeControl[1], 10);
			timeControlInSeconds = total + increment * (comments.length / 2);
		}

		const timeOuts: number[] = [];

		let whiteThinkTime = 0;
		let blackThinkTime = 0;

		for (let j = 0; j < comments.length; j++) {
			const minutes = Number.parseInt(comments[j].comment.substring(9, 11), 10);
			const seconds = Number.parseInt(
				comments[j].comment.substring(12, 14),
				10,
			);
			const timeLeft = minutes * 60 + seconds;
			const thinkTime = timeControlInSeconds - timeLeft;

			if (j % 2 === 0) {
				blackThinkTime = thinkTime;
			} else {
				whiteThinkTime = thinkTime;
			}
			timeOuts.push(whiteThinkTime + blackThinkTime + j / 1000);
		}

		for (let i = 0; i < history.length; i++) {
			setTimeout(() => {
				if (!cg.state.dom.elements.board.offsetParent) {
					return;
				}
				cg.move(history[i].from, history[i].to);
			}, timeOuts[i] * 1000);
		}

		return cg;
	},
};
/**
 * Represents a unit that replays a PGN (Portable Game Notation) game with one second per move.
 *
 * @constant
 * @type {Unit}
 * @name loadPgnOneSecondPerMove
 *
 * @property {string} name - The name of the unit.
 * @property {Function} run - The function that executes the unit.
 *
 * @param {HTMLElement} el - The HTML element where the chessboard will be rendered.
 * @returns {Chessground} - The Chessground instance with the replayed game.
 *
 * The `run` function performs the following steps:
 * 1. Initializes a new Chess instance and loads the PGN.
 * 2. Creates a new Chessground instance with specific animation and movement settings.
 * 3. Retrieves the move history and comments from the Chess instance.
 * 4. Iterates through the move history and replays each move on the Chessground board with a one-second interval.
 */
export const loadPgnOneSecondPerMove: Unit = {
	name: "replay pgn game one second per move",
	run(el) {
		const chess: ChessInstance = new Chess();
		chess.loadPgn(pgn);
		const cg = Chessground(el, {
			animation: {
				duration: 500,
			},
			movable: {
				free: false,
			},
		});
		const history: Move[] = chess.history({ verbose: true });

		const _comments: { fen: string; comment: string }[] = chess.getComments();
		const _header = chess.header();

		for (let i = 0; i < history.length; i++) {
			setTimeout(() => {
				if (!cg.state.dom.elements.board.offsetParent) {
					return;
				}
				cg.move(history[i].from, history[i].to);
			}, i * 1000);
		}

		return cg;
	},
};
/**
 * Unit to replay a PGN game in proportional time of 1 minute.
 *
 * @constant
 * @type {Unit}
 * @name loadPgnProportionalTime
 *
 * @property {string} name - The name of the unit.
 * @property {Function} run - The function to execute the unit.
 *
 * @param {HTMLElement} el - The HTML element to attach the chessboard to.
 *
 * @returns {Chessground} - The Chessground instance with the replayed game.
 *
 * The `run` function performs the following steps:
 * 1. Initializes a new Chess instance and loads the PGN.
 * 2. Creates a new Chessground instance with specific animation and movement settings.
 * 3. Retrieves the move history and comments from the chess instance.
 * 4. Calculates the think time for each move based on the comments.
 * 5. Sets timeouts to replay each move on the Chessground instance in proportional time.
 */
export const loadPgnProportionalTime: Unit = {
	name: "replay pgn game in proprtional time 1 minute",
	run(el) {
		const chess: ChessInstance = new Chess();
		chess.loadPgn(pgn);
		const cg = Chessground(el, {
			animation: {
				duration: 500,
			},
			movable: {
				free: false,
			},
		});
		const history: Move[] = chess.history({ verbose: true });

		const comments: { fen: string; comment: string }[] = chess.getComments();
		const _header = chess.header();

		const timeOuts: number[] = [];

		let whiteThinkTime = 0;
		let blackThinkTime = 0;

		for (let j = 0; j < comments.length; j++) {
			const minutes = Number.parseInt(comments[j].comment.substring(9, 11), 10);
			const seconds = Number.parseInt(
				comments[j].comment.substring(12, 14),
				10,
			);
			const timeLeft = minutes * 60 + seconds;
			const thinkTime = 180 - timeLeft;

			if (j % 2 === 0) {
				blackThinkTime = thinkTime;
			} else {
				whiteThinkTime = thinkTime;
			}
			timeOuts.push(whiteThinkTime + blackThinkTime + j / 1000);
		}

		for (let i = 0; i < history.length; i++) {
			setTimeout(
				() => {
					if (!cg.state.dom.elements.board.offsetParent) {
						return;
					}
					cg.move(history[i].from, history[i].to);
				},
				timeOuts[i] * (30 / 180) * 1000,
			);
		}

		return cg;
	},
};
