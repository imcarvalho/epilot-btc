import { rateSlot, type RateLimit } from './rate-limit';
import { MemoryStore } from './testing/memory-store';

const RATE: RateLimit = {
	name: 'test',
	limit: 2,
	windowMs: 1_000,
};

const OTHER: RateLimit = {
	name: 'other',
	limit: 2,
	windowMs: 1_000,
};

describe('rateSlot', () => {
	it('is one counter per window and subject', () => {
		const a = rateSlot(RATE, 'ip-a', 5_000);
		expect(rateSlot(RATE, 'ip-a', 5_999).key).toBe(a.key);
		expect(rateSlot(RATE, 'ip-a', 6_000).key).not.toBe(a.key);
		expect(rateSlot(RATE, 'ip-b', 5_000).key).not.toBe(a.key);
		expect(rateSlot(OTHER, 'ip-a', 5_000).key).not.toBe(a.key);
	});

	it('carries the limit and expires after its window, in epoch seconds', () => {
		const slot = rateSlot(RATE, '', 5_500);
		expect(slot.limit).toBe(2);
		// The window ends at 6 s; the item may go a minute after that.
		expect(slot.expiresAt).toBe(66);
	});
});

describe('takeSlot', () => {
	it('grants exactly the limit, then refuses, even under concurrency', async () => {
		const store = new MemoryStore();
		const slot = rateSlot(RATE, '', 5_000);
		const results = await Promise.all(
			Array.from(
				{
					length: 5,
				},
				() => store.takeSlot(slot),
			),
		);
		expect(results.filter(Boolean)).toHaveLength(2);
	});

	it('starts afresh in the next window', async () => {
		const store = new MemoryStore();
		await store.takeSlot(rateSlot(RATE, '', 5_000));
		await store.takeSlot(rateSlot(RATE, '', 5_100));
		expect(await store.takeSlot(rateSlot(RATE, '', 5_200))).toBe(false);
		expect(await store.takeSlot(rateSlot(RATE, '', 6_000))).toBe(true);
	});
});
