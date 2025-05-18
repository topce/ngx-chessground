import { NgModule } from "@angular/core";
import { RouterModule, type Routes } from "@angular/router";
import { HomePageComponent } from "./home-page/home-page.component";
import { ChessTablePageComponent } from "./chess-table-page/chess-table-page.component";

const routes: Routes = [
	{ path: "", component: HomePageComponent },
	{ path: "chess-table", component: ChessTablePageComponent },
	{ path: "**", redirectTo: "" }, // Redirect any unknown routes to home
];

@NgModule({
	imports: [RouterModule.forRoot(routes)],
	exports: [RouterModule],
})
export class AppRoutingModule {}
