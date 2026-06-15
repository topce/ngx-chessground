import { Component, DestroyRef, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs';
import { MiniPlayerComponent } from './mini-player/mini-player.component';
import { ThemeService } from './theme.service';

/** Per-route title & description configuration. */
const ROUTE_META: Record<string, { title: string; description: string }> = {
	'/pgn-viewer': {
		title: 'PGN Viewer — ngx-chessground',
		description:
			"Interactive PGN viewer for annotated chess games. Explore Fischer's Evergreen game and more with Stockfish analysis.",
	},
	'/home': {
		title: 'Examples — ngx-chessground',
		description:
			'Interactive playground showcasing the full API surface of ngx-chessground: configuration units, scenarios, and board demos.',
	},
	'/play-like-goat': {
		title: 'Play Like Fischer — ngx-chessground',
		description:
			'Open chessboard for practice. Play both sides to develop intuition, just like Bobby Fischer.',
	},
	'/goat': {
		title: 'Bobby Fischer — ngx-chessground',
		description:
			'Learn about Robert James Fischer, the 11th World Chess Champion. Biography, resources, and curated game collections.',
	},
	'/me': {
		title: 'About — ngx-chessground',
		description:
			'About the creator of ngx-chessground: a modern Angular chessboard library. Chess enthusiast and open-source contributor.',
	},
};

const DEFAULT_TITLE = 'ngx-chessground — Angular Chessboard Library';
const DEFAULT_DESCRIPTION =
	'ngx-chessground is a modern Angular chessboard component library. Interactive PGN viewer, analysis board, and chess UI components built on Chessground.';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrl: './app.component.scss',
	imports: [RouterModule, MiniPlayerComponent],
})
export class AppComponent {
	private readonly titleService = inject(Title);
	private readonly metaService = inject(Meta);
	private readonly router = inject(Router);
	private readonly destroyRef = inject(DestroyRef);

	readonly themeService = inject(ThemeService);

	constructor() {
		const sub = this.router.events
			.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
			.subscribe((event) => this.updateMetaForRoute(event.urlAfterRedirects));
		this.destroyRef.onDestroy(() => sub.unsubscribe());
	}

	private updateMetaForRoute(url: string): void {
		// Match the route path (strip query params, use base path)
		const path = `/${url.split('?')[0].split('/').filter(Boolean).shift() || ''}`;
		const meta = ROUTE_META[path];

		if (meta) {
			this.titleService.setTitle(meta.title);
			this.metaService.updateTag({
				name: 'description',
				content: meta.description,
			});
			this.metaService.updateTag({ property: 'og:title', content: meta.title });
			this.metaService.updateTag({
				property: 'og:description',
				content: meta.description,
			});
			this.metaService.updateTag({
				name: 'twitter:title',
				content: meta.title,
			});
			this.metaService.updateTag({
				name: 'twitter:description',
				content: meta.description,
			});
		} else {
			this.titleService.setTitle(DEFAULT_TITLE);
			this.metaService.updateTag({
				name: 'description',
				content: DEFAULT_DESCRIPTION,
			});
			this.metaService.updateTag({
				property: 'og:title',
				content: DEFAULT_TITLE,
			});
			this.metaService.updateTag({
				property: 'og:description',
				content: DEFAULT_DESCRIPTION,
			});
			this.metaService.updateTag({
				name: 'twitter:title',
				content: DEFAULT_TITLE,
			});
			this.metaService.updateTag({
				name: 'twitter:description',
				content: DEFAULT_DESCRIPTION,
			});
		}
	}

	toggleTheme(): void {
		this.themeService.toggle();
	}
}
