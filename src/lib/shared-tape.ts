/**
 * One tape read per process, shared by every stream and the sweep.
 *
 * Engineering spec §3 ("A stale price resolves nothing"). Reading the trade
 * history is the expensive Coinbase call (up to five pages and a candle
 * call), and every waiting player's stream asks for it each second. So, like
 * the game price (price.ts), a read is shared while it is in flight, served
 * to the callers that follow it for a moment, and not repeated for a moment
 * after it fails - an outage costs one attempt a second, not one per player.
 *
 * Readers differ in how far back they need the tape (their own deadline), so
 * a shared read is only used by a caller it covers: one that started at or
 * after the caller's deadline (a tape read before the deadline cannot show
 * the price standing at it) and reaches back at least as far as the caller's
 * `from`. Anyone else gets a read of their own.
 *
 * Pure of infrastructure: the fetch and the clock are injected.
 */

import type { PricePoint } from './settlement';

/** How long one read serves the callers that follow it. */
export const TAPE_CACHE_MS = 1_000;

/** How long a failed read is remembered: callers inside it are refused without calling Coinbase. */
export const TAPE_FAILURE_MS = 2_000;

/** The tape was not read because a read has just failed. Not a new failure, so not logged as one. */
export class TapeBackoffError extends Error {
	constructor() {
		super('tape read backing off after a failure');
	}
}

export interface SharedTapeDeps {
	fetchTape: (from: number) => Promise<PricePoint[]>;
	now: () => number;
}

interface Read {
	/** How far back it reaches. */
	from: number;
	/** When it began, on the server's clock. */
	startedAt: number;
	tape: Promise<PricePoint[]>;
}

/** Returns the shared reader: `(from) => tape`, the shape `GameDeps.fetchTape` takes. */
export function createSharedTape({
	fetchTape,
	now,
}: SharedTapeDeps): (from: number) => Promise<PricePoint[]> {
	let inFlight: Read | null = null;
	let cached: {
		from: number;
		startedAt: number;
		tape: PricePoint[];
		at: number;
	} | null = null;
	let failedAt: number | null = null;

	return async function read(from) {
		for (;;) {
			const t = now();
			if (
				cached &&
				t - cached.at < TAPE_CACHE_MS &&
				cached.from <= from &&
				cached.startedAt >= from
			) {
				return cached.tape;
			}
			if (inFlight && inFlight.from <= from && inFlight.startedAt >= from) {
				return inFlight.tape;
			}
			if (failedAt !== null && t - failedAt < TAPE_FAILURE_MS) {
				throw new TapeBackoffError();
			}
			if (!inFlight) {
				break;
			}
			// A read is running that this caller cannot use (it reaches back
			// less far). Wait for it rather than run two, then look again.
			await inFlight.tape.catch(() => {});
		}

		const startedAt = now();
		const started: Read = {
			from,
			startedAt,
			tape: fetchTape(from).then(
				(tape) => {
					failedAt = null;
					cached = {
						from,
						startedAt,
						tape,
						at: now(),
					};
					return tape;
				},
				(error: unknown) => {
					failedAt = now();
					cached = null;
					throw error;
				},
			),
		};
		inFlight = started;
		try {
			return await started.tape;
		} finally {
			if (inFlight === started) {
				inFlight = null;
			}
		}
	};
}
