import { NgModule } from '@angular/core';
import { NgxChessgroundComponent } from './ngx-chessground.component';
import { NgxChessgroundTableComponent } from './ngx-chessground-table/ngx-chessground-table.component';

@NgModule({
  declarations: [NgxChessgroundComponent, NgxChessgroundTableComponent],
  imports: [],
  exports: [NgxChessgroundComponent, NgxChessgroundTableComponent],
})
export class NgxChessgroundModule {}
