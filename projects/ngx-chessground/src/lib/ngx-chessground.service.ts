import { Injectable } from "@angular/core";
import { h } from "snabbdom";
import { init } from "snabbdom";

import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { VNode } from "snabbdom";
import { classModule } from "snabbdom";
import { attributesModule } from "snabbdom";
import { eventListenersModule } from "snabbdom";

@Injectable()
export class NgxChessgroundService {
	private patch = init([classModule, attributesModule, eventListenersModule]);
	private vnode!: VNode;
	private cg!: Api;
	private runFn!: (el: HTMLElement) => Api;
	public redraw(element: HTMLElement, runFn: (el: HTMLElement) => Api) {
		this.cg = Chessground(element);
		this.runFn = runFn;
		this.vnode = this.patch(this.vnode || element, this.render());
	}

	public toggleOrientation() {
		this.cg.toggleOrientation();
	}
	private render(): VNode {
		return h("div#chessground-examples", [
			h("section.blue.merida", [
				h("div.cg-wrap", {
					hook: {
						insert: this.runUnit,
						postpatch: this.runUnit,
					},
				}),
			]),
		]);
	}

	private runUnit = (vnode: VNode, _ignore?: VNode) => {
		const el = vnode.elm as HTMLElement;
		el.className = "cg-wrap";
		this.cg = Chessground(el);
		return this.runFn(el);
	};
}
