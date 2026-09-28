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
import { PRICE_STALE_MS } from './price';
import { MemoryStore } from './testing/memory-store';

const T0 = 1_700_000_000_000;

function setup(initialPrice = 100_000) {
	const store = new MemoryStore();
	let clock = T0;
	let market = initialPrice;
	let feedUp = true;
	let ids = 0;

	const deps: GameDeps = {
		store,
		now: () => clock,
		newId: () => `id-${++ids}`,
		random: () => 0,
		fetchPrice: async () => {
			if (!feedUp) {
				throw new Error('feed down');
			}
			return market;
		},
	};

	return {
		store,
		deps,
		advance: (ms: number) => (clock += ms),
		setMarket: (p: number) => (market = p),
		setFeed: (up: boolean) => (feedUp = up),
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
			stats: { wins: 1, losses: 0, currentStreak: 1, bestStreak: 1 },
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
			stats: { losses: 1, currentStreak: -1 },
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

	it('does not settle against a cached price observed before the minute was up', async () => {
		const { deps, advance, setMarket } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');

		advance(58_000);
		setMarket(100_010);
		await getState(deps, playerId); // caches 100_010, observed at t+58s
		advance(3_000); // t+61s, but the cached price is still inside its window

		const state = await getState(deps, playerId);
		expect(state!.pendingGuess).not.toBeNull();
	});

	it('blocks resolution on a stale feed and says so', async () => {
		const { deps, advance, setMarket, setFeed } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');

		setMarket(100_010);
		setFeed(false);
		advance(60_000);
		const state = await getState(deps, playerId);
		expect(state).toMatchObject({ priceStale: true, price: 100_000, score: 0 });
		expect(state!.pendingGuess).not.toBeNull();

		setFeed(true);
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
			expect(state).toMatchObject({ score: 1, pendingGuess: null });
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
			pendingGuess: { priceAtGuess: 100_010 },
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
			lastResult: { direction: 'down', delta: 1 },
		});
	});

	it('leaves guesses younger than a minute alone', async () => {
		const { deps, advance, setMarket } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');
		advance(30_000);
		setMarket(100_010);
		await expect(sweep(deps)).resolves.toMatchObject({ due: 0, resolved: 0 });
	});

	it('resolves nothing on a stale feed', async () => {
		const { deps, advance, setFeed } = setup(100_000);
		const { playerId } = await createAnonymousPlayer(deps);
		await placeGuess(deps, playerId, 'up');
		setFeed(false);
		advance(61_000);
		await expect(sweep(deps)).resolves.toEqual({
			due: 0,
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
		expect(state).toMatchObject({ score: 1, pendingGuess: null });
		expect(swept.due).toBe(1);
		expect(store.players.get(playerId)).toMatchObject({ score: 1, wins: 1 });
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
			stats: { wins: 1 },
			pendingGuess: { direction: 'down' },
		});
		expect(state!.history).toHaveLength(1);
		expect(t.store.players.has(anon.playerId)).toBe(false);
	});

	it('puts the signed-in player on the board, counted once', async () => {
		const t = setup();
		const anon = await anonWithHistory(t);
		await signIn(t.deps, 'sub-1', anon.playerId);

		const board = await getLeaderboard(t.deps, 'google:sub-1');
		expect(board).toMatchObject({ total: 1, isEligible: true });
		expect(board.podium[0]).toMatchObject({ score: 1, isYou: true });
	});

	it('still settles a guess that was pending when it moved across', async () => {
		const t = setup();
		const anon = await anonWithHistory(t);
		await signIn(t.deps, 'sub-1', anon.playerId);

		t.advance(60_000);
		t.setMarket(99_000);
		await expect(sweep(t.deps)).resolves.toMatchObject({ resolved: 1 });
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

		// The sweep settles the pending guess while sign-in is reading.
		const [outcome] = await Promise.all([
			signIn(t.deps, 'sub-1', anon.playerId),
			sweep(t.deps),
		]);
		expect(outcome).toBe('promoted');
		const account = t.store.players.get('google:sub-1')!;
		expect(account.wins + account.losses).toBe(2);
		expect(account.pendingGuess).toBeNull();
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
