import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NgxChessgroundComponent } from './ngx-chessground.component';

describe('NgxChessgroundComponent', () => {
  let component: NgxChessgroundComponent;
  let fixture: ComponentFixture<NgxChessgroundComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NgxChessgroundComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(NgxChessgroundComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
