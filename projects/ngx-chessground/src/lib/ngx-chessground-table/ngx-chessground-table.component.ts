import {
	type AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	viewChild,
} from "@angular/core";
import { NgxChessgroundComponent } from "../ngx-chessground/ngx-chessground.component";
import * as play from "../../units/play";

@Component({
	selector: "ngx-chessground-table",
	templateUrl: "./ngx-chessground-table.component.html",
	styleUrls: ["./ngx-chessground-table.component.css"],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NgxChessgroundComponent],
})
export class NgxChessgroundTableComponent implements AfterViewInit {
	readonly ngxChessgroundComponent =
		viewChild.required<NgxChessgroundComponent>("chess");
	ngAfterViewInit(): void {
		this.ngxChessgroundComponent().runFn = play.initial.run;
	}
}
