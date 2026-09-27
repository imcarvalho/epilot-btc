import type { PendingGuess } from './contracts';
import {
	applyResolution,
	HISTORY_LIMIT,
	nextStreak,
	type Scoreboard,
} from './scoring';

const fresh: Scoreboard = {
	score: 0,
	wins: 0,
	losses: 0,
	currentStreak: 0,
	bestStreak: 0,
	history: [],
};

const guess = (id = 'g1'): PendingGuess => ({
	id,
	direction: 'up',
	priceAtGuess: 100_000,
	createdAt: 1_000,
});

describe('nextStreak', () => {
	it('starts a winning streak from nothing', () => {
		expect(nextStreak(0, 1)).toBe(1);
	});

	it('extends a winning streak', () => {
		expect(nextStreak(3, 1)).toBe(4);
	});

	it('flips sign when a winning streak breaks', () => {
		expect(nextStreak(3, -1)).toBe(-1);
	});

	it('extends a losing streak', () => {
		expect(nextStreak(-2, -1)).toBe(-3);
	});

	it('flips sign when a losing streak breaks', () => {
		expect(nextStreak(-2, 1)).toBe(1);
	});
});

describe('applyResolution', () => {
	it('moves score, counters and streaks together on a win', () => {
		const after = applyResolution(fresh, guess(), 100_010, 61_000, 1);
		expect(after).toMatchObject({
			score: 1,
			wins: 1,
			losses: 0,
			currentStreak: 1,
			bestStreak: 1,
		});
	});

	it('lets the score go negative on a loss', () => {
		const after = applyResolution(fresh, guess(), 99_990, 61_000, -1);
		expect(after).toMatchObject({
			score: -1,
			wins: 0,
			losses: 1,
			currentStreak: -1,
			bestStreak: 0,
		});
	});

	it('keeps the best streak when the current one breaks', () => {
		const onARoll = {
			...fresh,
			score: 3,
			wins: 3,
			currentStreak: 3,
			bestStreak: 3,
		};
		const after = applyResolution(onARoll, guess(), 99_990, 61_000, -1);
		expect(after.currentStreak).toBe(-1);
		expect(after.bestStreak).toBe(3);
	});

	it('prepends the resolved guess with both prices', () => {
		const after = applyResolution(fresh, guess(), 100_010, 61_000, 1);
		expect(after.history[0]).toEqual({
			id: 'g1',
			direction: 'up',
			priceAtGuess: 100_000,
			createdAt: 1_000,
			priceAtResolve: 100_010,
			resolvedAt: 61_000,
			delta: 1,
		});
	});

	it('trims history but not the counters', () => {
		let board = fresh;
		for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
			board = applyResolution(board, guess(`g${i}`), 100_010, 61_000, 1);
		}
		expect(board.history).toHaveLength(HISTORY_LIMIT);
		expect(board.history[0].id).toBe(`g${HISTORY_LIMIT + 4}`);
		expect(board.wins).toBe(HISTORY_LIMIT + 5);
		expect(board.score).toBe(HISTORY_LIMIT + 5);
	});
});
