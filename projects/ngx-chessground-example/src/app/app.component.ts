import { Component } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatToolbarModule } from "@angular/material/toolbar";
import { RouterModule } from "@angular/router";

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
