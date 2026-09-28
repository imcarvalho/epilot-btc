/**
 * The screen while Coinbase is down: the server can fetch neither the game
 * price nor the chart's candles (a copy of the app with E2E_PRICE_FEED_DOWN),
 * and nothing is cached for the chart. Two cases, set through the server's
 * price cache: a game that has never had a price, and one whose last price
 * is going stale. Both must say what is happening, refuse a guess before it
 * is tried, and pass axe.
 */

import { expect, test, type Page } from '@playwright/test';
import { expectNoViolations } from './support/axe';
import { setCachedCandles, setCachedPrice } from './support/db';
import { OUTAGE_URL, startOutageServer } from './support/outage';

let stopServer: () => void;

test.beforeAll(async () => {
	stopServer = await startOutageServer();
});

test.afterAll(async () => {
	stopServer?.();
	// Leave the caches empty: the main server fetches afresh on its next
	// request rather than serving what was set here.
	await setCachedPrice(null);
	await setCachedCandles(null);
});

/** The game with no hour cached either: the chart has nothing to draw. */
async function openDuringOutage(page: Page) {
	await setCachedCandles(null);
	await page.goto(OUTAGE_URL);
	await expect(
		page.getByText('The chart is unavailable right now'),
	).toBeVisible({
		timeout: 30_000,
	});
}

/** Both guess buttons quiet, saying why - on screen and to a screen reader. */
async function expectGuessingPaused(page: Page) {
	for (const word of ['Higher', 'Lower']) {
		await expect(
			page.getByRole('button', {
				name: `${word}, waiting for the price`,
			}),
		).toBeDisabled();
	}
	await expect(
		page.getByRole('paragraph').filter({
			hasText:
				'Price feed delayed. Nothing can be locked in until it catches up.',
		}),
	).toBeVisible();
	// Announced as well as shown: the buttons going quiet is not only seen.
	await expect(page.locator('main > [role="status"]')).toHaveText(
		'Price feed delayed. Nothing can be locked in until it catches up.',
	);
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
