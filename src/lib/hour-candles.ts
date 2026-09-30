/**
 * The chart's last hour of one-minute candles, read by the server.
 *
 * Engineering spec §5. Every browser used to fetch these from Coinbase
 * itself; now the stream sends them, from one cached item that the reader
 * holding the ten seconds' refresh slot (`CANDLES_REFRESH_RATE`) refreshes
 * once it is stale. So Coinbase sees at most one candles request per ten
 * seconds however many players are watching, failing or not, and a failed
 * refresh serves the last hour it had rather than none.
 */

import { candlesUrl, parseCandles, type Candle } from './candles';
import { CANDLES_REFRESH_RATE, rateSlot } from './rate-limit';
import type { CachedCandles, GameStore } from './store';

/** How long one fetched hour serves every stream: the chart's old refresh rhythm. */
const CANDLES_CACHE_MS = 10_000;

export interface FetchCandlesOptions {
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

/** One read of Coinbase Exchange's last hour of one-minute BTC-USD candles. */
export async function fetchHourCandles(
	now: number,
	{ fetchImpl = fetch, timeoutMs = 2_000 }: FetchCandlesOptions = {},
): Promise<Candle[]> {
	const res = await fetchImpl(candlesUrl(now), {
		signal: AbortSignal.timeout(timeoutMs),
		cache: 'no-store',
	});
	if (!res.ok) {
		throw new Error(`Coinbase candles responded ${res.status}`);
	}
	return parseCandles(await res.json());
}

export interface CandlesDeps {
	store: GameStore;
	fetchCandles: (now: number) => Promise<Candle[]>;
	now: () => number;
}

/**
 * The cached hour while it is fresh, otherwise a new fetch by whichever
 * caller takes the refresh slot, the cached hour for everyone else; null only
 * if there has never been one.
 */
export async function getHourCandles({
	store,
	fetchCandles,
	now,
}: CandlesDeps): Promise<CachedCandles | null> {
	const cached = await store.getCachedCandles();
	if (cached && now() - cached.updatedAt < CANDLES_CACHE_MS) {
		return cached;
	}
	if (!(await store.takeSlot(rateSlot(CANDLES_REFRESH_RATE, '', now())))) {
		return cached;
	}

	const startedAt = now();
	let candles: Candle[];
	try {
		candles = await fetchCandles(startedAt);
	} catch (error) {
		console.error(
			JSON.stringify({
				event: 'candles-fetch-failed',
				error: String(error),
			}),
		);
		return cached;
	}
	const fresh = {
		candles,
		updatedAt: startedAt,
	};
	try {
		await store.putCachedCandles(fresh);
	} catch (error) {
		// The cache only saves the next caller a fetch; the hour is still good.
		console.error(
			JSON.stringify({
				event: 'candles-cache-write-failed',
				error: String(error),
			}),
		);
	}
	return fresh;
}
