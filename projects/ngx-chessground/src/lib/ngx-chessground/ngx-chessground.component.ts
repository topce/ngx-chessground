import {
	type AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	type ElementRef,
	effect,
	model,
	viewChild,
	inject,
} from '@angular/core';
import type { Api } from 'chessground/api';
import { NgxChessgroundService } from '../ngx-chessground.service';

@Component({
	selector: 'ngx-chessground',
	templateUrl: './ngx-chessground.component.html',
	styleUrls: ['./ngx-chessground.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	providers: [NgxChessgroundService],
	standalone: true,
})
/**
 * Component representing a chessboard using the ngx-chessground library.
 * Implements the AfterViewInit lifecycle hook to perform actions after the view has been initialized.
 */
export class NgxChessgroundComponent implements AfterViewInit {
	/**
	 * A reference to the chessboard element in the view.
	 * @readonly
	 */
	readonly elementView = viewChild.required<ElementRef>('chessboard');

	/**
	 * A function that takes an HTMLElement and returns an Api object.
	 */
	runFunction = model<(el: HTMLElement) => Api>();

	private readonly ngxChessgroundService = inject(NgxChessgroundService);

	/**
	 * Constructor for the NgxChessgroundComponent.
	 */
	constructor() {
		effect(() => {
			this.redraw();
		});
	}

	/**
	 * Lifecycle hook that is called after the component's view has been fully initialized.
	 * Calls the redraw method to update the chessboard.
	 */
	ngAfterViewInit() {
		this.redraw();
	}

	/**
	 * Toggles the orientation of the chessboard.
	 */
	public toggleOrientation() {
		this.ngxChessgroundService.toggleOrientation();
	}

	/**
	 * Redraws the chessboard using the ngxChessgroundService.
	 * Retrieves the chessboard element and the function to redraw it, then calls the service's redraw method.
	 * @private
	 */
	private redraw() {
		const elementView = this.elementView();
		const fn = this.runFunction();
		if (elementView.nativeElement && fn) {
			this.ngxChessgroundService.redraw(elementView.nativeElement, fn);
		}
	}
}
