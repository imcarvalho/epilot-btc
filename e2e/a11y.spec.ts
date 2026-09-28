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
 * is checked by the structure tests at the end.
 */

import { expect, test, type Page } from '@playwright/test';
import { expectNoViolations } from './support/axe';
import { lockGuessAgo, playerIdOf, seedBoard } from './support/db';

/** The screen with its price and its hour of candles in. */
async function openGame(page: Page) {
	await page.goto('/');
	await expect(page.getByText(/Updated \d+s ago/)).toBeVisible({
		timeout: 30_000,
	});
	await expect(
		page.getByRole('slider', {
			name: 'Last hour, minute by minute',
		}),
	).toBeVisible({
		timeout: 30_000,
	});
}

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

test('first visit, at phone width', async ({ page }) => {
	await page.setViewportSize({
		width: 390,
		height: 844,
	});
	await openGame(page);
	await expectNoViolations(page);
});

/** Nothing wider than the viewport, so nothing needs a sideways scroll. */
async function expectNoSidewaysScroll(page: Page) {
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
}

test('at 320 px, nothing scrolls sideways and history prices are whole (WCAG 1.4.10)', async ({
	page,
}) => {
	await page.setViewportSize({
		width: 320,
		height: 640,
	});
	await openGame(page);
	await expectNoSidewaysScroll(page);

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

test('a guess in play, on the live minute', async ({ page }) => {
	await openGame(page);
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
	await expectNoViolations(page);
});

for (const [direction, headline] of [
	['up', 'Correct.'],
	['down', 'Not this time.'],
] as const) {
	test(`the result: ${headline}`, async ({ page }) => {
		await openGame(page);
		// A guess five seconds from its minute, at a price the market has left.
		await lockGuessAgo(await playerIdOf(page), direction, 55_000);
		await page.reload();
		await expect(page.getByText(headline).first()).toBeVisible({
			timeout: 30_000,
		});
		await expectNoViolations(page);
	});
}

test.describe('structure a screen reader navigates by', () => {
	test('a banner with the page title, then the main content', async ({
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
	});

	test('every panel is a region with a heading', async ({ page }) => {
		await openGame(page);
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

	test('the countdown is a timer, and the chosen button reads as a sentence', async ({
		page,
	}) => {
		await openGame(page);
		await expect(
			page.getByRole('button', {
				name: 'Higher, in 60 seconds',
			}),
		).toBeVisible();
		await page
			.getByRole('button', {
				name: /Higher/,
			})
			.click();
		await expect(page.getByRole('timer').first()).toBeVisible();
		await expect(
			page.getByRole('button', {
				name: 'Higher, your guess is in play',
			}),
		).toBeDisabled();
	});

	test('a guess made by keyboard keeps focus on its button, and the hint is still reachable', async ({
		page,
	}) => {
		await openGame(page);
		await page
			.getByRole('button', {
				name: 'Higher, in 60 seconds',
			})
			.focus();
		await page.keyboard.press('Enter');
		await expect(
			page.getByRole('button', {
				name: 'Higher, your guess is in play',
			}),
		).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(
			page.getByRole('button', {
				name: 'Lower, one guess at a time',
			}),
		).toBeFocused();
	});

	test('when the control holding focus goes away at the result, focus lands on the result', async ({
		page,
	}) => {
		await openGame(page);
		await lockGuessAgo(await playerIdOf(page), 'up', 55_000);
		await page.reload();
		// The view toggle exists only while a guess is in play.
		const toggle = page.getByRole('radio', {
			name: 'This guess',
		});
		await toggle.focus();
		await expect(toggle).toBeFocused();
		await expect(page.getByText('Correct.').first()).toBeVisible({
			timeout: 30_000,
		});
		await expect(toggle).toHaveCount(0);
		await expect(page.locator(':focus')).toContainText('Correct.');
	});

	test('a guess that does not go through is announced, every time', async ({
		page,
	}) => {
		await openGame(page);
		await page.route('**/api/guess', (route) =>
			route.fulfill({
				status: 500,
				body: '{}',
			}),
		);
		// Record every text the one announcer is given: a screen reader speaks
		// on each change, so what is recorded is what is heard.
		await page.evaluate(() => {
			const region = document.querySelector('main > [role="status"]')!;
			const said: string[] = [];
			(window as unknown as { said: string[] }).said = said;
			new MutationObserver(() => {
				if (region.textContent) {
					said.push(region.textContent);
				}
			}).observe(region, {
				childList: true,
				characterData: true,
				subtree: true,
			});
		});
		const higher = page.getByRole('button', {
			name: /Higher/,
		});
		const message = 'That guess did not go through. Try again.';
		for (let attempt = 1; attempt <= 2; attempt++) {
			await higher.click();
			await expect
				.poll(() =>
					page.evaluate(() => (window as unknown as { said: string[] }).said),
				)
				.toEqual(Array(attempt).fill(message));
		}
	});
});
