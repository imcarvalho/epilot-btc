/**
 * Engineering spec §3.1: what the stream sends, and when, over the in-memory
 * store and a fake clock that the stream's own sleep advances.
 */

import type { StreamEvent } from '@/lib/contracts';
import { createAnonymousPlayer, placeGuess, type GameDeps } from '@/lib/game';
import type { PricePoint } from '@/lib/settlement';
import { MemoryStore } from '@/lib/testing/memory-store';
import {
	formatEvent,
	MAX_CONSECUTIVE_FAILED_TICKS,
	retryFrame,
	runGameStream,
} from './game-stream';

const T0 = 1_790_000_000_000;

function setup() {
	const store = new MemoryStore();
	let clock = T0;
	let market = 100_000;
	const tape: PricePoint[] = [
		{
			time: T0 - 1_000,
			price: market,
		},
	];
	let ids = 0;
	const deps: GameDeps = {
		store,
		now: () => clock,
		newId: () => `id-${++ids}`,
		random: () => 0,
		fetchPrice: async () => ({
			price: market,
			time: clock,
		}),
		fetchTape: async () => tape.filter((t) => t.time <= clock),
		fetchCandles: vi.fn(async (now: number) => [
			{
				time: now - 60_000,
				low: market,
				high: market,
				open: market,
				close: market,
			},
		]),
	};

	const events: StreamEvent[] = [];
	let open = true;
	/** Called at each tick with the stream's clock, before it sleeps. */
	let onTick: (clock: number) => void = () => {};
	const sink = {
		send: (e: StreamEvent) => events.push(e),
		isOpen: () => open,
	};
	const sleep = async (ms: number) => {
		clock += ms;
		onTick(clock);
	};

	return {
		store,
		deps,
		events,
		sink,
		sleep,
		close: () => (open = false),
		setMarket: (p: number) => {
			market = p;
			tape.push({
				time: clock,
				price: p,
			});
		},
		onTick: (f: (clock: number) => void) => (onTick = f),
		types: () => events.map((e) => e.type),
		count: (type: StreamEvent['type']) =>
			events.filter((e) => e.type === type).length,
	};
}

beforeEach(() => {
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the game stream', () => {
	it('sends the whole screen at once: state, board, the hour', async () => {
		const t = setup();
		const { playerId } = await createAnonymousPlayer(t.deps);
		await runGameStream(t.deps, playerId, t.sink, {
			lifetimeMs: 1,
			sleep: t.sleep,
		});
		expect(t.types()).toEqual(['state', 'leaderboard', 'candles']);
		expect(t.events[0]).toMatchObject({
			type: 'state',
			data: {
				score: 0,
				pendingGuess: null,
			},
		});
	});

	it('sends state every second, carrying a price refreshed every second', async () => {
		const t = setup();
		const { playerId } = await createAnonymousPlayer(t.deps);
		await runGameStream(t.deps, playerId, t.sink, {
			lifetimeMs: 5_000,
			sleep: t.sleep,
		});
		const updated = t.events.flatMap((e) =>
			e.type === 'state' ? [e.data.priceUpdatedAt] : [],
		);
		expect(updated).toEqual([0, 1, 2, 3, 4].map((s) => T0 + s * 1_000));
	});

	it('shows a result within a second of the guess settling', async () => {
		const t = setup();
		const { playerId } = await createAnonymousPlayer(t.deps);
		await placeGuess(t.deps, playerId, 'up');
		t.onTick((clock) => {
			if (clock === T0 + 59_000) {
				t.setMarket(100_050);
			}
		});
		await runGameStream(t.deps, playerId, t.sink, {
			lifetimeMs: 65_000,
			sleep: t.sleep,
		});

		const states = t.events.filter((e) => e.type === 'state');
		const settled = states.findIndex(
			(e) => e.type === 'state' && e.data.pendingGuess === null,
		);
		// One read a second, and the first read after the minute settles it.
		expect(settled).toBe(60);
		expect(states[settled]).toMatchObject({
			data: {
				score: 1,
			},
		});
	});

	it('sends the board again when a result lands', async () => {
		const t = setup();
		const { playerId } = await createAnonymousPlayer(t.deps);
		await placeGuess(t.deps, playerId, 'up');
		t.onTick((clock) => {
			if (clock === T0 + 59_000) {
				t.setMarket(100_050);
			}
		});
		await runGameStream(t.deps, playerId, t.sink, {
			lifetimeMs: 65_000,
			sleep: t.sleep,
		});
		expect(t.count('leaderboard')).toBe(2);
	});

	it('sends the hour only when the shared cache refreshes it', async () => {
		const t = setup();
		const { playerId } = await createAnonymousPlayer(t.deps);
		await runGameStream(t.deps, playerId, t.sink, {
			lifetimeMs: 25_000,
			sleep: t.sleep,
		});
		expect(t.count('candles')).toBe(3);
		expect(t.deps.fetchCandles).toHaveBeenCalledTimes(3);
	});

	it('says once that there is no hour, when Coinbase is down and nothing is cached', async () => {
		const t = setup();
		t.deps.fetchCandles = async () => {
			throw new Error('down');
		};
		const { playerId } = await createAnonymousPlayer(t.deps);
		await runGameStream(t.deps, playerId, t.sink, {
			lifetimeMs: 5_000,
			sleep: t.sleep,
		});
		const candles = t.events.filter((e) => e.type === 'candles');
		expect(candles).toEqual([
			{
				type: 'candles',
				data: null,
			},
		]);
	});

	it('says the player is gone, and ends, if there is no such player', async () => {
		const t = setup();
		await runGameStream(t.deps, 'anon:nobody', t.sink, {
			lifetimeMs: 60_000,
			sleep: t.sleep,
		});
		expect(t.types()).toEqual(['gone']);
	});

	it('stops when the browser leaves', async () => {
		const t = setup();
		const { playerId } = await createAnonymousPlayer(t.deps);
		t.onTick((clock) => {
			if (clock === T0 + 3_000) {
				t.close();
			}
		});
		await runGameStream(t.deps, playerId, t.sink, {
			lifetimeMs: 60_000,
			sleep: t.sleep,
		});
		expect(t.count('state')).toBe(3);
	});
});

