import { enableProdMode, provideZonelessChangeDetection } from "@angular/core";

import { bootstrapApplication } from "@angular/platform-browser";
import { provideAnimations } from "@angular/platform-browser/animations";
import { provideRouter } from "@angular/router";
import { AppComponent } from "./app/app.component";
import { routes } from "./app/app.routes";
import { environment } from "./environments/environment";

if (environment.production) {
	enableProdMode();
}

bootstrapApplication(AppComponent, {
	providers: [
		provideRouter(routes),
		provideAnimations(),
		provideZonelessChangeDetection(),
	],
}).catch((err) => console.error(err));
