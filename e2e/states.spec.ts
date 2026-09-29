/**
 * The screen in every state a player can be in, each checked the way the
 * first visit is: axe against WCAG 2.2 A and AA, nothing that needs a sideways
 * scroll (WCAG 1.4.10), and what a screen reader is told - at desktop width,
 * at 390 px and at 320 px. Then the journeys a keyboard makes.
 *
 * The states already covered in a11y.spec.ts are the first visit, a guess on
 * the live minute, a win and a loss, and a guess settled while away; the
 * outage states are in outage.spec.ts. These are the rest: time up, the game
 * unreachable, a guess that did not go through, a signed-in player, and the
 * chart read by pointer.
 */

import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './support/auth';
import { expectNoViolations } from './support/axe';
import { expectReadable } from './support/contrast';
import { lockGuessAgo, playerIdOf, seedBoard } from './support/db';
import { LIVE_COINBASE, holdMarketFlat, releaseMarket } from './support/market';
import {
	announced,
	expectNoSidewaysScroll,
	openGame,
	shown,
} from './support/screen';

const VIEWPORTS = [
	['desktop', 1280, 800],
	['at 390 px', 390, 844],
	['at 320 px', 320, 640],
] as const;

const UNREACHABLE =
	'The game could not be reached. Nothing has been lost: your score is kept on the server. Try again in a moment.';

test.beforeAll(async () => {
	await seedBoard();
});

test.afterEach(async () => {
	if (!LIVE_COINBASE) {
		await releaseMarket();
	}
});

/** Both checks every state gets. */
async function expectAccessible(page: Page) {
	await expectNoSidewaysScroll(page);
	await expectNoViolations(page);
}

/** Blocks the ticket for the game stream, so the game cannot be reached. */
const cutOffTheGame = (page: Page) =>
	page.route('**/api/stream-token', (route) =>
		route.fulfill({
			status: 500,
			body: '{}',
		}),
	);

for (const [where, width, height] of VIEWPORTS) {
	test.describe(where, () => {
		test.use({
			viewport: {
				width,
				height,
			},
		});

		test('a guess in play is announced as locked, with the countdown running', async ({
			page,
		}) => {
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
			await expect(announced(page)).toHaveText(
				/^Locked at \$[\d,]+\.\d{2}\. \d+s to go\.$/,
			);
			await expectAccessible(page);
		});

		test('time is up, waiting for a price that has not changed', async ({
			page,
		}) => {
			test.skip(LIVE_COINBASE, 'needs the fake market, which can be held flat');
			const price = 61_234.5;
			await holdMarketFlat(price, Date.now() - 120_000);
			await openGame(page);
			await lockGuessAgo(await playerIdOf(page), 'up', 61_000, price);
			await page.reload();

			const sentence = 'Time is up - waiting for the price to change.';
			await expect(shown(page, sentence)).toBeVisible({
				timeout: 30_000,
			});
			await expect(announced(page)).toHaveText(sentence);
			await expectAccessible(page);
		});

		test('a loss, said as one', async ({ page }) => {
			await openGame(page);
			await lockGuessAgo(await playerIdOf(page), 'down', 55_000);
			await page.reload();
			await expect(announced(page)).toHaveText(
				'Not this time. The price went up. Score -1.',
				{
					timeout: 30_000,
				},
			);
			await expectAccessible(page);
		});

		test('a win, said as one', async ({ page }) => {
			await openGame(page);
			await lockGuessAgo(await playerIdOf(page), 'up', 55_000);
			await page.reload();
			await expect(announced(page)).toHaveText(
				'Correct. The price went up. Score 1.',
				{
					timeout: 30_000,
				},
			);
			await expectAccessible(page);
		});

		test('the game cannot be reached: said on screen and to a screen reader', async ({
			page,
		}) => {
			await cutOffTheGame(page);
			await page.goto('/');

			await expect(shown(page, 'The game could not be reached.')).toBeVisible({
				timeout: 30_000,
			});
			await expect(announced(page)).toHaveText(UNREACHABLE);
			await expect(
				page.getByRole('button', {
					name: 'Try again',
				}),
			).toBeVisible();
			await expectAccessible(page);
		});

		test('a guess that does not go through, said beside the buttons', async ({
			page,
		}) => {
			await openGame(page);
			await page.route('**/api/guess', (route) =>
				route.fulfill({
					status: 500,
					body: '{}',
				}),
			);
			await page
				.getByRole('button', {
					name: /Higher/,
				})
				.click();

			const sentence = 'That guess did not go through. Try again.';
			await expect(shown(page, sentence)).toBeVisible();
			await expect(announced(page)).toHaveText(sentence);
			await expectAccessible(page);
		});

		test('signed in, just now: the notice, the sign-out button, your own row', async ({
			page,
		}) => {
			await signInAs(page, 'e2e-user', {
				justSignedIn: true,
			});
			await openGame(page);

			await expect(
				page.getByText('Signed in. Your score now follows you to any device.'),
			).toBeVisible();
			await expect(
				page.getByRole('button', {
					name: 'Sign out',
				}),
			).toBeVisible();
			await expect(
				page.getByRole('button', {
					name: 'Sign in to save your score',
				}),
			).toHaveCount(0);
			await expect(
				page
					.getByRole('region', {
						name: 'Leaderboard',
					})
					.getByRole('listitem')
					.filter({
						hasText: 'you',
					}),
			).toContainText('E2ESignedIn');
			const board = page.getByRole('region', {
				name: 'Leaderboard',
			});
			await expect(
				board.getByText('Player', {
					exact: true,
				}),
			).toBeVisible();
			await expect(
				board.getByText('Score', {
					exact: true,
				}),
			).toBeVisible();
			await expectAccessible(page);
		});
	});
}

