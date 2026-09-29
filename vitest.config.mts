import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Two projects. `unit` needs nothing but Node. `integration` runs the
 * DynamoDB store against a real DynamoDB engine (DynamoDB Local, started by
 * its global setup, so it needs Java): the mocks in the unit tests accept any
 * input, and only an engine says whether an expression is valid.
 */
export default defineConfig({
	resolve: {
		alias: {
			'@': path.resolve(import.meta.dirname, 'src'),
		},
	},
	test: {
		globals: true,
		environment: 'node',
		// The deploy build sets VITEST_REPORTER=dot: a passing file is a dot,
		// and a failure is still printed in full. Locally, the default.
		reporters: [process.env.VITEST_REPORTER ?? 'default'],
		server: {
			deps: {
				// next-auth imports `next/server` without the extension, which
				// Node's own ESM resolution refuses; Vite's resolves it.
				inline: ['next-auth'],
			},
		},
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['src/**/*.test.ts'],
					exclude: ['src/**/*.integration.test.ts'],
				},
			},
			{
				extends: true,
				test: {
					name: 'integration',
					include: ['src/**/*.integration.test.ts'],
					globalSetup: ['./test/dynamo-global-setup.ts'],
					testTimeout: 20_000,
				},
			},
		],
	},
});
