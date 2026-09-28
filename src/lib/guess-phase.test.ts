import type { PendingGuess, ResolvedGuess, StateResponse } from './contracts';
import {
	awayHeadline,
	awaySentence,
	guessFailureSentence,
	PRICE_BLOCKED,
	PRICE_RETURNED,
	priceBlockAnnouncement,
	priceBlocksGuess,
	guessPhase,
	lockedSentence,
	resultSentence,
	staleSentence,
	TIME_UP,
} from './guess-phase';

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
	stats: {
		wins: 0,
		losses: 0,
		currentStreak: 0,
		previousStreak: 0,
		bestStreak: 0,
	},
	price: 100_000,
	priceUpdatedAt: T0,
	priceStale: false,
	serverNow: T0,
	pendingGuess: null,
	lastResult: null,
	history: [],
	signedIn: false,
	...over,
});

describe('guessPhase', () => {
	it('is a first visit with no history and nothing pending', () => {
		expect(guessPhase(state(), T0, null)).toEqual({
			kind: 'first-visit',
		});
	});

	it('is idle between guesses once there is a history', () => {
		const r = resolved();
		expect(
			guessPhase(
				state({
					lastResult: r,
					history: [r],
				}),
				T0,
				null,
			),
		).toEqual({
			kind: 'idle',
		});
	});

	it('counts down while the minute runs, rounding up to whole seconds', () => {
		expect(
			guessPhase(
				state({
					pendingGuess: pending,
				}),
				T0 + 12_500,
				'g1',
			),
		).toEqual({
			kind: 'locked',
			guess: pending,
			secondsLeft: 48,
		});
	});

	it('never shows more than the minute, if the local clock estimate trails the server', () => {
		expect(
			guessPhase(
				state({
					pendingGuess: pending,
				}),
				T0 - 300,
				'g1',
			),
		).toMatchObject({
			kind: 'locked',
			secondsLeft: 60,
		});
	});

	it('is time-up once the minute has passed and the guess is still pending', () => {
		expect(
			guessPhase(
				state({
					pendingGuess: pending,
				}),
				T0 + 60_000,
				'g1',
			),
		).toEqual({
			kind: 'time-up',
			guess: pending,
		});
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
		).toEqual({
			kind: 'stale',
			guess: pending,
			ageMs: 25_000,
		});
	});

	it('keeps counting down on a stale feed: the minute is not affected, only the resolution', () => {
		expect(
			guessPhase(
				state({
					pendingGuess: pending,
					priceStale: true,
				}),
				T0 + 30_000,
				'g1',
			).kind,
		).toBe('locked');
	});

	it('shows the result of the guess this session watched', () => {
		const r = resolved();
		expect(
			guessPhase(
				state({
					score: 1,
					lastResult: r,
					history: [r],
				}),
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
				state({
					lastResult: r,
					history: [r],
				}),
				T0 + 70_000,
				'some-other-guess',
			).kind,
		).toBe('idle');
	});

	it('shows a result settled while away, once, if this browser has not shown it', () => {
		const r = resolved();
		expect(
			guessPhase(
				state({
					score: 1,
					lastResult: r,
					history: [r],
				}),
				T0 + 600_000,
				null,
				'an-older-result',
			),
		).toEqual({
			kind: 'away-result',
			result: r,
			score: 1,
		});
		expect(
			guessPhase(
				state({
					lastResult: r,
					history: [r],
				}),
				T0 + 600_000,
				null,
				null,
			).kind,
		).toBe('away-result');
	});

	it('is idle once the result settled while away has been shown', () => {
		const r = resolved();
		expect(
			guessPhase(
				state({
					lastResult: r,
					history: [r],
				}),
				T0 + 600_000,
				null,
				'g1',
			).kind,
		).toBe('idle');
	});

	it('stays quiet about a result it cannot tell was seen', () => {
		const r = resolved();
		expect(
			guessPhase(
				state({
					lastResult: r,
					history: [r],
				}),
				T0 + 600_000,
				null,
				undefined,
			).kind,
		).toBe('idle');
	});

	it('shows a watched result as the result moment, not as settled while away', () => {
		const r = resolved();
		expect(
			guessPhase(
				state({
					lastResult: r,
					history: [r],
				}),
				T0 + 70_000,
				'g1',
				'an-older-result',
			).kind,
		).toBe('result');
	});

	it('puts a guess in play ahead of a result settled while away', () => {
		const r = resolved();
		expect(
			guessPhase(
				state({
					pendingGuess: {
						...pending,
						id: 'g2',
						createdAt: T0 + 600_000,
					},
					lastResult: r,
					history: [r],
				}),
				T0 + 610_000,
				'g2',
				'an-older-result',
			).kind,
		).toBe('locked');
	});
});

