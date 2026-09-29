/**
 * Engineering spec §5, "Bounding Coinbase calls": however many players
 * guess, fresh ticker reads are capped globally, and a read under a quarter
 * of a second old is shared rather than repeated.
 */

import { createAnonymousPlayer, placeGuess, type GameDeps } from './game';
import { LOCK_PRICE_REUSE_MS } from './price';
import { PRICE_READ_RATE } from './rate-limit';
import { MemoryStore } from './testing/memory-store';

const T0 = 1_700_000_000_000;

function setup() {
	const store = new MemoryStore();
	let clock = T0;
	let ids = 0;
	let price = 100_000;
	const fetchPrice = vi.fn(async () => ({
		price,
		time: clock,
	}));
	const deps: GameDeps = {
		store,
		fetchCandles: async () => [],
		now: () => clock,
		newId: () => `id-${++ids}`,
		random: () => 0,
		fetchPrice,
		fetchTape: async () => [],
	};
	return {
		deps,
		store,
		fetchPrice,
		advance: (ms: number) => (clock += ms),
		setPrice: (p: number) => (price = p),
	};
}

async function players(deps: GameDeps, count: number): Promise<string[]> {
	return Promise.all(
		Array.from(
			{
				length: count,
			},
			async () => (await createAnonymousPlayer(deps)).playerId,
		),
	);
}

describe('locking a guess under the global cap', () => {
	it('caps Coinbase calls for a burst of simultaneous guesses at the limit', async () => {
		const { deps, fetchPrice } = setup();
		const ids = await players(deps, 10);

		const results = await Promise.all(
			ids.map((id) => placeGuess(deps, id, 'up')),
		);

		expect(fetchPrice).toHaveBeenCalledTimes(PRICE_READ_RATE.limit);
		expect(results.filter((r) => r.kind === 'started')).toHaveLength(
			PRICE_READ_RATE.limit,
		);
		expect(results.filter((r) => r.kind === 'price-unavailable')).toHaveLength(
			10 - PRICE_READ_RATE.limit,
		);
	});

	it('locks at a read under the reuse bound, at the time that price stood', async () => {
		const { deps, fetchPrice, advance, setPrice } = setup();
		const [first, second] = await players(deps, 2);
		await placeGuess(deps, first, 'up');
		expect(fetchPrice).toHaveBeenCalledTimes(1);

		advance(LOCK_PRICE_REUSE_MS);
		setPrice(100_500);
		const result = await placeGuess(deps, second, 'down');

		expect(fetchPrice).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({
			kind: 'started',
			pendingGuess: {
				priceAtGuess: 100_000,
				createdAt: T0,
			},
		});
	});

	it('never locks at a read older than the reuse bound', async () => {
		const { deps, fetchPrice, advance, setPrice } = setup();
		const [first, second] = await players(deps, 2);
		await placeGuess(deps, first, 'up');

		advance(LOCK_PRICE_REUSE_MS + 1);
		setPrice(100_500);
		const result = await placeGuess(deps, second, 'down');

		expect(fetchPrice).toHaveBeenCalledTimes(2);
		expect(result).toMatchObject({
			kind: 'started',
			pendingGuess: {
				priceAtGuess: 100_500,
				createdAt: T0 + LOCK_PRICE_REUSE_MS + 1,
			},
		});
	});

	it('refuses as price-unavailable, calling nobody, once the window has no slot and no read is fresh', async () => {
		const { deps, fetchPrice, advance } = setup();
		// Spread across the window so no read is reusable: each is older than
		// the bound by the time the next guess arrives.
		const ids = await players(deps, PRICE_READ_RATE.limit + 1);
		const kinds: string[] = [];
		for (const id of ids) {
			kinds.push((await placeGuess(deps, id, 'up')).kind);
			advance(LOCK_PRICE_REUSE_MS + 1);
		}

		expect(kinds.slice(0, PRICE_READ_RATE.limit)).toEqual(
			Array(PRICE_READ_RATE.limit).fill('started'),
		);
		expect(kinds[PRICE_READ_RATE.limit]).toBe('price-unavailable');
		expect(fetchPrice).toHaveBeenCalledTimes(PRICE_READ_RATE.limit);
	});

	it('serves guesses again in the next window', async () => {
		const { deps, advance } = setup();
		const ids = await players(deps, PRICE_READ_RATE.limit + 2);
		for (const id of ids.slice(0, PRICE_READ_RATE.limit)) {
			await placeGuess(deps, id, 'up');
			advance(LOCK_PRICE_REUSE_MS + 1);
		}
		const capped = await placeGuess(deps, ids[PRICE_READ_RATE.limit], 'up');
		expect(capped.kind).toBe('price-unavailable');

		advance(PRICE_READ_RATE.windowMs);
		const later = await placeGuess(deps, ids[PRICE_READ_RATE.limit], 'up');
		expect(later.kind).toBe('started');
	});

	it('does not spend a slot on a player who cannot guess', async () => {
		const { deps, store } = setup();
		const [id] = await players(deps, 1);
		await placeGuess(deps, id, 'up');
		const before = [...store.slots.values()].reduce((a, b) => a + b, 0);
		await placeGuess(deps, id, 'down');
		await placeGuess(deps, 'anon:nobody', 'down');
		expect([...store.slots.values()].reduce((a, b) => a + b, 0)).toBe(before);
	});
});
