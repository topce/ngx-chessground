import {
	enableProdMode,
	provideZonelessChangeDetection,
	isDevMode,
} from '@angular/core';

import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { environment } from './environments/environment';
import { provideServiceWorker } from '@angular/service-worker';

if (environment.production) {
	enableProdMode();
}

bootstrapApplication(AppComponent, {
	providers: [
		provideRouter(routes),
		provideAnimations(),
		provideZonelessChangeDetection(),
		provideServiceWorker('ngsw-worker.js', {
			enabled: !isDevMode(),
			registrationStrategy: 'registerWhenStable:30000',
		}),
	],
}).catch((err) => console.error(err));
