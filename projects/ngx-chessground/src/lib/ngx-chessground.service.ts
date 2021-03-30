import { Injectable } from '@angular/core';
import { h } from 'snabbdom/build/package/h';
import { init } from 'snabbdom/build/package/init';

import { VNode } from 'snabbdom/build/package/vnode';
import { classModule } from 'snabbdom/build/package/modules/class';
import { attributesModule } from 'snabbdom/build/package/modules/attributes';
import { eventListenersModule } from 'snabbdom/build/package/modules/eventlisteners';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';

@Injectable()
export class NgxChessgroundService {
  private patch = init([classModule, attributesModule, eventListenersModule]);
  private vnode!: VNode;
  private cg!: Api;
  private runFn!: (el: HTMLElement) => Api;

  constructor() {}
  public redraw(element: HTMLElement, runFn: (el: HTMLElement) => Api) {
    this.cg = Chessground(element);
    this.runFn = runFn;
    this.vnode = this.patch(this.vnode || element, this.render());
  }

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

  private runUnit = (vnode: VNode) => {
    const el = vnode.elm as HTMLElement;
    el.className = 'cg-wrap';
    this.cg = Chessground(el);
    // @ts-ignore
    window.cg = this.cg;
    return this.runFn(el);
  };
}
