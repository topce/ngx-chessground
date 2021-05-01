import { TestBed } from '@angular/core/testing';

import { NgxChessgroundService } from './ngx-chessground.service';

describe('NgxChessgroundService', () => {
  let service: NgxChessgroundService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NgxChessgroundService],
    });
    service = TestBed.inject(NgxChessgroundService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
