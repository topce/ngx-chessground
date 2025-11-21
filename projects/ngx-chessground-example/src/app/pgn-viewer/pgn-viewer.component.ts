import { Component, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgxChessgroundComponent } from 'ngx-chessground';
import { Chess } from 'chess.js';
import { Chessground } from 'chessground';

@Component({
    selector: 'app-pgn-viewer',
    standalone: true,
    imports: [CommonModule, FormsModule, NgxChessgroundComponent],
    templateUrl: './pgn-viewer.component.html',
    styleUrls: ['./pgn-viewer.component.css']
})
export class PgnViewerComponent implements AfterViewInit {
    @ViewChild(NgxChessgroundComponent) chessground!: NgxChessgroundComponent;

    pgn: string = '';
    chess: Chess;
    currentFen: string = '';

    // Fischer's Evergreen Game: Donald Byrne vs. Robert James Fischer
    // New York, NY USA, 1956
    readonly fischerEvergreen = `[Event "Third Rosenwald Trophy"]
[Site "New York, NY USA"]
[Date "1956.10.17"]
[EventDate "1956.10.07"]
[Round "8"]
[Result "0-1"]
[White "Donald Byrne"]
[Black "Robert James Fischer"]
[ECO "D93"]
[WhiteElo "?"]
[BlackElo "?"]
[PlyCount "82"]

1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. d4 O-O 5. Bf4 d5 6. Qb3 dxc4 7. Qxc4 c6 8. e4 Nbd7 9. Rd1 Nb6 10. Qc5 Bg4 11. Bg5 Na4 12. Qa3 Nxc3 13. bxc3 Nxe4 14. Bxe7 Qb6 15. Bc4 Nxc3 16. Bc5 Rfe8+ 17. Kf1 Be6 18. Bxb6 Bxc4+ 19. Kg1 Ne2+ 20. Kf1 Nxd4+ 21. Kg1 Ne2+ 22. Kf1 Nc3+ 23. Kg1 axb6 24. Qb4 Ra4 25. Qxb6 Nxd1 26. h3 Rxa2 27. Kh2 Nxf2 28. Re1 Rxe1 29. Qd8+ Bf8 30. Nxe1 Bd5 31. Nf3 Ne4 32. Qb8 b5 33. h4 h5 34. Ne5 Kg7 35. Kg1 Bc5+ 36. Kf1 Ng3+ 37. Ke1 Bb4+ 38. Kd1 Bb3+ 39. Kc1 Ne2+ 40. Kb1 Nc3+ 41. Kc1 Rc2# 0-1`;

    constructor() {
        this.chess = new Chess();
        this.currentFen = this.chess.fen();
    }

    ngAfterViewInit() {
        this.updateBoard();
    }

    updateBoard() {
        if (this.chessground) {
            this.chessground.runFunction.set((el) => {
                return Chessground(el, {
                    fen: this.currentFen,
                    viewOnly: true // Viewer mode
                });
            });
        }
    }

    loadPgn() {
        try {
            this.chess.loadPgn(this.pgn);
            // Reset to start position to play through
            const history = this.chess.history({ verbose: true });
            this.chess.reset();
            this.currentFen = this.chess.fen();
            this.updateBoard();
            console.log('PGN loaded successfully');
        } catch (e) {
            console.error('Invalid PGN', e);
            alert('Invalid PGN');
        }
    }

    loadFischerEvergreen() {
        this.pgn = this.fischerEvergreen;
        this.loadPgnAndReset();
    }

