import { Injectable, type OnDestroy } from '@angular/core';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
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
 * the Chessground instance by invoking the provided run function. On subsequent
 * calls with a *different* run function, the previous Chessground instance is
 * destroyed first (unbinding its document listeners) before the new one is
 * created — a stale instance is never left behind, which keeps drag & drop
 * responsive. Position updates should flow through {@link setConfig}, which
 * reconfigures the live instance in place via {@link Api.set} instead of
 * recreating it.
 */
@Injectable({ providedIn: 'root' })
export class NgxChessgroundService implements OnDestroy {
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
	 * Set after the first {@link redraw}. Read by the patch lifecycle.
	 * @private
	 */
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: stored by patch, used via snabbdom internals
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
	 * Config applied via {@link setConfig} before the Chessground instance
	 * existed; flushed once the instance is created.
	 * @private
	 */
	private pendingConfig: Partial<Config> | null = null;

	/**
	 * Redraws the Chessground board on the given element.
	 *
	 * On the first call, creates the vnode tree, patches into the DOM, and
	 * initializes the Chessground instance via snabbdom hooks. On subsequent
	 * calls with a different run function, the previous instance is destroyed
	 * and recreated in place so no orphaned instance keeps its document
	 * listeners bound. Calls with the same run function are no-ops.
	 *
	 * @param element - The HTML element to render the Chessground board on.
	 * @param runFn - The function to run on the HTMLElement.
	 */
	public redraw(element: HTMLElement, runFn: (el: HTMLElement) => Api) {
		if (this.runFn === runFn) return;
		this.runFn = runFn;
		if (!this.cg) {
			// First render: create vnode tree, patch DOM, insert hook inits Chessground
			this.vnode = this.patch(element, this.render());
		} else if (this.boardEl) {
			// New run function: dispose the old instance (unbinds its document
			// listeners) and create a fresh one in place.
			this.cg.destroy();
			this.cg = runFn(this.boardEl);
		}
		if (this.pendingConfig) {
			this.cg.set(this.pendingConfig as Config);
			this.pendingConfig = null;
		}
	}

	/**
	 * Reconfigures the live Chessground instance in place via {@link Api.set}.
	 *
	 * This is the preferred way to update the position, orientation, movable
	 * destinations etc. — it keeps animations and drag & drop state intact and
	 * avoids the cost of recreating the whole instance. If the instance has not
	 * been created yet, the config is stored and applied right after creation.
	 *
	 * @param config - Partial Chessground config to merge into the instance.
	 */
	public setConfig(config: Partial<Config>): void {
		if (this.cg) {
			this.cg.set(config as Config);
		} else {
			this.pendingConfig = config;
		}
	}

	/**
	 * Toggles the orientation of the Chessground board.
	 */
	public toggleOrientation() {
		if (!this.cg) return;
		this.cg.toggleOrientation();
	}

	/**
	 * Destroys the Chessground instance and releases resources.
	 *
	 * Called by Angular when the owning component is destroyed. Unbinds the
	 * instance's document listeners so no orphaned drag handlers remain.
	 */
	public ngOnDestroy(): void {
		if (this.cg) {
			this.cg.destroy();
			this.cg = null as unknown as Api;
		}
		this.boardEl = null;
		this.pendingConfig = null;
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
	 * On insert (first render): initializes the Chessground instance by running
	 * the configured run function and stores a reference to it (and the board
	 * element) for later in-place updates. On postpatch: the instance already
	 * exists, so nothing is re-created.
	 *
	 * @param vnode - The virtual node.
	 * @param oldVnode - The previous virtual node (only present on postpatch).
	 * @returns The chessground Api.
	 * @private
	 */
	private readonly runUnit = (vnode: VNode, oldVnode?: VNode) => {
		const el = vnode.elm as HTMLElement;
		el.className = 'cg-wrap';
		this.boardEl = el;
		if (!oldVnode) {
			// Insert hook: first time this element hits the DOM
			this.cg = this.runFn(el);
		}
		return this.cg;
	};
}
