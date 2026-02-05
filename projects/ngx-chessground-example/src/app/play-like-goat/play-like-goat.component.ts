import { Component } from '@angular/core';
import { NgxChessgroundTableComponent } from 'ngx-chessground';

@Component({
	selector: 'app-play-like-goat',
	imports: [NgxChessgroundTableComponent],
	templateUrl: './play-like-goat.component.html',
	styleUrl: './play-like-goat.component.scss',
	standalone: true,
})
export class PlayLikeGoatComponent {
	title = 'Play like GOAT Robert James Fischer';
}
