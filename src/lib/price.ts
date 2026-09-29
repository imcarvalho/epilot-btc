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
 *
 * Locking a guess in never reads the cache: `fetchFreshPrice` reads the
 * market at the moment of the request (§5, "The locked price"), so a player
 * cannot pick a direction from a move the locked price has not caught up with.
 */

import { z } from 'zod';
import { coinbaseUrl } from './coinbase';
import type { CachedPrice, GameStore } from './store';

export const PRICE_URL = coinbaseUrl('ticker');

/**
 * How long one fetched price serves every request and every stream: a
 * second, so the live minute moves each second, while Coinbase still sees at
 * most one ticker call a second however many players are watching.
 */
export const PRICE_CACHE_MS = 1_000;

/** Older than this, a price resolves nothing and the feed is reported as delayed. */
export const PRICE_STALE_MS = 15_000;

/** The last trade on the BTC-USD book: `{ price, time, bid, ask, ... }`. */
const TickerResponseSchema = z.object({
	price: z.string().regex(/^\d+(\.\d+)?$/),
	time: z.string().refine((t) => Number.isFinite(Date.parse(t))),
});

/** One read of the ticker: the last trade, and when it traded. */
export interface PriceQuote {
	price: number;
	/** Epoch ms, Coinbase's clock: the time of the last trade. */
	time: number;
}

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
}: FetchPriceOptions = {}): Promise<PriceQuote> {
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
			return {
				price: Number(body.price),
				time: Date.parse(body.time),
			};
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
	fetchPrice: () => Promise<PriceQuote>;
	now: () => number;
}

/**
 * When a fetched price stood, on the server's clock. The ticker's last trade
 * is the price from its trade time until the response was written, so it
 * held at any moment in that span that falls inside the request. The trade
 * time, then, unless it came before the request began (a quiet market: the
 * price still stood when the request was made) or after it returned (clock
 * skew between Coinbase and the server).
 */
export function observedAt(
	tradeTime: number,
	startedAt: number,
	returnedAt: number,
): number {
	return Math.min(Math.max(tradeTime, startedAt), returnedAt);
}

/**
 * A price read from the market now, never from the cache, and written to the
 * cache so everyone else's screen benefits. `updatedAt` is when that price
 * stood (`observedAt`). Null if the read fails: there is no fallback here.
 */
export async function fetchFreshPrice({
	store,
	fetchPrice,
	now,
}: PriceDeps): Promise<CachedPrice | null> {
	const startedAt = now();
	try {
		const quote = await fetchPrice();
		const fresh = {
			price: quote.price,
			updatedAt: observedAt(quote.time, startedAt, now()),
		};
		await store.putCachedPrice(fresh);
		return fresh;
	} catch (error) {
		console.error(
			JSON.stringify({
				event: 'price-fetch-failed',
				error: String(error),
			}),
		);
		return null;
	}
}

/**
 * The current game price for the screen: the cached one while it is fresh,
 * otherwise a new fetch. Returns the last known price if the fetch fails, and
 * null only if there has never been one.
 */
export async function getGamePrice(
	deps: PriceDeps,
): Promise<CachedPrice | null> {
	const cached = await deps.store.getCachedPrice();
	if (cached && deps.now() - cached.updatedAt < PRICE_CACHE_MS) {
		return cached;
	}
	return (await fetchFreshPrice(deps)) ?? cached;
}

export function isStale(price: CachedPrice | null, now: number): boolean {
	return price === null || now - price.updatedAt > PRICE_STALE_MS;
}
