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

/**
 * The streak as words, for the score chip (product spec §6.4, §6.5). A loss
 * that broke a run says so - "streak ended at 2" - rather than showing a
 * bare zero, so a loss reads as a turn of the game, not a reset. Null
 * before anything has resolved.
 */
export function streakLabel({
	wins,
	losses,
	currentStreak,
	previousStreak,
}: {
	wins: number;
	losses: number;
	currentStreak: number;
	previousStreak: number;
}): string | null {
	if (wins + losses === 0) {
		return null;
	}
	if (currentStreak >= 2) {
		return `${currentStreak} wins in a row`;
	}
	if (currentStreak === 1) {
		return 'last guess won';
	}
	if (currentStreak === -1) {
		return previousStreak >= 2
			? `streak ended at ${previousStreak}`
			: 'last guess lost';
	}
	return `${-currentStreak} losses in a row`;
}

/** The longest winning run, or null if there has not been a win. */
export function bestStreakLabel(bestStreak: number): string | null {
	if (bestStreak <= 0) {
		return null;
	}
	return bestStreak === 1 ? 'Best: 1 win' : `Best: ${bestStreak} wins in a row`;
}
