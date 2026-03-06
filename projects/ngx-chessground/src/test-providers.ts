import {
	provideZonelessChangeDetection,
	type EnvironmentProviders,
} from '@angular/core';

const testProviders: EnvironmentProviders[] = [
	provideZonelessChangeDetection(),
];

export default testProviders;