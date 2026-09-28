'use client';

import { useEffect, useRef, useState } from 'react';
import type { PendingGuess } from '@/lib/contracts';
import {
	TICKER_SUBSCRIBE,
	TICKER_URL,
	parseTicker,
	takeSample,
	type Sample,
} from '@/lib/live-minute';

export interface LiveMinute {
	samples: Sample[];
	/** Latest ticker price, or null before the first tick. */
	price: number | null;
	/** Connected and delivering: a tick within the last few seconds. */
	isAlive: boolean;
	/** Ticks received since the guess, for "40 ticks since your guess". */
	ticks: number;
}

const EMPTY: LiveMinute = {
	samples: [],
	price: null,
	isAlive: false,
	ticks: 0,
};

/** No tick for this long and the feed counts as down. */
const QUIET_MS = 5_000;
const MAX_BACKOFF_MS = 15_000;

/**
 * The live minute's feed (engineering spec §5.1): a WebSocket straight from
 * the browser to Coinbase's public ticker, opened when a guess starts and
 * closed when it resolves - no socket open on an idle screen.
 *
 * Ticks land in a ref; a one-second timer takes the latest into the
 * samples, so the screen re-renders once a second rather than per tick.
 * Reconnects with exponential backoff and jitter. Its prices never leave
 * the browser: they draw the line and tell the client when to ask, and the
 * server decides with its own.
 */
export function useLiveMinute(
	guess: PendingGuess | null,
	clockOffset: number,
): LiveMinute {
	const [live, setLive] = useState<LiveMinute>(EMPTY);
	const guessId = guess?.id ?? null;
	const start = guess?.createdAt ?? 0;
	// Read through a ref: the offset shifts by a few ms on every state
	// refresh, and that must not tear the socket down and reopen it.
	const offset = useRef(clockOffset);
	useEffect(() => {
		offset.current = clockOffset;
	}, [clockOffset]);

	useEffect(() => {
		if (guessId === null) {
			setLive(EMPTY);
			return;
		}

		let socket: WebSocket | null = null;
		let closed = false;
		let attempt = 0;
		let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
		const latest = {
			price: null as number | null,
			at: 0,
			ticks: 0,
		};
		let samples: Sample[] = [];

		const connect = () => {
			socket = new WebSocket(TICKER_URL);
			socket.onopen = () => {
				attempt = 0;
				socket?.send(TICKER_SUBSCRIBE);
			};
			socket.onmessage = (event) => {
				const tick =
					typeof event.data === 'string' ? parseTicker(event.data) : null;
				if (!tick) {
					return;
				}
				latest.price = tick.price;
				latest.at = Date.now();
				latest.ticks += 1;
			};
			socket.onclose = () => {
				if (closed) {
					return;
				}
				const backoff = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** attempt);
				attempt += 1;
				reconnectTimer = setTimeout(
					connect,
					backoff * (0.5 + Math.random() * 0.5),
				);
			};
			socket.onerror = () => socket?.close();
		};

		connect();

		const sampler = setInterval(() => {
			const now = Date.now();
			samples = takeSample(samples, latest.price, now + offset.current, start);
			setLive({
				samples,
				price: latest.price,
				isAlive: latest.price !== null && now - latest.at < QUIET_MS,
				ticks: latest.ticks,
			});
		}, 1_000);

		return () => {
			closed = true;
			clearTimeout(reconnectTimer);
			clearInterval(sampler);
			socket?.close();
		};
	}, [guessId, start]);

	return live;
}
