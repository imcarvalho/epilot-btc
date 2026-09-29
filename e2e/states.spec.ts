/**
 * The screen in the states a player can be in beyond the first visit, each
 * checked with axe against WCAG 2.2 A and AA and for what a screen reader is
 * told, then the journeys a keyboard makes.
 *
 * One pass at desktop width: the sentences themselves are unit-tested
 * (src/lib/guess-phase.test.ts), so these check that the screen shows and
 * announces them, and that the state passes axe. Phone width is one
 * critical-path test in a11y.spec.ts. Tests that need the same setup are
 * one test, since the setup (a settled guess waits out its minute) is what
 * costs the time.
 *
 * Also in a11y.spec.ts: the first visit, a guess settled while away, and
 * the structure a screen reader navigates by. The outage states are in
 * outage.spec.ts.
 */

import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './support/auth';
import { expectNoViolations } from './support/axe';
import { expectReadable } from './support/contrast';
import { lockGuessAgo, playerIdOf, seedBoard } from './support/db';
import { LIVE_COINBASE, holdMarketFlat, releaseMarket } from './support/market';
import { announced, openGame, shown } from './support/screen';

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

test('a guess made by keyboard: locked, focus stays on its button, the countdown runs', async ({
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
			name: 'Higher, in 60 seconds',
		})
		.focus();
	await page.keyboard.press('Enter');

	const higher = page.getByRole('button', {
		name: 'Higher, your guess is in play',
	});
	await expect(higher).toBeDisabled();
	await expect(page.getByRole('timer').first()).toBeVisible();
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
	// Focus stays on the button it was pressed on, and Tab reaches the hint.
	await expect(higher).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(
		page.getByRole('button', {
			name: 'Lower, one guess at a time',
		}),
	).toBeFocused();
	await expectNoViolations(page);
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
	await expectNoViolations(page);
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
	await expectNoViolations(page);
});

test('a win: said as one, focus lands on the result, the history row reads as a sentence', async ({
	page,
}) => {
	await openGame(page);
	await lockGuessAgo(await playerIdOf(page), 'up', 55_000);
	await page.reload();

	// The view toggle exists only while a guess is in play, so this control
	// holds focus until the result takes it away.
	const toggle = page.getByRole('radio', {
		name: 'This guess',
	});
	await toggle.focus();
	await expect(toggle).toBeFocused();

	await expect(announced(page)).toHaveText(
		'Correct. The price went up. Score 1.',
		{
			timeout: 30_000,
		},
	);
	await expect(toggle).toHaveCount(0);
	await expect(page.locator(':focus')).toContainText('Correct.');

	// A list item's aria-label is not reliably read (NVDA in browse mode reads
	// the content), so each row has to read as a sentence from its content:
	// arrows and signs hidden, words in their place.
	const row = page
		.getByRole('region', {
			name: 'Your last guesses',
		})
		.getByRole('listitem')
		.first();
	await expect(row).not.toHaveAttribute('aria-label');
	expect(await row.ariaSnapshot()).toMatch(
		/^- listitem: \d{2}:\d{2} ?, Higher [\d,]+\.\d{2} to [\d,]+\.\d{2} correct plus 1$/,
	);
	await expectNoViolations(page);
});

test('the game cannot be reached: said, and "Try again" works from the keyboard', async ({
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
	await expect(announced(page)).toHaveText(UNREACHABLE);
	await expectNoViolations(page);

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

test('a guess that does not go through: said beside the buttons, and announced every time', async ({
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
	const sentence = 'That guess did not go through. Try again.';
	for (let attempt = 1; attempt <= 2; attempt++) {
		await higher.click();
		await expect
			.poll(() =>
				page.evaluate(() => (window as unknown as { said: string[] }).said),
			)
			.toEqual(Array(attempt).fill(sentence));
	}
	await expect(shown(page, sentence)).toBeVisible();
	await expectNoViolations(page);
});

test('signed in, just now: the notice, the sign-out button, your own row, and dismissing keeps focus on the game', async ({
	page,
}) => {
	await signInAs(page, 'e2e-user', {
		justSignedIn: true,
	});
	await openGame(page);

	await expect(
		page.getByText(
			'Your score starts again from 0, because the board counts only what you play while signed in, and it now follows you to any device.',
		),
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
	const board = page.getByRole('region', {
		name: 'Leaderboard',
	});
	await expect(
		board.getByRole('listitem').filter({
			hasText: 'you',
		}),
	).toContainText('E2ESignedIn');
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
	await expectNoViolations(page);

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

		// The group names the chart it swaps, in either view.
		const toggle = page.getByRole('radiogroup', {
			name: 'Chart view',
		});
		await expect(toggle).toHaveAttribute('aria-controls', 'price-chart');
		await expect(
			page.locator('#price-chart').getByRole('slider'),
		).toBeVisible();

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
			page.locator('#price-chart').getByRole('slider', {
				name: 'This guess, second by second',
			}),
		).toBeVisible();
	});
});
