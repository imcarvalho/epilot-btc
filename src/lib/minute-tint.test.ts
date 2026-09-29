import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	contrastRatio,
	minuteTintPercent,
	mixSrgb,
	parseHex,
} from './minute-tint';

const root = path.resolve(import.meta.dirname, '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

/** A hex value from source text, so the test follows the tokens themselves. */
function hexOf(source: string, pattern: RegExp): string {
	const match = pattern.exec(source);
	if (!match) {
		throw new Error(`Token not found: ${pattern}`);
	}
	return match[1];
}

const theme = read('themes/dracula.theme.ts');
const palette = read('components/ui/tokens.stylex.ts');
const parts = read('components/game/charts/chart-parts.styles.ts');
const themeHex = (name: string) =>
	hexOf(theme, new RegExp(`'--color-${name}': '(#[0-9A-Fa-f]{6})'`));
const paletteHex = (name: string) =>
	hexOf(palette, new RegExp(`${name}: '(#[0-9A-Fa-f]{6})'`));

const card = parseHex(themeHex('background-card'));
const end = parseHex(paletteHex('minuteEnd'));

describe('minuteTintPercent', () => {
	const start = 1_000_000;

	it('starts at nothing and steps once a second', () => {
		expect(minuteTintPercent(start, start)).toBe(0);
		expect(minuteTintPercent(start, start + 999)).toBe(0);
		expect(minuteTintPercent(start, start + 1_000)).toBeCloseTo(100 / 60);
		expect(minuteTintPercent(start, start + 30_000)).toBe(50);
	});

	it('is whole at the end of the minute and stays there', () => {
		expect(minuteTintPercent(start, start + 60_000)).toBe(100);
		expect(minuteTintPercent(start, start + 95_000)).toBe(100);
	});

	it('holds at nothing when the server clock is behind the guess', () => {
		expect(minuteTintPercent(start, start - 4_000)).toBe(0);
		expect(minuteTintPercent(start, Number.NaN)).toBe(0);
	});
});

describe('mixSrgb', () => {
	it('is the first colour at 0 and the second at 100, clamped beyond', () => {
		expect(mixSrgb(card, end, 0)).toEqual(card);
		expect(mixSrgb(card, end, 100)).toEqual(end);
		expect(mixSrgb(card, end, 250)).toEqual(end);
		expect(mixSrgb(card, end, -5)).toEqual(card);
	});

	it('is halfway at 50', () => {
		expect(mixSrgb([0, 100, 200], [100, 200, 0], 50)).toEqual([50, 150, 100]);
	});
});

describe('contrastRatio', () => {
	it('is 21 for black on white and 1 for a colour on itself', () => {
		expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
		expect(contrastRatio(card, card)).toBe(1);
	});
});

describe('what is drawn over the minute chart, across the whole tint', () => {
	const steps = [0, 10, 25, 50, 75, 90, 100];
	const inks: Array<[string, string, number]> = [
		// Text: 4.5 to 1 (WCAG AA)
		[
			'y-axis labels and the note (text-secondary)',
			themeHex('text-secondary'),
			4.5,
		],
		// Graphics that carry meaning: 3 to 1 (WCAG 1.4.11)
		['ahead line and dot (upFrom)', paletteHex('upFrom'), 3],
		['behind line and dot (error)', themeHex('error'), 3],
		['level line and dot, locked-in line (yellow)', paletteHex('yellow'), 3],
		['offline line (text-disabled)', themeHex('text-disabled'), 3],
	];

	it('reads the locked-in line from the same yellow as the palette', () => {
		expect(parts).toContain('stroke: palette.yellow');
	});

	for (const [name, hex, minimum] of inks) {
		for (const percent of steps) {
			it(`${name} holds ${minimum}:1 at ${percent}%`, () => {
				const ground = mixSrgb(card, end, percent);
				expect(contrastRatio(parseHex(hex), ground)).toBeGreaterThanOrEqual(
					minimum,
				);
			});
		}
	}
});