    readonly topceEvergreen = `[Event "Rated Blitz game"]
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

1. a3 { [%clk 0:03:00] } a6 { [%clk 0:03:00] } 2. b3 { [%clk 0:02:59] } h6 { [%clk 0:03:00] } 3. c3 { [%clk 0:02:59] } Nf6 { [%clk 0:02:57] } 4. d3 { [%clk 0:02:59] } d5 { [%clk 0:02:57] } 5. e3 { [%clk 0:02:59] } e5 { [%clk 0:02:56] } 6. f3 { [%clk 0:02:58] } c5 { [%clk 0:02:55] } 7. g3 { [%clk 0:02:58] } Nc6 { [%clk 0:02:55] } 8. h3 { [%clk 0:02:58] } Be7 { [%clk 0:02:54] } 9. Ra2 { [%clk 0:02:57] } O-O { [%clk 0:02:53] } 10. Rg2 { [%clk 0:02:55] } b5 { [%clk 0:02:52] } 11. g4 { [%clk 0:02:54] } e4 { [%clk 0:02:46] } 12. f4 { [%clk 0:02:49] } d4 { [%clk 0:02:42] } 13. g5 { [%clk 0:02:43] } hxg5 { [%clk 0:02:40] } 14. fxg5 { [%clk 0:02:42] } Nd5 { [%clk 0:02:39] } 15. dxe4 { [%clk 0:02:35] } Nxe3 { [%clk 0:02:36] } 16. Bxe3 { [%clk 0:02:34] } dxe3 { [%clk 0:02:36] } 17. Qxd8 { [%clk 0:02:33] } Rxd8 { [%clk 0:02:34] } 18. h4 { [%clk 0:02:25] } Be6 { [%clk 0:02:31] } 19. h5 { [%clk 0:02:19] } Bxb3 { [%clk 0:02:28] } 20. Be2 { [%clk 0:02:18] } Ne5 { [%clk 0:02:25] } 21. g6 { [%clk 0:02:16] } Nd3+ { [%clk 0:02:18] } 22. Bxd3 { [%clk 0:02:14] } Rxd3 { [%clk 0:02:18] } 23. h6 { [%clk 0:02:06] } Rd1+ { [%clk 0:02:07] } 24. Ke2 { [%clk 0:02:04] } Rxb1 { [%clk 0:02:07] } 25. gxf7+ { [%clk 0:01:59] } Kxf7 { [%clk 0:02:07] } 26. Rxg7+ { [%clk 0:01:53] } Ke6 { [%clk 0:02:06] } 27. h7 { [%clk 0:01:48] } Bc4+ { [%clk 0:01:36] } 28. Kxe3 { [%clk 0:01:46] } Rh8 { [%clk 0:01:07] } 29. Rh6+ { [%clk 0:01:34] } Bf6 { [%clk 0:00:59] } 30. Nf3 { [%clk 0:01:31] } Rf1 { [%clk 0:00:31] } 31. Rgg6 { [%clk 0:01:17] } Ke7 { [%clk 0:00:23] } 32. Rxf6 { [%clk 0:01:13] } Rxh7 { [%clk 0:00:22] } 33. Rxa6 { [%clk 0:01:05] } Rxh6 { [%clk 0:00:21] } 34. Rxh6 { [%clk 0:01:03] } Ra1 { [%clk 0:00:20] } 35. Ne5 { [%clk 0:01:01] } Rxa3 { [%clk 0:00:19] } 36. Kf4 { [%clk 0:01:00] } Rxc3 { [%clk 0:00:18] } 37. Kf5 { [%clk 0:00:58] } b4 { [%clk 0:00:17] } 38. Rh7+ { [%clk 0:00:58] } Kd6 { [%clk 0:00:16] } 39. Rd7# { [%clk 0:00:55] } 1-0`;

    loadTopceEvergreen() {
        this.pgn = this.topceEvergreen;
        this.loadPgnAndReset();
    }

    reset() {
        this.chess.reset();
        this.currentFen = this.chess.fen();
        this.updateBoard();
    }

    // Navigation logic requires re-playing moves from the full PGN history
    // Since chess.js doesn't support "seeking" easily without re-playing,
    // we'll implement a simple step-forward/backward by maintaining the full game state
    // and a separate "display" state.
    // However, for a simple viewer, we can just reload the PGN and navigate to a specific ply.
    // A more robust approach for "Next" is to find the next move from the current FEN in the full game.

    // Simplified approach:
    // 1. Parse the full PGN into a list of moves.
    // 2. Keep track of current index.

    moves: string[] = [];
    currentMoveIndex: number = -1; // -1 means start position

    loadPgnAndReset() {
        try {
            const tempChess = new Chess();
            tempChess.loadPgn(this.pgn);
            this.moves = tempChess.history();

            this.chess.reset();
            this.currentMoveIndex = -1;
            this.currentFen = this.chess.fen();
            this.updateBoard();
        } catch (e) {
            console.error('Invalid PGN', e);
            alert('Invalid PGN');
        }
    }

    next() {
        if (this.currentMoveIndex < this.moves.length - 1) {
            this.currentMoveIndex++;
            this.chess.move(this.moves[this.currentMoveIndex]);
            this.currentFen = this.chess.fen();
            this.updateBoard();
        }
    }

    prev() {
        if (this.currentMoveIndex >= 0) {
            this.chess.undo();
            this.currentMoveIndex--;
            this.currentFen = this.chess.fen();
            this.updateBoard();
        }
    }

    start() {
        this.chess.reset();
        this.currentMoveIndex = -1;
        this.currentFen = this.chess.fen();
        this.updateBoard();
    }

    end() {
        // Replay all moves
        this.chess.reset();
        for (const move of this.moves) {
            this.chess.move(move);
        }
        this.currentMoveIndex = this.moves.length - 1;
        this.currentFen = this.chess.fen();
        this.updateBoard();
    }
    // Replay options
    replayMode: 'realtime' | 'proportional' | 'fixed' = 'fixed';
    proportionalDuration: number = 1; // minutes
    fixedTime: number = 1; // seconds
    private replayTimeouts: any[] = [];

