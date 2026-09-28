/**
 * The screen while Coinbase is down: the server cannot fetch the game price
 * (a copy of the app with E2E_PRICE_FEED_DOWN) and the browser cannot fetch
 * the chart (its requests are blocked here). Two cases, set through the
 * server's price cache: a game that has never had a price, and one whose
 * last price is going stale. Both must say what is happening, refuse a guess
 * before it is tried, and pass axe.
 */

import { expect, test, type Page } from '@playwright/test';
import { expectNoViolations } from './support/axe';
import { setCachedPrice } from './support/db';
import { OUTAGE_URL, startOutageServer } from './support/outage';

let stopServer: () => void;

test.beforeAll(async () => {
	stopServer = await startOutageServer();
});

test.afterAll(async () => {
	stopServer?.();
	// Leave the cache empty: the main server fetches a fresh price on its
	// next request rather than serving the old one set here.
	await setCachedPrice(null);
});

/** The game with Coinbase unreachable from the browser as well. */
async function openDuringOutage(page: Page) {
	await page.route('https://api.exchange.coinbase.com/**', (route) =>
		route.abort(),
	);
	await page.goto(OUTAGE_URL);
	await expect(
		page.getByText('The chart is unavailable right now'),
	).toBeVisible({
		timeout: 30_000,
	});
}

/** Both guess buttons quiet, saying why. */
async function expectGuessingPaused(page: Page) {
	for (const word of ['Higher', 'Lower']) {
		await expect(
			page.getByRole('button', {
				name: `${word}, waiting for the price`,
			}),
		).toBeDisabled();
	}
	await expect(
		page.getByText(
			'Price feed delayed. Nothing can be locked in until it catches up.',
		),
	).toBeVisible();
}

test('no price has ever reached the game', async ({ page }) => {
	await setCachedPrice(null);
	await openDuringOutage(page);

	await expect(
		page.getByText(
			'The price is unavailable right now. Nothing can be guessed until it returns.',
		),
	).toBeVisible();
	// No price above the chart, so its note does not point at one.
	await expect(
		page.getByText('The chart is unavailable right now.', {
			exact: true,
		}),
	).toBeVisible();
	await expectGuessingPaused(page);
	await expectNoViolations(page);
});

test('the feed goes quiet: the last price stays, marked delayed', async ({
	page,
}) => {
	await setCachedPrice({
		price: 80_000,
		updatedAt: Date.now() - 5 * 60_000,
	});
	await openDuringOutage(page);

	await expect(page.getByText('$80,000.00')).toBeVisible();
	await expect(
		page.getByText(
			/^Price feed delayed\. Last updated 5 min ago\. Nothing is settled until it catches up\.$/,
		),
	).toBeVisible();
	await expect(
		page.getByRole('img', {
			name: 'Delayed',
		}),
	).toBeVisible();
	await expectGuessingPaused(page);
	await expectNoViolations(page);
});
