import { Component, inject, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterModule } from '@angular/router';
import { ThemeService } from './theme.service';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrl: './app.component.scss',
	imports: [RouterModule, MatToolbarModule, MatButtonModule, MatIconModule],
})
export class AppComponent {
	title = 'ngx-chessground-example';
	readonly themeService = inject(ThemeService);

	toggleTheme(): void {
		this.themeService.toggle();
	}
}
