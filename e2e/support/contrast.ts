/**
 * Contrast of text axe does not judge. axe skips what is hidden from
 * assistive technology, and the chart tooltip is (its reading is spoken by
 * the inspector's value text instead) - but it is on screen for everyone
 * else, so its contrast is checked here, against WCAG 1.4.3's 4.5:1.
 */

import { expect, type Locator } from '@playwright/test';

/** WCAG 1.4.3: normal text. */
export const MIN_TEXT_CONTRAST = 4.5;

/**
 * The contrast between an element's text colour and the first opaque
 * background behind it, as the browser computed and drew them.
 */
export function contrastOf(locator: Locator): Promise<number> {
	return locator.evaluate((el) => {
		// Any CSS colour the browser can compute, as sRGB 0-255 with alpha.
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const ctx = canvas.getContext('2d', {
			willReadFrequently: true,
		})!;
		const rgba = (css: string) => {
			ctx.clearRect(0, 0, 1, 1);
			ctx.fillStyle = '#000';
			ctx.fillStyle = css;
			ctx.fillRect(0, 0, 1, 1);
			const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
			return {
				r,
				g,
				b,
				a: a / 255,
			};
		};
		const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
			const [lr, lg, lb] = [r, g, b].map((v) => {
				const c = v / 255;
				return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
		};

		let background: ReturnType<typeof rgba> | null = null;
		for (
			let node: Element | null = el;
			node && !background;
			node = node.parentElement
		) {
			const color = rgba(getComputedStyle(node).backgroundColor);
			if (color.a === 1) {
				background = color;
			}
		}
		if (!background) {
			throw new Error('no opaque background behind the text');
		}
		const text = rgba(getComputedStyle(el).color);
		const [a, b] = [luminance(text), luminance(background)].sort(
			(x, y) => y - x,
		);
		return (a + 0.05) / (b + 0.05);
	});
}

/** Every matching element reads at 4.5:1 or better. */
export async function expectReadable(locator: Locator) {
	const count = await locator.count();
	expect(count, 'no text to check').toBeGreaterThan(0);
	for (let i = 0; i < count; i++) {
		const element = locator.nth(i);
		const text = (await element.textContent())?.trim();
		expect(
			await contrastOf(element),
			`"${text}" is too faint to read`,
		).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
	}
}
