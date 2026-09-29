/**
 * Accessibility of the real screen, state by state: axe-core against WCAG
 * 2.2 A and AA, which includes colour contrast as the browser actually
 * renders it - text over translucent washes and the chart's own tags
 * included.
 *
 * axe cannot judge text on a gradient (the two hero buttons): it reports
 * those as "needs review" rather than as failures, so they are not covered
 * here.
 *
 * axe's best-practice rules run too (one h1, landmarks). What no scanner can
 * see - that a landmark is where it belongs, that a failure is announced -
 * is checked by the structure tests at the end. The states after a guess
 * (in play, a result, time up, errors, signed in) are in states.spec.ts.
 */

import { expect, test } from '@playwright/test';
import { expectNoViolations } from './support/axe';
import { expectNoSidewaysScroll, openGame } from './support/screen';
import {
	lockGuessAgo,
	playerIdOf,
	seedBoard,
	setCachedCandles,
} from './support/db';

test.beforeAll(async () => {
	await seedBoard();
});

test('first visit: the empty history, the board, both buttons ready', async ({
	page,
}) => {
	await openGame(page);
	await expect(page.getByText('Make your first guess.')).toBeVisible();
	await expectNoViolations(page);
});

/**
 * The critical path at the narrowest width (320 px is the strictest, so 390
 * is covered by it): the first visit, a settled guess whose history prices
 * are drawn whole, and a guess in play. Each step must pass axe and need no
 * sideways scroll (WCAG 1.4.10).
 */
test('at 320 px, the critical path: first visit, a result, a guess in play', async ({
	page,
}) => {
	await page.setViewportSize({
		width: 320,
		height: 640,
	});
	await openGame(page);
	await expectNoSidewaysScroll(page);
	await expectNoViolations(page);

	// A settled guess, so the history has a row with both its prices.
	await lockGuessAgo(await playerIdOf(page), 'up', 55_000);
	await page.reload();
	await expect(page.getByText('Correct.').first()).toBeVisible({
		timeout: 30_000,
	});
	const row = page
		.getByRole('region', {
			name: 'Your last guesses',
		})
		.getByRole('listitem')
		.first();
	await expect(row).toContainText('→');
	await expectNoSidewaysScroll(page);
	// Every piece of the row is drawn whole, none cut off by its column.
	expect(
		await row.evaluate((li) =>
			Array.from(li.children).every(
				(child) =>
					child.scrollWidth <= child.clientWidth &&
					child.getBoundingClientRect().right <=
						li.getBoundingClientRect().right,
			),
		),
	).toBe(true);
	await expectNoViolations(page);

	await page
		.getByRole('button', {
			name: /Higher/,
		})
		.click();
	await expect(
		page.getByRole('slider', {
			name: 'This guess, second by second',
		}),
	).toBeVisible({
		timeout: 30_000,
	});
	await expectNoSidewaysScroll(page);
	await expectNoViolations(page);
});

test('the chart inspector, reached by keyboard', async ({ page }) => {
	await openGame(page);
	const inspector = page.getByRole('slider', {
		name: 'Last hour, minute by minute',
	});
	await inspector.focus();
	await page.keyboard.press('ArrowLeft');
	await expect(inspector).toHaveAttribute('aria-valuetext', /opened at/);
	await expectNoViolations(page);
});

test('a guess settled while away: said once, then idle', async ({ page }) => {
	await openGame(page);
	// Past its minute before the page opens again, so this visit never sees
	// it pending: the first state read settles it.
	await lockGuessAgo(await playerIdOf(page), 'up', 120_000);
	await page.reload();
	const sentence = 'While you were away: your up guess was correct.';
	// Exact: the live region holds the same words with the score change.
	const banner = page.getByText(sentence, {
		exact: true,
	});
	await expect(banner).toBeVisible({
		timeout: 30_000,
	});
	await expect(page.locator('main > [role="status"]')).toHaveText(
		`${sentence} +1.`,
	);
	await expectNoViolations(page);

	// Seen now: the next visit does not say it again.
	await openGame(page);
	await expect(page.getByText('No guess in play.')).toBeVisible();
	await expect(banner).toHaveCount(0);
});

