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

/**
 * Service to manage the Chessground instance and its rendering.
 *
 * Wraps snabbdom patching and chessground lifecycle. Each {@link NgxChessgroundComponent}
 * instance creates its own service instance (provided at component level).
 *
 * On the first {@link redraw} call, the service creates the virtual DOM tree
 * and patches it into the real DOM via snabbdom. The `insert` hook initializes
 * the Chessground instance. On subsequent calls, snabbdom patching is skipped
 * entirely — only the chessground config is reapplied in-place, avoiding
 * unnecessary vnode creation, diffing, and DOM reconciliation overhead.
 */
@Injectable()
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
	 * Set after the first {@link redraw}.
	 * @private
	 */
	private vnode!: VNode;

	/**
	 * Chessground API instance.
	 * Set by the snabbdom `insert` hook during first render.
	 * @private
	 */
	private cg!: Api;

	/**
	 * Reference to the `.cg-wrap` DOM element that hosts the chessboard.
	 * Captured by the snabbdom hook and reused for in-place updates.
	 * @private
	 */
	private boardEl: HTMLElement | null = null;

	/**
	 * Function to run on the HTMLElement to configure chessground.
	 * @private
	 */
	private runFn!: (el: HTMLElement) => Api;

	/**
	 * Redraws the Chessground board on the given element.
	 *
	 * On the first call, creates the vnode tree, patches into the DOM, and
	 * initializes the Chessground instance via snabbdom hooks. On subsequent
	 * calls, skips snabbdom entirely and reapplies the config in-place — the
	 * DOM structure never changes, so vnode creation and diffing is wasteful.
	 *
	 * @param element - The HTML element to render the Chessground board on.
	 * @param runFn - The function to run on the HTMLElement.
	 */
	public redraw(element: HTMLElement, runFn: (el: HTMLElement) => Api) {
		this.runFn = runFn;
		if (!this.cg) {
			// First render: create vnode tree, patch DOM, insert hook inits Chessground
			this.vnode = this.patch(element, this.render());
		} else if (this.boardEl) {
			// Subsequent renders: DOM is stable, skip snabbdom, reconfigure in-place
			this.runFn(this.boardEl);
		}
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
	 * Snabbdom hook called on both `insert` and `postpatch`.
	 *
	 * On insert (first render): initializes the Chessground instance and stores
	 * a reference to the board element for later in-place updates.
	 * On postpatch (rare, only if snabbdom detects a vnode change): skips
	 * re-initialization and just reapplies the config.
	 *
	 * @param vnode - The virtual node.
	 * @param oldVnode - The previous virtual node (only present on postpatch).
	 * @returns The result of the run function (the chessground Api).
	 * @private
	 */
	private readonly runUnit = (vnode: VNode, oldVnode?: VNode) => {
		const el = vnode.elm as HTMLElement;
		el.className = 'cg-wrap';
		this.boardEl = el;
		if (!oldVnode) {
			// Insert hook: first time this element hits the DOM
			this.cg = Chessground(el);
		}
		// Reapply config on both insert and postpatch
		return this.runFn(el);
	};
}
