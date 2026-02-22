import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-sponsor-dialog',
    standalone: true,
    imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
    template: `
		<h2 mat-dialog-title>💖 Add Your Evergreen Game!</h2>
		<mat-dialog-content class="mat-typography">
			<p>
				Thank you for supporting <strong>ngx-chessground</strong>! By
				sponsoring the project, you can get your favorite or "evergreen"
				chess game prominently featured directly in the application's built-in
				Game List.
			</p>

			<h3>How to get your game featured:</h3>
			<ol>
				<li>
					<strong>Become a Sponsor</strong>: Head over to my GitHub
					Sponsors page to support the project.<br />
					<a
						href="https://github.com/sponsors/topce"
						target="_blank"
						rel="noopener noreferrer"
						>👉 Go to GitHub Sponsors</a
					>
				</li>
				<li>
					<strong>Prepare your Game</strong>: Grab the PGN file of your
					favorite game. Make sure to include the players' names, event, and
					date if possible!
				</li>
				<li>
					<strong>Submit a Request</strong>: The best way to add your game
					is by submitting a <strong>Pull Request (PR)</strong> or creating an
					<strong>Issue</strong> on our GitHub repository. <br />Include your
					preferred Display Name alongside the PGN file.
				</li>
			</ol>
		</mat-dialog-content>
		<mat-dialog-actions align="end">
			<button mat-button mat-dialog-close>Close</button>
			<a
				mat-raised-button
				color="primary"
				href="https://github.com/topce/ngx-chessground/issues/new"
				target="_blank"
				rel="noopener noreferrer"
				>Create Issue</a
			>
			<a
				mat-raised-button
				color="accent"
				href="https://github.com/topce/ngx-chessground/pulls"
				target="_blank"
				rel="noopener noreferrer"
				>Submit PR</a
			>
		</mat-dialog-actions>
	`,
    styles: [
        `
			h3 {
				margin-top: 1.5rem;
				margin-bottom: 0.5rem;
			}
			ol {
				line-height: 1.6;
			}
			li {
				margin-bottom: 0.8rem;
			}
            a[mat-raised-button] {
                margin-left: 8px;
            }
		`,
    ],
})
export class SponsorDialogComponent {
    constructor(public dialogRef: MatDialogRef<SponsorDialogComponent>) { }
}
