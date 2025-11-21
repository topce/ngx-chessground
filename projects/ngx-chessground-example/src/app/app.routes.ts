import { Routes } from "@angular/router";
import { ChessTablePageComponent } from "./chess-table-page/chess-table-page.component";
import { HomePageComponent } from "./home-page/home-page.component";

export const routes: Routes = [
	{ path: "", component: HomePageComponent },
	{ path: "chess-table", component: ChessTablePageComponent },
	{ path: "**", redirectTo: "" }, // Redirect any unknown routes to home
];