describe('awaySentence', () => {
	it('says a guess settled while away was correct, and what it scored', () => {
		expect(awaySentence(resolved())).toBe(
			'While you were away: your up guess was correct. +1.',
		);
		expect(awayHeadline(resolved())).toBe(
			'While you were away: your up guess was correct.',
		);
	});

	it('says a guess settled while away was wrong the same way', () => {
		expect(
			awaySentence(
				resolved({
					priceAtResolve: 99_900,
					delta: -1,
				}),
			),
		).toBe('While you were away: your up guess was wrong. -1.');
	});

	it('names the direction that was guessed, not the one the price took', () => {
		expect(
			awaySentence(
				resolved({
					direction: 'down',
					priceAtResolve: 99_900,
				}),
			),
		).toBe('While you were away: your down guess was correct. +1.');
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
			resultSentence(
				resolved({
					priceAtResolve: 99_900,
					delta: -1,
				}),
				1,
			),
		).toBe('Not this time. The price went down. Score 1.');
	});

	it('describes a correct down guess by what the price did', () => {
		expect(
			resultSentence(
				resolved({
					direction: 'down',
					priceAtResolve: 99_900,
					delta: 1,
				}),
				2,
			),
		).toBe('Correct. The price went down. Score 2.');
	});
});

describe('waiting sentences', () => {
	it('says what was locked in and how long is left', () => {
		expect(lockedSentence('$100,000.00', 47)).toBe(
			'Locked at $100,000.00. 47s to go.',
		);
	});

	it('says the minute is up but the price has not moved', () => {
		expect(TIME_UP).toBe('Time is up - waiting for the price to change.');
	});

	it('says the feed is behind and nothing settles on it', () => {
		expect(staleSentence('25s ago')).toBe(
			'Price feed delayed. Last updated 25s ago. Nothing is settled until it catches up.',
		);
	});
});

describe('guessFailureSentence', () => {
	it('says why a guess did not go through', () => {
		expect(guessFailureSentence('price-unavailable')).toBe(
			'Price feed delayed. Nothing can be locked in until it catches up.',
		);
		expect(guessFailureSentence('failed')).toBe(
			'That guess did not go through. Try again.',
		);
	});
});

describe('priceBlocksGuess', () => {
	const guess = {
		id: 'g1',
		direction: 'up' as const,
		priceAtGuess: 100_000,
		createdAt: 0,
	};

	it('blocks a new guess while the price is stale or missing', () => {
		expect(
			priceBlocksGuess({
				pendingGuess: null,
				priceStale: true,
			}),
		).toBe(true);
	});

	it('lets a guess through on a fresh price', () => {
		expect(
			priceBlocksGuess({
				pendingGuess: null,
				priceStale: false,
			}),
		).toBe(false);
	});

	it('leaves a guess in play to its own waiting state', () => {
		expect(
			priceBlocksGuess({
				pendingGuess: guess,
				priceStale: true,
			}),
		).toBe(false);
	});
});

describe('priceBlockAnnouncement', () => {
	it('announces the delay on entering it, once', () => {
		expect(priceBlockAnnouncement(null, true)).toBe(
			'Price feed delayed. Nothing can be locked in until it catches up.',
		);
		expect(priceBlockAnnouncement(false, true)).toBe(PRICE_BLOCKED);
		expect(priceBlockAnnouncement(true, true)).toBeNull();
	});

	it('announces the recovery on leaving it, once', () => {
		expect(priceBlockAnnouncement(true, false)).toBe(
			'The price is back. You can guess again.',
		);
		expect(priceBlockAnnouncement(true, false)).toBe(PRICE_RETURNED);
		expect(priceBlockAnnouncement(false, false)).toBeNull();
	});

	it('says nothing about a recovery from a delay never shown', () => {
		expect(priceBlockAnnouncement(null, false)).toBeNull();
	});

	it('is the same sentence the strip shows for a refused guess', () => {
		expect(guessFailureSentence('price-unavailable')).toBe(PRICE_BLOCKED);
	});
});
