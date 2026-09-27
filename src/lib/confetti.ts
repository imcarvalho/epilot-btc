/**
 * The confetti for a correct guess (product spec §6.4): winning is loud.
 * Only the layout lives here - where each piece starts, how it falls - as a
 * pure function of an injected random source, so it is testable. Whether to
 * show it at all (a win, and no reduced-motion preference) is decided where
 * it is rendered.
 */

/** The Dracula accents, the same family as the hero gradients. */
export const CONFETTI_COLOURS = [
	'#7DFBAA',
	'#89E4FA',
	'#FFA3D7',
	'#C7A5FF',
	'#F1FA8C',
] as const;

export interface ConfettiPiece {
	/** Horizontal start, as a percent of the viewport width. */
	left: number;
	delayMs: number;
	durationMs: number;
	/** Sideways travel over the fall. */
	driftPx: number;
	/** Turns over the fall, signed for direction. */
	spin: number;
	widthPx: number;
	heightPx: number;
	colour: (typeof CONFETTI_COLOURS)[number];
}

const between = (random: () => number, min: number, max: number) =>
	min + random() * (max - min);

export function confettiPieces(
	count: number,
	random: () => number,
): ConfettiPiece[] {
	return Array.from({ length: count }, () => {
		const colour =
			CONFETTI_COLOURS[
				Math.min(
					CONFETTI_COLOURS.length - 1,
					Math.floor(random() * CONFETTI_COLOURS.length),
				)
			];
		return {
			left: between(random, 0, 100),
			delayMs: between(random, 0, 400),
			durationMs: between(random, 1_600, 2_600),
			driftPx: between(random, -120, 120),
			spin: between(random, -3, 3),
			widthPx: between(random, 6, 10),
			heightPx: between(random, 10, 16),
			colour,
		};
	});
}
