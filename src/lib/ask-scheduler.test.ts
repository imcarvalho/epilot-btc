/**
 * Engineering spec §9: "one call at t+60; no calls during the minute; a call
 * when the ticker first differs from the locked price; fallback polling only
 * when the socket is down; nothing at all while hidden." Plus the idle
 * refresh: with no guess in play, the price every ten seconds.
 *
 * No socket and no clock needed - the whole cadence is a function over facts.
 */

import {
	ERROR_BACKOFF_MAX_MS,
	errorBackoffMs,
	FALLBACK_POLL_BACKOFF_MS,
	FALLBACK_POLL_MS,
	FALLBACK_POLLS_BEFORE_BACKOFF,
	IDLE_REFRESH_MS,
	shouldAsk,
	type CadenceInput,
} from './ask-scheduler';

const base = (over: Partial<CadenceInput> = {}): CadenceInput => ({
	countdownEnded: false,
	lockedPrice: 100_000,
	lastTickerPrice: 100_000,
	socketAlive: true,
	visible: true,
	msSinceLastAsk: 1_000,
	askedSinceCountdownEnded: false,
	consecutiveFailures: 0,
	fallbackPolls: 0,
	...over,
});

describe('shouldAsk', () => {
	it('asks once on mount', () => {
		expect(
			shouldAsk(
				base({
					msSinceLastAsk: null,
				}),
			),
		).toEqual({
			ask: true,
			reason: 'mount',
		});
	});

	it('asks nothing at all while the tab is hidden', () => {
		expect(
			shouldAsk(
				base({
					visible: false,
					countdownEnded: true,
				}),
			),
		).toEqual({
			ask: false,
		});
		expect(
			shouldAsk(
				base({
					visible: false,
					msSinceLastAsk: null,
				}),
			),
		).toEqual({
			ask: false,
		});
	});

	it('resyncs immediately when the tab becomes visible again', () => {
		expect(
			shouldAsk(
				base({
					visible: true,
					msSinceLastAsk: null,
				}),
			),
		).toEqual({
			ask: true,
			reason: 'mount',
		});
	});

	it('does not ask during the minute', () => {
		expect(
			shouldAsk(
				base({
					countdownEnded: false,
				}),
			),
		).toEqual({
			ask: false,
		});
	});

	it('asks once when the countdown ends', () => {
		expect(
			shouldAsk(
				base({
					countdownEnded: true,
				}),
			),
		).toEqual({
			ask: true,
			reason: 'countdown-ended',
		});
	});

	it('goes quiet after that ask while the price is unchanged', () => {
		expect(
			shouldAsk(
				base({
					countdownEnded: true,
					askedSinceCountdownEnded: true,
					lastTickerPrice: 100_000,
				}),
			),
		).toEqual({
			ask: false,
		});
	});

	it('asks when the ticker first shows a price different from the locked one', () => {
		expect(
			shouldAsk(
				base({
					countdownEnded: true,
					askedSinceCountdownEnded: true,
					lastTickerPrice: 100_012,
					msSinceLastAsk: 2_000,
				}),
			),
		).toEqual({
			ask: true,
			reason: 'price-moved',
		});
	});

	it('spaces repeat asks while the ticker still differs but the server has not settled', () => {
		const moved = {
			countdownEnded: true,
			askedSinceCountdownEnded: true,
			lastTickerPrice: 100_012,
		};
		expect(
			shouldAsk(
				base({
					...moved,
					msSinceLastAsk: 1_000,
				}),
			),
		).toEqual({
			ask: false,
		});
		expect(
			shouldAsk(
				base({
					...moved,
					msSinceLastAsk: 2_000,
				}),
			),
		).toEqual({
			ask: true,
			reason: 'price-moved',
		});
	});

	it('falls back to polling only when the socket is down', () => {
		const stuck = {
			countdownEnded: true,
			askedSinceCountdownEnded: true,
			socketAlive: false,
			lastTickerPrice: null,
		};
		expect(
			shouldAsk(
				base({
					...stuck,
					msSinceLastAsk: 4_000,
				}),
			),
		).toEqual({
			ask: false,
		});
		expect(
			shouldAsk(
				base({
					...stuck,
					msSinceLastAsk: 5_000,
				}),
			),
		).toEqual({
			ask: true,
			reason: 'fallback-poll',
		});
	});

	it('refreshes the price every ten seconds when no guess is in play', () => {
		const idle = {
			lockedPrice: null,
			countdownEnded: true,
		};
		expect(
			shouldAsk(
				base({
					...idle,
					msSinceLastAsk: IDLE_REFRESH_MS - 1,
				}),
			),
		).toEqual({
			ask: false,
		});
		expect(
			shouldAsk(
				base({
					...idle,
					msSinceLastAsk: IDLE_REFRESH_MS,
				}),
			),
		).toEqual({
			ask: true,
			reason: 'idle-refresh',
		});
	});

	it('does not refresh an idle tab that is hidden', () => {
		expect(
			shouldAsk(
				base({
					lockedPrice: null,
					visible: false,
					msSinceLastAsk: 60_000,
				}),
			),
		).toEqual({
			ask: false,
		});
	});

	it('backs the fallback poll off from 5 s to 10 s after half a minute of it', () => {
		const stuck = {
			countdownEnded: true,
			askedSinceCountdownEnded: true,
			socketAlive: false,
			lastTickerPrice: null,
		};
		expect(
			shouldAsk(
				base({
					...stuck,
					fallbackPolls: FALLBACK_POLLS_BEFORE_BACKOFF - 1,
					msSinceLastAsk: FALLBACK_POLL_MS,
				}),
			),
		).toEqual({
			ask: true,
			reason: 'fallback-poll',
		});
		expect(
			shouldAsk(
				base({
					...stuck,
					fallbackPolls: FALLBACK_POLLS_BEFORE_BACKOFF,
					msSinceLastAsk: FALLBACK_POLL_MS,
				}),
			),
		).toEqual({
			ask: false,
		});
		expect(
			shouldAsk(
				base({
					...stuck,
					fallbackPolls: FALLBACK_POLLS_BEFORE_BACKOFF,
					msSinceLastAsk: FALLBACK_POLL_BACKOFF_MS,
				}),
			),
		).toEqual({
			ask: true,
			reason: 'fallback-poll',
		});
	});

	it('doubles the gap after each failed ask, up to a minute', () => {
		expect(
			[0, 1, 2, 3, 4, 5, 20].map((failures) => errorBackoffMs(failures)),
		).toEqual([0, 5_000, 10_000, 20_000, 40_000, 60_000, ERROR_BACKOFF_MAX_MS]);
	});

	it('does not re-ask a failing server on every tick once the minute is up', () => {
		const failing = {
			countdownEnded: true,
			askedSinceCountdownEnded: false,
			consecutiveFailures: 3,
		};
		expect(
			shouldAsk(
				base({
					...failing,
					msSinceLastAsk: 1_000,
				}),
			),
		).toEqual({
			ask: false,
		});
		expect(
			shouldAsk(
				base({
					...failing,
					msSinceLastAsk: 19_999,
				}),
			),
		).toEqual({
			ask: false,
		});
		expect(
			shouldAsk(
				base({
					...failing,
					msSinceLastAsk: 20_000,
				}),
			),
		).toEqual({
			ask: true,
			reason: 'countdown-ended',
		});
	});

	it('spaces idle refreshes and fallback polls by the error back-off too', () => {
		expect(
			shouldAsk(
				base({
					lockedPrice: null,
					consecutiveFailures: 4,
					msSinceLastAsk: IDLE_REFRESH_MS,
				}),
			),
		).toEqual({
			ask: false,
		});
		expect(
			shouldAsk(
				base({
					countdownEnded: true,
					askedSinceCountdownEnded: true,
					socketAlive: false,
					lastTickerPrice: null,
					consecutiveFailures: 2,
					msSinceLastAsk: FALLBACK_POLL_MS,
				}),
			),
		).toEqual({
			ask: false,
		});
	});

	it('asks at most a handful of times in a minute while the server keeps failing', () => {
		// One tick a second for a minute after the countdown ends, every ask
		// failing, with msSinceLastAsk counted from the last attempt.
		let lastAskAt: number | null = 0;
		let failures = 1;
		const asks: number[] = [];
		for (let t = 1_000; t <= 60_000; t += 1_000) {
			const d = shouldAsk(
				base({
					countdownEnded: true,
					consecutiveFailures: failures,
					msSinceLastAsk: lastAskAt === null ? null : t - lastAskAt,
				}),
			);
			if (d.ask) {
				asks.push(t);
				lastAskAt = t;
				failures += 1;
			}
		}
		expect(asks).toEqual([5_000, 15_000, 35_000]);
	});

	it('costs two requests for an ordinary guess', () => {
		const calls: string[] = [];
		const record = (i: Partial<CadenceInput>) => {
			const d = shouldAsk(base(i));
			if (d.ask) {
				calls.push(d.reason);
			}
		};

		record({
			msSinceLastAsk: null,
		}); // opening the app
		record({
			countdownEnded: false,
		}); // mid-minute
		record({
			countdownEnded: true,
		}); // the minute is up

		expect(calls).toEqual(['mount', 'countdown-ended']);
	});
});
