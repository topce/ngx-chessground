import { Api } from 'chessground/api';

export interface Unit {
  name: string;
  run: (el: HTMLElement) => Api;
}