describe('the game stream when the store fails', () => {
	it('skips a failed tick and carries on', async () => {
		const t = setup();
		const { playerId } = await createAnonymousPlayer(t.deps);
		const real = t.store.getPlayer.bind(t.store);
		vi.spyOn(t.store, 'getPlayer').mockImplementation(async (id) => {
			if (t.deps.now() === T0 + 1_000) {
				throw new Error('throttled');
			}
			return real(id);
		});
		await runGameStream(t.deps, playerId, t.sink, {
			lifetimeMs: 4_000,
			sleep: t.sleep,
		});
		// Four ticks, one of them failed and sent nothing.
		expect(t.count('state')).toBe(3);
		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining('"event":"stream-tick-failed"'),
		);
	});

	it('retries the board if reading it failed', async () => {
		const t = setup();
		const { playerId } = await createAnonymousPlayer(t.deps);
		vi.spyOn(t.store, 'listTopOfBoard').mockRejectedValueOnce(
			new Error('throttled'),
		);
		await runGameStream(t.deps, playerId, t.sink, {
			lifetimeMs: 3_000,
			sleep: t.sleep,
		});
		expect(t.count('leaderboard')).toBe(1);
	});

	it('ends after too many failed ticks in a row', async () => {
		const t = setup();
		const { playerId } = await createAnonymousPlayer(t.deps);
		vi.spyOn(t.store, 'getPlayer').mockRejectedValue(new Error('down'));
		await runGameStream(t.deps, playerId, t.sink, {
			lifetimeMs: 600_000,
			sleep: t.sleep,
		});
		expect(t.events).toEqual([]);
		expect(console.error).toHaveBeenCalledTimes(MAX_CONSECUTIVE_FAILED_TICKS);
	});

	it('counts only consecutive failures', async () => {
		const t = setup();
		const { playerId } = await createAnonymousPlayer(t.deps);
		const real = t.store.getPlayer.bind(t.store);
		vi.spyOn(t.store, 'getPlayer').mockImplementation(async (id) => {
			// Fail every other tick, far more than the limit in total.
			if (((t.deps.now() - T0) / 1_000) % 2 === 1) {
				throw new Error('throttled');
			}
			return real(id);
		});
		await runGameStream(t.deps, playerId, t.sink, {
			lifetimeMs: 40_000,
			sleep: t.sleep,
		});
		expect(t.count('state')).toBe(20);
	});

	it('still ticks when the candle cache cannot be written', async () => {
		const t = setup();
		const { playerId } = await createAnonymousPlayer(t.deps);
		vi.spyOn(t.store, 'putCachedCandles').mockRejectedValue(
			new Error('throttled'),
		);
		await runGameStream(t.deps, playerId, t.sink, {
			lifetimeMs: 2_000,
			sleep: t.sleep,
		});
		expect(t.count('state')).toBe(2);
		expect(t.count('candles')).toBeGreaterThan(0);
		expect(console.error).not.toHaveBeenCalledWith(
			expect.stringContaining('stream-tick-failed'),
		);
	});
});

describe('retryFrame', () => {
	it('spreads the reconnect hint between one and three seconds', () => {
		expect(retryFrame(() => 0)).toBe('retry: 1000\n\n');
		expect(retryFrame(() => 0.9995)).toBe('retry: 2999\n\n');
	});
});

describe('formatEvent', () => {
	it('writes one SSE frame, typed by its event name', () => {
		expect(
			formatEvent({
				type: 'gone',
				data: null,
			}),
		).toBe('event: gone\ndata: null\n\n');
	});
});
