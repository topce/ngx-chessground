import {
	Component,
	ChangeDetectionStrategy,
	type ElementRef,
	type AfterViewInit,
	input,
	viewChild,
	model,
	effect,
} from "@angular/core";
import type { Api } from "chessground/api";
import { NgxChessgroundService } from "../ngx-chessground.service";

@Component({
	selector: "ngx-chessground",
	templateUrl: "./ngx-chessground.component.html",
	styleUrls: ["./ngx-chessground.component.css"],
	changeDetection: ChangeDetectionStrategy.OnPush,
	providers: [NgxChessgroundService],
	standalone: true,
})
export class NgxChessgroundComponent implements AfterViewInit {
	readonly elementView = viewChild.required<ElementRef>("chessboard");
	runFunction = model<(el: HTMLElement) => Api>();

	constructor(private ngxChessgroundService: NgxChessgroundService) {
		effect(() => {
			this.redraw();
		});
	}

	ngAfterViewInit() {
		this.redraw();
	}

	public toggleOrientation() {
		this.ngxChessgroundService.toggleOrientation();
	}

	private redraw() {
		const elementView = this.elementView();
		const fn = this.runFunction();
		if (elementView.nativeElement && fn) {
			this.ngxChessgroundService.redraw(elementView.nativeElement, fn);
		}
	}
}
