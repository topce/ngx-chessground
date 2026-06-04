import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ThemeService } from './theme.service';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrl: './app.component.scss',
	imports: [RouterModule],
})
export class AppComponent {
	readonly themeService = inject(ThemeService);

	toggleTheme(): void {
		this.themeService.toggle();
	}
}
