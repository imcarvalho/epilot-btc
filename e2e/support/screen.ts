/** What every accessibility test does first, and one check they share. */

import { expect, type Page } from '@playwright/test';

/** The screen with its price and its hour of candles in. */
export async function openGame(page: Page) {
	await page.goto('/');
	await expect(
		page.getByText(/^\$\d{1,3}(,\d{3})*\.\d{2}$/).first(),
	).toBeVisible({
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

/** Nothing wider than the viewport, so nothing needs a sideways scroll (WCAG 1.4.10). */
export async function expectNoSidewaysScroll(page: Page) {
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
}

/** The text of the one `aria-live` region: what a screen reader was last told. */
export const announced = (page: Page) => page.locator('main > [role="status"]');

/**
 * Text as it is drawn on the screen, not as the live region repeats it: the
 * announcer holds the same sentences, so a bare `getByText` finds two.
 */
export const shown = (page: Page, text: string) =>
	page
		.getByText(text, {
			exact: true,
		})
		.and(page.locator(':not([role="status"])'));
