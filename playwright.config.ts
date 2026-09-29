import { defineConfig, devices } from '@playwright/test';
import { E2E_AUTH_SECRET } from './e2e/support/auth';

/**
 * The browser-side accessibility checks (`npm run test:a11y`): axe-core over
 * the real screen in its real states, including rendered colour contrast.
 *
 * The app runs as a production build against DynamoDB Local, in its own
 * table (`PlayersE2E`), so the tests never touch the players you play with.
 * It needs Java for DynamoDB Local. Coinbase is a fake (e2e/support/
 * fake-coinbase.mjs) serving the same shapes from a made-up market, so the
 * deploy gate depends on nothing outside this repository: a blip or a 429
 * from the live API cannot block a deploy. `E2E_LIVE_COINBASE=1` runs
 * against the real API instead, for the occasional check that the app still
 * reads what Coinbase sends.
 *
 * It builds the app first, unless E2E_PREBUILT is set: the Amplify build
 * (amplify.yml) runs these tests against the build it has just made and is
 * about to deploy, rather than building twice.
 */

const PORT = 3100;
const FAKE_COINBASE_PORT = 3102;
const LIVE_COINBASE = Boolean(process.env.E2E_LIVE_COINBASE);

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
	webServer: [
		...(LIVE_COINBASE
			? []
			: [
					{
						command: 'node e2e/support/fake-coinbase.mjs',
						url: `http://localhost:${FAKE_COINBASE_PORT}`,
						env: {
							FAKE_COINBASE_PORT: String(FAKE_COINBASE_PORT),
						},
						reuseExistingServer: !process.env.CI,
					},
				]),
		{
			command: `${process.env.E2E_PREBUILT ? '' : 'npm run build && '}node scripts/dev-local.mjs --prod -p ${PORT}`,
			url: `http://localhost:${PORT}`,
			env: {
				DEV_LOCAL_TABLE: 'PlayersE2E',
				// So the tests can hold a session cookie (e2e/support/auth.ts).
				AUTH_SECRET: E2E_AUTH_SECRET,
				// The Amplify build copies its own AUTH_URL (https) into
				// .env.production, and Auth.js then reads its session from the
				// `__Secure-` cookie, not the plain one the tests set. This
				// server is http on localhost, and process env beats the file.
				AUTH_URL: `http://localhost:${PORT}`,
				...(LIVE_COINBASE
					? {}
					: {
							E2E_COINBASE_URL: `http://localhost:${FAKE_COINBASE_PORT}`,
						}),
			},
			timeout: 240_000,
			reuseExistingServer: !process.env.CI,
		},
	],
});
