import { bestStreakLabel, formatRate, streakLabel, successRate } from './stats';

describe('successRate', () => {
	it('is correct guesses over resolved guesses, as a whole percent', () => {
		expect(
			successRate({
				wins: 7,
				losses: 6,
			}),
		).toBe(54);
		expect(
			successRate({
				wins: 2,
				losses: 8,
			}),
		).toBe(20);
		expect(
			successRate({
				wins: 1,
				losses: 0,
			}),
		).toBe(100);
		expect(
			successRate({
				wins: 0,
				losses: 3,
			}),
		).toBe(0);
	});

	it('does not exist before anything has resolved', () => {
		expect(
			successRate({
				wins: 0,
				losses: 0,
			}),
		).toBeNull();
	});

	it('rounds half up, so 1 of 8 is 13% rather than 12%', () => {
		expect(
			successRate({
				wins: 1,
				losses: 7,
			}),
		).toBe(13);
	});
});

describe('formatRate', () => {
	it('shows a percent, or a dash before the first result', () => {
		expect(formatRate(54)).toBe('54%');
		expect(formatRate(null)).toBe('-');
	});
});

describe('streakLabel', () => {
	const stats = (currentStreak: number, previousStreak = 0) => ({
		wins: 5,
		losses: 5,
		currentStreak,
		previousStreak,
	});

	it('says nothing before anything has resolved', () => {
		expect(
			streakLabel({
				wins: 0,
				losses: 0,
				currentStreak: 0,
				previousStreak: 0,
			}),
		).toBeNull();
	});

	it('counts a run of wins', () => {
		expect(streakLabel(stats(2))).toBe('2 wins in a row');
		expect(streakLabel(stats(7))).toBe('7 wins in a row');
	});

	it('does not call a single win a streak', () => {
		expect(streakLabel(stats(1))).toBe('last guess won');
	});

	it('says what a loss ended, rather than a bare zero (product spec 6.4)', () => {
		expect(streakLabel(stats(-1, 2))).toBe('streak ended at 2');
		expect(streakLabel(stats(-1, 5))).toBe('streak ended at 5');
	});

	it('does not claim a streak ended when there was none to end', () => {
		expect(streakLabel(stats(-1, 1))).toBe('last guess lost');
		expect(streakLabel(stats(-1, -3))).toBe('last guess lost');
	});

	it('counts a run of losses', () => {
		expect(streakLabel(stats(-2))).toBe('2 losses in a row');
	});
});

describe('bestStreakLabel', () => {
	it('names the longest winning run, if there has been one', () => {
		expect(bestStreakLabel(5)).toBe('Best: 5 wins in a row');
		expect(bestStreakLabel(1)).toBe('Best: 1 win');
		expect(bestStreakLabel(0)).toBeNull();
	});
});
