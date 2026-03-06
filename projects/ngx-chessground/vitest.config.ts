import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			thresholds: {
					branches: 90,
					functions: 75,
					lines: 90,
					statements: 90,
			},
		},
	},
});