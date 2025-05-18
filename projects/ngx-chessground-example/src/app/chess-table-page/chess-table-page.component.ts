import { Component } from "@angular/core";
import { NgxChessgroundTableComponent } from "ngx-chessground";

@Component({
	selector: "app-chess-table-page",
	imports: [NgxChessgroundTableComponent],
	templateUrl: "./chess-table-page.component.html",
	styleUrl: "./chess-table-page.component.scss",
	standalone: true,
})
export class ChessTablePageComponent {
	title = "Play like GOAT Robert James Fischer";
}
