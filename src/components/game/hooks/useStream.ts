'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Candle } from '@/lib/candles';
import type {
	LeaderboardResponse,
	SignInOutcome,
	StateResponse,
	StreamTicket,
} from '@/lib/contracts';
import { toServerTime } from '@/lib/server-clock';

export type CandlesState =
	| { kind: 'loading' }
	| { kind: 'ready'; candles: Candle[]; windowEnd: number }
	| { kind: 'error' };

export type StreamStatus =
	/** Opening, before the first state has arrived. */
	| { kind: 'connecting' }
	| { kind: 'ready'; state: StateResponse; clockOffset: number }
	/** Could not open at all: nothing to show. */
	| { kind: 'error' };

export interface GameStream {
	status: StreamStatus;
	candles: CandlesState;
	board: LeaderboardResponse | null;
	/** Connected and delivering: the stream's last state is recent. */
	isLive: boolean;
	/** What a sign-in just did, reported once by the ticket that followed it. */
	signIn: SignInOutcome | null;
	/** Reconnect now, forgetting the back-off: "Try again". */
	retry: () => void;
}

/** Failures in a row before a screen with nothing on it says so. */
const FAILURES_BEFORE_ERROR = 3;
const MAX_BACKOFF_MS = 30_000;
/** No state for this long and the stream counts as down. */
const QUIET_MS = 5_000;

/**
 * First contact is "ask for a ticket; if there is no player yet, create one
 * and ask again". A creation still in flight is shared, so a double mount
 * cannot mint two anonymous players for one browser; a finished one is not,
 * so a later retry can create again.
 */
let playerCreation: Promise<Response> | null = null;

async function createPlayer(): Promise<void> {
	playerCreation ??= fetch('/api/player', {
		method: 'POST',
	}).finally(() => {
		playerCreation = null;
	});
	const created = await playerCreation;
	if (!created.ok) {
		throw new Error(`player creation failed: ${created.status}`);
	}
}

async function fetchTicket(): Promise<StreamTicket> {
	let res = await fetch('/api/stream-token', {
		cache: 'no-store',
	});
	if (res.status === 401) {
		await createPlayer();
		res = await fetch('/api/stream-token', {
			cache: 'no-store',
		});
	}
	if (!res.ok) {
		throw new Error(`stream ticket failed: ${res.status}`);
	}
	return res.json();
}

/**
 * The game, pushed (engineering spec §3.1): one Server-Sent Events stream
 * carries the player's state every second, the hour of candles and the
 * board. The browser only opens it; nothing it sends affects an outcome.
 *
 * The stream is opened with a short-lived ticket from the web tier, because
 * it lives on its own domain where this site's cookies do not go. Whenever
 * it ends - its two-minute lifetime, a network drop, the ticket expiring
 * under a native retry - it is closed and reopened with a fresh ticket,
 * backing off from a second to half a minute while it keeps failing. It is
 * closed while the tab is hidden, which also frees one of the few streams
 * the account can run at once.
 */
export function useStream(): GameStream {
	const [status, setStatus] = useState<StreamStatus>({
		kind: 'connecting',
	});
	const [candles, setCandles] = useState<CandlesState>({
		kind: 'loading',
	});
	const [board, setBoard] = useState<LeaderboardResponse | null>(null);
	const [signIn, setSignIn] = useState<SignInOutcome | null>(null);
	const [lastStateAt, setLastStateAt] = useState(0);
	const [now, setNow] = useState(() => Date.now());
	const connect = useRef<() => void>(() => {});
	const failures = useRef(0);
	// Server time minus local time, from the latest state: the chart's window
	// ends on the server's clock, like the candles and guesses it plots.
	const clockOffset = useRef(0);

	useEffect(() => {
		let source: EventSource | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let disposed = false;
		let generation = 0;

		const close = () => {
			generation += 1;
			clearTimeout(timer);
			source?.close();
			source = null;
		};

		const fail = () => {
			close();
			failures.current += 1;
			if (failures.current >= FAILURES_BEFORE_ERROR) {
				setStatus((s) =>
					s.kind === 'ready'
						? s
						: {
								kind: 'error',
							},
				);
			}
			const backoff = Math.min(
				MAX_BACKOFF_MS,
				1_000 * 2 ** (failures.current - 1),
			);
			timer = setTimeout(open, backoff * (1 + Math.random()));
		};

		const open = async () => {
			close();
			if (disposed || document.visibilityState === 'hidden') {
				return;
			}
			const mine = generation;
			let ticket: StreamTicket;
			try {
				ticket = await fetchTicket();
			} catch {
				if (mine === generation && !disposed) {
					fail();
				}
				return;
			}
			if (mine !== generation || disposed) {
				return;
			}
			if (ticket.signIn) {
				setSignIn(ticket.signIn);
			}

			const es = new EventSource(
				`${ticket.url}?token=${encodeURIComponent(ticket.token)}`,
			);
			source = es;
			es.addEventListener('state', (e) => {
				const state = JSON.parse((e as MessageEvent).data) as StateResponse;
				failures.current = 0;
				setLastStateAt(Date.now());
				clockOffset.current = state.serverNow - Date.now();
				setStatus({
					kind: 'ready',
					state,
					clockOffset: clockOffset.current,
				});
			});
			es.addEventListener('candles', (e) => {
				const candles = JSON.parse((e as MessageEvent).data) as Candle[] | null;
				setCandles((current) =>
					candles
						? {
								kind: 'ready',
								candles,
								windowEnd: toServerTime(Date.now(), clockOffset.current),
							}
						: current.kind === 'ready'
							? current
							: {
									kind: 'error',
								},
				);
			});
			es.addEventListener('leaderboard', (e) => {
				setBoard(JSON.parse((e as MessageEvent).data) as LeaderboardResponse);
			});
			es.addEventListener('gone', () => {
				// The player expired or was deleted: make a new one, and reconnect.
				close();
				void createPlayer().then(open, fail);
			});
			// Every end looks like an error to EventSource, the stream's planned
			// end included. Its own retry would reuse an expired ticket, so the
			// hook reconnects itself, with a new one.
			es.onerror = () => {
				if (source === es) {
					fail();
				}
			};
		};

		connect.current = () => {
			failures.current = 0;
			void open();
		};

		const onVisibility = () => {
			if (document.visibilityState === 'visible') {
				failures.current = 0;
				void open();
			} else {
				close();
			}
		};

		void open();
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			disposed = true;
			close();
			document.removeEventListener('visibilitychange', onVisibility);
		};
	}, []);

	// Whether the stream is delivering, re-judged each second.
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1_000);
		return () => clearInterval(id);
	}, []);

	const retry = useCallback(() => {
		setStatus((s) =>
			s.kind === 'error'
				? {
						kind: 'connecting',
					}
				: s,
		);
		connect.current();
	}, []);

	return {
		status,
		candles,
		board,
		isLive: now - lastStateAt < QUIET_MS,
		signIn,
		retry,
	};
}
