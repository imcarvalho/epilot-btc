/**
 * The game price: the only price that can affect an outcome.
 *
 * Engineering spec §5. Read server-side from Coinbase Exchange's ticker -
 * the same market the browser's chart and live minute draw from, so the
 * locked price, the settled price and the provisional line all describe one
 * market (Coinbase's retail spot price sits $20-30 away from it). Cached in one item so a
 * single fetch per window serves every player, and marked stale after 15 s so
 * that nothing resolves against an old number (§3, "A stale price resolves
 * nothing"). On failure the last known price is served with its own
 * timestamp: the game degrades - it reports the feed as delayed - rather than
 * breaking.
 */

import { z } from 'zod';
import type { CachedPrice, GameStore } from './store';

export const PRICE_URL =
	'https://api.exchange.coinbase.com/products/BTC-USD/ticker';

/** How long one fetched price serves every request. */
export const PRICE_CACHE_MS = 5_000;

/** Older than this, a price resolves nothing and the feed is reported as delayed. */
export const PRICE_STALE_MS = 15_000;

/** The last trade on the BTC-USD book: `{ price, time, bid, ask, ... }`. */
const TickerResponseSchema = z.object({
	price: z.string().regex(/^\d+(\.\d+)?$/),
	time: z.string(),
});

export class PriceFetchError extends Error {}

export interface FetchPriceOptions {
	fetchImpl?: typeof fetch;
	sleep?: (ms: number) => Promise<void>;
	retries?: number;
	timeoutMs?: number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One read of Coinbase Exchange's BTC-USD ticker, retried with exponential backoff. */
export async function fetchTickerPrice({
	fetchImpl = fetch,
	sleep = realSleep,
	retries = 2,
	timeoutMs = 2_000,
}: FetchPriceOptions = {}): Promise<number> {
	let lastError: unknown;

	for (let attempt = 0; attempt <= retries; attempt++) {
		if (attempt > 0) {
			await sleep(200 * 2 ** (attempt - 1));
		}
		try {
			const res = await fetchImpl(PRICE_URL, {
				signal: AbortSignal.timeout(timeoutMs),
				cache: 'no-store',
			});
			if (!res.ok) {
				throw new PriceFetchError(`Coinbase responded ${res.status}`);
			}
			const body = TickerResponseSchema.parse(await res.json());
			return Number(body.price);
		} catch (error) {
			lastError = error;
		}
	}

	throw new PriceFetchError('Coinbase ticker price unavailable', {
		cause: lastError,
	});
}

export interface PriceDeps {
	store: GameStore;
	fetchPrice: () => Promise<number>;
	now: () => number;
}

/**
 * The current game price: the cached one while it is fresh, otherwise a new
 * fetch. Returns the last known price if the fetch fails, and null only if
 * there has never been one.
 */
export async function getGamePrice({
	store,
	fetchPrice,
	now,
}: PriceDeps): Promise<CachedPrice | null> {
	const cached = await store.getCachedPrice();
	if (cached && now() - cached.updatedAt < PRICE_CACHE_MS) {
		return cached;
	}

	try {
		const price = await fetchPrice();
		const fresh = { price, updatedAt: now() };
		await store.putCachedPrice(fresh);
		return fresh;
	} catch (error) {
		console.error(
			JSON.stringify({ event: 'price-fetch-failed', error: String(error) }),
		);
		return cached;
	}
}

export function isStale(price: CachedPrice | null, now: number): boolean {
	return price === null || now - price.updatedAt > PRICE_STALE_MS;
}
