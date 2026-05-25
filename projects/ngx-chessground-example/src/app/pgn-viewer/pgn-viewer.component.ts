import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ViewChild, inject } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { NgxPgnViewerComponent } from 'ngx-chessground';
import { SponsorDialogComponent } from './sponsor-dialog.component';
import { GMBJTMusicPlayerComponent } from './gmbjt-music-player.component';

@Component({
	selector: 'app-pgn-viewer',
	standalone: true,
	imports: [CommonModule, NgxPgnViewerComponent, MatDialogModule, GMBJTMusicPlayerComponent],
	templateUrl: './pgn-viewer.component.html',
	styleUrls: ['./pgn-viewer.component.css'],
})
export class PgnViewerComponent implements AfterViewInit {
	@ViewChild(NgxPgnViewerComponent) pgnViewer!: NgxPgnViewerComponent;
	private dialog = inject(MatDialog);
	// Fischer's Evergreen Game: Donald Byrne vs. Robert James Fischer
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

	readonly topceEvergreen = `[Event "rated blitz game"]
[Site "https://lichess.org/hvB20kxq"]
[Date "2018.05.19"]
[Round "-"]
[White "topce"]
[Black "donateIIo"]
[Result "1-0"]
[GameId "hvB20kxq"]
[UTCDate "2018.05.19"]
[UTCTime "09:36:44"]
[WhiteElo "2342"]
[BlackElo "2406"]
[WhiteRatingDiff "+12"]
[BlackRatingDiff "-12"]
[WhiteTitle "CM"]
[BlackTitle "GM"]
[Variant "Standard"]
[TimeControl "180+0"]
[ECO "A00"]
[Opening "Anderssen's Opening"]
[Termination "Normal"]

1. a3 { [%eval 0.0] [%clk 0:03:00] } 1... a6 { [%eval 0.13] [%clk 0:03:00] } 2. b3 { [%eval -0.47] [%clk 0:02:59] } 2... h6 { [%eval 0.24] [%clk 0:03:00] } 3. c3 { [%eval -0.29] [%clk 0:02:59] } 3... Nf6 { [%eval 0.03] [%clk 0:02:57] } 4. d3 { [%eval -0.4] [%clk 0:02:59] } 4... d5 { [%eval -0.8] [%clk 0:02:57] } 5. e3 { [%eval -0.88] [%clk 0:02:59] } 5... e5 { [%eval -0.78] [%clk 0:02:56] } 6. f3 { [%eval -1.56] [%clk 0:02:58] } 6... c5 { [%eval -1.54] [%clk 0:02:55] } 7. g3 { [%eval -1.4] [%clk 0:02:58] } 7... Nc6 { [%eval -1.44] [%clk 0:02:55] } 8. h3 { [%eval -1.95] [%clk 0:02:58] } 8... Be7 { [%eval -1.49] [%clk 0:02:54] } 9. Ra2 { [%eval -2.29] [%clk 0:02:57] } 9... O-O { [%eval -2.58] [%clk 0:02:53] } 10. Rg2 { [%eval -3.51] [%clk 0:02:55] } 10... b5 { [%eval -3.2] [%clk 0:02:52] } 11. g4 { [%eval -4.15] [%clk 0:02:54] } 11... e4 { [%eval -3.35] [%clk 0:02:46] } 12. f4 { [%eval -3.78] [%clk 0:02:49] } 12... d4 { [%eval -3.91] [%clk 0:02:42] } 13. g5 { [%eval -3.82] [%clk 0:02:43] } 13... hxg5 { [%eval -3.52] [%clk 0:02:40] } 14. fxg5 { [%eval -3.89] [%clk 0:02:42] } 14... Nd5 { [%eval -3.75] [%clk 0:02:39] } 15. dxe4 { [%eval -3.7] [%clk 0:02:35] } 15... Nxe3 { [%eval -3.66] [%clk 0:02:36] } 16. Bxe3 { [%eval -3.51] [%clk 0:02:34] } 16... dxe3 { [%eval -3.51] [%clk 0:02:36] } 17. Qxd8 { [%eval -3.43] [%clk 0:02:33] } 17... Rxd8 { [%eval -3.67] [%clk 0:02:34] } 18. h4 { [%eval -4.68] [%clk 0:02:25] } 18... Be6 { [%eval -4.67] [%clk 0:02:31] } 19. h5 { [%eval -7.39] [%clk 0:02:19] } 19... Bxb3 { [%eval -7.2] [%clk 0:02:28] } 20. Be2 { [%eval -7.26] [%clk 0:02:18] } 20... Ne5 { [%eval -5.34] [%clk 0:02:25] } 21. g6 { [%eval -6.33] [%clk 0:02:16] } 21... Nd3+ { [%eval -6.13] [%clk 0:02:18] } 22. Bxd3 { [%eval -6.0] [%clk 0:02:14] } 22... Rxd3 { [%eval -6.31] [%clk 0:02:18] } 23. h6 { [%eval -6.18] [%clk 0:02:06] } 23... Rd1+ { [%eval -6.07] [%clk 0:02:07] } 24. Ke2 { [%eval -5.92] [%clk 0:02:04] } 24... Rxb1 { [%eval -5.46] [%clk 0:02:07] } 25. gxf7+ { [%eval -5.49] [%clk 0:01:59] } 25... Kxf7 { [%eval -5.17] [%clk 0:02:07] } 26. Rxg7+ { [%eval -4.94] [%clk 0:01:53] } 26... Ke6 { [%eval -3.59] [%clk 0:02:06] } 27. h7 { [%eval -3.48] [%clk 0:01:48] } 27... Bc4+ { [%eval -1.19] [%clk 0:01:36] } 28. Kxe3 { [%eval -1.21] [%clk 0:01:46] } 28... Rh8 { [%eval -1.36] [%clk 0:01:07] } 29. Rh6+ { [%eval -1.39] [%clk 0:01:34] } 29... Bf6 { [%eval 3.04] [%clk 0:00:59] } 30. Nf3 { [%eval 2.39] [%clk 0:01:31] } 30... Rf1 { [%eval 2.52] [%clk 0:00:31] } 31. Rgg6 { [%eval 0.1] [%clk 0:01:17] } 31... Ke7 { [%eval 0.04] [%clk 0:00:23] } 32. Rxf6 { [%eval 0.02] [%clk 0:01:13] } 32... Rxh7 { [%eval 0.13] [%clk 0:00:22] } 33. Rxa6 { [%eval 0.0] [%clk 0:01:05] } 33... Rxh6 { [%eval 0.0] [%clk 0:00:21] } 34. Rxh6 { [%eval 0.0] [%clk 0:01:03] } 34... Ra1 { [%eval 0.13] [%clk 0:00:20] } 35. Ne5 { [%eval 0.0] [%clk 0:01:01] } 35... Rxa3 { [%eval 0.0] [%clk 0:00:19] } 36. Kf4 { [%eval 0.0] [%clk 0:01:00] } 36... Rxc3 { [%eval 0.0] [%clk 0:00:18] } 37. Kf5 { [%eval 0.0] [%clk 0:00:58] } 37... b4 { [%eval 0.0] [%clk 0:00:17] } 38. Rh7+ { [%eval 0.0] [%clk 0:00:58] } 38... Kd6 { [%eval #1] [%clk 0:00:16] } 39. Rd7# { [%clk 0:00:55] } 1-0`;

	currentPgn = this.fischerEvergreen;

	ngAfterViewInit() {
		// Load single game by default
		setTimeout(() => {
			this.loadFischer();
		}, 0);
	}

	loadFischer() {
		this.currentPgn = this.fischerEvergreen;
	}

	loadTopce() {
		this.currentPgn = this.topceEvergreen;
	}

	openSponsor() {
		this.dialog.open(SponsorDialogComponent, {
			width: '600px',
		});
	}
}
