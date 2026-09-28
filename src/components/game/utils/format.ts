const usd = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

/** Fixed two decimals, so the figure does not change width as it moves (§7.2). */
export const formatUsd = (value: number) => usd.format(value);

/** "1s ago", "42s ago", "3 min ago", "2 h ago". */
export function formatAge(ms: number): string {
	const s = Math.max(0, Math.round(ms / 1000));
	if (s < 60) {
		return `${s}s ago`;
	}
	const m = Math.floor(s / 60);
	if (m < 60) {
		return `${m} min ago`;
	}
	return `${Math.floor(m / 60)} h ago`;
}

/** The countdown: "0:47", "0:00". */
export function formatCountdown(seconds: number): string {
	const s = Math.max(0, Math.ceil(seconds));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** How long a guess took to settle: "58s", "1m 04s". */
export function formatElapsed(ms: number): string {
	const s = Math.max(0, Math.round(ms / 1000));
	if (s < 60) {
		return `${s}s`;
	}
	return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

const axisWhole = new Intl.NumberFormat('en-US', {
	maximumFractionDigits: 0,
});
const axisCents = new Intl.NumberFormat('en-US', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

/**
 * A price-axis label: "84,550" for an axis stepping in whole dollars,
 * "84,992.50" for one stepping in fractions of one ($2.50, $0.50) - rounding
 * those to dollars would label a line with a price it is not at. No currency
 * sign, since the headline figure already says what the axis is in.
 */
export function formatAxisPrice(value: number, step: number): string {
	return (Number.isInteger(step) ? axisWhole : axisCents).format(value);
}

/** A score with its sign, as the board shows it: "+42", "-2", "0". */
export function formatScore(score: number): string {
	return score > 0 ? `+${score}` : `${score}`;
}
