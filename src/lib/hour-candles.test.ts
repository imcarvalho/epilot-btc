import { getHourCandles } from './hour-candles';
import type { Candle } from './candles';
import { fromAnotherInstance, MemoryStore } from './testing/memory-store';

const T = 1_700_000_000_000;

const HOUR: Candle[] = [
	{
		time: T - 60_000,
		low: 99,
		high: 101,
		open: 100,
		close: 100,
	},
];

const OLD = {
	candles: [],
	updatedAt: T - 60_000,
};

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getHourCandles', () => {
	it('serves a fresh cache without calling Coinbase', async () => {
		const store = new MemoryStore();
		store.candles = {
			candles: HOUR,
			updatedAt: T - 9_000,
		};
		const fetchCandles = vi.fn(async () => HOUR);
		await expect(
			getHourCandles({
				store,
				fetchCandles,
				now: () => T,
			}),
		).resolves.toEqual(store.candles);
		expect(fetchCandles).not.toHaveBeenCalled();
	});

	it('refreshes a stale cache, and stores what it fetched', async () => {
		const store = new MemoryStore();
		store.candles = OLD;
		await expect(
			getHourCandles({
				store,
				fetchCandles: async () => HOUR,
				now: () => T,
			}),
		).resolves.toEqual({
			candles: HOUR,
			updatedAt: T,
		});
		expect(store.candles).toEqual({
			candles: HOUR,
			updatedAt: T,
		});
	});

	it('lets one instance refresh while the others serve the cache', async () => {
		const store = new MemoryStore();
		store.candles = OLD;
		const fetchCandles = vi.fn(async () => HOUR);
		const hours = await Promise.all(
			[store, fromAnotherInstance(store), fromAnotherInstance(store)].map((s) =>
				getHourCandles({
					store: s,
					fetchCandles,
					now: () => T,
				}),
			),
		);
		expect(fetchCandles).toHaveBeenCalledTimes(1);
		expect(hours.filter((h) => h?.updatedAt === OLD.updatedAt)).toHaveLength(2);
	});

	it('after a failure, serves the last hour and does not call again until the next window', async () => {
		const store = new MemoryStore();
		store.candles = OLD;
		const fetchCandles = vi.fn(async (): Promise<Candle[]> => {
			throw new Error('Coinbase candles responded 429');
		});
		for (let ms = 0; ms < 10_000; ms += 1_000) {
			await expect(
				getHourCandles({
					store,
					fetchCandles,
					now: () => T + ms,
				}),
			).resolves.toEqual(OLD);
		}
		expect(fetchCandles).toHaveBeenCalledTimes(1);
		await getHourCandles({
			store,
			fetchCandles,
			now: () => T + 10_000,
		});
		expect(fetchCandles).toHaveBeenCalledTimes(2);
	});
});
