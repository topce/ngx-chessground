import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { NgxChessgroundComponent } from '../ngx-chessground.component';
import * as play from '../../units/play';

@Component({
  selector: 'ngx-chessground-table',
  templateUrl: './ngx-chessground-table.component.html',
  styleUrls: ['./ngx-chessground-table.component.css'],
})
export class NgxChessgroundTableComponent implements AfterViewInit {
  @ViewChild('chess') ngxChessgroundComponent!: NgxChessgroundComponent;
  ngAfterViewInit(): void {
    this.ngxChessgroundComponent.runFn = play.initial.run;
  }
}
