/**
 * The minute view's background tint (product spec §6.1): over the guess's
 * minute the chart's ground moves from the card colour to a dark red-brown,
 * one step a second. Pure, so the arithmetic and the contrast of everything
 * drawn over it are tested without a browser.
 */

/** The length of a guess, in milliseconds. */
export const MINUTE_MS = 60_000;

/**
 * How far into the minute the tint is, as a percentage in [0, 100]:
 * one step per elapsed second, so it moves exactly when the countdown does.
 * Clamped, so a server clock a little behind the guess reads 0 and a guess
 * past its minute (time up, waiting for the price) holds at 100.
 */
export function minuteTintPercent(createdAt: number, now: number): number {
	const seconds = Math.floor((now - createdAt) / 1_000);
	const percent = (seconds / (MINUTE_MS / 1_000)) * 100;
	if (!Number.isFinite(percent)) {
		return 0;
	}
	return Math.min(100, Math.max(0, percent));
}

export type Rgb = readonly [number, number, number];

/** `#RRGGBB` to its three channels, 0 to 255. */
export function parseHex(hex: string): Rgb {
	const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
	if (!match) {
		throw new Error(`Not a six-digit hex colour: ${hex}`);
	}
	return [
		parseInt(match[1], 16),
		parseInt(match[2], 16),
		parseInt(match[3], 16),
	];
}

/**
 * `percent` of `to` mixed into `from`, in sRGB: what CSS's
 * `color-mix(in srgb, to percent, from)` paints.
 */
export function mixSrgb(from: Rgb, to: Rgb, percent: number): Rgb {
	const t = Math.min(100, Math.max(0, percent)) / 100;
	return [
		from[0] * (1 - t) + to[0] * t,
		from[1] * (1 - t) + to[1] * t,
		from[2] * (1 - t) + to[2] * t,
	];
}

function luminance(color: Rgb): number {
	const [r, g, b] = color.map((channel) => {
		const v = channel / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two opaque colours, 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
	const x = luminance(a);
	const y = luminance(b);
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