/** The tooltip's title, labels and values. */
const tooltipText = (page: Page) =>
	page
		.locator('[aria-hidden="true"]:has(> dl)')
		.locator('dt, dd, :scope > div:first-child');

test.describe('the chart, read by pointer', () => {
	test('hovering shows the tooltip: the page passes axe and the tooltip text is readable', async ({
		page,
	}) => {
		await openGame(page);
		const inspector = page.getByRole('slider', {
			name: 'Last hour, minute by minute',
		});
		const box = (await inspector.boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

		// The tooltip's rows: what the minute opened, reached and closed at.
		for (const label of ['Open', 'High', 'Low']) {
			await expect(
				page.getByText(label, {
					exact: true,
				}),
			).toBeVisible();
		}
		await expectNoViolations(page);
		// axe skips the tooltip (it is hidden from assistive technology, the
		// inspector speaks the same reading), so its text is checked directly.
		await expectReadable(tooltipText(page));
	});

	test('on the live minute, the same holds', async ({ page }) => {
		await openGame(page);
		await page
			.getByRole('button', {
				name: /Higher/,
			})
			.click();
		const inspector = page.getByRole('slider', {
			name: 'This guess, second by second',
		});
		await expect(inspector).toBeVisible({
			timeout: 30_000,
		});
		// Some seconds of price to point at.
		await page.waitForTimeout(3_000);
		const box = (await inspector.boundingBox())!;
		await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
		await expect(page.locator('dt').first()).toBeVisible();
		await expectNoViolations(page);
		await expectReadable(tooltipText(page));
	});
});

/** Which control has focus, as a screen reader would name it. */
const focusedName = (page: Page) =>
	page.evaluate(() => {
		const el = document.activeElement as HTMLElement | null;
		if (!el || el === document.body) {
			return 'the page';
		}
		return el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';
	});

test.describe('by keyboard', () => {
	test('Tab reaches each control once, in reading order, then leaves the page', async ({
		page,
	}) => {
		await openGame(page);
		const order: string[] = [];
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('Tab');
			order.push(await focusedName(page));
		}
		expect(order).toEqual([
			'Sign in to save your score',
			'Last hour, minute by minute',
			'Higher, in 60 seconds',
			'Lower, in 60 seconds',
			'the page',
		]);
	});

	test('the view toggle is a radio group: arrows switch between the guess and the hour', async ({
		page,
	}) => {
		await openGame(page);
		await page
			.getByRole('button', {
				name: 'Higher, in 60 seconds',
			})
			.focus();
		await page.keyboard.press('Enter');
		const guess = page.getByRole('radio', {
			name: 'This guess',
		});
		const hour = page.getByRole('radio', {
			name: 'Last hour',
		});
		await expect(guess).toBeChecked();

		await guess.focus();
		await page.keyboard.press('ArrowLeft');
		await expect(hour).toBeChecked();
		await expect(hour).toBeFocused();
		await expect(
			page.getByRole('slider', {
				name: 'Last hour, minute by minute',
			}),
		).toBeVisible();

		await page.keyboard.press('ArrowRight');
		await expect(guess).toBeChecked();
		await expect(
			page.getByRole('slider', {
				name: 'This guess, second by second',
			}),
		).toBeVisible();
	});

	test('"Try again" on the unreachable panel works from the keyboard, and focus lands on the game', async ({
		page,
	}) => {
		let blocked = true;
		await page.route('**/api/stream-token', (route) =>
			blocked
				? route.fulfill({
						status: 500,
						body: '{}',
					})
				: route.continue(),
		);
		await page.goto('/');
		await expect(shown(page, 'The game could not be reached.')).toBeVisible({
			timeout: 30_000,
		});

		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await expect(
			page.getByRole('button', {
				name: 'Try again',
			}),
		).toBeFocused();

		blocked = false;
		await page.keyboard.press('Enter');
		await expect(
			page.getByText(/^\$\d{1,3}(,\d{3})*\.\d{2}$/).first(),
		).toBeVisible({
			timeout: 30_000,
		});
		// The panel that held focus is gone: focus goes to the guess, not the page.
		await expect(page.locator(':focus')).toContainText(
			'Will BTC be higher or lower in a minute?',
		);
	});

	test('dismissing the sign-in notice keeps focus on the game', async ({
		page,
	}) => {
		await signInAs(page, 'e2e-user', {
			justSignedIn: true,
		});
		await openGame(page);
		const dismiss = page.getByRole('button', {
			name: 'Dismiss',
		});
		await dismiss.focus();

		await page.keyboard.press('Enter');

		await expect(dismiss).toHaveCount(0);
		await expect(page.locator(':focus')).toContainText(
			'Will BTC be higher or lower in a minute?',
		);
	});
});
