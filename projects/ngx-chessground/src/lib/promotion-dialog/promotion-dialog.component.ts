import { CommonModule } from "@angular/common";
import { Component, Inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
	MAT_DIALOG_DATA,
	MatDialogModule,
	MatDialogRef,
} from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";

export interface PromotionDialogData {
	color: "white" | "black";
}

export type PromotionPiece = "q" | "r" | "b" | "n";

@Component({
	selector: "ngx-promotion-dialog",
	standalone: true,
	imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
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
            <div class="piece-icon queen {{ data.color }}"></div>
            <span class="piece-label">Queen</span>
          </button>
          
          <button 
            mat-button 
            class="piece-button rook-btn"
            (click)="selectPiece('r')"
            [attr.aria-label]="'Promote to Rook'"
          >
            <div class="piece-icon rook {{ data.color }}"></div>
            <span class="piece-label">Rook</span>
          </button>
          
          <button 
            mat-button 
            class="piece-button bishop-btn"
            (click)="selectPiece('b')"
            [attr.aria-label]="'Promote to Bishop'"
          >
            <div class="piece-icon bishop {{ data.color }}"></div>
            <span class="piece-label">Bishop</span>
          </button>
          
          <button 
            mat-button 
            class="piece-button knight-btn"
            (click)="selectPiece('n')"
            [attr.aria-label]="'Promote to Knight'"
          >
            <div class="piece-icon knight {{ data.color }}"></div>
            <span class="piece-label">Knight</span>
          </button>
        </div>
      </mat-dialog-content>
    </div>
  `,
	styles: [
		`
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
      border: 2px solid #ddd;
      border-radius: 8px;
      background: white;
      cursor: pointer;
      transition: all 0.2s ease;
      min-height: 100px;
    }

    .piece-button:hover {
      border-color: #2196f3;
      background: #f5f5f5;
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }

    .piece-icon {
      width: 40px;
      height: 40px;
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      margin-bottom: 8px;
    }

    .piece-label {
      font-size: 14px;
      font-weight: 500;
      color: #333;
    }

    /* Chess piece icons using Unicode symbols as fallback */
    .piece-icon.queen.white::before {
      content: '♕';
      font-size: 40px;
      color: #333;
    }
    
    .piece-icon.queen.black::before {
      content: '♛';
      font-size: 40px;
      color: #333;
    }
    
    .piece-icon.rook.white::before {
      content: '♖';
      font-size: 40px;
      color: #333;
    }
    
    .piece-icon.rook.black::before {
      content: '♜';
      font-size: 40px;
      color: #333;
    }
    
    .piece-icon.bishop.white::before {
      content: '♗';
      font-size: 40px;
      color: #333;
    }
    
    .piece-icon.bishop.black::before {
      content: '♝';
      font-size: 40px;
      color: #333;
    }
    
    .piece-icon.knight.white::before {
      content: '♘';
      font-size: 40px;
      color: #333;
    }
    
    .piece-icon.knight.black::before {
      content: '♞';
      font-size: 40px;
      color: #333;
    }

    h2[mat-dialog-title] {
      text-align: center;
      margin: 0;
      padding: 20px 20px 0 20px;
      color: #333;
      font-size: 18px;
      font-weight: 600;
    }
  `,
	],
})
export class PromotionDialogComponent {
	constructor(
		public dialogRef: MatDialogRef<PromotionDialogComponent>,
		@Inject(MAT_DIALOG_DATA) public data: PromotionDialogData,
	) {}

	selectPiece(piece: PromotionPiece): void {
		this.dialogRef.close(piece);
	}
}
