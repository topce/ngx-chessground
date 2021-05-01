import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NgxChessgroundTableComponent } from './ngx-chessground-table.component';

describe('NgxChessgroundTableComponent', () => {
  let component: NgxChessgroundTableComponent;
  let fixture: ComponentFixture<NgxChessgroundTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NgxChessgroundTableComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(NgxChessgroundTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
