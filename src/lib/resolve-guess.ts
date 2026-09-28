/**
 * The resolution rule.
 *
 * Engineering spec §3. This is the whole game rule, and it is deliberately
 * pure: no network, no clock, no database. Both resolution triggers - the lazy
 * read on `GET /api/state` and the scheduled sweep - call this same function
 * with the server's own price and the server's own clock.
 *
 * A guess resolves only when BOTH conditions hold: at least 60 seconds have
 * passed AND the price has changed. An unchanged price after a minute is not a
 * loss and not a win; it is a guess still in play, and the UI has a screen for
 * exactly that state (product spec §6.2).
 */

export type Direction = 'up' | 'down';

export interface Guess {
	direction: Direction;
	/** The price at the moment the guess was locked in, decided server-side. */
	priceAtGuess: number;
	/** Epoch milliseconds, server clock. */
	createdAt: number;
}

export type Resolution =
	{ resolved: false } | { resolved: true; delta: 1 | -1 };

export const GUESS_WINDOW_MS = 60_000;

export function resolveGuess(
	guess: Guess,
	priceNow: number,
	now: number,
): Resolution {
	if (now - guess.createdAt < GUESS_WINDOW_MS) {
		return { resolved: false };
	}
	if (priceNow === guess.priceAtGuess) {
		return { resolved: false };
	}

	const wentUp = priceNow > guess.priceAtGuess;
	const correct = guess.direction === 'up' ? wentUp : !wentUp;

	return { resolved: true, delta: correct ? 1 : -1 };
}
