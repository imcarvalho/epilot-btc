/**
 * What a screen reader hears where the screen shows a symbol: the history's
 * "+1" and "−1", the board's "42" and "56%". A list row carries its meaning
 * in its own content, not in an `aria-label` a screen reader may skip, so
 * the symbols are hidden from assistive technology and these words stand
 * beside them, visually hidden.
 */

/** "plus 1", "minus 1", "0": a signed number, said the way it is meant. */
export function signedWords(n: number): string {
	if (n > 0) {
		return `plus ${n}`;
	}
	if (n < 0) {
		return `minus ${-n}`;
	}
	return '0';
}

/** A board score: "42 points", "1 point", "minus 2 points". */
export function scoreWords(score: number): string {
	const unit = Math.abs(score) === 1 ? 'point' : 'points';
	return `${score < 0 ? `minus ${-score}` : score} ${unit}`;
}

/**
 * A board row's success rate, with the guesses it is out of: "56% correct
 * over 75 guesses", or "no results yet" where the screen shows "-".
 */
export function rateWords(rate: number | null, guesses: number): string {
	if (rate === null) {
		return 'no results yet';
	}
	return `${rate}% correct over ${guesses} ${guesses === 1 ? 'guess' : 'guesses'}`;
}
