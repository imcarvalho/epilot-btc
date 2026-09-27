/**
 * The scoreboard's derived numbers (product spec §6.5). Derived from the
 * counters, never from `history`, which is trimmed to the last ten.
 */

/**
 * Correct ÷ resolved, as a whole percent - 2 correct out of 10 is 20%.
 * Null before anything has resolved: "100%" after one guess is noise, and
 * "0%" before any is false.
 */
export function successRate({
	wins,
	losses,
}: {
	wins: number;
	losses: number;
}): number | null {
	const resolved = wins + losses;
	return resolved === 0 ? null : Math.round((wins / resolved) * 100);
}

/** "54%", or "-" before the first result. */
export const formatRate = (rate: number | null): string =>
	rate === null ? '-' : `${rate}%`;
