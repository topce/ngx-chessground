import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import {
	PromotionDialogComponent,
	type PromotionDialogData,
	type PromotionPiece,
} from './promotion-dialog.component';

/**
 * Service that opens a Material dialog for pawn promotion selection.
 *
 * Used by chess units and components when a pawn reaches the eighth rank.
 * The dialog presents Queen, Rook, Bishop, and Knight options.
 *
 * Provided at root level so any component can inject it.
 *
 * @example
 * ```typescript
 * const promotionService = inject(PromotionService);
 * const piece = await promotionService.showPromotionDialog('white');
 * // piece is 'q', 'r', 'b', or 'n'
 * ```
 */
@Injectable({
	providedIn: 'root',
})
export class PromotionService {
	/** Material dialog service used to open the promotion dialog. */
	private readonly dialog = inject(MatDialog);

	/**
	 * Opens the promotion dialog and returns the user's selection.
	 *
	 * The dialog is modal (disableClose) with a backdrop.
	 * Defaults to Queen ('q') if the dialog is dismissed without selection.
	 *
	 * @param color — The color of the promoting pawn ('white' or 'black').
	 * @returns A Promise resolving to the chosen piece: `'q'` (Queen), `'r'` (Rook),
	 *          `'b'` (Bishop), or `'n'` (Knight).
	 */
	async showPromotionDialog(color: 'white' | 'black'): Promise<PromotionPiece> {
		const dialogRef = this.dialog.open(PromotionDialogComponent, {
			width: '350px',
			disableClose: true,
			hasBackdrop: true,
			data: { color } as PromotionDialogData,
		});

		const result = await firstValueFrom(dialogRef.afterClosed());
		return result ?? 'q'; // Default to queen if dialog is closed without selection
	}
}
