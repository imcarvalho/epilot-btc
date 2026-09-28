/**
 * WCAG 2 contrast, as pure functions: relative luminance and the contrast
 * ratio between two colours, with translucent colours composited over what
 * sits behind them first - several of the screen's washes are translucent.
 *
 * https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 */

export interface Rgba {
	r: number;
	g: number;
	b: number;
	/** 0 to 1. */
	a: number;
}

/** WCAG 2.2 AA: normal text. */
export const AA_TEXT = 4.5;
/** WCAG 2.2 AA: large text (24px, or 18.66px bold) and non-text UI parts. */
export const AA_LARGE = 3;

/** `#RGB`, `#RRGGBB`, `#RRGGBBAA` or `rgba(r, g, b, a)` / `rgb(r, g, b)`. */
export function parseColor(value: string): Rgba {
	const v = value.trim();
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v);
	if (hex) {
		const h =
			hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
		return {
			r: parseInt(h.slice(0, 2), 16),
			g: parseInt(h.slice(2, 4), 16),
			b: parseInt(h.slice(4, 6), 16),
			a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
		};
	}
	const fn =
		/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
			v,
		);
	if (fn) {
		return {
			r: Number(fn[1]),
			g: Number(fn[2]),
			b: Number(fn[3]),
			a: fn[4] === undefined ? 1 : Number(fn[4]),
		};
	}
	throw new Error(`not a colour this parser reads: ${value}`);
}

/** `top` painted over `bottom`; the result is opaque when `bottom` is. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
	const a = top.a + bottom.a * (1 - top.a);
	if (a === 0) {
		return {
			r: 0,
			g: 0,
			b: 0,
			a: 0,
		};
	}
	const mix = (t: number, b: number) =>
		(t * top.a + b * bottom.a * (1 - top.a)) / a;
	return {
		r: mix(top.r, bottom.r),
		g: mix(top.g, bottom.g),
		b: mix(top.b, bottom.b),
		a,
	};
}

/** Relative luminance of an opaque colour, 0 (black) to 1 (white). */
export function relativeLuminance({ r, g, b }: Rgba): number {
	const channel = (c: number) => {
		const s = c / 255;
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Contrast of `foreground` on `background`, 1 to 21. Each is given as a
 * stack, top first, ending in an opaque colour: `['#FF8A8A26', '#21222C']`
 * is the error wash over a card.
 */
export function contrastRatio(
	foreground: string | string[],
	background: string | string[],
): number {
	const bg = flatten(background);
	const fg = composite(flatten(foreground, false), bg);
	const [hi, lo] = [relativeLuminance(fg), relativeLuminance(bg)].sort(
		(x, y) => y - x,
	);
	return (hi + 0.05) / (lo + 0.05);
}

/** A stack of colours, top first, composited into one. */
function flatten(stack: string | string[], mustBeOpaque = true): Rgba {
	const layers = (Array.isArray(stack) ? stack : [stack]).map(parseColor);
	const result = layers.reduceRight((below, above) => composite(above, below));
	if (mustBeOpaque && result.a < 1) {
		throw new Error(
			`background ${String(stack)} is translucent: end it with an opaque colour`,
		);
	}
	return result;
}
