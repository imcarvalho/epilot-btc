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
import { getGamePrice, isStale } from '@/lib/price';

export interface StreamSink {
	send(event: StreamEvent): void;
	/** False once the browser has gone. */
	isOpen(): boolean;
}

export interface StreamOptions {
	/** How long this stream runs before ending cleanly; the browser reconnects. */
	lifetimeMs: number;
	sleep: (ms: number) => Promise<void>;
	/** How often the loop wakes: the price and the live minute move at this rate. */
	tickMs?: number;
	/** How often state is re-read with no guess in play. With one, it is every tick. */
	idleStateMs?: number;
}

export const STREAM_TICK_MS = 1_000;
export const IDLE_STATE_MS = 10_000;

/** One SSE frame. `data` is one line of JSON, so it never needs splitting. */
export function formatEvent({ type, data }: StreamEvent): string {
	return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Streams the game to one player until the browser leaves or the stream's
 * lifetime runs out.
 *
 * - `state` at once, then every tick while a guess is in play (so the result
 *   arrives within a second of settling) and every ten seconds otherwise.
 * - `price` whenever the shared price moves (once a second at most) or
 *   turns stale.
 * - `candles` whenever the shared hour is refreshed: every ten seconds.
 * - `leaderboard` at once, and again whenever a result lands or the player
 *   signs in, which are the only things that move it for them.
 * - `gone`, and the stream ends, if the player no longer exists.
 */
export async function runGameStream(
	deps: GameDeps,
	playerId: string,
	sink: StreamSink,
	{
		lifetimeMs,
		sleep,
		tickMs = STREAM_TICK_MS,
		idleStateMs = IDLE_STATE_MS,
	}: StreamOptions,
): Promise<void> {
	const started = deps.now();
	let stateAt: number | null = null;
	let inPlay = false;
	let boardKey: string | null = null;
	let priceKey: string | null = null;
	let candlesAt: number | null = null;

	while (sink.isOpen() && deps.now() - started < lifetimeMs) {
		const now = deps.now();

		if (stateAt === null || inPlay || now - stateAt >= idleStateMs) {
			const state = await getState(deps, playerId);
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
			stateAt = now;
			inPlay = state.pendingGuess !== null;

			const key = `${state.lastResult?.id ?? ''}|${state.signedIn}`;
			if (key !== boardKey) {
				boardKey = key;
				sink.send({
					type: 'leaderboard',
					data: await getLeaderboard(deps, playerId),
				});
			}
		}

		const [price, candles] = await Promise.all([
			getGamePrice(deps),
			getHourCandles(deps),
		]);
		// Sent again when the same price turns stale, so the screen can say so.
		const stale = price ? isStale(price, deps.now()) : true;
		const key = price ? `${price.price}@${price.updatedAt}@${stale}` : null;
		if (price && key !== priceKey) {
			priceKey = key;
			sink.send({
				type: 'price',
				data: {
					price: price.price,
					updatedAt: price.updatedAt,
					stale,
					serverNow: deps.now(),
				},
			});
		}
		if (candles && candles.updatedAt !== candlesAt) {
			candlesAt = candles.updatedAt;
			sink.send({
				type: 'candles',
				data: candles.candles,
			});
		}

		await sleep(tickMs);
	}
}
