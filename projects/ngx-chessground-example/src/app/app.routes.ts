import { Routes } from "@angular/router";
import { HomePageComponent } from "./home-page/home-page.component";
import { PlayLikeGoatComponent } from "./play-like-goat/play-like-goat.component";
import { GoatComponent } from "./goat/goat.component";
import { MeComponent } from "./me/me.component";

export const routes: Routes = [
	{ path: "", component: HomePageComponent },
	{ path: "play-like-goat", component: PlayLikeGoatComponent },
	{ path: "goat", component: GoatComponent },
	{ path: "me", component: MeComponent },
	{ path: "pgn-viewer", loadComponent: () => import('./pgn-viewer/pgn-viewer.component').then(m => m.PgnViewerComponent) },
	{ path: "**", redirectTo: "" }, // Redirect any unknown routes to home
	// Trigger rebuild
];

