/**
 * Engineering spec §9: the cycle end to end over a store with DynamoDB's
 * conditional semantics - a double guess is refused, resolution is
 * idempotent, a stale price blocks it, and the sweep picks up a guess left
 * by a closed browser exactly once, even when it races the player's own read.
 * And §6.2: first sign-in carries the anonymous player over exactly once.
 */

import {
	createAnonymousPlayer,
	getState,
	placeGuess,
	signIn,
	sweep,
	type GameDeps,
} from './game';
import { getLeaderboard } from './leaderboard';
import { PRICE_FAILURE_MS, PRICE_STALE_MS } from './price';
import type { PricePoint } from './settlement';
import { MemoryStore } from './testing/memory-store';

const T0 = 1_700_000_000_000;

function setup(initialPrice = 100_000) {
	const store = new MemoryStore();
	let clock = T0;
	let market = initialPrice;
	// Every price the market has traded at, in time order: what the trade
	// history would show. The ticker is its last entry.
	const tape: PricePoint[] = [
		{
			time: T0 - 1_000,
			price: initialPrice,
		},
	];
	let feedUp = true;
	// How long a ticker read takes, on the server's clock.
	let latency = 0;
	let ids = 0;

	const deps: GameDeps = {
		store,
		fetchCandles: async () => [],
		now: () => clock,
		newId: () => `id-${++ids}`,
		random: () => 0,
		fetchPrice: async () => {
			clock += latency;
			if (!feedUp) {
				throw new Error('feed down');
			}
			const last = tape[tape.length - 1];
			return {
				price: market,
				time: last.time,
			};
		},
		fetchTape: vi.fn(async (from: number) => {
			if (!feedUp) {
				throw new Error('feed down');
			}
			// Like Coinbase: from the last trade at or before `from` to now.
			const start = tape.findLastIndex((t) => t.time <= from);
			return tape.slice(Math.max(start, 0)).filter((t) => t.time <= clock);
		}),
	};

	return {
		store,
		deps,
		advance: (ms: number) => (clock += ms),
		setMarket: (p: number) => {
			market = p;
			tape.push({
				time: clock,
				price: p,
			});
		},
		setFeed: (up: boolean) => (feedUp = up),
		setLatency: (ms: number) => (latency = ms),
	};
}

