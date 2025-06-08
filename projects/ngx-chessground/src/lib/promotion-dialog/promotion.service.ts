import { Injectable, inject } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { firstValueFrom } from "rxjs";
import {
	PromotionDialogComponent,
	type PromotionDialogData,
	type PromotionPiece,
} from "./promotion-dialog.component";

@Injectable({
	providedIn: "root",
})
export class PromotionService {
	private readonly dialog = inject(MatDialog);

	async showPromotionDialog(color: "white" | "black"): Promise<PromotionPiece> {
		const dialogRef = this.dialog.open(PromotionDialogComponent, {
			width: "350px",
			disableClose: true,
			hasBackdrop: true,
			data: { color } as PromotionDialogData,
		});

		const result = await firstValueFrom(dialogRef.afterClosed());
		return result ?? "q"; // Default to queen if dialog is closed without selection
	}
}
