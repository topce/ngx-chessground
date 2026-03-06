import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PromotionService } from './promotion.service';

describe('PromotionService', () => {
	it('returns the selected promotion piece', async () => {
		const open = vi.fn().mockReturnValue({
			afterClosed: () => of('n'),
		});

		TestBed.configureTestingModule({
			providers: [{ provide: MatDialog, useValue: { open } }],
		});

		const service = TestBed.inject(PromotionService);
		await expect(service.showPromotionDialog('white')).resolves.toBe('n');
		expect(open).toHaveBeenCalledOnce();
	});

	it('defaults to a queen when the dialog closes without a selection', async () => {
		const open = vi.fn().mockReturnValue({
			afterClosed: () => of(undefined),
		});

		TestBed.configureTestingModule({
			providers: [{ provide: MatDialog, useValue: { open } }],
		});

		const service = TestBed.inject(PromotionService);
		await expect(service.showPromotionDialog('black')).resolves.toBe('q');
	});
});