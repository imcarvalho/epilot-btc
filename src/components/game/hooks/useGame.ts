'use client';

import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from 'react';
import type { GuessResponse, PendingGuess } from '@/lib/contracts';
import type { GuessFailure } from '@/lib/guess-phase';
import type { Direction } from '@/lib/resolve-guess';
import { createServerClock } from '@/lib/server-clock';
import { useStream, type StreamStatus } from './useStream';

/** Why the last guess did not go through, if it did not. */
export type GuessError = GuessFailure | null;

/** Where this browser keeps the id of the last result it has shown. */
const SEEN_RESULT_KEY = 'btc-guess:seen-result';

/**
 * The last result this browser has shown: null when it has shown none, and
 * undefined when that cannot be known (no storage, or on the server), which
 * `guessPhase` reads as "say nothing" rather than "say it every load".
 */
function readSeenResult(): string | null | undefined {
	if (typeof window === 'undefined') {
		return undefined;
	}
	try {
		return window.localStorage.getItem(SEEN_RESULT_KEY);
	} catch {
		return undefined;
	}
}

function writeSeenResult(id: string) {
	try {
		window.localStorage.setItem(SEEN_RESULT_KEY, id);
	} catch {
		// No storage: readSeenResult says so too, and nothing is shown as new.
	}
}

/**
 * The game, from the browser's side (engineering spec §3.1): the stream's
 * state, and placing a guess - the one thing the player sends. Nothing here
 * decides an outcome; the browser renders what the server pushes.
 *
 * `clockOffset` is server time minus local time, taken from each state's
 * `serverNow`, so the countdown runs on the server's clock (§7.2).
 */
export function useGame() {
	const stream = useStream();
	const [watchedGuessId, setWatchedGuessId] = useState<string | null>(null);
	// As it stood when the page loaded, and not updated after: a result that
	// settled while the player was away stays on screen for this visit, as a
	// watched one does, and is not new on the next.
	const [seenResultId] = useState(readSeenResult);
	const [isPlacing, setIsPlacing] = useState(false);
	const [guessError, setGuessError] = useState<GuessError>(null);
	// A guess the server has accepted but the stream has not shown yet: shown
	// at once, until a state that knows about it arrives, a second at most.
	const [placed, setPlaced] = useState<{
		guess: PendingGuess;
		serverNow: number;
	} | null>(null);

	const streamed = stream.status;
	const state = streamed.kind === 'ready' ? streamed.state : null;

	useEffect(() => {
		if (!state) {
			return;
		}
		// A guess seen pending is one this session watches: its result is a
		// moment on screen, even if the page was reloaded mid-minute.
		if (state.pendingGuess) {
			setWatchedGuessId(state.pendingGuess.id);
		}
		// Any result that reaches the screen has now been shown, as a result
		// moment or as settled while away, so the next visit does not repeat it.
		if (state.lastResult) {
			writeSeenResult(state.lastResult.id);
		}
		if (
			placed &&
			(state.pendingGuess?.id === placed.guess.id ||
				state.lastResult?.id === placed.guess.id)
		) {
			setPlaced(null);
		}
	}, [state, placed]);

	const status = useMemo<StreamStatus>(() => {
		if (streamed.kind !== 'ready' || !placed) {
			return streamed;
		}
		const known =
			streamed.state.pendingGuess?.id === placed.guess.id ||
			streamed.state.lastResult?.id === placed.guess.id;
		return known
			? streamed
			: {
					kind: 'ready',
					state: {
						...streamed.state,
						pendingGuess: placed.guess,
					},
					clockOffset: streamed.clockOffset,
				};
	}, [streamed, placed]);

	const placeGuess = useCallback(
		async (direction: Direction) => {
			setIsPlacing(true);
			setGuessError(null);
			try {
				const res = await fetch('/api/guess', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
					},
					body: JSON.stringify({
						direction,
					}),
				});
				if (res.status === 201) {
					const { pendingGuess, serverNow } =
						(await res.json()) as GuessResponse;
					setWatchedGuessId(pendingGuess.id);
					setPlaced({
						guess: pendingGuess,
						serverNow,
					});
				} else if (res.status === 503) {
					setGuessError('price-unavailable');
				} else if (res.status === 409) {
					// Another tab got there first: its guess arrives on the stream.
				} else if (res.status === 401) {
					// The player needs re-establishing: the stream does that. This
					// guess was not placed, so say so rather than drop it.
					stream.retry();
					setGuessError('failed');
				} else {
					setGuessError('failed');
				}
			} catch {
				setGuessError('failed');
			} finally {
				setIsPlacing(false);
			}
		},
		[stream],
	);

	return {
		status,
		candles: stream.candles,
		board: stream.board,
		isLive: stream.isLive,
		signIn: stream.signIn,
		retry: stream.retry,
		placeGuess,
		isPlacing,
		guessError,
		watchedGuessId,
		seenResultId,
	};
}

/**
 * The current time on the server's clock, re-rendering once a second.
 *
 * The offset is handed to the clock during render, so the first render after a
 * state is already on server time, and the clock's one interval is never
 * recreated when the offset changes (which it does with every state).
 */
export function useServerNow(clockOffset: number): number {
	const [clock] = useState(() =>
		createServerClock({
			localNow: () => Date.now(),
		}),
	);
	clock.setOffset(clockOffset);
	return useSyncExternalStore(clock.subscribe, clock.getNow, clock.getNow);
}
