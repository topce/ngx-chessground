import {
	type AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	viewChild,
} from "@angular/core";
import * as play from "../../units/play";
import { NgxChessgroundComponent } from "../ngx-chessground/ngx-chessground.component";

@Component({
	selector: "ngx-chessground-table",
	templateUrl: "./ngx-chessground-table.component.html",
	styleUrls: ["./ngx-chessground-table.component.scss"],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NgxChessgroundComponent],
})
/**
 * The `NgxChessgroundTableComponent` class is an Angular component that implements the `AfterViewInit` lifecycle hook.
 * It is responsible for managing the chessboard table and initializing the chessground component after the view has been fully initialized.
 *
 * @class
 * @implements {AfterViewInit}
 *
 * @example
 * <ngx-chessground-table></ngx-chessground-table>
 *
 * @remarks
 * This component uses the `@ViewChild` decorator to query the `NgxChessgroundComponent` instance with the template reference variable `chess`.
 * The `ngAfterViewInit` lifecycle hook is used to set the initial run function for the `ngxChessgroundComponent`.
 *
 * @see https://angular.io/api/core/AfterViewInit
 */
export class NgxChessgroundTableComponent implements AfterViewInit {
	/**
	 * A readonly property that references the `NgxChessgroundComponent` instance.
	 * This property is decorated with `@ViewChild` to query the component with the template reference variable `chess`.
	 *
	 * @readonly
	 * @type {NgxChessgroundComponent}
	 */
	readonly ngxChessgroundComponent =
		viewChild.required<NgxChessgroundComponent>("chess");

	/**
	 * Lifecycle hook that is called after a component's view has been fully initialized.
	 * This method is used to perform any additional initialization tasks that require
	 * access to the component's view.
	 *
	 * In this implementation, it sets the initial run function for the ngxChessgroundComponent.
	 *
	 * @see https://angular.io/api/core/AfterViewInit
	 */
	ngAfterViewInit(): void {
		this.ngxChessgroundComponent().runFunction.set(play.initial.run);
	}
}
