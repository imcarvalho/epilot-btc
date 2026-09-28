import {
	fetchTickerPrice,
	getGamePrice,
	isStale,
	PRICE_CACHE_MS,
	PRICE_STALE_MS,
	PriceFetchError,
	PRICE_URL,
} from './price';
import { MemoryStore } from './testing/memory-store';

// Recorded from the live endpoint on 27 Sep 2026.
const RECORDED = {
	ask: '84427.21',
	bid: '84427.2',
	volume: '2445.12015628',
	trade_id: 1099156646,
	price: '84427.2',
	size: '0.00000005',
	time: '2026-09-27T16:35:55.472409259Z',
	rfq_volume: '21.634579',
};

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json',
		},
	});

const noSleep = async () => {};

describe('fetchTickerPrice', () => {
	it('parses the recorded Coinbase response', async () => {
		const fetchImpl = vi.fn(async () => json(RECORDED));
		await expect(
			fetchTickerPrice({
				fetchImpl,
				sleep: noSleep,
			}),
		).resolves.toBe(84427.2);
		expect(fetchImpl).toHaveBeenCalledWith(PRICE_URL, expect.anything());
	});

	it('retries a 429 with backoff, then succeeds', async () => {
		const sleep = vi.fn(noSleep);
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(json({}, 429))
			.mockResolvedValueOnce(json(RECORDED));
		await expect(
			fetchTickerPrice({
				fetchImpl,
				sleep,
			}),
		).resolves.toBe(84427.2);
		expect(sleep).toHaveBeenCalledWith(200);
	});

	it('gives up after the retries on a timeout', async () => {
		const sleep = vi.fn(noSleep);
		const fetchImpl = vi.fn(async () => {
			throw new DOMException('The operation timed out.', 'TimeoutError');
		});
		await expect(
			fetchTickerPrice({
				fetchImpl,
				sleep,
				retries: 2,
			}),
		).rejects.toBeInstanceOf(PriceFetchError);
		expect(fetchImpl).toHaveBeenCalledTimes(3);
		expect(sleep.mock.calls).toEqual([[200], [400]]);
	});

	it('rejects a response that is not a ticker', async () => {
		const fetchImpl = vi.fn(async () =>
			json({
				message: 'NotFound',
			}),
		);
		await expect(
			fetchTickerPrice({
				fetchImpl,
				sleep: noSleep,
				retries: 0,
			}),
		).rejects.toBeInstanceOf(PriceFetchError);
	});
});

describe('getGamePrice', () => {
	const T = 1_700_000_000_000;

	it('serves the cached price while it is fresh, without fetching', async () => {
		const store = new MemoryStore();
		store.price = {
			price: 100,
			updatedAt: T,
		};
		const fetchPrice = vi.fn(async () => 200);
		const price = await getGamePrice({
			store,
			fetchPrice,
			now: () => T + PRICE_CACHE_MS - 1,
		});
		expect(price).toEqual({
			price: 100,
			updatedAt: T,
		});
		expect(fetchPrice).not.toHaveBeenCalled();
	});

	it('refreshes and stores the price once the cache window has passed', async () => {
		const store = new MemoryStore();
		store.price = {
			price: 100,
			updatedAt: T,
		};
		const now = T + PRICE_CACHE_MS;
		const price = await getGamePrice({
			store,
			fetchPrice: async () => 200,
			now: () => now,
		});
		expect(price).toEqual({
			price: 200,
			updatedAt: now,
		});
		expect(store.price).toEqual({
			price: 200,
			updatedAt: now,
		});
	});

	it('falls back to the last known price, with its own timestamp, when the fetch fails', async () => {
		const store = new MemoryStore();
		store.price = {
			price: 100,
			updatedAt: T,
		};
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const fetchPrice = async () => {
			throw new PriceFetchError('down');
		};
		const price = await getGamePrice({
			store,
			fetchPrice,
			now: () => T + 30_000,
		});
		expect(price).toEqual({
			price: 100,
			updatedAt: T,
		});
	});

	it('returns null when there has never been a price and the fetch fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const fetchPrice = async () => {
			throw new PriceFetchError('down');
		};
		await expect(
			getGamePrice({
				store: new MemoryStore(),
				fetchPrice,
				now: () => T,
			}),
		).resolves.toBeNull();
	});
});

describe('isStale', () => {
	it('treats a missing price as stale', () => {
		expect(isStale(null, 0)).toBe(true);
	});

	it('is fresh up to and including the threshold, stale after it', () => {
		expect(
			isStale(
				{
					price: 1,
					updatedAt: 0,
				},
				PRICE_STALE_MS,
			),
		).toBe(false);
		expect(
			isStale(
				{
					price: 1,
					updatedAt: 0,
				},
				PRICE_STALE_MS + 1,
			),
		).toBe(true);
	});
});
