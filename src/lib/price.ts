/**
 * The game price: the only price that can affect an outcome.
 *
 * Engineering spec §5. Read server-side from Coinbase Exchange's ticker -
 * the same market the chart and live minute draw from, so the
 * locked price, the settled price and the provisional line all describe one
 * market (Coinbase's retail spot price sits $20-30 away from it). Cached in one item so a
 * single fetch per window serves every player, and marked stale after 15 s so
 * that nobody locks in at an old number (§3, "An unreadable market resolves
 * nothing"; this price never settles a guess, the tape does). On failure the last known price is served with its own
 * timestamp: the game degrades - it reports the feed as delayed - rather than
 * breaking.
 *
 * Locking a guess in never reads the cache: `fetchFreshPrice` reads the
 * market at the moment of the request (§5, "The locked price"), so a player
 * cannot pick a direction from a move the locked price has not caught up with.
 */

import { z } from 'zod';
import { coinbaseUrl } from './coinbase';
import { PRICE_READ_RATE, PRICE_REFRESH_RATE, rateSlot } from './rate-limit';
import type { CachedPrice, GameStore } from './store';

export const PRICE_URL = coinbaseUrl('ticker');

/**
 * How long one fetched price serves every request and every stream: a
 * second, so the live minute moves each second, while Coinbase still sees at
 * most one ticker call a second however many players are watching.
 */
export const PRICE_CACHE_MS = 1_000;

/** Older than this, a price takes no guesses and the feed is reported as delayed. */
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
 * stood (`observedAt`). Null if the read fails: there is no fallback here. A
 * failed cache write is logged on its own and the fresh price still returned:
 * the cache only saves the next caller a fetch, and a store hiccup is not a
 * Coinbase failure.
 */
export async function fetchFreshPrice({
	store,
	fetchPrice,
	now,
}: PriceDeps): Promise<CachedPrice | null> {
	const startedAt = now();
	let fresh: CachedPrice;
	try {
		const quote = await fetchPrice();
		fresh = {
			price: quote.price,
			updatedAt: observedAt(quote.time, startedAt, now()),
		};
	} catch (error) {
		console.error(
			JSON.stringify({
				event: 'price-fetch-failed',
				error: String(error),
			}),
		);
		return null;
	}
	try {
		await store.putCachedPrice(fresh);
	} catch (error) {
		console.error(
			JSON.stringify({
				event: 'price-cache-write-failed',
				error: String(error),
			}),
		);
	}
	return fresh;
}

/**
 * How old a read may be and still lock a guess: a quarter of a second. The
 * lock price is never older than this (compare "never the cache", which can
 * be a second old, or fifteen while Coinbase fails), and `createdAt` stays
 * the time that price stood, so the minute still runs from the locked trade.
 * It exists so a burst of guesses shares reads instead of each costing a
 * Coinbase call (§5, "Bounding Coinbase calls").
 */
export const LOCK_PRICE_REUSE_MS = 250;

/**
 * The price a guess locks at, with Coinbase calls bounded whatever the number
 * of players: a read under `LOCK_PRICE_REUSE_MS` old is reused; otherwise a
 * fresh read is made if the global per-second cap (`PRICE_READ_RATE`) has a
 * slot left; otherwise null, and the guess is refused like a failed read.
 */
export async function lockPrice(deps: PriceDeps): Promise<CachedPrice | null> {
	const cached = await deps.store.getCachedPrice();
	if (cached) {
		const age = deps.now() - cached.updatedAt;
		if (age >= 0 && age <= LOCK_PRICE_REUSE_MS) {
			return cached;
		}
	}

	const slot = rateSlot(PRICE_READ_RATE, '', deps.now());
	if (!(await deps.store.takeSlot(slot))) {
		console.error(
			JSON.stringify({
				event: 'price-read-capped',
			}),
		);
		return null;
	}
	return fetchFreshPrice(deps);
}

/**
 * How long a failed read is remembered: while Coinbase is down, requests
 * inside this window are served the last known price without calling it
 * again, so an outage does not multiply the calls (each one retries for
 * several seconds).
 */
export const PRICE_FAILURE_MS = PRICE_CACHE_MS;

interface ReadState {
	/** The read in progress, shared by every caller that arrives meanwhile. */
	inFlight: Promise<CachedPrice | null> | null;
	/** When the last read failed, on the server's clock. */
	failedAt: number | null;
}

/** Per store, so each process shares its reads and separate stores (tests) never do. */
const reads = new WeakMap<GameStore, ReadState>();

/**
 * The current game price for the screen: the cached one while it is fresh,
 * otherwise a new fetch, shared by every caller while it is in flight and not
 * repeated for `PRICE_FAILURE_MS` after it fails. Across instances, only the
 * caller that takes the second's refresh slot (`PRICE_REFRESH_RATE`) fetches;
 * the others serve the cache. Returns the last known price if the fetch
 * fails or another instance is refreshing, and null only if there has never
 * been one.
 */
export async function getGamePrice(
	deps: PriceDeps,
): Promise<CachedPrice | null> {
	const cached = await deps.store.getCachedPrice();
	if (cached && deps.now() - cached.updatedAt < PRICE_CACHE_MS) {
		return cached;
	}

	let state = reads.get(deps.store);
	if (!state) {
		state = {
			inFlight: null,
			failedAt: null,
		};
		reads.set(deps.store, state);
	}
	if (state.inFlight) {
		return (await state.inFlight) ?? cached;
	}
	if (
		state.failedAt !== null &&
		deps.now() - state.failedAt < PRICE_FAILURE_MS
	) {
		return cached;
	}

	// Set before the first await, so callers arriving meanwhile share it.
	const read = state;
	read.inFlight = (async () => {
		const slot = rateSlot(PRICE_REFRESH_RATE, '', deps.now());
		if (!(await deps.store.takeSlot(slot))) {
			// Another instance is refreshing: not a failure, so no back-off.
			return null;
		}
		const fresh = await fetchFreshPrice(deps);
		read.failedAt = fresh ? null : deps.now();
		return fresh;
	})().finally(() => {
		read.inFlight = null;
	});
	return (await read.inFlight) ?? cached;
}

export function isStale(price: CachedPrice | null, now: number): boolean {
	return price === null || now - price.updatedAt > PRICE_STALE_MS;
}
