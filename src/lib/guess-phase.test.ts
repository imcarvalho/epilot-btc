import type { PendingGuess, ResolvedGuess, StateResponse } from './contracts';
import { guessPhase, resultSentence } from './guess-phase';

const T0 = 1_700_000_000_000;

const pending: PendingGuess = {
	id: 'g1',
	direction: 'up',
	priceAtGuess: 100_000,
	createdAt: T0,
};

const resolved = (over: Partial<ResolvedGuess> = {}): ResolvedGuess => ({
	...pending,
	priceAtResolve: 100_050,
	resolvedAt: T0 + 64_000,
	delta: 1,
	...over,
});

const state = (over: Partial<StateResponse> = {}): StateResponse => ({
	publicName: 'BriskOtter',
	score: 0,
	stats: { wins: 0, losses: 0, currentStreak: 0, bestStreak: 0 },
	price: 100_000,
	priceUpdatedAt: T0,
	priceStale: false,
	serverNow: T0,
	pendingGuess: null,
	lastResult: null,
	history: [],
	...over,
});

describe('guessPhase', () => {
	it('is a first visit with no history and nothing pending', () => {
		expect(guessPhase(state(), T0, null)).toEqual({ kind: 'first-visit' });
	});

	it('is idle between guesses once there is a history', () => {
		const r = resolved();
		expect(
			guessPhase(state({ lastResult: r, history: [r] }), T0, null),
		).toEqual({ kind: 'idle' });
	});

	it('counts down while the minute runs, rounding up to whole seconds', () => {
		expect(
			guessPhase(state({ pendingGuess: pending }), T0 + 12_500, 'g1'),
		).toEqual({
			kind: 'locked',
			guess: pending,
			secondsLeft: 48,
		});
	});

	it('is time-up once the minute has passed and the guess is still pending', () => {
		expect(
			guessPhase(state({ pendingGuess: pending }), T0 + 60_000, 'g1'),
		).toEqual({ kind: 'time-up', guess: pending });
	});

	it('says the feed is delayed, rather than time-up, when the price is stale', () => {
		expect(
			guessPhase(
				state({
					pendingGuess: pending,
					priceStale: true,
					priceUpdatedAt: T0 + 40_000,
				}),
				T0 + 65_000,
				'g1',
			),
		).toEqual({ kind: 'stale', guess: pending, ageMs: 25_000 });
	});

	it('keeps counting down on a stale feed: the minute is not affected, only the resolution', () => {
		expect(
			guessPhase(
				state({ pendingGuess: pending, priceStale: true }),
				T0 + 30_000,
				'g1',
			).kind,
		).toBe('locked');
	});

	it('shows the result of the guess this session watched', () => {
		const r = resolved();
		expect(
			guessPhase(
				state({ score: 1, lastResult: r, history: [r] }),
				T0 + 70_000,
				'g1',
			),
		).toEqual({
			kind: 'result',
			result: r,
			score: 1,
		});
	});

	it('does not replay an old result the session never watched', () => {
		const r = resolved();
		expect(
			guessPhase(
				state({ lastResult: r, history: [r] }),
				T0 + 70_000,
				'some-other-guess',
			).kind,
		).toBe('idle');
	});
});

describe('resultSentence', () => {
	it('spells out a win with the actual movement and the new score', () => {
		expect(resultSentence(resolved(), 3)).toBe(
			'Correct. The price went up. Score 3.',
		);
	});

	it('spells out a loss the same way', () => {
		expect(
			resultSentence(resolved({ priceAtResolve: 99_900, delta: -1 }), 1),
		).toBe('Not this time. The price went down. Score 1.');
	});

	it('describes a correct down guess by what the price did', () => {
		expect(
			resultSentence(
				resolved({ direction: 'down', priceAtResolve: 99_900, delta: 1 }),
				2,
			),
		).toBe('Correct. The price went down. Score 2.');
	});
});
