import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import {
	PromotionDialogComponent,
	type PromotionPiece,
} from './promotion-dialog.component';

describe('PromotionDialogComponent', () => {
	it('renders the injected color and closes with the selected piece', async () => {
		const close = vi.fn<(piece: PromotionPiece) => void>();

		await TestBed.configureTestingModule({
			imports: [PromotionDialogComponent],
			providers: [
				{ provide: MAT_DIALOG_DATA, useValue: { color: 'black' } },
				{ provide: MatDialogRef, useValue: { close } },
			],
		}).compileComponents();

		const fixture = TestBed.createComponent(PromotionDialogComponent);
		await fixture.whenStable();

		const element = fixture.nativeElement as HTMLElement;
		expect(element.querySelector('.piece-icon.queen.black')).not.toBeNull();
		expect(element.textContent).toContain('Choose Promotion Piece');

		fixture.componentInstance.selectPiece('n');

		expect(close).toHaveBeenCalledWith('n');
	});
});