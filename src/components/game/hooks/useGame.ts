'use client';

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type RefObject,
} from 'react';
import { shouldAsk } from '@/lib/ask-scheduler';
import type { GuessResponse, StateResponse } from '@/lib/contracts';
import type { GuessFailure } from '@/lib/guess-phase';
import { type Direction, GUESS_WINDOW_MS } from '@/lib/resolve-guess';

export type GameStatus =
	| { kind: 'loading' }
	| { kind: 'ready'; state: StateResponse; clockOffset: number }
	| { kind: 'error' };

/** What the browser-side ticker currently says, read by the cadence. */
export interface TickerSnapshot {
	price: number | null;
	isAlive: boolean;
}

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
 * First contact is "ask for state; if there is no player yet, create one and
 * ask again". Shared across callers so a double mount (React strict mode, a
 * fast remount) cannot mint two anonymous players for one browser.
 */
let playerCreation: Promise<Response> | null = null;

async function fetchState(): Promise<StateResponse> {
	let res = await fetch('/api/state', {
		cache: 'no-store',
	});
	if (res.status === 401) {
		playerCreation ??= fetch('/api/player', {
			method: 'POST',
		});
		const created = await playerCreation;
		if (!created.ok) {
			throw new Error(`player creation failed: ${created.status}`);
		}
		res = await fetch('/api/state', {
			cache: 'no-store',
		});
	}
	if (!res.ok) {
		throw new Error(`state failed: ${res.status}`);
	}
	return res.json();
}

/**
 * The game, from the browser's side: the server's state, placing a guess,
 * and knowing when to ask again (engineering spec §3.1). Nothing here decides
 * an outcome; the browser only says "look now" and renders what comes back.
 *
 * `clockOffset` is server time minus local time, taken from `serverNow`, so
 * the countdown runs on the server's clock (§7.2).
 */
export function useGame(ticker?: RefObject<TickerSnapshot>) {
	const [status, setStatus] = useState<GameStatus>({
		kind: 'loading',
	});
	const [watchedGuessId, setWatchedGuessId] = useState<string | null>(null);
	// As it stood when the page loaded, and not updated after: a result that
	// settled while the player was away stays on screen for this visit, as a
	// watched one does, and is not new on the next.
	const [seenResultId] = useState(readSeenResult);
	const [isPlacing, setIsPlacing] = useState(false);
	const [guessError, setGuessError] = useState<GuessError>(null);
	const inFlight = useRef(false);
	// When the last GET /api/state was started, on the local clock, and how
	// many in a row have failed: the cadence spaces asks by attempts, not by
	// answers, so a failing server is not asked once a second (§3.1).
	const lastAskAt = useRef<number | null>(null);
	const consecutiveFailures = useRef(0);
	// Fallback polls made for the guess named here, for the 5 s -> 10 s back-off.
	const fallback = useRef<{
		guessId: string | null;
		polls: number;
	}>({
		guessId: null,
		polls: 0,
	});

	const accept = useCallback((state: StateResponse) => {
		setStatus({
			kind: 'ready',
			state,
			clockOffset: state.serverNow - Date.now(),
		});
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
	}, []);

	const refresh = useCallback(async () => {
		if (inFlight.current) {
			return;
		}
		inFlight.current = true;
		lastAskAt.current = Date.now();
		try {
			accept(await fetchState());
			consecutiveFailures.current = 0;
		} catch {
			consecutiveFailures.current += 1;
			setStatus((current) =>
				current.kind === 'ready'
					? current
					: {
							kind: 'error',
						},
			);
		} finally {
			inFlight.current = false;
		}
	}, [accept]);

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
					setStatus((current) =>
						current.kind === 'ready'
							? {
									kind: 'ready',
									state: {
										...current.state,
										pendingGuess,
										serverNow,
									},
									clockOffset: serverNow - Date.now(),
								}
							: current,
					);
				} else if (res.status === 503) {
					setGuessError('price-unavailable');
				} else if (res.status === 409 || res.status === 401) {
					// Another tab got there first, or the player needs re-establishing:
					// either way the server's state is the answer.
					await refresh();
				} else {
					setGuessError('failed');
				}
			} catch {
				setGuessError('failed');
			} finally {
				setIsPlacing(false);
			}
		},
		[refresh],
	);

	// On mount, and whenever the tab becomes visible again.
	useEffect(() => {
		void refresh();
		const onVisible = () => {
			if (document.visibilityState === 'visible') {
				void refresh();
			}
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	}, [refresh]);

	// The cadence around a pending guess: a pure decision, checked once a second.
	const latest = useRef(status);
	useEffect(() => {
		latest.current = status;
	}, [status]);
	useEffect(() => {
		const id = setInterval(() => {
			const current = latest.current;
			if (current.kind === 'loading') {
				return;
			}
			const msSinceLastAsk =
				lastAskAt.current === null ? null : Date.now() - lastAskAt.current;
			if (current.kind === 'error') {
				// First contact failed: retry as an idle refresh, under the back-off.
				const decision = shouldAsk({
					countdownEnded: false,
					lockedPrice: null,
					lastTickerPrice: null,
					socketAlive: false,
					visible: document.visibilityState !== 'hidden',
					msSinceLastAsk,
					askedSinceCountdownEnded: false,
					consecutiveFailures: consecutiveFailures.current,
					fallbackPolls: 0,
				});
				if (decision.ask) {
					void refresh();
				}
				return;
			}
			const { state, clockOffset } = current;
			const guess = state.pendingGuess;
			const now = Date.now() + clockOffset;
			const resolvableAt = guess ? guess.createdAt + GUESS_WINDOW_MS : Infinity;
			const guessId = guess?.id ?? null;
			if (fallback.current.guessId !== guessId) {
				fallback.current = {
					guessId,
					polls: 0,
				};
			}

			const decision = shouldAsk({
				countdownEnded: now >= resolvableAt,
				lockedPrice: guess?.priceAtGuess ?? null,
				// The live minute's ticker, when it is up: the client asks when the
				// price has visibly moved rather than polling blindly (§3.1).
				lastTickerPrice: ticker?.current?.price ?? null,
				socketAlive: ticker?.current?.isAlive ?? false,
				visible: document.visibilityState !== 'hidden',
				msSinceLastAsk,
				askedSinceCountdownEnded: state.serverNow >= resolvableAt,
				consecutiveFailures: consecutiveFailures.current,
				fallbackPolls: fallback.current.polls,
			});
			if (decision.ask) {
				if (decision.reason === 'fallback-poll') {
					fallback.current.polls += 1;
				}
				void refresh();
			}
		}, 1_000);
		return () => clearInterval(id);
	}, [refresh]);

	return {
		status,
		refresh,
		placeGuess,
		isPlacing,
		guessError,
		watchedGuessId,
		seenResultId,
	};
}

/** The current time on the server's clock, re-rendering once a second. */
export function useServerNow(clockOffset: number): number {
	const [now, setNow] = useState(() => Date.now() + clockOffset);
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now() + clockOffset), 1_000);
		return () => clearInterval(id);
	}, [clockOffset]);
	return now;
}
