import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterModule } from '@angular/router';
import { ThemeService } from './theme.service';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss'],
	imports: [RouterModule, MatToolbarModule, MatButtonModule, MatIconModule],
	standalone: true,
})
export class AppComponent {
	title = 'ngx-chessground-example';
	readonly themeService = inject(ThemeService);

	toggleTheme(): void {
		this.themeService.toggle();
	}
}
