/**
 * Which state the guess strip is in (product spec §5 and §6.2), derived from
 * the server's state and the server's clock. Pure, so every waiting state is
 * tested without rendering anything.
 *
 * Waiting is not one state, and the player is never left guessing which one
 * they are in: counting down, time up but the price has not moved, or the
 * feed is behind and nothing can settle until it catches up.
 */

import type { PendingGuess, ResolvedGuess, StateResponse } from './contracts';
import { GUESS_WINDOW_MS } from './resolve-guess';

export type GuessPhase =
	| { kind: 'first-visit' }
	| { kind: 'idle' }
	| { kind: 'locked'; guess: PendingGuess; secondsLeft: number }
	| { kind: 'time-up'; guess: PendingGuess }
	| { kind: 'stale'; guess: PendingGuess; ageMs: number }
	| { kind: 'delayed'; guess: PendingGuess }
	| { kind: 'result'; result: ResolvedGuess; score: number }
	| { kind: 'away-result'; result: ResolvedGuess; score: number };

/**
 * @param now server clock, epoch ms
 * @param watchedGuessId the guess this session placed or saw pending. Its
 *   result is shown as a result moment.
 * @param seenResultId the last result this browser has already shown, as it
 *   stood when the page loaded: a different, unwatched result settled while
 *   the player was away, and is shown once as such (product spec §7). Null
 *   when this browser has shown none; left out when that cannot be known
 *   (no storage), and then an unwatched result is just history - better
 *   silent than announced again on every load.
 */
export function guessPhase(
	state: StateResponse,
	now: number,
	watchedGuessId: string | null,
	seenResultId?: string | null,
): GuessPhase {
	const guess = state.pendingGuess;

	if (guess) {
		const msLeft = guess.createdAt + GUESS_WINDOW_MS - now;
		if (msLeft > 0) {
			// Capped: the clock offset is an estimate, and a few hundred ms of
			// error must not show "61s to go".
			const secondsLeft = Math.min(
				GUESS_WINDOW_MS / 1000,
				Math.ceil(msLeft / 1000),
			);
			return {
				kind: 'locked',
				guess,
				secondsLeft,
			};
		}
		if (state.priceStale) {
			return {
				kind: 'stale',
				guess,
				ageMs: now - (state.priceUpdatedAt ?? now),
			};
		}
		// The ticker is fine but the trade history that settles the guess
		// cannot be read: the stale price is not the reason, so say this one.
		if (state.settlementDelayed) {
			return {
				kind: 'delayed',
				guess,
			};
		}
		return {
			kind: 'time-up',
			guess,
		};
	}

	if (state.lastResult && state.lastResult.id === watchedGuessId) {
		return {
			kind: 'result',
			result: state.lastResult,
			score: state.score,
		};
	}

	if (
		state.lastResult &&
		seenResultId !== undefined &&
		state.lastResult.id !== seenResultId
	) {
		return {
			kind: 'away-result',
			result: state.lastResult,
			score: state.score,
		};
	}

	return state.history.length === 0
		? {
				kind: 'first-visit',
			}
		: {
				kind: 'idle',
			};
}

/** "Correct. The price went up." - the banner's headline. */
export function resultHeadline(result: ResolvedGuess): string {
	const went = result.priceAtResolve > result.priceAtGuess ? 'up' : 'down';
	const lead = result.delta === 1 ? 'Correct.' : 'Not this time.';
	return `${lead} The price went ${went}.`;
}

/** Product spec §7. Also what a screen reader announces, so a full sentence. */
export function resultSentence(result: ResolvedGuess, score: number): string {
	return `${resultHeadline(result)} Score ${score}.`;
}

/**
 * The waiting minute (product spec §7): "Locked at $X. 47s to go." The price
 * arrives formatted, so the copy lives here and the currency formatting stays
 * with the screen.
 */
export function lockedSentence(price: string, secondsLeft: number): string {
	return `Locked at ${price}. ${secondsLeft}s to go.`;
}

/** The countdown at zero with the price unchanged (product spec §6.2, §7). */
export const TIME_UP = 'Time is up - waiting for the price to change.';

/**
 * The feed is behind with a guess in play, or behind at all on the price
 * card (product spec §6.2, §7).
 *
 * @param age how long ago the price was updated, formatted: "25s ago"
 */
export function staleSentence(age: string): string {
	return `Price feed delayed. Last updated ${age}. Nothing is settled until it catches up.`;
}

/**
 * A guess is past its deadline and the market history that settles it cannot
 * be read, though the price feed itself is fine (product spec §7, engineering
 * spec §3). The guess stays in play.
 */
export const SETTLEMENT_DELAYED =
	'Settlement delayed. Your guess stays in play and settles as soon as the market history can be read.';

/**
 * A guess that settled while the player was away (product spec §7), without
 * the score change: "While you were away: your up guess was correct."
 */
export function awayHeadline(result: ResolvedGuess): string {
	const outcome = result.delta === 1 ? 'correct' : 'wrong';
	return `While you were away: your ${result.direction} guess was ${outcome}.`;
}

/**
 * The same, with the score change: what a screen reader announces.
 * "While you were away: your up guess was correct. +1."
 */
export function awaySentence(result: ResolvedGuess): string {
	return `${awayHeadline(result)} ${result.delta === 1 ? '+1' : '-1'}.`;
}

/** Why a guess did not go through: the server's feed was stale, or the request failed. */
export type GuessFailure = 'price-unavailable' | 'failed';

/**
 * What the strip says when a guess did not go through - and what the
 * announcer says, so the failure is heard as well as seen.
 */
export function guessFailureSentence(failure: GuessFailure): string {
	return failure === 'price-unavailable'
		? PRICE_BLOCKED
		: 'That guess did not go through. Try again.';
}

/** The game could not be reached at all: on screen as a panel, and announced. */
export const UNREACHABLE_TITLE = 'The game could not be reached.';
export const UNREACHABLE_BODY =
	'Nothing has been lost: your score is kept on the server. Try again in a moment.';

/**
 * No guess can be placed: nothing is in play, and the server's price is
 * missing or too old to lock in at (the same 15 s rule the server enforces).
 * The buttons go quiet and the strip says why, rather than letting a guess be
 * tried and refused.
 */
export function priceBlocksGuess(
	state: Pick<StateResponse, 'pendingGuess' | 'priceStale'>,
): boolean {
	return state.pendingGuess === null && state.priceStale;
}

/**
 * The strip while `priceBlocksGuess` holds, and what is announced on entering
 * that state (product spec §7).
 */
export const PRICE_BLOCKED =
	'Price feed delayed. Nothing can be locked in until it catches up.';

/** Announced once when the price returns and guessing is open again. */
export const PRICE_RETURNED = 'The price is back. You can guess again.';

/**
 * What the announcer says when guessing is blocked or unblocked by the price
 * feed: the delay on entry, the recovery on leaving it, and nothing when the
 * state has not changed - an unchanged state is not news, and a screen is
 * not announced as recovered from a delay it never showed.
 *
 * @param was blocked at the last announcement; null before the first state
 */
export function priceBlockAnnouncement(
	was: boolean | null,
	is: boolean,
): string | null {
	if (is) {
		return was === true ? null : PRICE_BLOCKED;
	}
	return was === true ? PRICE_RETURNED : null;
}

/** The price card when no price has ever reached the game. */
export const PRICE_UNAVAILABLE =
	'The price is unavailable right now. Nothing can be guessed until it returns.';
