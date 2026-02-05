import { Injectable } from '@angular/core';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { VNode } from 'snabbdom';
import {
	attributesModule,
	classModule,
	eventListenersModule,
	h,
	init,
} from 'snabbdom';

@Injectable()
/**
 * Service to manage the Chessground instance and its rendering.
 */
export class NgxChessgroundService {
	/**
	 * Initializes the patch function with the necessary modules.
	 * @private
	 */
	private readonly patch = init([
		classModule,
		attributesModule,
		eventListenersModule,
	]);

	/**
	 * Virtual node representing the current state of the DOM.
	 * @private
	 */
	private vnode!: VNode;

	/**
	 * Chessground API instance.
	 * @private
	 */
	private cg!: Api;

	/**
	 * Function to run on the HTMLElement.
	 * @private
	 */
	private runFn!: (el: HTMLElement) => Api;

	/**
	 * Redraws the Chessground board on the given element.
	 * @param element - The HTML element to render the Chessground board on.
	 * @param runFn - The function to run on the HTMLElement.
	 */
	public redraw(element: HTMLElement, runFn: (el: HTMLElement) => Api) {
		this.cg = Chessground(element);
		this.runFn = runFn;
		this.vnode = this.patch(this.vnode || element, this.render());
	}

	/**
	 * Toggles the orientation of the Chessground board.
	 */
	public toggleOrientation() {
		this.cg.toggleOrientation();
	}

	/**
	 * Renders the virtual node for the Chessground board.
	 * @returns The virtual node representing the Chessground board.
	 * @private
	 */
	private render(): VNode {
		return h('div#chessground-examples', [
			h('section.blue.merida', [
				h('div.cg-wrap', {
					hook: {
						insert: this.runUnit,
						postpatch: this.runUnit,
					},
				}),
			]),
		]);
	}

	/**
	 * Runs the provided function on the virtual node's element.
	 * @param vnode - The virtual node.
	 * @param _ignore - An optional parameter to ignore.
	 * @returns The result of the run function.
	 * @private
	 */
	private readonly runUnit = (vnode: VNode, _ignore?: VNode) => {
		const el = vnode.elm as HTMLElement;
		el.className = 'cg-wrap';
		this.cg = Chessground(el);
		return this.runFn(el);
	};
}