test.describe('structure a screen reader navigates by', () => {
	// A focused slider is read aloud whenever its value changes, so the
	// inspector must change only when the player moves it - not when the
	// hour refreshes under it (WCAG 4.1.3, 2.2.2).
	test('the focused chart inspector holds its minute while the hour refreshes', async ({
		page,
	}) => {
		// A made-up hour, put in the server's shared cache: each refresh drops
		// the oldest minute and moves the one still forming, as the real feed
		// does, so every candle shifts. Written fresh each time, so the server
		// serves it rather than fetching Coinbase, and the stream pushes it.
		let served = 0;
		const serveHour = async () => {
			const minute = Math.floor(Date.now() / 60_000) * 60;
			const rows = Array.from(
				{
					length: 60 - served,
				},
				(_, k) => {
					const open = 60_000 + (59 - k) * 10;
					const close = open + 5 + (k === 0 ? served : 0);
					return [minute - k * 60, open - 20, close + 20, open, close, 1];
				},
			);
			served += 1;
			await setCachedCandles({
				rows,
				updatedAt: Date.now(),
			});
		};
		await serveHour();
		await openGame(page);
		const hour = page.getByRole('img', {
			name: /over the last hour/,
		});
		const inspector = page.getByRole('slider', {
			name: 'Last hour, minute by minute',
		});
		await expect(hour).toHaveAttribute('aria-label', /from \$60,/);
		// The stream pushes the hour whenever the shared cache changes.
		const refresh = async () => {
			const before = await hour.getAttribute('aria-label');
			await serveHour();
			await expect(hour).not.toHaveAttribute('aria-label', before!);
		};

		// Focused on the minute still forming: its close moves on refresh.
		await inspector.focus();
		const forming = await inspector.getAttribute('aria-valuetext');
		await refresh();
		await expect(inspector).toHaveAttribute('aria-valuetext', forming!);

		await page.keyboard.press('ArrowLeft');
		const held = await inspector.getAttribute('aria-valuetext');
		const heldNow = await inspector.getAttribute('aria-valuenow');
		expect(held).not.toBe(forming);
		await refresh();
		await expect(inspector).toHaveAttribute('aria-valuetext', held!);
		await expect(inspector).toHaveAttribute('aria-valuenow', heldNow!);

		// Escape hides the tooltip and keeps the minute.
		await page.keyboard.press('Escape');
		await refresh();
		await expect(inspector).toHaveAttribute('aria-valuetext', held!);

		// The next steps move from the minute held, wherever it now sits.
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowRight');
		await expect(inspector).toHaveAttribute('aria-valuetext', held!);

		// Hand the chart back to Coinbase for the tests after this one.
		await setCachedCandles(null);
	});

	test('landmarks: a banner with the page title, the main content, a region with a heading per panel', async ({
		page,
	}) => {
		await openGame(page);
		const banner = page.getByRole('banner');
		await expect(banner).toHaveCount(1);
		await expect(
			banner.getByRole('heading', {
				level: 1,
				name: 'BTC Guess',
			}),
		).toBeVisible();
		await expect(page.getByRole('main')).toHaveCount(1);
		await expect(
			page.getByRole('main').getByRole('heading', {
				level: 1,
			}),
		).toHaveCount(0);

		for (const name of [
			'Bitcoin · US Dollar',
			'Leaderboard',
			'Your last guesses',
		]) {
			await expect(
				page
					.getByRole('region', {
						name,
					})
					.getByRole('heading', {
						level: 2,
						name,
					}),
			).toBeVisible();
		}
	});

	// A list item's aria-label is not reliably read (NVDA in browse mode reads
	// the content), so each row has to read as a sentence from its content:
	// arrows and signs hidden, words in their place. The history row is
	// checked in states.spec.ts, after a result.
	test('a board row reads as a sentence from its own content', async ({
		page,
	}) => {
		await openGame(page);
		const row = page
			.getByRole('region', {
				name: 'Leaderboard',
			})
			.getByRole('listitem')
			.first();
		await expect(row).toContainText('SolemnOtter');
		await expect(row).not.toHaveAttribute('aria-label');
		expect(await row.ariaSnapshot()).toMatch(
			/^- listitem: 1st SolemnOtter \d+% correct over 75 guesses 42 points$/,
		);
	});
});
