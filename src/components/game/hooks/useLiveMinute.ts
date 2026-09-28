'use client';

import { useEffect, useState } from 'react';
import type { PendingGuess, StateResponse } from '@/lib/contracts';
import { takeSample, type Sample } from '@/lib/live-minute';

export interface LiveMinute {
	samples: Sample[];
	/** The latest game price, or null before the first. */
	price: number | null;
	/** Delivering: the stream is up and its price is fresh. */
	isAlive: boolean;
}

/**
 * The live minute (engineering spec §5.1): while a guess is in play, one
 * point per second of the game price the stream sends, from the guess
 * onwards. The browser only draws it; the result is the server's.
 */
export function useLiveMinute(
	guess: PendingGuess | null,
	state: StateResponse | null,
	isLive: boolean,
): LiveMinute {
	const [samples, setSamples] = useState<Sample[]>([]);
	const guessId = guess?.id ?? null;
	const since = guess?.createdAt ?? 0;
	const price = state?.price ?? null;
	const priceAt = state?.priceUpdatedAt ?? null;

	// A new guess starts a new minute.
	useEffect(() => {
		setSamples([]);
	}, [guessId]);

	// One point per price observation, dated when that price stood.
	useEffect(() => {
		if (guessId === null || priceAt === null) {
			return;
		}
		setSamples((s) =>
			s.length > 0 && s[s.length - 1].t === priceAt
				? s
				: takeSample(s, price, priceAt, since),
		);
	}, [guessId, price, priceAt, since]);

	return {
		samples: guessId === null ? [] : samples,
		price: guessId === null ? null : price,
		isAlive: isLive && state !== null && !state.priceStale,
	};
}
