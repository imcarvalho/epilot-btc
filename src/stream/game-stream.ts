/**
 * The game stream: everything the screen shows, pushed to one browser as
 * Server-Sent Events (engineering spec §3.1).
 *
 * The browser sends nothing on it. Every price, candle and outcome comes from
 * the server's own shared caches and the same `getState` the routes use - so
 * reading state here still settles a guess that is due, against the price at
 * its deadline (§3), exactly as before.
 *
 * Host-independent on purpose: the Lambda (production) and a Next route
 * (local development and the e2e tests) both run this with their own sink
 * and clock.
 */

import type { StreamEvent } from '@/lib/contracts';
import { getState, type GameDeps } from '@/lib/game';
import { getHourCandles } from '@/lib/hour-candles';
import { getLeaderboard, PODIUM_CACHE_MS } from '@/lib/leaderboard';

export interface StreamSink {
	send(event: StreamEvent): void;
	/** False once the browser has gone. */
	isOpen(): boolean;
}

export interface StreamOptions {
	/** How long this stream runs before ending cleanly; the browser reconnects. */
	lifetimeMs: number;
	sleep: (ms: number) => Promise<void>;
	/** How often the loop wakes: state, and with it the price, moves at this rate. */
	tickMs?: number;
}

const STREAM_TICK_MS = 1_000;

/**
 * A tick that throws (a DynamoDB throttle or timeout, say) sends nothing and
 * the loop carries on; this many in a row means the store is really down, and
 * the stream ends so the browser reconnects and shows its own state.
 */
export const MAX_CONSECUTIVE_FAILED_TICKS = 5;

const RETRY_HINT_MIN_MS = 1_000;
const RETRY_HINT_SPREAD_MS = 2_000;

/**
 * The `retry:` line a stream opens with: how long a native `EventSource`
 * waits before reconnecting. Jittered, so streams that all drop together do
 * not all come back together.
 */
export function retryFrame(random: () => number = Math.random): string {
	const ms = RETRY_HINT_MIN_MS + Math.floor(random() * RETRY_HINT_SPREAD_MS);
	return `retry: ${ms}\n\n`;
}

/** One SSE frame. `data` is one line of JSON, so it never needs splitting. */
export function formatEvent({ type, data }: StreamEvent): string {
	return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Streams the game to one player until the browser leaves or the stream's
 * lifetime runs out.
 *
 * - `state` every tick: it carries the price and its age, so the screen's
 *   price and the live minute move once a second, and a guess just placed
 *   or just settled shows within a second.
 * - `candles` whenever the shared hour is refreshed, every ten seconds - or
 *   once as null, if there is no hour at all (Coinbase down, nothing cached).
 * - `leaderboard` at once, and again whenever a result lands or the player
 *   signs in. Other players move it too, so it is also read again each time
 *   the shared podium can have changed (`PODIUM_CACHE_MS`), and sent if it
 *   did.
 * - `gone`, and the stream ends, if the player no longer exists.
 *
 * A failed tick is logged (`stream-tick-failed`) and skipped; the stream ends
 * only after `MAX_CONSECUTIVE_FAILED_TICKS` in a row.
 */
export async function runGameStream(
	deps: GameDeps,
	playerId: string,
	sink: StreamSink,
	{ lifetimeMs, sleep, tickMs = STREAM_TICK_MS }: StreamOptions,
): Promise<void> {
	const started = deps.now();
	let boardKey: string | null = null;
	let boardReadAt = -Infinity;
	let boardSent: string | null = null;
	// When the hour sent last was fetched; 0 once "no hour" has been said.
	let candlesAt: number | null = null;

	let failedTicks = 0;

	while (sink.isOpen() && deps.now() - started < lifetimeMs) {
		try {
			const [state, candles] = await Promise.all([
				getState(deps, playerId),
				getHourCandles(deps),
			]);
			if (!state) {
				sink.send({
					type: 'gone',
					data: null,
				});
				return;
			}
			sink.send({
				type: 'state',
				data: state,
			});

			const key = `${state.lastResult?.id ?? ''}|${state.signedIn}`;
			if (key !== boardKey || deps.now() - boardReadAt >= PODIUM_CACHE_MS) {
				const board = await getLeaderboard(deps, playerId);
				const sent = JSON.stringify(board);
				// Only after it is read, so a failed read is tried again next tick.
				const moved = key !== boardKey || sent !== boardSent;
				boardKey = key;
				boardReadAt = deps.now();
				if (moved) {
					boardSent = sent;
					sink.send({
						type: 'leaderboard',
						data: board,
					});
				}
			}

			if (candles && candles.updatedAt !== candlesAt) {
				candlesAt = candles.updatedAt;
				sink.send({
					type: 'candles',
					data: candles.candles,
				});
			} else if (!candles && candlesAt === null) {
				candlesAt = 0;
				sink.send({
					type: 'candles',
					data: null,
				});
			}
			failedTicks = 0;
		} catch (error) {
			failedTicks += 1;
			console.error(
				JSON.stringify({
					event: 'stream-tick-failed',
					consecutive: failedTicks,
					error: String(error),
				}),
			);
			if (failedTicks >= MAX_CONSECUTIVE_FAILED_TICKS) {
				return;
			}
		}

		await sleep(tickMs);
	}
}
