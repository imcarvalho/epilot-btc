import { defineConfig, devices } from '@playwright/test';

/**
 * The browser-side accessibility checks (`npm run test:a11y`): axe-core over
 * the real screen in its real states, including rendered colour contrast.
 *
 * The app runs as a production build against DynamoDB Local, in its own
 * table (`PlayersE2E`), so the tests never touch the players you play with.
 * It needs Java for DynamoDB Local, and the network: the price and the chart
 * come from Coinbase, as they do for a player.
 */

const PORT = 3100;

export default defineConfig({
	testDir: 'e2e',
	timeout: 90_000,
	fullyParallel: false,
	workers: 1,
	reporter: [['list']],
	use: {
		baseURL: `http://localhost:${PORT}`,
		...devices['Desktop Chrome'],
	},
	webServer: {
		command: `npm run build && node scripts/dev-local.mjs --prod -p ${PORT}`,
		url: `http://localhost:${PORT}`,
		env: {
			DEV_LOCAL_TABLE: 'PlayersE2E',
		},
		timeout: 240_000,
		reuseExistingServer: !process.env.CI,
	},
});