beforeEach(() => {
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('a new player', () => {
	it('starts at 0 with a generated name and nothing pending (R7)', async () => {
		const { deps } = setup();
		const player = await createAnonymousPlayer(deps);
		expect(player.playerId).toMatch(/^anon:/);

		const state = await getState(deps, player.playerId);
		expect(state).toMatchObject({
			publicName: 'AudaciousBadger',
			score: 0,
			stats: {
				wins: 0,
				losses: 0,
				currentStreak: 0,
				previousStreak: 0,
				bestStreak: 0,
			},
			price: 100_000,
			priceStale: false,
			pendingGuess: null,
			lastResult: null,
			history: [],
		});
	});

	it('is unknown until created', async () => {
		const { deps } = setup();
		await expect(getState(deps, 'anon:nobody')).resolves.toBeNull();
	});
});

describe('placing a guess', () => {
	it("locks in the server's price and the server's time", async () => {
		const { deps } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);

		const result = await placeGuess(deps, playerId, 'up');
		expect(result).toEqual({
			kind: 'started',
			serverNow: T0,
			pendingGuess: {
				id: expect.any(String),
				direction: 'up',
				priceAtGuess: 100_000,
				createdAt: T0,
			},
		});
	});

	it('refuses a second guess while one is pending (R3)', async () => {
		const { deps } = setup();
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');
		await expect(placeGuess(deps, playerId, 'down')).resolves.toEqual({
			kind: 'guess-pending',
		});
	});

	it('lets exactly one of two simultaneous guesses through', async () => {
		const { deps, store } = setup();
		const { playerId } = await createAnonymousPlayer(deps);

		const results = await Promise.all([
			placeGuess(deps, playerId, 'up'),
			placeGuess(deps, playerId, 'down'),
		]);
		expect(results.map((r) => r.kind).sort()).toEqual([
			'guess-pending',
			'started',
		]);
		const started = results.find((r) => r.kind === 'started')!;
		expect(store.players.get(playerId)!.pendingGuess!.id).toBe(
			started.kind === 'started' && started.pendingGuess.id,
		);
	});

	it('refuses a guess for a player that does not exist', async () => {
		const { deps } = setup();
		await expect(placeGuess(deps, 'anon:nobody', 'up')).resolves.toEqual({
			kind: 'no-player',
		});
	});

	it('refuses a guess when the only price is stale', async () => {
		const { deps, advance, setFeed } = setup();
		const { playerId } = await createAnonymousPlayer(deps);
		await getState(deps, playerId); // primes the cache
		setFeed(false);
		advance(PRICE_STALE_MS + 1);
		await expect(placeGuess(deps, playerId, 'up')).resolves.toEqual({
			kind: 'price-unavailable',
		});
	});

	it('locks in at the market now, not at a cached price the player could see', async () => {
		const { deps, store, advance, setMarket } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await getState(deps, playerId); // the screen shows 100,000
		advance(4_000); // still inside the cache window
		setMarket(100_050); // the market has visibly moved up since

		const result = await placeGuess(deps, playerId, 'up');
		expect(result).toMatchObject({
			kind: 'started',
			pendingGuess: {
				priceAtGuess: 100_050,
				createdAt: T0 + 4_000,
			},
		});
		// And everyone else's screen gets the fresh price too.
		expect(store.price).toEqual({
			price: 100_050,
			updatedAt: T0 + 4_000,
		});
	});

	it('refuses a guess when the market cannot be read, even with a fresh cached price', async () => {
		const { deps, advance, setFeed } = setup();
		const { playerId } = await createAnonymousPlayer(deps);
		await getState(deps, playerId); // primes the cache
		advance(1_000);
		setFeed(false);
		await expect(placeGuess(deps, playerId, 'up')).resolves.toEqual({
			kind: 'price-unavailable',
		});
	});

	it('starts the minute when the locked price stood, not when the read came back', async () => {
		const { deps, setLatency } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		setLatency(800);

		// The last trade is from before the request, so it still stood at T0.
		const result = await placeGuess(deps, playerId, 'up');
		expect(result).toMatchObject({
			kind: 'started',
			serverNow: T0 + 800,
			pendingGuess: {
				createdAt: T0,
			},
		});
	});

	it('does not read the market for a guess it would refuse anyway', async () => {
		const { deps } = setup();
		const fetchPrice = vi.spyOn(deps, 'fetchPrice');
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');
		expect(fetchPrice).toHaveBeenCalledTimes(1);

		await placeGuess(deps, playerId, 'down');
		await placeGuess(deps, 'anon:nobody', 'down');
		expect(fetchPrice).toHaveBeenCalledTimes(1);
	});
});

describe('resolving on read', () => {
	it('does not resolve during the minute, however far the price moved', async () => {
		const { deps, advance, setMarket } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');

		advance(59_000);
		setMarket(150_000);
		const state = await getState(deps, playerId);
		expect(state!.pendingGuess).not.toBeNull();
		expect(state!.score).toBe(0);
	});

	it('resolves a correct guess after the minute, once the price has moved', async () => {
		const { deps, advance, setMarket } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');

		advance(60_000);
		setMarket(100_010);
		const state = await getState(deps, playerId);
		expect(state).toMatchObject({
			score: 1,
			pendingGuess: null,
			stats: {
				wins: 1,
				losses: 0,
				currentStreak: 1,
				bestStreak: 1,
			},
			lastResult: {
				direction: 'up',
				priceAtGuess: 100_000,
				priceAtResolve: 100_010,
				delta: 1,
			},
		});
		expect(state!.history).toHaveLength(1);
	});

	it('resolves a wrong guess as -1', async () => {
		const { deps, advance, setMarket } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');

		advance(60_000);
		setMarket(99_990);
		const state = await getState(deps, playerId);
		expect(state).toMatchObject({
			score: -1,
			stats: {
				losses: 1,
				currentStreak: -1,
			},
		});
	});

	it('keeps the guess in play while the price is unchanged after the minute (R4)', async () => {
		const { deps, advance } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');

		advance(120_000);
		const state = await getState(deps, playerId);
		expect(state!.pendingGuess).not.toBeNull();
		expect(state!.score).toBe(0);
	});

	it('settles against the price at the deadline, however late the ask', async () => {
		const { deps, advance, setMarket } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');

		advance(59_000);
		setMarket(100_010); // the price standing at t+60s
		advance(20_000);
		setMarket(99_000); // a player who waits has nothing better to find
		advance(10_000);

		const state = await getState(deps, playerId);
		expect(state).toMatchObject({
			score: 1,
			lastResult: {
				priceAtResolve: 100_010,
				resolvedAt: T0 + 60_000,
				delta: 1,
			},
		});
	});

	it('cannot be talked out of a loss by asking later', async () => {
		const { deps, advance, setMarket } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');

		advance(59_000);
		setMarket(99_990); // behind at the deadline
		advance(30_000);
		setMarket(100_500); // ahead by the time the player asks

		const state = await getState(deps, playerId);
		expect(state).toMatchObject({
			score: -1,
			lastResult: {
				priceAtResolve: 99_990,
				delta: -1,
			},
		});
	});

	it('settles an unchanged price on the first trade that moves it (R4)', async () => {
		const { deps, advance, setMarket } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'down');

		advance(75_000);
		setMarket(99_950); // the first move after the deadline
		advance(5_000);
		setMarket(100_400);

		const state = await getState(deps, playerId);
		expect(state).toMatchObject({
			score: 1,
			lastResult: {
				priceAtResolve: 99_950,
				resolvedAt: T0 + 75_000,
			},
		});
	});

	it('does not read the trade history during the minute', async () => {
		const { deps, advance } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');
		advance(59_999);
		await getState(deps, playerId);
		expect(deps.fetchTape).not.toHaveBeenCalled();
	});

	it('blocks resolution on a stale feed and says so', async () => {
		const { deps, advance, setMarket, setFeed } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');

		setMarket(100_010);
		setFeed(false);
		advance(60_000);
		const state = await getState(deps, playerId);
		expect(state).toMatchObject({
			priceStale: true,
			price: 100_000,
			score: 0,
		});
		expect(state!.pendingGuess).not.toBeNull();

		setFeed(true);
		advance(PRICE_FAILURE_MS);
		const recovered = await getState(deps, playerId);
		expect(recovered).toMatchObject({
			priceStale: false,
			score: 1,
			pendingGuess: null,
		});
	});

	it('resolves exactly once when several reads race', async () => {
		const { deps, store, advance, setMarket } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');
		advance(60_000);
		setMarket(100_010);

		const states = await Promise.all(
			[1, 2, 3].map(() => getState(deps, playerId)),
		);
		expect(store.settleWrites).toBe(1);
		for (const state of states) {
			expect(state).toMatchObject({
				score: 1,
				pendingGuess: null,
			});
		}
		expect(store.players.get(playerId)!.history).toHaveLength(1);
	});

	it('allows a new guess once the last one has resolved', async () => {
		const { deps, advance, setMarket } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');
		advance(60_000);
		setMarket(100_010);
		await getState(deps, playerId);

		const next = await placeGuess(deps, playerId, 'down');
		expect(next).toMatchObject({
			kind: 'started',
			pendingGuess: {
				priceAtGuess: 100_010,
			},
		});
	});
});

