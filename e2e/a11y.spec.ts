/**
 * Accessibility of the real screen, state by state: axe-core against WCAG
 * 2.2 A and AA, which includes colour contrast as the browser actually
 * renders it - text over translucent washes and the chart's own tags
 * included.
 *
 * axe cannot judge text on a gradient (the two hero buttons), so it reports
 * those as "needs review" rather than failures; the ink on both ends of each
 * gradient is checked by src/components/ui/contrast.test.ts instead.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { lockGuessAgo, playerIdOf, seedBoard } from './support/db';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Runs axe and fails with every violation spelled out, not a count. */
async function expectNoViolations(page: Page) {
	const { violations } = await new AxeBuilder({
		page,
	})
		.withTags(WCAG)
		.analyze();
	const report = violations.map(
		(v) =>
			`${v.id} (${v.impact}): ${v.help}\n${v.nodes
				.map((n) => `  ${n.target.join(' ')}\n    ${n.failureSummary}`)
				.join('\n')}`,
	);
	expect(report, report.join('\n\n')).toEqual([]);
}

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
