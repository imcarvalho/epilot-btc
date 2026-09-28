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
import { getLeaderboard } from '@/lib/leaderboard';

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

export const STREAM_TICK_MS = 1_000;

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
 *   signs in, which are the only things that move it for them.
 * - `gone`, and the stream ends, if the player no longer exists.
 */
export async function runGameStream(
	deps: GameDeps,
	playerId: string,
	sink: StreamSink,
	{ lifetimeMs, sleep, tickMs = STREAM_TICK_MS }: StreamOptions,
): Promise<void> {
	const started = deps.now();
	let boardKey: string | null = null;
	// When the hour sent last was fetched; 0 once "no hour" has been said.
	let candlesAt: number | null = null;

	while (sink.isOpen() && deps.now() - started < lifetimeMs) {
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
		if (key !== boardKey) {
			boardKey = key;
			sink.send({
				type: 'leaderboard',
				data: await getLeaderboard(deps, playerId),
			});
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

		await sleep(tickMs);
	}
}
