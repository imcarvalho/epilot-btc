/**
 * Engineering spec §9, "Names and leaderboard": anonymous players are not on
 * the board; negative scores order correctly; equal scores share a rank and
 * the next rank skips; a podium player gets no duplicate row; no response
 * carries a player id or anything but the generated name.
 */

import type { GameDeps } from './game';
import { newPlayerRecord } from './game';
import {
	PODIUM_CACHE_MS,
	getLeaderboard,
	ordinal,
	placeSentence,
} from './leaderboard';
import { MemoryStore } from './testing/memory-store';

const T0 = 1_790_000_000_000;

function setup() {
	const store = new MemoryStore();
	let clock = T0;
	const deps: GameDeps = {
		store,
		fetchCandles: async () => [],
		now: () => clock,
		newId: () => 'id',
		fetchPrice: async () => ({
			price: 100_000,
			time: clock,
		}),
		fetchTape: async () => [],
	};
	const add = (
		id: string,
		score: number,
		{ onBoard = true, wins = Math.max(0, score), losses = 0 } = {},
	) => {
		store.players.set(id, {
			...newPlayerRecord(id, `P_${id.split(':')[1]}`, T0),
			score,
			wins,
			losses,
			onBoard,
		});
	};
	return {
		store,
		deps,
		add,
		advance: (ms: number) => (clock += ms),
	};
}

describe('getLeaderboard', () => {
	it('is empty, with nobody eligible, before anyone is on the board', async () => {
		const { deps, add } = setup();
		add('anon:a', 5, {
			onBoard: false,
		});
		await expect(getLeaderboard(deps, 'anon:a')).resolves.toEqual({
			podium: [],
			you: null,
			total: 0,
			isEligible: false,
		});
	});

	it('never lists anonymous players, however well they score', async () => {
		const { deps, add } = setup();
		add('anon:a', 99, {
			onBoard: false,
		});
		add('google:b', 3);
		const board = await getLeaderboard(deps, 'anon:a');
		expect(board.podium.map((r) => r.publicName)).toEqual(['P_b']);
		expect(board.isEligible).toBe(false);
	});

	it('orders the podium best first, negative scores below zero', async () => {
		const { deps, add } = setup();
		add('google:a', -6, {
			wins: 2,
			losses: 8,
		});
		add('google:b', 0);
		add('google:c', 12);
		add('google:d', 3);
		const board = await getLeaderboard(deps, null);
		expect(board.podium.map((r) => [r.rank, r.score])).toEqual([
			[1, 12],
			[2, 3],
			[3, 0],
		]);
	});

	it('gives equal scores the same rank, and skips the next', async () => {
		const { deps, add } = setup();
		add('google:a', 40);
		add('google:b', 38);
		add('google:c', 38);
		add('google:d', 30);
		add('google:e', 10);
		const board = await getLeaderboard(deps, 'google:e');
		expect(board.podium.map((r) => r.rank)).toEqual([1, 2, 2]);
		expect(board.you).toMatchObject({
			rank: 5,
			score: 10,
			isYou: true,
		});
	});

	it('marks a podium player in place, with no duplicate row below', async () => {
		const { deps, add } = setup();
		add('google:a', 40);
		add('google:b', 38);
		add('google:c', 1);
		const board = await getLeaderboard(deps, 'google:b');
		expect(board.podium[1]).toMatchObject({
			rank: 2,
			isYou: true,
		});
		expect(board.you).toBeNull();
		expect(board.isEligible).toBe(true);
	});

	it('gives the caller their own ranked row when outside the podium', async () => {
		const { deps, add } = setup();
		for (let i = 0; i < 10; i++) {
			add(`google:${i}`, 100 - i);
		}
		add('google:me', -2, {
			wins: 12,
			losses: 13,
		});
		const board = await getLeaderboard(deps, 'google:me');
		expect(board.you).toEqual({
			rank: 11,
			publicName: 'P_me',
			score: -2,
			successRate: 48,
			guesses: 25,
			isYou: true,
		});
		expect(board.total).toBe(11);
	});

	it('carries no player ids anywhere in the response', async () => {
		const { deps, add } = setup();
		add('google:secret-sub', 5);
		const board = await getLeaderboard(deps, 'google:secret-sub');
		expect(JSON.stringify(board)).not.toContain('google:');
	});

	it('serves the podium from its cache for ten seconds, then re-reads it', async () => {
		const { deps, add, store, advance } = setup();
		add('google:a', 5);
		await getLeaderboard(deps, null);
		const queries = store.boardQueries;

		add('google:b', 50);
		advance(PODIUM_CACHE_MS - 1);
		const cached = await getLeaderboard(deps, null);
		expect(store.boardQueries).toBe(queries);
		expect(cached.podium.map((r) => r.score)).toEqual([5]);

		advance(1);
		const fresh = await getLeaderboard(deps, null);
		expect(fresh.podium.map((r) => r.score)).toEqual([50, 5]);
	});

	it("reads the caller's own row live, even when the podium is cached", async () => {
		const { deps, add, store } = setup();
		for (let i = 0; i < 5; i++) {
			add(`google:${i}`, 100 - i);
		}
		add('google:me', 1);
		await getLeaderboard(deps, 'google:me');
		store.players.get('google:me')!.score = 2;
		const board = await getLeaderboard(deps, 'google:me');
		expect(board.you).toMatchObject({
			score: 2,
			rank: 6,
		});
	});
});

describe('ordinal', () => {
	it('uses the right suffix, including the teens', () => {
		expect(
			[1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 138].map(ordinal),
		).toEqual([
			'1st',
			'2nd',
			'3rd',
			'4th',
			'11th',
			'12th',
			'13th',
			'21st',
			'22nd',
			'23rd',
			'101st',
			'111th',
			'138th',
		]);
	});
});

describe('placeSentence', () => {
	it('names a podium place', () => {
		expect(placeSentence(1, 40)).toBe('First place. Nice.');
		expect(placeSentence(2, 40)).toBe('Second place. Nice.');
		expect(placeSentence(3, 40)).toBe('Third place. Nice.');
	});

	it('gives position and total outside it (product spec §7)', () => {
		expect(placeSentence(138, 1204)).toBe('138th of 1,204.');
	});
});
