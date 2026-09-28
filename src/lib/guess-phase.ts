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
	| { kind: 'result'; result: ResolvedGuess; score: number };

/**
 * @param now server clock, epoch ms
 * @param watchedGuessId the guess this session placed or saw pending. Only
 *   its result is shown as a result moment; an older one is just history.
 */
export function guessPhase(
	state: StateResponse,
	now: number,
	watchedGuessId: string | null,
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

/** Why a guess did not go through: the server's feed was stale, or the request failed. */
export type GuessFailure = 'price-unavailable' | 'failed';

/**
 * What the strip says when a guess did not go through - and what the
 * announcer says, so the failure is heard as well as seen.
 */
export function guessFailureSentence(failure: GuessFailure): string {
	return failure === 'price-unavailable'
		? 'Price feed delayed. Nothing can be locked in until it catches up.'
		: 'That guess did not go through. Try again.';
}

/** The game could not be reached at all: on screen as a panel, and announced. */
export const UNREACHABLE_TITLE = 'The game could not be reached.';
export const UNREACHABLE_BODY =
	'Nothing has been lost: your score is kept on the server. Try again in a moment.';
