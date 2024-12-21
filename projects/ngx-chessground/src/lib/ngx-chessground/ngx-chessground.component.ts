import {
	Component,
	ChangeDetectionStrategy,
	type ElementRef,
	type AfterViewInit,
	input,
	viewChild,
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
	private readonly runFunction = input.required<(el: HTMLElement) => Api>();
	public get runFn(): (el: HTMLElement) => Api {
		return this.runFunction();
	}
	public set runFn(value: (el: HTMLElement) => Api) {
		this.runFunction = value;
		this.redraw();
	}

	constructor(private ngxChessgroundService: NgxChessgroundService) {}

	ngAfterViewInit() {
		this.redraw();
	}

	public toggleOrientation() {
		this.ngxChessgroundService.toggleOrientation();
	}

	private redraw() {
		const elementView = this.elementView();
		if (elementView.nativeElement && this.runFn) {
			this.ngxChessgroundService.redraw(elementView.nativeElement, this.runFn);
		}
	}
}
