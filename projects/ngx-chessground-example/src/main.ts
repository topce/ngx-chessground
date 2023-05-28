import { enableProdMode, importProvidersFrom } from "@angular/core";

import { environment } from "./environments/environment";
import { AppComponent } from "./app/app.component";
import { MatCardModule } from "@angular/material/card";
import { MatListModule } from "@angular/material/list";
import { provideAnimations } from "@angular/platform-browser/animations";
import { AppRoutingModule } from "./app/app-routing.module";
import { BrowserModule, bootstrapApplication } from "@angular/platform-browser";

if (environment.production) {
	enableProdMode();
}

bootstrapApplication(AppComponent, {
	providers: [
		importProvidersFrom(
			BrowserModule,
			AppRoutingModule,
			MatListModule,
			MatCardModule,
		),
		provideAnimations(),
	],
}).catch((err) => console.error(err));
