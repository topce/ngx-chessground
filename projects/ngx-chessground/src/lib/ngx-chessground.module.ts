import { NgModule } from '@angular/core';
import { NgxChessgroundComponent } from './ngx-chessground.component';
import { NgxChessgroundTableComponent } from './ngx-chessground-table/ngx-chessground-table.component';
import { ChessTableComponent } from './chess-table/chess-table.component';

@NgModule({
  declarations: [
    NgxChessgroundComponent,
    NgxChessgroundTableComponent,
    ChessTableComponent,
  ],
  imports: [],
  exports: [
    NgxChessgroundComponent,
    NgxChessgroundTableComponent,
    ChessTableComponent,
  ],
})
export class NgxChessgroundModule {}