describe('the sweep', () => {
	it('does nothing, cheaply, when nothing is outstanding', async () => {
		const { deps } = setup();
		await createAnonymousPlayer(deps);
		await expect(sweep(deps)).resolves.toEqual({
			due: 0,
			resolved: 0,
			priceStale: false,
		});
		expect(deps.fetchTape).not.toHaveBeenCalled();
	});

	it('resolves a guess left behind by a closed browser', async () => {
		const { deps, store, advance, setMarket } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'down');

		advance(61_000);
		setMarket(99_000);
		await expect(sweep(deps)).resolves.toEqual({
			due: 1,
			resolved: 1,
			priceStale: false,
		});
		expect(store.players.get(playerId)).toMatchObject({
			score: 1,
			pendingGuess: null,
		});

		// Coming back tomorrow shows the result that settled while away.
		const state = await getState(deps, playerId);
		expect(state).toMatchObject({
			score: 1,
			lastResult: {
				direction: 'down',
				delta: 1,
			},
		});
	});

	it('leaves guesses younger than a minute alone', async () => {
		const { deps, advance, setMarket } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');
		advance(30_000);
		setMarket(100_010);
		await expect(sweep(deps)).resolves.toMatchObject({
			due: 0,
			resolved: 0,
		});
	});

	it('resolves nothing on a stale feed', async () => {
		const { deps, advance, setFeed } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');
		setFeed(false);
		advance(61_000);
		await expect(sweep(deps)).resolves.toEqual({
			due: 1,
			resolved: 0,
			priceStale: true,
		});
	});

	it("settles exactly once when it races the player's own read", async () => {
		const { deps, store, advance, setMarket } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');
		advance(61_000);
		setMarket(100_010);

		const [swept, state] = await Promise.all([
			sweep(deps),
			getState(deps, playerId),
		]);
		expect(store.settleWrites).toBe(1);
		expect(state).toMatchObject({
			score: 1,
			pendingGuess: null,
		});
		expect(swept.due).toBe(1);
		expect(store.players.get(playerId)).toMatchObject({
			score: 1,
			wins: 1,
		});
	});
});

