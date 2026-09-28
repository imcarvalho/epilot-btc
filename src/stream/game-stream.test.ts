/**
 * Engineering spec §3.1: what the stream sends, and when, over the in-memory
 * store and a fake clock that the stream's own sleep advances.
 */

import type { StreamEvent } from '@/lib/contracts';
import { createAnonymousPlayer, placeGuess, type GameDeps } from '@/lib/game';
import type { PricePoint } from '@/lib/settlement';
import { MemoryStore } from '@/lib/testing/memory-store';
import { formatEvent, runGameStream } from './game-stream';

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
	it('sends the whole screen at once: state, board, price, the hour', async () => {
		const t = setup();
		const { playerId } = await createAnonymousPlayer(t.deps);
		await runGameStream(t.deps, playerId, t.sink, {
			lifetimeMs: 1,
			sleep: t.sleep,
		});
		expect(t.types()).toEqual(['state', 'leaderboard', 'price', 'candles']);
		expect(t.events[0]).toMatchObject({
			type: 'state',
			data: {
				score: 0,
				pendingGuess: null,
			},
		});
	});

	it('re-reads state every ten seconds with nothing in play, not every second', async () => {
		const t = setup();
		const { playerId } = await createAnonymousPlayer(t.deps);
		await runGameStream(t.deps, playerId, t.sink, {
			lifetimeMs: 25_000,
			sleep: t.sleep,
		});
		expect(t.count('state')).toBe(3);
		// The price moves on every tick, once the one-second cache has passed.
		expect(t.count('price')).toBe(25);
	});

	it('re-reads state every second while a guess is in play, so a result arrives at once', async () => {
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
		// One read a second while in play, and the first read after the minute settles it.
		expect(settled).toBe(60);
		expect(states[settled]).toMatchObject({
			data: {
				score: 1,
			},
		});
		// Then back to the idle rhythm.
		expect(states.length).toBe(61);
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
		expect(t.count('price')).toBe(3);
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
