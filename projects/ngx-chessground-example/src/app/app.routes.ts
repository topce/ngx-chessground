import { Routes } from "@angular/router";
import { GoatComponent } from "./goat/goat.component";
// import { HomePageComponent } from "./home-page/home-page.component";
import { MeComponent } from "./me/me.component";
import { PlayLikeGoatComponent } from "./play-like-goat/play-like-goat.component";

export const routes: Routes = [
	{ path: "", redirectTo: "pgn-viewer", pathMatch: "full" },
	{ path: "play-like-goat", component: PlayLikeGoatComponent },
	{ path: "goat", component: GoatComponent },
	{ path: "me", component: MeComponent },
	{
		path: "pgn-viewer",
		loadComponent: () =>
			import("./pgn-viewer/pgn-viewer.component").then(
				(m) => m.PgnViewerComponent,
			),
	},
	{ path: "**", redirectTo: "" }, // Redirect any unknown routes to home
	// Trigger rebuild
];
