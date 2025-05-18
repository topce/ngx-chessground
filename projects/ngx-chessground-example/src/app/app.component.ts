import { Component } from "@angular/core";
import { RouterModule } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";

@Component({
	selector: "app-root",
	templateUrl: "./app.component.html",
	styleUrls: ["./app.component.scss"],
	imports: [RouterModule, MatToolbarModule, MatButtonModule],
	standalone: true,
})
export class AppComponent {
	title = "ngx-chessground-example";
}
