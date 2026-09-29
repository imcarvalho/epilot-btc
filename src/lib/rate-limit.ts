/**
 * Fixed-window rate limits kept in the game's own table (engineering spec
 * §8): the arithmetic, and nothing else. A limit is a counter item per
 * window; the store adds one to it conditionally (`takeSlot`), so the count
 * is exact across every runtime instance, which a counter in memory could
 * not be.
 *
 * Two limits use it:
 *
 * - fresh price reads for guesses, global: Coinbase's public limit is shared
 *   by every player, so what protects it has to be shared too;
 * - new anonymous players, per client IP.
 */

/** A limit over fixed windows: at most `limit` slots in each `windowMs`. */
export interface RateLimit {
	/** Names the counter, and so keeps different limits apart. */
	name: string;
	limit: number;
	windowMs: number;
}

/** The counter one request falls in: which item, how big it may get, when it goes. */
export interface RateSlot {
	/** The item's partition key: the limit, who it counts, and the window. */
	key: string;
	limit: number;
	/** Epoch seconds, for DynamoDB's TTL: after this the item is garbage. */
	expiresAt: number;
}

/**
 * DynamoDB deletes expired items lazily, hours late, so nothing may rely on
 * TTL for correctness - the window in the key does that. TTL is only so the
 * counters do not pile up.
 */
export const RATE_ITEM_TTL_GRACE_MS = 60_000;

/**
 * The counter for `subject` (an IP hash, or empty for a global limit) at
 * `now`. Fixed windows: a burst straddling a boundary can get up to twice
 * `limit` through, which is an acceptable price for a single atomic counter.
 */
export function rateSlot(
	rate: RateLimit,
	subject: string,
	now: number,
): RateSlot {
	const window = Math.floor(now / rate.windowMs);
	const windowEnd = (window + 1) * rate.windowMs;
	return {
		key: `RATE#${rate.name}#${subject}#${window}`,
		limit: rate.limit,
		expiresAt: Math.ceil((windowEnd + RATE_ITEM_TTL_GRACE_MS) / 1000),
	};
}

/**
 * Fresh ticker reads for guesses, all players together. Coinbase's public
 * REST limit is 10 requests a second per IP; the shared price cache, the
 * candles and the settlement tape use a few of them, so guesses get 3. A
 * guess that cannot have one is refused as `price-unavailable`, which the
 * screen already handles, unless a read under `LOCK_PRICE_REUSE_MS` old
 * exists to lock at instead.
 */
export const PRICE_READ_RATE: RateLimit = {
	name: 'price-read',
	limit: 3,
	windowMs: 1_000,
};

/**
 * New anonymous players per client IP. Generous enough for a shared office
 * or event network, small enough that one machine cannot mint thousands.
 */
export const PLAYER_CREATE_RATE: RateLimit = {
	name: 'player-create',
	limit: 20,
	windowMs: 60 * 60 * 1_000,
};
