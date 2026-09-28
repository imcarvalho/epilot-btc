/**
 * Colour contrast of the design language, checked at the source: every text
 * or UI colour against every background it is actually drawn on, from the
 * theme's resolved tokens and the app's own palette. WCAG 2.2 AA: 4.5:1 for
 * text, 3:1 for large text and for the non-text parts that carry meaning
 * (chart marks, the focus ring). Disabled controls are exempt (1.4.3), and so
 * are purely decorative marks.
 *
 * The browser-side axe scan (e2e/a11y.spec.ts) checks the rendered screen;
 * this checks the tokens themselves, instantly and without a browser, so a
 * colour change that breaks contrast fails here first.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { draculaTheme } from '@/themes/dracula.theme';
import { AA_LARGE, AA_TEXT, contrastRatio } from '@/lib/contrast';

const token = (name: string): string => {
	const value = (draculaTheme.tokens as Record<string, string>)[name];
	if (!value) {
		throw new Error(`no theme token ${name}`);
	}
	return value;
};

/**
 * `tokens.stylex.ts` is compiled away by StyleX, so it cannot be imported
 * at runtime: its values are read from the source instead.
 */
const palette: Record<string, string> = Object.fromEntries(
	[
		...readFileSync(join(__dirname, 'tokens.stylex.ts'), 'utf8').matchAll(
			/^\s*(\w+): '(#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\))',$/gm,
		),
	].map(([, name, value]) => [name, value]),
);

const components = draculaTheme.components as Record<
	string,
	Record<string, Record<string, string>>
>;

// Grounds
const body = token('--color-background-body');
const card = token('--color-background-card');
const popover = token('--color-background-popover');
const muted = token('--color-background-muted');
/** The chart's tags and tooltip (chart-parts.styles.ts). */
const chartTag = '#16171F';
/** Panel tones sit on the page, in place of the card colour (Panel.styles.ts). */
const winPanel = ['rgba(125, 251, 170, 0.06)', body];
const lossPanel = ['rgba(255, 138, 138, 0.06)', body];
const warningPanel = ['rgba(241, 250, 140, 0.04)', body];

interface Pair {
	where: string;
	fg: string | string[];
	bg: string | string[];
	min: number;
}

const text = (
	where: string,
	fg: string,
	bgs: Record<string, string | string[]>,
): Pair[] =>
	Object.entries(bgs).map(([on, bg]) => ({
		where: `${where}, on ${on}`,
		fg,
		bg,
		min: AA_TEXT,
	}));

const pairs: Pair[] = [
	// Body copy
	...text('primary text', token('--color-text-primary'), {
		body,
		card,
		popover,
		muted,
		'the chart tooltip': chartTag,
	}),
	...text('secondary text', token('--color-text-secondary'), {
		body,
		card,
		popover,
		muted,
		'the chart tooltip': chartTag,
	}),
	{
		where: 'the chart-view toggle, unselected option',
		fg: token('--color-text-secondary'),
		bg: [token('--color-neutral'), card],
		min: AA_TEXT,
	},
	...text('accent text (strip, price card)', palette.purple, {
		body,
		card,
	}),

	// Status and direction colours used as text
	...text('warning text (stale feed, locked price)', palette.yellow, {
		body,
		card,
		'the warning panel': warningPanel,
		'the locked-in tag': chartTag,
	}),
	...text('error text (loss, negative score)', token('--color-error'), {
		body,
		card,
		'the loss panel': lossPanel,
		'the chart tag': chartTag,
	}),
	...text('up text (win, positive score)', palette.upFrom, {
		body,
		card,
		'the win panel': winPanel,
		'the chart tag': chartTag,
	}),
	...text('"Lower" in the history', palette.downTo, {
		card,
	}),
	{
		where: 'the hour-change badge, up',
		fg: palette.upFrom,
		bg: [palette.upWash, card],
		min: AA_TEXT,
	},
	{
		where: 'the hour-change badge, down',
		fg: palette.downFrom,
		bg: [palette.downWash, card],
		min: AA_TEXT,
	},
	{
		where: 'the hour-change badge, flat',
		fg: palette.yellow,
		bg: ['rgba(241, 250, 140, 0.1)', card],
		min: AA_TEXT,
	},

	// Ink on the two hero gradients, checked at both ends of each
	...['upFrom', 'upTo', 'downFrom', 'downTo'].flatMap((end) => [
		{
			where: `the hero button word, on ${end}`,
			fg: palette.ink,
			bg: palette[end],
			min: AA_TEXT,
		},
		{
			where: `the hero button hint, on ${end}`,
			fg: palette.inkSoft,
			bg: palette[end],
			min: AA_TEXT,
		},
	]),

	// Astryx components as themed
	{
		where: 'the avatar initials',
		fg: components['avatar-fallback'].base.color,
		bg: components['avatar-fallback'].base.backgroundColor,
		min: AA_TEXT,
	},
	{
		where: 'secondary buttons (sign in, sign out)',
		fg: components.button['variant:secondary'].color,
		bg: components.button['variant:secondary'].backgroundColor,
		min: AA_TEXT,
	},
	{
		where: 'primary buttons',
		fg: token('--color-on-accent'),
		bg: token('--color-accent'),
		min: AA_TEXT,
	},
	...(['success', 'error', 'warning'] as const).map((status) => ({
		where: `text on a solid ${status} fill`,
		fg: token(`--color-on-${status}`),
		bg: token(`--color-${status}`),
		min: AA_TEXT,
	})),

	// Non-text marks that carry meaning (1.4.11): 3:1 against the card
	{
		where: 'up candles',
		fg: palette.upFrom,
		bg: card,
		min: AA_LARGE,
	},
	{
		where: 'down candles',
		fg: palette.downFrom,
		bg: card,
		min: AA_LARGE,
	},
	{
		where: 'the locked-in line',
		fg: palette.yellow,
		bg: card,
		min: AA_LARGE,
	},
	{
		where: 'the minute line, behind',
		fg: token('--color-error'),
		bg: card,
		min: AA_LARGE,
	},
	{
		where: 'the focus ring, on the card',
		fg: palette.purple,
		bg: card,
		min: AA_LARGE,
	},
	{
		where: 'the focus ring, on the page',
		fg: palette.purple,
		bg: body,
		min: AA_LARGE,
	},
];

describe('colour contrast of the design tokens (WCAG 2.2 AA)', () => {
	it('reads every palette value it checks', () => {
		for (const name of [
			'purple',
			'yellow',
			'upFrom',
			'upTo',
			'downFrom',
			'downTo',
			'upWash',
			'downWash',
			'ink',
			'inkSoft',
		]) {
			expect(palette[name], name).toBeDefined();
		}
	});

	it.each(pairs)('$where: at least $min:1', ({ fg, bg, min }) => {
		expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
	});
});
