import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MiniPlayerComponent } from './mini-player/mini-player.component';
import { ThemeService } from './theme.service';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrl: './app.component.scss',
	imports: [RouterModule, MiniPlayerComponent],
})
export class AppComponent {
	readonly themeService = inject(ThemeService);

	toggleTheme(): void {
		this.themeService.toggle();
	}
}
