import {
	enableProdMode,
	importProvidersFrom,
	provideZonelessChangeDetection,
} from "@angular/core";

import { MatCardModule } from "@angular/material/card";
import { MatListModule } from "@angular/material/list";
import { BrowserModule, bootstrapApplication } from "@angular/platform-browser";
import { provideAnimations } from "@angular/platform-browser/animations";
import { AppComponent } from "./app/app.component";
import { AppRoutingModule } from "./app/app-routing.module";
import { environment } from "./environments/environment";

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
		provideZonelessChangeDetection(),
	],
}).catch((err) => console.error(err));
