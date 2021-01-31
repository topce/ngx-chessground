import {
  Component,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  AfterViewInit,
  Input,
} from '@angular/core';
import { Api } from 'chessground/api';
import { NgxChessgroundService } from './ngx-chessground.service';

@Component({
  selector: 'ngx-chessground',
  templateUrl: './ngx-chessground.component.html',
  styleUrls: ['./ngx-chessground.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgxChessgroundComponent implements AfterViewInit {
  @Input()
  private runFunction!: (el: HTMLElement) => Api;
  public get runFn(): (el: HTMLElement) => Api {
    return this.runFunction;
  }
  public set runFn(value: (el: HTMLElement) => Api) {
    this.runFunction = value;
    this.redraw();
  }
  @ViewChild('chessboard')
  elementView!: ElementRef;
  constructor(private ngxChessgroundService: NgxChessgroundService) {}

  ngAfterViewInit() {
    this.redraw();
  }
  private redraw() {
    if (this.elementView.nativeElement && this.runFn) {
      this.ngxChessgroundService.redraw(
        this.elementView.nativeElement,
        this.runFn
      );
    }
  }
}