describe('signing in (§6.2)', () => {
	/** An anonymous player with one resolved win and a guess in play. */
	let rising = 100_000;
	async function anonWithHistory(t: ReturnType<typeof setup>) {
		const anon = await createAnonymousPlayer(t.deps);
		await placeGuess(t.deps, anon.playerId, 'up');
		t.advance(60_000);
		t.setMarket((rising += 10));
		await getState(t.deps, anon.playerId);
		await placeGuess(t.deps, anon.playerId, 'down');
		return anon;
	}

	it('promotes the anonymous player: score, history and the pending guess move across', async () => {
		const t = setup();
		const anon = await anonWithHistory(t);

		await expect(signIn(t.deps, 'sub-1', anon.playerId)).resolves.toBe(
			'promoted',
		);

		const state = await getState(t.deps, 'google:sub-1');
		expect(state).toMatchObject({
			publicName: anon.publicName,
			score: 1,
			stats: {
				wins: 1,
			},
			pendingGuess: {
				direction: 'down',
			},
		});
		expect(state!.history).toHaveLength(1);
		expect(t.store.players.has(anon.playerId)).toBe(false);
	});

	it('puts the signed-in player on the board, counted once', async () => {
		const t = setup();
		const anon = await anonWithHistory(t);
		await signIn(t.deps, 'sub-1', anon.playerId);

		const board = await getLeaderboard(t.deps, 'google:sub-1');
		expect(board).toMatchObject({
			total: 1,
			isEligible: true,
		});
		expect(board.podium[0]).toMatchObject({
			score: 1,
			isYou: true,
		});
	});

	it('still settles a guess that was pending when it moved across', async () => {
		const t = setup();
		const anon = await anonWithHistory(t);
		await signIn(t.deps, 'sub-1', anon.playerId);

		t.advance(60_000);
		t.setMarket(99_000);
		await expect(sweep(t.deps)).resolves.toMatchObject({
			resolved: 1,
		});
		expect(t.store.players.get('google:sub-1')!.score).toBe(2);
	});

	it('keeps an existing account as it is, and leaves the anonymous record alone', async () => {
		const t = setup();
		const first = await anonWithHistory(t);
		await signIn(t.deps, 'sub-1', first.playerId);

		// A second browser, with its own anonymous progress.
		const second = await anonWithHistory(t);
		await expect(signIn(t.deps, 'sub-1', second.playerId)).resolves.toBe(
			'kept-existing',
		);
		expect(t.store.players.get('google:sub-1')!.score).toBe(1);
		expect(t.store.players.get(second.playerId)!.score).toBe(1);
	});

	it('says nothing extra when the browser had not played', async () => {
		const t = setup();
		await signIn(t.deps, 'sub-1', null);
		const fresh = await createAnonymousPlayer(t.deps);
		await expect(signIn(t.deps, 'sub-1', fresh.playerId)).resolves.toBe(
			'returning',
		);
	});

	it('creates a fresh account, on the board at 0, for a browser with no player', async () => {
		const t = setup();
		await expect(signIn(t.deps, 'sub-1', null)).resolves.toBe('created');
		expect(t.store.players.get('google:sub-1')).toMatchObject({
			score: 0,
			onBoard: true,
			publicName: 'AudaciousBadger',
		});
	});

	it('merges exactly once when two sign-ins race', async () => {
		const t = setup();
		const anon = await anonWithHistory(t);
		const outcomes = await Promise.all([
			signIn(t.deps, 'sub-1', anon.playerId),
			signIn(t.deps, 'sub-1', anon.playerId),
		]);
		expect(outcomes.sort()).toEqual(['promoted', 'returning']);
		const board = await getLeaderboard(t.deps, 'google:sub-1');
		expect(board.total).toBe(1);
		expect(t.store.players.get('google:sub-1')!.score).toBe(1);
	});

	it('retries when the anonymous record changes mid-merge, losing nothing', async () => {
		const t = setup();
		const anon = await anonWithHistory(t);
		t.advance(60_000);
		t.setMarket(99_000);

		// The sweep settles the pending guess between sign-in's read and its
		// write, so the first merge is refused and sign-in has to read again.
		const create = t.store.createSignedInPlayer.bind(t.store);
		const merge = vi
			.spyOn(t.store, 'createSignedInPlayer')
			.mockImplementationOnce(async (player, replacing) => {
				await sweep(t.deps);
				return create(player, replacing);
			});

		const outcome = await signIn(t.deps, 'sub-1', anon.playerId);
		expect(outcome).toBe('promoted');
		expect(merge).toHaveBeenCalledTimes(2);
		const account = t.store.players.get('google:sub-1')!;
		expect(account.wins + account.losses).toBe(2);
		expect(account.pendingGuess).toBeNull();
	});

	it('retries when a transaction conflicts with another, and lands once', async () => {
		const t = setup();
		const anon = await anonWithHistory(t);
		t.store.signInConflicts = 2;

		await expect(signIn(t.deps, 'sub-1', anon.playerId)).resolves.toBe(
			'promoted',
		);
		expect(t.store.signInConflicts).toBe(0);
		expect(t.store.boardTotal).toBe(1);
		expect(t.store.players.get('google:sub-1')!.score).toBe(1);
		expect(t.store.players.has(anon.playerId)).toBe(false);
	});

	it('gives up, writing nothing, when the conflicts do not stop', async () => {
		const t = setup();
		t.store.signInConflicts = 100;
		await expect(signIn(t.deps, 'sub-1', null)).rejects.toThrow(
			'sign-in kept conflicting',
		);
		expect(t.store.players.has('google:sub-1')).toBe(false);
		expect(t.store.boardTotal).toBe(0);
	});

	it('writes a rejoining account back without moving the board total', async () => {
		const t = setup();
		await signIn(t.deps, 'sub-1', null);
		t.store.players.delete('google:sub-1');

		await expect(
			signIn(t.deps, 'sub-1', null, {
				rejoin: true,
			}),
		).resolves.toBe('created');
		expect(t.store.players.get('google:sub-1')!.onBoard).toBe(true);
		expect(t.store.boardTotal).toBe(1);
	});

	it('ignores an id that is not anonymous', async () => {
		const t = setup();
		await signIn(t.deps, 'victim', null);
		await expect(signIn(t.deps, 'sub-1', 'google:victim')).resolves.toBe(
			'created',
		);
		expect(t.store.players.has('google:victim')).toBe(true);
	});
});