    replayGame() {
        this.stopReplay();

        // Use a temp instance to get game data before resetting the main instance
        const tempChess = new Chess();
        tempChess.loadPgn(this.pgn);
        const comments = tempChess.getComments();
        const history = tempChess.history({ verbose: true });
        const header = tempChess.header();

        this.start(); // Reset to start

        const timeOuts: number[] = [];

        if (this.replayMode === 'fixed') {
            for (let i = 0; i < history.length; i++) {
                timeOuts.push((i + 1) * this.fixedTime);
            }
        } else {
            // Logic for Real Time and Proportional
            // Assuming standard PGN clock format [%clk 0:03:00]
            // We need to parse the initial time control if possible, or infer it.
            // The example code in pgn.ts assumes 180s (3 mins) base.
            // We will try to parse from comments.

            // Simplified parsing similar to pgn.ts
            // We need to calculate cumulative time for each move.

            let whiteThinkTime = 0;
            let blackThinkTime = 0;
            let timeControlInSeconds = 180; // Default fallback

            if (header['TimeControl']) {
                const tc = header['TimeControl'].split('+');
                timeControlInSeconds = parseInt(tc[0], 10);
            }

            // If no comments with clock, fallback to fixed
            if (comments.length === 0) {
                alert('No clock data found in PGN. Falling back to fixed time.');
                this.replayMode = 'fixed';
                this.replayGame();
                return;
            }

            for (let j = 0; j < comments.length; j++) {
                // Parse [%clk 0:03:00]
                const comment = comments[j].comment;
                const clkMatch = comment.match(/%clk\s+(\d+):(\d+):(\d+)/) || comment.match(/%clk\s+(\d+):(\d+)/);

                if (clkMatch) {
                    let minutes = 0;
                    let seconds = 0;
                    if (clkMatch.length === 4) {
                        minutes = parseInt(clkMatch[2], 10) + parseInt(clkMatch[1], 10) * 60;
                        seconds = parseInt(clkMatch[3], 10);
                    } else {
                        minutes = parseInt(clkMatch[1], 10);
                        seconds = parseInt(clkMatch[2], 10);
                    }

                    const timeLeft = minutes * 60 + seconds;
                    // This logic from pgn.ts assumes we know the start time and subtract.
                    // A better way for generic PGN is to just use the diff from previous move if available,
                    // or just use the cumulative time if we want to replay "at speed".
                    // pgn.ts logic: thinkTime = timeControl - timeLeft. 
                    // This calculates how much time was SPENT.

                    const thinkTime = Math.max(0, timeControlInSeconds - timeLeft);

                    // We need to accumulate think times to schedule the moves.
                    // However, pgn.ts logic seems to calculate absolute timestamps for the replay.

                    // Let's try to just extract the time spent per move if possible, or use the pgn.ts approach
                    // if we assume the PGNs are consistent with that format.
                    // For generic PGNs, we might not have TimeControl.

                    // Alternative: Just parse the clock and see the difference from previous clock.
                    // But let's stick to the requested logic which implies "real time" or "proportional".

                    // Re-using pgn.ts logic structure for consistency with the example:
                    if (j % 2 === 0) {
                        blackThinkTime = thinkTime;
                    } else {
                        whiteThinkTime = thinkTime;
                    }
                    // This seems to assume we want to show the move AT the time it was played relative to start?
                    // timeOuts.push(whiteThinkTime + blackThinkTime); 
                    // Wait, pgn.ts does: timeOuts.push(whiteThinkTime + blackThinkTime + j / 1000);
                    // This implies whiteThinkTime and blackThinkTime are CUMULATIVE? 
                    // No, in pgn.ts loop:
                    // if (j % 2 === 0) blackThinkTime = thinkTime; else whiteThinkTime = thinkTime;
                    // It updates the *current* think time for that side.
                    // But wait, `thinkTime = timeControl - timeLeft`. `timeLeft` decreases. `thinkTime` INCREASES.
                    // So `thinkTime` IS the cumulative time spent by that player?
                    // Yes, if `timeControl` is the starting time.

                    timeOuts.push(whiteThinkTime + blackThinkTime);
                } else {
                    // If move has no clock, add a small default delay or keep previous
                    timeOuts.push((timeOuts[timeOuts.length - 1] || 0) + 1);
                }
            }

            // If we have more moves than comments (e.g. end of game), fill the rest
            while (timeOuts.length < history.length) {
                timeOuts.push((timeOuts[timeOuts.length - 1] || 0) + 1);
            }
        }

        // Schedule moves
        const totalGameTime = timeOuts[timeOuts.length - 1] || 1;

        for (let i = 0; i < history.length; i++) {
            let delay = 0;
            if (this.replayMode === 'fixed') {
                delay = timeOuts[i] * 1000;
            } else if (this.replayMode === 'realtime') {
                delay = timeOuts[i] * 1000;
            } else if (this.replayMode === 'proportional') {
                // Scale total game time to user input duration
                const targetDurationSeconds = this.proportionalDuration * 60;
                delay = (timeOuts[i] / totalGameTime) * targetDurationSeconds * 1000;
            }

            const timeoutId = setTimeout(() => {
                this.next();
            }, delay);
            this.replayTimeouts.push(timeoutId);
        }
    }

    stopReplay() {
        this.replayTimeouts.forEach(t => clearTimeout(t));
        this.replayTimeouts = [];
    }

    // Override loadPgn to use the navigation-friendly version
    overrideLoadPgn() {
        this.loadPgnAndReset();
    }
}
