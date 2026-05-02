import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
	MAT_DIALOG_DATA,
	MatDialogModule,
	MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface PromotionDialogData {
	color: 'white' | 'black';
}

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

@Component({
	selector: 'ngx-promotion-dialog',
	imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  // TODO: This component has been partially migrated to be zoneless-compatible.
  // After testing, this should be updated to ChangeDetectionStrategy.OnPush.
  changeDetection: ChangeDetectionStrategy.Default,
	template: `
    <div class="promotion-dialog">
      <h2 mat-dialog-title>Choose Promotion Piece</h2>
      <mat-dialog-content>
        <div class="promotion-pieces">
          <button 
            mat-button 
            class="piece-button queen-btn"
            (click)="selectPiece('q')"
            [attr.aria-label]="'Promote to Queen'"
          >
            <div class="piece-icon queen {{ data().color }}"></div>
            <span class="piece-label">Queen</span>
          </button>
          
          <button 
            mat-button 
            class="piece-button rook-btn"
            (click)="selectPiece('r')"
            [attr.aria-label]="'Promote to Rook'"
          >
            <div class="piece-icon rook {{ data().color }}"></div>
            <span class="piece-label">Rook</span>
          </button>
          
          <button 
            mat-button 
            class="piece-button bishop-btn"
            (click)="selectPiece('b')"
            [attr.aria-label]="'Promote to Bishop'"
          >
            <div class="piece-icon bishop {{ data().color }}"></div>
            <span class="piece-label">Bishop</span>
          </button>
          
          <button 
            mat-button 
            class="piece-button knight-btn"
            (click)="selectPiece('n')"
            [attr.aria-label]="'Promote to Knight'"
          >
            <div class="piece-icon knight {{ data().color }}"></div>
            <span class="piece-label">Knight</span>
          </button>
        </div>
      </mat-dialog-content>
    </div>
  `,
	styles: [
		`
    :host {
      --promo-primary: #0369A1;
      --promo-text: #0C4A6E;
      --promo-border: #d0dde6;
    }

    .promotion-dialog {
      padding: 0;
      min-width: 300px;
    }

    .promotion-pieces {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      padding: 20px;
    }

    .piece-button {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px 16px;
      border: 2px solid var(--promo-border);
      border-radius: 12px;
      background: white;
      cursor: pointer;
      transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
      min-height: 100px;
    }

    .piece-button:hover {
      border-color: var(--promo-primary);
      background: #e0f4ff;
      box-shadow: 0 4px 12px rgba(3, 105, 161, 0.15);
    }

    .piece-button:focus-visible {
      outline: 3px solid var(--promo-primary);
      outline-offset: 2px;
    }

    .piece-button:active {
      transform: scale(0.97);
    }

    .piece-icon {
      width: 40px;
      height: 40px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .piece-label {
      font-size: 14px;
      font-weight: 600;
      color: var(--promo-text);
    }

    .piece-icon.queen.white::before {
      content: '♕';
      font-size: 40px;
      color: #0C4A6E;
    }

    .piece-icon.queen.black::before {
      content: '♛';
      font-size: 40px;
      color: #0C4A6E;
    }

    .piece-icon.rook.white::before {
      content: '♖';
      font-size: 40px;
      color: #0C4A6E;
    }

    .piece-icon.rook.black::before {
      content: '♜';
      font-size: 40px;
      color: #0C4A6E;
    }

    .piece-icon.bishop.white::before {
      content: '♗';
      font-size: 40px;
      color: #0C4A6E;
    }

    .piece-icon.bishop.black::before {
      content: '♝';
      font-size: 40px;
      color: #0C4A6E;
    }

    .piece-icon.knight.white::before {
      content: '♘';
      font-size: 40px;
      color: #0C4A6E;
    }

    .piece-icon.knight.black::before {
      content: '♞';
      font-size: 40px;
      color: #0C4A6E;
    }

    h2[mat-dialog-title] {
      text-align: center;
      margin: 0;
      padding: 20px 20px 0 20px;
      color: var(--promo-text);
      font-size: 18px;
      font-weight: 600;
      font-family: "Poppins", "Segoe UI", system-ui, sans-serif;
    }
  `,
	],
})
export class PromotionDialogComponent {
	readonly dialogRef = inject(MatDialogRef<PromotionDialogComponent>);
  readonly data = signal(inject<PromotionDialogData>(MAT_DIALOG_DATA));

	selectPiece(piece: PromotionPiece): void {
		this.dialogRef.close(piece);
	}
}
